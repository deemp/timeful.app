package routes

import (
	"context"
	"crypto/rand"
	"crypto/sha256"
	"crypto/subtle"
	"encoding/base64"
	"errors"
	"log"
	"net/http"
	"strings"
	"time"

	"github.com/gin-contrib/sessions"
	"github.com/gin-gonic/gin"
	"github.com/jackc/pgx/v5"
	pgstore "timeful/server/postgres"
)

func transferSecret() (string, []byte, error) {
	var raw [32]byte
	if _, err := rand.Read(raw[:]); err != nil {
		return "", nil, err
	}
	value := base64.RawURLEncoding.EncodeToString(raw[:])
	hash := sha256.Sum256([]byte(value))
	return value, hash[:], nil
}
func transferCookie(c *gin.Context, name, value string) {
	// Attributes match the base EVCC and owner cookies; SameSite=Lax never
	// sends these cookies on cross-site state-changing requests.
	http.SetCookie(c.Writer, &http.Cookie{Name: name, Value: value, Path: "/api", MaxAge: 34560000, HttpOnly: true, SameSite: http.SameSiteLaxMode, Secure: c.Request.TLS != nil || c.GetHeader("X-Forwarded-Proto") == "https"})
}
func transferProof(c *gin.Context, name string, hash []byte) bool {
	value, err := c.Cookie(name)
	digest := sha256.Sum256([]byte(value))
	return err == nil && value != "" && subtle.ConstantTimeCompare(digest[:], hash) == 1
}
func transferDenied(c *gin.Context, err error) {
	if errors.Is(err, pgx.ErrNoRows) {
		c.JSON(403, gin.H{"error": "Transfer unavailable, expired, or unauthorized"})
		return
	}
	log.Printf("access transfer failed: %v", err)
	postgresMutationError(c, err)
}

// @Summary Create a five-minute source-confirmed access transfer
// @Description PostgreSQL only. Requires a signed-in session or base EVCC; anonymous owners additionally prove their owner token. The link grants no authority.
// @Tags events
// @Produce json
// @Param eventId path string true "Event ID"
// @Success 201 {object} object{id=string,expiresAt=string}
// @Failure 403
// @Router /events/{eventId}/transfers [post]
func postgresCreateTransfer(c *gin.Context) {
	repo := postgresRepository(c)
	if repo == nil {
		return
	}
	event := postgresEvent(c, repo)
	if event == nil {
		return
	}
	secret, hash, err := transferSecret()
	if err != nil {
		transferDenied(c, err)
		return
	}
	transfer := &pgstore.AccessTransfer{EventID: event.ID, SourceHash: hash}
	err = repo.WithTransaction(c.Request.Context(), func(ctx context.Context, tx *pgstore.Repository) error {
		locked, err := tx.LockEvent(ctx, event.ID)
		if err != nil {
			return err
		}
		if locked.IsDeleted {
			return pgx.ErrNoRows
		}
		// Transfer creation is the automatic sweep point for expired rows.
		if err := tx.PruneExpiredAccessTransfers(ctx); err != nil {
			return err
		}
		external, _ := sessions.Default(c).Get("userId").(string)
		if external != "" {
			transfer.ExternalUserID = &external
		} else {
			cookie, err := c.Cookie(postgresCredentialCookieName(event.ShortID))
			if err != nil {
				return pgx.ErrNoRows
			}
			visitor, err := tx.GetEventVisitorIdentity(ctx, event.ID, strings.Split(cookie, ".")[0])
			if err != nil {
				return err
			}
			credential, err := provenPostgresCredential(c, tx, visitor, event.ShortID)
			if err != nil {
				return err
			}
			if credential == nil || credential.Kind != pgstore.CredentialKindBase {
				return pgx.ErrNoRows
			}
			transfer.SourceCredentialID = &credential.ID
			if locked.OwnerEventVisitorIdentityID != nil && *locked.OwnerEventVisitorIdentityID == visitor.ID {
				token, err := c.Cookie(postgresOwnerCookieName(event.ShortID))
				hash := sha256.Sum256([]byte(token))
				if err != nil || subtle.ConstantTimeCompare(hash[:], locked.OwnerEditTokenHash) != 1 {
					return pgx.ErrNoRows
				}
				transfer.GrantsOwner = true
			}
		}
		return tx.CreateAccessTransfer(ctx, transfer)
	})
	if err != nil {
		transferDenied(c, err)
		return
	}
	transferCookie(c, "timeful_transfer_source_"+transfer.ID, secret)
	c.JSON(201, gin.H{"id": transfer.ID, "expiresAt": transfer.ExpiresAt})
}

// @Summary Advance a source-confirmed transfer
// @Description Actions: open (new target request, or the approved request back to its target), status (source lists codes), approve (source supplies requestId and exact code), redeem (target proof; replacing a different signed-in account requires confirmAccountSwitch), cancel, revoke. Approval is single-use and only the selected target can redeem before expiry; cancel works while the transfer is pending or approved but unredeemed. Revocation has no time limit.
// @Tags events
// @Accept json
// @Produce json
// @Param eventId path string true "Event ID"
// @Param transferId path string true "Transfer ID"
// @Param action path string true "Transfer action"
// @Param payload body object{requestId=string,code=string,confirmAccountSwitch=bool} true "Approval selection, explicit account-switch consent, or empty object"
// @Success 200 {object} object{state=string,revocable=bool,requestId=string,code=string,requests=[]object{id=string,code=string}}
// @Failure 403
// @Failure 409 {object} object{accountSwitchRequired=bool} "Explicit consent required to replace a different sign-in"
// @Router /events/{eventId}/transfers/{transferId}/{action} [post]
func postgresTransferAction(c *gin.Context) {
	repo := postgresRepository(c)
	if repo == nil {
		return
	}
	event := postgresEvent(c, repo)
	if event == nil {
		return
	}
	var input struct {
		RequestID            string `json:"requestId"`
		Code                 string `json:"code"`
		ConfirmAccountSwitch bool   `json:"confirmAccountSwitch"`
	}
	if err := c.BindJSON(&input); err != nil {
		return
	}
	action := c.Param("action")
	result := gin.H{}
	var targetSecret, grantValue, grantPublicID string
	var externalID *string
	var accountSwitchRequired bool
	previousCookies := append([]string(nil), c.Writer.Header().Values("Set-Cookie")...)
	err := repo.WithTransaction(c.Request.Context(), func(ctx context.Context, tx *pgstore.Repository) error {
		locked, err := tx.LockEvent(ctx, event.ID)
		if err != nil {
			return err
		}
		if locked.IsDeleted {
			return pgx.ErrNoRows
		}
		transfer, err := tx.LockAccessTransfer(ctx, event.ID, c.Param("transferId"))
		if err != nil {
			return err
		}
		source := transferProof(c, "timeful_transfer_source_"+transfer.ID, transfer.SourceHash)
		// Recheck the initiating authority at approval, not merely the browser nonce.
		var sourceCredential *pgstore.EventVisitorCredential
		if transfer.SourceCredentialID != nil {
			sourceCredential, err = tx.GetTransferSourceCredential(ctx, *transfer.SourceCredentialID)
			if err != nil {
				return err
			}
		}
		if action == "revoke" {
			if !source || transfer.GrantID == nil {
				return pgx.ErrNoRows
			}
			if err := tx.RevokeGrantedCredential(ctx, *transfer.GrantID); err != nil {
				return err
			}
			transfer.State = "cancelled"
			result["state"] = "revoked"
			return tx.SaveAccessTransfer(ctx, transfer)
		}
		if action == "status" && source {
			result["state"] = transfer.State
			result["revocable"] = transfer.GrantID != nil && transfer.State == "redeemed"
			if time.Now().After(transfer.ExpiresAt) && (transfer.State == "pending" || transfer.State == "approved") {
				result["state"] = "expired"
			}
			requests, err := tx.ListTransferRequests(ctx, transfer.ID)
			result["requests"] = requests
			return err
		}
		if time.Now().After(transfer.ExpiresAt) || transfer.State == "cancelled" || transfer.State == "redeemed" || (sourceCredential != nil && sourceCredential.RevokedAt != nil) {
			return pgx.ErrNoRows
		}
		requests, err := tx.ListTransferRequests(ctx, transfer.ID)
		if err != nil {
			return err
		}
		switch action {
		case "open":
			if source {
				return pgx.ErrNoRows
			}
			// Reload safety: an approved-but-unredeemed transfer re-serves the
			// approved request and code to the browser holding its target proof,
			// still without granting authority before redemption.
			if transfer.State == "approved" && transfer.ApprovedRequestID != nil {
				for _, request := range requests {
					if request.ID == *transfer.ApprovedRequestID && transferProof(c, "timeful_transfer_target_"+transfer.ID, request.TargetHash) {
						result["requestId"] = request.ID
						result["code"] = request.Code
						result["state"] = transfer.State
						return nil
					}
				}
			}
			if transfer.State != "pending" {
				return pgx.ErrNoRows
			}
			for _, request := range requests {
				if transferProof(c, "timeful_transfer_target_"+transfer.ID, request.TargetHash) {
					result["requestId"] = request.ID
					result["code"] = request.Code
					return nil
				}
			}
			if len(requests) >= 20 {
				return pgx.ErrNoRows
			}
			secret, hash, err := transferSecret()
			if err != nil {
				return err
			}
			targetSecret = secret
			code, err := pgstore.GenerateShortID()
			if err != nil {
				return err
			}
			request := &pgstore.TransferRequest{Code: code, TargetHash: hash}
			if err := tx.CreateTransferRequest(ctx, transfer.ID, request); err != nil {
				return err
			}
			result["requestId"] = request.ID
			result["code"] = request.Code
		case "approve":
			if !source || transfer.State != "pending" {
				return pgx.ErrNoRows
			}
			if transfer.ExternalUserID != nil {
				current, _ := sessions.Default(c).Get("userId").(string)
				if current != *transfer.ExternalUserID {
					return pgx.ErrNoRows
				}
			} else {
				visitor, err := tx.GetTransferSourceVisitor(ctx, sourceCredential.EventVisitorIdentityID)
				if err != nil {
					return err
				}
				proof, err := provenPostgresCredential(c, tx, visitor, event.ShortID)
				if err != nil {
					return err
				}
				if proof == nil || proof.ID != sourceCredential.ID {
					return pgx.ErrNoRows
				}
				if transfer.GrantsOwner {
					token, err := c.Cookie(postgresOwnerCookieName(event.ShortID))
					hash := sha256.Sum256([]byte(token))
					if err != nil || subtle.ConstantTimeCompare(hash[:], locked.OwnerEditTokenHash) != 1 {
						return pgx.ErrNoRows
					}
				}
			}
			matched := false
			for _, request := range requests {
				if request.ID == input.RequestID && request.Code == input.Code {
					matched = true
				}
			}
			if !matched {
				return pgx.ErrNoRows
			}
			transfer.ApprovedRequestID = &input.RequestID
			transfer.State = "approved"
		case "redeem":
			if transfer.State != "approved" || transfer.ApprovedRequestID == nil {
				return pgx.ErrNoRows
			}
			matched := false
			for _, request := range requests {
				if request.ID == *transfer.ApprovedRequestID && transferProof(c, "timeful_transfer_target_"+transfer.ID, request.TargetHash) {
					matched = true
				}
			}
			if !matched {
				return pgx.ErrNoRows
			}
			if transfer.ExternalUserID != nil {
				externalID = transfer.ExternalUserID
				current, _ := sessions.Default(c).Get("userId").(string)
				if current != "" && current != *externalID && !input.ConfirmAccountSwitch {
					accountSwitchRequired = true
					return nil
				}
			} else {
				visitor, err := tx.GetTransferSourceVisitor(ctx, sourceCredential.EventVisitorIdentityID)
				if err != nil {
					return err
				}
				secret, hash, err := transferSecret()
				if err != nil {
					return err
				}
				credential := &pgstore.EventVisitorCredential{EventVisitorIdentityID: visitor.ID, CredentialHash: hash, Kind: pgstore.CredentialKindGranted, GrantsOwner: transfer.GrantsOwner}
				if err := tx.CreateEventVisitorCredential(ctx, credential); err != nil {
					return err
				}
				transfer.GrantID = &credential.ID
				grantValue = credential.ID + "." + secret
				grantPublicID = visitor.PublicID
			}
			transfer.State = "redeemed"
		case "cancel":
			if !source || (transfer.State != "pending" && transfer.State != "approved") {
				return pgx.ErrNoRows
			}
			transfer.State = "cancelled"
		default:
			return pgx.ErrNoRows
		}
		result["state"] = transfer.State
		if err := tx.SaveAccessTransfer(ctx, transfer); err != nil {
			return err
		}
		if externalID != nil {
			session := sessions.Default(c)
			// Redemption replaces only the session identity; unrelated session
			// keys must survive the transfer.
			session.Set("userId", *externalID)
			// Cookie-session encoding must succeed before consuming the transfer.
			// Headers are not sent until the transaction has committed below.
			return session.Save()
		}
		return nil
	})
	if err != nil {
		c.Writer.Header().Del("Set-Cookie")
		for _, cookie := range previousCookies {
			c.Writer.Header().Add("Set-Cookie", cookie)
		}
		transferDenied(c, err)
		return
	}
	if accountSwitchRequired {
		c.JSON(http.StatusConflict, gin.H{"accountSwitchRequired": true})
		return
	}
	if targetSecret != "" {
		transferCookie(c, "timeful_transfer_target_"+c.Param("transferId"), targetSecret)
	}
	if grantValue != "" {
		transferCookie(c, postgresGrantCookieName(event.ShortID), grantPublicID+"."+grantValue)
	}
	c.JSON(200, result)
}

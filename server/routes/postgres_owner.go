package routes

import (
	"context"
	"crypto/rand"
	"crypto/sha256"
	"crypto/subtle"
	"encoding/base64"
	"errors"
	"net/http"
	"strings"

	"github.com/gin-contrib/sessions"
	"github.com/gin-gonic/gin"
	"github.com/jackc/pgx/v5"
	"timeful/server/errs"
	pgstore "timeful/server/postgres"
)

func postgresOwnerCookieName(eventID string) string { return "timeful_owner_" + eventID }

func issuePostgresOwnerToken(ctx context.Context, repo *pgstore.Repository, event *pgstore.Event) (string, error) {
	var secret [32]byte
	if _, err := rand.Read(secret[:]); err != nil {
		return "", err
	}
	token := base64.RawURLEncoding.EncodeToString(secret[:])
	hash := sha256.Sum256([]byte(token))
	if err := repo.SetEventOwnerToken(ctx, event.ID, hash[:]); err != nil {
		return "", err
	}
	return token, nil
}

func setPostgresOwnerCookie(c *gin.Context, eventID, token string) {
	http.SetCookie(c.Writer, &http.Cookie{
		Name: postgresOwnerCookieName(eventID), Value: token, Path: "/api",
		MaxAge: 34560000, HttpOnly: true, SameSite: http.SameSiteLaxMode,
		Secure: c.Request.TLS != nil || c.GetHeader("X-Forwarded-Proto") == "https",
	})
}

// authorizePostgresOwner runs under the event row lock, serializing takeover
// with protected mutations. Token proof never changes response ownership.
func authorizePostgresOwner(c *gin.Context, repo *pgstore.Repository, event *pgstore.Event) (bool, error) {
	if event.IsDeleted {
		return false, pgx.ErrNoRows
	}
	ctx := c.Request.Context()
	externalID, _ := sessions.Default(c).Get("userId").(string)
	token, err := c.Cookie(postgresOwnerCookieName(event.ShortID))
	hash := sha256.Sum256([]byte(token))
	if err == nil && token != "" && subtle.ConstantTimeCompare(hash[:], event.OwnerEditTokenHash) == 1 {
		if externalID != "" {
			platform, err := repo.FindOrCreatePlatformIdentity(ctx, externalID)
			if err != nil {
				return false, err
			}
			if event.OwnerPlatformIdentityID == nil || *event.OwnerPlatformIdentityID != platform.ID {
				if err := repo.AssociateEventOwner(ctx, event.ID, platform.ID); err != nil {
					return false, err
				}
				event.OwnerPlatformIdentityID = &platform.ID
			}
		}
		return true, nil
	}
	if externalID != "" {
		owned, err := repo.EventOwnerBelongsToAccount(ctx, event.ID, externalID)
		if err != nil || owned {
			return owned, err
		}
	}
	// This validates the future transfer credential without adding an issuance
	// route. A base EVCC, even the creator's, never grants Event Owner powers.
	cookie, err := c.Cookie(postgresCredentialCookieName(event.ShortID))
	if err != nil {
		return false, nil
	}
	parts := strings.Split(cookie, ".")
	if len(parts) != 3 {
		return false, nil
	}
	visitor, err := repo.GetEventVisitorIdentity(ctx, event.ID, parts[0])
	if errors.Is(err, pgx.ErrNoRows) {
		return false, nil
	}
	if err != nil {
		return false, err
	}
	credential, err := provenPostgresCredential(c, repo, visitor, event.ShortID)
	if err != nil {
		return false, err
	}
	return credential != nil && credential.Kind == pgstore.CredentialKindGranted && credential.GrantsOwner &&
		event.OwnerEventVisitorIdentityID != nil && visitor.ID == *event.OwnerEventVisitorIdentityID, nil
}

func resolvePostgresOwner(c *gin.Context, repo *pgstore.Repository, event *pgstore.Event) (bool, error) {
	var authorized bool
	err := repo.WithTransaction(c.Request.Context(), func(ctx context.Context, tx *pgstore.Repository) error {
		locked, err := tx.LockEvent(ctx, event.ID)
		if err != nil {
			return err
		}
		authorized, err = authorizePostgresOwner(c, tx, locked)
		if err == nil {
			*event = *locked
		}
		return err
	})
	return authorized, err
}

func postgresWritableEvent(event *pgstore.Event) error {
	if event.IsDeleted {
		return pgx.ErrNoRows
	}
	if event.IsArchived {
		return guestForbidden{errs.EventArchived}
	}
	return nil
}

func postgresOwnerMutation(c *gin.Context, allowArchived bool, mutate func(context.Context, *pgstore.Repository, *pgstore.Event) error) {
	repo := postgresRepository(c)
	if repo == nil {
		return
	}
	event := postgresEvent(c, repo)
	if event == nil {
		return
	}
	err := repo.WithTransaction(c.Request.Context(), func(ctx context.Context, tx *pgstore.Repository) error {
		locked, err := tx.LockEvent(ctx, event.ID)
		if err != nil {
			return err
		}
		authorized, err := authorizePostgresOwner(c, tx, locked)
		if err != nil {
			return err
		}
		if !authorized {
			return guestForbidden{errs.EventOwnerCredentialRequired}
		}
		if !allowArchived {
			if err := postgresWritableEvent(locked); err != nil {
				return err
			}
		}
		return mutate(ctx, tx, locked)
	})
	if err != nil {
		postgresMutationError(c, err)
		return
	}
	c.Status(http.StatusOK)
}

func postgresArchiveEvent(c *gin.Context) {
	var input struct {
		Archive *bool `json:"archive" binding:"required"`
	}
	if err := c.BindJSON(&input); err != nil {
		return
	}
	postgresOwnerMutation(c, true, func(ctx context.Context, tx *pgstore.Repository, event *pgstore.Event) error {
		event.IsArchived = *input.Archive
		return tx.UpdateEvent(ctx, event)
	})
}

func postgresDeleteEvent(c *gin.Context) {
	postgresOwnerMutation(c, true, func(ctx context.Context, tx *pgstore.Repository, event *pgstore.Event) error {
		event.IsDeleted = true
		return tx.UpdateEvent(ctx, event)
	})
}

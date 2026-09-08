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
	pgstore "timeful/server/postgres"
)

type postgresVisitor struct {
	identity       *pgstore.EventVisitorIdentity
	externalUserID string
	authorized     bool
}

// @Summary Associate browser Event Visitor Identities with the authenticated account
// @Tags auth
// @Accept json
// @Produce json
// @Param payload body object{identities=[]object{eventId=string,eventVisitorId=string}} true "Browser-local public identities; matching HttpOnly credentials are required"
// @Success 200
// @Failure 401
// @Router /auth/visitor-identities [post]
func associatePostgresVisitorIdentities(c *gin.Context) {
	externalID, ok := sessions.Default(c).Get("userId").(string)
	if !ok || externalID == "" {
		c.Status(http.StatusUnauthorized)
		return
	}
	var input struct {
		Identities []struct {
			EventID        string `json:"eventId"`
			EventVisitorID string `json:"eventVisitorId"`
		} `json:"identities"`
	}
	if err := c.BindJSON(&input); err != nil {
		return
	}
	if len(input.Identities) > 200 {
		c.Status(http.StatusBadRequest)
		return
	}
	repo := postgresRepository(c)
	if repo == nil {
		return
	}
	err := repo.WithTransaction(c.Request.Context(), func(ctx context.Context, tx *pgstore.Repository) error {
		for _, item := range input.Identities {
			event, err := tx.GetEventByShortID(ctx, item.EventID)
			if errors.Is(err, pgx.ErrNoRows) {
				continue
			}
			if err != nil {
				return err
			}
			visitor, err := tx.GetEventVisitorIdentity(ctx, event.ID, item.EventVisitorID)
			if errors.Is(err, pgx.ErrNoRows) {
				continue
			}
			if err != nil {
				return err
			}
			valid, err := validPostgresCredential(c, tx, visitor, event.ShortID)
			if err != nil {
				return err
			}
			if !valid || visitor.PlatformIdentityID != nil {
				continue
			}
			platform, err := tx.FindOrCreatePlatformIdentity(ctx, externalID)
			if err != nil {
				return err
			}
			if err := tx.AssociateEventVisitorIdentity(ctx, visitor.ID, platform.ID); err != nil {
				return err
			}
		}
		return nil
	})
	if err != nil {
		postgresMutationError(c, err)
		return
	}
	c.JSON(http.StatusOK, gin.H{})
}

func postgresCredentialCookieName(eventID string) string { return "timeful_evcc_" + eventID }

func issuePostgresCredential(ctx context.Context, repo *pgstore.Repository, visitorID string) (string, error) {
	var secret [32]byte
	if _, err := rand.Read(secret[:]); err != nil {
		return "", err
	}
	value := base64.RawURLEncoding.EncodeToString(secret[:])
	hash := sha256.Sum256([]byte(value))
	credential := &pgstore.EventVisitorCredential{EventVisitorIdentityID: visitorID, CredentialHash: hash[:]}
	if err := repo.CreateEventVisitorCredential(ctx, credential); err != nil {
		return "", err
	}
	return credential.ID + "." + value, nil
}

func setPostgresCredentialCookie(c *gin.Context, eventID, publicID, credential string) {
	http.SetCookie(c.Writer, &http.Cookie{
		Name: postgresCredentialCookieName(eventID), Value: publicID + "." + credential,
		Path: "/api", MaxAge: 34560000, HttpOnly: true, SameSite: http.SameSiteLaxMode,
		Secure: c.Request.TLS != nil || c.GetHeader("X-Forwarded-Proto") == "https",
	})
}

func validPostgresCredential(c *gin.Context, repo *pgstore.Repository, visitor *pgstore.EventVisitorIdentity, eventID string) (bool, error) {
	cookie, err := c.Cookie(postgresCredentialCookieName(eventID))
	if err != nil {
		return false, nil
	}
	parts := strings.Split(cookie, ".")
	if len(parts) != 3 || parts[0] != visitor.PublicID {
		return false, nil
	}
	credential, err := repo.GetEventVisitorCredential(c.Request.Context(), visitor.ID, parts[1])
	if errors.Is(err, pgx.ErrNoRows) {
		return false, nil
	}
	if err != nil {
		return false, err
	}
	hash := sha256.Sum256([]byte(parts[2]))
	return subtle.ConstantTimeCompare(hash[:], credential.CredentialHash) == 1 && credential.RevokedAt == nil, nil
}

// The public identifier selects a visitor but never proves control of it.
func resolvePostgresVisitor(c *gin.Context, repo *pgstore.Repository, event *pgstore.Event) (*postgresVisitor, error) {
	externalID, _ := sessions.Default(c).Get("userId").(string)
	publicID := c.Query("eventVisitorId")
	if publicID == "" {
		if cookie, err := c.Cookie(postgresCredentialCookieName(event.ShortID)); err == nil {
			publicID = strings.Split(cookie, ".")[0]
		}
	}
	result := &postgresVisitor{externalUserID: externalID}
	if publicID != "" {
		visitor, err := repo.GetEventVisitorIdentity(c.Request.Context(), event.ID, publicID)
		if err != nil && !errors.Is(err, pgx.ErrNoRows) {
			return nil, err
		}
		if err == nil {
			valid, err := validPostgresCredential(c, repo, visitor, event.ShortID)
			if err != nil {
				return nil, err
			}
			account := false
			if externalID != "" {
				account, err = repo.VisitorBelongsToAccount(c.Request.Context(), visitor.ID, externalID)
				if err != nil {
					return nil, err
				}
			}
			result.identity = visitor
			if valid || account {
				result.authorized = true
				if account && !valid {
					credential, err := issuePostgresCredential(c.Request.Context(), repo, visitor.ID)
					if err != nil {
						return nil, err
					}
					setPostgresCredentialCookie(c, event.ShortID, visitor.PublicID, credential)
				}
			}
		}
	}
	if result.identity == nil {
		var credential string
		err := repo.WithTransaction(c.Request.Context(), func(ctx context.Context, tx *pgstore.Repository) error {
			visitor, err := tx.CreateEventVisitorIdentity(ctx, event.ID)
			if err != nil {
				return err
			}
			result.identity = visitor
			result.authorized = true
			credential, err = issuePostgresCredential(ctx, tx, visitor.ID)
			return err
		})
		if err != nil {
			return nil, err
		}
		setPostgresCredentialCookie(c, event.ShortID, result.identity.PublicID, credential)
	}
	if externalID != "" && result.authorized && result.identity.PlatformIdentityID == nil {
		platform, err := repo.FindOrCreatePlatformIdentity(c.Request.Context(), externalID)
		if err != nil {
			return nil, err
		}
		if err := repo.AssociateEventVisitorIdentity(c.Request.Context(), result.identity.ID, platform.ID); err != nil {
			return nil, err
		}
		result.identity.PlatformIdentityID = &platform.ID
	}
	return result, nil
}

func (v *postgresVisitor) controls(ctx context.Context, repo *pgstore.Repository, visitorID string) (bool, error) {
	if v.authorized && v.identity.ID == visitorID {
		return true, nil
	}
	if v.externalUserID == "" {
		return false, nil
	}
	return repo.VisitorBelongsToAccount(ctx, visitorID, v.externalUserID)
}

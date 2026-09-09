package routes

import (
	"context"
	"errors"
	"strings"

	"github.com/gin-contrib/sessions"
	"github.com/gin-gonic/gin"
	"github.com/jackc/pgx/v5"
	pgstore "timeful/server/postgres"
)

func postgresGrantCookieName(eventID string) string { return "timeful_grant_" + eventID }
func provenPostgresGrant(c *gin.Context, repo *pgstore.Repository, event *pgstore.Event) (*pgstore.EventVisitorIdentity, *pgstore.EventVisitorCredential, error) {
	cookie, err := c.Cookie(postgresGrantCookieName(event.ShortID))
	if err != nil {
		return nil, nil, nil
	}
	visitor, err := repo.GetEventVisitorIdentity(c.Request.Context(), event.ID, strings.Split(cookie, ".")[0])
	if errors.Is(err, pgx.ErrNoRows) {
		return nil, nil, nil
	}
	if err != nil {
		return nil, nil, err
	}
	credential, err := provenPostgresCredentialCookie(c, repo, visitor, postgresGrantCookieName(event.ShortID))
	if err != nil {
		return nil, nil, err
	}
	if credential == nil || credential.Kind != pgstore.CredentialKindGranted {
		return nil, nil, nil
	}
	return visitor, credential, nil
}

// @Summary Inspect or explicitly confirm granted response identity association
// @Description PostgreSQL only. An active Granted EVCC and signed-in session are required. Association preserves source response ownership and does not associate event ownership.
// @Tags events
// @Accept json
// @Produce json
// @Param eventId path string true "Event ID"
// @Param payload body object{confirm=bool} true "Explicit consent; false only inspects"
// @Success 200 {object} object{confirmationRequired=bool}
// @Failure 403
// @Router /events/{eventId}/grant-association [post]
func postgresGrantAssociation(c *gin.Context) {
	repo := postgresRepository(c)
	if repo == nil {
		return
	}
	event := postgresEvent(c, repo)
	if event == nil {
		return
	}
	var input struct {
		Confirm bool `json:"confirm"`
	}
	if err := c.BindJSON(&input); err != nil {
		return
	}
	external, _ := sessions.Default(c).Get("userId").(string)
	required := false
	err := repo.WithTransaction(c.Request.Context(), func(ctx context.Context, tx *pgstore.Repository) error {
		locked, err := tx.LockEvent(ctx, event.ID)
		if err != nil {
			return err
		}
		if locked.IsDeleted {
			return pgx.ErrNoRows
		}
		visitor, _, err := provenPostgresGrant(c, tx, event)
		if err != nil {
			return err
		}
		if visitor == nil || external == "" {
			if input.Confirm {
				return pgx.ErrNoRows
			}
			return nil
		}
		if visitor.PlatformIdentityID != nil {
			return nil
		}
		required = true
		if !input.Confirm {
			return nil
		}
		platform, err := tx.FindOrCreatePlatformIdentity(ctx, external)
		if err != nil {
			return err
		}
		if err := tx.AssociateEventVisitorIdentity(ctx, visitor.ID, platform.ID); err != nil {
			return err
		}
		required = false
		return nil
	})
	if err != nil {
		transferDenied(c, err)
		return
	}
	c.JSON(200, gin.H{"confirmationRequired": required})
}

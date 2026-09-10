package routes

import (
	"bytes"
	"context"
	"encoding/json"
	"errors"
	"fmt"
	"io"
	"net/http"
	"strings"

	"github.com/gin-gonic/gin"
	"github.com/jackc/pgx/v5"
	"go.mongodb.org/mongo-driver/bson"
	"timeful/server/accounts"
	"timeful/server/errs"
	"timeful/server/models"
	pgstore "timeful/server/postgres"
	"timeful/server/responses"
	"timeful/server/services/listmonk"
	"timeful/server/utils"
)

const (
	postgresGroupInviteEmailTemplate = 9
	postgresGroupUpdateEmailTemplate = 11
)

// postgresEventInput carries the legacy group attendee list, which models.Event
// cannot hold because its Attendees field is the persistence attendee shape.
// The outer field shadows the embedded field at the same JSON key.
type postgresEventInput struct {
	models.Event
	Attendees []string `json:"attendees"`
}

// postgresGroupAttendeePayload is the attendee wire shape the group views and
// dashboard consume. It mirrors the legacy models.Attendee fields while using
// the PostgreSQL attendee UUID as _id.
type postgresGroupAttendeePayload struct {
	ID       string `json:"_id"`
	EventID  string `json:"eventId"`
	Email    string `json:"email"`
	Declined *bool  `json:"declined,omitempty"`
}

func postgresGroupAttendeePayloads(shortID string, attendees []pgstore.Attendee) []postgresGroupAttendeePayload {
	payloads := make([]postgresGroupAttendeePayload, 0, len(attendees))
	for _, attendee := range attendees {
		payloads = append(payloads, postgresGroupAttendeePayload{
			ID:       attendee.ID,
			EventID:  shortID,
			Email:    attendee.Email,
			Declined: attendee.Declined,
		})
	}
	return payloads
}

// postgresAccountEmail resolves the signed-in account's email through the
// authoritative PostgreSQL boundary, adopting a legacy session once if needed.
func postgresAccountEmail(ctx context.Context, externalUserID string) string {
	if externalUserID == "" {
		return ""
	}
	account, err := accounts.Resolve(ctx, externalUserID)
	if err != nil || account == nil {
		return ""
	}
	return account.Email
}

// postgresGroupViewerIsInvitee reports whether the signed-in viewer is a
// non-declined member of the group, which is required to expose respondent
// emails for matching pending attendees to respondents.
func postgresGroupViewerIsInvitee(ctx context.Context, viewer *postgresVisitor, attendees []pgstore.Attendee) bool {
	email := postgresAccountEmail(ctx, viewer.externalUserID)
	if email == "" {
		return false
	}
	for _, attendee := range attendees {
		if attendee.Declined != nil && *attendee.Declined {
			continue
		}
		if strings.EqualFold(strings.TrimSpace(attendee.Email), strings.TrimSpace(email)) {
			return true
		}
	}
	return false
}

// postgresGroupEmailVisibility keeps respondent emails visible to the owner and
// non-declined invitees so clients can match pending attendees to respondents
// when collectEmails is off, mirroring legacy group behavior. PostgreSQL does
// not persist a denormalized account snapshot, so the response email is
// promoted into the rebuilt user snapshot at read time.
func postgresGroupEmailVisibility(ctx context.Context, value models.Event, viewer *postgresVisitor, attendees []pgstore.Attendee, responseMap map[string]*postgresPublicResponse) {
	if responseMap == nil {
		return
	}
	showEmails := viewer.owner && utils.Coalesce(value.CollectEmails)
	keepGroupEmails := viewer.owner || postgresGroupViewerIsInvitee(ctx, viewer, attendees)
	for key, response := range responseMap {
		if response == nil {
			continue
		}
		if keepGroupEmails && response.Email != "" && response.User == nil {
			response.User = &models.User{Email: response.Email}
		}
		stripSensitiveUserFields(response.User)
		if !showEmails {
			response.Email = ""
			if response.User != nil && !keepGroupEmails {
				response.User.Email = ""
			}
		}
		responseMap[key] = response
	}
}

// postgresGroupViewerHasResponded reports whether the calling visitor owns a
// response on the group, either through a signed-in account response or the
// browser Event Visitor Identity. It backs the derived hasResponded read.
func postgresGroupViewerHasResponded(ctx context.Context, repo *pgstore.Repository, event *pgstore.Event, viewer *postgresVisitor) bool {
	if viewer == nil {
		return false
	}
	if viewer.externalUserID != "" {
		if _, err := repo.GetResponseByAccountUserID(ctx, event.ID, viewer.externalUserID); err == nil {
			return true
		} else if !errors.Is(err, pgx.ErrNoRows) {
			return false
		}
	}
	if viewer.identity == nil {
		return false
	}
	responses, err := repo.ListResponses(ctx, event.ID)
	if err != nil {
		return false
	}
	for _, response := range responses {
		if response.EventVisitorIdentityID == viewer.identity.ID {
			return true
		}
	}
	return false
}

// sendPostgresGroupInviteEmails sends the existing availability-group
// invitation email to each newly added invitee.
func sendPostgresGroupInviteEmails(ownerName, groupName, groupURL string, emails []string) {
	for _, email := range emails {
		if strings.TrimSpace(email) == "" {
			continue
		}
		listmonk.SendEmailAddSubscriberIfNotExist(email, postgresGroupInviteEmailTemplate, bson.M{
			"ownerName": ownerName,
			"groupName": groupName,
			"groupUrl":  groupURL,
		}, false)
	}
}

// sendPostgresGroupUpdateEmails sends invitation emails to added members and
// the existing group update email to kept members, matching legacy ordering.
func sendPostgresGroupUpdateEmails(ownerName, groupName, groupURL string, added, kept []string) {
	sendPostgresGroupInviteEmails(ownerName, groupName, groupURL, added)
	if len(added) == 0 {
		return
	}
	for _, email := range kept {
		if strings.TrimSpace(email) == "" {
			continue
		}
		listmonk.SendEmailAddSubscriberIfNotExist(email, postgresGroupUpdateEmailTemplate, bson.M{
			"ownerName": ownerName,
			"groupName": groupName,
			"groupUrl":  groupURL,
			"emails":    added,
		}, false)
	}
}

func postgresGroupURL(shortID string) string {
	return fmt.Sprintf("%s/g/%s", utils.GetBaseUrl(), shortID)
}

// postgresGroupEmailPlan carries the owner-facing email work computed while the
// event row is locked so it can be sent after the transaction commits.
type postgresGroupEmailPlan struct {
	ownerName string
	groupName string
	added     []string
	kept      []string
}

// postgresApplyGroupAttendeeEdits diffs the requested attendee emails against
// the stored membership, removes departed members' account responses so the
// response count stays correct, and returns the post-commit email plan. The
// owner membership is protected from removal. The caller already holds the
// event row lock and persists the adjusted response count.
func postgresApplyGroupAttendeeEdits(ctx context.Context, tx *pgstore.Repository, event *pgstore.Event, requested []string) (postgresGroupEmailPlan, error) {
	plan := postgresGroupEmailPlan{
		ownerName: postgresGroupOwnerName(ctx, event.OwnerExternalID),
		groupName: event.Name,
	}
	current, err := tx.ListAttendees(ctx, event.ID)
	if err != nil {
		return plan, err
	}
	currentEmails := make([]string, 0, len(current))
	byEmail := make(map[string]pgstore.Attendee, len(current))
	for _, attendee := range current {
		currentEmails = append(currentEmails, attendee.Email)
		byEmail[strings.ToLower(strings.TrimSpace(attendee.Email))] = attendee
	}
	added, removed, kept := utils.FindAddedRemovedKept(requested, currentEmails)
	for _, item := range removed {
		attendee := byEmail[strings.ToLower(strings.TrimSpace(item.Value))]
		if attendee.AccountUserID != nil && event.OwnerExternalID != nil && *attendee.AccountUserID == *event.OwnerExternalID {
			continue
		}
		if attendee.AccountUserID != nil {
			response, err := tx.GetResponseByAccountUserID(ctx, event.ID, *attendee.AccountUserID)
			if err == nil {
				if err := tx.DeleteResponse(ctx, response.ID); err != nil {
					return plan, err
				}
				event.NumResponses--
			} else if !errors.Is(err, pgx.ErrNoRows) {
				return plan, err
			}
		}
		if err := tx.RemoveAttendee(ctx, event.ID, attendee.Email); err != nil && !errors.Is(err, pgx.ErrNoRows) {
			return plan, err
		}
	}
	for _, item := range added {
		if strings.TrimSpace(item.Value) == "" {
			continue
		}
		if err := tx.AddAttendee(ctx, &pgstore.Attendee{EventID: event.ID, Email: item.Value, Declined: utils.FalsePtr()}); err != nil {
			return plan, err
		}
		plan.added = append(plan.added, item.Value)
	}
	for _, item := range kept {
		plan.kept = append(plan.kept, item.Value)
	}
	return plan, nil
}

// postgresGroupOwnerName resolves the owner display name used in group emails.
func postgresGroupOwnerName(ctx context.Context, ownerExternalID *string) string {
	if ownerExternalID == nil || *ownerExternalID == "" {
		return "Somebody"
	}
	account, err := accounts.Resolve(ctx, *ownerExternalID)
	if err != nil || account == nil || account.FirstName == "" {
		return "Somebody"
	}
	return account.FirstName
}

// postgresDeclineInvite sets the attendee decline state for the signed-in
// member of a PostgreSQL group. An optional {"declined": false} body covers
// undecline. The route is dispatched from the legacy declineInvite path, so it
// carries no separate Swagger annotation.
func postgresDeclineInvite(c *gin.Context) {
	declined := true
	if body, err := io.ReadAll(c.Request.Body); err == nil && len(bytes.TrimSpace(body)) > 0 {
		var input struct {
			Declined *bool `json:"declined"`
		}
		if json.Unmarshal(body, &input) == nil && input.Declined != nil {
			declined = *input.Declined
		}
	}
	repository := postgresRepository(c)
	if repository == nil {
		return
	}
	event := postgresEvent(c, repository)
	if event == nil {
		return
	}
	if event.Type != pgstore.EventTypeGroup {
		c.JSON(http.StatusBadRequest, responses.Error{Error: errs.EventNotGroup})
		return
	}
	userInterface, _ := c.Get("authUser")
	user, _ := userInterface.(*models.User)
	if user == nil {
		c.JSON(http.StatusUnauthorized, responses.Error{Error: errs.NotSignedIn})
		return
	}
	if _, err := repository.GetAttendeeByEmail(c.Request.Context(), event.ID, user.Email); err != nil {
		if errors.Is(err, pgx.ErrNoRows) {
			c.JSON(http.StatusNotFound, responses.Error{Error: errs.AttendeeEmailNotFound})
			return
		}
		postgresMutationError(c, err)
		return
	}
	if err := repository.SetAttendeeDeclined(c.Request.Context(), event.ID, user.Email, declined); err != nil {
		postgresMutationError(c, err)
		return
	}
	c.JSON(http.StatusOK, gin.H{})
}

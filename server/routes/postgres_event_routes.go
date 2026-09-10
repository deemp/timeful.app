package routes

import (
	"bytes"
	"context"
	"encoding/json"
	"errors"
	"io"
	"net/http"
	"os"
	"strings"
	"time"

	"github.com/gin-contrib/sessions"
	"github.com/gin-gonic/gin"
	"github.com/jackc/pgx/v5"
	"go.mongodb.org/mongo-driver/bson/primitive"
	"timeful/server/errs"
	"timeful/server/models"
	pgstore "timeful/server/postgres"
	"timeful/server/respondents"
	"timeful/server/responses"
	"timeful/server/utils"
)

func postgresRepository(c *gin.Context) *pgstore.Repository {
	repository, err := pgstore.DefaultRepository()
	if err != nil {
		c.JSON(http.StatusServiceUnavailable, responses.Error{Error: "postgres-event-store-unavailable"})
		return nil
	}
	return repository
}

func postgresEvent(c *gin.Context, repository *pgstore.Repository) *pgstore.Event {
	event, err := repository.GetEventByShortID(c.Request.Context(), c.Param("eventId"))
	if errors.Is(err, pgx.ErrNoRows) || (err == nil && event.IsDeleted) {
		c.JSON(http.StatusNotFound, responses.Error{Error: errs.EventNotFound})
		return nil
	}
	if err != nil {
		c.JSON(http.StatusInternalServerError, responses.Error{Error: "failed-to-load-event"})
		return nil
	}
	return event
}

func postgresEventModel(event *pgstore.Event) (models.Event, error) {
	var value models.Event
	if err := json.Unmarshal(event.Payload, &value); err != nil {
		return value, err
	}
	value.Id = primitive.NilObjectID
	value.ShortId = &event.ShortID
	value.OwnerId = primitive.NilObjectID
	value.IsArchived = &event.IsArchived
	value.IsDeleted = &event.IsDeleted
	value.Name = event.Name
	value.Type = models.EventType(event.Type)
	value.ScheduleVersion = event.ScheduleVersion
	value.NumResponses = &event.NumResponses
	value.CreatorPosthogId = event.CreatorPosthogID
	return value, nil
}

func postgresResponseModel(stored pgstore.Response) (*models.Response, string, error) {
	var value models.Response
	if err := json.Unmarshal(stored.Payload, &value); err != nil {
		return nil, "", err
	}
	value.UserId = primitive.NilObjectID
	value.User = nil
	value.GuestId, value.GuestEditToken, value.GuestEditPolicy, value.GuestOwnershipMode = "", "", "", ""
	return &value, stored.PublicID, nil
}

func dereference(value *string) string {
	if value == nil {
		return ""
	}
	return *value
}

type postgresPublicResponse struct {
	*models.Response
	PublicID string `json:"publicId"`
	CanEdit  bool   `json:"canEdit"`
}

func postgresResponses(c *gin.Context, repository *pgstore.Repository, event *pgstore.Event, visitor *postgresVisitor) (map[string]*postgresPublicResponse, bool, error) {
	value, err := postgresEventModel(event)
	if err != nil {
		return nil, false, err
	}
	filtered := utils.Coalesce(value.BlindAvailabilityEnabled) && !visitor.owner
	stored, err := repository.ListResponses(c.Request.Context(), event.ID)
	if err != nil {
		return nil, false, err
	}
	result := make(map[string]*postgresPublicResponse)
	for _, response := range stored {
		authorized, err := visitor.controls(c.Request.Context(), repository, response.EventVisitorIdentityID)
		if err != nil {
			return nil, false, err
		}
		if filtered && !authorized {
			continue
		}
		value, key, err := postgresResponseModel(response)
		if err != nil {
			return nil, false, err
		}
		result[key] = &postgresPublicResponse{Response: value, PublicID: key, CanEdit: authorized && !event.IsArchived}
	}
	return result, filtered, nil
}

func postgresEventPayload(event *pgstore.Event, responseMap map[string]*postgresPublicResponse) (map[string]any, error) {
	value, err := postgresEventModel(event)
	if err != nil {
		return nil, err
	}
	value.ResponsesMap = nil
	payload, err := json.Marshal(value)
	if err != nil {
		return nil, err
	}
	var result map[string]any
	if err := json.Unmarshal(payload, &result); err != nil {
		return nil, err
	}
	result["responses"] = responseMap
	result["_id"] = event.ShortID
	result["shortId"] = event.ShortID
	result["ownerId"] = primitive.NilObjectID.Hex()
	return result, nil
}

func postgresGetEventIDs(c *gin.Context) {
	repository := postgresRepository(c)
	if repository == nil {
		return
	}
	event := postgresEvent(c, repository)
	if event == nil {
		return
	}
	c.JSON(http.StatusOK, gin.H{"shortId": event.ShortID, "longId": event.ShortID})
}

func postgresGetEvent(c *gin.Context) {
	repository := postgresRepository(c)
	if repository == nil {
		return
	}
	event := postgresEvent(c, repository)
	if event == nil {
		return
	}
	visitor, err := resolvePostgresVisitor(c, repository, event)
	if err != nil {
		postgresMutationError(c, err)
		return
	}
	responseMap, filtered, err := postgresResponses(c, repository, event, visitor)
	if err != nil {
		c.JSON(http.StatusInternalServerError, responses.Error{Error: "failed-to-load-responses"})
		return
	}
	for key, response := range responseMap {
		stripSensitiveUserFields(response.User)
		response.Email = ""
		if response.User != nil {
			response.User.Email = ""
		}
		response.Availability = nil
		response.IfNeeded = nil
		response.ManualAvailability = nil
		responseMap[key] = response
	}
	payload, err := postgresEventPayload(event, responseMap)
	if err != nil {
		c.JSON(http.StatusInternalServerError, responses.Error{Error: "failed-to-serialize-event"})
		return
	}
	payload["eventVisitorId"] = visitor.identity.PublicID
	payload["canCreateResponse"] = visitor.authorized && !event.IsArchived
	payload["canManageEvent"] = visitor.owner
	payload["canEditSettings"] = visitor.owner && !event.IsArchived
	if filtered {
		delete(payload, "numResponses")
		if responseMap == nil {
			delete(payload, "responses")
		}
	}
	c.JSON(http.StatusOK, payload)
}

func postgresGetResponses(c *gin.Context) {
	query := struct {
		TimeMin time.Time `form:"timeMin" binding:"required"`
		TimeMax time.Time `form:"timeMax" binding:"required"`
	}{}
	if err := c.BindQuery(&query); err != nil {
		return
	}
	repository := postgresRepository(c)
	if repository == nil {
		return
	}
	event := postgresEvent(c, repository)
	if event == nil {
		return
	}
	visitor, err := resolvePostgresVisitor(c, repository, event)
	if err != nil {
		postgresMutationError(c, err)
		return
	}
	responseMap, _, err := postgresResponses(c, repository, event, visitor)
	if err != nil {
		c.JSON(http.StatusInternalServerError, responses.Error{Error: "failed-to-load-responses"})
		return
	}
	for key, response := range responseMap {
		response.Availability = filterResponseSlots(response.Availability, query.TimeMin, query.TimeMax)
		response.IfNeeded = filterResponseSlots(response.IfNeeded, query.TimeMin, query.TimeMax)
		stripSensitiveUserFields(response.User)
		response.Email = ""
		if response.User != nil {
			response.User.Email = ""
		}
		responseMap[key] = response
	}
	c.JSON(http.StatusOK, responseMap)
}

func filterResponseSlots(slots []primitive.DateTime, minimum, maximum time.Time) []primitive.DateTime {
	filtered := make([]primitive.DateTime, 0, len(slots))
	for _, slot := range slots {
		if !slot.Time().Before(minimum) && !slot.Time().After(maximum) {
			filtered = append(filtered, slot)
		}
	}
	return filtered
}

func postgresEditEvent(c *gin.Context) {
	if err := rejectLegacyTimedScheduleFields(c); err != nil {
		c.JSON(http.StatusBadRequest, responses.Error{Error: err.Error()})
		return
	}
	body, err := io.ReadAll(c.Request.Body)
	if err != nil {
		c.Status(http.StatusBadRequest)
		return
	}
	c.Request.Body = io.NopCloser(bytes.NewReader(body))
	var update models.Event
	if err := c.Bind(&update); err != nil {
		return
	}
	if update.Name == "" || update.Type == "" {
		c.Status(http.StatusBadRequest)
		return
	}
	var raw map[string]json.RawMessage
	if err := json.Unmarshal(body, &raw); err != nil {
		c.Status(http.StatusBadRequest)
		return
	}
	if update.DaysOnly == nil || !*update.DaysOnly {
		fields, err := normalizeTimedEventPayloadFields(timedEventPayloadFields{ActiveSlots: update.ActiveSlots, EventTimezone: update.EventTimezone, SlotGeneration: update.SlotGeneration, TimedRecurrence: update.TimedRecurrence})
		if err != nil {
			c.JSON(http.StatusBadRequest, responses.Error{Error: err.Error()})
			return
		}
		update.ActiveSlots, update.EventTimezone, update.SlotGeneration, update.TimedRecurrence = fields.ActiveSlots, fields.EventTimezone, fields.SlotGeneration, fields.TimedRecurrence
	} else if len(update.Dates) == 0 {
		c.JSON(http.StatusBadRequest, responses.Error{Error: "days-only-events-require-dates"})
		return
	}
	postgresOwnerMutation(c, false, func(ctx context.Context, tx *pgstore.Repository, event *pgstore.Event) error {
		current, err := postgresEventModel(event)
		if err != nil {
			return err
		}
		if _, present := raw["description"]; !present {
			update.Description = current.Description
		}
		if slots, present := raw["activeSlots"]; present && string(slots) == "[]" && len(current.ActiveSlots) > 0 {
			update.ActiveSlots = current.ActiveSlots
		}
		update.Id, update.ShortId, update.OwnerId, update.NumResponses, update.ResponsesMap = primitive.NilObjectID, nil, primitive.NilObjectID, nil, nil
		// Lifecycle state is changed only through the dedicated owner actions.
		update.IsArchived, update.IsDeleted = nil, nil
		payload, err := json.Marshal(update)
		if err != nil {
			return err
		}
		event.Name, event.Type, event.Payload, event.ScheduleVersion = update.Name, string(update.Type), payload, 1
		return tx.UpdateEvent(ctx, event)
	})
}

func postgresSaveSchedule(c *gin.Context)  { postgresUpdateSchedule(c, false) }
func postgresClearSchedule(c *gin.Context) { postgresUpdateSchedule(c, true) }

func postgresUpdateSchedule(c *gin.Context, clear bool) {
	repository := postgresRepository(c)
	if repository == nil {
		return
	}
	event := postgresEvent(c, repository)
	if event == nil {
		return
	}
	var input struct {
		StartDate primitive.DateTime `json:"startDate" binding:"required"`
		EndDate   primitive.DateTime `json:"endDate" binding:"required"`
	}
	if !clear {
		if err := c.Bind(&input); err != nil {
			return
		}
		if input.EndDate <= input.StartDate {
			c.JSON(http.StatusBadRequest, responses.Error{Error: "scheduled-event-end-must-follow-start"})
			return
		}
	}
	err := repository.WithTransaction(c.Request.Context(), func(ctx context.Context, tx *pgstore.Repository) error {
		locked, err := tx.LockEvent(ctx, event.ID)
		if err != nil {
			return err
		}
		if err := postgresWritableEvent(locked); err != nil {
			return err
		}
		value, err := postgresEventModel(locked)
		if err != nil {
			return err
		}
		value.ScheduledEvent = nil
		if !clear {
			value.ScheduledEvent = &models.CalendarEvent{Summary: locked.Name, StartDate: input.StartDate, EndDate: input.EndDate}
		}
		value.Id, value.ShortId, value.OwnerId, value.NumResponses, value.ResponsesMap = primitive.NilObjectID, nil, primitive.NilObjectID, nil, nil
		locked.Payload, err = json.Marshal(value)
		if err != nil {
			return err
		}
		return tx.UpdateEvent(ctx, locked)
	})
	if err != nil {
		postgresMutationError(c, err)
		return
	}
	c.Status(http.StatusOK)
}

type postgresResponseInput struct {
	ResponseID     string               `json:"responseId"`
	CreateResponse bool                 `json:"createResponse"`
	Name           string               `json:"name"`
	NewName        string               `json:"newName"`
	Email          string               `json:"email"`
	Availability   []primitive.DateTime `json:"availability"`
	IfNeeded       []primitive.DateTime `json:"ifNeeded"`
}

func postgresUpdateResponse(c *gin.Context) { postgresMutateResponse(c, "save") }
func postgresDeleteResponse(c *gin.Context) { postgresMutateResponse(c, "delete") }
func postgresRenameUser(c *gin.Context)     { postgresMutateResponse(c, "rename") }

type guestNameError struct{ message string }

func (e guestNameError) Error() string { return e.message }

type guestForbidden struct{ message string }

func (e guestForbidden) Error() string { return e.message }

func postgresMutateResponse(c *gin.Context, operation string) {
	var input postgresResponseInput
	if err := c.BindJSON(&input); err != nil {
		return
	}
	if (input.CreateResponse && input.ResponseID != "") || (input.ResponseID == "" && (!input.CreateResponse || operation != "save")) {
		c.JSON(http.StatusBadRequest, responses.Error{Error: "select-response-or-explicitly-create"})
		return
	}
	repository := postgresRepository(c)
	if repository == nil {
		return
	}
	event := postgresEvent(c, repository)
	if event == nil {
		return
	}
	visitor, err := resolvePostgresVisitor(c, repository, event)
	if err != nil {
		postgresMutationError(c, err)
		return
	}
	publicID := input.ResponseID
	err = repository.WithTransaction(c.Request.Context(), func(ctx context.Context, tx *pgstore.Repository) error {
		locked, err := tx.LockEvent(ctx, event.ID)
		if err != nil {
			return err
		}
		if err := postgresWritableEvent(locked); err != nil {
			return err
		}
		var stored *pgstore.Response
		value := &models.Response{}
		if input.CreateResponse {
			if !visitor.authorized {
				return guestForbidden{"visitor-credential-required"}
			}
			stored = &pgstore.Response{EventID: event.ID, EventVisitorIdentityID: visitor.identity.ID, RespondentKind: pgstore.RespondentKindGuest}
		} else {
			stored, err = tx.GetResponseByPublicID(ctx, event.ID, input.ResponseID)
			if err != nil {
				return err
			}
			authorized, err := visitor.controls(ctx, tx, stored.EventVisitorIdentityID)
			if err != nil {
				return err
			}
			if !authorized {
				return guestForbidden{"response-credential-required"}
			}
			value, _, err = postgresResponseModel(*stored)
			if err != nil {
				return err
			}
		}
		if operation == "delete" {
			if err := tx.DeleteResponse(ctx, stored.ID); err != nil {
				return err
			}
			locked.NumResponses--
			return tx.UpdateEvent(ctx, locked)
		}
		name := input.Name
		if operation == "rename" {
			name = input.NewName
		}
		if name == "" && !input.CreateResponse {
			name = value.Name
		}
		validated := respondents.ValidateGuestName(name)
		if validated.Code != respondents.GuestNameValid {
			return guestNameError{guestNameValidationErrorMessage(validated.Code)}
		}
		value.Name = validated.Name
		if operation == "save" {
			value.Email = input.Email
			value.Availability, value.IfNeeded = normalizeTimedResponseAvailabilitySlots(input.Availability, input.IfNeeded)
		}
		stored.Payload, err = json.Marshal(value)
		if err != nil {
			return err
		}
		if input.CreateResponse {
			if err := tx.CreateResponse(ctx, stored); err != nil {
				return err
			}
			publicID = stored.PublicID
			locked.NumResponses++
			return tx.UpdateEvent(ctx, locked)
		}
		return tx.UpdateResponse(ctx, stored)
	})
	if err != nil {
		postgresMutationError(c, err)
		return
	}
	c.JSON(http.StatusOK, gin.H{"responseId": publicID, "eventVisitorId": visitor.identity.PublicID})
}

func postgresMutationError(c *gin.Context, err error) {
	if errors.Is(err, pgx.ErrNoRows) {
		c.JSON(http.StatusNotFound, responses.Error{Error: errs.EventNotFound})
		return
	}
	var forbidden guestForbidden
	if errors.As(err, &forbidden) {
		c.JSON(http.StatusForbidden, responses.Error{Error: forbidden.message})
		return
	}
	var nameError guestNameError
	if errors.As(err, &nameError) {
		c.JSON(http.StatusBadRequest, responses.Error{Error: nameError.message})
		return
	}
	if pgstore.IsUniqueViolation(err) {
		c.JSON(http.StatusBadRequest, responses.Error{Error: "A guest with this name already exists for this event"})
		return
	}
	c.JSON(http.StatusInternalServerError, responses.Error{Error: "failed-to-update-response"})
}

func postgresEventRouteUnavailable(c *gin.Context) {
	c.JSON(http.StatusNotImplemented, responses.Error{Error: errs.PostgreSQLEventUnsupported})
}

func postgresCreationEnabled(c *gin.Context) bool {
	if !strings.EqualFold(os.Getenv("POSTGRES_ANONYMOUS_EVENT_CREATION_ENABLED"), "true") {
		return false
	}
	body, err := io.ReadAll(c.Request.Body)
	if err != nil {
		return false
	}
	c.Request.Body = io.NopCloser(bytes.NewReader(body))
	var payload struct {
		Type            models.EventType `json:"type"`
		DaysOnly        bool             `json:"daysOnly"`
		IsSignUpForm    bool             `json:"isSignUpForm"`
		ActiveSlots     json.RawMessage  `json:"activeSlots"`
		SlotGeneration  json.RawMessage  `json:"slotGeneration"`
		TimedRecurrence json.RawMessage  `json:"timedRecurrence"`
	}
	if json.Unmarshal(body, &payload) != nil || payload.IsSignUpForm || (payload.Type != models.SPECIFIC_DATES && payload.Type != models.DOW) {
		return false
	}
	return payload.DaysOnly || (len(payload.ActiveSlots) > 0 && len(payload.SlotGeneration) > 0 && len(payload.TimedRecurrence) > 0)
}

func postgresCreateEvent(c *gin.Context) {
	var event models.Event
	if err := c.Bind(&event); err != nil {
		return
	}
	if event.Name == "" || (event.Type != models.SPECIFIC_DATES && event.Type != models.DOW) {
		c.Status(http.StatusBadRequest)
		return
	}
	if event.DaysOnly == nil || !*event.DaysOnly {
		fields, err := normalizeTimedEventPayloadFields(timedEventPayloadFields{ActiveSlots: event.ActiveSlots, EventTimezone: event.EventTimezone, SlotGeneration: event.SlotGeneration, TimedRecurrence: event.TimedRecurrence})
		if err != nil {
			c.JSON(http.StatusBadRequest, responses.Error{Error: err.Error()})
			return
		}
		event.ActiveSlots, event.EventTimezone, event.SlotGeneration, event.TimedRecurrence = fields.ActiveSlots, fields.EventTimezone, fields.SlotGeneration, fields.TimedRecurrence
	} else if len(event.Dates) == 0 {
		c.JSON(http.StatusBadRequest, responses.Error{Error: "days-only-events-require-dates"})
		return
	}
	event.Id, event.ShortId, event.OwnerId, event.NumResponses, event.ResponsesMap = primitive.NilObjectID, nil, primitive.NilObjectID, nil, nil
	encoded, err := json.Marshal(event)
	if err != nil {
		c.JSON(http.StatusInternalServerError, responses.Error{Error: "failed-to-serialize-event"})
		return
	}
	repository := postgresRepository(c)
	if repository == nil {
		return
	}
	// A signed-in creator owns the PostgreSQL event through the authoritative
	// account, while anonymous creation relies on the issued owner token.
	externalUserID, signedIn := sessions.Default(c).Get("userId").(string)
	if !signedIn || externalUserID == "" {
		signedIn = false
		externalUserID = ""
	}
	stored := &pgstore.Event{Name: event.Name, Type: string(event.Type), ScheduleVersion: 1, CreatorPosthogID: event.CreatorPosthogId, Payload: encoded}
	if signedIn {
		stored.OwnerExternalID = &externalUserID
	}
	var visitor *pgstore.EventVisitorIdentity
	var credential, ownerToken string
	err = repository.WithTransaction(c.Request.Context(), func(ctx context.Context, tx *pgstore.Repository) error {
		if err := tx.CreateEvent(ctx, stored); err != nil {
			return err
		}
		if signedIn {
			platform, err := tx.FindOrCreatePlatformIdentity(ctx, externalUserID)
			if err != nil {
				return err
			}
			if err := tx.AssociateEventOwner(ctx, stored.ID, platform.ID); err != nil {
				return err
			}
			stored.OwnerPlatformIdentityID = &platform.ID
			if err := tx.IncrementAccountEventsCreated(ctx, externalUserID); err != nil {
				return err
			}
		}
		var err error
		visitor, err = tx.CreateEventVisitorIdentity(ctx, stored.ID)
		if err != nil {
			return err
		}
		credential, err = issuePostgresCredential(ctx, tx, visitor.ID)
		if err != nil {
			return err
		}
		ownerToken, err = issuePostgresOwnerToken(ctx, tx, stored)
		if err != nil {
			return err
		}
		stored.OwnerEventVisitorIdentityID = &visitor.ID
		return tx.UpdateEvent(ctx, stored)
	})
	if err != nil {
		c.JSON(http.StatusInternalServerError, responses.Error{Error: "failed-to-create-event"})
		return
	}
	setPostgresCredentialCookie(c, stored.ShortID, visitor.PublicID, credential)
	setPostgresOwnerCookie(c, stored.ShortID, ownerToken)
	c.JSON(http.StatusCreated, gin.H{"eventId": stored.ShortID, "eventVisitorId": visitor.PublicID})
}

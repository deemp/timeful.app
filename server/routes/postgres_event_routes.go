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
	// Signup forms persist a dedicated event kind but keep the legacy wire type
	// and isSignUpForm flag the frontend routes on.
	if event.Type == pgstore.EventTypeSignup {
		value.Type = models.SPECIFIC_DATES
		value.IsSignUpForm = utils.TruePtr()
	}
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

// postgresSignupBlock is the signup-block wire shape: the PostgreSQL UUID is
// exposed as _id and start/end instants keep the legacy RFC3339 encoding the
// frontend already consumes.
type postgresSignupBlock struct {
	ID        string     `json:"_id"`
	Name      string     `json:"name,omitempty"`
	Capacity  *int       `json:"capacity,omitempty"`
	StartDate *time.Time `json:"startDate,omitempty"`
	EndDate   *time.Time `json:"endDate,omitempty"`
}

func postgresSignupBlockPayload(block pgstore.SignupBlock) postgresSignupBlock {
	return postgresSignupBlock{ID: block.ID, Name: block.Name, Capacity: block.Capacity, StartDate: block.StartDate, EndDate: block.EndDate}
}

// postgresSignupResponsePayload is the signup-response wire shape. It mirrors the
// legacy models.SignUpResponse fields while carrying PostgreSQL block UUIDs as
// strings instead of MongoDB ObjectIDs. PublicID is the opaque response
// identifier the explicit-selection contract uses for mutation, and CanEdit
// reports whether the calling visitor may update or delete the response.
type postgresSignupResponsePayload struct {
	SignUpBlockIDs []string     `json:"signUpBlockIds,omitempty"`
	Name           string       `json:"name,omitempty"`
	Email          string       `json:"email,omitempty"`
	UserID         string       `json:"userId,omitempty"`
	User           *models.User `json:"user,omitempty"`
	PublicID       string       `json:"publicId"`
	CanEdit        bool         `json:"canEdit"`
}

// postgresSignupInstant accepts either an epoch-millisecond number or an
// RFC3339 string so the edit endpoint remains compatible with both the legacy
// models.SignUpBlock encoding and the frontend transport encoding.
type postgresSignupInstant struct {
	Value *time.Time
}

func (instant *postgresSignupInstant) UnmarshalJSON(data []byte) error {
	if string(data) == "null" {
		return nil
	}
	var millis int64
	if err := json.Unmarshal(data, &millis); err == nil {
		value := time.UnixMilli(millis).UTC()
		instant.Value = &value
		return nil
	}
	var raw string
	if err := json.Unmarshal(data, &raw); err != nil {
		return err
	}
	value, err := time.Parse(time.RFC3339Nano, raw)
	if err != nil {
		return err
	}
	instant.Value = &value
	return nil
}

// postgresSignupBlockInput decodes a block from the edit payload. PostgreSQL
// block identities are UUID strings, so this type must not bind through
// models.SignUpBlock, whose Id is a MongoDB ObjectID.
type postgresSignupBlockInput struct {
	ID        string                 `json:"_id"`
	Name      string                 `json:"name"`
	Capacity  *int                   `json:"capacity"`
	StartDate *postgresSignupInstant `json:"startDate"`
	EndDate   *postgresSignupInstant `json:"endDate"`
}

func postgresSignupBlocksFromModels(blocks []models.SignUpBlock) []pgstore.SignupBlock {
	converted := make([]pgstore.SignupBlock, 0, len(blocks))
	for _, block := range blocks {
		converted = append(converted, pgstore.SignupBlock{
			Name:      block.Name,
			Capacity:  block.Capacity,
			StartDate: signupModelInstant(block.StartDate),
			EndDate:   signupModelInstant(block.EndDate),
		})
	}
	return converted
}

func postgresSignupBlocksFromInput(blocks []postgresSignupBlockInput) []pgstore.SignupBlock {
	converted := make([]pgstore.SignupBlock, 0, len(blocks))
	for _, block := range blocks {
		converted = append(converted, pgstore.SignupBlock{
			ID:        block.ID,
			Name:      block.Name,
			Capacity:  block.Capacity,
			StartDate: signupInputInstant(block.StartDate),
			EndDate:   signupInputInstant(block.EndDate),
		})
	}
	return converted
}

func signupModelInstant(value *primitive.DateTime) *time.Time {
	if value == nil {
		return nil
	}
	instant := value.Time()
	return &instant
}

func signupInputInstant(value *postgresSignupInstant) *time.Time {
	if value == nil {
		return nil
	}
	return value.Value
}

// postgresSignupResponses renders the event's signup responses keyed by account
// hex or canonical guest name, reusing the shared payload identity and
// guest-name exposure rules. Email visibility follows collectEmails plus owner
// authority, matching the legacy endpoint. Each entry carries its opaque
// publicId and a server-proven canEdit for the calling visitor.
func postgresSignupResponses(ctx context.Context, repository *pgstore.Repository, event *pgstore.Event, value models.Event, visitor *postgresVisitor) (map[string]postgresSignupResponsePayload, error) {
	stored, err := repository.ListSignupResponses(ctx, event.ID)
	if err != nil {
		return nil, err
	}
	showEmails := visitor.owner && utils.Coalesce(value.CollectEmails)
	result := make(map[string]postgresSignupResponsePayload, len(stored))
	for _, response := range stored {
		model := &models.SignUpResponse{Name: response.Name, Email: response.Email}
		storedKey := response.Name
		if response.RespondentKind == pgstore.RespondentKindAccount && response.AccountUserID != nil {
			objectID, err := primitive.ObjectIDFromHex(*response.AccountUserID)
			if err != nil {
				continue
			}
			model.UserId = objectID
			storedKey = *response.AccountUserID
		} else if response.CanonicalGuestName != nil {
			storedKey = *response.CanonicalGuestName
		}
		lookupKey, keep := populateSignUpResponsePayloadIdentity(model, storedKey)
		if !keep || !shouldExposeGuestSignUpResponsePayload(lookupKey, model) {
			continue
		}
		authorized, err := visitor.controls(ctx, repository, response.EventVisitorIdentityID)
		if err != nil {
			return nil, err
		}
		payload := postgresSignupResponsePayload{
			SignUpBlockIDs: response.BlockIDs,
			Name:           model.Name,
			Email:          model.Email,
			User:           model.User,
			PublicID:       response.PublicID,
			CanEdit:        authorized && !event.IsArchived,
		}
		if model.UserId != primitive.NilObjectID {
			payload.UserID = model.UserId.Hex()
		}
		stripSensitiveUserFields(payload.User)
		if !showEmails {
			payload.Email = ""
			if payload.User != nil {
				payload.User.Email = ""
			}
		}
		result[lookupKey] = payload
	}
	return result, nil
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
	if event.Type == pgstore.EventTypeSignup {
		value, err := postgresEventModel(event)
		if err != nil {
			c.JSON(http.StatusInternalServerError, responses.Error{Error: "failed-to-serialize-event"})
			return
		}
		blocks, err := repository.ListSignupBlocks(c.Request.Context(), event.ID)
		if err != nil {
			c.JSON(http.StatusInternalServerError, responses.Error{Error: "failed-to-load-signup-blocks"})
			return
		}
		blockPayloads := make([]postgresSignupBlock, 0, len(blocks))
		for _, block := range blocks {
			blockPayloads = append(blockPayloads, postgresSignupBlockPayload(block))
		}
		payload["signUpBlocks"] = blockPayloads
		signupResponses, err := postgresSignupResponses(c.Request.Context(), repository, event, value, visitor)
		if err != nil {
			c.JSON(http.StatusInternalServerError, responses.Error{Error: "failed-to-load-signup-responses"})
			return
		}
		payload["signUpResponses"] = signupResponses
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
	var raw map[string]json.RawMessage
	if err := json.Unmarshal(body, &raw); err != nil {
		c.Status(http.StatusBadRequest)
		return
	}
	// Extract signup blocks before binding: PostgreSQL block identities are UUID
	// strings that cannot decode into models.SignUpBlock.Id (a MongoDB ObjectID).
	var signupBlocks []postgresSignupBlockInput
	signupBlocksPresent := false
	if rawBlocks, present := raw["signUpBlocks"]; present {
		signupBlocksPresent = true
		if err := json.Unmarshal(rawBlocks, &signupBlocks); err != nil {
			c.Status(http.StatusBadRequest)
			return
		}
		delete(raw, "signUpBlocks")
		if body, err = json.Marshal(raw); err != nil {
			c.Status(http.StatusBadRequest)
			return
		}
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
		update.SignUpBlocks = nil
		// Lifecycle state is changed only through the dedicated owner actions.
		update.IsArchived, update.IsDeleted = nil, nil
		isSignup := event.Type == pgstore.EventTypeSignup
		eventType := string(update.Type)
		if isSignup {
			update.Type, update.IsSignUpForm = models.SPECIFIC_DATES, utils.TruePtr()
			eventType = pgstore.EventTypeSignup
		}
		payload, err := json.Marshal(update)
		if err != nil {
			return err
		}
		event.Name, event.Type, event.Payload, event.ScheduleVersion = update.Name, eventType, payload, 1
		if err := tx.UpdateEvent(ctx, event); err != nil {
			return err
		}
		if isSignup {
			// An omitted signUpBlocks preserves the existing block set, matching
			// legacy BSON omitempty behavior; only an explicit list replaces it.
			if signupBlocksPresent {
				if _, err := tx.ReplaceSignupBlocks(ctx, event.ID, postgresSignupBlocksFromInput(signupBlocks)); err != nil {
					return err
				}
			}
		}
		return nil
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
	SignUpBlockIDs []string             `json:"signUpBlockIds"`
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
	if event.Type == pgstore.EventTypeSignup {
		postgresMutateSignupResponse(c, repository, event, visitor, input, operation)
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

// postgresMutateSignupResponse applies the explicit-selection contract to a
// signup event. A create carries createResponse=true and is owned by the
// calling Event Visitor Identity; every edit, rename, and deletion carries the
// target opaque responseId and is authorized by proven visitor control or an
// associated account, never by a client-supplied name. Capacity and duplicate
// names are enforced by the repository under the event row lock.
func postgresMutateSignupResponse(c *gin.Context, repository *pgstore.Repository, event *pgstore.Event, visitor *postgresVisitor, input postgresResponseInput, operation string) {
	publicID := input.ResponseID
	err := repository.WithTransaction(c.Request.Context(), func(ctx context.Context, tx *pgstore.Repository) error {
		locked, err := tx.LockEvent(ctx, event.ID)
		if err != nil {
			return err
		}
		if err := postgresWritableEvent(locked); err != nil {
			return err
		}
		stored := &pgstore.SignupResponse{EventID: event.ID, EventVisitorIdentityID: visitor.identity.ID}
		if input.CreateResponse {
			if !visitor.authorized {
				return guestForbidden{"visitor-credential-required"}
			}
		} else {
			stored, err = tx.GetSignupResponseByPublicID(ctx, event.ID, input.ResponseID)
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
		}
		if operation == "delete" {
			return tx.DeleteSignupResponse(ctx, event.ID, stored.PublicID)
		}
		if operation == "rename" {
			validated := respondents.ValidateGuestName(input.NewName)
			if validated.Code != respondents.GuestNameValid {
				return guestNameError{guestNameValidationErrorMessage(validated.Code)}
			}
			if stored.RespondentKind == pgstore.RespondentKindAccount {
				stored.Name = validated.Name
				return tx.UpdateSignupResponse(ctx, stored)
			}
			stored.RespondentKind = pgstore.RespondentKindGuest
			stored.AccountUserID = nil
			stored.Name = validated.Name
			stored.CanonicalGuestName = &validated.Name
			return tx.UpdateSignupResponse(ctx, stored)
		}
		stored.BlockIDs = input.SignUpBlockIDs
		stored.Email = input.Email
		if input.CreateResponse {
			if visitor.externalUserID != "" {
				accountUserID := visitor.externalUserID
				stored.RespondentKind = pgstore.RespondentKindAccount
				stored.AccountUserID = &accountUserID
				stored.CanonicalGuestName = nil
			} else {
				name := canonicalSignupResponseName(input.Name, stored)
				if name == "" {
					return guestNameError{guestNameValidationErrorMessage(respondents.GuestNameRequired)}
				}
				stored.RespondentKind = pgstore.RespondentKindGuest
				stored.AccountUserID = nil
				stored.Name = name
				stored.CanonicalGuestName = &name
			}
			if err := tx.CreateSignupResponse(ctx, stored); err != nil {
				return err
			}
			publicID = stored.PublicID
			return nil
		}
		switch stored.RespondentKind {
		case pgstore.RespondentKindAccount:
			if stored.AccountUserID == nil || *stored.AccountUserID == "" {
				accountUserID := visitor.externalUserID
				stored.AccountUserID = &accountUserID
			}
			stored.CanonicalGuestName = nil
		default:
			stored.RespondentKind = pgstore.RespondentKindGuest
			stored.AccountUserID = nil
			name := canonicalSignupResponseName(input.Name, stored)
			if name == "" {
				return guestNameError{guestNameValidationErrorMessage(respondents.GuestNameRequired)}
			}
			stored.Name = name
			stored.CanonicalGuestName = &name
		}
		return tx.UpdateSignupResponse(ctx, stored)
	})
	if err != nil {
		postgresMutationError(c, err)
		return
	}
	c.JSON(http.StatusOK, gin.H{"responseId": publicID, "eventVisitorId": visitor.identity.PublicID})
}

// canonicalSignupResponseName resolves the guest name for a signup mutation,
// preferring the supplied name and falling back to the stored canonical name so
// an explicit-selection edit can omit the unchanged name.
func canonicalSignupResponseName(supplied string, stored *pgstore.SignupResponse) string {
	if name := canonicalGuestName(supplied); name != "" {
		return name
	}
	if stored == nil {
		return ""
	}
	if stored.CanonicalGuestName != nil {
		return *stored.CanonicalGuestName
	}
	return canonicalGuestName(stored.Name)
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
	if errors.Is(err, pgstore.ErrSignupBlockNotFound) {
		c.JSON(http.StatusBadRequest, responses.Error{Error: "signup-block-not-found"})
		return
	}
	if errors.Is(err, pgstore.ErrSignupCapacityExceeded) {
		c.JSON(http.StatusConflict, responses.Error{Error: "signup-slot-full"})
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
	if json.Unmarshal(body, &payload) != nil {
		return false
	}
	if payload.IsSignUpForm {
		return true
	}
	if payload.Type != models.SPECIFIC_DATES && payload.Type != models.DOW {
		return false
	}
	return payload.DaysOnly || (len(payload.ActiveSlots) > 0 && len(payload.SlotGeneration) > 0 && len(payload.TimedRecurrence) > 0)
}

func postgresCreateEvent(c *gin.Context) {
	var event models.Event
	if err := c.Bind(&event); err != nil {
		return
	}
	isSignup := event.IsSignUpForm != nil && *event.IsSignUpForm
	if event.Name == "" || (!isSignup && event.Type != models.SPECIFIC_DATES && event.Type != models.DOW) {
		c.Status(http.StatusBadRequest)
		return
	}
	if isSignup {
		// Signup forms are not timed polls; their block schedule is the contract.
		event.Type = models.SPECIFIC_DATES
		event.IsSignUpForm = utils.TruePtr()
	} else if event.DaysOnly == nil || !*event.DaysOnly {
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
	var initialBlocks []models.SignUpBlock
	if isSignup && event.SignUpBlocks != nil {
		initialBlocks = *event.SignUpBlocks
	}
	// Blocks own their own table; the payload must not carry a second copy.
	event.SignUpBlocks = nil
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
	eventType := string(event.Type)
	if isSignup {
		eventType = pgstore.EventTypeSignup
	}
	stored := &pgstore.Event{Name: event.Name, Type: eventType, ScheduleVersion: 1, CreatorPosthogID: event.CreatorPosthogId, Payload: encoded}
	if signedIn {
		stored.OwnerExternalID = &externalUserID
	}
	var visitor *pgstore.EventVisitorIdentity
	var credential, ownerToken string
	err = repository.WithTransaction(c.Request.Context(), func(ctx context.Context, tx *pgstore.Repository) error {
		if err := tx.CreateEvent(ctx, stored); err != nil {
			return err
		}
		if isSignup && len(initialBlocks) > 0 {
			if _, err := tx.ReplaceSignupBlocks(ctx, stored.ID, postgresSignupBlocksFromModels(initialBlocks)); err != nil {
				return err
			}
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
	c.JSON(http.StatusCreated, gin.H{"eventId": stored.ShortID, "shortId": stored.ShortID, "eventVisitorId": visitor.PublicID})
}

package main

import (
	"context"
	"encoding/json"
	"errors"
	"fmt"
	"strings"
	"time"

	"github.com/jackc/pgx/v5"
	"go.mongodb.org/mongo-driver/bson"
	"go.mongodb.org/mongo-driver/bson/primitive"
	"go.mongodb.org/mongo-driver/mongo/options"

	"timeful/server/models"
	pgstore "timeful/server/postgres"
	"timeful/server/respondents"
)

// quarantineRecord is one ambiguous or corrupt source record that must be
// reported without being repaired by inference.
type quarantineRecord struct {
	kind          string
	legacyID      string
	eventLegacyID string
	reason        string
	detail        string
}

// unitResponse is one prepared PostgreSQL response row.
type unitResponse struct {
	legacyID           string
	respondentKind     string
	accountUserID      *string
	accountExternalID  string
	guestID            *string
	canonicalGuestName *string
	guestEditPolicy    *string
	guestOwnershipMode *string
	payload            []byte
	createdAt          time.Time
}

// unitSignupBlock is one prepared signup block.
type unitSignupBlock struct {
	legacyID  string
	name      string
	capacity  *int
	startDate *time.Time
	endDate   *time.Time
	position  int
}

// unitSignupResponse is one prepared signup response.
type unitSignupResponse struct {
	legacyID           string
	respondentKind     string
	accountUserID      *string
	accountExternalID  string
	canonicalGuestName *string
	name               string
	email              string
	blockLegacyIDs     []string
}

// unitAttendee is one prepared group membership.
type unitAttendee struct {
	legacyID string
	email    string
	declined *bool
}

// unitEvent is one complete event aggregate prepared for migration.
type unitEvent struct {
	legacyID                 string
	kind                     string
	name                     string
	ownerExternalID          string
	ownerPlatformIdentityID  string
	ownerExternalIDIsPresent bool
	isArchived               bool
	isDeleted                bool
	numResponses             int
	scheduleVersion          int
	creatorPosthogID         *string
	payload                  []byte
	createdAt                time.Time
	updatedAt                time.Time
	responses                []unitResponse
	blocks                   []unitSignupBlock
	signupResponses          []unitSignupResponse
	attendees                []unitAttendee
	quarantine               []quarantineRecord
}

// migrateEvents pages the legacy events collection in _id order and migrates
// each aggregate atomically. The cursor advances only after a unit commits, so
// interruption resumes from the first incomplete event. complete is false when
// the run stopped early at --limit and folders must wait for the next run.
func (m *migrator) migrateEvents(ctx context.Context, config configuration) (migrationSummary, bool, error) {
	collection := m.database.Collection("events")
	summary := migrationSummary{}
	var lastID primitive.ObjectID
	hasCursor := false
	for {
		cursor, err := collection.Find(ctx, pageFilter(lastID, hasCursor), options.Find().SetSort(bson.M{"_id": 1}).SetLimit(config.batchSize))
		if err != nil {
			return summary, false, err
		}
		events := make([]models.Event, 0, config.batchSize)
		if err := cursor.All(ctx, &events); err != nil {
			cursor.Close(ctx)
			return summary, false, err
		}
		cursor.Close(ctx)
		if len(events) == 0 {
			break
		}
		for index := range events {
			event := events[index]
			summary.Scanned++
			legacyID := event.Id.Hex()
			if _, completed, err := m.completedUnit(ctx, ledgerKindEvent, legacyID); err != nil {
				return summary, false, err
			} else if completed {
				summary.Skipped++
				lastID = event.Id
				hasCursor = true
				continue
			}
			unit, err := m.buildEventUnit(ctx, event)
			if err != nil {
				return summary, false, fmt.Errorf("build event %s: %w", legacyID, err)
			}
			summary.Quarantined += len(unit.quarantine)
			if m.apply {
				if err := m.persistEventUnit(ctx, &unit); err != nil {
					return summary, false, fmt.Errorf("persist event %s: %w", legacyID, err)
				}
			}
			summary.Migrated++
			lastID = event.Id
			hasCursor = true
			if config.limit > 0 && summary.Migrated >= config.limit {
				return summary, false, nil
			}
		}
		if int64(len(events)) < config.batchSize {
			break
		}
	}
	return summary, true, nil
}

// buildEventUnit loads an event's dependent records and prepares every row
// without writing PostgreSQL so preflight and apply share one implementation.
func (m *migrator) buildEventUnit(ctx context.Context, event models.Event) (unitEvent, error) {
	unit := unitEvent{
		legacyID:         event.Id.Hex(),
		kind:             classifyEvent(event),
		name:             event.Name,
		isArchived:       boolValue(event.IsArchived),
		isDeleted:        boolValue(event.IsDeleted),
		scheduleVersion:  event.ScheduleVersion,
		creatorPosthogID: event.CreatorPosthogId,
		createdAt:        event.Id.Timestamp().UTC(),
	}
	if unit.scheduleVersion == 0 {
		unit.scheduleVersion = 1
	}
	unit.updatedAt = unit.createdAt

	payload, err := buildEventPayload(event)
	if err != nil {
		return unit, err
	}
	unit.payload = payload

	if err := m.prepareOwner(ctx, event, &unit); err != nil {
		return unit, err
	}

	if unit.kind == eventKindSignup {
		if err := m.prepareSignupData(event, &unit); err != nil {
			return unit, err
		}
		if event.NumResponses != nil {
			unit.numResponses = *event.NumResponses
		}
		return unit, nil
	}

	responses, err := m.loadEventResponses(ctx, event.Id)
	if err != nil {
		return unit, err
	}
	for index := range responses {
		m.prepareResponse(ctx, event.Id, responses[index], &unit)
	}
	unit.numResponses = len(unit.responses)

	if unit.kind == eventKindGroup {
		attendees, err := m.loadAttendees(ctx, event.Id)
		if err != nil {
			return unit, err
		}
		for index := range attendees {
			unit.attendees = append(unit.attendees, unitAttendee{
				legacyID: attendees[index].Id.Hex(),
				email:    attendees[index].Email,
				declined: attendees[index].Declined,
			})
		}
	}
	return unit, nil
}

func (m *migrator) prepareOwner(ctx context.Context, event models.Event, unit *unitEvent) error {
	if event.OwnerId.IsZero() {
		return nil
	}
	externalUserID := event.OwnerId.Hex()
	if !m.userExists(ctx, event.OwnerId) {
		unit.quarantine = append(unit.quarantine, quarantineRecord{
			kind:          ledgerKindEvent,
			legacyID:      unit.legacyID,
			eventLegacyID: unit.legacyID,
			reason:        reasonMissingOwnerAccount,
			detail:        "ownerId " + externalUserID + " has no MongoDB user",
		})
		return nil
	}
	unit.ownerExternalID = externalUserID
	unit.ownerExternalIDIsPresent = true
	return nil
}

// prepareResponse classifies one legacy response as an account or guest record,
// quarantining credentials and corrupt identity without inventing authority.
func (m *migrator) prepareResponse(ctx context.Context, eventID primitive.ObjectID, stored models.EventResponse, unit *unitEvent) {
	if stored.Response == nil {
		m.appendQuarantine(unit, ledgerKindQuarantineItem, stored.Id.Hex(), reasonMissingResponseIdentity, "response has no payload")
		return
	}
	response := *stored.Response
	accountID, isAccount := respondents.ResolveStoredUserID(response.UserId, stored.UserId)
	if isAccount {
		accountUserID := accountID.Hex()
		payload := response
		payload.UserId = primitive.NilObjectID
		payload.User = nil
		payload.GuestEditToken = ""
		if strings.TrimSpace(payload.Name) == "" {
			payload.Name = m.accountDisplayName(ctx, accountID)
		}
		encoded, err := json.Marshal(payload)
		if err != nil {
			m.appendQuarantine(unit, ledgerKindQuarantineItem, stored.Id.Hex(), reasonMissingResponseIdentity, err.Error())
			return
		}
		unit.responses = append(unit.responses, unitResponse{
			legacyID:          stored.Id.Hex(),
			respondentKind:    respondentKindAccount,
			accountUserID:     &accountUserID,
			accountExternalID: accountUserID,
			payload:           encoded,
			createdAt:         stored.Id.Timestamp().UTC(),
		})
		return
	}

	hasGuestSignal := strings.TrimSpace(response.Name) != "" || response.GuestId != "" || response.GuestEditToken != "" ||
		response.GuestOwnershipMode != "" || response.GuestEditPolicy != ""
	if !hasGuestSignal {
		m.appendQuarantine(unit, ledgerKindQuarantineItem, stored.Id.Hex(), reasonMissingResponseIdentity, "response has neither an account nor a guest identity")
		return
	}

	validated := respondents.ValidateGuestName(response.Name)
	if validated.Code != respondents.GuestNameValid {
		m.appendQuarantine(unit, ledgerKindQuarantineItem, stored.Id.Hex(), reasonInvalidGuestName, string(validated.Code))
		return
	}
	if response.GuestEditToken != "" {
		m.appendQuarantine(unit, ledgerKindQuarantineItem, stored.Id.Hex(), reasonLegacyGuestCredential, "legacy guestEditToken is not imported as authority")
	}
	if response.GuestOwnershipMode == "token" && (response.GuestId == "" || response.GuestEditToken == "") {
		m.appendQuarantine(unit, ledgerKindQuarantineItem, stored.Id.Hex(), reasonIncompleteTokenOwner, "token ownership is missing guestId or guestEditToken")
	}
	payload := response
	payload.UserId = primitive.NilObjectID
	payload.User = nil
	payload.GuestEditToken = ""
	payload.Name = validated.Name
	encoded, err := json.Marshal(payload)
	if err != nil {
		m.appendQuarantine(unit, ledgerKindQuarantineItem, stored.Id.Hex(), reasonMissingResponseIdentity, err.Error())
		return
	}
	unit.responses = append(unit.responses, unitResponse{
		legacyID:           stored.Id.Hex(),
		respondentKind:     respondentKindGuest,
		guestID:            optionalString(response.GuestId),
		canonicalGuestName: &validated.Name,
		guestEditPolicy:    optionalString(response.GuestEditPolicy),
		guestOwnershipMode: optionalString(response.GuestOwnershipMode),
		payload:            encoded,
		createdAt:          stored.Id.Timestamp().UTC(),
	})
}

func (m *migrator) prepareSignupData(event models.Event, unit *unitEvent) error {
	blockIDs := map[string]bool{}
	if event.SignUpBlocks != nil {
		for index, block := range *event.SignUpBlocks {
			legacyID := block.Id.Hex()
			unit.blocks = append(unit.blocks, unitSignupBlock{
				legacyID:  legacyID,
				name:      block.Name,
				capacity:  block.Capacity,
				startDate: signupInstant(block.StartDate),
				endDate:   signupInstant(block.EndDate),
				position:  index + 1,
			})
			blockIDs[legacyID] = true
		}
	}
	for key, response := range event.SignUpResponses {
		if response == nil {
			m.appendQuarantine(unit, ledgerKindQuarantineItem, unit.legacyID+":"+key, reasonMissingResponseIdentity, "signup response has no payload")
			continue
		}
		blockLegacyIDs := make([]string, 0, len(response.SignUpBlockIds))
		for _, blockID := range response.SignUpBlockIds {
			hex := blockID.Hex()
			if !blockIDs[hex] {
				m.appendQuarantine(unit, ledgerKindQuarantineItem, unit.legacyID+":"+key, reasonOrphanMembership, "signup response references an absent block "+hex)
				continue
			}
			blockLegacyIDs = append(blockLegacyIDs, hex)
		}
		if accountID, ok := respondents.ResolveStoredUserID(response.UserId, key); ok {
			accountUserID := accountID.Hex()
			unit.signupResponses = append(unit.signupResponses, unitSignupResponse{
				legacyID:          unit.legacyID + ":" + key,
				respondentKind:    respondentKindAccount,
				accountUserID:     &accountUserID,
				accountExternalID: accountUserID,
				name:              response.Name,
				email:             response.Email,
				blockLegacyIDs:    blockLegacyIDs,
			})
			continue
		}
		name := response.Name
		if strings.TrimSpace(name) == "" {
			name = key
		}
		validated := respondents.ValidateGuestName(name)
		if validated.Code != respondents.GuestNameValid {
			m.appendQuarantine(unit, ledgerKindQuarantineItem, unit.legacyID+":"+key, reasonInvalidGuestName, string(validated.Code))
			continue
		}
		canonical := validated.Name
		unit.signupResponses = append(unit.signupResponses, unitSignupResponse{
			legacyID:           unit.legacyID + ":" + key,
			respondentKind:     respondentKindGuest,
			canonicalGuestName: &canonical,
			name:               canonical,
			email:              response.Email,
			blockLegacyIDs:     blockLegacyIDs,
		})
	}
	return nil
}

func (m *migrator) persistEventUnit(ctx context.Context, unit *unitEvent) error {
	tx, err := m.pool.Begin(ctx)
	if err != nil {
		return err
	}
	defer tx.Rollback(ctx) // A successful commit makes this a no-op.

	for _, record := range unit.quarantine {
		if err := m.recordQuarantine(ctx, tx, record.kind, record.legacyID, record.eventLegacyID, record.reason, record.detail); err != nil {
			return err
		}
	}

	if unit.ownerExternalIDIsPresent {
		platformID, err := ensurePlatformIdentity(ctx, tx, unit.ownerExternalID)
		if err != nil && !errors.Is(err, errAccountDeleted) {
			return err
		}
		if err == nil {
			unit.ownerPlatformIdentityID = platformID
		}
	}

	eventID, _, err := insertMigratedEvent(ctx, tx, unit)
	if err != nil {
		return err
	}

	for index := range unit.responses {
		if err := insertMigratedResponse(ctx, tx, eventID, &unit.responses[index]); err != nil {
			return err
		}
	}

	blockIDMap := map[string]string{}
	for index := range unit.blocks {
		newID, err := insertMigratedSignupBlock(ctx, tx, eventID, unit.blocks[index])
		if err != nil {
			return err
		}
		blockIDMap[unit.blocks[index].legacyID] = newID
	}
	for index := range unit.signupResponses {
		if err := insertMigratedSignupResponse(ctx, tx, eventID, blockIDMap, &unit.signupResponses[index]); err != nil {
			return err
		}
	}

	for index := range unit.attendees {
		if err := insertMigratedAttendee(ctx, tx, eventID, unit.attendees[index]); err != nil {
			return err
		}
	}

	if err := m.recordLedger(ctx, tx, ledgerKindEvent, unit.legacyID, eventID); err != nil {
		return err
	}
	return tx.Commit(ctx)
}

func insertMigratedEvent(ctx context.Context, tx pgx.Tx, unit *unitEvent) (string, string, error) {
	for attempt := 0; attempt < 10; attempt++ {
		shortID, err := pgstore.GenerateEventShortID()
		if err != nil {
			return "", "", err
		}
		var id string
		var ownerExternalID *string
		if unit.ownerExternalIDIsPresent {
			value := unit.ownerExternalID
			ownerExternalID = &value
		}
		var ownerPlatformIdentityID *string
		if unit.ownerPlatformIdentityID != "" {
			value := unit.ownerPlatformIdentityID
			ownerPlatformIdentityID = &value
		}
		err = tx.QueryRow(ctx, `INSERT INTO postgres_events
 (short_id, owner_external_id, owner_platform_identity_id, name, type, is_archived, is_deleted, num_responses, schedule_version, creator_posthog_id, payload, created_at, updated_at)
VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13)
RETURNING id`,
			shortID, ownerExternalID, ownerPlatformIdentityID, unit.name, unit.kind, unit.isArchived, unit.isDeleted, unit.numResponses, unit.scheduleVersion, unit.creatorPosthogID, unit.payload, unit.createdAt, unit.updatedAt).Scan(&id)
		if err == nil {
			return id, shortID, nil
		}
		if !isUniqueViolation(err) {
			return "", "", err
		}
	}
	return "", "", errors.New("generate unique PostgreSQL event identifier")
}

func insertMigratedResponse(ctx context.Context, tx pgx.Tx, eventID string, response *unitResponse) error {
	visitorID, err := ensureEventVisitorIdentity(ctx, tx, eventID, response.accountExternalID)
	if err != nil {
		return err
	}
	_, err = tx.Exec(ctx, `INSERT INTO postgres_event_responses
 (event_id, event_visitor_identity_id, respondent_kind, account_user_id, guest_id, canonical_guest_name, guest_edit_policy, guest_ownership_mode, payload, created_at, updated_at)
VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $10)`,
		eventID, visitorID, response.respondentKind, response.accountUserID, response.guestID, response.canonicalGuestName, response.guestEditPolicy, response.guestOwnershipMode, response.payload, response.createdAt)
	return err
}

func insertMigratedSignupBlock(ctx context.Context, tx pgx.Tx, eventID string, block unitSignupBlock) (string, error) {
	var id string
	err := tx.QueryRow(ctx, `INSERT INTO event_signup_blocks (event_id, name, capacity, start_date, end_date, position)
VALUES ($1, $2, $3, $4, $5, $6)
RETURNING id`, eventID, block.name, block.capacity, block.startDate, block.endDate, block.position).Scan(&id)
	return id, err
}

func insertMigratedSignupResponse(ctx context.Context, tx pgx.Tx, eventID string, blockIDMap map[string]string, response *unitSignupResponse) error {
	visitorID, err := ensureEventVisitorIdentity(ctx, tx, eventID, response.accountExternalID)
	if err != nil {
		return err
	}
	blockIDs := make([]string, 0, len(response.blockLegacyIDs))
	for _, legacyID := range response.blockLegacyIDs {
		mapped, ok := blockIDMap[legacyID]
		if !ok {
			continue
		}
		blockIDs = append(blockIDs, mapped)
	}
	_, err = tx.Exec(ctx, `INSERT INTO event_signup_responses
 (event_id, event_visitor_identity_id, respondent_kind, account_user_id, canonical_guest_name, name, email, block_ids)
VALUES ($1, $2, $3, $4, $5, $6, $7, $8)`,
		eventID, visitorID, response.respondentKind, response.accountUserID, response.canonicalGuestName, response.name, response.email, blockIDs)
	return err
}

func insertMigratedAttendee(ctx context.Context, tx pgx.Tx, eventID string, attendee unitAttendee) error {
	var accountUserID *string
	if attendee.email != "" {
		var resolved string
		err := tx.QueryRow(ctx, `SELECT p.external_user_id
FROM accounts a JOIN platform_identities p ON p.id = a.platform_identity_id
WHERE lower(a.email) = lower($1)
ORDER BY a.created_at, a.id LIMIT 1`, attendee.email).Scan(&resolved)
		if err == nil {
			accountUserID = &resolved
		} else if !isNoRows(err) {
			return err
		}
	}
	_, err := tx.Exec(ctx, `INSERT INTO event_attendees (event_id, email, account_user_id, declined)
VALUES ($1, $2, $3, $4)
ON CONFLICT (event_id, email) DO UPDATE
SET account_user_id = COALESCE(event_attendees.account_user_id, EXCLUDED.account_user_id), updated_at = clock_timestamp()`,
		eventID, attendee.email, accountUserID, attendee.declined)
	return err
}

// ensureEventVisitorIdentity inserts a fresh Event Visitor Identity for one
// migrated response. An account response associates the identity with the
// account platform identity so the account controls its migrated response; a
// guest response stays unassociated and receives no credential.
func ensureEventVisitorIdentity(ctx context.Context, tx pgx.Tx, eventID, accountExternalID string) (string, error) {
	var platformID *string
	if accountExternalID != "" {
		id, err := ensurePlatformIdentity(ctx, tx, accountExternalID)
		if err != nil && !errors.Is(err, errAccountDeleted) {
			return "", err
		}
		if err == nil {
			platformID = &id
		}
	}
	var visitorID string
	if err := tx.QueryRow(ctx, `INSERT INTO event_visitor_identities (event_id, platform_identity_id) VALUES ($1, $2) RETURNING id`, eventID, platformID).Scan(&visitorID); err != nil {
		return "", err
	}
	return visitorID, nil
}

func (m *migrator) appendQuarantine(unit *unitEvent, kind, legacyID, reason, detail string) {
	unit.quarantine = append(unit.quarantine, quarantineRecord{
		kind:          kind,
		legacyID:      legacyID,
		eventLegacyID: unit.legacyID,
		reason:        reason,
		detail:        detail,
	})
}

func (m *migrator) loadEventResponses(ctx context.Context, eventID primitive.ObjectID) ([]models.EventResponse, error) {
	cursor, err := m.database.Collection("eventResponses").Find(ctx, bson.M{"eventId": eventID})
	if err != nil {
		return nil, err
	}
	defer cursor.Close(ctx)
	var responses []models.EventResponse
	if err := cursor.All(ctx, &responses); err != nil {
		return nil, err
	}
	return responses, nil
}

func (m *migrator) loadAttendees(ctx context.Context, eventID primitive.ObjectID) ([]models.Attendee, error) {
	cursor, err := m.database.Collection("attendees").Find(ctx, bson.M{"eventId": eventID})
	if err != nil {
		return nil, err
	}
	defer cursor.Close(ctx)
	var attendees []models.Attendee
	if err := cursor.All(ctx, &attendees); err != nil {
		return nil, err
	}
	return attendees, nil
}

func (m *migrator) userExists(ctx context.Context, id primitive.ObjectID) bool {
	count, err := m.database.Collection("users").CountDocuments(ctx, bson.M{"_id": id}, options.Count().SetLimit(1))
	return err == nil && count > 0
}

func (m *migrator) accountDisplayName(ctx context.Context, id primitive.ObjectID) string {
	var user models.User
	if err := m.database.Collection("users").FindOne(ctx, bson.M{"_id": id}).Decode(&user); err != nil {
		return ""
	}
	name := strings.TrimSpace(strings.Join([]string{user.FirstName, user.LastName}, " "))
	if name == "" {
		return user.Email
	}
	return name
}

func classifyEvent(event models.Event) string {
	if event.IsSignUpForm != nil && *event.IsSignUpForm {
		return eventKindSignup
	}
	switch event.Type {
	case models.GROUP:
		return eventKindGroup
	case models.DOW:
		return eventKindDayOfWeek
	default:
		return eventKindSpecificDates
	}
}

// buildEventPayload serializes the event with identity and table-owned fields
// removed so the payload holds only compatibility state.
func buildEventPayload(event models.Event) ([]byte, error) {
	value := event
	value.Id = primitive.NilObjectID
	value.ShortId = nil
	value.OwnerId = primitive.NilObjectID
	value.NumResponses = nil
	value.ResponsesMap = nil
	value.Attendees = nil
	value.HasResponded = nil
	value.SignUpBlocks = nil
	value.SignUpResponses = nil
	return json.Marshal(value)
}

func signupInstant(value *primitive.DateTime) *time.Time {
	if value == nil {
		return nil
	}
	instant := value.Time().UTC()
	return &instant
}

func boolValue(value *bool) bool {
	return value != nil && *value
}

func optionalString(value string) *string {
	if value == "" {
		return nil
	}
	return &value
}

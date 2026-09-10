package main

import (
	"context"
	"os"
	"strings"
	"testing"
	"time"

	"github.com/jackc/pgx/v5/pgxpool"
	"go.mongodb.org/mongo-driver/bson"
	"go.mongodb.org/mongo-driver/bson/primitive"
	"go.mongodb.org/mongo-driver/mongo"
	"go.mongodb.org/mongo-driver/mongo/options"

	"timeful/server/models"
	pgstore "timeful/server/postgres"
)

func strPtr(value string) *string     { return &value }
func boolPtr(value bool) *bool        { return &value }
func intPtr(value int) *int           { return &value }
func floatPtr(value float32) *float32 { return &value }

func datetimePtr(unixMillis int64) *primitive.DateTime {
	value := primitive.NewDateTimeFromTime(time.UnixMilli(unixMillis).UTC())
	return &value
}

// newRehearsalContext connects to the isolated Mongo and PostgreSQL test
// databases and drops a per-test Mongo source database.
func newRehearsalContext(t *testing.T, suffix string) (context.Context, *mongo.Database, *pgxpool.Pool) {
	t.Helper()
	mongoURI := os.Getenv("MONGODB_URI")
	baseDatabase := os.Getenv("MONGODB_DATABASE")
	postgresURI := os.Getenv("POSTGRES_APPLICATION_URI")
	if mongoURI == "" || postgresURI == "" || baseDatabase == "" {
		t.Skip("MONGODB_URI, MONGODB_DATABASE, and POSTGRES_APPLICATION_URI are required")
	}
	if baseDatabase != "timeful-test" && !strings.HasPrefix(baseDatabase, "timeful-test-") {
		t.Fatalf("requires an isolated test database, got %q", baseDatabase)
	}
	if !strings.Contains(postgresURI, "timeful-test") {
		t.Fatalf("requires an isolated PostgreSQL test database")
	}

	ctx := context.Background()
	mongoClient, err := mongo.Connect(ctx, options.Client().ApplyURI(mongoURI))
	if err != nil {
		t.Fatal(err)
	}
	t.Cleanup(func() { _ = mongoClient.Disconnect(ctx) })

	pool, err := pgxpool.New(ctx, postgresURI)
	if err != nil {
		t.Fatal(err)
	}
	t.Cleanup(pool.Close)

	database := mongoClient.Database(baseDatabase + "_event_backfill_" + suffix)
	if err := database.Drop(ctx); err != nil {
		t.Fatal(err)
	}
	t.Cleanup(func() { _ = database.Drop(ctx) })
	return ctx, database, pool
}

// insertDocument upserts a Mongo document keyed by its own _id field.
func insertDocument(t *testing.T, ctx context.Context, database *mongo.Database, collection string, document any) {
	t.Helper()
	raw, err := bson.Marshal(document)
	if err != nil {
		t.Fatal(err)
	}
	var fields bson.M
	if err := bson.Unmarshal(raw, &fields); err != nil {
		t.Fatal(err)
	}
	id, ok := fields["_id"]
	if !ok {
		t.Fatalf("%s document has no _id", collection)
	}
	if _, err := database.Collection(collection).ReplaceOne(ctx, bson.M{"_id": id}, document, options.Replace().SetUpsert(true)); err != nil {
		t.Fatal(err)
	}
}

func cleanupRehearsalBatch(t *testing.T, ctx context.Context, pool *pgxpool.Pool, batch string, externalIDs []string) {
	t.Helper()
	t.Cleanup(func() {
		cleanupCtx := context.Background()
		if _, err := pool.Exec(cleanupCtx, `DELETE FROM folders WHERE id IN (SELECT target_id::uuid FROM migration_ledger WHERE kind = 'folder' AND batch = $1)`, batch); err != nil {
			t.Errorf("cleanup folders: %v", err)
		}
		if _, err := pool.Exec(cleanupCtx, `DELETE FROM postgres_events WHERE id IN (SELECT target_id::uuid FROM migration_ledger WHERE kind = 'event' AND batch = $1)`, batch); err != nil {
			t.Errorf("cleanup events: %v", err)
		}
		if _, err := pool.Exec(cleanupCtx, `DELETE FROM migration_quarantine WHERE batch = $1`, batch); err != nil {
			t.Errorf("cleanup quarantine: %v", err)
		}
		if _, err := pool.Exec(cleanupCtx, `DELETE FROM migration_ledger WHERE batch = $1`, batch); err != nil {
			t.Errorf("cleanup ledger: %v", err)
		}
		if len(externalIDs) > 0 {
			if _, err := pool.Exec(cleanupCtx, `DELETE FROM accounts WHERE platform_identity_id IN (SELECT id FROM platform_identities WHERE external_user_id = ANY($1))`, externalIDs); err != nil {
				t.Errorf("cleanup accounts: %v", err)
			}
			if _, err := pool.Exec(cleanupCtx, `DELETE FROM platform_identities WHERE external_user_id = ANY($1)`, externalIDs); err != nil {
				t.Errorf("cleanup identities: %v", err)
			}
		}
	})
}

// rehearsalFixtures is the representative fixture set from the migration
// contract, including one record for each quarantine path.
type rehearsalFixtures struct {
	eventIDs    []string
	folderIDs   []string
	externalIDs []string

	ownerA     primitive.ObjectID
	ownerB     primitive.ObjectID
	anonTimed  primitive.ObjectID
	authTimed  primitive.ObjectID
	groupEvent primitive.ObjectID
	signup     primitive.ObjectID
	orphanID   primitive.ObjectID
}

func seedRehearsalFixtures(t *testing.T, ctx context.Context, database *mongo.Database, pool *pgxpool.Pool) rehearsalFixtures {
	t.Helper()
	fixtures := rehearsalFixtures{
		ownerA:     primitive.NewObjectID(),
		ownerB:     primitive.NewObjectID(),
		anonTimed:  primitive.NewObjectID(),
		authTimed:  primitive.NewObjectID(),
		groupEvent: primitive.NewObjectID(),
		signup:     primitive.NewObjectID(),
		orphanID:   primitive.NewObjectID(),
	}
	anonDatesOnly := primitive.NewObjectID()
	dowEvent := primitive.NewObjectID()
	missingOwnerEvent := primitive.NewObjectID()
	folderID := primitive.NewObjectID()
	folderEventA := primitive.NewObjectID()
	folderEventB := primitive.NewObjectID()
	orphanFolderEvent := primitive.NewObjectID()
	orphanResponseID := primitive.NewObjectID()

	fixtures.externalIDs = []string{fixtures.ownerA.Hex(), fixtures.ownerB.Hex()}

	// The retained calendar-integration account keeps tokens in MongoDB and
	// resolves its PostgreSQL account through the explicit mapping.
	insertDocument(t, ctx, database, "users", models.User{
		Id: fixtures.ownerA, Email: "owner@example.com", FirstName: "Owner", LastName: "Alpha",
		CalendarAccounts: map[string]models.CalendarAccount{
			"owner@example.com_google": {CalendarType: models.GoogleCalendarType, Email: "owner@example.com", Enabled: boolPtr(true)},
		},
		CalendarOptions: &models.CalendarOptions{WorkingHours: models.WorkingHoursOptions{Enabled: true}},
	})
	insertDocument(t, ctx, database, "users", models.User{
		Id: fixtures.ownerB, Email: "member@example.com", FirstName: "Member", LastName: "Beta",
	})

	blockOne := primitive.NewObjectID()
	blockTwo := primitive.NewObjectID()

	insertDocument(t, ctx, database, "events", models.Event{
		Id: fixtures.anonTimed, ShortId: strPtr("ANON0001"), Name: "Anonymous timed", Type: models.SPECIFIC_DATES,
		DaysOnly: boolPtr(false), NumResponses: intPtr(3),
		ActiveSlots:     []primitive.DateTime{primitive.NewDateTimeFromTime(time.UnixMilli(1_760_000_000_000).UTC())},
		EventTimezone:   strPtr("UTC"),
		SlotGeneration:  &models.SlotGeneration{StartTimeLocal: "09:00", EndTimeLocal: "17:00", TimeIncrementMinutes: 30},
		TimedRecurrence: &models.TimedRecurrence{Kind: "daily", SelectedDays: []string{"2026-01-05"}},
	})
	insertDocument(t, ctx, database, "events", models.Event{
		Id: anonDatesOnly, ShortId: strPtr("DATE0002"), Name: "Anonymous dates", Type: models.SPECIFIC_DATES,
		DaysOnly: boolPtr(true), NumResponses: intPtr(1),
		Dates: []primitive.DateTime{primitive.NewDateTimeFromTime(time.UnixMilli(1_760_000_000_000).UTC())},
	})
	insertDocument(t, ctx, database, "events", models.Event{
		Id: dowEvent, ShortId: strPtr("DOW00003"), Name: "Day of week", Type: models.DOW, NumResponses: intPtr(0),
	})
	insertDocument(t, ctx, database, "events", models.Event{
		Id: fixtures.authTimed, ShortId: strPtr("AUTH0004"), OwnerId: fixtures.ownerA, Name: "Authenticated timed", Type: models.SPECIFIC_DATES,
		DaysOnly: boolPtr(false), NumResponses: intPtr(1),
		ActiveSlots:     []primitive.DateTime{primitive.NewDateTimeFromTime(time.UnixMilli(1_760_000_000_000).UTC())},
		EventTimezone:   strPtr("UTC"),
		SlotGeneration:  &models.SlotGeneration{StartTimeLocal: "09:00", EndTimeLocal: "17:00", TimeIncrementMinutes: 30},
		TimedRecurrence: &models.TimedRecurrence{Kind: "daily", SelectedDays: []string{"2026-01-05"}},
	})
	insertDocument(t, ctx, database, "events", models.Event{
		Id: fixtures.groupEvent, ShortId: strPtr("GRP00005"), OwnerId: fixtures.ownerA, Name: "Availability group", Type: models.GROUP,
		Duration: floatPtr(2), NumResponses: intPtr(1),
	})
	insertDocument(t, ctx, database, "events", models.Event{
		Id: fixtures.signup, ShortId: strPtr("SGN00006"), Name: "Signup form", Type: models.SPECIFIC_DATES,
		IsSignUpForm: boolPtr(true),
		SignUpBlocks: &[]models.SignUpBlock{
			{Id: blockOne, Name: "Morning", Capacity: intPtr(1), StartDate: datetimePtr(1_767_000_000_000), EndDate: datetimePtr(1_767_003_600_000)},
			{Id: blockTwo, Name: "Afternoon"},
		},
		SignUpResponses: map[string]*models.SignUpResponse{
			fixtures.ownerB.Hex(): {SignUpBlockIds: []primitive.ObjectID{blockOne}, Email: "member@example.com", UserId: fixtures.ownerB},
			"Dana":                {SignUpBlockIds: []primitive.ObjectID{blockTwo}, Name: "Dana"},
		},
	})
	insertDocument(t, ctx, database, "events", models.Event{
		Id: missingOwnerEvent, ShortId: strPtr("NOWN0007"), OwnerId: primitive.NewObjectID(), Name: "Missing owner", Type: models.SPECIFIC_DATES,
		DaysOnly: boolPtr(true), Dates: []primitive.DateTime{primitive.NewDateTimeFromTime(time.UnixMilli(1_760_000_000_000).UTC())},
	})

	// Responses: protected and open guests, a legacy credential, an incomplete
	// token ownership record, an invalid guest name, an account response, and a
	// corrupt record with no identity.
	insertDocument(t, ctx, database, "eventResponses", models.EventResponse{
		Id: primitive.NewObjectID(), EventId: fixtures.anonTimed, UserId: "",
		Response: &models.Response{Name: "Ada", GuestId: "guest-ada", GuestEditToken: "secret-ada", GuestOwnershipMode: "token", GuestEditPolicy: "protected"},
	})
	insertDocument(t, ctx, database, "eventResponses", models.EventResponse{
		Id: primitive.NewObjectID(), EventId: fixtures.anonTimed, UserId: "",
		Response: &models.Response{Name: "Bob", GuestId: "guest-bob", GuestOwnershipMode: "legacy", GuestEditPolicy: "open"},
	})
	insertDocument(t, ctx, database, "eventResponses", models.EventResponse{
		Id: primitive.NewObjectID(), EventId: fixtures.anonTimed, UserId: "",
		Response: &models.Response{Name: "Eve", GuestId: "guest-eve", GuestOwnershipMode: "token"},
	})
	insertDocument(t, ctx, database, "eventResponses", models.EventResponse{
		Id: primitive.NewObjectID(), EventId: fixtures.anonTimed, UserId: "",
		Response: &models.Response{Name: "0123456789abcdef01234567"},
	})
	insertDocument(t, ctx, database, "eventResponses", models.EventResponse{
		Id: primitive.NewObjectID(), EventId: anonDatesOnly, UserId: "",
		Response: &models.Response{Name: "Cleo"},
	})
	insertDocument(t, ctx, database, "eventResponses", models.EventResponse{
		Id: primitive.NewObjectID(), EventId: anonDatesOnly, UserId: "", Response: &models.Response{},
	})
	insertDocument(t, ctx, database, "eventResponses", models.EventResponse{
		Id: primitive.NewObjectID(), EventId: fixtures.authTimed, UserId: fixtures.ownerB.Hex(),
		Response: &models.Response{Availability: []primitive.DateTime{primitive.NewDateTimeFromTime(time.UnixMilli(1_760_000_000_000).UTC())}},
	})
	insertDocument(t, ctx, database, "eventResponses", models.EventResponse{
		Id: primitive.NewObjectID(), EventId: fixtures.groupEvent, UserId: fixtures.ownerB.Hex(),
		Response: &models.Response{
			UseCalendarAvailability: boolPtr(true),
			EnabledCalendars:        &map[string][]string{"member@example.com_google": {"primary"}},
		},
	})
	insertDocument(t, ctx, database, "eventResponses", models.EventResponse{
		Id: orphanResponseID, EventId: fixtures.orphanID, UserId: "", Response: &models.Response{Name: "Ghost"},
	})

	insertDocument(t, ctx, database, "attendees", models.Attendee{Id: primitive.NewObjectID(), EventId: fixtures.groupEvent, Email: "member@example.com", Declined: boolPtr(false)})
	insertDocument(t, ctx, database, "attendees", models.Attendee{Id: primitive.NewObjectID(), EventId: fixtures.groupEvent, Email: "invited@example.com"})

	insertDocument(t, ctx, database, "folders", models.Folder{Id: folderID, UserId: fixtures.ownerA, Name: "Main"})
	insertDocument(t, ctx, database, "folderEvents", models.FolderEvent{Id: folderEventA, UserId: fixtures.ownerA, FolderId: folderID, EventId: fixtures.authTimed})
	insertDocument(t, ctx, database, "folderEvents", models.FolderEvent{Id: folderEventB, UserId: fixtures.ownerA, FolderId: folderID, EventId: dowEvent})
	insertDocument(t, ctx, database, "folderEvents", models.FolderEvent{Id: orphanFolderEvent, UserId: fixtures.ownerA, FolderId: folderID, EventId: fixtures.orphanID})

	fixtures.eventIDs = []string{fixtures.anonTimed.Hex(), anonDatesOnly.Hex(), dowEvent.Hex(), fixtures.authTimed.Hex(), fixtures.groupEvent.Hex(), fixtures.signup.Hex(), missingOwnerEvent.Hex()}
	fixtures.folderIDs = []string{folderID.Hex()}

	repository := pgstore.NewRepository(pool)
	if _, err := repository.FindOrCreateAccount(ctx, fixtures.ownerA.Hex(), pgstore.Account{Email: "owner@example.com", FirstName: "Owner", LastName: "Alpha"}); err != nil {
		t.Fatal(err)
	}
	if _, err := repository.FindOrCreateAccount(ctx, fixtures.ownerB.Hex(), pgstore.Account{Email: "member@example.com", FirstName: "Member", LastName: "Beta"}); err != nil {
		t.Fatal(err)
	}
	return fixtures
}

func TestMigrateEventsRehearsal(t *testing.T) {
	ctx, database, pool := newRehearsalContext(t, "rehearsal")
	const batch = "rehearsal-itest"
	fixtures := seedRehearsalFixtures(t, ctx, database, pool)
	cleanupRehearsalBatch(t, ctx, pool, batch, fixtures.externalIDs)

	migrate := &migrator{database: database, pool: pool, batch: batch, apply: true}
	config := configuration{apply: true, batchSize: 10}
	events, complete, err := migrate.migrateEvents(ctx, config)
	if err != nil {
		t.Fatal(err)
	}
	if !complete || events.Scanned != 7 || events.Migrated != 7 || events.Skipped != 0 {
		t.Fatalf("event run = %#v complete=%v", events, complete)
	}
	if events.Quarantined != 5 {
		t.Fatalf("event quarantine = %d, want 5", events.Quarantined)
	}
	folders, err := migrate.migrateFolders(ctx, config)
	if err != nil {
		t.Fatal(err)
	}
	if folders.Migrated != 1 || folders.Quarantined != 1 {
		t.Fatalf("folder run = %#v", folders)
	}
	orphans, err := migrate.scanOrphanResponses(ctx)
	if err != nil {
		t.Fatal(err)
	}
	if orphans.Quarantined != 1 {
		t.Fatalf("orphan responses = %d, want 1", orphans.Quarantined)
	}

	assertTargetCounts(t, ctx, pool, batch)
	assertOwnershipAndAccess(t, ctx, pool, fixtures, batch)
	assertNullableAndScheduleFields(t, ctx, pool, fixtures, batch)
	assertQuarantineBreakdown(t, ctx, pool, batch)
	assertSourceUntouched(t, ctx, database, fixtures)

	// A repeated run must skip every completed unit and write nothing new.
	replay := &migrator{database: database, pool: pool, batch: batch, apply: true}
	replayed, complete, err := replay.migrateEvents(ctx, config)
	if err != nil {
		t.Fatal(err)
	}
	if !complete || replayed.Migrated != 0 || replayed.Skipped != 7 {
		t.Fatalf("replay event run = %#v", replayed)
	}
	replayedFolders, err := replay.migrateFolders(ctx, config)
	if err != nil {
		t.Fatal(err)
	}
	if replayedFolders.Migrated != 0 || replayedFolders.Skipped != 1 {
		t.Fatalf("replay folder run = %#v", replayedFolders)
	}
	assertTargetCounts(t, ctx, pool, batch)

	report, err := migrate.reconcile(ctx)
	if err != nil {
		t.Fatal(err)
	}
	if len(report.Mismatches) != 0 {
		t.Fatalf("reconciliation mismatches: %v", report.Mismatches)
	}
	if report.Events != 7 || report.Responses != 6 || report.SignupBlocks != 2 || report.SignupResponses != 2 || report.Attendees != 2 || report.Folders != 1 || report.Memberships != 2 {
		t.Fatalf("reconciliation counts = %#v", report)
	}
}

func TestMigrateEventsResumesAfterInterruption(t *testing.T) {
	ctx, database, pool := newRehearsalContext(t, "resume")
	const batch = "resume-itest"
	owner := primitive.NewObjectID()
	first := primitive.NewObjectID()
	second := primitive.NewObjectID()
	third := primitive.NewObjectID()
	folderID := primitive.NewObjectID()
	folderEventID := primitive.NewObjectID()
	for index, id := range []primitive.ObjectID{first, second, third} {
		insertDocument(t, ctx, database, "events", models.Event{
			Id: id, ShortId: strPtr("RESUME" + string(rune('A'+index))), OwnerId: owner, Name: "Resume", Type: models.SPECIFIC_DATES,
			DaysOnly: boolPtr(true), Dates: []primitive.DateTime{primitive.NewDateTimeFromTime(time.UnixMilli(1_760_000_000_000).UTC())},
		})
	}
	insertDocument(t, ctx, database, "users", models.User{Id: owner, Email: "resume@example.com", FirstName: "Resume"})
	insertDocument(t, ctx, database, "folders", models.Folder{Id: folderID, UserId: owner, Name: "Resume folder"})
	insertDocument(t, ctx, database, "folderEvents", models.FolderEvent{Id: folderEventID, UserId: owner, FolderId: folderID, EventId: second})
	cleanupRehearsalBatch(t, ctx, pool, batch, []string{owner.Hex()})

	migrate := &migrator{database: database, pool: pool, batch: batch, apply: true}
	partial, complete, err := migrate.migrateEvents(ctx, configuration{apply: true, batchSize: 10, limit: 1})
	if err != nil {
		t.Fatal(err)
	}
	if complete || partial.Migrated != 1 {
		t.Fatalf("limited run = %#v complete=%v", partial, complete)
	}
	if _, found, err := migrate.completedUnit(ctx, ledgerKindFolder, folderID.Hex()); err != nil || found {
		t.Fatalf("folder must wait for a complete event run: found=%v err=%v", found, err)
	}

	resumed, complete, err := migrate.migrateEvents(ctx, configuration{apply: true, batchSize: 10})
	if err != nil {
		t.Fatal(err)
	}
	if !complete || resumed.Migrated != 2 || resumed.Skipped != 1 {
		t.Fatalf("resumed run = %#v complete=%v", resumed, complete)
	}
	folders, err := migrate.migrateFolders(ctx, configuration{apply: true, batchSize: 10})
	if err != nil {
		t.Fatal(err)
	}
	if folders.Migrated != 1 || folders.Skipped != 0 {
		t.Fatalf("folder run = %#v", folders)
	}
	report, err := migrate.reconcile(ctx)
	if err != nil {
		t.Fatal(err)
	}
	if len(report.Mismatches) != 0 {
		t.Fatalf("reconciliation mismatches: %v", report.Mismatches)
	}
	if report.Events != 3 || report.Folders != 1 || report.Memberships != 1 {
		t.Fatalf("reconciliation counts = %#v", report)
	}
}

func assertTargetCounts(t *testing.T, ctx context.Context, pool *pgxpool.Pool, batch string) {
	t.Helper()
	counts := map[string]int{
		"postgres_events":          queryCount(t, ctx, pool, `SELECT count(*) FROM postgres_events e JOIN migration_ledger l ON l.kind = 'event' AND l.target_id::uuid = e.id WHERE l.batch = $1`, batch),
		"postgres_event_responses": queryCount(t, ctx, pool, `SELECT count(*) FROM postgres_event_responses r JOIN migration_ledger l ON l.kind = 'event' AND l.target_id::uuid = r.event_id WHERE l.batch = $1`, batch),
		"event_signup_blocks":      queryCount(t, ctx, pool, `SELECT count(*) FROM event_signup_blocks b JOIN migration_ledger l ON l.kind = 'event' AND l.target_id::uuid = b.event_id WHERE l.batch = $1`, batch),
		"event_signup_responses":   queryCount(t, ctx, pool, `SELECT count(*) FROM event_signup_responses s JOIN migration_ledger l ON l.kind = 'event' AND l.target_id::uuid = s.event_id WHERE l.batch = $1`, batch),
		"event_attendees":          queryCount(t, ctx, pool, `SELECT count(*) FROM event_attendees a JOIN migration_ledger l ON l.kind = 'event' AND l.target_id::uuid = a.event_id WHERE l.batch = $1`, batch),
		"folders":                  queryCount(t, ctx, pool, `SELECT count(*) FROM folders f JOIN migration_ledger l ON l.kind = 'folder' AND l.target_id::uuid = f.id WHERE l.batch = $1`, batch),
		"folder_events":            queryCount(t, ctx, pool, `SELECT count(*) FROM folder_events fe JOIN migration_ledger l ON l.kind = 'folder' AND l.target_id::uuid = fe.folder_id WHERE l.batch = $1`, batch),
	}
	want := map[string]int{
		"postgres_events": 7, "postgres_event_responses": 6, "event_signup_blocks": 2,
		"event_signup_responses": 2, "event_attendees": 2, "folders": 1, "folder_events": 2,
	}
	for name, value := range want {
		if counts[name] != value {
			t.Fatalf("%s = %d, want %d (all: %#v)", name, counts[name], value, counts)
		}
	}
}

func assertOwnershipAndAccess(t *testing.T, ctx context.Context, pool *pgxpool.Pool, fixtures rehearsalFixtures, batch string) {
	t.Helper()
	ownerExternal := queryString(t, ctx, pool, `SELECT p.external_user_id FROM postgres_events e
JOIN migration_ledger l ON l.kind = 'event' AND l.target_id::uuid = e.id
LEFT JOIN platform_identities p ON p.id = e.owner_platform_identity_id
WHERE l.batch = $1 AND l.legacy_id = $2`, batch, fixtures.authTimed.Hex())
	if ownerExternal != fixtures.ownerA.Hex() {
		t.Fatalf("authenticated event owner = %q, want %q", ownerExternal, fixtures.ownerA.Hex())
	}
	missingOwner := queryString(t, ctx, pool, `SELECT COALESCE(e.owner_platform_identity_id::text, '') FROM postgres_events e
JOIN migration_ledger l ON l.kind = 'event' AND l.target_id::uuid = e.id
WHERE l.batch = $1 AND e.name = 'Missing owner'`, batch)
	if missingOwner != "" {
		t.Fatalf("missing-owner event invented authority: %q", missingOwner)
	}
	responseAccount := queryString(t, ctx, pool, `SELECT p.external_user_id FROM postgres_event_responses r
JOIN event_visitor_identities v ON v.id = r.event_visitor_identity_id
JOIN platform_identities p ON p.id = v.platform_identity_id
JOIN migration_ledger l ON l.kind = 'event' AND l.target_id::uuid = r.event_id
WHERE l.batch = $1 AND l.legacy_id = $2 AND r.respondent_kind = 'account'`, batch, fixtures.authTimed.Hex())
	if responseAccount != fixtures.ownerB.Hex() {
		t.Fatalf("account response owner = %q, want %q", responseAccount, fixtures.ownerB.Hex())
	}
	guestCredentials := queryCount(t, ctx, pool, `SELECT count(*) FROM event_visitor_credentials c
JOIN event_visitor_identities v ON v.id = c.event_visitor_identity_id
JOIN migration_ledger l ON l.kind = 'event' AND l.target_id::uuid = v.event_id
WHERE l.batch = $1 AND l.legacy_id = $2`, batch, fixtures.anonTimed.Hex())
	if guestCredentials != 0 {
		t.Fatalf("migrated guest credentials = %d, want 0", guestCredentials)
	}
	resolvedAttendee := queryString(t, ctx, pool, `SELECT COALESCE(a.account_user_id, '') FROM event_attendees a
JOIN migration_ledger l ON l.kind = 'event' AND l.target_id::uuid = a.event_id
WHERE l.batch = $1 AND l.legacy_id = $2 AND a.email = 'member@example.com'`, batch, fixtures.groupEvent.Hex())
	if resolvedAttendee != fixtures.ownerB.Hex() {
		t.Fatalf("attendee account mapping = %q, want %q", resolvedAttendee, fixtures.ownerB.Hex())
	}
}

func assertNullableAndScheduleFields(t *testing.T, ctx context.Context, pool *pgxpool.Pool, fixtures rehearsalFixtures, batch string) {
	t.Helper()
	var capacityNull bool
	if err := pool.QueryRow(ctx, `SELECT b.capacity IS NULL FROM event_signup_blocks b
JOIN migration_ledger l ON l.kind = 'event' AND l.target_id::uuid = b.event_id
WHERE l.batch = $1 AND l.legacy_id = $2 AND b.name = 'Afternoon'`, batch, fixtures.signup.Hex()).Scan(&capacityNull); err != nil {
		t.Fatal(err)
	}
	if !capacityNull {
		t.Fatal("unlimited signup block capacity must stay NULL")
	}
	var morningCapacity, morningClaims int
	if err := pool.QueryRow(ctx, `SELECT b.capacity, (SELECT count(*) FROM event_signup_responses s WHERE s.event_id = b.event_id AND b.id::text = ANY(s.block_ids))
FROM event_signup_blocks b
JOIN migration_ledger l ON l.kind = 'event' AND l.target_id::uuid = b.event_id
WHERE l.batch = $1 AND l.legacy_id = $2 AND b.name = 'Morning'`, batch, fixtures.signup.Hex()).Scan(&morningCapacity, &morningClaims); err != nil {
		t.Fatal(err)
	}
	if morningCapacity != 1 || morningClaims != 1 {
		t.Fatalf("signup capacity state = capacity %d claims %d, want 1 and 1", morningCapacity, morningClaims)
	}
	var declinedNull bool
	if err := pool.QueryRow(ctx, `SELECT a.declined IS NULL FROM event_attendees a
JOIN migration_ledger l ON l.kind = 'event' AND l.target_id::uuid = a.event_id
WHERE l.batch = $1 AND l.legacy_id = $2 AND a.email = 'invited@example.com'`, batch, fixtures.groupEvent.Hex()).Scan(&declinedNull); err != nil {
		t.Fatal(err)
	}
	if !declinedNull {
		t.Fatal("omitted attendee decline state must stay NULL")
	}
	var anonymousOwnerNull bool
	if err := pool.QueryRow(ctx, `SELECT e.owner_external_id IS NULL FROM postgres_events e
JOIN migration_ledger l ON l.kind = 'event' AND l.target_id::uuid = e.id
WHERE l.batch = $1 AND l.legacy_id = $2`, batch, fixtures.anonTimed.Hex()).Scan(&anonymousOwnerNull); err != nil {
		t.Fatal(err)
	}
	if !anonymousOwnerNull {
		t.Fatal("anonymous event must not gain an owner")
	}
	var timezone string
	var activeSlots int
	if err := pool.QueryRow(ctx, `SELECT e.payload->>'eventTimezone', jsonb_array_length(e.payload->'activeSlots') FROM postgres_events e
JOIN migration_ledger l ON l.kind = 'event' AND l.target_id::uuid = e.id
WHERE l.batch = $1 AND l.legacy_id = $2`, batch, fixtures.authTimed.Hex()).Scan(&timezone, &activeSlots); err != nil {
		t.Fatal(err)
	}
	if timezone != "UTC" || activeSlots != 1 {
		t.Fatalf("schedule payload = timezone %q slots %d", timezone, activeSlots)
	}
}

func assertQuarantineBreakdown(t *testing.T, ctx context.Context, pool *pgxpool.Pool, batch string) {
	t.Helper()
	counts := map[string]int{}
	rows, err := pool.Query(ctx, `SELECT reason, count(*) FROM migration_quarantine WHERE batch = $1 GROUP BY reason`, batch)
	if err != nil {
		t.Fatal(err)
	}
	defer rows.Close()
	for rows.Next() {
		var reason string
		var count int
		if err := rows.Scan(&reason, &count); err != nil {
			t.Fatal(err)
		}
		counts[reason] = count
	}
	want := map[string]int{
		reasonLegacyGuestCredential:   1,
		reasonIncompleteTokenOwner:    1,
		reasonInvalidGuestName:        1,
		reasonMissingResponseIdentity: 1,
		reasonMissingOwnerAccount:     1,
		reasonOrphanResponse:          1,
		reasonOrphanMembership:        1,
	}
	if len(counts) != len(want) {
		t.Fatalf("quarantine reasons = %#v, want %#v", counts, want)
	}
	for reason, value := range want {
		if counts[reason] != value {
			t.Fatalf("quarantine %s = %d, want %d (all: %#v)", reason, counts[reason], value, counts)
		}
	}
}

func assertSourceUntouched(t *testing.T, ctx context.Context, database *mongo.Database, fixtures rehearsalFixtures) {
	t.Helper()
	if count := queryMongoCount(t, ctx, database, "events"); count != 7 {
		t.Fatalf("source events = %d, want 7", count)
	}
	if count := queryMongoCount(t, ctx, database, "eventResponses"); count != 9 {
		t.Fatalf("source responses = %d, want 9", count)
	}
	if count := queryMongoCount(t, ctx, database, "folders"); count != 1 {
		t.Fatalf("source folders = %d, want 1", count)
	}
	if count := queryMongoCount(t, ctx, database, "folderEvents"); count != 3 {
		t.Fatalf("source folder events = %d, want 3", count)
	}
	var event models.Event
	if err := database.Collection("events").FindOne(ctx, bson.M{"shortId": "ANON0001"}).Decode(&event); err != nil {
		t.Fatalf("source event not resolvable after migration: %v", err)
	}
	if event.Id != fixtures.anonTimed {
		t.Fatalf("source event identity changed: %s", event.Id.Hex())
	}
}

func queryCount(t *testing.T, ctx context.Context, pool *pgxpool.Pool, query string, args ...any) int {
	t.Helper()
	var count int
	if err := pool.QueryRow(ctx, query, args...).Scan(&count); err != nil {
		t.Fatal(err)
	}
	return count
}

func queryString(t *testing.T, ctx context.Context, pool *pgxpool.Pool, query string, args ...any) string {
	t.Helper()
	var value string
	if err := pool.QueryRow(ctx, query, args...).Scan(&value); err != nil {
		t.Fatal(err)
	}
	return value
}

func queryMongoCount(t *testing.T, ctx context.Context, database *mongo.Database, collection string) int {
	t.Helper()
	count, err := database.Collection(collection).CountDocuments(ctx, bson.M{})
	if err != nil {
		t.Fatal(err)
	}
	return int(count)
}

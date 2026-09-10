package postgres

import (
	"bytes"
	"context"
	"encoding/json"
	"errors"
	"testing"

	"github.com/jackc/pgx/v5"
)

// newAvailabilityGroupTestRepository applies the migrations that define
// availability groups into a transaction-scoped set of temporary tables. Temp
// tables shadow the real schema so the isolated tests never mutate test-stack
// records. It reuses the accounts harness because it applies every migration up
// to availability groups, including accounts for email resolution.
func newAvailabilityGroupTestRepository(t *testing.T) (context.Context, *Repository, pgx.Tx) {
	t.Helper()
	ctx, repo, tx := newAccountsTestRepository(t)
	return ctx, repo, tx
}

func seedAvailabilityGroupEvent(t *testing.T, ctx context.Context, tx pgx.Tx) string {
	t.Helper()
	shortID, err := GenerateShortID()
	if err != nil {
		t.Fatal(err)
	}
	var eventID string
	if err := tx.QueryRow(ctx, `INSERT INTO postgres_events (short_id, name, type)
VALUES ($1, 'Group', 'group') RETURNING id`, shortID).Scan(&eventID); err != nil {
		t.Fatal(err)
	}
	return eventID
}

func boolPointer(value bool) *bool { return &value }

// TestAvailabilityGroupMigrationSchemaConstraints proves the migration admits
// the group kind, keeps unsupported kinds rejected, and enforces the attendee
// membership relation and uniqueness.
func TestAvailabilityGroupMigrationSchemaConstraints(t *testing.T) {
	ctx, _, tx := newAvailabilityGroupTestRepository(t)
	eventID := seedAvailabilityGroupEvent(t, ctx, tx)

	expectSavepointError(t, ctx, tx, func() error {
		_, err := tx.Exec(ctx, `INSERT INTO postgres_events (short_id, name, type) VALUES ($1, 'Bogus', 'bogus')`, signupTestShortID(t))
		return err
	})
	expectSavepointError(t, ctx, tx, func() error {
		_, err := tx.Exec(ctx, `INSERT INTO event_attendees (event_id, email) VALUES ($1, '')`, eventID)
		return err
	})
	expectSavepointError(t, ctx, tx, func() error {
		_, err := tx.Exec(ctx, `INSERT INTO event_attendees (event_id, email) VALUES (gen_random_uuid(), 'orphan@example.com')`)
		return err
	})
	if _, err := tx.Exec(ctx, `INSERT INTO event_attendees (event_id, email) VALUES ($1, 'dupe@example.com')`, eventID); err != nil {
		t.Fatal(err)
	}
	duplicateErr := expectSavepointError(t, ctx, tx, func() error {
		_, err := tx.Exec(ctx, `INSERT INTO event_attendees (event_id, email) VALUES ($1, 'dupe@example.com')`, eventID)
		return err
	})
	if !IsUniqueViolation(duplicateErr) {
		t.Fatalf("duplicate membership error = %v, want a unique violation", duplicateErr)
	}
}

// TestAttendeeRepositoryMembershipLifecycle proves add, list, email lookup,
// decline/undecline, and removal are keyed by event and email and that an
// absent decline state is distinct from an explicit false.
func TestAttendeeRepositoryMembershipLifecycle(t *testing.T) {
	ctx, repo, tx := newAvailabilityGroupTestRepository(t)
	eventID := seedAvailabilityGroupEvent(t, ctx, tx)

	attendee := &Attendee{EventID: eventID, Email: "invitee@example.com"}
	if err := repo.AddAttendee(ctx, attendee); err != nil {
		t.Fatal(err)
	}
	if attendee.ID == "" || attendee.Declined != nil {
		t.Fatalf("new membership is unexpected: %#v", attendee)
	}

	// Re-adding keeps the same membership and its absent decline state.
	duplicate := &Attendee{EventID: eventID, Email: "invitee@example.com", Declined: boolPointer(false)}
	if err := repo.AddAttendee(ctx, duplicate); err != nil {
		t.Fatal(err)
	}
	if duplicate.ID != attendee.ID {
		t.Fatalf("re-add created a second membership: %s vs %s", duplicate.ID, attendee.ID)
	}
	if duplicate.Declined != nil {
		t.Fatalf("re-add replaced the absent decline state: %#v", duplicate.Declined)
	}
	list, err := repo.ListAttendees(ctx, eventID)
	if err != nil {
		t.Fatal(err)
	}
	if len(list) != 1 || list[0].ID != attendee.ID {
		t.Fatalf("membership list is unexpected: %#v", list)
	}

	if err := repo.SetAttendeeDeclined(ctx, eventID, "invitee@example.com", true); err != nil {
		t.Fatal(err)
	}
	stored, err := repo.GetAttendeeByEmail(ctx, eventID, "invitee@example.com")
	if err != nil {
		t.Fatal(err)
	}
	if stored.Declined == nil || !*stored.Declined {
		t.Fatalf("decline was not stored: %#v", stored.Declined)
	}
	if err := repo.SetAttendeeDeclined(ctx, eventID, "invitee@example.com", false); err != nil {
		t.Fatal(err)
	}
	stored, err = repo.GetAttendeeByEmail(ctx, eventID, "invitee@example.com")
	if err != nil {
		t.Fatal(err)
	}
	if stored.Declined == nil || *stored.Declined {
		t.Fatalf("undecline was not stored as explicit false: %#v", stored.Declined)
	}

	if err := repo.RemoveAttendee(ctx, eventID, "invitee@example.com"); err != nil {
		t.Fatal(err)
	}
	if _, err := repo.GetAttendeeByEmail(ctx, eventID, "invitee@example.com"); !errors.Is(err, pgx.ErrNoRows) {
		t.Fatalf("removed membership lookup error = %v, want pgx.ErrNoRows", err)
	}
	if err := repo.RemoveAttendee(ctx, eventID, "invitee@example.com"); !errors.Is(err, pgx.ErrNoRows) {
		t.Fatalf("repeated removal error = %v, want pgx.ErrNoRows", err)
	}
}

// TestAttendeeRepositoryResolvesAccountByEmail proves email resolves to a
// PostgreSQL account case-insensitively and that an unknown email leaves the
// account relation absent.
func TestAttendeeRepositoryResolvesAccountByEmail(t *testing.T) {
	ctx, repo, tx := newAvailabilityGroupTestRepository(t)
	account, err := repo.FindOrCreateAccount(ctx, "cccccccccccccccccccccccc", Account{Email: "member@example.com"})
	if err != nil {
		t.Fatal(err)
	}
	eventID := seedAvailabilityGroupEvent(t, ctx, tx)

	resolved := &Attendee{EventID: eventID, Email: "MEMBER@example.com"}
	if err := repo.AddAttendee(ctx, resolved); err != nil {
		t.Fatal(err)
	}
	if resolved.AccountUserID == nil || *resolved.AccountUserID != account.ExternalUserID {
		t.Fatalf("email did not resolve to the account: %#v", resolved.AccountUserID)
	}

	unmatched := &Attendee{EventID: eventID, Email: "stranger@example.com"}
	if err := repo.AddAttendee(ctx, unmatched); err != nil {
		t.Fatal(err)
	}
	if unmatched.AccountUserID != nil {
		t.Fatalf("unknown email resolved to an account: %#v", unmatched.AccountUserID)
	}
}

// TestAccountDeletionReleasesAttendeeRelations proves a deleted account's
// email-keyed memberships survive with their account relation released and
// decline state preserved, while another account's relations are untouched.
func TestAccountDeletionReleasesAttendeeRelations(t *testing.T) {
	ctx, repo, tx := newAvailabilityGroupTestRepository(t)
	deleted, err := repo.FindOrCreateAccount(ctx, "dddddddddddddddddddddddd", Account{Email: "deleted@example.com"})
	if err != nil {
		t.Fatal(err)
	}
	other, err := repo.FindOrCreateAccount(ctx, "eeeeeeeeeeeeeeeeeeeeeeee", Account{Email: "other@example.com"})
	if err != nil {
		t.Fatal(err)
	}
	eventID := seedAvailabilityGroupEvent(t, ctx, tx)

	member := &Attendee{EventID: eventID, Email: "deleted@example.com", Declined: boolPointer(true)}
	if err := repo.AddAttendee(ctx, member); err != nil {
		t.Fatal(err)
	}
	if member.AccountUserID == nil || *member.AccountUserID != deleted.ExternalUserID {
		t.Fatalf("membership did not resolve the account: %#v", member.AccountUserID)
	}
	otherMember := &Attendee{EventID: eventID, Email: "other@example.com"}
	if err := repo.AddAttendee(ctx, otherMember); err != nil {
		t.Fatal(err)
	}
	if otherMember.AccountUserID == nil || *otherMember.AccountUserID != other.ExternalUserID {
		t.Fatalf("second membership did not resolve its account: %#v", otherMember.AccountUserID)
	}

	if err := repo.DeleteAccountByExternalUserID(ctx, deleted.ExternalUserID); err != nil {
		t.Fatal(err)
	}

	stored, err := repo.GetAttendeeByEmail(ctx, eventID, "deleted@example.com")
	if err != nil {
		t.Fatalf("membership did not survive account deletion: %v", err)
	}
	if stored.AccountUserID != nil {
		t.Fatalf("account relation was not released: %#v", stored.AccountUserID)
	}
	if stored.Declined == nil || !*stored.Declined {
		t.Fatalf("decline state was not preserved: %#v", stored.Declined)
	}
	untouched, err := repo.GetAttendeeByEmail(ctx, eventID, "other@example.com")
	if err != nil {
		t.Fatal(err)
	}
	if untouched.AccountUserID == nil || *untouched.AccountUserID != other.ExternalUserID {
		t.Fatalf("another account's relation was changed: %#v", untouched.AccountUserID)
	}
}

// TestGroupResponseReusesResponseStoragePayload proves a group response is
// stored in the existing postgres_event_responses table with calendar-derived
// mode, selected calendars, copied calendar preferences, and manual
// availability preserved, and that the manual availability window stays in the
// event payload.
func TestGroupResponseReusesResponseStoragePayload(t *testing.T) {
	ctx, repo, tx := newAvailabilityGroupTestRepository(t)
	event := &Event{
		Name:    "Group",
		Type:    "group",
		Payload: json.RawMessage(`{"duration":30,"manualAvailabilityWindow":{"start":"09:00","end":"17:00"}}`),
	}
	if err := repo.CreateEvent(ctx, event); err != nil {
		t.Fatal(err)
	}
	var visitorID string
	if err := tx.QueryRow(ctx, `INSERT INTO event_visitor_identities (event_id) VALUES ($1) RETURNING id`, event.ID).Scan(&visitorID); err != nil {
		t.Fatal(err)
	}
	guestName := "Ada"
	response := &Response{
		EventID:                event.ID,
		EventVisitorIdentityID: visitorID,
		RespondentKind:         RespondentKindGuest,
		CanonicalGuestName:     &guestName,
		Payload: json.RawMessage(`{
			"useCalendarAvailability": true,
			"enabledCalendars": {"ada@example.com": ["primary", "work_google"]},
			"calendarOptions": {"weekStart": 1},
			"manualAvailability": {"1700000000000": true}
		}`),
	}
	if err := repo.CreateResponse(ctx, response); err != nil {
		t.Fatal(err)
	}
	stored, err := repo.GetResponseByID(ctx, response.ID)
	if err != nil {
		t.Fatal(err)
	}
	for _, key := range []string{"useCalendarAvailability", "enabledCalendars", "calendarOptions", "manualAvailability"} {
		if !bytes.Contains(stored.Payload, []byte(`"`+key+`"`)) {
			t.Fatalf("group response payload lost %s: %s", key, stored.Payload)
		}
	}
	var storedResponse int
	if err := tx.QueryRow(ctx, `SELECT count(*) FROM postgres_event_responses WHERE id = $1`, response.ID).Scan(&storedResponse); err != nil {
		t.Fatal(err)
	}
	if storedResponse != 1 {
		t.Fatalf("group response did not reuse the shared response storage: %d", storedResponse)
	}
	storedEvent, err := repo.GetEventByID(ctx, event.ID)
	if err != nil {
		t.Fatal(err)
	}
	if !bytes.Contains(storedEvent.Payload, []byte(`"duration"`)) || !bytes.Contains(storedEvent.Payload, []byte(`"manualAvailabilityWindow"`)) {
		t.Fatalf("group event payload lost the manual availability window: %s", storedEvent.Payload)
	}
}

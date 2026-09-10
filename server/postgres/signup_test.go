package postgres

import (
	"context"
	"errors"
	"os"
	"strings"
	"sync"
	"testing"

	"github.com/jackc/pgx/v5"
	"github.com/jackc/pgx/v5/pgxpool"
)

// newSignupTestRepository applies the migrations that define signup forms into a
// transaction-scoped set of temporary tables. Temp tables shadow the real
// schema so the isolated test never mutates test-stack records.
func newSignupTestRepository(t *testing.T) (context.Context, *Repository, pgx.Tx) {
	t.Helper()
	uri := os.Getenv("POSTGRES_APPLICATION_URI")
	if uri == "" {
		t.Skip("POSTGRES_APPLICATION_URI is required")
	}
	ctx := context.Background()
	config, err := pgxpool.ParseConfig(uri)
	if err != nil {
		t.Fatal(err)
	}
	if config.ConnConfig.Database != "timeful-test" && !strings.HasPrefix(config.ConnConfig.Database, "timeful-test-") {
		t.Fatal("requires an isolated test database")
	}
	pool, err := pgxpool.NewWithConfig(ctx, config)
	if err != nil {
		t.Fatal(err)
	}
	t.Cleanup(pool.Close)
	tx, err := pool.Begin(ctx)
	if err != nil {
		t.Fatal(err)
	}
	t.Cleanup(func() { _ = tx.Rollback(ctx) })
	apply := func(name string) {
		t.Helper()
		data, err := os.ReadFile("../migrations/" + name)
		if err != nil {
			t.Fatal(err)
		}
		up := strings.Split(string(data), "-- +goose Down")[0]
		up = strings.ReplaceAll(up, "CREATE TABLE ", "CREATE TEMP TABLE ")
		if _, err := tx.Exec(ctx, up); err != nil {
			t.Fatalf("apply %s: %v", name, err)
		}
	}
	apply("20260814170000_postgres_anonymous_event_compatibility.sql")
	apply("20260815100000_postgres_event_short_id_only.sql")
	apply("20260908160000_visitor_identities.sql")
	apply("20260909090000_event_owner_authority.sql")
	apply("20260909110000_access_transfers.sql")
	apply("20260910120000_accounts.sql")
	apply("20260910130000_account_deletion.sql")
	apply("20260910140000_folders.sql")
	apply("20260910150000_signup_forms.sql")
	return ctx, &Repository{db: tx}, tx
}

func signupTestShortID(t *testing.T) string {
	t.Helper()
	shortID, err := GenerateShortID()
	if err != nil {
		t.Fatal(err)
	}
	return shortID
}

// expectSavepointError runs fn and requires an error without aborting the
// enclosing test transaction, which PostgreSQL marks failed after any statement
// error.
func expectSavepointError(t *testing.T, ctx context.Context, tx pgx.Tx, fn func() error) error {
	t.Helper()
	if _, err := tx.Exec(ctx, `SAVEPOINT signup_expected_error`); err != nil {
		t.Fatal(err)
	}
	err := fn()
	if err == nil {
		t.Fatal("expected operation to fail")
	}
	if _, err := tx.Exec(ctx, `ROLLBACK TO SAVEPOINT signup_expected_error`); err != nil {
		t.Fatal(err)
	}
	return err
}

func seedSignupEvent(t *testing.T, ctx context.Context, tx pgx.Tx, shortID string) string {
	t.Helper()
	var eventID string
	if err := tx.QueryRow(ctx, `INSERT INTO postgres_events (short_id, name, type)
VALUES ($1, 'Signup', 'signup') RETURNING id`, shortID).Scan(&eventID); err != nil {
		t.Fatal(err)
	}
	return eventID
}

func seedSignupVisitor(t *testing.T, ctx context.Context, tx pgx.Tx, eventID string) string {
	t.Helper()
	var visitorID string
	if err := tx.QueryRow(ctx, `INSERT INTO event_visitor_identities (event_id) VALUES ($1) RETURNING id`, eventID).Scan(&visitorID); err != nil {
		t.Fatal(err)
	}
	return visitorID
}

// TestSignupMigrationSchemaConstraints proves the signup migration admits the
// signup kind, enforces the visitor/event relation, rejects negative capacity,
// and requires a canonical guest name for guest responses.
func TestSignupMigrationSchemaConstraints(t *testing.T) {
	ctx, _, tx := newSignupTestRepository(t)
	eventID := seedSignupEvent(t, ctx, tx, signupTestShortID(t))

	expectSavepointError(t, ctx, tx, func() error {
		_, err := tx.Exec(ctx, `INSERT INTO postgres_events (short_id, name, type) VALUES ($1, 'Group', 'group')`, signupTestShortID(t))
		return err
	})
	otherEventID := seedSignupEvent(t, ctx, tx, signupTestShortID(t))
	visitorID := seedSignupVisitor(t, ctx, tx, eventID)
	expectSavepointError(t, ctx, tx, func() error {
		_, err := tx.Exec(ctx, `INSERT INTO event_signup_responses (event_id, event_visitor_identity_id, respondent_kind, canonical_guest_name)
VALUES ($1, $2, 'guest', 'Ada')`, otherEventID, visitorID)
		return err
	})
	expectSavepointError(t, ctx, tx, func() error {
		_, err := tx.Exec(ctx, `INSERT INTO event_signup_blocks (event_id, name, capacity) VALUES ($1, 'Bad', -1)`, eventID)
		return err
	})
	expectSavepointError(t, ctx, tx, func() error {
		_, err := tx.Exec(ctx, `INSERT INTO event_signup_responses (event_id, event_visitor_identity_id, respondent_kind, canonical_guest_name)
VALUES ($1, $2, 'guest', NULL)`, eventID, visitorID)
		return err
	})
	expectSavepointError(t, ctx, tx, func() error {
		_, err := tx.Exec(ctx, `INSERT INTO event_signup_responses (event_id, event_visitor_identity_id, respondent_kind, account_user_id, canonical_guest_name)
VALUES ($1, $2, 'account', NULL, 'Ada')`, eventID, visitorID)
		return err
	})
}

// TestSignupBlocksCreateReplaceAndListPreserveOrder covers block create, list
// ordering, and replacement, including detaching removed blocks from the
// responses that claimed them.
func TestSignupBlocksCreateReplaceAndListPreserveOrder(t *testing.T) {
	ctx, repo, tx := newSignupTestRepository(t)
	eventID := seedSignupEvent(t, ctx, tx, signupTestShortID(t))
	visitorID := seedSignupVisitor(t, ctx, tx, eventID)

	capacity := 1
	first := &SignupBlock{EventID: eventID, Name: "Morning", Capacity: &capacity}
	if err := repo.CreateSignupBlock(ctx, first); err != nil {
		t.Fatal(err)
	}
	second := &SignupBlock{EventID: eventID, Name: "Afternoon"}
	if err := repo.CreateSignupBlock(ctx, second); err != nil {
		t.Fatal(err)
	}
	listed, err := repo.ListSignupBlocks(ctx, eventID)
	if err != nil {
		t.Fatal(err)
	}
	if len(listed) != 2 || listed[0].ID != first.ID || listed[1].ID != second.ID {
		t.Fatalf("blocks are not in insertion order: %#v", listed)
	}
	if listed[0].Position != 1 || listed[1].Position != 2 {
		t.Fatalf("appended positions are unexpected: %#v", listed)
	}

	response := &SignupResponse{EventID: eventID, EventVisitorIdentityID: visitorID, Name: "Ada", BlockIDs: []string{first.ID}}
	if err := repo.CreateSignupResponse(ctx, response); err != nil {
		t.Fatal(err)
	}

	replacement, err := repo.ReplaceSignupBlocks(ctx, eventID, []SignupBlock{
		{ID: second.ID, Name: "Afternoon", Position: 5},
		{Name: "Evening"},
	})
	if err != nil {
		t.Fatal(err)
	}
	if len(replacement) != 2 || replacement[0].ID != second.ID || replacement[0].Name != "Afternoon" || replacement[1].Name != "Evening" {
		t.Fatalf("replace did not apply: %#v", replacement)
	}
	if replacement[0].Position != 1 || replacement[1].Position != 2 {
		t.Fatalf("replace did not renumber positions: %#v", replacement)
	}
	stored, err := repo.GetSignupResponseByPublicID(ctx, eventID, response.PublicID)
	if err != nil {
		t.Fatal(err)
	}
	if len(stored.BlockIDs) != 0 {
		t.Fatalf("removed block identity stayed attached to the response: %#v", stored.BlockIDs)
	}
	if _, err := repo.ReplaceSignupBlocks(ctx, eventID, []SignupBlock{{ID: response.ID, Name: "Foreign"}}); !errors.Is(err, pgx.ErrNoRows) {
		t.Fatalf("replacing a foreign block error = %v, want pgx.ErrNoRows", err)
	}
}

// TestSignupResponseCanonicalGuestNameAndMembership proves guest names are
// canonicalized through the shared normalizer, equivalent names collide, and
// update/delete are keyed by the opaque public ID.
func TestSignupResponseCanonicalGuestNameAndMembership(t *testing.T) {
	ctx, repo, tx := newSignupTestRepository(t)
	eventID := seedSignupEvent(t, ctx, tx, signupTestShortID(t))
	visitorID := seedSignupVisitor(t, ctx, tx, eventID)
	otherVisitorID := seedSignupVisitor(t, ctx, tx, eventID)

	block := &SignupBlock{EventID: eventID, Name: "Open"}
	if err := repo.CreateSignupBlock(ctx, block); err != nil {
		t.Fatal(err)
	}
	response := &SignupResponse{
		EventID:                eventID,
		EventVisitorIdentityID: visitorID,
		Name:                   "  A\u200bda\u0301  ",
		BlockIDs:               []string{block.ID, block.ID, " "},
	}
	if err := repo.CreateSignupResponse(ctx, response); err != nil {
		t.Fatal(err)
	}
	if response.Name != "Adá" || response.CanonicalGuestName == nil || *response.CanonicalGuestName != "Adá" {
		t.Fatalf("guest name was not canonicalized: %#v", response)
	}
	if len(response.BlockIDs) != 1 || response.BlockIDs[0] != block.ID {
		t.Fatalf("block membership was not normalized: %#v", response.BlockIDs)
	}
	if response.PublicID == "" || response.ID == "" {
		t.Fatalf("response identity is missing: %#v", response)
	}

	duplicate := &SignupResponse{EventID: eventID, EventVisitorIdentityID: otherVisitorID, Name: "Adá", BlockIDs: []string{block.ID}}
	duplicateErr := expectSavepointError(t, ctx, tx, func() error {
		return repo.CreateSignupResponse(ctx, duplicate)
	})
	if !IsUniqueViolation(duplicateErr) {
		t.Fatalf("duplicate canonical guest name error = %v, want a unique violation", duplicateErr)
	}

	response.Name = "Bob"
	response.Email = "bob@example.com"
	if err := repo.UpdateSignupResponse(ctx, response); err != nil {
		t.Fatal(err)
	}
	stored, err := repo.GetSignupResponseByPublicID(ctx, eventID, response.PublicID)
	if err != nil {
		t.Fatal(err)
	}
	if stored.Name != "Bob" || stored.CanonicalGuestName == nil || *stored.CanonicalGuestName != "Bob" || stored.Email != "bob@example.com" {
		t.Fatalf("update did not persist: %#v", stored)
	}
	if err := repo.DeleteSignupResponse(ctx, eventID, response.PublicID); err != nil {
		t.Fatal(err)
	}
	if _, err := repo.GetSignupResponseByPublicID(ctx, eventID, response.PublicID); !errors.Is(err, pgx.ErrNoRows) {
		t.Fatalf("deleted response lookup error = %v, want pgx.ErrNoRows", err)
	}
	if err := repo.DeleteSignupResponse(ctx, eventID, response.PublicID); !errors.Is(err, pgx.ErrNoRows) {
		t.Fatalf("repeated delete error = %v, want pgx.ErrNoRows", err)
	}
}

// TestSignupResponseAccountIdentityAndBlockValidation proves account signup
// responses resolve and deduplicate by account user ID and that a response
// cannot claim a block from another event.
func TestSignupResponseAccountIdentityAndBlockValidation(t *testing.T) {
	ctx, repo, tx := newSignupTestRepository(t)
	eventID := seedSignupEvent(t, ctx, tx, signupTestShortID(t))
	visitorID := seedSignupVisitor(t, ctx, tx, eventID)
	otherVisitorID := seedSignupVisitor(t, ctx, tx, eventID)
	foreignEventID := seedSignupEvent(t, ctx, tx, signupTestShortID(t))

	accountID := "aaaaaaaaaaaaaaaaaaaaaaaa"
	response := &SignupResponse{EventID: eventID, EventVisitorIdentityID: visitorID, AccountUserID: &accountID}
	if err := repo.CreateSignupResponse(ctx, response); err != nil {
		t.Fatal(err)
	}
	if response.RespondentKind != RespondentKindAccount || response.CanonicalGuestName != nil {
		t.Fatalf("account identity was not resolved: %#v", response)
	}
	duplicate := &SignupResponse{EventID: eventID, EventVisitorIdentityID: otherVisitorID, AccountUserID: &accountID}
	duplicateErr := expectSavepointError(t, ctx, tx, func() error {
		return repo.CreateSignupResponse(ctx, duplicate)
	})
	if !IsUniqueViolation(duplicateErr) {
		t.Fatalf("duplicate account response error = %v, want a unique violation", duplicateErr)
	}

	foreignBlockID := ""
	if err := tx.QueryRow(ctx, `INSERT INTO event_signup_blocks (event_id, name) VALUES ($1, 'Foreign') RETURNING id::text`, foreignEventID).Scan(&foreignBlockID); err != nil {
		t.Fatal(err)
	}
	guest := &SignupResponse{EventID: eventID, EventVisitorIdentityID: otherVisitorID, Name: "Carol", BlockIDs: []string{foreignBlockID}}
	foreignErr := expectSavepointError(t, ctx, tx, func() error {
		return repo.CreateSignupResponse(ctx, guest)
	})
	if !errors.Is(foreignErr, ErrSignupBlockNotFound) {
		t.Fatalf("foreign block error = %v, want ErrSignupBlockNotFound", foreignErr)
	}
	var count int
	if err := tx.QueryRow(ctx, `SELECT count(*) FROM event_signup_responses WHERE event_id = $1`, eventID).Scan(&count); err != nil {
		t.Fatal(err)
	}
	if count != 1 {
		t.Fatalf("a rejected signup wrote %d responses, want 1", count)
	}
}

// TestSignupCapacityReservationAtomicUnderContention proves concurrent signups
// for one limited block serialize under the event row lock and admit exactly the
// capacity count with no partial writes.
func TestSignupCapacityReservationAtomicUnderContention(t *testing.T) {
	uri := os.Getenv("POSTGRES_APPLICATION_URI")
	if uri == "" {
		t.Skip("POSTGRES_APPLICATION_URI is required")
	}
	ctx := context.Background()
	config, err := pgxpool.ParseConfig(uri)
	if err != nil {
		t.Fatal(err)
	}
	if config.ConnConfig.Database != "timeful-test" && !strings.HasPrefix(config.ConnConfig.Database, "timeful-test-") {
		t.Fatal("requires an isolated test database")
	}
	pool, err := pgxpool.NewWithConfig(ctx, config)
	if err != nil {
		t.Fatal(err)
	}
	t.Cleanup(pool.Close)
	repo := NewRepository(pool)

	shortID := signupTestShortID(t)
	var eventID, blockID string
	if err := pool.QueryRow(ctx, `INSERT INTO postgres_events (short_id, name, type)
VALUES ($1, 'Contended', 'signup') RETURNING id`, shortID).Scan(&eventID); err != nil {
		t.Fatal(err)
	}
	t.Cleanup(func() {
		if _, err := pool.Exec(context.Background(), `DELETE FROM postgres_events WHERE id = $1`, eventID); err != nil {
			t.Errorf("delete contended event: %v", err)
		}
	})
	capacity := 2
	if err := pool.QueryRow(ctx, `INSERT INTO event_signup_blocks (event_id, name, capacity)
VALUES ($1, 'Limited', $2) RETURNING id::text`, eventID, capacity).Scan(&blockID); err != nil {
		t.Fatal(err)
	}

	const workers = 8
	visitorIDs := make([]string, workers)
	for i := range visitorIDs {
		if err := pool.QueryRow(ctx, `INSERT INTO event_visitor_identities (event_id) VALUES ($1) RETURNING id::text`, eventID).Scan(&visitorIDs[i]); err != nil {
			t.Fatal(err)
		}
	}

	failures := make([]error, workers)
	start := make(chan struct{})
	var wg sync.WaitGroup
	for i := 0; i < workers; i++ {
		wg.Add(1)
		go func(i int) {
			defer wg.Done()
			<-start
			failures[i] = repo.CreateSignupResponse(ctx, &SignupResponse{
				EventID:                eventID,
				EventVisitorIdentityID: visitorIDs[i],
				Name:                   "Racer " + string(rune('A'+i)),
				BlockIDs:               []string{blockID},
			})
		}(i)
	}
	close(start)
	wg.Wait()

	admitted, rejected := 0, 0
	for i, err := range failures {
		switch {
		case err == nil:
			admitted++
		case errors.Is(err, ErrSignupCapacityExceeded):
			rejected++
		default:
			t.Fatalf("worker %d error = %v", i, err)
		}
	}
	if admitted != capacity || rejected != workers-capacity {
		t.Fatalf("capacity contention admitted=%d rejected=%d, want %d/%d", admitted, rejected, capacity, workers-capacity)
	}
	var stored int
	if err := pool.QueryRow(ctx, `SELECT count(*) FROM event_signup_responses WHERE event_id = $1 AND $2 = ANY(block_ids)`, eventID, blockID).Scan(&stored); err != nil {
		t.Fatal(err)
	}
	if stored != capacity {
		t.Fatalf("stored signups = %d, want %d", stored, capacity)
	}
}

// TestSignupUnlimitedBlockAdmitsAll proves a nil capacity does not reject.
func TestSignupUnlimitedBlockAdmitsAll(t *testing.T) {
	ctx, repo, tx := newSignupTestRepository(t)
	eventID := seedSignupEvent(t, ctx, tx, signupTestShortID(t))
	block := &SignupBlock{EventID: eventID, Name: "Open"}
	if err := repo.CreateSignupBlock(ctx, block); err != nil {
		t.Fatal(err)
	}
	for i := 0; i < 5; i++ {
		visitorID := seedSignupVisitor(t, ctx, tx, eventID)
		response := &SignupResponse{EventID: eventID, EventVisitorIdentityID: visitorID, Name: "Guest " + string(rune('A'+i)), BlockIDs: []string{block.ID}}
		if err := repo.CreateSignupResponse(ctx, response); err != nil {
			t.Fatal(err)
		}
	}
	responses, err := repo.ListSignupResponses(ctx, eventID)
	if err != nil {
		t.Fatal(err)
	}
	if len(responses) != 5 {
		t.Fatalf("unlimited block admitted %d signups, want 5", len(responses))
	}
}

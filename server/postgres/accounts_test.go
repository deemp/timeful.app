package postgres

import (
	"context"
	"crypto/rand"
	"encoding/hex"
	"errors"
	"os"
	"strings"
	"sync"
	"testing"

	"github.com/jackc/pgx/v5"
	"github.com/jackc/pgx/v5/pgxpool"
)

// newAccountsTestRepository applies the migrations that define accounts into a
// transaction-scoped set of temporary tables. Temp tables shadow the real
// schema so the isolated test never mutates test-stack records.
func newAccountsTestRepository(t *testing.T) (context.Context, *Repository, pgx.Tx) {
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

func TestAccountRepositoryIsIdempotentAndLinksExistingIdentity(t *testing.T) {
	ctx, repo, tx := newAccountsTestRepository(t)

	// An existing Platform Identity can predate the account backfill (for
	// example from the visitor-identity migration). Linking must not duplicate it.
	if _, err := tx.Exec(ctx, `INSERT INTO platform_identities (external_user_id) VALUES ('aaaaaaaaaaaaaaaaaaaaaaaa')`); err != nil {
		t.Fatal(err)
	}
	first, err := repo.FindOrCreateAccount(ctx, "aaaaaaaaaaaaaaaaaaaaaaaa", Account{
		Email: "Ada@example.com", FirstName: "Ada", LastName: "Lovelace",
	})
	if err != nil {
		t.Fatal(err)
	}
	if first.ExternalUserID != "aaaaaaaaaaaaaaaaaaaaaaaa" || first.ID == "" {
		t.Fatalf("unexpected account %#v", first)
	}
	second, err := repo.FindOrCreateAccount(ctx, "aaaaaaaaaaaaaaaaaaaaaaaa", Account{Email: "ignored@example.com"})
	if err != nil {
		t.Fatal(err)
	}
	if second.ID != first.ID || second.Email != "Ada@example.com" {
		t.Fatalf("repeat backfill changed the account: %#v vs %#v", first, second)
	}
	var identities, accounts int
	if err := tx.QueryRow(ctx, `SELECT (SELECT count(*) FROM platform_identities), (SELECT count(*) FROM accounts)`).Scan(&identities, &accounts); err != nil {
		t.Fatal(err)
	}
	if identities != 1 || accounts != 1 {
		t.Fatalf("expected one identity and one account, got %d and %d", identities, accounts)
	}

	byExternal, err := repo.GetAccountByExternalUserID(ctx, first.ExternalUserID)
	if err != nil || byExternal.ID != first.ID {
		t.Fatalf("external lookup: %v %#v", err, byExternal)
	}
	byEmail, err := repo.GetAccountByEmail(ctx, "ADA@EXAMPLE.COM")
	if err != nil || byEmail.ID != first.ID {
		t.Fatalf("case-insensitive email lookup: %v %#v", err, byEmail)
	}
}

func TestAccountRepositoryKeepsEqualEmailAccountsDistinct(t *testing.T) {
	ctx, repo, _ := newAccountsTestRepository(t)
	older, err := repo.FindOrCreateAccount(ctx, "111111111111111111111111", Account{Email: "same@example.com"})
	if err != nil {
		t.Fatal(err)
	}
	newer, err := repo.FindOrCreateAccount(ctx, "222222222222222222222222", Account{Email: "same@example.com"})
	if err != nil {
		t.Fatal(err)
	}
	if older.ID == newer.ID {
		t.Fatal("equal-email accounts must not be merged")
	}
	resolved, err := repo.GetAccountByEmail(ctx, "same@example.com")
	if err != nil || resolved.ID != older.ID {
		t.Fatalf("ambiguous email must resolve deterministically to the oldest: %v %#v", err, resolved)
	}
}

func TestAccountRepositoryUpdatesAndDeletesProfileAndIdentity(t *testing.T) {
	ctx, repo, tx := newAccountsTestRepository(t)
	account, err := repo.FindOrCreateAccount(ctx, "333333333333333333333333", Account{Email: "old@example.com", FirstName: "Old"})
	if err != nil {
		t.Fatal(err)
	}
	custom := true
	account.Email = "new@example.com"
	account.FirstName = "New"
	account.LastName = "Name"
	account.HasCustomName = &custom
	account.TimezoneOffset = -300
	if err := repo.UpdateAccountProfile(ctx, account); err != nil {
		t.Fatal(err)
	}
	stored, err := repo.GetAccountByExternalUserID(ctx, account.ExternalUserID)
	if err != nil || stored.Email != "new@example.com" || stored.FirstName != "New" || stored.HasCustomName == nil || !*stored.HasCustomName || stored.TimezoneOffset != -300 {
		t.Fatalf("profile not updated: %v %#v", err, stored)
	}
	if err := repo.DeleteAccountByExternalUserID(ctx, account.ExternalUserID); err != nil {
		t.Fatal(err)
	}
	if _, err := repo.GetAccountByExternalUserID(ctx, account.ExternalUserID); err == nil {
		t.Fatal("account still resolves after delete")
	}
	var identities, tombstones int
	if err := tx.QueryRow(ctx, `SELECT (SELECT count(*) FROM platform_identities), (SELECT count(*) FROM account_deletion_tombstones WHERE external_user_id = $1)`, account.ExternalUserID).Scan(&identities, &tombstones); err != nil {
		t.Fatal(err)
	}
	if identities != 0 {
		t.Fatalf("deleting an account must remove its platform identity, got %d", identities)
	}
	if tombstones != 1 {
		t.Fatalf("deleting an account must record a tombstone, got %d", tombstones)
	}
	// A repeated deletion is idempotent and does not disturb the tombstone.
	if err := repo.DeleteAccountByExternalUserID(ctx, account.ExternalUserID); err != nil {
		t.Fatal(err)
	}
	if err := tx.QueryRow(ctx, `SELECT count(*) FROM account_deletion_tombstones WHERE external_user_id = $1`, account.ExternalUserID).Scan(&tombstones); err != nil {
		t.Fatal(err)
	}
	if tombstones != 1 {
		t.Fatalf("repeated deletion changed the tombstone count: %d", tombstones)
	}
}

// TestAccountRepositoryTombstoneBlocksRecreation proves that a tombstoned
// external identifier can never create or adopt an account again, so a backfill
// racing a deletion cannot resurrect the account.
func TestAccountRepositoryTombstoneBlocksRecreation(t *testing.T) {
	ctx, repo, _ := newAccountsTestRepository(t)
	externalUserID := "999999999999999999999999"
	if _, err := repo.FindOrCreateAccount(ctx, externalUserID, Account{Email: "resurrect@example.com"}); err != nil {
		t.Fatal(err)
	}
	if err := repo.DeleteAccountByExternalUserID(ctx, externalUserID); err != nil {
		t.Fatal(err)
	}
	if _, err := repo.FindOrCreateAccount(ctx, externalUserID, Account{Email: "resurrect@example.com"}); !errors.Is(err, ErrAccountDeleted) {
		t.Fatalf("recreation error = %v, want ErrAccountDeleted", err)
	}
	if _, err := repo.FindOrCreatePlatformIdentity(ctx, externalUserID); !errors.Is(err, ErrAccountDeleted) {
		t.Fatalf("identity recreation error = %v, want ErrAccountDeleted", err)
	}
	deleted, err := repo.AccountDeleted(ctx, externalUserID)
	if err != nil || !deleted {
		t.Fatalf("AccountDeleted = %v, %v", deleted, err)
	}
}

// TestAccountRepositoryDeletionReleasesOwnershipAndRemovesOwnResponses proves
// that events the account organized survive with ownership released and their
// other guests' responses intact, while the account's own response and visitor
// identity are removed.
func TestAccountRepositoryDeletionReleasesOwnershipAndRemovesOwnResponses(t *testing.T) {
	ctx, repo, tx := newAccountsTestRepository(t)
	account, err := repo.FindOrCreateAccount(ctx, "abcdefabcdefabcdefabcdef", Account{Email: "owner@example.com"})
	if err != nil {
		t.Fatal(err)
	}

	var eventID string
	if err := tx.QueryRow(ctx, `INSERT INTO postgres_events (short_id, name, type, owner_external_id, owner_platform_identity_id)
VALUES ('AAAA0001', 'Owned', 'specific_dates', $1, $2) RETURNING id`, account.ExternalUserID, account.PlatformIdentityID).Scan(&eventID); err != nil {
		t.Fatal(err)
	}
	var ownerVisitorID, guestVisitorID string
	if err := tx.QueryRow(ctx, `INSERT INTO event_visitor_identities (event_id, platform_identity_id) VALUES ($1, $2) RETURNING id`, eventID, account.PlatformIdentityID).Scan(&ownerVisitorID); err != nil {
		t.Fatal(err)
	}
	if _, err := tx.Exec(ctx, `UPDATE postgres_events SET owner_event_visitor_identity_id = $2 WHERE id = $1`, eventID, ownerVisitorID); err != nil {
		t.Fatal(err)
	}
	if err := tx.QueryRow(ctx, `INSERT INTO event_visitor_identities (event_id) VALUES ($1) RETURNING id`, eventID).Scan(&guestVisitorID); err != nil {
		t.Fatal(err)
	}
	if _, err := tx.Exec(ctx, `INSERT INTO postgres_event_responses (event_id, event_visitor_identity_id, respondent_kind, account_user_id, payload)
VALUES ($1, $2, 'account', $3, '{"name":"Owner"}')`, eventID, ownerVisitorID, account.ExternalUserID); err != nil {
		t.Fatal(err)
	}
	if _, err := tx.Exec(ctx, `INSERT INTO postgres_event_responses (event_id, event_visitor_identity_id, respondent_kind, canonical_guest_name, payload)
VALUES ($1, $2, 'guest', 'Guest', '{"name":"Guest"}')`, eventID, guestVisitorID); err != nil {
		t.Fatal(err)
	}

	if err := repo.DeleteAccountByExternalUserID(ctx, account.ExternalUserID); err != nil {
		t.Fatal(err)
	}

	var owned, ownerVisitor, guestVisitor, ownResponses, guestResponses int
	if err := tx.QueryRow(ctx, `SELECT
 (SELECT count(*) FROM postgres_events WHERE id = $1 AND owner_platform_identity_id IS NULL AND owner_external_id IS NULL AND owner_event_visitor_identity_id IS NULL),
 (SELECT count(*) FROM event_visitor_identities WHERE id = $2),
 (SELECT count(*) FROM event_visitor_identities WHERE id = $3),
 (SELECT count(*) FROM postgres_event_responses WHERE account_user_id = $4),
 (SELECT count(*) FROM postgres_event_responses WHERE event_id = $1 AND respondent_kind = 'guest')`,
		eventID, ownerVisitorID, guestVisitorID, account.ExternalUserID).Scan(&owned, &ownerVisitor, &guestVisitor, &ownResponses, &guestResponses); err != nil {
		t.Fatal(err)
	}
	if owned != 1 {
		t.Fatal("event must survive with ownership released")
	}
	if ownerVisitor != 0 || ownResponses != 0 {
		t.Fatalf("account visitor identity and response must be removed: visitor=%d responses=%d", ownerVisitor, ownResponses)
	}
	if guestVisitor != 1 || guestResponses != 1 {
		t.Fatalf("other guests' responses must survive: visitor=%d responses=%d", guestVisitor, guestResponses)
	}
}

// TestAccountRepositoryConcurrentBackfillCannotResurrectDeletingAccount proves
// that a backfill racing a deletion serializes on the account advisory lock and
// cannot leave a resurrected account behind: whichever order the two acquire the
// lock, the terminal state is no account, no platform identity, and a tombstone.
func TestAccountRepositoryConcurrentBackfillCannotResurrectDeletingAccount(t *testing.T) {
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

	externalUserID := randomHex(t, 12)
	if _, err := repo.FindOrCreateAccount(ctx, externalUserID, Account{Email: "race-delete@example.com"}); err != nil {
		t.Fatal(err)
	}
	t.Cleanup(func() {
		_, _ = pool.Exec(context.Background(), `DELETE FROM account_deletion_tombstones WHERE external_user_id = $1`, externalUserID)
		_, _ = pool.Exec(context.Background(), `DELETE FROM accounts WHERE platform_identity_id IN (SELECT id FROM platform_identities WHERE external_user_id = $1)`, externalUserID)
		_, _ = pool.Exec(context.Background(), `DELETE FROM platform_identities WHERE external_user_id = $1`, externalUserID)
	})

	// Hold the deletion advisory lock so both the deletion and the backfill are
	// in flight before either can make progress.
	blocker, err := pool.Begin(ctx)
	if err != nil {
		t.Fatal(err)
	}
	if _, err := blocker.Exec(ctx, `SELECT pg_advisory_xact_lock(hashtextextended($1, 0))`, externalUserID); err != nil {
		t.Fatal(err)
	}

	var wg sync.WaitGroup
	wg.Add(2)
	var deleteErr, backfillErr error
	go func() { defer wg.Done(); deleteErr = repo.DeleteAccountByExternalUserID(ctx, externalUserID) }()
	go func() {
		defer wg.Done()
		_, backfillErr = repo.FindOrCreateAccount(ctx, externalUserID, Account{Email: "race-delete@example.com"})
	}()
	if err := blocker.Rollback(ctx); err != nil {
		t.Fatal(err)
	}
	wg.Wait()

	if deleteErr != nil {
		t.Fatalf("delete failed: %v", deleteErr)
	}
	if backfillErr != nil && !errors.Is(backfillErr, ErrAccountDeleted) {
		t.Fatalf("backfill error = %v, want nil or ErrAccountDeleted", backfillErr)
	}
	var accounts, identities, tombstones int
	if err := pool.QueryRow(ctx, `SELECT
 (SELECT count(*) FROM accounts WHERE platform_identity_id IN (SELECT id FROM platform_identities WHERE external_user_id = $1)),
 (SELECT count(*) FROM platform_identities WHERE external_user_id = $1),
 (SELECT count(*) FROM account_deletion_tombstones WHERE external_user_id = $1)`, externalUserID).Scan(&accounts, &identities, &tombstones); err != nil {
		t.Fatal(err)
	}
	if accounts != 0 || identities != 0 {
		t.Fatalf("deletion left accounts=%d identities=%d", accounts, identities)
	}
	if tombstones != 1 {
		t.Fatalf("deletion must record exactly one tombstone, got %d", tombstones)
	}
}

func TestAccountRepositoryIncrementsUsageCounter(t *testing.T) {
	ctx, repo, _ := newAccountsTestRepository(t)
	account, err := repo.FindOrCreateAccount(ctx, "444444444444444444444444", Account{Email: "count@example.com"})
	if err != nil {
		t.Fatal(err)
	}
	if err := repo.IncrementAccountEventsCreated(ctx, account.ExternalUserID); err != nil {
		t.Fatal(err)
	}
	stored, err := repo.GetAccountByExternalUserID(ctx, account.ExternalUserID)
	if err != nil || stored.NumEventsCreated != 1 {
		t.Fatalf("usage counter = %v %#v", err, stored)
	}
}

// TestFindOrCreateAccountDoesNotUpdateExistingRow proves that re-running the
// account backfill against an existing account leaves the stored row untouched
// instead of performing a needless update on conflict.
func TestFindOrCreateAccountDoesNotUpdateExistingRow(t *testing.T) {
	ctx, repo, tx := newAccountsTestRepository(t)
	if _, err := repo.FindOrCreateAccount(ctx, "777777777777777777777777", Account{Email: "no-op@example.com", FirstName: "Original"}); err != nil {
		t.Fatal(err)
	}
	var accountBefore, identityBefore string
	if err := tx.QueryRow(ctx, `SELECT ctid::text FROM accounts`).Scan(&accountBefore); err != nil {
		t.Fatal(err)
	}
	if err := tx.QueryRow(ctx, `SELECT ctid::text FROM platform_identities`).Scan(&identityBefore); err != nil {
		t.Fatal(err)
	}
	repeated, err := repo.FindOrCreateAccount(ctx, "777777777777777777777777", Account{Email: "ignored@example.com", FirstName: "Ignored"})
	if err != nil {
		t.Fatal(err)
	}
	var accountAfter, identityAfter string
	if err := tx.QueryRow(ctx, `SELECT ctid::text FROM accounts`).Scan(&accountAfter); err != nil {
		t.Fatal(err)
	}
	if err := tx.QueryRow(ctx, `SELECT ctid::text FROM platform_identities`).Scan(&identityAfter); err != nil {
		t.Fatal(err)
	}
	if repeated.FirstName != "Original" {
		t.Fatalf("repeat upsert changed the account: %#v", repeated)
	}
	if accountBefore != accountAfter {
		t.Fatalf("repeat upsert performed a needless account update: ctid %s -> %s", accountBefore, accountAfter)
	}
	if identityBefore != identityAfter {
		t.Fatalf("repeat upsert performed a needless platform identity update: ctid %s -> %s", identityBefore, identityAfter)
	}
}

// TestFindOrCreateAccountRollsBackIdentityOnFailure proves that the platform
// identity and the account are one unit: when the account insert violates a
// constraint, the identity created for the same unit is rolled back instead of
// leaking a half-applied account. Without the enclosing transaction the identity
// would persist and the rerun would find it without an account.
func TestFindOrCreateAccountRollsBackIdentityOnFailure(t *testing.T) {
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

	externalUserID := randomHex(t, 12)
	t.Cleanup(func() {
		if _, err := pool.Exec(context.Background(), `DELETE FROM accounts WHERE platform_identity_id IN (SELECT id FROM platform_identities WHERE external_user_id = $1)`, externalUserID); err != nil {
			t.Errorf("delete failed-unit account: %v", err)
		}
		if _, err := pool.Exec(context.Background(), `DELETE FROM platform_identities WHERE external_user_id = $1`, externalUserID); err != nil {
			t.Errorf("delete failed-unit identity: %v", err)
		}
	})

	if _, err := repo.FindOrCreateAccount(ctx, externalUserID, Account{Email: "bad@example.com", NumEventsCreated: -1}); err == nil {
		t.Fatal("expected a negative usage counter to fail the account insert")
	}
	var identities int
	if err := pool.QueryRow(ctx, `SELECT count(*) FROM platform_identities WHERE external_user_id = $1`, externalUserID).Scan(&identities); err != nil {
		t.Fatal(err)
	}
	if identities != 0 {
		t.Fatalf("failed unit leaked %d platform identity row(s)", identities)
	}
}

// TestUpdateAccountProfilePreservesUsageCounter proves that a profile update
// cannot change or reset the authoritative usage counter.
func TestUpdateAccountProfilePreservesUsageCounter(t *testing.T) {
	ctx, repo, _ := newAccountsTestRepository(t)
	account, err := repo.FindOrCreateAccount(ctx, "888888888888888888888888", Account{Email: "counter@example.com", FirstName: "Before"})
	if err != nil {
		t.Fatal(err)
	}
	if err := repo.IncrementAccountEventsCreated(ctx, account.ExternalUserID); err != nil {
		t.Fatal(err)
	}
	if err := repo.IncrementAccountEventsCreated(ctx, account.ExternalUserID); err != nil {
		t.Fatal(err)
	}
	account.FirstName = "After"
	account.NumEventsCreated = 0 // A stale merged value must not reset the stored counter.
	if err := repo.UpdateAccountProfile(ctx, account); err != nil {
		t.Fatal(err)
	}
	stored, err := repo.GetAccountByExternalUserID(ctx, account.ExternalUserID)
	if err != nil {
		t.Fatal(err)
	}
	if stored.FirstName != "After" {
		t.Fatalf("profile update did not persist: %#v", stored)
	}
	if stored.NumEventsCreated != 2 {
		t.Fatalf("profile update changed the usage counter: got %d want 2", stored.NumEventsCreated)
	}
}

func TestFindOrCreateAccountByEmailReusesExistingAccount(t *testing.T) {
	ctx, repo, _ := newAccountsTestRepository(t)
	first, created, err := repo.FindOrCreateAccountByEmail(ctx, "reuse@example.com", "555555555555555555555555", Account{Email: "reuse@example.com", FirstName: "First"})
	if err != nil || !created {
		t.Fatalf("first call = %v, created=%v; want a created account", err, created)
	}
	second, created, err := repo.FindOrCreateAccountByEmail(ctx, "REUSE@EXAMPLE.COM", "666666666666666666666666", Account{Email: "reuse@example.com", FirstName: "Second"})
	if err != nil {
		t.Fatal(err)
	}
	if created {
		t.Fatal("case-insensitive repeat must reuse the existing account")
	}
	if second.ID != first.ID || second.FirstName != "First" {
		t.Fatalf("repeat changed the account: %#v vs %#v", first, second)
	}
	var identities, accounts int
	if err := repo.db.QueryRow(ctx, `SELECT (SELECT count(*) FROM platform_identities), (SELECT count(*) FROM accounts)`).Scan(&identities, &accounts); err != nil {
		t.Fatal(err)
	}
	if identities != 1 || accounts != 1 {
		t.Fatalf("repeat created extra rows: identities=%d accounts=%d", identities, accounts)
	}
}

// TestFindOrCreateAccountByEmailConcurrentSignIns proves that concurrent
// first-time sign-ins for one email serialize behind the advisory lock and
// create exactly one account and platform identity, with no failed request.
func TestFindOrCreateAccountByEmailConcurrentSignIns(t *testing.T) {
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

	email := "concurrent-email-" + randomHex(t, 8) + "@example.com"
	const workers = 8
	externalUserIDs := make([]string, workers)
	for i := range externalUserIDs {
		externalUserIDs[i] = randomHex(t, 12)
	}
	t.Cleanup(func() {
		if _, err := pool.Exec(context.Background(), `DELETE FROM accounts WHERE platform_identity_id IN (SELECT id FROM platform_identities WHERE external_user_id = ANY($1))`, externalUserIDs); err != nil {
			t.Errorf("delete concurrent accounts: %v", err)
		}
		if _, err := pool.Exec(context.Background(), `DELETE FROM platform_identities WHERE external_user_id = ANY($1)`, externalUserIDs); err != nil {
			t.Errorf("delete concurrent identities: %v", err)
		}
	})

	results := make([]*Account, workers)
	failures := make([]error, workers)
	start := make(chan struct{})
	var wg sync.WaitGroup
	for i := 0; i < workers; i++ {
		wg.Add(1)
		go func(i int) {
			defer wg.Done()
			<-start
			results[i], _, failures[i] = repo.FindOrCreateAccountByEmail(ctx, email, externalUserIDs[i], Account{Email: email, FirstName: "Racer"})
		}(i)
	}
	close(start)
	wg.Wait()

	var winner *Account
	for i := range results {
		if failures[i] != nil {
			t.Fatalf("worker %d failed: %v", i, failures[i])
		}
		if results[i] == nil {
			t.Fatalf("worker %d returned no account", i)
		}
		if winner == nil {
			winner = results[i]
		} else if results[i].ID != winner.ID {
			t.Fatalf("concurrent sign-ins resolved different accounts: %s vs %s", winner.ID, results[i].ID)
		}
	}
	var accounts, identities int
	if err := pool.QueryRow(ctx, `SELECT (SELECT count(*) FROM accounts a JOIN platform_identities p ON p.id = a.platform_identity_id WHERE lower(a.email) = lower($1)), (SELECT count(*) FROM platform_identities WHERE external_user_id = ANY($2))`, email, externalUserIDs).Scan(&accounts, &identities); err != nil {
		t.Fatal(err)
	}
	if accounts != 1 || identities != 1 {
		t.Fatalf("concurrent first-time sign-ins created accounts=%d identities=%d", accounts, identities)
	}
}

func randomHex(t *testing.T, size int) string {
	t.Helper()
	value := make([]byte, size)
	if _, err := rand.Read(value); err != nil {
		t.Fatal(err)
	}
	return hex.EncodeToString(value)
}

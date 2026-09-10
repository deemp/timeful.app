package postgres

import (
	"context"
	"os"
	"strings"
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
	apply("20260910120000_accounts.sql")
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

func TestAccountRepositoryUpdatesAndDeletesProfileOnly(t *testing.T) {
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
	var identities int
	if err := tx.QueryRow(ctx, `SELECT count(*) FROM platform_identities`).Scan(&identities); err != nil {
		t.Fatal(err)
	}
	if identities != 1 {
		t.Fatalf("deleting an account must retain its platform identity, got %d", identities)
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

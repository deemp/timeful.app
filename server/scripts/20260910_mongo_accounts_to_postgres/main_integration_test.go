package main

import (
	"context"
	"os"
	"strings"
	"testing"

	"github.com/jackc/pgx/v5/pgxpool"
	"go.mongodb.org/mongo-driver/bson"
	"go.mongodb.org/mongo-driver/bson/primitive"
	"go.mongodb.org/mongo-driver/mongo"
	"go.mongodb.org/mongo-driver/mongo/options"
	"timeful/server/models"
	pgstore "timeful/server/postgres"
)

// newBackfillTestContext connects to the isolated Mongo and PostgreSQL test
// databases and drops a per-test Mongo source database. Disconnects are
// registered before the per-test fixture cleanup so the LIFO cleanup order runs
// the fixture deletes against a live client and pool. It uses a separate test
// database per test so the cases never race each other or other Mongo suites.
func newBackfillTestContext(t *testing.T, sourceSuffix string) (context.Context, *mongo.Database, *pgxpool.Pool) {
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

	database := mongoClient.Database(baseDatabase + "_account_backfill_" + sourceSuffix)
	if err := database.Drop(ctx); err != nil {
		t.Fatal(err)
	}
	return ctx, database, pool
}

// deleteBackfillFixtures drops the Mongo source database and removes every
// PostgreSQL account and platform identity created for the listed external IDs.
func deleteBackfillFixtures(t *testing.T, ctx context.Context, database *mongo.Database, pool *pgxpool.Pool, externalIDs []string) {
	t.Helper()
	t.Cleanup(func() {
		if err := database.Drop(ctx); err != nil {
			t.Errorf("drop backfill source database: %v", err)
		}
		if len(externalIDs) == 0 {
			return
		}
		if _, err := pool.Exec(ctx, `DELETE FROM accounts WHERE platform_identity_id IN (SELECT id FROM platform_identities WHERE external_user_id = ANY($1))`, externalIDs); err != nil {
			t.Errorf("delete backfill accounts: %v", err)
		}
		if _, err := pool.Exec(ctx, `DELETE FROM platform_identities WHERE external_user_id = ANY($1)`, externalIDs); err != nil {
			t.Errorf("delete backfill platform identities: %v", err)
		}
	})
}

func insertBackfillUsers(t *testing.T, ctx context.Context, database *mongo.Database, users ...models.User) {
	t.Helper()
	for _, user := range users {
		if _, err := database.Collection("users").ReplaceOne(ctx, bson.M{"_id": user.Id}, user, options.Replace().SetUpsert(true)); err != nil {
			t.Fatal(err)
		}
	}
}

func assertBackfillRows(t *testing.T, ctx context.Context, pool *pgxpool.Pool, externalIDs []string, wantAccounts, wantIdentities int) {
	t.Helper()
	var accounts, identities int
	if err := pool.QueryRow(ctx, `SELECT count(*) FROM accounts WHERE platform_identity_id IN (SELECT id FROM platform_identities WHERE external_user_id = ANY($1))`, externalIDs).Scan(&accounts); err != nil {
		t.Fatal(err)
	}
	if err := pool.QueryRow(ctx, `SELECT count(*) FROM platform_identities WHERE external_user_id = ANY($1)`, externalIDs).Scan(&identities); err != nil {
		t.Fatal(err)
	}
	if accounts != wantAccounts || identities != wantIdentities {
		t.Fatalf("accounts=%d identities=%d, want accounts=%d identities=%d", accounts, identities, wantAccounts, wantIdentities)
	}
}

// TestMigrateAccountsIsResumableAndIdempotent drives the backfill twice against
// legacy source documents and asserts that no platform identity or account is
// duplicated. The first run is the interrupted run's resume point: every unit it
// commits must be skipped by the repeated run instead of rewritten.
// TestMigrateAccountsSkipsTombstonedAccount proves that the backfill never
// recreates an account that was deleted. The tombstone is the durable record of
// the deletion and takes precedence over the retained MongoDB source document.
func TestMigrateAccountsSkipsTombstonedAccount(t *testing.T) {
	ctx, database, pool := newBackfillTestContext(t, "tombstone")
	user := models.User{Id: primitive.NewObjectID(), Email: "tombstone@example.com", FirstName: "Tombstone"}
	insertBackfillUsers(t, ctx, database, user)
	externalUserID := user.Id.Hex()
	deleteBackfillFixtures(t, ctx, database, pool, []string{externalUserID})

	if _, err := pool.Exec(ctx, `INSERT INTO account_deletion_tombstones (external_user_id) VALUES ($1)`, externalUserID); err != nil {
		t.Fatal(err)
	}
	t.Cleanup(func() {
		_, _ = pool.Exec(context.Background(), `DELETE FROM account_deletion_tombstones WHERE external_user_id = $1`, externalUserID)
	})

	summary, err := migrateAccounts(ctx, database, pool, configuration{apply: true, batchSize: 10})
	if err != nil {
		t.Fatal(err)
	}
	if summary.Scanned != 1 || summary.Migrated != 0 || summary.Skipped != 1 {
		t.Fatalf("tombstoned account must be skipped: %#v", summary)
	}
	assertBackfillRows(t, ctx, pool, []string{externalUserID}, 0, 0)
}

func TestMigrateAccountsIsResumableAndIdempotent(t *testing.T) {
	ctx, database, pool := newBackfillTestContext(t, "resume")
	first := models.User{Id: primitive.NewObjectID(), Email: "backfill-one@example.com", FirstName: "One"}
	second := models.User{Id: primitive.NewObjectID(), Email: "backfill-two@example.com", FirstName: "Two"}
	insertBackfillUsers(t, ctx, database, first, second)
	externalIDs := []string{first.Id.Hex(), second.Id.Hex()}
	deleteBackfillFixtures(t, ctx, database, pool, externalIDs)

	config := configuration{apply: true, batchSize: 1, mongoDB: database.Name()}
	summary, err := migrateAccounts(ctx, database, pool, config)
	if err != nil {
		t.Fatal(err)
	}
	if summary.Scanned != 2 || summary.Migrated != 2 || summary.Skipped != 0 {
		t.Fatalf("first run = %#v", summary)
	}
	summary, err = migrateAccounts(ctx, database, pool, config)
	if err != nil {
		t.Fatal(err)
	}
	if summary.Scanned != 2 || summary.Migrated != 0 || summary.Skipped != 2 {
		t.Fatalf("repeated run must skip completed units: %#v", summary)
	}
	assertBackfillRows(t, ctx, pool, externalIDs, 2, 2)
}

// TestMigrateAccountsPreflightDoesNotWrite proves that a run without --apply
// reports the work that would be done and writes neither an account nor a
// platform identity.
func TestMigrateAccountsPreflightDoesNotWrite(t *testing.T) {
	ctx, database, pool := newBackfillTestContext(t, "preflight")
	user := models.User{Id: primitive.NewObjectID(), Email: "preflight@example.com", FirstName: "Preflight"}
	insertBackfillUsers(t, ctx, database, user)
	externalIDs := []string{user.Id.Hex()}
	deleteBackfillFixtures(t, ctx, database, pool, externalIDs)

	summary, err := migrateAccounts(ctx, database, pool, configuration{apply: false, batchSize: 10})
	if err != nil {
		t.Fatal(err)
	}
	if summary.Scanned != 1 || summary.Migrated != 1 || summary.Skipped != 0 {
		t.Fatalf("preflight summary = %#v", summary)
	}
	assertBackfillRows(t, ctx, pool, externalIDs, 0, 0)
}

// TestMigrateAccountsAdoptsPreExistingPlatformIdentity covers the state a unit
// interrupted after its identity write leaves behind: a platform identity with
// no account. The rerun must link the existing identity and add the account
// without creating a second identity.
func TestMigrateAccountsAdoptsPreExistingPlatformIdentity(t *testing.T) {
	ctx, database, pool := newBackfillTestContext(t, "identity")
	user := models.User{Id: primitive.NewObjectID(), Email: "identity@example.com", FirstName: "Identity"}
	insertBackfillUsers(t, ctx, database, user)
	externalUserID := user.Id.Hex()
	deleteBackfillFixtures(t, ctx, database, pool, []string{externalUserID})

	if _, err := pool.Exec(ctx, `INSERT INTO platform_identities (external_user_id) VALUES ($1)`, externalUserID); err != nil {
		t.Fatal(err)
	}

	summary, err := migrateAccounts(ctx, database, pool, configuration{apply: true, batchSize: 10})
	if err != nil {
		t.Fatal(err)
	}
	if summary.Scanned != 1 || summary.Migrated != 1 || summary.Skipped != 0 {
		t.Fatalf("summary = %#v", summary)
	}
	assertBackfillRows(t, ctx, pool, []string{externalUserID}, 1, 1)

	account, err := pgstore.NewRepository(pool).GetAccountByExternalUserID(ctx, externalUserID)
	if err != nil || account.FirstName != "Identity" {
		t.Fatalf("adopted account = %v %#v", err, account)
	}
}

// TestMigrateAccountsSkipsPreExistingAccount proves that a legacy account that
// already has PostgreSQL authority is skipped and never overwritten.
func TestMigrateAccountsSkipsPreExistingAccount(t *testing.T) {
	ctx, database, pool := newBackfillTestContext(t, "existing")
	user := models.User{Id: primitive.NewObjectID(), Email: "existing@example.com", FirstName: "Legacy"}
	insertBackfillUsers(t, ctx, database, user)
	externalUserID := user.Id.Hex()
	deleteBackfillFixtures(t, ctx, database, pool, []string{externalUserID})

	repository := pgstore.NewRepository(pool)
	if _, err := repository.FindOrCreateAccount(ctx, externalUserID, pgstore.Account{Email: "authoritative@example.com", FirstName: "Authoritative"}); err != nil {
		t.Fatal(err)
	}

	summary, err := migrateAccounts(ctx, database, pool, configuration{apply: true, batchSize: 10})
	if err != nil {
		t.Fatal(err)
	}
	if summary.Scanned != 1 || summary.Migrated != 0 || summary.Skipped != 1 {
		t.Fatalf("summary = %#v", summary)
	}
	stored, err := repository.GetAccountByExternalUserID(ctx, externalUserID)
	if err != nil || stored.FirstName != "Authoritative" || stored.Email != "authoritative@example.com" {
		t.Fatalf("pre-existing account was overwritten: %v %#v", err, stored)
	}
	assertBackfillRows(t, ctx, pool, []string{externalUserID}, 1, 1)
}

// TestMigrateAccountsTerminatesWithZeroIdentifier proves that a zero ObjectID is
// treated as a real source cursor rather than restarting pagination, so the run
// terminates and migrates the zero-identifier document.
func TestMigrateAccountsTerminatesWithZeroIdentifier(t *testing.T) {
	ctx, database, pool := newBackfillTestContext(t, "zero")
	zeroID := primitive.NilObjectID
	regularID := primitive.NewObjectID()
	if _, err := database.Collection("users").InsertOne(ctx, bson.M{"_id": zeroID, "email": "zero@example.com", "firstName": "Zero"}); err != nil {
		t.Fatal(err)
	}
	if _, err := database.Collection("users").InsertOne(ctx, bson.M{"_id": regularID, "email": "regular@example.com", "firstName": "Regular"}); err != nil {
		t.Fatal(err)
	}
	externalIDs := []string{zeroID.Hex(), regularID.Hex()}
	deleteBackfillFixtures(t, ctx, database, pool, externalIDs)

	summary, err := migrateAccounts(ctx, database, pool, configuration{apply: true, batchSize: 1})
	if err != nil {
		t.Fatal(err)
	}
	if summary.Scanned != 2 || summary.Migrated != 2 || summary.Skipped != 0 {
		t.Fatalf("summary = %#v", summary)
	}
	assertBackfillRows(t, ctx, pool, externalIDs, 2, 2)
}

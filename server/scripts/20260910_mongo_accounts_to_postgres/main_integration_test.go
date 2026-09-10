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
)

// TestMigrateAccountsIsResumableAndIdempotent drives the backfill twice against
// legacy source documents and asserts that no platform identity or account is
// duplicated. It uses a separate test database so it never races other
// Mongo-backed suites.
func TestMigrateAccountsIsResumableAndIdempotent(t *testing.T) {
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
	// Register disconnects as cleanups so they run after the fixture cleanup
	// below; a plain defer would close the clients before the deletes execute.
	t.Cleanup(func() { _ = mongoClient.Disconnect(ctx) })
	database := mongoClient.Database(baseDatabase + "_account_backfill")
	if err := database.Drop(ctx); err != nil {
		t.Fatal(err)
	}

	pool, err := pgxpool.New(ctx, postgresURI)
	if err != nil {
		t.Fatal(err)
	}
	t.Cleanup(pool.Close)

	first := models.User{Id: primitive.NewObjectID(), Email: "backfill-one@example.com", FirstName: "One"}
	second := models.User{Id: primitive.NewObjectID(), Email: "backfill-two@example.com", FirstName: "Two"}
	for _, user := range []models.User{first, second} {
		if _, err := database.Collection("users").ReplaceOne(ctx, bson.M{"_id": user.Id}, user, options.Replace().SetUpsert(true)); err != nil {
			t.Fatal(err)
		}
	}
	externalIDs := []string{first.Id.Hex(), second.Id.Hex()}
	t.Cleanup(func() {
		if err := database.Drop(ctx); err != nil {
			t.Errorf("drop backfill source database: %v", err)
		}
		if _, err := pool.Exec(ctx, `DELETE FROM accounts WHERE platform_identity_id IN (SELECT id FROM platform_identities WHERE external_user_id = ANY($1))`, externalIDs); err != nil {
			t.Errorf("delete backfill accounts: %v", err)
		}
		if _, err := pool.Exec(ctx, `DELETE FROM platform_identities WHERE external_user_id = ANY($1)`, externalIDs); err != nil {
			t.Errorf("delete backfill platform identities: %v", err)
		}
	})

	config := configuration{apply: true, batchSize: 1, mongoDB: baseDatabase + "_account_backfill", postgresURI: postgresURI}
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

	var accounts, identities int
	if err := pool.QueryRow(ctx, `SELECT count(*), count(DISTINCT platform_identity_id) FROM accounts WHERE platform_identity_id IN (SELECT id FROM platform_identities WHERE external_user_id = ANY($1))`, externalIDs).Scan(&accounts, &identities); err != nil {
		t.Fatal(err)
	}
	if accounts != 2 || identities != 2 {
		t.Fatalf("repeated backfill duplicated accounts=%d identities=%d", accounts, identities)
	}
	var identityCount int
	if err := pool.QueryRow(ctx, `SELECT count(*) FROM platform_identities WHERE external_user_id = ANY($1)`, externalIDs).Scan(&identityCount); err != nil {
		t.Fatal(err)
	}
	if identityCount != 2 {
		t.Fatalf("repeated backfill duplicated platform identities: %d", identityCount)
	}
}

package db

import (
	"context"
	"io"
	"os"
	"strings"
	"testing"

	"github.com/jackc/pgx/v5/pgxpool"
	"go.mongodb.org/mongo-driver/bson"
	"go.mongodb.org/mongo-driver/bson/primitive"
	"timeful/server/logger"
	"timeful/server/models"
	pgstore "timeful/server/postgres"
)

// initAccountAuthorityTestMongo connects the retained MongoDB store used to
// prove that an account lookup error never falls back to MongoDB profile
// authority. It requires an isolated test database.
func initAccountAuthorityTestMongo(t *testing.T) {
	t.Helper()
	if logger.StdErr == nil {
		logger.Init(io.Discard)
	}
	if UsersCollection != nil {
		return
	}
	if os.Getenv("MONGODB_URI") == "" {
		t.Skip("MONGODB_URI is required for account authority tests")
	}
	database := os.Getenv("MONGODB_DATABASE")
	if database != "timeful-test" && !strings.HasPrefix(database, "timeful-test-") {
		t.Fatalf("MONGODB_DATABASE must be timeful-test or use a timeful-test- prefix; got %q", database)
	}
	Init()
}

func insertAccountAuthorityUser(t *testing.T, user models.User) {
	t.Helper()
	ctx := context.Background()
	if _, err := UsersCollection.InsertOne(ctx, user); err != nil {
		t.Fatalf("insert retained user: %v", err)
	}
	t.Cleanup(func() {
		if _, err := UsersCollection.DeleteOne(context.Background(), bson.M{"_id": user.Id}); err != nil {
			t.Errorf("delete retained user: %v", err)
		}
	})
}

// closedPostgresTestPool is a non-nil pool whose queries fail immediately, so a
// test can exercise the initialized-but-erroring PostgreSQL state without a
// server.
func closedPostgresTestPool(t *testing.T) *pgxpool.Pool {
	t.Helper()
	config, err := pgxpool.ParseConfig("postgres://timeful:timeful@127.0.0.1:1/timeful-test?sslmode=disable&connect_timeout=1")
	if err != nil {
		t.Fatal(err)
	}
	pool, err := pgxpool.NewWithConfig(context.Background(), config)
	if err != nil {
		t.Fatal(err)
	}
	pool.Close()
	return pool
}

func accountsAuthorityTestPool(t *testing.T) *pgxpool.Pool {
	t.Helper()
	uri := os.Getenv("POSTGRES_APPLICATION_URI")
	if uri == "" {
		t.Skip("POSTGRES_APPLICATION_URI is required for the not-found case")
	}
	config, err := pgxpool.ParseConfig(uri)
	if err != nil {
		t.Fatal(err)
	}
	pool, err := pgxpool.NewWithConfig(context.Background(), config)
	if err != nil {
		t.Fatal(err)
	}
	t.Cleanup(pool.Close)
	return pool
}

func TestGetUserByIdUninitializedPoolUsesRetainedDocument(t *testing.T) {
	initAccountAuthorityTestMongo(t)
	previousPool := pgstore.Pool
	pgstore.Pool = nil
	t.Cleanup(func() { pgstore.Pool = previousPool })

	email := "retained-id-" + primitive.NewObjectID().Hex() + "@example.com"
	user := models.User{Id: primitive.NewObjectID(), Email: email, FirstName: "Retained", LastName: "Legacy"}
	insertAccountAuthorityUser(t, user)

	got := GetUserById(user.Id.Hex())
	if got == nil || got.FirstName != "Retained" || got.Email != email {
		t.Fatalf("uninitialized pool must serve the retained legacy document, got %#v", got)
	}
	if got := GetUserByEmail(email); got == nil || got.Id != user.Id || got.FirstName != "Retained" {
		t.Fatalf("uninitialized pool email lookup must serve the retained legacy document, got %#v", got)
	}
}

func TestGetUserByIdPostgresErrorDoesNotServeRetainedProfile(t *testing.T) {
	initAccountAuthorityTestMongo(t)
	previousPool := pgstore.Pool
	t.Cleanup(func() { pgstore.Pool = previousPool })
	pgstore.Pool = closedPostgresTestPool(t)

	email := "retained-error-" + primitive.NewObjectID().Hex() + "@example.com"
	user := models.User{Id: primitive.NewObjectID(), Email: email, FirstName: "MongoAuthority", LastName: "ShouldNotWin"}
	insertAccountAuthorityUser(t, user)

	if got := GetUserById(user.Id.Hex()); got != nil {
		t.Fatalf("PostgreSQL error must not serve the retained profile by identifier, got %#v", got)
	}
	if got := GetUserByEmail(email); got != nil {
		t.Fatalf("PostgreSQL error must not serve the retained profile by email, got %#v", got)
	}
}

func TestGetUserByIdGenuineNotFoundUsesRetainedDocument(t *testing.T) {
	initAccountAuthorityTestMongo(t)
	previousPool := pgstore.Pool
	t.Cleanup(func() { pgstore.Pool = previousPool })
	pgstore.Pool = accountsAuthorityTestPool(t)

	email := "retained-legacy-" + primitive.NewObjectID().Hex() + "@example.com"
	user := models.User{Id: primitive.NewObjectID(), Email: email, FirstName: "LegacyOnly", LastName: "PreBackfill"}
	insertAccountAuthorityUser(t, user)

	if got := GetUserById(user.Id.Hex()); got == nil || got.FirstName != "LegacyOnly" {
		t.Fatalf("genuine not-found must serve the retained pre-backfill document, got %#v", got)
	}
	if got := GetUserByEmail(email); got == nil || got.Id != user.Id || got.FirstName != "LegacyOnly" {
		t.Fatalf("genuine not-found email lookup must serve the retained pre-backfill document, got %#v", got)
	}
}

// initAccountOverlayPostgres connects the authoritative PostgreSQL store used
// by the overlay test, reusing an already initialized package pool when a
// sibling test has one.
func initAccountOverlayPostgres(t *testing.T) {
	t.Helper()
	if os.Getenv("POSTGRES_APPLICATION_URI") == "" {
		t.Skip("POSTGRES_APPLICATION_URI is required for account overlay tests")
	}
	previous := pgstore.Pool
	var closePool func()
	if previous == nil {
		closePool = pgstore.Init()
	}
	t.Cleanup(func() {
		if closePool != nil {
			closePool()
		}
		pgstore.Pool = previous
	})
}

// TestGetUserByEmailOverlaysPostgresProfileNotRetained proves that the email
// lookup returns the authoritative PostgreSQL profile, including the usage
// counter, and never the conflicting profile fields of a retained document.
func TestGetUserByEmailOverlaysPostgresProfileNotRetained(t *testing.T) {
	initAccountAuthorityTestMongo(t)
	initAccountOverlayPostgres(t)
	ctx := context.Background()

	repository, err := pgstore.DefaultRepository()
	if err != nil {
		t.Fatal(err)
	}

	email := "overlay-" + primitive.NewObjectID().Hex() + "@example.com"
	externalUserID := primitive.NewObjectID().Hex()
	account, created, err := repository.FindOrCreateAccountByEmail(ctx, email, externalUserID, pgstore.Account{
		Email:            email,
		FirstName:        "Postgres",
		LastName:         "Profile",
		Picture:          "https://postgres.example/picture.png",
		TimezoneOffset:   90,
		NumEventsCreated: 7,
	})
	if err != nil {
		t.Fatal(err)
	}
	if !created {
		t.Fatal("expected the overlay test to create a fresh account")
	}
	t.Cleanup(func() {
		_ = repository.DeleteAccountByExternalUserID(context.Background(), account.ExternalUserID)
	})

	objectID, err := primitive.ObjectIDFromHex(account.ExternalUserID)
	if err != nil {
		t.Fatal(err)
	}
	insertAccountAuthorityUser(t, models.User{
		Id:               objectID,
		Email:            email,
		FirstName:        "Mongo",
		LastName:         "Retained",
		Picture:          "https://mongo.example/picture.png",
		TimezoneOffset:   -60,
		NumEventsCreated: 99,
	})

	assertOverlay := func(lookup string, got *models.User) {
		t.Helper()
		if got == nil {
			t.Fatalf("%s returned no user", lookup)
		}
		if got.Id != objectID || got.Email != email {
			t.Fatalf("%s returned the wrong account: %#v", lookup, got)
		}
		if got.FirstName != "Postgres" || got.LastName != "Profile" {
			t.Fatalf("%s returned a retained name instead of the PostgreSQL profile: %#v", lookup, got)
		}
		if got.Picture != "https://postgres.example/picture.png" {
			t.Fatalf("%s returned a retained picture instead of the PostgreSQL profile: %q", lookup, got.Picture)
		}
		if got.TimezoneOffset != 90 {
			t.Fatalf("%s returned a retained timezone instead of the PostgreSQL profile: %d", lookup, got.TimezoneOffset)
		}
		if got.NumEventsCreated != 7 {
			t.Fatalf("%s returned a retained usage counter instead of the PostgreSQL counter: %d", lookup, got.NumEventsCreated)
		}
	}

	assertOverlay("GetUserByEmail", GetUserByEmail(email))
	assertOverlay("GetUserById", GetUserById(account.ExternalUserID))

	// A PostgreSQL lookup failure must not promote the retained Mongo profile to
	// account authority for either lookup path.
	previousPool := pgstore.Pool
	pgstore.Pool = closedPostgresTestPool(t)
	t.Cleanup(func() { pgstore.Pool = previousPool })
	if got := GetUserByEmail(email); got != nil {
		t.Fatalf("a PostgreSQL error must not serve the retained profile by email, got %#v", got)
	}
	if got := GetUserById(account.ExternalUserID); got != nil {
		t.Fatalf("a PostgreSQL error must not serve the retained profile by identifier, got %#v", got)
	}
}

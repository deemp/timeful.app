package accounts

import (
	"context"
	"os"
	"strings"
	"testing"

	"github.com/jackc/pgx/v5/pgxpool"
	"go.mongodb.org/mongo-driver/bson"
	"go.mongodb.org/mongo-driver/bson/primitive"
	"timeful/server/db"
	"timeful/server/models"
	pgstore "timeful/server/postgres"
)

func initAccountExistenceTestMongo(t *testing.T) {
	t.Helper()
	if db.UsersCollection != nil {
		return
	}
	if os.Getenv("MONGODB_URI") == "" {
		t.Skip("MONGODB_URI is required for account existence tests")
	}
	database := os.Getenv("MONGODB_DATABASE")
	if database != "timeful-test" && !strings.HasPrefix(database, "timeful-test-") {
		t.Fatalf("MONGODB_DATABASE must be timeful-test or use a timeful-test- prefix; got %q", database)
	}
	db.Init()
}

func insertAccountExistenceUser(t *testing.T, user models.User) {
	t.Helper()
	ctx := context.Background()
	if _, err := db.UsersCollection.InsertOne(ctx, user); err != nil {
		t.Fatalf("insert retained user: %v", err)
	}
	t.Cleanup(func() {
		if _, err := db.UsersCollection.DeleteOne(context.Background(), bson.M{"_id": user.Id}); err != nil {
			t.Errorf("delete retained user: %v", err)
		}
	})
}

func closedExistencePostgresPool(t *testing.T) *pgxpool.Pool {
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

func existenceAuthorityTestPool(t *testing.T) *pgxpool.Pool {
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

func TestIsNewUserUninitializedPoolUsesRetainedDocument(t *testing.T) {
	initAccountExistenceTestMongo(t)
	previousPool := pgstore.Pool
	pgstore.Pool = nil
	t.Cleanup(func() { pgstore.Pool = previousPool })

	freshEmail := "fresh-" + primitive.NewObjectID().Hex() + "@example.com"
	if isNew, err := IsNewUser(freshEmail); err != nil || !isNew {
		t.Fatalf("IsNewUser(fresh) = %v, %v; want true, nil", isNew, err)
	}

	legacyEmail := "legacy-" + primitive.NewObjectID().Hex() + "@example.com"
	insertAccountExistenceUser(t, models.User{Id: primitive.NewObjectID(), Email: legacyEmail})
	if isNew, err := IsNewUser(legacyEmail); err != nil || isNew {
		t.Fatalf("IsNewUser(legacy) = %v, %v; want false, nil", isNew, err)
	}
}

func TestIsNewUserReportsPostgresError(t *testing.T) {
	initAccountExistenceTestMongo(t)
	previousPool := pgstore.Pool
	t.Cleanup(func() { pgstore.Pool = previousPool })
	pgstore.Pool = closedExistencePostgresPool(t)

	email := "error-" + primitive.NewObjectID().Hex() + "@example.com"
	insertAccountExistenceUser(t, models.User{Id: primitive.NewObjectID(), Email: email})

	isNew, err := IsNewUser(email)
	if err == nil {
		t.Fatalf("IsNewUser() error = nil, want a PostgreSQL failure; isNew = %v", isNew)
	}
}

func TestIsNewUserGenuineNotFound(t *testing.T) {
	initAccountExistenceTestMongo(t)
	previousPool := pgstore.Pool
	t.Cleanup(func() { pgstore.Pool = previousPool })
	pgstore.Pool = existenceAuthorityTestPool(t)

	freshEmail := "fresh-" + primitive.NewObjectID().Hex() + "@example.com"
	if isNew, err := IsNewUser(freshEmail); err != nil || !isNew {
		t.Fatalf("IsNewUser(fresh) = %v, %v; want true, nil", isNew, err)
	}

	legacyEmail := "legacy-only-" + primitive.NewObjectID().Hex() + "@example.com"
	insertAccountExistenceUser(t, models.User{Id: primitive.NewObjectID(), Email: legacyEmail})
	if isNew, err := IsNewUser(legacyEmail); err != nil || isNew {
		t.Fatalf("IsNewUser(legacy) = %v, %v; want false, nil", isNew, err)
	}
}

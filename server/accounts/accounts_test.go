package accounts

import (
	"context"
	"errors"
	"os"
	"strings"
	"sync"
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

// deleteAccountsByEmail removes every account and platform identity for an
// email so concurrent contract tests stay rerunnable against a retained
// database.
func deleteAccountsByEmail(t *testing.T, pool *pgxpool.Pool, email string) {
	t.Helper()
	ctx := context.Background()
	rows, err := pool.Query(ctx, `SELECT p.external_user_id FROM accounts a JOIN platform_identities p ON p.id = a.platform_identity_id WHERE lower(a.email) = lower($1)`, email)
	if err != nil {
		t.Errorf("list account identities: %v", err)
		return
	}
	var externalUserIDs []string
	for rows.Next() {
		var externalUserID string
		if err := rows.Scan(&externalUserID); err != nil {
			t.Errorf("scan account identity: %v", err)
		}
		externalUserIDs = append(externalUserIDs, externalUserID)
	}
	rows.Close()
	if _, err := pool.Exec(ctx, `DELETE FROM accounts WHERE lower(email) = lower($1)`, email); err != nil {
		t.Errorf("delete accounts by email: %v", err)
	}
	if len(externalUserIDs) > 0 {
		if _, err := pool.Exec(ctx, `DELETE FROM platform_identities WHERE external_user_id = ANY($1)`, externalUserIDs); err != nil {
			t.Errorf("delete platform identities: %v", err)
		}
	}
}

// TestResolveForSignInConcurrentEmailCreatesSingleAccount proves that concurrent
// first-time sign-ins for one email resolve one PostgreSQL account and create no
// duplicate account or platform identity.
func TestResolveForSignInConcurrentEmailCreatesSingleAccount(t *testing.T) {
	initAccountExistenceTestMongo(t)
	pool := existenceAuthorityTestPool(t)
	previousPool := pgstore.Pool
	pgstore.Pool = pool
	t.Cleanup(func() { pgstore.Pool = previousPool })

	email := "concurrent-signin-" + primitive.NewObjectID().Hex() + "@example.com"
	t.Cleanup(func() { deleteAccountsByEmail(t, pool, email) })

	const workers = 8
	ctx := context.Background()
	results := make([]*pgstore.Account, workers)
	created := make([]bool, workers)
	failures := make([]error, workers)
	start := make(chan struct{})
	var wg sync.WaitGroup
	for i := 0; i < workers; i++ {
		wg.Add(1)
		go func(i int) {
			defer wg.Done()
			<-start
			results[i], created[i], failures[i] = ResolveForSignIn(ctx, Profile{Email: email, FirstName: "Racer"})
		}(i)
	}
	close(start)
	wg.Wait()

	var winner *pgstore.Account
	creations := 0
	for i := range results {
		if failures[i] != nil {
			t.Fatalf("worker %d failed: %v", i, failures[i])
		}
		if results[i] == nil {
			t.Fatalf("worker %d returned no account", i)
		}
		if created[i] {
			creations++
		}
		if winner == nil {
			winner = results[i]
		} else if results[i].ID != winner.ID {
			t.Fatalf("concurrent sign-ins resolved different accounts: %s vs %s", winner.ID, results[i].ID)
		}
	}
	if creations != 1 {
		t.Fatalf("exactly one sign-in should report creation, got %d", creations)
	}
	var accounts, identities int
	if err := pool.QueryRow(ctx, `SELECT (SELECT count(*) FROM accounts WHERE lower(email) = lower($1)), (SELECT count(*) FROM platform_identities WHERE external_user_id = $2)`, email, winner.ExternalUserID).Scan(&accounts, &identities); err != nil {
		t.Fatal(err)
	}
	if accounts != 1 || identities != 1 {
		t.Fatalf("concurrent sign-ins created accounts=%d identities=%d", accounts, identities)
	}
}

// TestEnsureIntegrationDocumentConcurrentCreatesAtMostOnce proves that
// concurrent first authenticated requests for one account do not fail while
// creating the retained integration document and create it at most once.
func TestEnsureIntegrationDocumentConcurrentCreatesAtMostOnce(t *testing.T) {
	initAccountExistenceTestMongo(t)
	externalUserID := primitive.NewObjectID().Hex()
	objectID, err := primitive.ObjectIDFromHex(externalUserID)
	if err != nil {
		t.Fatal(err)
	}
	t.Cleanup(func() {
		if _, err := db.UsersCollection.DeleteOne(context.Background(), bson.M{"_id": objectID}); err != nil {
			t.Errorf("delete retained integration document: %v", err)
		}
	})

	const workers = 8
	failures := make([]error, workers)
	start := make(chan struct{})
	var wg sync.WaitGroup
	for i := 0; i < workers; i++ {
		wg.Add(1)
		go func(i int) {
			defer wg.Done()
			<-start
			user, err := EnsureIntegrationDocument(context.Background(), externalUserID)
			if err == nil && user == nil {
				err = errors.New("no integration document returned")
			}
			failures[i] = err
		}(i)
	}
	close(start)
	wg.Wait()

	for i, err := range failures {
		if err != nil {
			t.Fatalf("worker %d failed: %v", i, err)
		}
	}
	count, err := db.UsersCollection.CountDocuments(context.Background(), bson.M{"_id": objectID})
	if err != nil {
		t.Fatal(err)
	}
	if count != 1 {
		t.Fatalf("retained integration document count = %d, want 1", count)
	}
}

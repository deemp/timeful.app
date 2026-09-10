// mongo_accounts_to_postgres backfills authoritative PostgreSQL accounts from
// retained MongoDB user documents. It never modifies the MongoDB source. The
// backfill is idempotent through platform_identities.external_user_id and the
// unique accounts.platform_identity_id, so repeated or interrupted runs do not
// create duplicate identities or accounts.
package main

import (
	"context"
	"errors"
	"flag"
	"fmt"
	"os"
	"strings"

	"github.com/jackc/pgx/v5"
	"github.com/jackc/pgx/v5/pgxpool"
	"go.mongodb.org/mongo-driver/bson"
	"go.mongodb.org/mongo-driver/bson/primitive"
	"go.mongodb.org/mongo-driver/mongo"
	"go.mongodb.org/mongo-driver/mongo/options"
	"timeful/server/models"
	pgstore "timeful/server/postgres"
)

const usage = "usage: go run ./scripts/20260910_mongo_accounts_to_postgres [--apply] [--batch-size N]"

type configuration struct {
	apply       bool
	batchSize   int64
	mongoURI    string
	mongoDB     string
	postgresURI string
}

type migrationSummary struct {
	Migrated int
	Skipped  int
	Scanned  int
}

func main() {
	config, err := parseConfiguration(os.Args[1:])
	if err != nil {
		fmt.Fprintln(os.Stderr, err)
		fmt.Fprintln(os.Stderr, usage)
		os.Exit(2)
	}

	ctx := context.Background()
	mongoClient, err := mongo.Connect(ctx, options.Client().ApplyURI(config.mongoURI))
	if err != nil {
		fatal(err)
	}
	defer mongoClient.Disconnect(ctx)

	postgresPool, err := pgxpool.New(ctx, config.postgresURI)
	if err != nil {
		fatal(err)
	}
	defer postgresPool.Close()
	if err := postgresPool.Ping(ctx); err != nil {
		fatal(err)
	}

	summary, err := migrateAccounts(ctx, mongoClient.Database(config.mongoDB), postgresPool, config)
	if err != nil {
		fatal(err)
	}

	fmt.Printf("scanned=%d migrated=%d skipped=%d\n", summary.Scanned, summary.Migrated, summary.Skipped)
	if !config.apply {
		fmt.Println("preflight passed; rerun with --apply to write PostgreSQL accounts")
	}
}

func parseConfiguration(arguments []string) (configuration, error) {
	flags := flag.NewFlagSet("mongo_accounts_to_postgres", flag.ContinueOnError)
	flags.SetOutput(os.Stderr)
	config := configuration{}
	flags.BoolVar(&config.apply, "apply", false, "write PostgreSQL accounts")
	flags.Int64Var(&config.batchSize, "batch-size", 200, "accounts read per MongoDB page")
	flags.StringVar(&config.mongoURI, "mongo-uri", os.Getenv("MONGODB_URI"), "MongoDB connection URI")
	flags.StringVar(&config.mongoDB, "mongo-database", os.Getenv("MONGODB_DATABASE"), "MongoDB database name")
	flags.StringVar(&config.postgresURI, "postgres-uri", os.Getenv("POSTGRES_APPLICATION_URI"), "PostgreSQL connection URI")
	if err := flags.Parse(arguments); err != nil {
		return config, err
	}
	if config.mongoURI == "" || config.mongoDB == "" || config.postgresURI == "" {
		return config, errors.New("MONGODB_URI, MONGODB_DATABASE, and POSTGRES_APPLICATION_URI must be set")
	}
	if config.batchSize < 1 {
		return config, errors.New("batch size must be positive")
	}
	return config, nil
}

func migrateAccounts(ctx context.Context, database *mongo.Database, pool *pgxpool.Pool, config configuration) (migrationSummary, error) {
	repository := pgstore.NewRepository(pool)
	collection := database.Collection("users")
	summary := migrationSummary{}

	// hasCursor separates "no page read yet" from a legitimate zero ObjectID.
	// Using lastID.IsZero() as the sentinel would make a zero-identifier source
	// document re-read the same first page forever.
	var lastID primitive.ObjectID
	hasCursor := false
	for {
		cursor, err := collection.Find(ctx, pageFilter(lastID, hasCursor), options.Find().SetSort(bson.M{"_id": 1}).SetLimit(config.batchSize))
		if err != nil {
			return summary, err
		}
		users := make([]models.User, 0, config.batchSize)
		if err := cursor.All(ctx, &users); err != nil {
			cursor.Close(ctx)
			return summary, err
		}
		cursor.Close(ctx)
		if len(users) == 0 {
			break
		}

		for _, user := range users {
			summary.Scanned++
			if err := migrateAccountUnit(ctx, repository, user, config.apply, &summary); err != nil {
				return summary, err
			}
			// Advance the source cursor only after the unit committed, so an
			// interruption resumes from the first incomplete account.
			lastID = user.Id
			hasCursor = true
		}
		if int64(len(users)) < config.batchSize {
			break
		}
	}
	return summary, nil
}

// migrateAccountUnit applies one account and its platform identity. It skips an
// account that already exists, and in preflight mode it reports the work without
// writing. A zero ObjectID is a legitimate source identifier and is migrated.
func migrateAccountUnit(ctx context.Context, repository *pgstore.Repository, user models.User, apply bool, summary *migrationSummary) error {
	externalUserID := user.Id.Hex()
	if _, err := repository.GetAccountByExternalUserID(ctx, externalUserID); err == nil {
		summary.Skipped++
		return nil
	} else if !errors.Is(err, pgx.ErrNoRows) {
		return err
	}
	if !apply {
		summary.Migrated++
		return nil
	}
	if _, err := repository.FindOrCreateAccount(ctx, externalUserID, buildAccount(user)); err != nil {
		return fmt.Errorf("migrate account %s: %w", externalUserID, err)
	}
	summary.Migrated++
	return nil
}

func pageFilter(lastID primitive.ObjectID, hasCursor bool) bson.M {
	if !hasCursor {
		return bson.M{}
	}
	return bson.M{"_id": bson.M{"$gt": lastID}}
}

func buildAccount(user models.User) pgstore.Account {
	return pgstore.Account{
		Email:            strings.TrimSpace(user.Email),
		FirstName:        user.FirstName,
		LastName:         user.LastName,
		Picture:          user.Picture,
		HasCustomName:    user.HasCustomName,
		TimezoneOffset:   user.TimezoneOffset,
		NumEventsCreated: user.NumEventsCreated,
	}
}

func fatal(err error) {
	fmt.Fprintln(os.Stderr, err)
	os.Exit(1)
}

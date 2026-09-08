package postgres

import (
	"context"
	"os"
	"strings"
	"testing"

	"github.com/jackc/pgx/v5/pgxpool"
)

func TestVisitorIdentityMigrationBackfill(t *testing.T) {
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
		t.Fatal("requires isolated test database")
	}
	pool, err := pgxpool.NewWithConfig(ctx, config)
	if err != nil {
		t.Fatal(err)
	}
	defer pool.Close()
	tx, err := pool.Begin(ctx)
	if err != nil {
		t.Fatal(err)
	}
	defer tx.Rollback(ctx)
	// Temporary tables shadow the real schema, exercising the exact migration
	// with legacy rows while leaving all test-stack records untouched.
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
	var eventID string
	if err := tx.QueryRow(ctx, `INSERT INTO postgres_events (short_id,name,type) VALUES ('ABCD1234','Backfill','specific_dates') RETURNING id`).Scan(&eventID); err != nil {
		t.Fatal(err)
	}
	_, err = tx.Exec(ctx, `INSERT INTO postgres_event_responses (event_id,respondent_kind,account_user_id,guest_id,canonical_guest_name,payload) VALUES
 ($1,'account','external-account',NULL,NULL,'{"name":"Account","availability":[1]}'),
 ($1,'guest',NULL,'guest-token','Ada','{"name":"Ada","availability":[2]}'),
 ($1,'guest',NULL,NULL,'Legacy','{"name":"Legacy","availability":[3]}')`, eventID)
	if err != nil {
		t.Fatal(err)
	}
	apply("20260908160000_visitor_identities.sql")
	var count, publicIDs, owners, associated int
	err = tx.QueryRow(ctx, `SELECT count(*),count(DISTINCT r.public_id),count(DISTINCT v.id),count(p.id)
 FROM postgres_event_responses r JOIN event_visitor_identities v ON v.id=r.event_visitor_identity_id AND v.event_id=r.event_id
 LEFT JOIN platform_identities p ON p.id=v.platform_identity_id`).Scan(&count, &publicIDs, &owners, &associated)
	if err != nil {
		t.Fatal(err)
	}
	if count != 3 || publicIDs != 3 || owners != 3 || associated != 1 {
		t.Fatalf("backfill lost ownership: %d %d %d %d", count, publicIDs, owners, associated)
	}
	var preserved bool
	if err := tx.QueryRow(ctx, `SELECT bool_and(payload->>'name' IN ('Account','Ada','Legacy') AND jsonb_array_length(payload->'availability')=1) FROM postgres_event_responses`).Scan(&preserved); err != nil || !preserved {
		t.Fatalf("payload loss: %v", err)
	}
}

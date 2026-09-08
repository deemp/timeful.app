package postgres

import (
	"context"
	"crypto/sha256"
	"os"
	"strings"
	"testing"

	"github.com/jackc/pgx/v5/pgxpool"
)

func TestVisitorIdentityRepository(t *testing.T) {
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
	defer pool.Close()
	tx, err := pool.Begin(ctx)
	if err != nil {
		t.Fatal(err)
	}
	defer tx.Rollback(ctx)
	repo := &Repository{db: tx}
	first := &Event{Name: "Identity repository", Type: EventTypeSpecificDates}
	second := &Event{Name: "Other event", Type: EventTypeSpecificDates}
	for _, event := range []*Event{first, second} {
		if err := repo.CreateEvent(ctx, event); err != nil {
			t.Fatal(err)
		}
	}
	visitor, err := repo.CreateEventVisitorIdentity(ctx, first.ID)
	if err != nil {
		t.Fatal(err)
	}
	if visitor.ID == visitor.PublicID || visitor.PublicID == "" {
		t.Fatal("public identity must be separate")
	}
	platform, err := repo.FindOrCreatePlatformIdentity(ctx, "identity-test-"+first.ID)
	if err != nil {
		t.Fatal(err)
	}
	same, err := repo.FindOrCreatePlatformIdentity(ctx, platform.ExternalUserID)
	if err != nil || same.ID != platform.ID {
		t.Fatalf("unstable platform identity: %v", err)
	}
	if err := repo.AssociateEventVisitorIdentity(ctx, visitor.ID, platform.ID); err != nil {
		t.Fatal(err)
	}
	if ok, err := repo.VisitorBelongsToAccount(ctx, visitor.ID, platform.ExternalUserID); err != nil || !ok {
		t.Fatalf("association: %v", err)
	}
	if ok, err := repo.VisitorBelongsToAccount(ctx, visitor.ID, "unrelated"); err != nil || ok {
		t.Fatalf("unrelated account authorized: %v", err)
	}
	hash := sha256.Sum256([]byte("test credential"))
	credential := &EventVisitorCredential{EventVisitorIdentityID: visitor.ID, CredentialHash: hash[:]}
	if err := repo.CreateEventVisitorCredential(ctx, credential); err != nil {
		t.Fatal(err)
	}
	if err := repo.RevokeEventVisitorCredentials(ctx, visitor.ID); err != nil {
		t.Fatal(err)
	}
	stored, err := repo.GetEventVisitorCredential(ctx, visitor.ID, credential.ID)
	if err != nil || stored.RevokedAt == nil {
		t.Fatalf("revocation: %v", err)
	}
	for i := 0; i < 2; i++ {
		response := &Response{EventID: first.ID, EventVisitorIdentityID: visitor.ID, RespondentKind: RespondentKindGuest}
		if err := repo.CreateResponse(ctx, response); err != nil {
			t.Fatal(err)
		}
		fetched, err := repo.GetResponseByPublicID(ctx, first.ID, response.PublicID)
		if err != nil || fetched.ID != response.ID {
			t.Fatalf("opaque response lookup: %v", err)
		}
	}
	rows, err := repo.ListResponses(ctx, first.ID)
	if err != nil || len(rows) != 2 {
		t.Fatalf("multiple responses: %d %v", len(rows), err)
	}
	mismatch := &Response{EventID: second.ID, EventVisitorIdentityID: visitor.ID, RespondentKind: RespondentKindGuest}
	if err := repo.CreateResponse(ctx, mismatch); err == nil {
		t.Fatal("accepted visitor from another event")
	}
}

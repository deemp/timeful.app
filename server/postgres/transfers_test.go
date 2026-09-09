package postgres

import (
	"context"
	"crypto/sha256"
	"errors"
	"github.com/jackc/pgx/v5"
	"os"
	"strings"
	"testing"
	"time"

	"github.com/jackc/pgx/v5/pgxpool"
)

func TestAccessTransferRepository(t *testing.T) {
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

	event := &Event{Name: "Transfer repository", Type: EventTypeSpecificDates}
	if err := repo.CreateEvent(ctx, event); err != nil {
		t.Fatal(err)
	}
	visitor, err := repo.CreateEventVisitorIdentity(ctx, event.ID)
	if err != nil {
		t.Fatal(err)
	}
	hash := sha256.Sum256([]byte("source proof"))
	base := &EventVisitorCredential{EventVisitorIdentityID: visitor.ID, CredentialHash: hash[:]}
	if err := repo.CreateEventVisitorCredential(ctx, base); err != nil {
		t.Fatal(err)
	}
	transfer := &AccessTransfer{EventID: event.ID, SourceHash: hash[:], SourceCredentialID: &base.ID}
	before := time.Now()
	if err := repo.CreateAccessTransfer(ctx, transfer); err != nil {
		t.Fatal(err)
	}
	if transfer.State != "pending" || transfer.ExpiresAt.Before(before.Add(299*time.Second)) || transfer.ExpiresAt.After(time.Now().Add(301*time.Second)) {
		t.Fatal("wrong initial state or deadline")
	}
	other := &Event{Name: "Other event", Type: EventTypeSpecificDates}
	if err := repo.CreateEvent(ctx, other); err != nil {
		t.Fatal(err)
	}
	if _, err := repo.LockAccessTransfer(ctx, other.ID, transfer.ID); !errors.Is(err, pgx.ErrNoRows) {
		t.Fatalf("cross-event lookup: %v", err)
	}
	for _, code := range []string{"AAAAAAAA", "BBBBBBBB"} {
		target := &TransferRequest{Code: code, TargetHash: hash[:]}
		if err := repo.CreateTransferRequest(ctx, transfer.ID, target); err != nil {
			t.Fatal(err)
		}
	}
	requests, err := repo.ListTransferRequests(ctx, transfer.ID)
	if err != nil || len(requests) != 2 || requests[0].ID == requests[1].ID {
		t.Fatalf("independent requests: %v", err)
	}
	grant := &EventVisitorCredential{EventVisitorIdentityID: visitor.ID, CredentialHash: hash[:], Kind: CredentialKindGranted}
	if err := repo.CreateEventVisitorCredential(ctx, grant); err != nil {
		t.Fatal(err)
	}
	transfer.State = "redeemed"
	transfer.ApprovedRequestID = &requests[0].ID
	transfer.GrantID = &grant.ID
	if err := repo.SaveAccessTransfer(ctx, transfer); err != nil {
		t.Fatal(err)
	}
	stored, err := repo.LockAccessTransfer(ctx, event.ID, transfer.ID)
	if err != nil || stored.State != "redeemed" || stored.GrantID == nil || *stored.GrantID != grant.ID || !stored.ExpiresAt.Equal(transfer.ExpiresAt) {
		t.Fatalf("lost transition or deadline: %v", err)
	}
	if err := repo.RevokeGrantedCredential(ctx, grant.ID); err != nil {
		t.Fatal(err)
	}
	revoked, err := repo.GetEventVisitorCredential(ctx, visitor.ID, grant.ID)
	if err != nil || revoked.RevokedAt == nil {
		t.Fatalf("grant not revoked: %v", err)
	}
	original, err := repo.GetTransferSourceCredential(ctx, base.ID)
	if err != nil || original.RevokedAt != nil {
		t.Fatalf("source affected by grant revocation: %v", err)
	}
	source, err := repo.GetTransferSourceVisitor(ctx, original.EventVisitorIdentityID)
	if err != nil || source.ID != visitor.ID || source.PlatformIdentityID != nil {
		t.Fatalf("source ownership changed: %v", err)
	}
}

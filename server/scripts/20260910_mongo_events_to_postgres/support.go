package main

import (
	"context"
	"errors"

	"github.com/jackc/pgx/v5"
	"github.com/jackc/pgx/v5/pgconn"
	"go.mongodb.org/mongo-driver/bson"
	"go.mongodb.org/mongo-driver/bson/primitive"
)

// querier is satisfied by *pgxpool.Pool and pgx.Tx so migration helpers run
// either statement-by-statement or inside one unit transaction.
type querier interface {
	Exec(context.Context, string, ...any) (pgconn.CommandTag, error)
	Query(context.Context, string, ...any) (pgx.Rows, error)
	QueryRow(context.Context, string, ...any) pgx.Row
}

const (
	// Ledger and quarantine kinds.
	ledgerKindEvent          = "event"
	ledgerKindFolder         = "folder"
	ledgerKindQuarantineItem = "response"

	// Quarantine reason codes from the migration contract.
	reasonMissingOwnerAccount     = "missing-owner-account"
	reasonIncompleteTokenOwner    = "incomplete-token-ownership"
	reasonMissingResponseIdentity = "missing-response-identity"
	reasonInvalidGuestName        = "invalid-guest-name"
	reasonOrphanResponse          = "orphan-response"
	reasonOrphanMembership        = "orphan-membership"
	reasonLegacyGuestCredential   = "legacy-guest-credential"

	// PostgreSQL event kinds.
	eventKindSpecificDates = "specific_dates"
	eventKindDayOfWeek     = "dow"
	eventKindSignup        = "signup"
	eventKindGroup         = "group"

	// PostgreSQL respondent kinds.
	respondentKindAccount = "account"
	respondentKindGuest   = "guest"
)

// errAccountDeleted reports that a platform identifier is tombstoned. A
// migration unit never resurrects a deleted account.
var errAccountDeleted = errors.New("account is deleted")

func isNoRows(err error) bool {
	return errors.Is(err, pgx.ErrNoRows)
}

func isUniqueViolation(err error) bool {
	var postgresError *pgconn.PgError
	return errors.As(err, &postgresError) && postgresError.Code == "23505"
}

// ensurePlatformIdentity resolves or creates the single platform identity for a
// legacy external account identifier. It respects the account deletion
// tombstone so a backfill cannot resurrect a deleted account.
func ensurePlatformIdentity(ctx context.Context, tx querier, externalUserID string) (string, error) {
	if externalUserID == "" {
		return "", errors.New("external user ID is required")
	}
	var deleted bool
	if err := tx.QueryRow(ctx, `SELECT EXISTS (SELECT 1 FROM account_deletion_tombstones WHERE external_user_id = $1)`, externalUserID).Scan(&deleted); err != nil {
		return "", err
	}
	if deleted {
		return "", errAccountDeleted
	}
	var id string
	if err := tx.QueryRow(ctx, `INSERT INTO platform_identities (external_user_id) VALUES ($1)
ON CONFLICT (external_user_id) DO UPDATE SET external_user_id = EXCLUDED.external_user_id
RETURNING id`, externalUserID).Scan(&id); err != nil {
		return "", err
	}
	return id, nil
}

// pageFilter advances a MongoDB _id cursor without treating a legitimate zero
// ObjectID as "no page read yet".
func pageFilter(lastID primitive.ObjectID, hasCursor bool) bson.M {
	if !hasCursor {
		return bson.M{}
	}
	return bson.M{"_id": bson.M{"$gt": lastID}}
}

package postgres

import (
	"context"
	"errors"
	"time"

	"github.com/jackc/pgx/v5"
)

// Account is the authoritative PostgreSQL identity and profile for a legacy or
// new account. ExternalUserID is the value held in the sign-in session and in
// platform_identities.external_user_id; it is the hexadecimal MongoDB users._id
// for legacy accounts and a fresh hexadecimal object identifier for new ones.
type Account struct {
	ID                 string
	PlatformIdentityID string
	ExternalUserID     string
	Email              string
	FirstName          string
	LastName           string
	Picture            string
	HasCustomName      *bool
	TimezoneOffset     int
	NumEventsCreated   int
	CreatedAt          time.Time
	UpdatedAt          time.Time
}

// ErrAccountDeleted reports that the external user identifier is permanently
// tombstoned. A tombstoned identifier must never create or adopt an account, so
// a backfill or concurrent creation cannot resurrect a deleted account.
var ErrAccountDeleted = errors.New("account is deleted")

const accountColumns = `a.id, a.platform_identity_id, p.external_user_id, a.email, a.first_name, a.last_name, a.picture, a.has_custom_name, a.timezone_offset, a.num_events_created, a.created_at, a.updated_at`

func scanAccount(row interface{ Scan(...any) error }) (*Account, error) {
	account := &Account{}
	err := row.Scan(
		&account.ID,
		&account.PlatformIdentityID,
		&account.ExternalUserID,
		&account.Email,
		&account.FirstName,
		&account.LastName,
		&account.Picture,
		&account.HasCustomName,
		&account.TimezoneOffset,
		&account.NumEventsCreated,
		&account.CreatedAt,
		&account.UpdatedAt,
	)
	if err != nil {
		return nil, err
	}
	return account, nil
}

func (r *Repository) getAccount(ctx context.Context, predicate string, values ...any) (*Account, error) {
	return scanAccount(r.db.QueryRow(ctx, `SELECT `+accountColumns+` FROM accounts a JOIN platform_identities p ON p.id = a.platform_identity_id WHERE `+predicate, values...))
}

// GetAccountByExternalUserID resolves the account for a sign-in session value.
func (r *Repository) GetAccountByExternalUserID(ctx context.Context, externalUserID string) (*Account, error) {
	if externalUserID == "" {
		return nil, errors.New("account external user ID is required")
	}
	return r.getAccount(ctx, `p.external_user_id = $1`, externalUserID)
}

// GetAccountByEmail resolves the oldest account for a case-insensitive email.
// Email is not unique by contract, so a deterministic order is required.
func (r *Repository) GetAccountByEmail(ctx context.Context, email string) (*Account, error) {
	if email == "" {
		return nil, errors.New("account email is required")
	}
	return r.getAccount(ctx, `lower(a.email) = lower($1) ORDER BY a.created_at, a.id LIMIT 1`, email)
}

// FindOrCreateAccount links the legacy external user ID to a platform identity
// and inserts the account once. Re-running against an existing account returns
// the stored row without creating a duplicate identity or account. The identity
// and the account are written in one transaction, so a crash or cancellation
// cannot leave a partially applied migration unit. A repository that is already
// transaction-scoped (for example the sign-in path) reuses that transaction.
func (r *Repository) FindOrCreateAccount(ctx context.Context, externalUserID string, initial Account) (*Account, error) {
	if externalUserID == "" {
		return nil, errors.New("account external user ID is required")
	}
	var account *Account
	err := r.withTransaction(ctx, func(ctx context.Context, tx *Repository) error {
		platform, err := tx.FindOrCreatePlatformIdentity(ctx, externalUserID)
		if err != nil {
			return err
		}
		if _, err := tx.db.Exec(ctx, `INSERT INTO accounts
 (platform_identity_id, email, first_name, last_name, picture, has_custom_name, timezone_offset, num_events_created)
VALUES ($1, $2, $3, $4, $5, $6, $7, $8)
ON CONFLICT (platform_identity_id) DO NOTHING`,
			platform.ID, initial.Email, initial.FirstName, initial.LastName, initial.Picture, initial.HasCustomName, initial.TimezoneOffset, initial.NumEventsCreated); err != nil {
			return err
		}
		account, err = tx.GetAccountByExternalUserID(ctx, externalUserID)
		return err
	})
	if err != nil {
		return nil, err
	}
	return account, nil
}

// FindOrCreateAccountByEmail resolves the single account for a case-insensitive
// email or creates it when none exists. Concurrent first-time sign-ins for the
// same email are serialized by a transaction-scoped advisory lock, so only one
// account and platform identity can be created; the request that loses the race
// is returned the winner's account instead of inserting a duplicate. Distinct
// accounts whose emails already compare equal are left untouched, because email
// is deliberately not unique. The boolean reports whether this call created the
// account.
func (r *Repository) FindOrCreateAccountByEmail(ctx context.Context, email, externalUserID string, initial Account) (*Account, bool, error) {
	if email == "" {
		return nil, false, errors.New("account email is required")
	}
	var account *Account
	var created bool
	err := r.withTransaction(ctx, func(ctx context.Context, tx *Repository) error {
		if _, err := tx.db.Exec(ctx, `SELECT pg_advisory_xact_lock(hashtextextended(lower($1), 0))`, email); err != nil {
			return err
		}
		existing, err := tx.GetAccountByEmail(ctx, email)
		if err == nil {
			account = existing
			return nil
		}
		if !errors.Is(err, pgx.ErrNoRows) {
			return err
		}
		account, err = tx.FindOrCreateAccount(ctx, externalUserID, initial)
		if err != nil {
			return err
		}
		created = true
		return nil
	})
	if err != nil {
		return nil, false, err
	}
	return account, created, nil
}

// UpdateAccountProfile writes the authoritative profile fields. Calendar
// connections, tokens, preferences, and the usage counter are never written
// here; the counter advances only through IncrementAccountEventsCreated.
func (r *Repository) UpdateAccountProfile(ctx context.Context, account *Account) error {
	if account == nil || account.ID == "" {
		return errors.New("account ID is required")
	}
	return r.db.QueryRow(ctx, `UPDATE accounts
SET email = $2, first_name = $3, last_name = $4, picture = $5, has_custom_name = $6, timezone_offset = $7, updated_at = clock_timestamp()
WHERE id = $1 RETURNING updated_at`,
		account.ID, account.Email, account.FirstName, account.LastName, account.Picture, account.HasCustomName, account.TimezoneOffset).Scan(&account.UpdatedAt)
}

// IncrementAccountEventsCreated advances the usage counter without touching the
// rest of the profile.
func (r *Repository) IncrementAccountEventsCreated(ctx context.Context, externalUserID string) error {
	_, err := r.db.Exec(ctx, `UPDATE accounts SET num_events_created = num_events_created + 1, updated_at = clock_timestamp()
WHERE platform_identity_id = (SELECT id FROM platform_identities WHERE external_user_id = $1)`, externalUserID)
	return err
}

// AccountDeleted reports whether an external user identifier is tombstoned.
func (r *Repository) AccountDeleted(ctx context.Context, externalUserID string) (bool, error) {
	if externalUserID == "" {
		return false, errors.New("account external user ID is required")
	}
	var deleted bool
	if err := r.db.QueryRow(ctx, `SELECT EXISTS (SELECT 1 FROM account_deletion_tombstones WHERE external_user_id = $1)`, externalUserID).Scan(&deleted); err != nil {
		return false, err
	}
	return deleted, nil
}

// DeleteAccountByExternalUserID permanently removes the account authority and
// everything the deleted visitor owns, then records a tombstone so the identity
// can never be recreated. It runs as one transaction under the same advisory
// lock that creation paths use, so a concurrent account backfill either
// completes before the deletion or is rejected afterwards by the tombstone.
//
// Events the account organized survive: their ownership pointers are released
// while the events and every other guest's response stay intact. The account's
// own responses, event visitor identities, credentials, and transfers are
// removed. Repeating the call against an already-deleted account is a no-op.
func (r *Repository) DeleteAccountByExternalUserID(ctx context.Context, externalUserID string) error {
	if externalUserID == "" {
		return errors.New("account external user ID is required")
	}
	return r.withTransaction(ctx, func(ctx context.Context, tx *Repository) error {
		if _, err := tx.db.Exec(ctx, `SELECT pg_advisory_xact_lock(hashtextextended($1, 0))`, externalUserID); err != nil {
			return err
		}
		var platformIdentityID string
		err := tx.db.QueryRow(ctx, `SELECT id FROM platform_identities WHERE external_user_id = $1`, externalUserID).Scan(&platformIdentityID)
		if err != nil && !errors.Is(err, pgx.ErrNoRows) {
			return err
		}
		if err == nil {
			if err := tx.deleteAccountAuthority(ctx, externalUserID, platformIdentityID); err != nil {
				return err
			}
		}
		_, err = tx.db.Exec(ctx, `INSERT INTO account_deletion_tombstones (external_user_id) VALUES ($1)
ON CONFLICT (external_user_id) DO NOTHING`, externalUserID)
		return err
	})
}

// deleteAccountAuthority removes one platform identity's account and everything
// it owns. Visitor identities tied to the account either directly through the
// platform mapping or through a legacy response's account reference are removed
// together with their credentials and transfers.
func (r *Repository) deleteAccountAuthority(ctx context.Context, externalUserID, platformIdentityID string) error {
	visitorIDs := []string{}
	rows, err := r.db.Query(ctx, `SELECT id FROM event_visitor_identities WHERE platform_identity_id = $1
UNION
SELECT event_visitor_identity_id FROM postgres_event_responses WHERE account_user_id = $2
UNION
SELECT event_visitor_identity_id FROM event_signup_responses WHERE account_user_id = $2`, platformIdentityID, externalUserID)
	if err != nil {
		return err
	}
	for rows.Next() {
		var visitorID string
		if err := rows.Scan(&visitorID); err != nil {
			rows.Close()
			return err
		}
		visitorIDs = append(visitorIDs, visitorID)
	}
	rows.Close()
	if err := rows.Err(); err != nil {
		return err
	}

	// Sever transfer references to the account or its visitor credentials
	// before the credentials cascade away with their visitor identities.
	if _, err := r.db.Exec(ctx, `DELETE FROM access_transfers
WHERE external_user_id = $1
   OR source_credential_id IN (SELECT id FROM event_visitor_credentials WHERE event_visitor_identity_id = ANY($2))
   OR grant_id IN (SELECT id FROM event_visitor_credentials WHERE event_visitor_identity_id = ANY($2))`,
		externalUserID, visitorIDs); err != nil {
		return err
	}

	// Release event ownership while preserving the events themselves and every
	// other guest's response.
	if _, err := r.db.Exec(ctx, `UPDATE postgres_events
SET owner_platform_identity_id = NULL, owner_external_id = NULL, owner_event_visitor_identity_id = NULL, updated_at = clock_timestamp()
WHERE owner_platform_identity_id = $1
   OR owner_external_id = $2
   OR owner_event_visitor_identity_id = ANY($3)`, platformIdentityID, externalUserID, visitorIDs); err != nil {
		return err
	}

	// Release the account's group attendee relations; the email-keyed
	// memberships survive so the groups keep their invitee lists.
	if _, err := r.db.Exec(ctx, `UPDATE event_attendees
SET account_user_id = NULL, updated_at = clock_timestamp()
WHERE account_user_id = $1`, externalUserID); err != nil {
		return err
	}

	if _, err := r.db.Exec(ctx, `DELETE FROM postgres_event_responses
WHERE account_user_id = $1 OR event_visitor_identity_id = ANY($2)`, externalUserID, visitorIDs); err != nil {
		return err
	}
	if _, err := r.db.Exec(ctx, `DELETE FROM event_signup_responses
WHERE account_user_id = $1 OR event_visitor_identity_id::text = ANY($2)`, externalUserID, visitorIDs); err != nil {
		return err
	}
	if _, err := r.db.Exec(ctx, `DELETE FROM event_visitor_identities WHERE id = ANY($1)`, visitorIDs); err != nil {
		return err
	}
	// Folder memberships cascade with their account-scoped folders.
	if _, err := r.db.Exec(ctx, `DELETE FROM folders WHERE account_user_id = $1`, externalUserID); err != nil {
		return err
	}
	if _, err := r.db.Exec(ctx, `DELETE FROM accounts WHERE platform_identity_id = $1`, platformIdentityID); err != nil {
		return err
	}
	_, err = r.db.Exec(ctx, `DELETE FROM platform_identities WHERE id = $1`, platformIdentityID)
	return err
}

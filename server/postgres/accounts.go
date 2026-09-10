package postgres

import (
	"context"
	"errors"
	"time"
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
// the stored row without creating a duplicate identity or account.
func (r *Repository) FindOrCreateAccount(ctx context.Context, externalUserID string, initial Account) (*Account, error) {
	platform, err := r.FindOrCreatePlatformIdentity(ctx, externalUserID)
	if err != nil {
		return nil, err
	}
	if _, err := r.db.Exec(ctx, `INSERT INTO accounts
 (platform_identity_id, email, first_name, last_name, picture, has_custom_name, timezone_offset, num_events_created)
VALUES ($1, $2, $3, $4, $5, $6, $7, $8)
ON CONFLICT (platform_identity_id) DO UPDATE SET platform_identity_id = EXCLUDED.platform_identity_id`,
		platform.ID, initial.Email, initial.FirstName, initial.LastName, initial.Picture, initial.HasCustomName, initial.TimezoneOffset, initial.NumEventsCreated); err != nil {
		return nil, err
	}
	return r.GetAccountByExternalUserID(ctx, externalUserID)
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

// DeleteAccountByExternalUserID removes only the PostgreSQL account authority.
// The retained integration document and the platform identity are left intact.
func (r *Repository) DeleteAccountByExternalUserID(ctx context.Context, externalUserID string) error {
	_, err := r.db.Exec(ctx, `DELETE FROM accounts
WHERE platform_identity_id = (SELECT id FROM platform_identities WHERE external_user_id = $1)`, externalUserID)
	return err
}

package accounts

import (
	"context"

	"timeful/server/db"
	pgstore "timeful/server/postgres"
)

// Deleter orchestrates account deletion across the retained MongoDB store and
// the authoritative PostgreSQL store. The MongoDB cleanup is idempotent and runs
// first while the account authority still resolves; the PostgreSQL transaction
// removes authority last and records the deletion tombstone. A failure at either
// step leaves the account authority intact and a retry converges, so deletion is
// atomic and idempotent by construction. The two steps are injectable so a test
// can force a partial failure.
type Deleter struct {
	CleanMongoData func(ctx context.Context, externalUserID string) error
	DeletePostgres func(ctx context.Context, externalUserID string) error
}

// DefaultDeleter returns the production cross-store deletion orchestrator.
func DefaultDeleter() Deleter {
	return Deleter{
		CleanMongoData: db.DeleteAccountData,
		DeletePostgres: func(ctx context.Context, externalUserID string) error {
			repository, err := pgstore.DefaultRepository()
			if err != nil {
				return err
			}
			return repository.DeleteAccountByExternalUserID(ctx, externalUserID)
		},
	}
}

// Delete applies the ordered cleanup. A nil step is skipped so a test can
// isolate one store.
func (d Deleter) Delete(ctx context.Context, externalUserID string) error {
	if d.CleanMongoData != nil {
		if err := d.CleanMongoData(ctx, externalUserID); err != nil {
			return err
		}
	}
	if d.DeletePostgres == nil {
		return nil
	}
	return d.DeletePostgres(ctx, externalUserID)
}

var defaultDeleter = DefaultDeleter()

// DeleteAccount permanently deletes the account and all data it owns across the
// retained MongoDB store and the authoritative PostgreSQL store.
func DeleteAccount(ctx context.Context, externalUserID string) error {
	return defaultDeleter.Delete(ctx, externalUserID)
}

// SetDefaultDeleter replaces the package deletion orchestrator and returns a
// function that restores the previous one. It exists so tests can force a
// partial MongoDB cleanup failure; it is not safe for concurrent use.
func SetDefaultDeleter(deleter Deleter) func() {
	previous := defaultDeleter
	defaultDeleter = deleter
	return func() { defaultDeleter = previous }
}

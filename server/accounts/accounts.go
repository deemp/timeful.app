// Package accounts is the explicit boundary between the authoritative
// PostgreSQL account and the retained MongoDB integration document. Profile and
// identity resolve through PostgreSQL; calendar connections, provider tokens,
// and calendar preferences stay in the retained users document keyed by the
// same external user identifier.
package accounts

import (
	"context"
	"errors"
	"strings"

	"github.com/jackc/pgx/v5"
	"go.mongodb.org/mongo-driver/bson/primitive"
	"timeful/server/db"
	"timeful/server/models"
	pgstore "timeful/server/postgres"
	"timeful/server/utils"
)

// ErrNotFound reports that neither a PostgreSQL account nor a retained legacy
// document exists for an identifier.
var ErrNotFound = errors.New("account not found")

// Profile carries the profile fields a sign-in provider or OTP flow supplies.
type Profile struct {
	Email          string
	FirstName      string
	LastName       string
	Picture        string
	TimezoneOffset int
}

// Lookup returns the authoritative account without creating authority from a
// retained document.
func Lookup(ctx context.Context, externalUserID string) (*pgstore.Account, error) {
	repository, err := pgstore.DefaultRepository()
	if err != nil {
		return nil, err
	}
	account, err := repository.GetAccountByExternalUserID(ctx, externalUserID)
	if errors.Is(err, pgx.ErrNoRows) {
		return nil, ErrNotFound
	}
	return account, err
}

// Resolve returns the account for an existing sign-in session. A session that
// predates the account cutover adopts its legacy MongoDB profile exactly once,
// linking the existing platform identity without creating a duplicate.
func Resolve(ctx context.Context, externalUserID string) (*pgstore.Account, error) {
	if externalUserID == "" {
		return nil, ErrNotFound
	}
	account, err := Lookup(ctx, externalUserID)
	if err == nil {
		return account, nil
	}
	if !errors.Is(err, ErrNotFound) {
		return nil, err
	}
	legacy := db.MongoUserById(externalUserID)
	if legacy == nil {
		return nil, ErrNotFound
	}
	return adopt(ctx, externalUserID, accountFromLegacy(legacy))
}

// ResolveForSignIn returns the account for an OAuth or OTP sign-in. It prefers
// the authoritative account by email, adopts a matching legacy MongoDB account,
// or creates a fresh account, in that order. The boolean reports whether the
// account was created during this call.
func ResolveForSignIn(ctx context.Context, profile Profile) (*pgstore.Account, bool, error) {
	email := utils.NormalizeEmail(profile.Email)
	if email == "" {
		return nil, false, errors.New("account email is required")
	}
	repository, err := pgstore.DefaultRepository()
	if err != nil {
		return nil, false, err
	}
	account, err := repository.GetAccountByEmail(ctx, email)
	if err == nil {
		return account, false, nil
	}
	if !errors.Is(err, pgx.ErrNoRows) {
		return nil, false, err
	}

	externalUserID := primitive.NewObjectID().Hex()
	initial := pgstore.Account{
		Email:          email,
		FirstName:      strings.TrimSpace(profile.FirstName),
		LastName:       strings.TrimSpace(profile.LastName),
		Picture:        profile.Picture,
		TimezoneOffset: profile.TimezoneOffset,
	}
	if legacy := db.MongoUserByEmail(email); legacy != nil {
		externalUserID = legacy.Id.Hex()
		initial = accountFromLegacy(legacy)
	}
	account, created, err := repository.FindOrCreateAccountByEmail(ctx, email, externalUserID, initial)
	if err != nil {
		return nil, false, err
	}
	return account, created, nil
}

// IsNewUser reports whether neither a PostgreSQL account nor a retained legacy
// document exists for the email. A PostgreSQL failure is returned as an error
// rather than reported as account-exists or account-missing, so callers never
// treat a transient database failure as an existence result. The retained
// legacy document is consulted only while the pool is deliberately
// uninitialized before account cutover, or when PostgreSQL has no account row.
func IsNewUser(email string) (bool, error) {
	email = utils.NormalizeEmail(email)
	if email == "" {
		return true, nil
	}
	repository, err := pgstore.DefaultRepository()
	if err != nil {
		if errors.Is(err, pgstore.ErrPoolUninitialized) {
			return db.MongoUserByEmail(email) == nil, nil
		}
		return false, err
	}
	if _, err := repository.GetAccountByEmail(context.Background(), email); err == nil {
		return false, nil
	} else if !errors.Is(err, pgx.ErrNoRows) {
		return false, err
	}
	return db.MongoUserByEmail(email) == nil, nil
}

// EnsureIntegrationDocument returns the retained MongoDB integration record,
// creating an empty one keyed by the account identifier when absent.
func EnsureIntegrationDocument(ctx context.Context, externalUserID string) (*models.User, error) {
	return db.EnsureIntegrationUser(externalUserID)
}

// UpdateProfile writes authoritative profile fields to PostgreSQL.
func UpdateProfile(ctx context.Context, account *pgstore.Account) error {
	repository, err := pgstore.DefaultRepository()
	if err != nil {
		return err
	}
	return repository.UpdateAccountProfile(ctx, account)
}

// IncrementEventsCreated advances the retained usage counter on the account.
func IncrementEventsCreated(ctx context.Context, externalUserID string) error {
	repository, err := pgstore.DefaultRepository()
	if err != nil {
		return err
	}
	return repository.IncrementAccountEventsCreated(ctx, externalUserID)
}

func adopt(ctx context.Context, externalUserID string, initial pgstore.Account) (*pgstore.Account, error) {
	repository, err := pgstore.DefaultRepository()
	if err != nil {
		return nil, err
	}
	return repository.FindOrCreateAccount(ctx, externalUserID, initial)
}

func accountFromLegacy(user *models.User) pgstore.Account {
	return pgstore.Account{
		Email:            user.Email,
		FirstName:        user.FirstName,
		LastName:         user.LastName,
		Picture:          user.Picture,
		HasCustomName:    user.HasCustomName,
		TimezoneOffset:   user.TimezoneOffset,
		NumEventsCreated: user.NumEventsCreated,
	}
}

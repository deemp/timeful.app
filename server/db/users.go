package db

import (
	"context"
	"errors"
	"strings"

	"github.com/jackc/pgx/v5"
	"go.mongodb.org/mongo-driver/bson"
	"go.mongodb.org/mongo-driver/bson/primitive"
	"go.mongodb.org/mongo-driver/mongo"
	"go.mongodb.org/mongo-driver/mongo/options"
	"timeful/server/logger"
	"timeful/server/models"
	pgstore "timeful/server/postgres"
)

// GetUserById returns the integration document overlaid with the authoritative
// PostgreSQL account profile. The retained MongoDB document supplies calendar
// connections, tokens, and preferences only; it never supplies account profile.
//
// A PostgreSQL lookup that fails for any reason other than a genuine no-row
// result yields nil instead of the retained document, so a transient database
// failure can never promote the retained profile to account authority. The
// retained document is returned only while the pool is deliberately
// uninitialized before account cutover, or when PostgreSQL has no account row
// for a legacy account that predates the backfill.
func GetUserById(userId string) *models.User {
	account, err := accountByExternalUserID(userId)
	if err != nil {
		logger.StdErr.Printf("account lookup failed for %s: %v", userId, err)
		return nil
	}
	mongoUser := getMongoUserById(userId)
	if account == nil {
		return mongoUser
	}
	return MergeAccountProfile(mongoUser, account)
}

// GetUserByEmail resolves the authoritative account by case-insensitive email
// and returns its integration document overlaid with the account profile. A
// PostgreSQL failure other than a genuine no-row result yields nil instead of
// the retained document, so the retained profile is never read as a second
// account authority.
func GetUserByEmail(email string) *models.User {
	emailQuery := strings.TrimSpace(email)
	if emailQuery == "" {
		return nil
	}
	account, err := accountByEmail(emailQuery)
	if err != nil {
		logger.StdErr.Printf("account lookup failed for %s: %v", emailQuery, err)
		return nil
	}
	if account == nil {
		return getMongoUserByEmail(emailQuery)
	}
	return MergeAccountProfile(getMongoUserById(account.ExternalUserID), account)
}

// MongoUserById returns the retained integration document without overlaying
// the PostgreSQL account profile.
func MongoUserById(userId string) *models.User {
	return getMongoUserById(userId)
}

// MongoUserByEmail returns the retained integration document found by email
// without consulting the PostgreSQL account authority.
func MongoUserByEmail(email string) *models.User {
	return getMongoUserByEmail(email)
}

// MergeAccountProfile overlays authoritative profile fields onto a retained
// integration document. It never reads or writes profile fields in MongoDB.
func MergeAccountProfile(user *models.User, account *pgstore.Account) *models.User {
	if account == nil {
		return user
	}
	if user == nil {
		user = &models.User{}
	}
	if objectID, err := primitive.ObjectIDFromHex(account.ExternalUserID); err == nil {
		user.Id = objectID
	}
	user.Email = account.Email
	user.FirstName = account.FirstName
	user.LastName = account.LastName
	user.Picture = account.Picture
	user.HasCustomName = account.HasCustomName
	user.TimezoneOffset = account.TimezoneOffset
	user.NumEventsCreated = account.NumEventsCreated
	return user
}

// EnsureIntegrationUser returns the retained integration document, creating an
// empty one keyed by the account identifier when it does not exist yet.
func EnsureIntegrationUser(userId string) (*models.User, error) {
	if user := getMongoUserById(userId); user != nil {
		return user, nil
	}
	objectID, err := primitive.ObjectIDFromHex(userId)
	if err != nil {
		return nil, errors.New("account identifier must be a hexadecimal object identifier")
	}
	user := &models.User{Id: objectID}
	if _, err := UsersCollection.InsertOne(context.Background(), user); err != nil {
		if !mongo.IsDuplicateKeyError(err) {
			return nil, err
		}
		// A concurrent first authenticated request created the document between
		// the lookup above and this insert. The conflicting insert is the
		// idempotent success, so return the document the winner created.
		return getMongoUserById(userId), nil
	}
	return user, nil
}

// UpdateUserIntegrationFields writes only retained integration fields so a
// calendar or token update never re-authors the PostgreSQL-owned profile.
func UpdateUserIntegrationFields(user *models.User) error {
	if user == nil {
		return errors.New("user is nil")
	}
	fields := bson.M{}
	if user.CalendarAccounts != nil {
		fields["calendarAccounts"] = user.CalendarAccounts
	}
	if user.CalendarOptions != nil {
		fields["calendarOptions"] = user.CalendarOptions
	}
	if user.PrimaryAccountKey != nil {
		fields["primaryAccountKey"] = user.PrimaryAccountKey
	}
	if user.TokenOrigin != "" {
		fields["tokenOrigin"] = user.TokenOrigin
	}
	if len(fields) == 0 {
		return nil
	}
	_, err := UsersCollection.UpdateOne(context.Background(), bson.M{"_id": user.Id}, bson.M{"$set": fields})
	return err
}

// accountByExternalUserID resolves the authoritative PostgreSQL account. A
// deliberately uninitialized pool reports the pre-cutover state and a missing
// account row reports a genuine not-found; both return no account. Every other
// PostgreSQL failure is returned so callers never fall back to the retained
// document or mistake the error for absence.
func accountByExternalUserID(userId string) (*pgstore.Account, error) {
	if userId == "" {
		return nil, nil
	}
	repository, err := pgstore.DefaultRepository()
	if err != nil {
		if errors.Is(err, pgstore.ErrPoolUninitialized) {
			return nil, nil
		}
		return nil, err
	}
	account, err := repository.GetAccountByExternalUserID(context.Background(), userId)
	if errors.Is(err, pgx.ErrNoRows) {
		return nil, nil
	}
	if err != nil {
		return nil, err
	}
	return account, nil
}

// accountByEmail applies the same outcome classification as
// accountByExternalUserID for a case-insensitive email lookup.
func accountByEmail(email string) (*pgstore.Account, error) {
	repository, err := pgstore.DefaultRepository()
	if err != nil {
		if errors.Is(err, pgstore.ErrPoolUninitialized) {
			return nil, nil
		}
		return nil, err
	}
	account, err := repository.GetAccountByEmail(context.Background(), email)
	if errors.Is(err, pgx.ErrNoRows) {
		return nil, nil
	}
	if err != nil {
		return nil, err
	}
	return account, nil
}

func getMongoUserById(userId string) *models.User {
	objectId, err := primitive.ObjectIDFromHex(userId)
	if err != nil {
		// userId is malformatted
		return nil
	}
	result := UsersCollection.FindOne(context.Background(), bson.M{
		"_id": objectId,
	})
	if result.Err() == mongo.ErrNoDocuments {
		// User does not exist!
		return nil
	}

	// Decode result
	var user models.User
	if err := result.Decode(&user); err != nil {
		logger.StdErr.Panicln(err)
	}

	return &user
}

func getMongoUserByEmail(email string) *models.User {
	emailQuery := strings.TrimSpace(email)
	if emailQuery == "" {
		return nil
	}
	opts := options.FindOne().SetCollation(&options.Collation{
		Locale:   "en",
		Strength: 2, // case-insensitive match on email
	})
	result := UsersCollection.FindOne(context.Background(), bson.M{
		"email": emailQuery,
	}, opts)
	if result.Err() == mongo.ErrNoDocuments {
		// User does not exist!
		return nil
	}

	// Decode result
	var user models.User
	if err := result.Decode(&user); err != nil {
		logger.StdErr.Panicln(err)
	}

	return &user
}

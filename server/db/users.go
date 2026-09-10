package db

import (
	"context"
	"errors"
	"strings"

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
// The returned user is nil when no integration document and no account exist.
func GetUserById(userId string) *models.User {
	mongoUser := getMongoUserById(userId)
	account := accountByExternalUserID(userId)
	if account == nil {
		return mongoUser
	}
	return MergeAccountProfile(mongoUser, account)
}

// GetUserByEmail resolves the authoritative account by case-insensitive email
// and returns its integration document overlaid with the account profile. It
// falls back to a retained-only lookup before account cutover.
func GetUserByEmail(email string) *models.User {
	emailQuery := strings.TrimSpace(email)
	if emailQuery == "" {
		return nil
	}
	if repository, err := pgstore.DefaultRepository(); err == nil {
		if account, err := repository.GetAccountByEmail(context.Background(), emailQuery); err == nil {
			return MergeAccountProfile(getMongoUserById(account.ExternalUserID), account)
		}
	}
	return getMongoUserByEmail(emailQuery)
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
		return nil, err
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

func accountByExternalUserID(userId string) *pgstore.Account {
	repository, err := pgstore.DefaultRepository()
	if err != nil {
		return nil
	}
	account, err := repository.GetAccountByExternalUserID(context.Background(), userId)
	if err != nil {
		return nil
	}
	return account
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

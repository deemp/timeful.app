package db

import (
	"context"
	"crypto/rand"

	"go.mongodb.org/mongo-driver/bson"
	"go.mongodb.org/mongo-driver/bson/primitive"
	"go.mongodb.org/mongo-driver/mongo"
	"timeful/server/logger"
	"timeful/server/models"
)

// Returns an event based on its _id
func GetEventById(eventId string) *models.Event {
	objectId, err := primitive.ObjectIDFromHex(eventId)
	if err != nil {
		// eventId is malformatted
		return nil
	}
	result := EventsCollection.FindOne(context.Background(), bson.M{
		"$and": bson.A{
			bson.M{"_id": objectId},
			bson.M{
				"$or": bson.A{
					bson.M{"isDeleted": bson.M{"$exists": false}},
					bson.M{"isDeleted": bson.M{"$eq": false}},
				},
			},
		},
	})
	if result.Err() == mongo.ErrNoDocuments {
		// Event does not exist!
		return nil
	}

	// Decode result
	var event models.Event
	if err := result.Decode(&event); err != nil {
		logger.StdErr.Panicln(err)
	}

	return &event
}

// Returns an event based on its shortId
func GetEventByShortId(shortEventId string) *models.Event {
	result := EventsCollection.FindOne(context.Background(), bson.M{
		"$and": bson.A{
			bson.M{"shortId": shortEventId},
			bson.M{
				"$or": bson.A{
					bson.M{"isDeleted": bson.M{"$exists": false}},
					bson.M{"isDeleted": bson.M{"$eq": false}},
				},
			},
		},
	})
	if result.Err() == mongo.ErrNoDocuments {
		// Event does not exist!
		return nil
	}

	// Decode result
	var event models.Event
	if err := result.Decode(&event); err != nil {
		logger.StdErr.Panicln(err)
	}

	return &event
}

// Returns an event by either its _id or shortId
func GetEventByEitherId(id string) *models.Event {
	if len(id) <= 10 {
		return GetEventByShortId(id)
	}

	return GetEventById(id)
}

func GetEventResponses(eventId string) []models.EventResponse {
	objectId, err := primitive.ObjectIDFromHex(eventId)
	if err != nil {
		// eventId is malformatted
		return []models.EventResponse{}
	}

	result, err := EventResponsesCollection.Find(context.Background(), bson.M{
		"eventId": objectId,
	})
	if err != nil {
		logger.StdErr.Panicln(err)
	}
	if result.Err() == mongo.ErrNoDocuments {
		// Event responses do not exist!
		return []models.EventResponse{}
	}

	var eventResponses []models.EventResponse
	if err := result.All(context.Background(), &eventResponses); err != nil {
		logger.StdErr.Panicln(err)
	}

	return eventResponses
}

func GetAttendees(eventId string) []models.Attendee {
	objectId, err := primitive.ObjectIDFromHex(eventId)
	if err != nil {
		// eventId is malformatted
		return []models.Attendee{}
	}

	result, err := AttendeesCollection.Find(context.Background(), bson.M{
		"eventId": objectId,
	})
	if err != nil {
		logger.StdErr.Panicln(err)
	}
	if result.Err() == mongo.ErrNoDocuments {
		// Attendees do not exist!
		return []models.Attendee{}
	}

	var attendees []models.Attendee
	if err := result.All(context.Background(), &attendees); err != nil {
		logger.StdErr.Panicln(err)
	}

	return attendees
}

// Crockford base32 alphabet, omitting the ambiguous I, L, O, and U
const shortIdLetters = "0123456789ABCDEFGHJKMNPQRSTVWXYZ"

const shortIdLength = 8

// GenerateShortEventId returns a unique random 8-character short event id.
// The id uses crypto/rand and a Crockford base32 alphabet to avoid ambiguous
// characters and collisions from same-second event creation.
func GenerateShortEventId() string {
	bytes := make([]byte, 5)
	if _, err := rand.Read(bytes); err != nil {
		logger.StdErr.Panicln("Couldn't generate random id:", err)
	}

	id := base32EncodeString(bytes)

	// Guard against the exceedingly rare collision by retrying with fresh randomness.
	for i := 0; i < 20; i++ {
		if GetEventByShortId(id) == nil {
			return id
		}
		if _, err := rand.Read(bytes); err != nil {
			logger.StdErr.Panicln("Couldn't generate random id:", err)
		}
		id = base32EncodeString(bytes)
	}

	logger.StdErr.Panicln("Couldn't generate unique id")
	return ""
}

// base32EncodeString encodes a byte slice as a Crockford base32 string of
// precomputed length, zero-padded into the most significant bits.
func base32EncodeString(bytes []byte) string {
	var n uint64
	for _, b := range bytes {
		n = n<<8 | uint64(b)
	}

	id := make([]byte, shortIdLength)
	for i := 0; i < shortIdLength; i++ {
		shift := uint(40 - 5*(i+1))
		id[i] = shortIdLetters[(n>>shift)&31]
	}
	return string(id)
}

// Updates the name of a guest response
func UpdateGuestResponseName(eventId string, oldName string, newName string) {
	objectId, err := primitive.ObjectIDFromHex(eventId)
	if err != nil {
		// eventId is malformatted
		return
	}

	_, err = EventResponsesCollection.UpdateOne(context.Background(), bson.M{
		"eventId": objectId,
		"userId":  oldName,
	}, bson.M{
		"$set": bson.M{
			"userId":        newName,
			"response.name": newName,
		},
	})
	if err != nil {
		logger.StdErr.Panicln(err)
	}
}

// Checks if a guest name already exists for an event
// Returns true if the guest name already exists, false otherwise
// Also returns true if the name matches a logged-in user's ObjectID (to prevent conflicts)
// Only checks for guest users (non-logged-in users), not logged-in users
func GuestNameExists(eventId string, guestName string) bool {
	event := GetEventByEitherId(eventId)
	if event == nil {
		return false
	}

	// Check if the name is a valid ObjectID that corresponds to an existing user
	// If so, block it to prevent conflicts
	//NOTE: we're checking against ALL logged in users because in case we allowed this, and a user with an account tried to
	// submit their availability, overwriting would happen and we'd lose data.
	objectId, err := primitive.ObjectIDFromHex(guestName)
	if err == nil {
		// The name is a valid ObjectID format - check if a user exists with this ID
		user := GetUserById(objectId.Hex())
		if user != nil {
			// A logged-in user exists with this ObjectID, so block it
			return true
		}
	}

	// For events, check EventResponsesCollection
	eventObjectId, err := primitive.ObjectIDFromHex(event.Id.Hex())
	if err != nil {
		return false
	}

	// Check if a response exists with this userId AND it's a guest (userId is not a valid ObjectID)
	result := EventResponsesCollection.FindOne(context.Background(), bson.M{
		"eventId": eventObjectId,
		"userId":  guestName,
	})

	if result.Err() == mongo.ErrNoDocuments {
		// No response found with this userId
		return false
	}

	// Response found - verify it's a guest (userId is not a valid ObjectID)
	_, err = primitive.ObjectIDFromHex(guestName)
	if err != nil {
		// userId cannot be parsed as ObjectID, so it's a guest
		return true
	}

	// userId can be parsed as ObjectID, so it's a logged-in user, not a guest
	return false
}

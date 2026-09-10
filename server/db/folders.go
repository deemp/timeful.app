package db

import (
	"context"

	"go.mongodb.org/mongo-driver/bson"
	"go.mongodb.org/mongo-driver/bson/primitive"
	"go.mongodb.org/mongo-driver/mongo/options"
	"timeful/server/logger"
	"timeful/server/models"
)

// GetEventShortIdsByObjectID resolves legacy MongoDB event short identifiers in
// one query so folder reads can emit the canonical public identifier for each
// legacy member without exposing the storage identifier.
func GetEventShortIdsByObjectID(eventIDs []primitive.ObjectID) (map[string]string, error) {
	result := make(map[string]string, len(eventIDs))
	if len(eventIDs) == 0 {
		return result, nil
	}
	ctx := context.Background()
	cursor, err := EventsCollection.Find(ctx, bson.M{"_id": bson.M{"$in": eventIDs}}, options.Find().SetProjection(bson.M{"shortId": 1}))
	if err != nil {
		return nil, err
	}
	defer cursor.Close(ctx)
	for cursor.Next(ctx) {
		var event struct {
			Id      primitive.ObjectID `bson:"_id"`
			ShortId *string            `bson:"shortId"`
		}
		if err := cursor.Decode(&event); err != nil {
			return nil, err
		}
		if event.ShortId != nil && *event.ShortId != "" {
			result[event.Id.Hex()] = *event.ShortId
		}
	}
	return result, cursor.Err()
}

// MarkOwnedEventsDeleted soft-deletes the legacy MongoDB events the account
// owns, matching folder deletion's promise that owned events in the folder are
// deleted.
func MarkOwnedEventsDeleted(eventIDs []primitive.ObjectID, userId primitive.ObjectID) error {
	if len(eventIDs) == 0 {
		return nil
	}
	_, err := EventsCollection.UpdateMany(context.Background(), bson.M{
		"_id":     bson.M{"$in": eventIDs},
		"ownerId": userId,
	}, bson.M{"$set": bson.M{"isDeleted": true}})
	return err
}

func CreateFolder(folder *models.Folder) (primitive.ObjectID, error) {
	result, err := FoldersCollection.InsertOne(context.Background(), folder)
	if err != nil {
		logger.StdErr.Panicln(err)
		return primitive.NilObjectID, err
	}
	return result.InsertedID.(primitive.ObjectID), nil
}

func GetFolderById(folderId primitive.ObjectID, userId primitive.ObjectID) (*models.Folder, error) {
	var folder models.Folder
	err := FoldersCollection.FindOne(context.Background(), bson.M{
		"_id":    folderId,
		"userId": userId,
		"$or": bson.A{
			bson.M{"isDeleted": bson.M{"$exists": false}},
			bson.M{"isDeleted": false},
		},
	}).Decode(&folder)
	if err != nil {
		return nil, err
	}

	return &folder, nil
}

func GetAllFolders(userId primitive.ObjectID) ([]models.Folder, error) {
	cursor, err := FoldersCollection.Find(context.Background(), bson.M{
		"userId": userId,
		"$or": bson.A{
			bson.M{"isDeleted": bson.M{"$exists": false}},
			bson.M{"isDeleted": false},
		},
	})
	if err != nil {
		return nil, err
	}

	var folders []models.Folder
	if err = cursor.All(context.Background(), &folders); err != nil {
		return nil, err
	}

	for i, folder := range folders {
		events, err := GetEventsInFolder(folder.Id, userId)
		if err != nil {
			return nil, err
		}
		if events != nil {
			folders[i].EventIds = events
		} else {
			folders[i].EventIds = []primitive.ObjectID{}
		}
	}

	return folders, nil
}

func GetEventsInFolder(folderId primitive.ObjectID, userId primitive.ObjectID) ([]primitive.ObjectID, error) {
	cursor, err := FolderEventsCollection.Find(context.Background(), bson.M{
		"folderId": folderId,
		"userId":   userId,
	}, options.Find().SetProjection(bson.M{"eventId": 1}))
	if err != nil {
		return nil, err
	}

	var eventIdsResponse []struct {
		EventId primitive.ObjectID `bson:"eventId"`
	}
	if err = cursor.All(context.Background(), &eventIdsResponse); err != nil {
		return nil, err
	}

	eventIds := make([]primitive.ObjectID, len(eventIdsResponse))
	for i, eventId := range eventIdsResponse {
		eventIds[i] = eventId.EventId
	}

	return eventIds, nil
}

func UpdateFolder(folderId primitive.ObjectID, userId primitive.ObjectID, updates bson.M) error {
	_, err := FoldersCollection.UpdateOne(context.Background(), bson.M{"_id": folderId, "userId": userId}, bson.M{"$set": updates})
	return err
}

func SetEventFolder(eventId primitive.ObjectID, folderId *primitive.ObjectID, userId primitive.ObjectID) error {
	ctx := context.Background()

	// Remove any existing mapping for this event
	_, err := FolderEventsCollection.DeleteMany(ctx, bson.M{"eventId": eventId, "userId": userId})
	if err != nil {
		return err
	}

	// If folderId is nil, we just un-assign it. Otherwise, create a new mapping
	if folderId != nil {
		_, err = FolderEventsCollection.InsertOne(ctx, models.FolderEvent{
			FolderId: *folderId,
			EventId:  eventId,
			UserId:   userId,
		})
		if err != nil {
			return err
		}
	}

	return nil
}

func DeleteFolder(folderId primitive.ObjectID, userId primitive.ObjectID) error {
	ctx := context.Background()
	// Mark this folder as deleted
	_, err := FoldersCollection.UpdateOne(ctx, bson.M{"_id": folderId, "userId": userId}, bson.M{"$set": bson.M{"isDeleted": true}})
	if err != nil {
		return err
	}

	// Find all event mappings for this folder
	eventIds, err := GetEventsInFolder(folderId, userId)
	if err != nil {
		return err
	}

	// Mark all events in this folder as deleted (if the user owns the event)
	if len(eventIds) > 0 {
		_, err = EventsCollection.UpdateMany(ctx, bson.M{"_id": bson.M{"$in": eventIds}, "ownerId": userId}, bson.M{"$set": bson.M{"isDeleted": true}})
		if err != nil {
			return err
		}
	}

	// Delete the mappings
	_, err = FolderEventsCollection.DeleteMany(ctx, bson.M{"folderId": folderId, "userId": userId})
	if err != nil {
		return err
	}

	return nil
}

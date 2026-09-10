package routes

import (
	"context"
	"encoding/json"
	"net/http"
	"testing"
	"time"

	"go.mongodb.org/mongo-driver/bson"
	"go.mongodb.org/mongo-driver/bson/primitive"
	"timeful/server/db"
	"timeful/server/eventsource"
	"timeful/server/models"
	pgstore "timeful/server/postgres"
	"timeful/server/utils"
)

func folderEventIDs(t *testing.T, row map[string]json.RawMessage) []string {
	t.Helper()
	var ids []string
	if err := json.Unmarshal(row["eventIds"], &ids); err != nil {
		t.Fatalf("decode eventIds: %v", err)
	}
	return ids
}

func findFolderByName(t *testing.T, rows []map[string]json.RawMessage, name string) map[string]json.RawMessage {
	t.Helper()
	for _, row := range rows {
		var folderName string
		if err := json.Unmarshal(row["name"], &folderName); err != nil {
			continue
		}
		if folderName == name {
			return row
		}
	}
	return nil
}

func insertLegacyFolderEvent(t *testing.T, owner primitive.ObjectID, shortID, name string) primitive.ObjectID {
	t.Helper()
	eventID := primitive.NewObjectID()
	if _, err := db.EventsCollection.InsertOne(context.Background(), models.Event{
		Id:        eventID,
		ShortId:   &shortID,
		OwnerId:   owner,
		Name:      name,
		Type:      models.SPECIFIC_DATES,
		DaysOnly:  utils.TruePtr(),
		Dates:     []primitive.DateTime{primitive.NewDateTimeFromTime(time.Now())},
		IsDeleted: utils.FalsePtr(),
	}); err != nil {
		t.Fatal(err)
	}
	t.Cleanup(func() {
		_, _ = db.EventsCollection.DeleteOne(context.Background(), bson.M{"_id": eventID})
	})
	return eventID
}

// TestSignedInFoldersCrudAndIsolation proves that folder create, read, update,
// and delete run in PostgreSQL for the owning account and that another account
// can neither see nor mutate the folder.
func TestSignedInFoldersCrudAndIsolation(t *testing.T) {
	router := signedInPostgresEventRouter(t)
	owner, _ := createSignedInAccount(t, router)
	stranger, _ := createSignedInAccount(t, router)

	name := "Folder " + primitive.NewObjectID().Hex()
	created := owner.request(http.MethodPost, "/api/user/folders", map[string]any{"name": name, "color": "#abcdef"}, http.StatusCreated)
	folderID := decodeAccountString(t, created, "id")
	if !validFolderID(folderID) {
		t.Fatalf("created folder id %q is not a PostgreSQL UUID", folderID)
	}

	listed := owner.requestArray(http.MethodGet, "/api/user/folders", http.StatusOK)
	row := findFolderByName(t, listed, name)
	if row == nil {
		t.Fatal("owner did not see the created folder")
	}
	if ids := folderEventIDs(t, row); len(ids) != 0 {
		t.Fatalf("new folder had members: %v", ids)
	}

	updatedName := name + " updated"
	owner.request(http.MethodPatch, "/api/user/folders/"+folderID, map[string]any{"name": updatedName, "color": "#123456"}, http.StatusOK)
	row = findFolderByName(t, owner.requestArray(http.MethodGet, "/api/user/folders", http.StatusOK), updatedName)
	if row == nil {
		t.Fatal("owner did not see the updated folder")
	}
	details := owner.request(http.MethodGet, "/api/user/folders/"+folderID, nil, http.StatusOK)
	if got := decodeAccountString(t, details, "_id"); got != folderID {
		t.Fatalf("folder _id = %q, want %q", got, folderID)
	}

	// Another account can neither read nor mutate the folder.
	if findFolderByName(t, stranger.requestArray(http.MethodGet, "/api/user/folders", http.StatusOK), updatedName) != nil {
		t.Fatal("stranger saw another account's folder in the list")
	}
	stranger.request(http.MethodGet, "/api/user/folders/"+folderID, nil, http.StatusNotFound)
	stranger.request(http.MethodPatch, "/api/user/folders/"+folderID, map[string]any{"name": "hijacked"}, http.StatusNotFound)
	stranger.request(http.MethodDelete, "/api/user/folders/"+folderID, nil, http.StatusNotFound)

	owner.request(http.MethodDelete, "/api/user/folders/"+folderID, nil, http.StatusOK)
	owner.request(http.MethodGet, "/api/user/folders/"+folderID, nil, http.StatusNotFound)
	if findFolderByName(t, owner.requestArray(http.MethodGet, "/api/user/folders", http.StatusOK), updatedName) != nil {
		t.Fatal("deleted folder still listed")
	}
}

// TestSignedInFolderMembershipAcrossEventSources proves that a PostgreSQL event
// and a legacy MongoDB event can each be added to and removed from a folder,
// that reads expose the canonical public identifier for both, and that a
// repeated move does not duplicate a member.
func TestSignedInFolderMembershipAcrossEventSources(t *testing.T) {
	router := signedInPostgresEventRouter(t)
	owner, account := createSignedInAccount(t, router)
	ctx := context.Background()

	folderName := "Membership " + primitive.NewObjectID().Hex()
	folderID := decodeAccountString(t, owner.request(http.MethodPost, "/api/user/folders", map[string]any{"name": folderName}, http.StatusCreated), "id")

	postgresEventID := createDashboardPostgresEvent(t, owner, "Membership PostgreSQL event")
	legacyShortID, err := pgstore.GenerateShortID()
	if err != nil {
		t.Fatal(err)
	}
	legacyObjectID := insertLegacyFolderEvent(t, accountObjectID(t, account.ExternalUserID), legacyShortID, "Membership legacy event")
	legacyEventID := eventsource.MongoPublicID(legacyShortID)

	owner.request(http.MethodPost, "/api/user/events/"+postgresEventID+"/set-folder", map[string]any{"folderId": folderID}, http.StatusOK)
	owner.request(http.MethodPost, "/api/user/events/"+legacyEventID+"/set-folder", map[string]any{"folderId": folderID}, http.StatusOK)
	// Re-adding the same events must not create duplicate memberships.
	owner.request(http.MethodPost, "/api/user/events/"+postgresEventID+"/set-folder", map[string]any{"folderId": folderID}, http.StatusOK)

	row := findFolderByName(t, owner.requestArray(http.MethodGet, "/api/user/folders", http.StatusOK), folderName)
	if row == nil {
		t.Fatal("owner did not see the folder after adding members")
	}
	ids := folderEventIDs(t, row)
	if len(ids) != 2 {
		t.Fatalf("folder members = %v, want exactly the PostgreSQL and legacy canonical ids", ids)
	}
	seen := map[string]bool{}
	for _, id := range ids {
		seen[id] = true
	}
	if !seen[postgresEventID] {
		t.Fatalf("folder members %v missing PostgreSQL canonical id %q", ids, postgresEventID)
	}
	if !seen[legacyEventID] {
		t.Fatalf("folder members %v missing legacy canonical id %q", ids, legacyEventID)
	}

	// The explicit storage references are recorded per source: the PostgreSQL
	// event UUID and the legacy MongoDB _id, each with exactly one populated
	// reference.
	var postgresRefs, legacyRefs int
	if err := pgstore.Pool.QueryRow(ctx, `SELECT
	 (SELECT count(*) FROM folder_events WHERE account_user_id = $1 AND legacy_event_id = $2 AND event_id IS NULL),
	 (SELECT count(*) FROM folder_events WHERE account_user_id = $1 AND event_id IS NOT NULL AND legacy_event_id IS NULL)`,
		account.ExternalUserID, legacyObjectID.Hex()).Scan(&legacyRefs, &postgresRefs); err != nil {
		t.Fatal(err)
	}
	if postgresRefs != 1 || legacyRefs != 1 {
		t.Fatalf("storage references wrong: legacy=%d postgres=%d", postgresRefs, legacyRefs)
	}

	// Another account's folder cannot receive a member.
	stranger, _ := createSignedInAccount(t, router)
	stranger.request(http.MethodPost, "/api/user/events/"+postgresEventID+"/set-folder", map[string]any{"folderId": folderID}, http.StatusNotFound)

	owner.request(http.MethodPost, "/api/user/events/"+postgresEventID+"/set-folder", map[string]any{"folderId": nil}, http.StatusOK)
	owner.request(http.MethodPost, "/api/user/events/"+legacyEventID+"/set-folder", map[string]any{"folderId": nil}, http.StatusOK)
	row = findFolderByName(t, owner.requestArray(http.MethodGet, "/api/user/folders", http.StatusOK), folderName)
	if row == nil {
		t.Fatal("folder disappeared after removing members")
	}
	if ids := folderEventIDs(t, row); len(ids) != 0 {
		t.Fatalf("members survived removal: %v", ids)
	}
}

// TestSignedInFolderDeleteRemovesMembershipsAndOwnedMembers proves that
// deleting a folder removes its memberships and soft-deletes the account's own
// PostgreSQL and legacy member events.
func TestSignedInFolderDeleteRemovesMembershipsAndOwnedMembers(t *testing.T) {
	router := signedInPostgresEventRouter(t)
	owner, account := createSignedInAccount(t, router)
	ctx := context.Background()

	folderName := "Delete " + primitive.NewObjectID().Hex()
	folderID := decodeAccountString(t, owner.request(http.MethodPost, "/api/user/folders", map[string]any{"name": folderName}, http.StatusCreated), "id")

	postgresEventID := createDashboardPostgresEvent(t, owner, "Delete PostgreSQL member")
	legacyShortID, err := pgstore.GenerateShortID()
	if err != nil {
		t.Fatal(err)
	}
	legacyObjectID := insertLegacyFolderEvent(t, accountObjectID(t, account.ExternalUserID), legacyShortID, "Delete legacy member")

	owner.request(http.MethodPost, "/api/user/events/"+postgresEventID+"/set-folder", map[string]any{"folderId": folderID}, http.StatusOK)
	owner.request(http.MethodPost, "/api/user/events/"+eventsource.MongoPublicID(legacyShortID)+"/set-folder", map[string]any{"folderId": folderID}, http.StatusOK)

	owner.request(http.MethodDelete, "/api/user/folders/"+folderID, nil, http.StatusOK)

	var memberships int
	if err := pgstore.Pool.QueryRow(ctx, `SELECT count(*) FROM folder_events WHERE account_user_id = $1`, account.ExternalUserID).Scan(&memberships); err != nil {
		t.Fatal(err)
	}
	if memberships != 0 {
		t.Fatalf("folder memberships survived deletion: %d", memberships)
	}
	var postgresDeleted bool
	if err := pgstore.Pool.QueryRow(ctx, `SELECT is_deleted FROM postgres_events WHERE short_id = $1`, postgresEventID).Scan(&postgresDeleted); err != nil {
		t.Fatal(err)
	}
	if !postgresDeleted {
		t.Fatal("owned PostgreSQL member event was not soft-deleted with the folder")
	}
	var legacyEvent models.Event
	if err := db.EventsCollection.FindOne(ctx, bson.M{"_id": legacyObjectID}).Decode(&legacyEvent); err != nil {
		t.Fatal(err)
	}
	if legacyEvent.IsDeleted == nil || !*legacyEvent.IsDeleted {
		t.Fatal("owned legacy member event was not soft-deleted with the folder")
	}
}

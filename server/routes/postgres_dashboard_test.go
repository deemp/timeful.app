package routes

import (
	"context"
	"encoding/json"
	"io"
	"net/http"
	"testing"
	"time"

	"go.mongodb.org/mongo-driver/bson"
	"go.mongodb.org/mongo-driver/bson/primitive"
	"timeful/server/db"
	"timeful/server/models"
	pgstore "timeful/server/postgres"
	"timeful/server/utils"
)

// requestArray reads a JSON array response, which the account-contract helper
// cannot decode because it assumes an object envelope.
func (c *accountContractClient) requestArray(method, path string, status int) []map[string]json.RawMessage {
	c.t.Helper()
	req, err := http.NewRequest(method, c.server.URL+path, nil)
	if err != nil {
		c.t.Fatal(err)
	}
	response, err := c.client.Do(req)
	if err != nil {
		c.t.Fatal(err)
	}
	defer response.Body.Close()
	raw, _ := io.ReadAll(response.Body)
	if response.StatusCode != status {
		c.t.Fatalf("%s %s: got %d want %d: %s", method, path, response.StatusCode, status, raw)
	}
	var result []map[string]json.RawMessage
	if err := json.Unmarshal(raw, &result); err != nil {
		c.t.Fatal(err)
	}
	return result
}

func dashboardEventField(t *testing.T, row map[string]json.RawMessage, key string) string {
	t.Helper()
	var value string
	if err := json.Unmarshal(row[key], &value); err != nil {
		t.Fatalf("decode %s: %v", key, err)
	}
	return value
}

func findDashboardEventByName(t *testing.T, rows []map[string]json.RawMessage, name string) map[string]json.RawMessage {
	t.Helper()
	for _, row := range rows {
		if dashboardEventField(t, row, "name") == name {
			return row
		}
	}
	return nil
}

func createDashboardPostgresEvent(t *testing.T, client *accountContractClient, name string) string {
	t.Helper()
	created := client.request(http.MethodPost, "/api/events", canonicalTimedEventPayload(name), http.StatusCreated)
	eventID := decodeAccountString(t, created, "eventId")
	if eventID == "" {
		t.Fatal("signed-in creation did not return an event identifier")
	}
	t.Cleanup(func() {
		_, _ = pgstore.Pool.Exec(context.Background(), `DELETE FROM postgres_events WHERE short_id = $1`, eventID)
	})
	return eventID
}

// TestSignedInDashboardListsPostgresOwnedAndResponded proves that the dashboard
// returns PostgreSQL events the account owns or has responded to, exposes the
// canonical public identifier for both, never reveals an event to an account
// that neither owns nor responded to, and lists an owned+responded event once.
func TestSignedInDashboardListsPostgresOwnedAndResponded(t *testing.T) {
	router := signedInPostgresEventRouter(t)
	owner, ownerAccount := createSignedInAccount(t, router)
	ownedName := "Dashboard owned event " + primitive.NewObjectID().Hex()
	eventID := createDashboardPostgresEvent(t, owner, ownedName)

	ownedRow := findDashboardEventByName(t, owner.requestArray(http.MethodGet, "/api/user/events", http.StatusOK), ownedName)
	if ownedRow == nil {
		t.Fatal("owner dashboard did not list the owned PostgreSQL event")
	}
	if got := dashboardEventField(t, ownedRow, "_id"); got != eventID {
		t.Fatalf("owned _id = %q, want canonical short id %q", got, eventID)
	}
	if got := dashboardEventField(t, ownedRow, "shortId"); got != eventID {
		t.Fatalf("owned shortId = %q, want %q", got, eventID)
	}
	if got := dashboardEventField(t, ownedRow, "ownerId"); got != ownerAccount.ExternalUserID {
		t.Fatalf("owned ownerId = %q, want owning account %q", got, ownerAccount.ExternalUserID)
	}

	responder, _ := createSignedInAccount(t, router)
	responder.request(http.MethodPost, "/api/events/"+eventID+"/response", map[string]any{
		"createResponse": true,
		"name":           "Dashboard responder",
		"availability":   []string{"2026-01-05T14:00:00Z"},
	}, http.StatusOK)
	respondedRow := findDashboardEventByName(t, responder.requestArray(http.MethodGet, "/api/user/events", http.StatusOK), ownedName)
	if respondedRow == nil {
		t.Fatal("responder dashboard did not list the responded PostgreSQL event")
	}
	if got := dashboardEventField(t, respondedRow, "_id"); got != eventID {
		t.Fatalf("responded _id = %q, want canonical short id %q", got, eventID)
	}
	if got := dashboardEventField(t, respondedRow, "ownerId"); got != primitive.NilObjectID.Hex() {
		t.Fatalf("responded ownerId = %q, want anonymous owner", got)
	}

	stranger, _ := createSignedInAccount(t, router)
	if row := findDashboardEventByName(t, stranger.requestArray(http.MethodGet, "/api/user/events", http.StatusOK), ownedName); row != nil {
		t.Fatal("dashboard revealed an event the account neither owns nor responded to")
	}

	// The owner responds too; the event must still appear exactly once.
	owner.request(http.MethodPost, "/api/events/"+eventID+"/response", map[string]any{
		"createResponse": true,
		"name":           "Dashboard owner response",
		"availability":   []string{"2026-01-05T14:00:00Z"},
	}, http.StatusOK)
	occurrences := 0
	for _, row := range owner.requestArray(http.MethodGet, "/api/user/events", http.StatusOK) {
		if dashboardEventField(t, row, "name") == ownedName {
			occurrences++
		}
	}
	if occurrences != 1 {
		t.Fatalf("dashboard listed the owned+responded event %d times, want 1", occurrences)
	}
}

// TestSignedInDashboardMergesMongoAndPostgresEvents proves that the dashboard
// keeps returning legacy MongoDB events unchanged while adding PostgreSQL
// events, and that each event exposes its own canonical public identifier.
func TestSignedInDashboardMergesMongoAndPostgresEvents(t *testing.T) {
	router := signedInPostgresEventRouter(t)
	client, account := createSignedInAccount(t, router)
	ctx := context.Background()

	postgresName := "Merged PostgreSQL event " + primitive.NewObjectID().Hex()
	postgresID := createDashboardPostgresEvent(t, client, postgresName)

	mongoName := "Merged MongoDB event " + primitive.NewObjectID().Hex()
	mongoID := primitive.NewObjectID()
	t.Cleanup(func() {
		_, _ = db.EventsCollection.DeleteOne(context.Background(), bson.M{"_id": mongoID})
	})
	if _, err := db.EventsCollection.InsertOne(ctx, models.Event{
		Id:        mongoID,
		OwnerId:   accountObjectID(t, account.ExternalUserID),
		Name:      mongoName,
		Type:      models.SPECIFIC_DATES,
		DaysOnly:  utils.TruePtr(),
		Dates:     []primitive.DateTime{primitive.NewDateTimeFromTime(time.Now())},
		IsDeleted: utils.FalsePtr(),
	}); err != nil {
		t.Fatal(err)
	}

	// A MongoDB event the account responded to but does not own must keep
	// appearing through the unchanged legacy response lookup.
	respondedMongoName := "Merged MongoDB responded event " + primitive.NewObjectID().Hex()
	respondedMongoID := primitive.NewObjectID()
	responseID := primitive.NewObjectID()
	t.Cleanup(func() {
		_, _ = db.EventsCollection.DeleteOne(context.Background(), bson.M{"_id": respondedMongoID})
		_, _ = db.EventResponsesCollection.DeleteOne(context.Background(), bson.M{"_id": responseID})
	})
	if _, err := db.EventsCollection.InsertOne(ctx, models.Event{
		Id:        respondedMongoID,
		OwnerId:   primitive.NewObjectID(),
		Name:      respondedMongoName,
		Type:      models.SPECIFIC_DATES,
		DaysOnly:  utils.TruePtr(),
		Dates:     []primitive.DateTime{primitive.NewDateTimeFromTime(time.Now())},
		IsDeleted: utils.FalsePtr(),
	}); err != nil {
		t.Fatal(err)
	}
	if _, err := db.EventResponsesCollection.InsertOne(ctx, models.EventResponse{
		Id:       responseID,
		EventId:  respondedMongoID,
		UserId:   account.ExternalUserID,
		Response: &models.Response{Name: "Mongo responder"},
	}); err != nil {
		t.Fatal(err)
	}

	rows := client.requestArray(http.MethodGet, "/api/user/events", http.StatusOK)
	postgresRow := findDashboardEventByName(t, rows, postgresName)
	mongoRow := findDashboardEventByName(t, rows, mongoName)
	respondedMongoRow := findDashboardEventByName(t, rows, respondedMongoName)
	if postgresRow == nil || mongoRow == nil || respondedMongoRow == nil {
		t.Fatalf("merged dashboard missing events: postgres=%v mongo=%v respondedMongo=%v", postgresRow != nil, mongoRow != nil, respondedMongoRow != nil)
	}
	if got := dashboardEventField(t, postgresRow, "_id"); got != postgresID {
		t.Fatalf("postgres _id = %q, want %q", got, postgresID)
	}
	if got := dashboardEventField(t, mongoRow, "_id"); got != mongoID.Hex() {
		t.Fatalf("mongo _id = %q, want %q", got, mongoID.Hex())
	}
	if got := dashboardEventField(t, respondedMongoRow, "_id"); got != respondedMongoID.Hex() {
		t.Fatalf("responded mongo _id = %q, want %q", got, respondedMongoID.Hex())
	}
}

// TestSignedInDashboardExcludesDeletedPostgresEvent proves that a deleted
// PostgreSQL event stops appearing on the dashboard for its owner.
func TestSignedInDashboardExcludesDeletedPostgresEvent(t *testing.T) {
	router := signedInPostgresEventRouter(t)
	owner, _ := createSignedInAccount(t, router)
	name := "Deleted dashboard event " + primitive.NewObjectID().Hex()
	eventID := createDashboardPostgresEvent(t, owner, name)

	owner.request(http.MethodDelete, "/api/events/"+eventID, nil, http.StatusOK)

	if row := findDashboardEventByName(t, owner.requestArray(http.MethodGet, "/api/user/events", http.StatusOK), name); row != nil {
		t.Fatal("deleted PostgreSQL event still appeared on the dashboard")
	}
}

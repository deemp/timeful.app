package routes

import (
	"context"
	"encoding/json"
	"net/http"
	"testing"

	"github.com/gin-gonic/gin"
	"go.mongodb.org/mongo-driver/bson"
	"go.mongodb.org/mongo-driver/bson/primitive"
	"timeful/server/db"
	"timeful/server/eventsource"
	pgstore "timeful/server/postgres"
)

// signedInPostgresEventRouter exposes the account-contract sign-in and cleanup
// helpers with the event routes, which always create supported kinds in
// PostgreSQL.
func signedInPostgresEventRouter(t *testing.T) *gin.Engine {
	t.Helper()
	return newAccountEventContractRouter(t)
}

func createSignedInAccount(t *testing.T, router *gin.Engine) (*accountContractClient, *pgstore.Account) {
	t.Helper()
	client := newAccountContractClient(t, router)
	email := "signed-in-event-" + primitive.NewObjectID().Hex() + "@example.com"
	verifyOtpSignIn(t, client, email, "123456")
	account, err := repositoryForTest(t).GetAccountByEmail(context.Background(), email)
	if err != nil {
		t.Fatalf("signed-in account not created: %v", err)
	}
	cleanupOtpAccount(t, account)
	return client, account
}

func responseMapKeys(t *testing.T, payload map[string]json.RawMessage) []string {
	t.Helper()
	var rows map[string]json.RawMessage
	if err := json.Unmarshal(payload["responses"], &rows); err != nil {
		t.Fatalf("decode responses: %v", err)
	}
	keys := make([]string, 0, len(rows))
	for key := range rows {
		keys = append(keys, key)
	}
	return keys
}

// TestSignedInPostgresEventLifecycle proves that a supported signed-in poll is
// stored in PostgreSQL owned by the account, that the usage counter advances,
// that the owner can manage settings, schedule, archive, and delete with the
// session alone, and that another account is rejected.
func TestSignedInPostgresEventLifecycle(t *testing.T) {
	router := signedInPostgresEventRouter(t)
	owner, account := createSignedInAccount(t, router)
	ctx := context.Background()
	objectID := accountObjectID(t, account.ExternalUserID)
	t.Cleanup(func() {
		_, _ = db.EventsCollection.DeleteMany(context.Background(), bson.M{"ownerId": objectID})
	})

	payload := canonicalTimedEventPayload("Signed-in PostgreSQL event")
	created := owner.request(http.MethodPost, "/api/events", payload, http.StatusCreated)
	eventID := decodeAccountString(t, created, "eventId")
	if eventID == "" {
		t.Fatal("signed-in creation did not return an event identifier")
	}
	if source, _ := eventsource.Parse(eventID); source != eventsource.PostgreSQL {
		t.Fatalf("expected a PostgreSQL event identifier, got %q", eventID)
	}
	t.Cleanup(func() {
		_, _ = pgstore.Pool.Exec(context.Background(), `DELETE FROM postgres_events WHERE short_id = $1`, eventID)
	})

	repository := repositoryForTest(t)
	stored, err := repository.GetEventByShortID(ctx, eventID)
	if err != nil {
		t.Fatalf("signed-in event not stored in PostgreSQL: %v", err)
	}
	if stored.OwnerPlatformIdentityID == nil {
		t.Fatal("expected account ownership association on the PostgreSQL event")
	}
	if stored.OwnerExternalID == nil || *stored.OwnerExternalID != account.ExternalUserID {
		t.Fatalf("owner external id = %v, want %q", stored.OwnerExternalID, account.ExternalUserID)
	}
	mongoEvents, err := db.EventsCollection.CountDocuments(ctx, bson.M{"ownerId": objectID})
	if err != nil {
		t.Fatal(err)
	}
	if mongoEvents != 0 {
		t.Fatalf("expected no MongoDB event document, got %d", mongoEvents)
	}
	reloaded, err := repository.GetAccountByExternalUserID(ctx, account.ExternalUserID)
	if err != nil {
		t.Fatal(err)
	}
	if reloaded.NumEventsCreated != account.NumEventsCreated+1 {
		t.Fatalf("usage counter = %d, want %d", reloaded.NumEventsCreated, account.NumEventsCreated+1)
	}

	path := "/api/events/" + eventID
	owner.request(http.MethodPut, path, canonicalTimedEventPayload("Edited signed-in event"), http.StatusOK)
	owner.request(http.MethodPut, path+"/schedule", map[string]string{"startDate": "2026-01-05T14:00:00Z", "endDate": "2026-01-05T15:00:00Z"}, http.StatusOK)
	owner.request(http.MethodDelete, path+"/schedule", nil, http.StatusOK)
	owner.request(http.MethodPost, path+"/archive", map[string]bool{"archive": true}, http.StatusOK)
	// Archived PostgreSQL events are read-only until unarchived.
	owner.request(http.MethodPut, path, canonicalTimedEventPayload("Blocked while archived"), http.StatusForbidden)
	owner.request(http.MethodPost, path+"/archive", map[string]bool{"archive": false}, http.StatusOK)

	stranger, _ := createSignedInAccount(t, router)
	stranger.request(http.MethodPut, path, canonicalTimedEventPayload("Hijacked"), http.StatusForbidden)
	stranger.request(http.MethodPost, path+"/archive", map[string]bool{"archive": true}, http.StatusForbidden)
	stranger.request(http.MethodDelete, path, nil, http.StatusForbidden)

	owner.request(http.MethodDelete, path, nil, http.StatusOK)
	owner.request(http.MethodGet, path, nil, http.StatusNotFound)
}

// TestSignedInPostgresResponseAssociation proves that a signed-in response is
// associated with the account, that the account recovers it from a fresh
// browser, and that blind availability still hides it from non-owners.
func TestSignedInPostgresResponseAssociation(t *testing.T) {
	router := signedInPostgresEventRouter(t)
	owner, account := createSignedInAccount(t, router)
	ctx := context.Background()

	payload := canonicalTimedEventPayload("Signed-in response association")
	payload["blindAvailabilityEnabled"] = true
	created := owner.request(http.MethodPost, "/api/events", payload, http.StatusCreated)
	eventID := decodeAccountString(t, created, "eventId")
	t.Cleanup(func() {
		_, _ = pgstore.Pool.Exec(context.Background(), `DELETE FROM postgres_events WHERE short_id = $1`, eventID)
	})
	path := "/api/events/" + eventID

	createdResponse := owner.request(http.MethodPost, path+"/response", map[string]any{
		"createResponse": true,
		"name":           "Owner Display Name",
		"availability":   []string{"2026-01-05T14:00:00Z"},
	}, http.StatusOK)
	responseID := decodeAccountString(t, createdResponse, "responseId")
	if responseID == "" {
		t.Fatal("signed-in response creation did not return a response identifier")
	}

	stored, err := repositoryForTest(t).GetEventByShortID(ctx, eventID)
	if err != nil {
		t.Fatal(err)
	}
	var associated bool
	if err := pgstore.Pool.QueryRow(ctx, `SELECT EXISTS (
 SELECT 1 FROM event_visitor_identities v
 JOIN platform_identities p ON p.id = v.platform_identity_id
 WHERE v.event_id = $1 AND p.external_user_id = $2)`, stored.ID, account.ExternalUserID).Scan(&associated); err != nil {
		t.Fatal(err)
	}
	if !associated {
		t.Fatal("signed-in response visitor not associated with the account")
	}

	// Blind availability hides a non-owner response and its count.
	stranger, _ := createSignedInAccount(t, router)
	strangerEvent := stranger.request(http.MethodGet, path, nil, http.StatusOK)
	if keys := responseMapKeys(t, strangerEvent); len(keys) != 0 {
		t.Fatalf("blind non-owner saw %d responses", len(keys))
	}
	if _, leaked := strangerEvent["numResponses"]; leaked {
		t.Fatal("blind non-owner saw the response count")
	}

	// The account recovers its response from a fresh browser using the session
	// alone: no PostgreSQL credential cookie is carried over.
	recovered := newAccountContractClient(t, router)
	recovered.request(http.MethodPost, "/test/account-contract/sign-in/"+account.ExternalUserID, nil, http.StatusOK)
	recoveredEvent := recovered.request(http.MethodGet, path, nil, http.StatusOK)
	if keys := responseMapKeys(t, recoveredEvent); len(keys) != 1 || keys[0] != responseID {
		t.Fatalf("account could not recover its response, got %v", keys)
	}
	recovered.request(http.MethodPost, path+"/response", map[string]string{"responseId": responseID, "name": "Recovered Name"}, http.StatusOK)
	recovered.request(http.MethodPost, path+"/rename-user", map[string]string{"responseId": responseID, "newName": "Renamed"}, http.StatusOK)
	recovered.request(http.MethodDelete, path+"/response", map[string]string{"responseId": responseID}, http.StatusOK)

	afterDelete := recovered.request(http.MethodGet, path, nil, http.StatusOK)
	if keys := responseMapKeys(t, afterDelete); len(keys) != 0 {
		t.Fatalf("response survived deletion: %v", keys)
	}
}


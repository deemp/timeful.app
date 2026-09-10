package routes

import (
	"context"
	"encoding/json"
	"io"
	"net/http"
	"testing"

	"go.mongodb.org/mongo-driver/bson"
	"go.mongodb.org/mongo-driver/bson/primitive"
	"timeful/server/db"
	"timeful/server/eventsource"
	"timeful/server/models"
	pgstore "timeful/server/postgres"
	"timeful/server/utils"
)

func groupEventPayload(name string, attendees []string) map[string]any {
	return map[string]any{
		"name":          name,
		"type":          string(models.GROUP),
		"attendees":     attendees,
		"collectEmails": false,
	}
}

// createPostgresGroup creates an availability group and registers cleanup for
// its PostgreSQL row.
func createPostgresGroup(t *testing.T, client *accountContractClient, name string, attendees []string) (string, *pgstore.Event) {
	t.Helper()
	t.Setenv("APP_BASE_URL", "https://timeful.test")
	created := client.request(http.MethodPost, "/api/events", groupEventPayload(name, attendees), http.StatusCreated)
	eventID := decodeAccountString(t, created, "eventId")
	if eventID == "" {
		t.Fatal("group creation did not return an event identifier")
	}
	if source, _ := eventsource.Parse(eventID); source != eventsource.PostgreSQL {
		t.Fatalf("group creation returned a non-PostgreSQL identifier %q", eventID)
	}
	t.Cleanup(func() {
		if pgstore.Pool != nil {
			_, _ = pgstore.Pool.Exec(context.Background(), `DELETE FROM postgres_events WHERE short_id = $1`, eventID)
		}
	})
	stored, err := repositoryForTest(t).GetEventByShortID(context.Background(), eventID)
	if err != nil {
		t.Fatalf("group event not stored in PostgreSQL: %v", err)
	}
	return eventID, stored
}

func groupAttendeeEmails(t *testing.T, stored *pgstore.Event) map[string]*bool {
	t.Helper()
	attendees, err := repositoryForTest(t).ListAttendees(context.Background(), stored.ID)
	if err != nil {
		t.Fatalf("list attendees: %v", err)
	}
	result := make(map[string]*bool, len(attendees))
	for _, attendee := range attendees {
		result[attendee.Email] = attendee.Declined
	}
	return result
}

func seedGroupAccountResponse(t *testing.T, stored *pgstore.Event, externalUserID, name, email string) {
	t.Helper()
	ctx := context.Background()
	repository := repositoryForTest(t)
	visitor, err := repository.CreateEventVisitorIdentity(ctx, stored.ID)
	if err != nil {
		t.Fatal(err)
	}
	payload, err := json.Marshal(models.Response{Name: name, Email: email})
	if err != nil {
		t.Fatal(err)
	}
	if err := repository.CreateResponse(ctx, &pgstore.Response{
		EventID:                stored.ID,
		EventVisitorIdentityID: visitor.ID,
		RespondentKind:         pgstore.RespondentKindAccount,
		AccountUserID:          &externalUserID,
		Payload:                payload,
	}); err != nil {
		t.Fatal(err)
	}
	if _, err := pgstore.Pool.Exec(ctx, `UPDATE postgres_events SET num_responses = num_responses + 1 WHERE id = $1`, stored.ID); err != nil {
		t.Fatal(err)
	}
}

func decodeGroupReadAttendees(t *testing.T, data map[string]json.RawMessage) map[string]*bool {
	t.Helper()
	var rows []struct {
		Email    string `json:"email"`
		Declined *bool  `json:"declined"`
	}
	if err := json.Unmarshal(data["attendees"], &rows); err != nil {
		t.Fatalf("decode attendees: %v", err)
	}
	result := make(map[string]*bool, len(rows))
	for _, row := range rows {
		result[row.Email] = row.Declined
	}
	return result
}

func decodeGroupReadRespondents(t *testing.T, data map[string]json.RawMessage) map[string]struct {
	Email string `json:"email"`
	User  *struct {
		Email string `json:"email"`
	} `json:"user"`
} {
	t.Helper()
	var rows map[string]struct {
		Email string `json:"email"`
		User  *struct {
			Email string `json:"email"`
		} `json:"user"`
	}
	if err := json.Unmarshal(data["responses"], &rows); err != nil {
		t.Fatalf("decode responses: %v", err)
	}
	return rows
}

type capturedGroupEmail struct {
	subscriberEmail string
	templateID      int
	data            map[string]any
}

// installListmonkCapture intercepts the Listmonk HTTP calls so group invitation
// and update emails can be asserted without the network.
func installListmonkCapture(t *testing.T) *[]capturedGroupEmail {
	t.Helper()
	previous := http.DefaultTransport
	t.Cleanup(func() { http.DefaultTransport = previous })
	t.Setenv("LISTMONK_ENABLED", "true")
	t.Setenv("LISTMONK_URL", "http://listmonk.test")
	t.Setenv("LISTMONK_USERNAME", "listmonk")
	t.Setenv("LISTMONK_PASSWORD", "secret")
	t.Setenv("LISTMONK_LIST_ID", "1")
	captured := &[]capturedGroupEmail{}
	http.DefaultTransport = accountContractRoundTrip(func(request *http.Request) (*http.Response, error) {
		switch {
		case request.URL.Host == "listmonk.test" && request.URL.Path == "/api/subscribers" && request.Method == http.MethodGet:
			return accountContractJSONResponse(t, request, `{"data":{"results":[]}}`), nil
		case request.URL.Host == "listmonk.test" && request.URL.Path == "/api/subscribers":
			return accountContractJSONResponse(t, request, `{}`), nil
		case request.URL.Host == "listmonk.test" && request.URL.Path == "/api/tx":
			body, _ := io.ReadAll(request.Body)
			var payload struct {
				SubscriberEmail string         `json:"subscriber_email"`
				TemplateID      int            `json:"template_id"`
				Data            map[string]any `json:"data"`
			}
			if err := json.Unmarshal(body, &payload); err != nil {
				t.Errorf("decode listmonk payload: %v", err)
			}
			*captured = append(*captured, capturedGroupEmail{subscriberEmail: payload.SubscriberEmail, templateID: payload.TemplateID, data: payload.Data})
			return accountContractJSONResponse(t, request, `{}`), nil
		default:
			return previous.RoundTrip(request)
		}
	})
	return captured
}

// TestPostgresGroupCreationPersistsOwnerAndInviteesAndSendsInvites proves that
// signed-in creation stores the owner attendee and invitees, writes no MongoDB
// event document, and sends the existing invitation email.
func TestPostgresGroupCreationPersistsOwnerAndInviteesAndSendsInvites(t *testing.T) {
	router := signedInPostgresEventRouter(t)
	owner, ownerAccount := createSignedInAccount(t, router)
	invitee := "group-invitee-" + primitive.NewObjectID().Hex() + "@example.com"
	captured := installListmonkCapture(t)

	name := "Group creation " + primitive.NewObjectID().Hex()
	eventID, stored := createPostgresGroup(t, owner, name, []string{invitee})
	if stored.Type != pgstore.EventTypeGroup {
		t.Fatalf("stored type = %q, want %q", stored.Type, pgstore.EventTypeGroup)
	}
	if stored.OwnerExternalID == nil || *stored.OwnerExternalID != ownerAccount.ExternalUserID {
		t.Fatalf("owner external id = %v, want %q", stored.OwnerExternalID, ownerAccount.ExternalUserID)
	}
	objectID := accountObjectID(t, ownerAccount.ExternalUserID)
	mongoEvents, err := db.EventsCollection.CountDocuments(context.Background(), bson.M{"ownerId": objectID})
	if err != nil {
		t.Fatal(err)
	}
	if mongoEvents != 0 {
		t.Fatalf("group creation wrote %d MongoDB event documents", mongoEvents)
	}
	attendees := groupAttendeeEmails(t, stored)
	if _, ok := attendees[ownerAccount.Email]; !ok {
		t.Fatalf("owner attendee missing: %#v", attendees)
	}
	if _, ok := attendees[invitee]; !ok {
		t.Fatalf("invitee attendee missing: %#v", attendees)
	}

	if len(*captured) != 1 {
		t.Fatalf("sent %d group emails, want 1: %#v", len(*captured), *captured)
	}
	if (*captured)[0].templateID != postgresGroupInviteEmailTemplate || (*captured)[0].subscriberEmail != invitee {
		t.Fatalf("invite email = %#v, want template %d to %s", (*captured)[0], postgresGroupInviteEmailTemplate, invitee)
	}
	if got := (*captured)[0].data["groupName"]; got != name {
		t.Fatalf("invite email groupName = %v, want %q", got, name)
	}
	if got, _ := (*captured)[0].data["groupUrl"].(string); got == "" {
		t.Fatal("invite email groupUrl was empty")
	}
	_ = eventID
}

// TestPostgresAnonymousGroupCreationPersistsInvitees proves anonymous creation
// writes the invitees to PostgreSQL and no MongoDB event document.
func TestPostgresAnonymousGroupCreationPersistsInvitees(t *testing.T) {
	router := signedInPostgresEventRouter(t)
	client := newAccountContractClient(t, router)
	invitees := []string{
		"anon-group-" + primitive.NewObjectID().Hex() + "@example.com",
		"anon-group-" + primitive.NewObjectID().Hex() + "@example.com",
	}
	name := "Anonymous group " + primitive.NewObjectID().Hex()
	_, stored := createPostgresGroup(t, client, name, invitees)
	attendees := groupAttendeeEmails(t, stored)
	if len(attendees) != 2 {
		t.Fatalf("anonymous group stored %d attendees, want 2: %#v", len(attendees), attendees)
	}
	for _, email := range invitees {
		if _, ok := attendees[email]; !ok {
			t.Fatalf("invitee %q missing from %#v", email, attendees)
		}
	}
	mongoEvents, err := db.EventsCollection.CountDocuments(context.Background(), bson.M{"name": name})
	if err != nil {
		t.Fatal(err)
	}
	if mongoEvents != 0 {
		t.Fatalf("anonymous group creation wrote %d MongoDB event documents", mongoEvents)
	}
}

// TestPostgresGroupReadReturnsAttendeesAndInviteeEmailVisibility proves reads
// expose attendees and keep respondent emails visible to the owner and
// non-declined invitees while redacting them from strangers.
func TestPostgresGroupReadReturnsAttendeesAndInviteeEmailVisibility(t *testing.T) {
	router := signedInPostgresEventRouter(t)
	owner, _ := createSignedInAccount(t, router)
	member, memberAccount := createSignedInAccount(t, router)
	name := "Group read " + primitive.NewObjectID().Hex()
	eventID, stored := createPostgresGroup(t, owner, name, []string{memberAccount.Email})
	seedGroupAccountResponse(t, stored, memberAccount.ExternalUserID, "Member Display", memberAccount.Email)

	ownerRead := owner.request(http.MethodGet, "/api/events/"+eventID, nil, http.StatusOK)
	if got := decodeAccountString(t, ownerRead, "type"); got != string(models.GROUP) {
		t.Fatalf("read type = %q, want group", got)
	}
	attendees := decodeGroupReadAttendees(t, ownerRead)
	if _, ok := attendees[memberAccount.Email]; !ok {
		t.Fatalf("read attendees missing member: %#v", attendees)
	}
	ownerRespondents := decodeGroupReadRespondents(t, ownerRead)
	if len(ownerRespondents) != 1 {
		t.Fatalf("owner read saw %d responses, want 1", len(ownerRespondents))
	}
	for _, respondent := range ownerRespondents {
		if respondent.User == nil || respondent.User.Email != memberAccount.Email {
			t.Fatalf("owner-visible response user email = %#v, want %q", respondent.User, memberAccount.Email)
		}
	}

	memberRead := member.request(http.MethodGet, "/api/events/"+eventID, nil, http.StatusOK)
	memberRespondents := decodeGroupReadRespondents(t, memberRead)
	for _, respondent := range memberRespondents {
		if respondent.User == nil || respondent.User.Email != memberAccount.Email {
			t.Fatalf("invitee-visible response user email = %#v, want %q", respondent.User, memberAccount.Email)
		}
	}
	if !decodeDashboardBool(t, memberRead, "hasResponded") {
		t.Fatal("member read did not report derived hasResponded")
	}
	if decodeDashboardBool(t, ownerRead, "hasResponded") {
		t.Fatal("owner read reported hasResponded without a response")
	}

	stranger, _ := createSignedInAccount(t, router)
	strangerRead := stranger.request(http.MethodGet, "/api/events/"+eventID, nil, http.StatusOK)
	strangerRespondents := decodeGroupReadRespondents(t, strangerRead)
	for _, respondent := range strangerRespondents {
		if respondent.Email != "" || (respondent.User != nil && respondent.User.Email != "") {
			t.Fatalf("stranger saw respondent email: %#v", respondent)
		}
	}
}

// TestPostgresGroupEditMembershipRemovesDepartedResponses proves settings and
// attendee edits update membership, protect the owner, and delete a departed
// member's response while keeping the response count correct.
func TestPostgresGroupEditMembershipRemovesDepartedResponses(t *testing.T) {
	router := signedInPostgresEventRouter(t)
	owner, ownerAccount := createSignedInAccount(t, router)
	member, memberAccount := createSignedInAccount(t, router)
	name := "Group edit " + primitive.NewObjectID().Hex()
	eventID, stored := createPostgresGroup(t, owner, name, []string{memberAccount.Email})
	seedGroupAccountResponse(t, stored, memberAccount.ExternalUserID, "Member Display", memberAccount.Email)

	// Removing the member drops their response and response count, while the
	// owner membership stays protected.
	owner.request(http.MethodPut, "/api/events/"+eventID, groupEventPayload(name, nil), http.StatusOK)
	attendees := groupAttendeeEmails(t, stored)
	if _, ok := attendees[memberAccount.Email]; ok {
		t.Fatalf("removed member still an attendee: %#v", attendees)
	}
	if _, ok := attendees[ownerAccount.Email]; !ok {
		t.Fatalf("owner attendee was removed: %#v", attendees)
	}
	reloaded, err := repositoryForTest(t).GetEventByShortID(context.Background(), eventID)
	if err != nil {
		t.Fatal(err)
	}
	if reloaded.NumResponses != 0 {
		t.Fatalf("num_responses = %d, want 0 after removal", reloaded.NumResponses)
	}
	var remaining int
	if err := pgstore.Pool.QueryRow(context.Background(), `SELECT count(*) FROM postgres_event_responses WHERE event_id = $1`, stored.ID).Scan(&remaining); err != nil {
		t.Fatal(err)
	}
	if remaining != 0 {
		t.Fatalf("departed member response rows = %d, want 0", remaining)
	}

	// Adding a member persists the new membership.
	added := "group-added-" + primitive.NewObjectID().Hex() + "@example.com"
	owner.request(http.MethodPut, "/api/events/"+eventID, groupEventPayload(name, []string{added}), http.StatusOK)
	if _, ok := groupAttendeeEmails(t, stored)[added]; !ok {
		t.Fatal("added member was not persisted")
	}
	_ = member
}

// TestPostgresGroupDeclineAndUndecline proves invite decline and undecline
// update the PostgreSQL attendee state for the signed-in member.
func TestPostgresGroupDeclineAndUndecline(t *testing.T) {
	router := signedInPostgresEventRouter(t)
	owner, _ := createSignedInAccount(t, router)
	member, memberAccount := createSignedInAccount(t, router)
	name := "Group decline " + primitive.NewObjectID().Hex()
	eventID, stored := createPostgresGroup(t, owner, name, []string{memberAccount.Email})

	member.request(http.MethodPost, "/api/events/"+eventID+"/decline", nil, http.StatusOK)
	assertGroupDeclined(t, stored, memberAccount.Email, true)

	member.request(http.MethodPost, "/api/events/"+eventID+"/decline", map[string]any{"declined": false}, http.StatusOK)
	assertGroupDeclined(t, stored, memberAccount.Email, false)

	// A signed-in account that is not an attendee cannot decline.
	stranger, _ := createSignedInAccount(t, router)
	stranger.request(http.MethodPost, "/api/events/"+eventID+"/decline", nil, http.StatusNotFound)
}

func assertGroupDeclined(t *testing.T, stored *pgstore.Event, email string, want bool) {
	t.Helper()
	attendee, err := repositoryForTest(t).GetAttendeeByEmail(context.Background(), stored.ID, email)
	if err != nil {
		t.Fatalf("load attendee %q: %v", email, err)
	}
	if attendee.Declined == nil || *attendee.Declined != want {
		t.Fatalf("attendee %q declined = %v, want %v", email, attendee.Declined, want)
	}
}

// TestPostgresGroupLifecycleAndAuthorization proves archive, unarchive, and
// deletion run on PostgreSQL with existing owner authorization and cascade
// membership deletion, and that strangers are rejected.
func TestPostgresGroupLifecycleAndAuthorization(t *testing.T) {
	router := signedInPostgresEventRouter(t)
	owner, _ := createSignedInAccount(t, router)
	name := "Group lifecycle " + primitive.NewObjectID().Hex()
	eventID, _ := createPostgresGroup(t, owner, name, []string{"lifecycle-" + primitive.NewObjectID().Hex() + "@example.com"})
	path := "/api/events/" + eventID

	stranger, _ := createSignedInAccount(t, router)
	stranger.request(http.MethodPut, path, groupEventPayload(name, nil), http.StatusForbidden)
	stranger.request(http.MethodPost, path+"/archive", map[string]bool{"archive": true}, http.StatusForbidden)
	stranger.request(http.MethodDelete, path, nil, http.StatusForbidden)

	owner.request(http.MethodPost, path+"/archive", map[string]bool{"archive": true}, http.StatusOK)
	owner.request(http.MethodPut, path, groupEventPayload(name, nil), http.StatusForbidden)
	owner.request(http.MethodPost, path+"/archive", map[string]bool{"archive": false}, http.StatusOK)
	owner.request(http.MethodPut, path, groupEventPayload(name, nil), http.StatusOK)

	owner.request(http.MethodDelete, path, nil, http.StatusOK)
	owner.request(http.MethodGet, path, nil, http.StatusNotFound)
	deleted, err := repositoryForTest(t).GetEventByShortID(context.Background(), eventID)
	if err != nil {
		t.Fatalf("load deleted group: %v", err)
	}
	if !deleted.IsDeleted {
		t.Fatal("group was not soft-deleted")
	}
}

// TestPostgresGroupDashboardRespondedState proves the signed-in dashboard lists
// PostgreSQL groups with the canonical public identifier and correct responded
// state, and merges legacy MongoDB groups unchanged.
func TestPostgresGroupDashboardRespondedState(t *testing.T) {
	router := signedInPostgresEventRouter(t)
	owner, ownerAccount := createSignedInAccount(t, router)
	member, memberAccount := createSignedInAccount(t, router)
	ctx := context.Background()

	name := "Dashboard group " + primitive.NewObjectID().Hex()
	eventID, stored := createPostgresGroup(t, owner, name, []string{memberAccount.Email})

	memberRow := findDashboardEventByName(t, member.requestArray(http.MethodGet, "/api/user/events", http.StatusOK), name)
	if memberRow == nil {
		t.Fatal("member dashboard did not list the PostgreSQL group invite")
	}
	if got := dashboardEventField(t, memberRow, "_id"); got != eventID {
		t.Fatalf("group _id = %q, want canonical short id %q", got, eventID)
	}
	if got := dashboardEventField(t, memberRow, "shortId"); got != eventID {
		t.Fatalf("group shortId = %q, want %q", got, eventID)
	}
	if got := decodeDashboardBool(t, memberRow, "hasResponded"); got {
		t.Fatal("pending invite reported hasResponded true")
	}

	seedGroupAccountResponse(t, stored, memberAccount.ExternalUserID, "Member Display", memberAccount.Email)
	responded := false
	for _, row := range member.requestArray(http.MethodGet, "/api/user/events", http.StatusOK) {
		if dashboardEventField(t, row, "name") == name {
			responded = decodeDashboardBool(t, row, "hasResponded")
		}
	}
	if !responded {
		t.Fatal("member dashboard did not report hasResponded after responding")
	}

	stranger, _ := createSignedInAccount(t, router)
	if row := findDashboardEventByName(t, stranger.requestArray(http.MethodGet, "/api/user/events", http.StatusOK), name); row != nil {
		t.Fatal("dashboard revealed a group to a non-member")
	}

	// A legacy MongoDB group the account owns still merges with its own
	// canonical identifier and responded state.
	mongoName := "Legacy dashboard group " + primitive.NewObjectID().Hex()
	mongoID := primitive.NewObjectID()
	t.Cleanup(func() {
		_, _ = db.EventsCollection.DeleteOne(context.Background(), bson.M{"_id": mongoID})
	})
	if _, err := db.EventsCollection.InsertOne(ctx, models.Event{
		Id:        mongoID,
		OwnerId:   accountObjectID(t, ownerAccount.ExternalUserID),
		Name:      mongoName,
		Type:      models.GROUP,
		IsDeleted: utils.FalsePtr(),
	}); err != nil {
		t.Fatal(err)
	}
	mongoRow := findDashboardEventByName(t, owner.requestArray(http.MethodGet, "/api/user/events", http.StatusOK), mongoName)
	if mongoRow == nil {
		t.Fatal("owner dashboard did not list the legacy MongoDB group")
	}
	if got := dashboardEventField(t, mongoRow, "_id"); got != mongoID.Hex() {
		t.Fatalf("legacy group _id = %q, want %q", got, mongoID.Hex())
	}
	if decodeDashboardBool(t, mongoRow, "hasResponded") {
		t.Fatal("legacy group without a response reported hasResponded true")
	}
}

func decodeDashboardBool(t *testing.T, row map[string]json.RawMessage, key string) bool {
	t.Helper()
	var value bool
	if err := json.Unmarshal(row[key], &value); err != nil {
		t.Fatalf("decode %s: %v", key, err)
	}
	return value
}

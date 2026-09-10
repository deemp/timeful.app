package routes

import (
	"context"
	"encoding/json"
	"net/http"
	"testing"

	"go.mongodb.org/mongo-driver/bson/primitive"
	pgstore "timeful/server/postgres"
)

func signupBlockPayload(name string, capacity *int, startDate, endDate string) map[string]any {
	block := map[string]any{"name": name, "startDate": startDate, "endDate": endDate}
	if capacity != nil {
		block["capacity"] = *capacity
	}
	return block
}

func intPtr(value int) *int { return &value }

// createSignupPostgresEvent creates a PostgreSQL signup form with the supplied
// blocks and returns its public identifier, stored event, and stored blocks.
func createSignupPostgresEvent(t *testing.T, client *accountContractClient, name string, blocks []map[string]any) (string, *pgstore.Event, []pgstore.SignupBlock) {
	t.Helper()
	payload := canonicalTimedEventPayload(name)
	payload["isSignUpForm"] = true
	payload["collectEmails"] = true
	if blocks != nil {
		payload["signUpBlocks"] = blocks
	}
	created := client.request(http.MethodPost, "/api/events", payload, http.StatusCreated)
	eventID := decodeAccountString(t, created, "eventId")
	if eventID == "" {
		t.Fatal("signup creation did not return an event identifier")
	}
	t.Cleanup(func() {
		_, _ = pgstore.Pool.Exec(context.Background(), `DELETE FROM postgres_events WHERE short_id = $1`, eventID)
	})
	repository := repositoryForTest(t)
	stored, err := repository.GetEventByShortID(context.Background(), eventID)
	if err != nil {
		t.Fatalf("signup event not stored: %v", err)
	}
	storedBlocks, err := repository.ListSignupBlocks(context.Background(), stored.ID)
	if err != nil {
		t.Fatalf("signup blocks not stored: %v", err)
	}
	return eventID, stored, storedBlocks
}

func decodeSignupReadBlocks(t *testing.T, data map[string]json.RawMessage) []postgresSignupBlock {
	t.Helper()
	var blocks []postgresSignupBlock
	if err := json.Unmarshal(data["signUpBlocks"], &blocks); err != nil {
		t.Fatalf("decode signUpBlocks: %v", err)
	}
	return blocks
}

func decodeSignupReadResponses(t *testing.T, data map[string]json.RawMessage) map[string]postgresSignupResponsePayload {
	t.Helper()
	var rows map[string]postgresSignupResponsePayload
	if err := json.Unmarshal(data["signUpResponses"], &rows); err != nil {
		t.Fatalf("decode signUpResponses: %v", err)
	}
	return rows
}

// TestPostgresSignupCreationPersistsBlocksAndReadsCanonicalResponses proves that
// an anonymous signup creation stores the signup kind and ordered blocks, that
// reads return the blocks and canonicalized signup responses, and that email
// redaction matches the legacy collectEmails plus owner rules.
func TestPostgresSignupCreationPersistsBlocksAndReadsCanonicalResponses(t *testing.T) {
	router := signedInPostgresEventRouter(t)
	owner, ownerAccount := createSignedInAccount(t, router)
	eventID, stored, storedBlocks := createSignupPostgresEvent(t, owner, "Signup "+primitive.NewObjectID().Hex(), []map[string]any{
		signupBlockPayload("Morning", intPtr(2), "2026-01-05T09:00:00Z", "2026-01-05T10:00:00Z"),
		signupBlockPayload("Afternoon", nil, "2026-01-05T13:00:00Z", "2026-01-05T14:00:00Z"),
	})

	if stored.Type != pgstore.EventTypeSignup {
		t.Fatalf("stored type = %q, want %q", stored.Type, pgstore.EventTypeSignup)
	}
	if len(storedBlocks) != 2 {
		t.Fatalf("stored %d blocks, want 2", len(storedBlocks))
	}
	if storedBlocks[0].Name != "Morning" || storedBlocks[0].Position != 1 {
		t.Fatalf("first stored block = %#v", storedBlocks[0])
	}
	if storedBlocks[0].Capacity == nil || *storedBlocks[0].Capacity != 2 {
		t.Fatalf("first stored capacity = %v, want 2", storedBlocks[0].Capacity)
	}
	if storedBlocks[0].StartDate == nil || storedBlocks[0].StartDate.UTC().Format("15:04") != "09:00" {
		t.Fatalf("first stored start = %v", storedBlocks[0].StartDate)
	}

	repository := repositoryForTest(t)
	ctx := context.Background()
	guestVisitor, err := repository.CreateEventVisitorIdentity(ctx, stored.ID)
	if err != nil {
		t.Fatal(err)
	}
	if err := repository.CreateSignupResponse(ctx, &pgstore.SignupResponse{
		EventID:                stored.ID,
		EventVisitorIdentityID: guestVisitor.ID,
		RespondentKind:         pgstore.RespondentKindGuest,
		Name:                   "  Ada Lovelace  ",
		Email:                  "ada@example.com",
		BlockIDs:               []string{storedBlocks[1].ID},
	}); err != nil {
		t.Fatal(err)
	}
	accountVisitor, err := repository.CreateEventVisitorIdentity(ctx, stored.ID)
	if err != nil {
		t.Fatal(err)
	}
	if err := repository.CreateSignupResponse(ctx, &pgstore.SignupResponse{
		EventID:                stored.ID,
		EventVisitorIdentityID: accountVisitor.ID,
		RespondentKind:         pgstore.RespondentKindAccount,
		AccountUserID:          &ownerAccount.ExternalUserID,
		Email:                  "owner@example.com",
		BlockIDs:               []string{storedBlocks[0].ID},
	}); err != nil {
		t.Fatal(err)
	}

	read := owner.request(http.MethodGet, "/api/events/"+eventID, nil, http.StatusOK)
	var isSignup bool
	if err := json.Unmarshal(read["isSignUpForm"], &isSignup); err != nil || !isSignup {
		t.Fatalf("read isSignUpForm = %s, err %v", read["isSignUpForm"], err)
	}
	if got := decodeAccountString(t, read, "type"); got != "specific_dates" {
		t.Fatalf("read type = %q, want legacy wire type specific_dates", got)
	}
	readBlocks := decodeSignupReadBlocks(t, read)
	if len(readBlocks) != 2 || readBlocks[0].ID != storedBlocks[0].ID || readBlocks[1].ID != storedBlocks[1].ID {
		t.Fatalf("read blocks = %#v, stored = %#v", readBlocks, storedBlocks)
	}

	ownerResponses := decodeSignupReadResponses(t, read)
	guest, ok := ownerResponses["Ada Lovelace"]
	if !ok {
		t.Fatalf("owner read missing canonical guest response: %#v", ownerResponses)
	}
	if guest.Email != "ada@example.com" {
		t.Fatalf("owner-visible guest email = %q", guest.Email)
	}
	if len(guest.SignUpBlockIDs) != 1 || guest.SignUpBlockIDs[0] != storedBlocks[1].ID {
		t.Fatalf("guest block ids = %#v", guest.SignUpBlockIDs)
	}
	account, ok := ownerResponses[ownerAccount.ExternalUserID]
	if !ok || account.Email != "owner@example.com" {
		t.Fatalf("owner read missing account response email: %#v", ownerResponses)
	}

	// A non-owner sees the same signup responses with emails redacted.
	stranger, _ := createSignedInAccount(t, router)
	strangerRead := stranger.request(http.MethodGet, "/api/events/"+eventID, nil, http.StatusOK)
	strangerResponses := decodeSignupReadResponses(t, strangerRead)
	if guest := strangerResponses["Ada Lovelace"]; guest.Email != "" {
		t.Fatalf("non-owner saw guest email %q", guest.Email)
	}
	if account := strangerResponses[ownerAccount.ExternalUserID]; account.Email != "" {
		t.Fatalf("non-owner saw account email %q", account.Email)
	}
	if account := strangerResponses[ownerAccount.ExternalUserID]; account.User != nil && account.User.Email != "" {
		t.Fatalf("non-owner saw account user email %q", account.User.Email)
	}
}

// TestPostgresSignupBlindAvailabilityParity proves the signup read keeps the
// legacy blind-availability privacy: a non-owner does not receive numResponses.
func TestPostgresSignupBlindAvailabilityParity(t *testing.T) {
	router := signedInPostgresEventRouter(t)
	owner, _ := createSignedInAccount(t, router)
	payload := canonicalTimedEventPayload("Blind signup " + primitive.NewObjectID().Hex())
	payload["isSignUpForm"] = true
	payload["blindAvailabilityEnabled"] = true
	created := owner.request(http.MethodPost, "/api/events", payload, http.StatusCreated)
	eventID := decodeAccountString(t, created, "eventId")
	t.Cleanup(func() {
		_, _ = pgstore.Pool.Exec(context.Background(), `DELETE FROM postgres_events WHERE short_id = $1`, eventID)
	})

	stranger, _ := createSignedInAccount(t, router)
	read := stranger.request(http.MethodGet, "/api/events/"+eventID, nil, http.StatusOK)
	if _, leaked := read["numResponses"]; leaked {
		t.Fatal("blind non-owner saw the response count")
	}
	if _, present := read["signUpBlocks"]; !present {
		t.Fatal("blind read omitted signup blocks")
	}
}

// TestPostgresSignupBlockEditReplacesOrderedSet proves that a settings edit
// replaces the ordered block set on the block table, keeps the signup kind, and
// detaches removed block relations from existing signup responses.
func TestPostgresSignupBlockEditReplacesOrderedSet(t *testing.T) {
	router := signedInPostgresEventRouter(t)
	owner, _ := createSignedInAccount(t, router)
	eventID, stored, storedBlocks := createSignupPostgresEvent(t, owner, "Edited signup "+primitive.NewObjectID().Hex(), []map[string]any{
		signupBlockPayload("Morning", intPtr(2), "2026-01-05T09:00:00Z", "2026-01-05T10:00:00Z"),
		signupBlockPayload("Afternoon", nil, "2026-01-05T13:00:00Z", "2026-01-05T14:00:00Z"),
	})

	repository := repositoryForTest(t)
	ctx := context.Background()
	visitor, err := repository.CreateEventVisitorIdentity(ctx, stored.ID)
	if err != nil {
		t.Fatal(err)
	}
	removed := storedBlocks[0].ID
	if err := repository.CreateSignupResponse(ctx, &pgstore.SignupResponse{
		EventID:                stored.ID,
		EventVisitorIdentityID: visitor.ID,
		RespondentKind:         pgstore.RespondentKindGuest,
		Name:                   "Grace Hopper",
		BlockIDs:               []string{removed},
	}); err != nil {
		t.Fatal(err)
	}

	edited := canonicalTimedEventPayload("Edited signup form")
	edited["isSignUpForm"] = true
	edited["signUpBlocks"] = []map[string]any{
		{"_id": storedBlocks[1].ID, "name": "Afternoon renamed", "capacity": 5, "startDate": "2026-01-05T13:30:00Z", "endDate": "2026-01-05T14:30:00Z"},
		signupBlockPayload("Evening", nil, "2026-01-05T18:00:00Z", "2026-01-05T19:00:00Z"),
	}
	owner.request(http.MethodPut, "/api/events/"+eventID, edited, http.StatusOK)

	reloaded, err := repository.GetEventByShortID(ctx, eventID)
	if err != nil {
		t.Fatal(err)
	}
	if reloaded.Type != pgstore.EventTypeSignup {
		t.Fatalf("type after edit = %q, want signup", reloaded.Type)
	}
	blocks, err := repository.ListSignupBlocks(ctx, reloaded.ID)
	if err != nil {
		t.Fatal(err)
	}
	if len(blocks) != 2 || blocks[0].ID != storedBlocks[1].ID || blocks[0].Name != "Afternoon renamed" || blocks[0].Capacity == nil || *blocks[0].Capacity != 5 {
		t.Fatalf("edited blocks = %#v", blocks)
	}
	if blocks[1].Name != "Evening" || blocks[1].Position != 2 {
		t.Fatalf("second edited block = %#v", blocks[1])
	}
	for _, block := range blocks {
		if block.ID == removed {
			t.Fatal("removed block survived the edit")
		}
	}

	response, err := repository.GetSignupResponseByPublicID(ctx, reloaded.ID, guestPublicID(t, repository, reloaded.ID))
	if err != nil {
		t.Fatal(err)
	}
	if len(response.BlockIDs) != 0 {
		t.Fatalf("removed block relation was not detached: %#v", response.BlockIDs)
	}

	// A metadata edit that omits signUpBlocks preserves the block set.
	metadataEdit := canonicalTimedEventPayload("Edited signup form")
	metadataEdit["isSignUpForm"] = true
	owner.request(http.MethodPut, "/api/events/"+eventID, metadataEdit, http.StatusOK)
	preserved, err := repository.ListSignupBlocks(ctx, reloaded.ID)
	if err != nil {
		t.Fatal(err)
	}
	if len(preserved) != 2 || preserved[0].ID != blocks[0].ID || preserved[1].ID != blocks[1].ID {
		t.Fatalf("omitted signUpBlocks did not preserve the block set: %#v", preserved)
	}
}

func guestPublicID(t *testing.T, repository *pgstore.Repository, eventID string) string {
	t.Helper()
	responses, err := repository.ListSignupResponses(context.Background(), eventID)
	if err != nil {
		t.Fatal(err)
	}
	for _, response := range responses {
		if response.RespondentKind == pgstore.RespondentKindGuest {
			return response.PublicID
		}
	}
	t.Fatal("guest signup response not found")
	return ""
}

// TestPostgresSignupLifecycleAndAuthorization proves archive/unarchive and
// deletion operate on PostgreSQL with existing owner authorization, and that
// strangers are rejected.
func TestPostgresSignupLifecycleAndAuthorization(t *testing.T) {
	router := signedInPostgresEventRouter(t)
	owner, _ := createSignedInAccount(t, router)
	eventID, _, _ := createSignupPostgresEvent(t, owner, "Lifecycle signup "+primitive.NewObjectID().Hex(), nil)
	path := "/api/events/" + eventID

	owner.request(http.MethodPost, path+"/archive", map[string]bool{"archive": true}, http.StatusOK)
	archived := owner.request(http.MethodGet, path, nil, http.StatusOK)
	var isArchived bool
	if err := json.Unmarshal(archived["isArchived"], &isArchived); err != nil || !isArchived {
		t.Fatalf("archived read = %s, err %v", archived["isArchived"], err)
	}
	owner.request(http.MethodPut, path, canonicalTimedEventPayload("Blocked while archived"), http.StatusForbidden)

	owner.request(http.MethodPost, path+"/archive", map[string]bool{"archive": false}, http.StatusOK)
	owner.request(http.MethodPut, path, func() map[string]any {
		payload := canonicalTimedEventPayload("Unarchived signup edit")
		payload["isSignUpForm"] = true
		return payload
	}(), http.StatusOK)

	stranger, _ := createSignedInAccount(t, router)
	stranger.request(http.MethodPut, path, canonicalTimedEventPayload("Hijacked"), http.StatusForbidden)
	stranger.request(http.MethodPost, path+"/archive", map[string]bool{"archive": true}, http.StatusForbidden)
	stranger.request(http.MethodDelete, path, nil, http.StatusForbidden)

	owner.request(http.MethodDelete, path, nil, http.StatusOK)
	owner.request(http.MethodGet, path, nil, http.StatusNotFound)
}

// TestPostgresSignupDashboardListsRespondedForm proves a signup response makes
// the form appear on the respondent account's dashboard.
func TestPostgresSignupDashboardListsRespondedForm(t *testing.T) {
	router := signedInPostgresEventRouter(t)
	owner, _ := createSignedInAccount(t, router)
	name := "Dashboard signup " + primitive.NewObjectID().Hex()
	eventID, stored, blocks := createSignupPostgresEvent(t, owner, name, []map[string]any{
		signupBlockPayload("Morning", intPtr(2), "2026-01-05T09:00:00Z", "2026-01-05T10:00:00Z"),
	})

	repository := repositoryForTest(t)
	ctx := context.Background()
	responder, responderAccount := createSignedInAccount(t, router)
	visitor, err := repository.CreateEventVisitorIdentity(ctx, stored.ID)
	if err != nil {
		t.Fatal(err)
	}
	if err := repository.CreateSignupResponse(ctx, &pgstore.SignupResponse{
		EventID:                stored.ID,
		EventVisitorIdentityID: visitor.ID,
		RespondentKind:         pgstore.RespondentKindAccount,
		AccountUserID:          &responderAccount.ExternalUserID,
		BlockIDs:               []string{blocks[0].ID},
	}); err != nil {
		t.Fatal(err)
	}

	row := findDashboardEventByName(t, responder.requestArray(http.MethodGet, "/api/user/events", http.StatusOK), name)
	if row == nil {
		t.Fatal("responder dashboard did not list the signup form it signed up for")
	}
	if got := dashboardEventField(t, row, "_id"); got != eventID {
		t.Fatalf("responded signup _id = %q, want %q", got, eventID)
	}
}

// TestPostgresSignupAccountResponseLifecycle proves a signed-in account can
// create, update block membership, and delete a signup response through the
// explicit-selection contract, that the read exposes its publicId with canEdit,
// and that signup responses do not change num_responses.
func TestPostgresSignupAccountResponseLifecycle(t *testing.T) {
	router := signedInPostgresEventRouter(t)
	owner, ownerAccount := createSignedInAccount(t, router)
	eventID, _, blocks := createSignupPostgresEvent(t, owner, "Account signup "+primitive.NewObjectID().Hex(), []map[string]any{
		signupBlockPayload("Morning", intPtr(2), "2026-01-05T09:00:00Z", "2026-01-05T10:00:00Z"),
		signupBlockPayload("Afternoon", intPtr(2), "2026-01-05T13:00:00Z", "2026-01-05T14:00:00Z"),
	})
	path := "/api/events/" + eventID

	created := owner.request(http.MethodPost, path+"/response", map[string]any{
		"createResponse": true,
		"signUpBlockIds": []string{blocks[0].ID},
	}, http.StatusOK)
	responseID := decodeAccountString(t, created, "responseId")
	if responseID == "" {
		t.Fatal("account signup creation did not return a response identifier")
	}

	read := owner.request(http.MethodGet, path, nil, http.StatusOK)
	responses := decodeSignupReadResponses(t, read)
	account, ok := responses[ownerAccount.ExternalUserID]
	if !ok {
		t.Fatalf("account signup response missing from read: %#v", responses)
	}
	if account.PublicID != responseID {
		t.Fatalf("read publicId = %q, want %q", account.PublicID, responseID)
	}
	if !account.CanEdit {
		t.Fatal("account signup response must be editable by its account")
	}
	if ids := account.SignUpBlockIDs; len(ids) != 1 || ids[0] != blocks[0].ID {
		t.Fatalf("account signup block ids = %#v", ids)
	}
	var numResponses int
	if err := json.Unmarshal(read["numResponses"], &numResponses); err != nil {
		t.Fatal(err)
	}
	if numResponses != 0 {
		t.Fatalf("signup responses changed numResponses to %d", numResponses)
	}

	owner.request(http.MethodPost, path+"/response", map[string]any{
		"responseId":     responseID,
		"signUpBlockIds": []string{blocks[1].ID},
	}, http.StatusOK)
	read = owner.request(http.MethodGet, path, nil, http.StatusOK)
	account = decodeSignupReadResponses(t, read)[ownerAccount.ExternalUserID]
	if ids := account.SignUpBlockIDs; len(ids) != 1 || ids[0] != blocks[1].ID {
		t.Fatalf("updated account signup block ids = %#v", ids)
	}

	owner.request(http.MethodDelete, path+"/response", map[string]any{"responseId": responseID}, http.StatusOK)
	read = owner.request(http.MethodGet, path, nil, http.StatusOK)
	if _, ok := decodeSignupReadResponses(t, read)[ownerAccount.ExternalUserID]; ok {
		t.Fatal("deleted account signup response survived")
	}
}

// TestPostgresSignupGuestResponseLifecycle proves an anonymous guest can create,
// update block membership, rename, and delete a signup response through the
// explicit-selection contract, that reads expose its publicId with canEdit only
// to the owning visitor, and that duplicate guest names map to the existing
// duplicate-name error.
func TestPostgresSignupGuestResponseLifecycle(t *testing.T) {
	router := signedInPostgresEventRouter(t)
	owner, _ := createSignedInAccount(t, router)
	eventID, stored, blocks := createSignupPostgresEvent(t, owner, "Guest signup "+primitive.NewObjectID().Hex(), []map[string]any{
		signupBlockPayload("Morning", intPtr(2), "2026-01-05T09:00:00Z", "2026-01-05T10:00:00Z"),
		signupBlockPayload("Afternoon", intPtr(2), "2026-01-05T13:00:00Z", "2026-01-05T14:00:00Z"),
	})
	path := "/api/events/" + eventID

	guest := newAccountContractClient(t, router)
	guestRead := guest.request(http.MethodGet, path, nil, http.StatusOK)
	if decodeAccountString(t, guestRead, "eventVisitorId") == "" {
		t.Fatal("guest read did not return an event visitor identity")
	}
	created := guest.request(http.MethodPost, path+"/response", map[string]any{
		"createResponse": true,
		"signUpBlockIds": []string{blocks[0].ID},
		"name":           "  Ada Lovelace  ",
		"email":          "ada@example.com",
	}, http.StatusOK)
	responseID := decodeAccountString(t, created, "responseId")
	if responseID == "" {
		t.Fatal("guest signup creation did not return a response identifier")
	}

	repository := repositoryForTest(t)
	ctx := context.Background()
	storedResponse, err := repository.GetSignupResponseByPublicID(ctx, stored.ID, responseID)
	if err != nil {
		t.Fatal(err)
	}
	if storedResponse.RespondentKind != pgstore.RespondentKindGuest || storedResponse.CanonicalGuestName == nil || *storedResponse.CanonicalGuestName != "Ada Lovelace" {
		t.Fatalf("stored guest response = %#v", storedResponse)
	}

	ownerRead := owner.request(http.MethodGet, path, nil, http.StatusOK)
	ownerGuest, ok := decodeSignupReadResponses(t, ownerRead)["Ada Lovelace"]
	if !ok {
		t.Fatal("owner read missing canonical guest signup response")
	}
	if ownerGuest.PublicID != responseID {
		t.Fatalf("owner read publicId = %q, want %q", ownerGuest.PublicID, responseID)
	}
	if ownerGuest.CanEdit {
		t.Fatal("owner gained edit authority over an unrelated guest response")
	}

	guestRead = guest.request(http.MethodGet, path, nil, http.StatusOK)
	ownGuest := decodeSignupReadResponses(t, guestRead)["Ada Lovelace"]
	if !ownGuest.CanEdit {
		t.Fatal("guest did not receive canEdit for its own response")
	}

	guest.request(http.MethodPost, path+"/response", map[string]any{
		"responseId":     responseID,
		"signUpBlockIds": []string{blocks[1].ID},
		"name":           "Ada Lovelace",
	}, http.StatusOK)
	storedResponse, err = repository.GetSignupResponseByPublicID(ctx, stored.ID, responseID)
	if err != nil {
		t.Fatal(err)
	}
	if len(storedResponse.BlockIDs) != 1 || storedResponse.BlockIDs[0] != blocks[1].ID {
		t.Fatalf("guest block membership not updated: %#v", storedResponse.BlockIDs)
	}

	guest.request(http.MethodPost, path+"/rename-user", map[string]any{"responseId": responseID, "newName": "Grace Hopper"}, http.StatusOK)
	ownerRead = owner.request(http.MethodGet, path, nil, http.StatusOK)
	ownerResponses := decodeSignupReadResponses(t, ownerRead)
	if _, ok := ownerResponses["Grace Hopper"]; !ok {
		t.Fatal("renamed guest response missing from read")
	}
	if _, ok := ownerResponses["Ada Lovelace"]; ok {
		t.Fatal("old guest name survived rename")
	}

	duplicate := newAccountContractClient(t, router)
	duplicate.request(http.MethodGet, path, nil, http.StatusOK)
	duplicate.request(http.MethodPost, path+"/response", map[string]any{
		"createResponse": true,
		"signUpBlockIds": []string{blocks[0].ID},
		"name":           "Grace Hopper",
	}, http.StatusBadRequest)

	guest.request(http.MethodDelete, path+"/response", map[string]any{"responseId": responseID}, http.StatusOK)
	ownerRead = owner.request(http.MethodGet, path, nil, http.StatusOK)
	if _, ok := decodeSignupReadResponses(t, ownerRead)["Grace Hopper"]; ok {
		t.Fatal("deleted guest signup response survived")
	}
}

// TestPostgresSignupResponseAuthorization proves a public event visitor
// identifier never authorizes mutating another visitor's signup response and
// that the explicit-selection contract rejects ambiguous mutations.
func TestPostgresSignupResponseAuthorization(t *testing.T) {
	router := signedInPostgresEventRouter(t)
	owner, _ := createSignedInAccount(t, router)
	eventID, _, blocks := createSignupPostgresEvent(t, owner, "Authorized signup "+primitive.NewObjectID().Hex(), []map[string]any{
		signupBlockPayload("Morning", intPtr(2), "2026-01-05T09:00:00Z", "2026-01-05T10:00:00Z"),
	})
	path := "/api/events/" + eventID

	guest := newAccountContractClient(t, router)
	guestRead := guest.request(http.MethodGet, path, nil, http.StatusOK)
	guestVisitorID := decodeAccountString(t, guestRead, "eventVisitorId")
	created := guest.request(http.MethodPost, path+"/response", map[string]any{
		"createResponse": true,
		"signUpBlockIds": []string{blocks[0].ID},
		"name":           "Ada Lovelace",
	}, http.StatusOK)
	responseID := decodeAccountString(t, created, "responseId")

	stranger := newAccountContractClient(t, router)
	strangerPath := path + "?eventVisitorId=" + guestVisitorID
	stranger.request(http.MethodGet, strangerPath, nil, http.StatusOK)
	stranger.request(http.MethodPost, path+"/response?eventVisitorId="+guestVisitorID, map[string]any{
		"responseId":     responseID,
		"signUpBlockIds": []string{blocks[0].ID},
		"name":           "Stolen",
	}, http.StatusForbidden)
	stranger.request(http.MethodDelete, path+"/response?eventVisitorId="+guestVisitorID, map[string]any{"responseId": responseID}, http.StatusForbidden)
	stranger.request(http.MethodPost, path+"/rename-user?eventVisitorId="+guestVisitorID, map[string]any{"responseId": responseID, "newName": "Mallory"}, http.StatusForbidden)

	guest.request(http.MethodPost, path+"/response", map[string]any{
		"signUpBlockIds": []string{blocks[0].ID},
		"name":           "Ambiguous",
	}, http.StatusBadRequest)
	guest.request(http.MethodPost, path+"/response", map[string]any{
		"createResponse": true,
		"responseId":     responseID,
		"signUpBlockIds": []string{blocks[0].ID},
	}, http.StatusBadRequest)
	guest.request(http.MethodDelete, path+"/response", map[string]any{}, http.StatusBadRequest)
}

// TestPostgresSignupCapacityAndBlockValidation proves capacity is enforced
// atomically at the route boundary and that a block from another event is
// reported as a bad request.
func TestPostgresSignupCapacityAndBlockValidation(t *testing.T) {
	router := signedInPostgresEventRouter(t)
	owner, _ := createSignedInAccount(t, router)
	eventID, _, blocks := createSignupPostgresEvent(t, owner, "Capacity signup "+primitive.NewObjectID().Hex(), []map[string]any{
		signupBlockPayload("Morning", intPtr(1), "2026-01-05T09:00:00Z", "2026-01-05T10:00:00Z"),
		signupBlockPayload("Afternoon", intPtr(1), "2026-01-05T13:00:00Z", "2026-01-05T14:00:00Z"),
	})
	path := "/api/events/" + eventID

	first := newAccountContractClient(t, router)
	first.request(http.MethodGet, path, nil, http.StatusOK)
	first.request(http.MethodPost, path+"/response", map[string]any{
		"createResponse": true,
		"signUpBlockIds": []string{blocks[0].ID},
		"name":           "Ada Lovelace",
	}, http.StatusOK)

	second := newAccountContractClient(t, router)
	second.request(http.MethodGet, path, nil, http.StatusOK)
	second.request(http.MethodPost, path+"/response", map[string]any{
		"createResponse": true,
		"signUpBlockIds": []string{blocks[0].ID},
		"name":           "Grace Hopper",
	}, http.StatusConflict)
	second.request(http.MethodPost, path+"/response", map[string]any{
		"createResponse": true,
		"signUpBlockIds": []string{"00000000-0000-0000-0000-000000000000"},
		"name":           "Grace Hopper",
	}, http.StatusBadRequest)
}

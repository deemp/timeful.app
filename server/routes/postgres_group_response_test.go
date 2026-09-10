package routes

import (
	"context"
	"encoding/json"
	"errors"
	"fmt"
	"io"
	"net/http"
	"strings"
	"testing"
	"time"

	"github.com/jackc/pgx/v5"
	"go.mongodb.org/mongo-driver/bson"
	"go.mongodb.org/mongo-driver/bson/primitive"
	"timeful/server/db"
	"timeful/server/models"
	pgstore "timeful/server/postgres"
)

// setGroupManualWindow stores the manual availability window on a group event
// payload. The transition creation route rejects the legacy timed duration field,
// so the retained payload is the only way to exercise the day-window merge.
func setGroupManualWindow(t *testing.T, event *pgstore.Event, durationHours float64) {
	t.Helper()
	var value map[string]any
	if err := json.Unmarshal(event.Payload, &value); err != nil {
		t.Fatal(err)
	}
	value["duration"] = durationHours
	payload, err := json.Marshal(value)
	if err != nil {
		t.Fatal(err)
	}
	if _, err := pgstore.Pool.Exec(context.Background(), `UPDATE postgres_events SET payload = $2 WHERE id = $1`, event.ID, payload); err != nil {
		t.Fatal(err)
	}
}

// createGroupResponse creates an explicit-selection response and returns its
// opaque public identifier.
func createGroupResponse(t *testing.T, client *accountContractClient, eventID string, payload map[string]any) string {
	t.Helper()
	if payload == nil {
		payload = map[string]any{}
	}
	payload["createResponse"] = true
	created := client.request(http.MethodPost, "/api/events/"+eventID+"/response", payload, http.StatusOK)
	responseID := decodeAccountString(t, created, "responseId")
	if responseID == "" {
		t.Fatal("group response creation did not return a response identifier")
	}
	return responseID
}

func loadGroupResponse(t *testing.T, event *pgstore.Event, publicID string) *pgstore.Response {
	t.Helper()
	response, err := repositoryForTest(t).GetResponseByPublicID(context.Background(), event.ID, publicID)
	if err != nil {
		t.Fatalf("load group response %s: %v", publicID, err)
	}
	return response
}

func decodeGroupResponsePayload(t *testing.T, response *pgstore.Response) models.Response {
	t.Helper()
	var value models.Response
	if err := json.Unmarshal(response.Payload, &value); err != nil {
		t.Fatalf("decode group response payload: %v", err)
	}
	return value
}

func zonedUTCKey(value time.Time) string {
	return value.UTC().Format("2006-01-02T15:04:05+00:00") + "[UTC]"
}

// TestPostgresGroupResponseSaveDeleteAndDecline proves group response save and
// delete persist to PostgreSQL, toggle attendee decline state on respond and
// leave, and keep the response count correct.
func TestPostgresGroupResponseSaveDeleteAndDecline(t *testing.T) {
	router := signedInPostgresEventRouter(t)
	owner, ownerAccount := createSignedInAccount(t, router)
	member, memberAccount := createSignedInAccount(t, router)
	ctx := context.Background()
	name := "Group responses " + primitive.NewObjectID().Hex()
	eventID, stored := createPostgresGroup(t, owner, name, []string{memberAccount.Email})
	path := "/api/events/" + eventID

	ownerResponseID := createGroupResponse(t, owner, eventID, map[string]any{
		"availability": []string{"2026-01-05T14:00:00Z"},
	})
	ownerStored := loadGroupResponse(t, stored, ownerResponseID)
	if ownerStored.RespondentKind != pgstore.RespondentKindAccount || ownerStored.AccountUserID == nil || *ownerStored.AccountUserID != ownerAccount.ExternalUserID {
		t.Fatalf("owner response identity = %#v", ownerStored)
	}
	assertGroupResponseCount(t, stored, 1)

	// Declining then responding clears the member's decline state.
	member.request(http.MethodPost, path+"/decline", nil, http.StatusOK)
	assertGroupDeclined(t, stored, memberAccount.Email, true)
	memberResponseID := createGroupResponse(t, member, eventID, nil)
	memberStored := loadGroupResponse(t, stored, memberResponseID)
	if memberStored.RespondentKind != pgstore.RespondentKindAccount || memberStored.AccountUserID == nil || *memberStored.AccountUserID != memberAccount.ExternalUserID {
		t.Fatalf("member response identity = %#v", memberStored)
	}
	assertGroupDeclined(t, stored, memberAccount.Email, false)
	assertGroupResponseCount(t, stored, 2)

	// Leaving the group sets the decline state and removes the response.
	member.request(http.MethodDelete, path+"/response", map[string]string{"responseId": memberResponseID}, http.StatusOK)
	assertGroupDeclined(t, stored, memberAccount.Email, true)
	assertGroupResponseCount(t, stored, 1)
	if _, err := repositoryForTest(t).GetResponseByPublicID(ctx, stored.ID, memberResponseID); !errors.Is(err, pgx.ErrNoRows) {
		t.Fatalf("deleted group response still resolves: %v", err)
	}
}

// TestPostgresGroupAnonymousGuestResponse proves an anonymous visitor can create
// and edit a guest response with the canonical guest name under the explicit
// selection contract.
func TestPostgresGroupAnonymousGuestResponse(t *testing.T) {
	router := signedInPostgresEventRouter(t)
	owner, _ := createSignedInAccount(t, router)
	name := "Guest group responses " + primitive.NewObjectID().Hex()
	eventID, stored := createPostgresGroup(t, owner, name, nil)
	path := "/api/events/" + eventID

	guest := newAccountContractClient(t, router)
	responseID := createGroupResponse(t, guest, eventID, map[string]any{
		"name":         "Guest One",
		"availability": []string{"2026-01-05T14:00:00Z"},
	})
	response := loadGroupResponse(t, stored, responseID)
	if response.RespondentKind != pgstore.RespondentKindGuest || response.CanonicalGuestName == nil || *response.CanonicalGuestName != "Guest One" {
		t.Fatalf("guest response identity = %#v", response)
	}

	guest.request(http.MethodPost, path+"/rename-user", map[string]any{
		"responseId": responseID,
		"newName":    "Guest Renamed",
	}, http.StatusOK)
	renamed := loadGroupResponse(t, stored, responseID)
	if renamed.CanonicalGuestName == nil || *renamed.CanonicalGuestName != "Guest Renamed" {
		t.Fatalf("renamed guest identity = %#v", renamed)
	}
}

// TestPostgresGroupResponseAuthorization proves the explicit-selection and EVCC
// contract rejects foreign visitor identities and owner impersonation while an
// authorized guest keeps control of its own response.
func TestPostgresGroupResponseAuthorization(t *testing.T) {
	router := signedInPostgresEventRouter(t)
	owner, _ := createSignedInAccount(t, router)
	name := "Group response auth " + primitive.NewObjectID().Hex()
	eventID, _ := createPostgresGroup(t, owner, name, nil)
	path := "/api/events/" + eventID

	guest := newAccountContractClient(t, router)
	created := guest.request(http.MethodPost, path+"/response", map[string]any{
		"createResponse": true,
		"name":           "Authorized Guest",
	}, http.StatusOK)
	guestResponseID := decodeAccountString(t, created, "responseId")
	guestVisitorID := decodeAccountString(t, created, "eventVisitorId")

	// A different browser cannot claim the guest identity without proving its EVCC.
	intruder := newAccountContractClient(t, router)
	intruder.request(http.MethodPost, path+"/response?eventVisitorId="+guestVisitorID, map[string]any{
		"createResponse": true,
		"name":           "Intruder",
	}, http.StatusForbidden)
	intruder.request(http.MethodDelete, path+"/response?eventVisitorId="+guestVisitorID, map[string]string{"responseId": guestResponseID}, http.StatusForbidden)

	// A base EVCC never authorizes editing another visitor's response, even the
	// event owner's.
	owner.request(http.MethodDelete, path+"/response", map[string]string{"responseId": guestResponseID}, http.StatusForbidden)

	// The original guest retains control.
	guest.request(http.MethodPost, path+"/response", map[string]any{
		"responseId":   guestResponseID,
		"availability": []string{"2026-01-05T15:00:00Z"},
	}, http.StatusOK)
}

// TestPostgresGroupManualAvailabilityAndCalendarFields proves the day-window
// manual availability merge and the persisted calendar-derived fields match
// existing group behavior.
func TestPostgresGroupManualAvailabilityAndCalendarFields(t *testing.T) {
	router := signedInPostgresEventRouter(t)
	owner, _ := createSignedInAccount(t, router)
	name := "Group manual availability " + primitive.NewObjectID().Hex()
	eventID, stored := createPostgresGroup(t, owner, name, nil)
	setGroupManualWindow(t, stored, 1)
	reloadedEvent, err := repositoryForTest(t).GetEventByShortID(context.Background(), eventID)
	if err != nil {
		t.Fatal(err)
	}
	var reloadedModel models.Event
	if err := json.Unmarshal(reloadedEvent.Payload, &reloadedModel); err != nil {
		t.Fatal(err)
	}
	if reloadedModel.Duration == nil || *reloadedModel.Duration != 1 {
		t.Fatalf("group duration = %v, want 1", reloadedModel.Duration)
	}
	path := "/api/events/" + eventID

	existingDay := time.Date(2026, 1, 5, 1, 0, 0, 0, time.UTC)
	existingTime := time.Date(2026, 1, 5, 9, 0, 0, 0, time.UTC).UnixMilli()
	responseID := createGroupResponse(t, owner, eventID, map[string]any{
		"manualAvailability":      map[string]any{zonedUTCKey(existingDay): []int64{existingTime}},
		"useCalendarAvailability": true,
		"enabledCalendars":        map[string][]string{"team_ics": {"default"}},
		"calendarOptions": map[string]any{
			"bufferTime":   map[string]any{"enabled": true, "time": 15},
			"workingHours": map[string]any{"enabled": true, "startTime": 9.0, "endTime": 17.0},
		},
	})
	response := loadGroupResponse(t, stored, responseID)
	value := decodeGroupResponsePayload(t, response)
	if value.UseCalendarAvailability == nil || !*value.UseCalendarAvailability {
		t.Fatalf("useCalendarAvailability = %v", value.UseCalendarAvailability)
	}
	if value.EnabledCalendars == nil || len((*value.EnabledCalendars)["team_ics"]) != 1 {
		t.Fatalf("enabledCalendars = %#v", value.EnabledCalendars)
	}
	if value.CalendarOptions == nil || value.CalendarOptions.BufferTime.Time != 15 {
		t.Fatalf("calendarOptions = %#v", value.CalendarOptions)
	}
	if value.ManualAvailability == nil || len(*value.ManualAvailability) != 1 {
		t.Fatalf("manualAvailability = %#v", value.ManualAvailability)
	}
	if _, ok := (*value.ManualAvailability)[primitive.NewDateTimeFromTime(existingDay)]; !ok {
		t.Fatalf("manualAvailability key missing: %#v", value.ManualAvailability)
	}

	// A payload day whose window contains the stored day replaces it rather than
	// appending a second entry.
	replacementDay := time.Date(2026, 1, 5, 0, 30, 0, 0, time.UTC)
	replacementTime := time.Date(2026, 1, 5, 10, 0, 0, 0, time.UTC).UnixMilli()
	owner.request(http.MethodPost, path+"/response", map[string]any{
		"responseId":         responseID,
		"manualAvailability": map[string]any{zonedUTCKey(replacementDay): []int64{replacementTime}},
	}, http.StatusOK)
	updated := decodeGroupResponsePayload(t, loadGroupResponse(t, stored, responseID))
	if updated.ManualAvailability == nil || len(*updated.ManualAvailability) != 1 {
		t.Fatalf("merged manualAvailability = %#v", updated.ManualAvailability)
	}
	if _, ok := (*updated.ManualAvailability)[primitive.NewDateTimeFromTime(replacementDay)]; !ok {
		t.Fatalf("replacement day missing: %#v", updated.ManualAvailability)
	}
	if _, ok := (*updated.ManualAvailability)[primitive.NewDateTimeFromTime(existingDay)]; ok {
		t.Fatalf("replaced day still present: %#v", updated.ManualAvailability)
	}
}

// TestPostgresGroupCalendarAvailabilityResolvesAndRedacts proves the calendar
// availability read resolves a PostgreSQL group respondent to the retained
// MongoDB calendar connection and redacts other members' event names.
func TestPostgresGroupCalendarAvailabilityResolvesAndRedacts(t *testing.T) {
	router := signedInPostgresEventRouter(t)
	owner, _ := createSignedInAccount(t, router)
	member, memberAccount := createSignedInAccount(t, router)
	name := "Group calendar availability " + primitive.NewObjectID().Hex()
	eventID, _ := createPostgresGroup(t, owner, name, []string{memberAccount.Email})
	path := "/api/events/" + eventID

	objectID := accountObjectID(t, memberAccount.ExternalUserID)
	t.Cleanup(func() {
		_, _ = db.UsersCollection.DeleteOne(context.Background(), bson.M{"_id": objectID})
	})
	integrationUser, err := db.EnsureIntegrationUser(memberAccount.ExternalUserID)
	if err != nil {
		t.Fatal(err)
	}
	integrationUser.CalendarAccounts = map[string]models.CalendarAccount{
		"team_ics": {
			CalendarType:    models.ICSCalendarType,
			Email:           memberAccount.Email,
			ICSCalendarAuth: &models.ICSCalendarAuth{FeedURL: "https://calendar.test/feed.ics", Label: "Team"},
		},
	}
	if err := db.UpdateUserIntegrationFields(integrationUser); err != nil {
		t.Fatal(err)
	}
	installICSCalendarTransport(t, "Secret Meeting")

	responseID := createGroupResponse(t, member, eventID, map[string]any{
		"useCalendarAvailability": true,
		"enabledCalendars":        map[string][]string{"team_ics": {"default"}},
		"calendarOptions": map[string]any{
			"bufferTime":   map[string]any{"enabled": false, "time": 15},
			"workingHours": map[string]any{"enabled": false, "startTime": 9.0, "endTime": 17.0},
		},
	})

	window := "?timeMin=2026-01-05T00:00:00Z&timeMax=2026-01-06T00:00:00Z"
	memberEvents := decodeCalendarAvailabilityEvents(t, member.request(http.MethodGet, path+"/calendar-availabilities"+window, nil, http.StatusOK), responseID)
	if len(memberEvents) != 1 || memberEvents[0].Summary != "Secret Meeting" {
		t.Fatalf("member calendar events = %#v", memberEvents)
	}
	ownerEvents := decodeCalendarAvailabilityEvents(t, owner.request(http.MethodGet, path+"/calendar-availabilities"+window, nil, http.StatusOK), responseID)
	if len(ownerEvents) != 1 || ownerEvents[0].Summary != "BUSY" {
		t.Fatalf("owner calendar events = %#v", ownerEvents)
	}
}

// TestMergeGroupManualAvailabilityDayWindow proves the legacy day-window
// replacement: a stored day inside a payload day's window is replaced by the
// payload day, and unrelated payload days are appended.
func TestMergeGroupManualAvailabilityDayWindow(t *testing.T) {
	day := func(hour, minute int) primitive.DateTime {
		return primitive.NewDateTimeFromTime(time.Date(2026, 1, 5, hour, minute, 0, 0, time.UTC))
	}
	times := func(values ...int) []primitive.DateTime {
		result := make([]primitive.DateTime, 0, len(values))
		for _, value := range values {
			result = append(result, primitive.NewDateTimeFromTime(time.Date(2026, 1, 5, value, 0, 0, 0, time.UTC)))
		}
		return result
	}

	merged := mergeGroupManualAvailability(time.Hour, groupManualAvailability{day(1, 0): times(9)}, groupManualAvailability{day(0, 30): times(10)})
	if len(merged) != 1 {
		t.Fatalf("merged = %#v", merged)
	}
	if _, ok := merged[day(0, 30)]; !ok {
		t.Fatalf("replacement day missing: %#v", merged)
	}
	if _, ok := merged[day(1, 0)]; ok {
		t.Fatalf("replaced day still present: %#v", merged)
	}

	appended := mergeGroupManualAvailability(time.Hour, groupManualAvailability{day(1, 0): times(9)}, groupManualAvailability{day(5, 0): times(11)})
	if len(appended) != 2 {
		t.Fatalf("appended = %#v", appended)
	}
}

func assertGroupResponseCount(t *testing.T, event *pgstore.Event, want int) {
	t.Helper()
	reloaded, err := repositoryForTest(t).GetEventByShortID(context.Background(), event.ShortID)
	if err != nil {
		t.Fatal(err)
	}
	if reloaded.NumResponses != want {
		t.Fatalf("num_responses = %d, want %d", reloaded.NumResponses, want)
	}
}

func decodeCalendarAvailabilityEvents(t *testing.T, payload map[string]json.RawMessage, publicID string) []models.CalendarEvent {
	t.Helper()
	raw, ok := payload[publicID]
	if !ok {
		t.Fatalf("calendar availability missing response %s: %#v", publicID, payload)
	}
	var events []models.CalendarEvent
	if err := json.Unmarshal(raw, &events); err != nil {
		t.Fatalf("decode calendar availability events: %v", err)
	}
	return events
}

func installICSCalendarTransport(t *testing.T, summary string) {
	t.Helper()
	previous := http.DefaultTransport
	t.Cleanup(func() { http.DefaultTransport = previous })
	http.DefaultTransport = accountContractRoundTrip(func(request *http.Request) (*http.Response, error) {
		if request.URL.Host != "calendar.test" {
			return previous.RoundTrip(request)
		}
		body := fmt.Sprintf("BEGIN:VCALENDAR\r\nVERSION:2.0\r\nBEGIN:VEVENT\r\nUID:event-1\r\nSUMMARY:%s\r\nDTSTART:20260105T140000Z\r\nDTEND:20260105T150000Z\r\nEND:VEVENT\r\nEND:VCALENDAR\r\n", summary)
		return &http.Response{
			StatusCode: http.StatusOK,
			Body:       io.NopCloser(strings.NewReader(body)),
			Header:     make(http.Header),
			Request:    request,
		}, nil
	})
}

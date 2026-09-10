package routes

import (
	"bytes"
	"context"
	"encoding/json"
	"io"
	"net/http"
	"net/http/cookiejar"
	"net/http/httptest"
	"strings"
	"testing"

	"github.com/gin-contrib/sessions"
	"github.com/gin-gonic/gin"
	pgstore "timeful/server/postgres"
)

func TestPostgresVisitorIdentityContract(t *testing.T) {
	store := anonymousEventContractStores()[0]
	router := store.newRouter(t).(*gin.Engine)
	InitAuth(router.Group("/api"))
	router.POST("/test/sign-in/:id", func(c *gin.Context) {
		session := sessions.Default(c)
		session.Set("userId", c.Param("id"))
		if err := session.Save(); err != nil {
			t.Error(err)
		}
		c.JSON(200, gin.H{})
	})
	server := httptest.NewServer(router)
	defer server.Close()
	newClient := func() *http.Client { jar, _ := cookiejar.New(nil); return &http.Client{Jar: jar} }
	owner, guest, attacker := newClient(), newClient(), newClient()
	request := func(client *http.Client, method, path string, body any, status int) (map[string]json.RawMessage, *http.Response) {
		t.Helper()
		data, _ := json.Marshal(body)
		req, err := http.NewRequest(method, server.URL+path, bytes.NewReader(data))
		if err != nil {
			t.Fatal(err)
		}
		req.Header.Set("Content-Type", "application/json")
		response, err := client.Do(req)
		if err != nil {
			t.Fatal(err)
		}
		defer response.Body.Close()
		raw, _ := io.ReadAll(response.Body)
		if response.StatusCode != status {
			t.Fatalf("%s %s: got %d want %d: %s", method, path, response.StatusCode, status, raw)
		}
		result := map[string]json.RawMessage{}
		if len(raw) > 0 {
			if err := json.Unmarshal(raw, &result); err != nil {
				t.Fatal(err)
			}
		}
		return result, response
	}
	str := func(data map[string]json.RawMessage, key string) string {
		var value string
		_ = json.Unmarshal(data[key], &value)
		return value
	}
	payload := canonicalTimedEventPayload("Visitor identity contract")
	payload["blindAvailabilityEnabled"] = true
	created, response := request(owner, http.MethodPost, "/api/events", payload, 201)
	eventID := str(created, "eventId")
	t.Cleanup(func() { store.cleanupEvent(t, eventID) })
	ownerID := str(created, "eventVisitorId")
	if ownerID == "" {
		t.Fatal("missing owner identity")
	}
	cookies := response.Cookies()
	if len(cookies) == 0 || !cookies[0].HttpOnly || cookies[0].SameSite != http.SameSiteLaxMode {
		t.Fatal("missing private cookie flags")
	}
	raw, _ := json.Marshal(created)
	if strings.Contains(string(raw), cookies[0].Value) {
		t.Fatal("credential exposed in JSON")
	}
	path := "/api/events/" + eventID
	loaded, _ := request(owner, http.MethodGet, path, nil, 200)
	if str(loaded, "eventVisitorId") != ownerID {
		t.Fatal("owner identity changed")
	}
	guestEvent, _ := request(guest, http.MethodGet, path, nil, 200)
	guestID := str(guestEvent, "eventVisitorId")
	if guestID == ownerID || guestID == "" {
		t.Fatal("visitor identities must be distinct")
	}
	create := map[string]any{"createResponse": true, "name": "Ada", "availability": []string{"2026-01-05T14:00:00Z"}}
	first, _ := request(guest, http.MethodPost, path+"/response", create, 200)
	second, _ := request(guest, http.MethodPost, path+"/response", create, 200)
	firstID, secondID := str(first, "responseId"), str(second, "responseId")
	if firstID == secondID || firstID == "" {
		t.Fatal("multiple responses require independent public IDs")
	}
	guestEvent, _ = request(guest, http.MethodGet, path, nil, 200)
	var rows map[string]json.RawMessage
	_ = json.Unmarshal(guestEvent["responses"], &rows)
	if len(rows) != 2 {
		t.Fatalf("expected both owned responses, got %d", len(rows))
	}
	if _, ok := guestEvent["numResponses"]; ok {
		t.Fatal("blind response count leaked")
	}
	hidden, _ := request(attacker, http.MethodGet, path+"?eventVisitorId="+guestID, nil, 200)
	if str(hidden, "eventVisitorId") != guestID {
		t.Fatal("public identity should survive loss of authority")
	}
	rows = nil
	_ = json.Unmarshal(hidden["responses"], &rows)
	if len(rows) != 0 {
		t.Fatal("public identity authorized blind read")
	}
	request(attacker, http.MethodPost, path+"/response?eventVisitorId="+guestID, map[string]any{"responseId": firstID, "name": "Stolen"}, 403)
	request(attacker, http.MethodDelete, path+"/response?eventVisitorId="+guestID, map[string]any{"responseId": firstID}, 403)
	request(guest, http.MethodPost, path+"/response", map[string]any{"name": "Ambiguous"}, 400)
	request(guest, http.MethodPost, path+"/response", map[string]any{"responseId": firstID, "name": "Updated", "availability": []string{"2026-01-05T14:30:00Z"}}, 200)
	ownerEvent, _ := request(owner, http.MethodGet, path, nil, 200)
	rows = nil
	_ = json.Unmarshal(ownerEvent["responses"], &rows)
	if len(rows) != 2 {
		t.Fatal("owner cannot view all responses")
	}
	request(guest, http.MethodDelete, path+"/response", map[string]any{"responseId": secondID}, 200)
	repository := pgstore.NewRepository(pgstore.Pool)
	event, err := repository.GetEventByShortID(context.Background(), eventID)
	if err != nil {
		t.Fatal(err)
	}
	if event.NumResponses != 1 {
		t.Fatalf("response count drift: %d", event.NumResponses)
	}
	visitor, err := repository.GetEventVisitorIdentity(context.Background(), event.ID, guestID)
	if err != nil {
		t.Fatal(err)
	}
	request(guest, http.MethodPost, "/test/sign-in/account-one", nil, 200)
	request(guest, http.MethodPost, "/api/auth/visitor-identities", map[string]any{"identities": []map[string]string{{"eventId": eventID, "eventVisitorId": guestID}}}, 200)
	account := newClient()
	request(account, http.MethodPost, "/test/sign-in/account-one", nil, 200)
	accountEvent, _ := request(account, http.MethodGet, path, nil, 200)
	rows = nil
	_ = json.Unmarshal(accountEvent["responses"], &rows)
	if len(rows) != 1 {
		t.Fatal("associated account cannot recover response on another browser")
	}
	request(account, http.MethodPost, path+"/response", map[string]any{"responseId": firstID, "name": "Recovered"}, 200)
	request(attacker, http.MethodPost, "/test/sign-in/account-two", nil, 200)
	request(attacker, http.MethodPost, "/api/auth/visitor-identities", map[string]any{"identities": []map[string]string{{"eventId": eventID, "eventVisitorId": guestID}}}, 200)
	request(attacker, http.MethodPost, path+"/response?eventVisitorId="+guestID, map[string]any{"responseId": firstID, "name": "Forged association"}, 403)
	request(guest, http.MethodPost, "/api/auth/sign-out", nil, 200)
	if err := repository.RevokeEventVisitorCredentials(context.Background(), visitor.ID); err != nil {
		t.Fatal(err)
	}
	request(guest, http.MethodPost, path+"/response", map[string]any{"responseId": firstID, "name": "Revoked"}, 403)
}

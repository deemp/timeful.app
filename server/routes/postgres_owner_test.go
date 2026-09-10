package routes

import (
	"bytes"
	"context"
	"crypto/sha256"
	"encoding/json"
	"io"
	"net/http"
	"net/http/cookiejar"
	"net/http/httptest"
	"net/url"
	"strings"
	"testing"

	"github.com/gin-contrib/sessions"
	"github.com/gin-gonic/gin"
	pgstore "timeful/server/postgres"
)

func TestPostgresOwnerAuthority(t *testing.T) {
	store := anonymousEventContractStores()[0]
	router := store.newRouter(t).(*gin.Engine)
	InitAuth(router.Group("/api"))
	router.POST("/test/sign-in/:id", func(c *gin.Context) {
		session := sessions.Default(c)
		session.Set("userId", c.Param("id"))
		if err := session.Save(); err != nil {
			t.Fatal(err)
		}
		c.JSON(200, gin.H{})
	})
	server := httptest.NewServer(router)
	defer server.Close()
	origin, _ := url.Parse(server.URL + "/api")
	client := func() *http.Client { jar, _ := cookiejar.New(nil); return &http.Client{Jar: jar} }
	request := func(who *http.Client, method, path string, body any, status int) map[string]json.RawMessage {
		t.Helper()
		raw, _ := json.Marshal(body)
		req, _ := http.NewRequest(method, server.URL+path, bytes.NewReader(raw))
		req.Header.Set("Content-Type", "application/json")
		res, err := who.Do(req)
		if err != nil {
			t.Fatal(err)
		}
		defer res.Body.Close()
		data, _ := io.ReadAll(res.Body)
		if res.StatusCode != status {
			t.Fatalf("%s %s: got %d want %d: %s", method, path, res.StatusCode, status, data)
		}
		out := map[string]json.RawMessage{}
		if len(data) != 0 {
			if err := json.Unmarshal(data, &out); err != nil {
				t.Fatal(err)
			}
		}
		return out
	}
	str := func(data map[string]json.RawMessage, key string) string {
		var s string
		_ = json.Unmarshal(data[key], &s)
		return s
	}
	flag := func(data map[string]json.RawMessage, key string, want bool) {
		t.Helper()
		var value bool
		if err := json.Unmarshal(data[key], &value); err != nil || value != want {
			t.Fatalf("%s = %s, want %t", key, data[key], want)
		}
	}
	owner, baseOnly, stranger := client(), client(), client()
	payload := canonicalTimedEventPayload("Owner authority")
	payload["blindAvailabilityEnabled"] = true
	created := request(owner, "POST", "/api/events", payload, 201)
	id, ownerID := str(created, "eventId"), str(created, "eventVisitorId")
	t.Cleanup(func() { store.cleanupEvent(t, id) })
	path := "/api/events/" + id
	var token, base *http.Cookie
	for _, cookie := range owner.Jar.Cookies(origin) {
		if cookie.Name == postgresOwnerCookieName(id) {
			token = cookie
			token.Path = "/api"
		}
		if cookie.Name == postgresCredentialCookieName(id) {
			base = cookie
			base.Path = "/api"
		}
	}
	if token == nil || base == nil || token.Value == base.Value {
		t.Fatal("missing distinct owner and response credentials")
	}
	raw, _ := json.Marshal(created)
	if strings.Contains(string(raw), token.Value) {
		t.Fatal("owner token exposed to JavaScript")
	}
	ctx := context.Background()
	repo := pgstore.NewRepository(pgstore.Pool)
	stored, err := repo.GetEventByShortID(ctx, id)
	if err != nil {
		t.Fatal(err)
	}
	hash := sha256.Sum256([]byte(token.Value))
	if !bytes.Equal(hash[:], stored.OwnerEditTokenHash) {
		t.Fatal("token not stored hashed")
	}
	baseOnly.Jar.SetCookies(origin, []*http.Cookie{base})
	request(owner, "PUT", path, payload, 200)
	for _, who := range []*http.Client{baseOnly, stranger} {
		flag(request(who, "GET", path+"?eventVisitorId="+ownerID, nil, 200), "canManageEvent", false)
		request(who, "PUT", path, payload, 403)
		request(who, "POST", path+"/archive", map[string]bool{"archive": true}, 403)
		request(who, "DELETE", path, nil, 403)
	}
	wrongToken := client()
	wrongToken.Jar.SetCookies(origin, []*http.Cookie{{Path: "/api", Name: token.Name, Value: "forged"}})
	request(wrongToken, "PUT", path, payload, 403)
	// A token for another event must not authorize this one.
	other := client()
	otherEvent := request(other, "POST", "/api/events", payload, 201)
	otherID := str(otherEvent, "eventId")
	t.Cleanup(func() { store.cleanupEvent(t, otherID) })
	other.Jar.SetCookies(origin, []*http.Cookie{{Path: "/api", Name: postgresOwnerCookieName(otherID), Value: token.Value}})
	request(other, "PUT", "/api/events/"+otherID, payload, 403)
	response := request(owner, "POST", path+"/response", map[string]any{"createResponse": true, "name": "Owner response"}, 200)
	responseID := str(response, "responseId")
	tokenOnly := client()
	tokenOnly.Jar.SetCookies(origin, []*http.Cookie{token})
	request(tokenOnly, "PUT", path, payload, 200)
	request(tokenOnly, "POST", path+"/response?eventVisitorId="+ownerID, map[string]string{"responseId": responseID, "name": "Stolen"}, 403)

	// Future transfer issuance is deferred: seed distinct grants at the repository
	// boundary to verify role and revocation enforcement without an issuance API.
	visitor, err := repo.GetEventVisitorIdentity(ctx, stored.ID, ownerID)
	if err != nil {
		t.Fatal(err)
	}
	for _, grantsOwner := range []bool{false, true} {
		secret := "independent-test-grant-secret"
		sum := sha256.Sum256([]byte(secret))
		grant := &pgstore.EventVisitorCredential{EventVisitorIdentityID: visitor.ID, CredentialHash: sum[:], Kind: pgstore.CredentialKindGranted, GrantsOwner: grantsOwner}
		if err := repo.CreateEventVisitorCredential(ctx, grant); err != nil {
			t.Fatal(err)
		}
		target := client()
		target.Jar.SetCookies(origin, []*http.Cookie{{Path: "/api", Name: base.Name, Value: ownerID + "." + grant.ID + "." + secret}})
		status := 403
		if grantsOwner {
			status = 200
		}
		request(target, "PUT", path, payload, status)
		request(target, "POST", path+"/archive", map[string]bool{"archive": true}, status)
		if grantsOwner {
			request(target, "POST", path+"/archive", map[string]bool{"archive": false}, 200)
		}
		request(target, "POST", "/test/sign-in/grant-target", nil, 200)
		request(target, "GET", path, nil, 200)
		request(target, "POST", "/api/auth/visitor-identities", map[string]any{"identities": []map[string]string{{"eventId": id, "eventVisitorId": ownerID}}}, 200)
		unchanged, _ := repo.GetEventVisitorIdentity(ctx, stored.ID, ownerID)
		if unchanged.PlatformIdentityID != nil {
			t.Fatal("grant silently associated source visitor")
		}
		if _, err := pgstore.Pool.Exec(ctx, `UPDATE event_visitor_credentials SET revoked_at=clock_timestamp() WHERE id=$1`, grant.ID); err != nil {
			t.Fatal(err)
		}
		request(target, "PUT", path, payload, 403)
		request(target, "DELETE", path, nil, 403)
		request(target, "POST", path+"/response", map[string]string{"responseId": responseID, "name": "Revoked"}, 403)
	}

	request(owner, "POST", "/test/sign-in/owner-one", nil, 200)
	request(owner, "POST", "/api/auth/visitor-identities", map[string]any{"identities": []map[string]string{{"eventId": id, "eventVisitorId": ownerID}}}, 200)
	accountOne := client()
	request(accountOne, "POST", "/test/sign-in/owner-one", nil, 200)
	flag(request(accountOne, "GET", path, nil, 200), "canEditSettings", true)
	request(accountOne, "PUT", path, payload, 200)
	accountTwo := client()
	request(accountTwo, "POST", "/test/sign-in/owner-two", nil, 200)
	request(accountTwo, "PUT", path, payload, 403)
	// Explicit proof via the sign-in association endpoint moves only ownership.
	accountTwo.Jar.SetCookies(origin, []*http.Cookie{token})
	request(accountTwo, "POST", "/api/auth/visitor-identities", map[string]any{"identities": []map[string]string{{"eventId": id, "eventVisitorId": ownerID}}}, 200)
	request(accountOne, "PUT", path, payload, 403)
	request(accountOne, "POST", path+"/archive", map[string]bool{"archive": true}, 403)
	request(accountOne, "DELETE", path, nil, 403)
	flag(request(accountOne, "GET", path, nil, 200), "canManageEvent", false)
	request(accountOne, "POST", path+"/response", map[string]string{"responseId": responseID, "name": "Response ownership retained"}, 200)
	// Recovery through the new association works without either original cookie.
	recovered := client()
	request(recovered, "POST", "/test/sign-in/owner-two", nil, 200)
	flag(request(recovered, "GET", path, nil, 200), "canManageEvent", true)
	request(recovered, "PUT", path, payload, 200)
	request(recovered, "POST", path+"/response?eventVisitorId="+ownerID, map[string]string{"responseId": responseID, "name": "Not transferred"}, 403)
	request(recovered, "POST", path+"/archive", map[string]bool{"archive": true}, 200)
	archived := request(recovered, "GET", path, nil, 200)
	flag(archived, "isArchived", true)
	flag(archived, "canManageEvent", true)
	flag(archived, "canEditSettings", false)
	flag(archived, "canCreateResponse", false)
	request(recovered, "PUT", path, payload, 403)
	request(baseOnly, "POST", path+"/response", map[string]any{"createResponse": true, "name": "Blocked"}, 403)
	request(baseOnly, "DELETE", path+"/response", map[string]string{"responseId": responseID}, 403)
	request(baseOnly, "POST", path+"/rename-user", map[string]string{"responseId": responseID, "newName": "Blocked"}, 403)
	request(stranger, "PUT", path+"/schedule", map[string]string{"startDate": "2026-01-05T14:00:00Z", "endDate": "2026-01-05T15:00:00Z"}, 403)
	request(stranger, "DELETE", path+"/schedule", nil, 403)
	request(recovered, "POST", path+"/archive", map[string]bool{"archive": false}, 200)
	request(baseOnly, "POST", path+"/response", map[string]string{"responseId": responseID, "name": "Writable again"}, 200)
	request(recovered, "DELETE", path, nil, 200)
	for _, suffix := range []string{"", "/ids", "/responses?timeMin=2026-01-05T00:00:00Z&timeMax=2026-01-06T00:00:00Z"} {
		request(recovered, "GET", path+suffix, nil, 404)
		request(stranger, "GET", path+suffix, nil, 404)
	}
	request(baseOnly, "POST", path+"/response", map[string]string{"responseId": responseID, "name": "Deleted"}, 404)
	request(recovered, "POST", path+"/archive", map[string]bool{"archive": false}, 404)
}

func TestPostgresOwnerCookieFlags(t *testing.T) {
	for _, secure := range []bool{false, true} {
		recorder := httptest.NewRecorder()
		c, _ := gin.CreateTestContext(recorder)
		c.Request = httptest.NewRequest("POST", "/api/events", nil)
		if secure {
			c.Request.Header.Set("X-Forwarded-Proto", "https")
		}
		setPostgresOwnerCookie(c, "ABCD1234", "opaque-token")
		cookies := recorder.Result().Cookies()
		if len(cookies) != 1 || !cookies[0].HttpOnly || cookies[0].Secure != secure || cookies[0].SameSite != http.SameSiteLaxMode || cookies[0].Path != "/api" || cookies[0].MaxAge <= 0 {
			t.Fatalf("incorrect cookie flags: %#v", cookies)
		}
	}
}

func TestMongoOwnerMutationStillRequiresAuthentication(t *testing.T) {
	router := newEventsReadFiltersTestRouter()
	for _, method := range []string{http.MethodDelete, http.MethodPost} {
		path := "/api/events/m_64f5e4d3c2b1a09876543210"
		if method == http.MethodPost {
			path += "/archive"
		}
		response := timedEventRequest(t, router, method, path, map[string]bool{"archive": true})
		if response.Code != http.StatusUnauthorized {
			t.Fatalf("%s %s lost legacy auth guard: %d", method, path, response.Code)
		}
	}
}

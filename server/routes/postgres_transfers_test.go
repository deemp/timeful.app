package routes

import (
	"bytes"
	"context"
	"encoding/json"
	"errors"
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

type failingTransferSession struct{ sessions.Session }

func (s failingTransferSession) Save() error { return errors.New("injected session encoding failure") }

func TestPostgresAccessTransfers(t *testing.T) {
	store := anonymousEventContractStores()[1]
	router := store.newRouter(t).(*gin.Engine)
	router.POST("/test/sign-in/:id", func(c *gin.Context) {
		s := sessions.Default(c)
		s.Set("userId", c.Param("id"))
		s.Set("preference", "dark")
		if err := s.Save(); err != nil {
			t.Fatal(err)
		}
		c.JSON(200, gin.H{})
	})
	router.GET("/test/session", func(c *gin.Context) {
		c.JSON(200, gin.H{"id": sessions.Default(c).Get("userId"), "preference": sessions.Default(c).Get("preference")})
	})
	router.POST("/api/test/session-failure/:eventId/transfers/:transferId/:action", func(c *gin.Context) {
		c.Set(sessions.DefaultKey, failingTransferSession{sessions.Default(c)})
		postgresTransferAction(c)
	})
	server := httptest.NewServer(router)
	defer server.Close()
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
			t.Fatalf("%s %s: %d want %d: %s", method, path, res.StatusCode, status, data)
		}
		out := map[string]json.RawMessage{}
		if len(data) > 0 {
			if err := json.Unmarshal(data, &out); err != nil {
				t.Fatal(err)
			}
		}
		return out
	}
	str := func(v map[string]json.RawMessage, key string) string {
		var s string
		_ = json.Unmarshal(v[key], &s)
		return s
	}
	for _, mode := range []string{"guest", "owner", "session"} {
		t.Run(mode, func(t *testing.T) {
			owner, source, target, attacker := client(), client(), client(), client()
			payload := canonicalTimedEventPayload("Transfers")
			payload["blindAvailabilityEnabled"] = true
			created := request(owner, "POST", "/api/events", payload, 201)
			id := str(created, "eventId")
			t.Cleanup(func() { store.cleanupEvent(t, id) })
			path := "/api/events/" + id
			if mode == "owner" {
				source = owner
			} else {
				request(source, "GET", path, nil, 200)
			}
			targetBefore := request(target, "GET", path, nil, 200)
			if mode == "session" {
				request(source, "POST", "/test/sign-in/account-source", nil, 200)
			}
			sourceEvent := request(source, "GET", path, nil, 200)
			// Source owns a protected response, while another visitor's response stays private.
			response := map[string]any{"name": "Source", "availability": []int64{}, "createResponse": true}
			responseID := str(request(source, "POST", path+"/response", response, 200), "responseId")
			request(attacker, "GET", path, nil, 200)
			request(attacker, "POST", path+"/response", map[string]any{"name": "Other", "availability": []int64{}, "createResponse": true}, 200)
			create := func() string { return str(request(source, "POST", path+"/transfers", nil, 201), "id") }
			transfer := create()
			base := path + "/transfers/" + transfer + "/"
			otherCreated := request(client(), "POST", "/api/events", payload, 201)
			otherID := str(otherCreated, "eventId")
			t.Cleanup(func() { store.cleanupEvent(t, otherID) })
			request(source, "POST", "/api/events/"+otherID+"/transfers/"+transfer+"/status", nil, 403)
			request(client(), "POST", path+"/transfers", nil, 403)
			origin, _ := url.Parse(server.URL + "/api")
			if mode != "session" {
				baseOnly, forged := client(), client()
				for _, cookie := range source.Jar.Cookies(origin) {
					if cookie.Name == postgresCredentialCookieName(id) {
						copy := *cookie
						copy.Path = "/api"
						baseOnly.Jar.SetCookies(origin, []*http.Cookie{&copy})
						parts := strings.Split(copy.Value, ".")
						copy.Value = strings.Join(parts[:2], ".") + ".forged"
						forged.Jar.SetCookies(origin, []*http.Cookie{&copy})
					}
				}
				request(forged, "POST", path+"/transfers", nil, 403)
				if mode == "owner" {
					request(baseOnly, "POST", path+"/transfers", nil, 403)
				}
			}
			first := request(attacker, "POST", base+"open", nil, 200)
			pending := request(target, "POST", base+"open", nil, 200)
			if str(first, "code") == str(pending, "code") {
				t.Fatal("target codes collided")
			}
			request(target, "POST", base+"redeem", nil, 403)
			request(target, "POST", path+"/response", map[string]any{"responseId": responseID, "name": "Not approved"}, 403)
			approval := map[string]any{"requestId": str(pending, "requestId"), "code": str(pending, "code")}
			request(attacker, "POST", base+"approve", approval, 403)
			request(source, "POST", base+"approve", map[string]any{"requestId": str(pending, "requestId"), "code": "WRONG"}, 403)
			if mode == "session" {
				request(source, "POST", "/test/sign-in/different-account", nil, 200)
				request(source, "POST", base+"approve", approval, 403)
				request(source, "POST", "/test/sign-in/account-source", nil, 200)
			}
			request(source, "POST", base+"approve", approval, 200)
			request(source, "POST", base+"approve", approval, 403)
			// A target that reloads the link after approval still sees the
			// approved request and code, while other browsers learn nothing.
			reopened := request(target, "POST", base+"open", nil, 200)
			if str(reopened, "requestId") != str(pending, "requestId") || str(reopened, "code") != str(pending, "code") {
				t.Fatal("approved open lost the approved request")
			}
			if str(reopened, "state") != "approved" {
				t.Fatal("approved open lost the approved state")
			}
			request(source, "POST", base+"open", nil, 403)
			request(attacker, "POST", base+"open", nil, 403)
			if mode == "session" {
				// The target already holds a different sign-in; redemption must
				// replace only the session identity.
				request(target, "POST", "/test/sign-in/account-other", nil, 200)
			}
			request(attacker, "POST", base+"redeem", nil, 403)
			if mode == "session" {
				request(target, "POST", "/api/test/session-failure/"+id+"/transfers/"+transfer+"/redeem", nil, 500)
				if str(request(source, "POST", base+"status", nil, 200), "state") != "approved" {
					t.Fatal("session save failure consumed transfer")
				}
			}
			redemptions := make(chan int, 2)
			for i := 0; i < 2; i++ {
				go func() {
					req, _ := http.NewRequest("POST", server.URL+base+"redeem", strings.NewReader("{}"))
					req.Header.Set("Content-Type", "application/json")
					res, err := target.Do(req)
					if err != nil {
						redemptions <- 0
						return
					}
					res.Body.Close()
					redemptions <- res.StatusCode
				}()
			}
			one, two := <-redemptions, <-redemptions
			if !((one == 200 && two == 403) || (one == 403 && two == 200)) {
				t.Fatalf("concurrent redemption: %d, %d", one, two)
			}
			request(target, "POST", base+"redeem", nil, 403)
			request(target, "POST", path+"/response", map[string]any{"responseId": responseID, "name": "Edited on target"}, 200)
			request(source, "POST", path+"/response", map[string]any{"responseId": responseID, "name": "Source retains control"}, 200)
			status := request(source, "POST", base+"status", nil, 200)
			if string(status["revocable"]) != map[bool]string{true: "false", false: "true"}[mode == "session"] {
				t.Fatal("incorrect revocation capability")
			}
			after := request(target, "GET", path, nil, 200)
			if str(after, "eventVisitorId") != str(targetBefore, "eventVisitorId") {
				t.Fatal("target identity replaced")
			}
			var responses map[string]json.RawMessage
			_ = json.Unmarshal(after["responses"], &responses)
			want := 1
			if mode == "owner" {
				request(target, "PUT", path, payload, 200)
				want = 2
			}
			if len(responses) != want {
				t.Fatalf("visible responses=%d want %d: %s", len(responses), want, after["responses"])
			}
			if mode != "owner" {
				if _, ok := after["numResponses"]; ok {
					t.Fatal("blind count leaked")
				}
			}
			if mode == "session" {
				session := request(target, "GET", "/test/session", nil, 200)
				if str(session, "id") != "account-source" {
					t.Fatal("session not transferred")
				}
				if str(session, "preference") != "dark" {
					t.Fatal("unrelated session keys lost")
				}
				return
			}
			for _, cookie := range target.Jar.Cookies(origin) {
				if cookie.Name == postgresGrantCookieName(id) && cookie.Value == "" {
					t.Fatal("empty grant")
				}
			}
			if mode == "owner" {
				request(target, "POST", path+"/archive", map[string]any{"archive": true}, 200)
				request(target, "POST", path+"/archive", map[string]any{"archive": false}, 200)
			} else {
				request(target, "POST", path+"/archive", map[string]any{"archive": true}, 403)
			}
			request(target, "POST", "/test/sign-in/account-target", nil, 200)
			inspect := request(target, "POST", path+"/grant-association", nil, 200)
			if string(inspect["confirmationRequired"]) != "true" {
				t.Fatal("missing consent")
			}
			repo := pgstore.NewRepository(pgstore.Pool)
			event, _ := repo.GetEventByShortID(context.Background(), id)
			visitor, _ := repo.GetEventVisitorIdentity(context.Background(), event.ID, str(sourceEvent, "eventVisitorId"))
			if visitor.PlatformIdentityID != nil {
				t.Fatal("associated before consent")
			}
			request(target, "POST", path+"/grant-association", map[string]any{"confirm": true}, 200)
			visitor, _ = repo.GetEventVisitorIdentity(context.Background(), event.ID, visitor.PublicID)
			if visitor.PlatformIdentityID == nil {
				t.Fatal("confirmation did not associate")
			}
			request(attacker, "POST", base+"revoke", nil, 403)
			request(source, "POST", base+"revoke", nil, 200)
			// Remove session to test revoked grant, independent of explicitly accepted account recovery.
			target.Jar.SetCookies(origin, []*http.Cookie{{Name: "session", Value: "", Path: "/", MaxAge: -1}})
			clean := client()
			for _, cookie := range target.Jar.Cookies(origin) {
				if cookie.Name == postgresGrantCookieName(id) {
					cookie.Path = "/api"
					clean.Jar.SetCookies(origin, []*http.Cookie{cookie})
				}
			}
			revoked := request(clean, "GET", path, nil, 200)
			responses = nil
			_ = json.Unmarshal(revoked["responses"], &responses)
			if len(responses) != 0 {
				t.Fatal("revoked grant exposed responses")
			}
			request(clean, "POST", path+"/archive", map[string]any{"archive": true}, 403)
			request(clean, "POST", path+"/response", map[string]any{"responseId": responseID, "name": "Revoked edit"}, 403)
			request(clean, "DELETE", path, nil, 403)
			// Source cancel also stops an approved-but-unredeemed transfer, and
			// the cancelled state rejects every later transition.
			stopped := create()
			stoppedPath := path + "/transfers/" + stopped + "/"
			openedStop := request(target, "POST", stoppedPath+"open", nil, 200)
			stopApproval := map[string]any{"requestId": str(openedStop, "requestId"), "code": str(openedStop, "code")}
			request(source, "POST", stoppedPath+"approve", stopApproval, 200)
			request(source, "POST", stoppedPath+"cancel", nil, 200)
			request(target, "POST", stoppedPath+"open", nil, 403)
			request(source, "POST", stoppedPath+"approve", stopApproval, 403)
			request(target, "POST", stoppedPath+"redeem", nil, 403)
			request(source, "POST", stoppedPath+"cancel", nil, 403)
			// Expired transfers are pruned with their requests on the next
			// creation, while redeemed transfers survive past expiry as
			// revocation anchors and unexpired transfers stay untouched.
			prunedPending := create()
			request(target, "POST", path+"/transfers/"+prunedPending+"/open", nil, 200)
			prunedApproved := create()
			openedPrune := request(target, "POST", path+"/transfers/"+prunedApproved+"/open", nil, 200)
			request(source, "POST", path+"/transfers/"+prunedApproved+"/approve", map[string]any{"requestId": str(openedPrune, "requestId"), "code": str(openedPrune, "code")}, 200)
			prunedCancelled := create()
			request(source, "POST", path+"/transfers/"+prunedCancelled+"/cancel", nil, 200)
			anchor := create()
			anchorPath := path + "/transfers/" + anchor + "/"
			openedAnchor := request(target, "POST", anchorPath+"open", nil, 200)
			request(source, "POST", anchorPath+"approve", map[string]any{"requestId": str(openedAnchor, "requestId"), "code": str(openedAnchor, "code")}, 200)
			request(target, "POST", anchorPath+"redeem", nil, 200)
			if _, err := pgstore.Pool.Exec(context.Background(), `UPDATE access_transfers SET expires_at=clock_timestamp()-interval '1 second' WHERE id::text=ANY($1)`, []string{prunedPending, prunedApproved, prunedCancelled, anchor}); err != nil {
				t.Fatal(err)
			}
			survivor := create()
			request(target, "POST", path+"/transfers/"+survivor+"/open", nil, 200)
			var pruned int
			if err := pgstore.Pool.QueryRow(context.Background(), `SELECT count(*) FROM access_transfers WHERE id::text=ANY($1)`, []string{prunedPending, prunedApproved, prunedCancelled}).Scan(&pruned); err != nil {
				t.Fatal(err)
			}
			if pruned != 0 {
				t.Fatalf("expired transfers survived pruning: %d", pruned)
			}
			if err := pgstore.Pool.QueryRow(context.Background(), `SELECT count(*) FROM access_transfer_requests WHERE transfer_id::text=ANY($1)`, []string{prunedPending, prunedApproved}).Scan(&pruned); err != nil {
				t.Fatal(err)
			}
			if pruned != 0 {
				t.Fatalf("pruned transfers kept requests: %d", pruned)
			}
			if err := pgstore.Pool.QueryRow(context.Background(), `SELECT count(*) FROM access_transfers WHERE id::text=$1 AND state='redeemed'`, anchor).Scan(&pruned); err != nil {
				t.Fatal(err)
			}
			if pruned != 1 {
				t.Fatal("redeemed transfer was pruned")
			}
			if err := pgstore.Pool.QueryRow(context.Background(), `SELECT count(*) FROM access_transfers WHERE id::text=$1 AND state='pending'`, survivor).Scan(&pruned); err != nil {
				t.Fatal(err)
			}
			if pruned != 1 {
				t.Fatal("live transfer was pruned")
			}
			// approved_request_id references a real request of the same transfer.
			if _, err := pgstore.Pool.Exec(context.Background(), `UPDATE access_transfers SET approved_request_id=gen_random_uuid() WHERE id::text=$1`, survivor); err == nil {
				t.Fatal("approved_request_id accepted a foreign request")
			}
			if _, err := pgstore.Pool.Exec(context.Background(), `UPDATE access_transfers SET approved_request_id=(SELECT id FROM access_transfer_requests WHERE transfer_id::text=$1 LIMIT 1) WHERE id::text=$1`, survivor); err != nil {
				t.Fatal(err)
			}
			cancelled := create()
			request(source, "POST", path+"/transfers/"+cancelled+"/cancel", nil, 200)
			request(target, "POST", path+"/transfers/"+cancelled+"/open", nil, 403)
			expired := create()
			_, err := pgstore.Pool.Exec(context.Background(), `UPDATE access_transfers SET expires_at=clock_timestamp()-interval '1 second' WHERE id=$1`, expired)
			if err != nil {
				t.Fatal(err)
			}
			request(target, "POST", path+"/transfers/"+expired+"/open", nil, 403)
			for _, approved := range []bool{false, true} {
				transferID := create()
				transferPath := path + "/transfers/" + transferID + "/"
				opened := request(target, "POST", transferPath+"open", nil, 200)
				selection := map[string]any{"requestId": str(opened, "requestId"), "code": str(opened, "code")}
				if approved {
					request(source, "POST", transferPath+"approve", selection, 200)
				}
				visitor, err := repo.GetEventVisitorIdentity(context.Background(), event.ID, str(sourceEvent, "eventVisitorId"))
				if err != nil {
					t.Fatal(err)
				}
				if err := repo.RevokeEventVisitorCredentials(context.Background(), visitor.ID); err != nil {
					t.Fatal(err)
				}
				request(source, "POST", transferPath+"approve", selection, 403)
				request(target, "POST", transferPath+"redeem", nil, 403)
				// Restore only this fixture's base credential for the second transition case.
				if _, err := pgstore.Pool.Exec(context.Background(), `UPDATE event_visitor_credentials SET revoked_at=NULL WHERE event_visitor_identity_id=$1 AND kind='base'`, visitor.ID); err != nil {
					t.Fatal(err)
				}
			}
			if mode == "owner" {
				last := create()
				lastPath := path + "/transfers/" + last + "/"
				opened := request(target, "POST", lastPath+"open", nil, 200)
				request(source, "POST", lastPath+"approve", map[string]any{"requestId": str(opened, "requestId"), "code": str(opened, "code")}, 200)
				request(target, "POST", lastPath+"redeem", nil, 200)
				request(target, "DELETE", path, nil, 200)
				request(source, "GET", path, nil, 404)
			}
		})
	}
}

package routes

import (
	"context"
	"encoding/json"
	"io"
	"net/http"
	"os"
	"strings"
	"testing"

	"github.com/gin-contrib/sessions"
	"github.com/gin-contrib/sessions/cookie"
	"github.com/gin-gonic/gin"
	"github.com/jackc/pgx/v5/pgxpool"
	"go.mongodb.org/mongo-driver/bson"
	"go.mongodb.org/mongo-driver/bson/primitive"
	"timeful/server/db"
	"timeful/server/logger"
	"timeful/server/models"
	pgstore "timeful/server/postgres"
	authservice "timeful/server/services/auth"
)

// accountContractRoundTrip lets a contract test serve every outbound HTTP call
// the sign-in and import paths make without reaching the network.
type accountContractRoundTrip func(*http.Request) (*http.Response, error)

func (fn accountContractRoundTrip) RoundTrip(request *http.Request) (*http.Response, error) {
	return fn(request)
}

func accountContractJSONResponse(t *testing.T, request *http.Request, body string) *http.Response {
	t.Helper()
	return &http.Response{
		StatusCode: http.StatusOK,
		Body:       io.NopCloser(strings.NewReader(body)),
		Header:     make(http.Header),
		Request:    request,
	}
}

// installMutableGoogleOAuthTransport serves the Google token exchange, ID-token
// verification, and calendar-list calls used by OAuth sign-in. The profile
// pointer is read on every request so a test can change the provider claims
// between sign-ins.
func installMutableGoogleOAuthTransport(t *testing.T, profile *authservice.GoogleIdTokenInfo) {
	t.Helper()
	previous := http.DefaultTransport
	t.Cleanup(func() { http.DefaultTransport = previous })
	http.DefaultTransport = accountContractRoundTrip(func(request *http.Request) (*http.Response, error) {
		switch {
		case request.URL.Host == "oauth2.googleapis.com" && request.URL.Path == "/token":
			return accountContractJSONResponse(t, request,
				`{"access_token":"access","id_token":"id-token","expires_in":3600,"refresh_token":"refresh","scope":"scope","token_type":"Bearer"}`), nil
		case request.URL.Host == "oauth2.googleapis.com" && request.URL.Path == "/tokeninfo":
			encoded, err := json.Marshal(*profile)
			if err != nil {
				t.Fatal(err)
			}
			return accountContractJSONResponse(t, request, string(encoded)), nil
		case request.URL.Host == "www.googleapis.com" && strings.Contains(request.URL.Path, "calendarList"):
			return accountContractJSONResponse(t, request, `{"items":[]}`), nil
		default:
			// Requests to the in-process test server must still reach it.
			return previous.RoundTrip(request)
		}
	})
}

func decodeAccountBool(t *testing.T, data map[string]json.RawMessage, key string) bool {
	t.Helper()
	var value bool
	if err := json.Unmarshal(data[key], &value); err != nil {
		t.Fatalf("decode %s: %v", key, err)
	}
	return value
}

// cleanupOtpAccount removes a PostgreSQL account created through OTP sign-in
// together with its retained integration document, so the suite stays
// rerunnable against a retained database.
func cleanupOtpAccount(t *testing.T, account *pgstore.Account) {
	t.Helper()
	objectID := accountObjectID(t, account.ExternalUserID)
	t.Cleanup(func() {
		_, _ = db.UsersCollection.DeleteOne(context.Background(), bson.M{"_id": objectID})
		deleteAccountTestFixtures(t, account.ExternalUserID)
	})
}

func closedAccountContractPostgresPool(t *testing.T) *pgxpool.Pool {
	t.Helper()
	config, err := pgxpool.ParseConfig("postgres://timeful:timeful@127.0.0.1:1/timeful-test?sslmode=disable&connect_timeout=1")
	if err != nil {
		t.Fatal(err)
	}
	pool, err := pgxpool.NewWithConfig(context.Background(), config)
	if err != nil {
		t.Fatal(err)
	}
	pool.Close()
	return pool
}

// TestAccountProviderSignInAppliesNamePrecedence proves that OAuth provider
// sign-in applies the provider name and picture for a new account, and that a
// user's custom name is preserved on later sign-ins while the picture still
// refreshes.
func TestAccountProviderSignInAppliesNamePrecedence(t *testing.T) {
	router := newAccountContractRouter(t)
	client := newAccountContractClient(t, router)
	t.Setenv("CLIENT_ID", "account-contract-client")

	email := "oauth-name-" + primitive.NewObjectID().Hex() + "@example.com"
	profile := authservice.GoogleIdTokenInfo{
		Aud:        "account-contract-client",
		Iss:        "https://accounts.google.com",
		Email:      email,
		GivenName:  "Provider",
		FamilyName: "Provided",
		Picture:    "https://provider.example/first.png",
	}
	installMutableGoogleOAuthTransport(t, &profile)
	signInWithGoogle := func() {
		client.request(http.MethodPost, "/api/auth/sign-in", map[string]any{
			"code": "authorization-code", "scope": "scope",
			"calendarType": models.GoogleCalendarType, "timezoneOffset": 0,
		}, http.StatusOK)
	}

	repository := repositoryForTest(t)
	signInWithGoogle()
	account, err := repository.GetAccountByEmail(context.Background(), email)
	if err != nil {
		t.Fatalf("provider sign-in did not create an account: %v", err)
	}
	cleanupOtpAccount(t, account)

	if account.FirstName != "Provider" || account.LastName != "Provided" {
		t.Fatalf("provider name not applied: %#v", account)
	}
	if account.Picture != "https://provider.example/first.png" {
		t.Fatalf("provider picture not applied: %q", account.Picture)
	}
	if account.HasCustomName != nil && *account.HasCustomName {
		t.Fatalf("a provider sign-in must not mark the name custom: %#v", account.HasCustomName)
	}

	// A custom name is set by the visitor and must survive a later provider sign-in.
	client.request(http.MethodPatch, "/api/user/name", map[string]any{"firstName": "Custom", "lastName": "Person"}, http.StatusOK)
	profile.GivenName = "Changed"
	profile.FamilyName = "Changed"
	profile.Picture = "https://provider.example/second.png"
	signInWithGoogle()

	account, err = repository.GetAccountByExternalUserID(context.Background(), account.ExternalUserID)
	if err != nil {
		t.Fatal(err)
	}
	if account.FirstName != "Custom" || account.LastName != "Person" {
		t.Fatalf("provider sign-in overwrote the custom name: %#v", account)
	}
	if account.HasCustomName == nil || !*account.HasCustomName {
		t.Fatalf("custom name flag was lost: %#v", account.HasCustomName)
	}
	if account.Picture != "https://provider.example/second.png" {
		t.Fatalf("provider picture was not refreshed: %q", account.Picture)
	}
}

// TestAccountExistenceCheckReportsExistenceStates proves that the existence
// check reports a brand-new email as new, an email with a PostgreSQL account as
// existing, and a legacy-only retained document as existing.
func TestAccountExistenceCheckReportsExistenceStates(t *testing.T) {
	router := newAccountContractRouter(t)
	client := newAccountContractClient(t, router)
	repository := repositoryForTest(t)
	ctx := context.Background()

	newEmail := "existence-new-" + primitive.NewObjectID().Hex() + "@example.com"
	if result := client.request(http.MethodPost, "/api/auth/otp/check-email", map[string]any{"email": newEmail}, http.StatusOK); !decodeAccountBool(t, result, "isNewUser") {
		t.Fatalf("a brand-new email must report isNewUser=true: %v", result)
	}

	legacyEmail := "existence-legacy-" + primitive.NewObjectID().Hex() + "@example.com"
	legacy := models.User{Id: primitive.NewObjectID(), Email: legacyEmail}
	if _, err := db.UsersCollection.InsertOne(ctx, legacy); err != nil {
		t.Fatal(err)
	}
	t.Cleanup(func() {
		_, _ = db.UsersCollection.DeleteOne(context.Background(), bson.M{"_id": legacy.Id})
	})
	if result := client.request(http.MethodPost, "/api/auth/otp/check-email", map[string]any{"email": legacyEmail}, http.StatusOK); decodeAccountBool(t, result, "isNewUser") {
		t.Fatalf("a legacy-only account must report isNewUser=false: %v", result)
	}

	existingEmail := "existence-existing-" + primitive.NewObjectID().Hex() + "@example.com"
	existing, _, err := repository.FindOrCreateAccountByEmail(ctx, existingEmail, primitive.NewObjectID().Hex(), pgstore.Account{Email: existingEmail})
	if err != nil {
		t.Fatal(err)
	}
	t.Cleanup(func() { deleteAccountTestFixtures(t, existing.ExternalUserID) })
	if result := client.request(http.MethodPost, "/api/auth/otp/check-email", map[string]any{"email": existingEmail}, http.StatusOK); decodeAccountBool(t, result, "isNewUser") {
		t.Fatalf("an existing PostgreSQL account must report isNewUser=false: %v", result)
	}
}

// TestAccountExistenceCheckFailsClosedOnPostgresError proves that a PostgreSQL
// lookup failure is reported as a server error, and never falls back to the
// retained document to report the account as existing.
func TestAccountExistenceCheckFailsClosedOnPostgresError(t *testing.T) {
	router := newAccountContractRouter(t)
	client := newAccountContractClient(t, router)
	ctx := context.Background()
	// The error path logs, so ensure the package logger is initialized.
	logger.Init(io.Discard)

	email := "existence-error-" + primitive.NewObjectID().Hex() + "@example.com"
	legacy := models.User{Id: primitive.NewObjectID(), Email: email}
	if _, err := db.UsersCollection.InsertOne(ctx, legacy); err != nil {
		t.Fatal(err)
	}
	t.Cleanup(func() {
		_, _ = db.UsersCollection.DeleteOne(context.Background(), bson.M{"_id": legacy.Id})
	})

	previousPool := pgstore.Pool
	pgstore.Pool = closedAccountContractPostgresPool(t)
	t.Cleanup(func() { pgstore.Pool = previousPool })

	client.request(http.MethodPost, "/api/auth/otp/check-email", map[string]any{"email": email}, http.StatusInternalServerError)
}

// TestAccountIntegrationWritesPreservePostgresProfile proves that calendar add,
// toggle, calendar-options, and remove all write only retained integration
// fields and never change the PostgreSQL profile.
func TestAccountIntegrationWritesPreservePostgresProfile(t *testing.T) {
	router := newAccountContractRouter(t)
	client := newAccountContractClient(t, router)
	ctx := context.Background()

	email := "integration-" + primitive.NewObjectID().Hex() + "@example.com"
	verifyOtpSignIn(t, client, email, "123456")
	repository := repositoryForTest(t)
	account, err := repository.GetAccountByEmail(ctx, email)
	if err != nil {
		t.Fatal(err)
	}
	cleanupOtpAccount(t, account)
	baseline := *account
	label := "Integration-" + primitive.NewObjectID().Hex()
	calendarKey := label + "_ics"

	assertProfileUnchanged := func(step string) {
		t.Helper()
		stored, err := repository.GetAccountByExternalUserID(ctx, account.ExternalUserID)
		if err != nil {
			t.Fatalf("%s: %v", step, err)
		}
		if *stored != baseline {
			t.Fatalf("%s changed the PostgreSQL profile:\nbefore %#v\nafter  %#v", step, baseline, *stored)
		}
	}

	// Add: the calendar connection is written to the retained document only.
	client.request(http.MethodPost, "/api/user/add-ics-calendar-account", map[string]any{
		"feedUrl": "https://example.com/feed.ics", "label": label,
	}, http.StatusOK)
	retained := loadRetainedIntegration(t, account)
	if _, ok := retained.CalendarAccounts[calendarKey]; !ok {
		t.Fatalf("ICS calendar connection was not written to the retained document: %#v", retained.CalendarAccounts)
	}
	assertProfileUnchanged("calendar add")

	// Toggle: only the connection's enabled flag changes.
	client.request(http.MethodPost, "/api/user/toggle-calendar", map[string]any{
		"email": label, "calendarType": models.ICSCalendarType, "enabled": false,
	}, http.StatusOK)
	retained = loadRetainedIntegration(t, account)
	if enabled := retained.CalendarAccounts[calendarKey].Enabled; enabled == nil || *enabled {
		t.Fatalf("toggle did not disable the calendar connection: %#v", retained.CalendarAccounts[calendarKey])
	}
	assertProfileUnchanged("calendar toggle")

	// Calendar options: written to the retained preference field only.
	client.request(http.MethodPatch, "/api/user/calendar-options", map[string]any{
		"bufferTime":   map[string]any{"enabled": true, "time": 30},
		"workingHours": map[string]any{"enabled": true, "startTime": 8, "endTime": 18},
	}, http.StatusOK)
	retained = loadRetainedIntegration(t, account)
	if retained.CalendarOptions == nil || !retained.CalendarOptions.BufferTime.Enabled || retained.CalendarOptions.BufferTime.Time != 30 {
		t.Fatalf("calendar options were not written to the retained document: %#v", retained.CalendarOptions)
	}
	assertProfileUnchanged("calendar options")

	// Remove: the connection key is deleted from the retained document only.
	client.request(http.MethodDelete, "/api/user/remove-calendar-account", map[string]any{
		"email": label, "calendarType": models.ICSCalendarType,
	}, http.StatusOK)
	retained = loadRetainedIntegration(t, account)
	if _, ok := retained.CalendarAccounts[calendarKey]; ok {
		t.Fatalf("remove did not delete the calendar connection: %#v", retained.CalendarAccounts)
	}
	assertProfileUnchanged("calendar remove")
}

func loadRetainedIntegration(t *testing.T, account *pgstore.Account) models.User {
	t.Helper()
	var retained models.User
	if err := db.UsersCollection.FindOne(context.Background(), bson.M{"_id": accountObjectID(t, account.ExternalUserID)}).Decode(&retained); err != nil {
		t.Fatal(err)
	}
	return retained
}

// newAccountEventContractRouter additionally registers the event routes so the
// usage-counter increments on event creation and import can be exercised.
func newAccountEventContractRouter(t *testing.T) *gin.Engine {
	t.Helper()
	initRoutesReadFiltersTestDB(t)
	if os.Getenv("POSTGRES_APPLICATION_URI") == "" {
		t.Skip("POSTGRES_APPLICATION_URI is required for account route contracts")
	}
	anonymousEventPostgresOnce.Do(func() { pgstore.Init() })
	t.Setenv("LISTMONK_ENABLED", "false")
	// Signed-in creation always takes the MongoDB path, which increments the
	// account usage counter; anonymous PostgreSQL creation does not.
	t.Setenv("POSTGRES_ANONYMOUS_EVENT_CREATION_ENABLED", "false")

	router := gin.New()
	store := cookie.NewStore([]byte(os.Getenv("SESSION_SECRET")))
	router.Use(gin.Recovery())
	router.Use(sessions.Sessions("session", store))
	apiRouter := router.Group("/api")
	InitAuth(apiRouter)
	InitUser(apiRouter)
	InitUsers(apiRouter)
	InitEvents(apiRouter)
	router.POST("/test/account-contract/sign-in/:id", func(c *gin.Context) {
		session := sessions.Default(c)
		session.Set("userId", c.Param("id"))
		if err := session.Save(); err != nil {
			t.Error(err)
		}
		c.JSON(http.StatusOK, gin.H{})
	})
	return router
}

// installRemoteEventFetchTransport serves the remote event and response fetch
// the import route performs, so the import path can run without the network.
func installRemoteEventFetchTransport(t *testing.T) {
	t.Helper()
	previous := http.DefaultTransport
	t.Cleanup(func() { http.DefaultTransport = previous })
	http.DefaultTransport = accountContractRoundTrip(func(request *http.Request) (*http.Response, error) {
		switch {
		case request.URL.Host == "93.184.216.34" && strings.HasSuffix(request.URL.Path, "/responses"):
			return accountContractJSONResponse(t, request, `{}`), nil
		case request.URL.Host == "93.184.216.34" && strings.Contains(request.URL.Path, "/api/events/"):
			return accountContractJSONResponse(t, request,
				`{"name":"Imported remote event","type":"specific_dates","daysOnly":true,"dates":["2026-08-11T00:00:00Z"]}`), nil
		default:
			// Requests to the in-process test server must still reach it.
			return previous.RoundTrip(request)
		}
	})
}

// TestAccountUsageCounterTracksCreatedAndImportedEvents proves that creating an
// event and importing a remote event both increment the PostgreSQL usage
// counter and that the profile reports that authoritative counter.
func TestAccountUsageCounterTracksCreatedAndImportedEvents(t *testing.T) {
	router := newAccountEventContractRouter(t)
	client := newAccountContractClient(t, router)
	ctx := context.Background()

	email := "usage-counter-" + primitive.NewObjectID().Hex() + "@example.com"
	verifyOtpSignIn(t, client, email, "123456")
	repository := repositoryForTest(t)
	account, err := repository.GetAccountByEmail(ctx, email)
	if err != nil {
		t.Fatal(err)
	}
	cleanupOtpAccount(t, account)
	objectID := accountObjectID(t, account.ExternalUserID)
	t.Cleanup(func() {
		_, _ = db.EventsCollection.DeleteMany(context.Background(), bson.M{"ownerId": objectID})
	})

	assertCounter := func(step string, want int) {
		t.Helper()
		stored, err := repository.GetAccountByExternalUserID(ctx, account.ExternalUserID)
		if err != nil {
			t.Fatal(err)
		}
		if stored.NumEventsCreated != want {
			t.Fatalf("%s: usage counter = %d, want %d", step, stored.NumEventsCreated, want)
		}
		profile := client.request(http.MethodGet, "/api/user/profile", nil, http.StatusOK)
		if got := decodeAccountInt(t, profile, "numEventsCreated"); got != want {
			t.Fatalf("%s: profile usage counter = %d, want the PostgreSQL counter %d", step, got, want)
		}
	}

	client.request(http.MethodPost, "/api/events", map[string]any{
		"name": "Counter created event", "type": string(models.SPECIFIC_DATES),
		"daysOnly": true, "dates": []string{"2026-08-11T00:00:00Z"},
	}, http.StatusCreated)
	assertCounter("event creation", 1)

	installRemoteEventFetchTransport(t)
	// The SSRF guard resolves this public IP literal without DNS, so the
	// intercepted transport can serve the remote event and its responses.
	client.request(http.MethodPost, "/api/events/import", map[string]any{
		"url": "http://93.184.216.34/e/remote01",
	}, http.StatusCreated)
	assertCounter("event import", 2)

	// The profile counter is PostgreSQL-authoritative: removing the MongoDB
	// events must not drag the reported counter back down.
	if _, err := db.EventsCollection.DeleteMany(ctx, bson.M{"ownerId": objectID}); err != nil {
		t.Fatal(err)
	}
	profile := client.request(http.MethodGet, "/api/user/profile", nil, http.StatusOK)
	if got := decodeAccountInt(t, profile, "numEventsCreated"); got != 2 {
		t.Fatalf("profile counter = %d after MongoDB events were removed, want the PostgreSQL counter 2", got)
	}
}

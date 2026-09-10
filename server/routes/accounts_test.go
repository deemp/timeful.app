package routes

import (
	"bytes"
	"context"
	"encoding/json"
	"io"
	"net/http"
	"net/http/cookiejar"
	"net/http/httptest"
	"os"
	"testing"
	"time"

	"github.com/gin-contrib/sessions"
	"github.com/gin-contrib/sessions/cookie"
	"github.com/gin-gonic/gin"
	"go.mongodb.org/mongo-driver/bson"
	"go.mongodb.org/mongo-driver/bson/primitive"
	"timeful/server/db"
	"timeful/server/models"
	pgstore "timeful/server/postgres"
)

func newAccountContractRouter(t *testing.T) *gin.Engine {
	t.Helper()
	initRoutesReadFiltersTestDB(t)
	if os.Getenv("POSTGRES_APPLICATION_URI") == "" {
		t.Skip("POSTGRES_APPLICATION_URI is required for account route contracts")
	}
	anonymousEventPostgresOnce.Do(func() { pgstore.Init() })
	t.Setenv("LISTMONK_ENABLED", "false")

	router := gin.New()
	store := cookie.NewStore([]byte(os.Getenv("SESSION_SECRET")))
	router.Use(gin.Recovery())
	router.Use(sessions.Sessions("session", store))
	apiRouter := router.Group("/api")
	InitAuth(apiRouter)
	InitUser(apiRouter)
	InitUsers(apiRouter)

	// Test-only session seeding must be registered before the router starts
	// serving so the route table is immutable while requests are handled.
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

type accountContractClient struct {
	t      *testing.T
	server *httptest.Server
	client *http.Client
}

func newAccountContractClient(t *testing.T, router *gin.Engine) *accountContractClient {
	t.Helper()
	jar, _ := cookiejar.New(nil)
	server := httptest.NewServer(router)
	t.Cleanup(server.Close)
	return &accountContractClient{t: t, server: server, client: &http.Client{Jar: jar}}
}

func (c *accountContractClient) request(method, path string, body any, status int) map[string]json.RawMessage {
	c.t.Helper()
	var data []byte
	if body != nil {
		data, _ = json.Marshal(body)
	}
	req, err := http.NewRequest(method, c.server.URL+path, bytes.NewReader(data))
	if err != nil {
		c.t.Fatal(err)
	}
	req.Header.Set("Content-Type", "application/json")
	response, err := c.client.Do(req)
	if err != nil {
		c.t.Fatal(err)
	}
	defer response.Body.Close()
	raw, _ := io.ReadAll(response.Body)
	if response.StatusCode != status {
		c.t.Fatalf("%s %s: got %d want %d: %s", method, path, response.StatusCode, status, raw)
	}
	result := map[string]json.RawMessage{}
	if len(raw) > 0 {
		if err := json.Unmarshal(raw, &result); err != nil {
			c.t.Fatal(err)
		}
	}
	return result
}

func decodeAccountString(t *testing.T, data map[string]json.RawMessage, key string) string {
	t.Helper()
	var value string
	if err := json.Unmarshal(data[key], &value); err != nil {
		t.Fatalf("decode %s: %v", key, err)
	}
	return value
}

func decodeAccountInt(t *testing.T, data map[string]json.RawMessage, key string) int {
	t.Helper()
	var value int
	if err := json.Unmarshal(data[key], &value); err != nil {
		t.Fatalf("decode %s: %v", key, err)
	}
	return value
}

func insertOtpCode(t *testing.T, email, code string) {
	t.Helper()
	ctx := context.Background()
	if _, err := db.OtpCodesCollection.DeleteMany(ctx, bson.M{"email": email}); err != nil {
		t.Fatal(err)
	}
	if _, err := db.OtpCodesCollection.InsertOne(ctx, models.OtpCode{
		Email: email, Code: code, ExpiresAt: time.Now().Add(10 * time.Minute),
	}); err != nil {
		t.Fatal(err)
	}
	t.Cleanup(func() {
		_, _ = db.OtpCodesCollection.DeleteMany(context.Background(), bson.M{"email": email})
	})
}

// deleteAccountTestFixtures removes every created PostgreSQL account and its
// platform identity. The repository deliberately retains platform identities in
// production, so tests that create them must clean them up explicitly to stay
// rerunnable against a retained database.
func deleteAccountTestFixtures(t *testing.T, externalUserIDs ...string) {
	t.Helper()
	repository, err := pgstore.DefaultRepository()
	if err != nil {
		t.Errorf("resolve repository for account cleanup: %v", err)
		return
	}
	ctx := context.Background()
	for _, externalUserID := range externalUserIDs {
		if err := repository.DeleteAccountByExternalUserID(ctx, externalUserID); err != nil {
			t.Errorf("delete account %s: %v", externalUserID, err)
		}
		if _, err := pgstore.Pool.Exec(ctx, `DELETE FROM platform_identities WHERE external_user_id = $1`, externalUserID); err != nil {
			t.Errorf("delete platform identity %s: %v", externalUserID, err)
		}
		if _, err := pgstore.Pool.Exec(ctx, `DELETE FROM account_deletion_tombstones WHERE external_user_id = $1`, externalUserID); err != nil {
			t.Errorf("delete account tombstone %s: %v", externalUserID, err)
		}
	}
}

func verifyOtpSignIn(t *testing.T, client *accountContractClient, email, code string) map[string]json.RawMessage {
	t.Helper()
	insertOtpCode(t, email, code)
	return client.request(http.MethodPost, "/api/auth/otp/verify", map[string]any{
		"email": email, "code": code, "timezoneOffset": 0,
		"firstName": "Provider", "lastName": "Name",
	}, http.StatusOK)
}

// TestAccountOtpSignInUsesPostgresAuthority proves that OTP sign-in resolves a
// PostgreSQL account and that profile reads and updates never fall back to the
// retained MongoDB document.
func TestAccountOtpSignInUsesPostgresAuthority(t *testing.T) {
	router := newAccountContractRouter(t)
	client := newAccountContractClient(t, router)
	email := "account-contract-" + primitive.NewObjectID().Hex() + "@example.com"

	profile := verifyOtpSignIn(t, client, email, "123456")
	if got := decodeAccountString(t, profile, "email"); got != email {
		t.Fatalf("sign-in profile email = %q, want %q", got, email)
	}

	repository, err := pgstore.DefaultRepository()
	if err != nil {
		t.Fatal(err)
	}
	account, err := repository.GetAccountByEmail(context.Background(), email)
	if err != nil {
		t.Fatalf("account not created in PostgreSQL: %v", err)
	}
	objectID := accountObjectID(t, account.ExternalUserID)
	t.Cleanup(func() {
		_, _ = db.UsersCollection.DeleteOne(context.Background(), bson.M{"_id": objectID})
		deleteAccountTestFixtures(t, account.ExternalUserID)
	})

	// The retained integration document must not carry profile authority.
	if _, err := db.UsersCollection.UpdateOne(context.Background(),
		bson.M{"_id": accountObjectID(t, account.ExternalUserID)},
		bson.M{"$set": bson.M{"email": "hacked@example.com", "firstName": "Hacked", "lastName": "Hacked"}}); err != nil {
		t.Fatal(err)
	}

	read := client.request(http.MethodGet, "/api/user/profile", nil, http.StatusOK)
	if got := decodeAccountString(t, read, "email"); got != email {
		t.Fatalf("profile email = %q, retained MongoDB profile must not be authoritative", got)
	}
	if got := decodeAccountString(t, read, "firstName"); got != "Provider" {
		t.Fatalf("profile firstName = %q, want PostgreSQL value", got)
	}

	client.request(http.MethodPatch, "/api/user/name", map[string]any{"firstName": "Custom", "lastName": "Person"}, http.StatusOK)
	updated, err := repository.GetAccountByExternalUserID(context.Background(), account.ExternalUserID)
	if err != nil || updated.FirstName != "Custom" || updated.LastName != "Person" || updated.HasCustomName == nil || !*updated.HasCustomName {
		t.Fatalf("profile update not written to PostgreSQL: %v %#v", err, updated)
	}
	var mongoProfile models.User
	if err := db.UsersCollection.FindOne(context.Background(), bson.M{"_id": accountObjectID(t, account.ExternalUserID)}).Decode(&mongoProfile); err != nil {
		t.Fatal(err)
	}
	if mongoProfile.FirstName != "Hacked" {
		t.Fatalf("profile update must not be authored in MongoDB, got %q", mongoProfile.FirstName)
	}

	// Public profiles also resolve PostgreSQL authority.
	public := client.request(http.MethodGet, "/api/users/"+account.ExternalUserID, nil, http.StatusOK)
	if got := decodeAccountString(t, public, "firstName"); got != "Custom" {
		t.Fatalf("public profile firstName = %q, want PostgreSQL value", got)
	}

	// Repeated sign-in must not create a duplicate account or identity.
	verifyOtpSignIn(t, client, email, "654321")
	accounts, err := repository.GetAccountByEmail(context.Background(), email)
	if err != nil || accounts.ID != account.ID {
		t.Fatalf("repeated sign-in changed the account: %v %#v", err, accounts)
	}
	var accountCount, identityCount int
	if err := pgstore.Pool.QueryRow(context.Background(), `SELECT (SELECT count(*) FROM accounts a JOIN platform_identities p ON p.id = a.platform_identity_id WHERE p.external_user_id = $1), (SELECT count(*) FROM platform_identities WHERE external_user_id = $1)`, account.ExternalUserID).Scan(&accountCount, &identityCount); err != nil {
		t.Fatal(err)
	}
	if accountCount != 1 || identityCount != 1 {
		t.Fatalf("duplicate account=%d identity=%d", accountCount, identityCount)
	}

	// Sign-out clears the session and signed-in access.
	client.request(http.MethodPost, "/api/auth/sign-out", nil, http.StatusOK)
	client.request(http.MethodGet, "/api/user/profile", nil, http.StatusUnauthorized)
}

// TestAccountExistingSessionAdoptionResolvesAccount proves that a session that
// predates the cutover adopts its legacy MongoDB profile into PostgreSQL without
// duplicating the platform identity, and that calendar integration stays in the
// retained document.
func TestAccountExistingSessionAdoptionResolvesAccount(t *testing.T) {
	router := newAccountContractRouter(t)
	client := newAccountContractClient(t, router)

	email := "legacy-" + primitive.NewObjectID().Hex() + "@example.com"
	primaryKey := email + "_google"
	legacy := models.User{
		Id:                primitive.NewObjectID(),
		Email:             email,
		FirstName:         "Legacy",
		LastName:          "User",
		TimezoneOffset:    120,
		PrimaryAccountKey: &primaryKey,
		CalendarAccounts: map[string]models.CalendarAccount{
			primaryKey: {CalendarType: models.GoogleCalendarType, Email: email},
		},
	}
	if _, err := db.UsersCollection.InsertOne(context.Background(), legacy); err != nil {
		t.Fatal(err)
	}
	externalUserID := legacy.Id.Hex()
	t.Cleanup(func() {
		_, _ = db.UsersCollection.DeleteOne(context.Background(), bson.M{"_id": legacy.Id})
		deleteAccountTestFixtures(t, externalUserID)
	})

	client.request(http.MethodPost, "/test/account-contract/sign-in/"+externalUserID, nil, http.StatusOK)
	profile := client.request(http.MethodGet, "/api/user/profile", nil, http.StatusOK)
	if got := decodeAccountString(t, profile, "firstName"); got != "Legacy" {
		t.Fatalf("adopted profile firstName = %q", got)
	}
	if got := decodeAccountString(t, profile, "email"); got != email {
		t.Fatalf("adopted profile email = %q", got)
	}
	var calendarAccounts map[string]json.RawMessage
	if err := json.Unmarshal(profile["calendarAccounts"], &calendarAccounts); err != nil || len(calendarAccounts) != 1 {
		t.Fatalf("retained calendar integration not exposed through boundary: %v %v", err, calendarAccounts)
	}

	account, err := repositoryForTest(t).GetAccountByExternalUserID(context.Background(), externalUserID)
	if err != nil || account.ExternalUserID != externalUserID {
		t.Fatalf("session did not resolve a PostgreSQL account: %v %#v", err, account)
	}
	var identityCount int
	if err := pgstore.Pool.QueryRow(context.Background(), `SELECT count(*) FROM platform_identities WHERE external_user_id = $1`, externalUserID).Scan(&identityCount); err != nil {
		t.Fatal(err)
	}
	if identityCount != 1 {
		t.Fatalf("adoption duplicated the platform identity: %d", identityCount)
	}

	// A repeated signed-in read must not create a second account.
	client.request(http.MethodGet, "/api/user/profile", nil, http.StatusOK)
	var accountCount int
	if err := pgstore.Pool.QueryRow(context.Background(), `SELECT count(*) FROM accounts a JOIN platform_identities p ON p.id = a.platform_identity_id WHERE p.external_user_id = $1`, externalUserID).Scan(&accountCount); err != nil {
		t.Fatal(err)
	}
	if accountCount != 1 {
		t.Fatalf("adoption duplicated the account: %d", accountCount)
	}
}

// TestAccountDuplicateEmailDoesNotMerge proves that two distinct legacy
// accounts with equal emails remain distinct and that sign-in resolves the
// deterministic oldest match without creating a third account.
func TestAccountDuplicateEmailDoesNotMerge(t *testing.T) {
	router := newAccountContractRouter(t)
	client := newAccountContractClient(t, router)

	email := "duplicate-" + primitive.NewObjectID().Hex() + "@example.com"
	repository := repositoryForTest(t)
	older, err := repository.FindOrCreateAccount(context.Background(), primitive.NewObjectID().Hex(), pgstore.Account{Email: email, FirstName: "Older"})
	if err != nil {
		t.Fatal(err)
	}
	newer, err := repository.FindOrCreateAccount(context.Background(), primitive.NewObjectID().Hex(), pgstore.Account{Email: email, FirstName: "Newer"})
	if err != nil {
		t.Fatal(err)
	}
	retainedIDs := bson.A{accountObjectID(t, older.ExternalUserID), accountObjectID(t, newer.ExternalUserID)}
	t.Cleanup(func() {
		deleteAccountTestFixtures(t, older.ExternalUserID, newer.ExternalUserID)
		if _, err := db.UsersCollection.DeleteMany(context.Background(), bson.M{"_id": bson.M{"$in": retainedIDs}}); err != nil {
			t.Errorf("delete retained users: %v", err)
		}
	})

	profile := verifyOtpSignIn(t, client, email, "123456")
	if got := decodeAccountString(t, profile, "firstName"); got != "Older" {
		t.Fatalf("sign-in firstName = %q, want the deterministic oldest account", got)
	}
	var count int
	if err := pgstore.Pool.QueryRow(context.Background(), `SELECT count(*) FROM accounts WHERE lower(email) = lower($1)`, email).Scan(&count); err != nil {
		t.Fatal(err)
	}
	if count != 2 {
		t.Fatalf("equal-email accounts must stay distinct, got %d", count)
	}
}

// TestAccountCalendarRemovalWritesIntegrationOnly proves that removing a
// calendar account removes only the retained integration field and leaves the
// PostgreSQL profile, including the usage counter, unchanged.
func TestAccountCalendarRemovalWritesIntegrationOnly(t *testing.T) {
	router := newAccountContractRouter(t)
	client := newAccountContractClient(t, router)

	email := "calendar-removal-" + primitive.NewObjectID().Hex() + "@example.com"
	primaryKey := email + "_google"
	legacy := models.User{
		Id:                primitive.NewObjectID(),
		Email:             email,
		FirstName:         "Legacy",
		LastName:          "User",
		PrimaryAccountKey: &primaryKey,
		CalendarAccounts: map[string]models.CalendarAccount{
			primaryKey: {CalendarType: models.GoogleCalendarType, Email: email},
		},
	}
	if _, err := db.UsersCollection.InsertOne(context.Background(), legacy); err != nil {
		t.Fatal(err)
	}
	externalUserID := legacy.Id.Hex()
	t.Cleanup(func() {
		_, _ = db.UsersCollection.DeleteOne(context.Background(), bson.M{"_id": legacy.Id})
		deleteAccountTestFixtures(t, externalUserID)
	})

	client.request(http.MethodPost, "/test/account-contract/sign-in/"+externalUserID, nil, http.StatusOK)
	// The first authenticated request adopts the legacy document's profile.
	client.request(http.MethodGet, "/api/user/profile", nil, http.StatusOK)
	repository := repositoryForTest(t)
	account, err := repository.GetAccountByExternalUserID(context.Background(), externalUserID)
	if err != nil {
		t.Fatalf("session did not adopt a PostgreSQL account: %v", err)
	}
	if err := repository.IncrementAccountEventsCreated(context.Background(), account.ExternalUserID); err != nil {
		t.Fatal(err)
	}

	client.request(http.MethodDelete, "/api/user/remove-calendar-account", map[string]any{
		"email": email, "calendarType": models.GoogleCalendarType,
	}, http.StatusOK)

	var retained models.User
	if err := db.UsersCollection.FindOne(context.Background(), bson.M{"_id": legacy.Id}).Decode(&retained); err != nil {
		t.Fatal(err)
	}
	if _, ok := retained.CalendarAccounts[primaryKey]; ok {
		t.Fatalf("calendar account still present in retained document: %#v", retained.CalendarAccounts)
	}
	if len(retained.CalendarAccounts) != 0 {
		t.Fatalf("removal changed other integration fields: %#v", retained.CalendarAccounts)
	}

	stored, err := repository.GetAccountByExternalUserID(context.Background(), externalUserID)
	if err != nil {
		t.Fatal(err)
	}
	if stored.Email != email || stored.FirstName != "Legacy" || stored.NumEventsCreated != 1 {
		t.Fatalf("calendar removal changed the PostgreSQL profile: %#v", stored)
	}
}

// TestAccountProfileCounterIsPostgresAuthoritative proves that the profile
// reports the PostgreSQL usage counter instead of a MongoDB-derived count, and
// that a profile update cannot change it.
func TestAccountProfileCounterIsPostgresAuthoritative(t *testing.T) {
	router := newAccountContractRouter(t)
	client := newAccountContractClient(t, router)
	email := "counter-" + primitive.NewObjectID().Hex() + "@example.com"

	verifyOtpSignIn(t, client, email, "123456")
	repository := repositoryForTest(t)
	account, err := repository.GetAccountByEmail(context.Background(), email)
	if err != nil {
		t.Fatalf("account not created in PostgreSQL: %v", err)
	}
	objectID := accountObjectID(t, account.ExternalUserID)
	t.Cleanup(func() {
		_, _ = db.UsersCollection.DeleteOne(context.Background(), bson.M{"_id": objectID})
		deleteAccountTestFixtures(t, account.ExternalUserID)
	})

	for i := 0; i < 2; i++ {
		if err := repository.IncrementAccountEventsCreated(context.Background(), account.ExternalUserID); err != nil {
			t.Fatal(err)
		}
	}
	read := client.request(http.MethodGet, "/api/user/profile", nil, http.StatusOK)
	if got := decodeAccountInt(t, read, "numEventsCreated"); got != 2 {
		t.Fatalf("profile numEventsCreated = %d, want the PostgreSQL counter 2", got)
	}

	client.request(http.MethodPatch, "/api/user/name", map[string]any{"firstName": "Custom", "lastName": "Person"}, http.StatusOK)
	read = client.request(http.MethodGet, "/api/user/profile", nil, http.StatusOK)
	if got := decodeAccountInt(t, read, "numEventsCreated"); got != 2 {
		t.Fatalf("profile update changed numEventsCreated to %d", got)
	}
}

func repositoryForTest(t *testing.T) *pgstore.Repository {
	t.Helper()
	repository, err := pgstore.DefaultRepository()
	if err != nil {
		t.Fatal(err)
	}
	return repository
}

func accountObjectID(t *testing.T, hex string) primitive.ObjectID {
	t.Helper()
	objectID, err := primitive.ObjectIDFromHex(hex)
	if err != nil {
		t.Fatal(err)
	}
	return objectID
}

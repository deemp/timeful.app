/* The /auth group contains all the routes to sign in and sign out */
package routes

import (
	"context"
	"crypto/rand"
	"fmt"
	"math/big"
	"net/http"
	"os"
	"strconv"
	"strings"
	"time"

	"github.com/gin-contrib/sessions"
	"github.com/gin-gonic/gin"
	"go.mongodb.org/mongo-driver/bson"
	"go.mongodb.org/mongo-driver/bson/primitive"
	"go.mongodb.org/mongo-driver/mongo"
	"timeful/server/accounts"
	"timeful/server/db"
	"timeful/server/errs"
	"timeful/server/eventsource"
	"timeful/server/logger"
	"timeful/server/middleware"
	"timeful/server/models"
	"timeful/server/responses"
	"timeful/server/services/auth"
	"timeful/server/services/calendar"
	"timeful/server/services/listmonk"
	"timeful/server/services/microsoftgraph"
	"timeful/server/utils"
)

func InitAuth(router *gin.RouterGroup) {
	authRouter := router.Group("/auth")

	authRouter.POST("/sign-in", signIn)
	authRouter.POST("/sign-in-mobile", signInMobile)
	authRouter.POST("/sign-out", signOut)
	authRouter.GET("/status", middleware.AuthRequired(), getStatus)
	authRouter.POST("/visitor-identities", associatePostgresVisitorIdentities)

	authRouter.POST("/otp/check-email", checkEmail)
	authRouter.POST("/otp/send", sendOtp)
	authRouter.POST("/otp/verify", verifyOtp)
}

// @Summary Signs user in
// @Description Signs user in and sets the access token session variable
// @Tags auth
// @Accept json
// @Produce json
// @Param payload body object{code=string,scope=string,calendarType=string,timezoneOffset=int} true "Object containing the Google authorization code, scope, calendar type, and the user's timezone offset"
// @Success 200
// @Router /auth/sign-in [post]
func signIn(c *gin.Context) {
	payload := struct {
		Code           string              `json:"code" binding:"required"`
		Scope          string              `json:"scope" binding:"required"`
		CalendarType   models.CalendarType `json:"calendarType" binding:"required"`
		TimezoneOffset *int                `json:"timezoneOffset" binding:"required"`
		EventsToLink   []string            `json:"eventsToLink"`
	}{}
	if err := c.BindJSON(&payload); err != nil {
		return
	}

	tokens := auth.GetTokensFromAuthCode(payload.Code, payload.Scope, utils.GetOrigin(c), payload.CalendarType)

	user, err := signInHelper(c, tokens, models.WEB, payload.CalendarType, *payload.TimezoneOffset)
	if err != nil {
		c.JSON(http.StatusUnauthorized, responses.Error{Error: errs.InvalidIdToken})
		return
	}

	// Link events to user
	for _, eventIdString := range payload.EventsToLink {
		// PostgreSQL events have no account-adoption path in phase one.
		source, storageID := eventsource.Parse(eventIdString)
		if source != eventsource.MongoDB {
			continue
		}
		eventId, err := primitive.ObjectIDFromHex(storageID)
		if err == nil {
			db.EventsCollection.UpdateOne(context.Background(), bson.M{"_id": eventId, "ownerId": nil}, bson.M{"$set": bson.M{"ownerId": user.Id}})
		}
	}

	c.JSON(http.StatusOK, user)
}

// @Summary Signs user in from mobile
// @Description Signs user in and sets the access token session variable
// @Tags auth
// @Accept json
// @Produce json
// @Param payload body object{timezoneOffset=int,accessToken=string,scope=string,idToken=string,expiresIn=int,refreshToken=string,tokenOrigin=string,calendarType=string} true "Object containing the Google authorization code, calendar type, and the user's timezone offset"
// @Success 200
// @Router /auth/sign-in-mobile [post]
func signInMobile(c *gin.Context) {
	payload := struct {
		AccessToken    string                 `json:"accessToken" binding:"required"`
		Scope          string                 `json:"scope" binding:"required"`
		IdToken        string                 `json:"idToken" binding:"required"`
		ExpiresIn      int                    `json:"expiresIn" binding:"required"`
		RefreshToken   string                 `json:"refreshToken" binding:"required"`
		TokenOrigin    models.TokenOriginType `json:"tokenOrigin" binding:"required"`
		CalendarType   models.CalendarType    `json:"calendarType" binding:"required"`
		TimezoneOffset int                    `json:"timezoneOffset" binding:"required"`
	}{}
	if err := c.BindJSON(&payload); err != nil {
		return
	}

	_, err := signInHelper(
		c,
		auth.TokenResponse{
			AccessToken:  payload.AccessToken,
			IdToken:      payload.IdToken,
			ExpiresIn:    payload.ExpiresIn,
			RefreshToken: payload.RefreshToken,
			Scope:        payload.Scope,
		},
		payload.TokenOrigin,
		payload.CalendarType,
		payload.TimezoneOffset,
	)
	if err != nil {
		c.JSON(http.StatusUnauthorized, responses.Error{Error: errs.InvalidIdToken})
		return
	}

	c.JSON(http.StatusOK, gin.H{})
}

// Helper function to sign user in with the given parameters from the google oauth route
func signInHelper(c *gin.Context, token auth.TokenResponse, tokenOrigin models.TokenOriginType, calendarType models.CalendarType, timezoneOffset int) (models.User, error) {
	// Get access token expire time
	accessTokenExpireDate := utils.GetAccessTokenExpireDate(token.ExpiresIn)

	// Construct calendar auth object
	calendarAuth := models.OAuth2CalendarAuth{
		AccessToken:           token.AccessToken,
		AccessTokenExpireDate: primitive.NewDateTimeFromTime(accessTokenExpireDate),
		RefreshToken:          token.RefreshToken,
		Scope:                 token.Scope,
	}

	var email, firstName, lastName, picture string
	if calendarType == models.GoogleCalendarType {
		// Verify the ID token before trusting any of its claims. The id token
		// can be supplied directly by the client (e.g. the mobile sign-in
		// endpoint), so decoding it without verifying the signature, audience,
		// and issuer would let an attacker forge an identity and sign in as
		// any user. We accept any of our configured client IDs (web/iOS/
		// Android) as a valid audience.
		allowedAuds := []string{
			os.Getenv("CLIENT_ID"),
			os.Getenv("IOS_CLIENT_ID"),
			os.Getenv("ANDROID_CLIENT_ID"),
		}
		info, err := auth.VerifyGoogleIdToken(token.IdToken, allowedAuds)
		if err != nil {
			logger.StdErr.Printf("Failed to verify Google ID token: %v", err)
			return models.User{}, err
		}
		email = info.Email
		firstName = info.GivenName
		lastName = info.FamilyName
		picture = info.Picture
	} else if calendarType == models.OutlookCalendarType {
		// Get user info from microsoft graph
		userInfo := microsoftgraph.GetUserInfo(nil, &calendarAuth)
		email = userInfo.Email
		firstName = userInfo.FirstName
		lastName = userInfo.LastName
		picture = ""
	}
	email = utils.NormalizeEmail(email)

	primaryAccountKey := utils.GetCalendarAccountKey(email, calendarType)

	ctx := context.Background()

	// PostgreSQL is authoritative for account identity and profile. A matching
	// legacy MongoDB account is adopted instead of duplicated.
	account, _, err := accounts.ResolveForSignIn(ctx, accounts.Profile{
		Email:          email,
		FirstName:      firstName,
		LastName:       lastName,
		Picture:        picture,
		TimezoneOffset: timezoneOffset,
	})
	if err != nil {
		logger.StdErr.Printf("Failed to resolve account for %s: %v", email, err)
		return models.User{}, err
	}

	// A custom name set by the user is preserved; otherwise the provider name
	// wins.
	if account.HasCustomName == nil || !*account.HasCustomName {
		account.FirstName = firstName
		account.LastName = lastName
	}
	if picture != "" {
		account.Picture = picture
	}
	account.Email = email
	account.TimezoneOffset = timezoneOffset
	if err := accounts.UpdateProfile(ctx, account); err != nil {
		logger.StdErr.Panicln(err)
	}

	// Calendar connections, tokens, and preferences stay in the retained
	// MongoDB integration document keyed by the same account identifier.
	integration, err := accounts.EnsureIntegrationDocument(ctx, account.ExternalUserID)
	if err != nil {
		logger.StdErr.Panicln(err)
	}

	calendarAccount := models.CalendarAccount{
		CalendarType:       calendarType,
		OAuth2CalendarAuth: &calendarAuth,

		Email:   email,
		Picture: picture,
		Enabled: utils.TruePtr(), // Workaround to pass a boolean pointer
	}
	canonicalKey := utils.GetCalendarAccountKey(email, calendarType)

	// Reuse subcalendars already stored for this connection when present.
	var oldSubCalendars *map[string]models.SubCalendar
	if integration.CalendarAccounts != nil {
		if legacyKey := utils.ActualCalendarAccountMapKey(integration, email, calendarType); legacyKey != "" {
			if oldAcc, ok := integration.CalendarAccounts[legacyKey]; ok && oldAcc.SubCalendars != nil {
				oldSubCalendars = oldAcc.SubCalendars
			}
		} else if existingAcc, ok := integration.CalendarAccounts[canonicalKey]; ok && existingAcc.SubCalendars != nil {
			oldSubCalendars = existingAcc.SubCalendars
		}
	}
	if oldSubCalendars != nil {
		calendarAccount.SubCalendars = oldSubCalendars
	} else {
		subCalendars, err := calendar.GetCalendarProvider(calendarAccount).GetCalendarList()
		if err == nil {
			calendarAccount.SubCalendars = &subCalendars
		}
	}

	calAccounts := integration.CalendarAccounts
	if calAccounts == nil {
		calAccounts = make(map[string]models.CalendarAccount)
	}
	if legacyKey := utils.ActualCalendarAccountMapKey(integration, email, calendarType); legacyKey != "" && legacyKey != canonicalKey {
		delete(calAccounts, legacyKey)
	}
	calAccounts[canonicalKey] = calendarAccount
	integration.CalendarAccounts = calAccounts
	integration.PrimaryAccountKey = &primaryAccountKey
	integration.TokenOrigin = tokenOrigin
	if err := db.UpdateUserIntegrationFields(integration); err != nil {
		logger.StdErr.Panicln(err)
	}

	if exists, userId := listmonk.DoesUserExist(email); exists {
		listmonk.AddUserToListmonk(email, firstName, lastName, picture, userId, true)
	} else {
		listmonk.AddUserToListmonk(email, firstName, lastName, picture, nil, true)
	}

	// Set session variables
	session := sessions.Default(c)
	session.Set("userId", account.ExternalUserID)
	session.Save()

	return *db.MergeAccountProfile(integration, account), nil
}

// @Summary Signs user out
// @Description Signs user out and deletes the session
// @Tags auth
// @Accept json
// @Produce json
// @Success 200
// @Router /auth/sign-out [post]
func signOut(c *gin.Context) {
	// Delete session
	session := sessions.Default(c)
	session.Delete("userId")
	session.Save()

	c.JSON(http.StatusOK, gin.H{})
}

// @Summary Gets whether the user is signed in or not
// @Description Returns a 401 error if user is not signed in, 200 if they are
// @Tags auth
// @Success 200
// @Failure 401 {object} responses.Error "Error object"
// @Router /auth/status [get]
func getStatus(c *gin.Context) {
	c.JSON(http.StatusOK, gin.H{})
}

func generateOtpCode() string {
	n, err := rand.Int(rand.Reader, big.NewInt(1000000))
	if err != nil {
		logger.StdErr.Panicln(err)
	}
	return fmt.Sprintf("%06d", n.Int64())
}

// @Summary Checks whether a user with the given email exists
// @Tags auth
// @Accept json
// @Produce json
// @Param payload body object{email=string} true "Email to check"
// @Success 200
// @Router /auth/otp/check-email [post]
func checkEmail(c *gin.Context) {
	payload := struct {
		Email string `json:"email" binding:"required"`
	}{}
	if err := c.BindJSON(&payload); err != nil {
		return
	}

	email := strings.ToLower(strings.TrimSpace(payload.Email))

	c.JSON(http.StatusOK, gin.H{"isNewUser": accounts.IsNewUser(email)})
}

// @Summary Sends an OTP code to the given email
// @Tags auth
// @Accept json
// @Produce json
// @Param payload body object{email=string} true "Email to send OTP to"
// @Success 200
// @Router /auth/otp/send [post]
func sendOtp(c *gin.Context) {
	payload := struct {
		Email string `json:"email" binding:"required"`
	}{}
	if err := c.BindJSON(&payload); err != nil {
		return
	}

	email := strings.ToLower(strings.TrimSpace(payload.Email))

	// Validate email provider config before mutating any state, so a
	// misconfigured instance fails fast with a readable error instead of
	// panicking into an empty 500 via gin.Recovery.
	otpTemplateId, err := strconv.Atoi(os.Getenv("LISTMONK_OTP_EMAIL_TEMPLATE_ID"))
	if err != nil {
		logger.StdErr.Println("LISTMONK_OTP_EMAIL_TEMPLATE_ID is not set or invalid")
		c.JSON(http.StatusInternalServerError, responses.Error{Error: "OTP email service is not configured"})
		return
	}
	fromAddress, err := utils.GetListmonkOtpFromAddress()
	if err != nil {
		c.JSON(http.StatusServiceUnavailable, responses.Error{Error: err.Error()})
		return
	}

	// Delete any existing OTP codes for this email
	db.OtpCodesCollection.DeleteMany(context.Background(), bson.M{"email": email})

	code := generateOtpCode()
	otpDoc := models.OtpCode{
		Email:     email,
		Code:      code,
		ExpiresAt: time.Now().Add(10 * time.Minute),
		Attempts:  0,
	}

	_, err = db.OtpCodesCollection.InsertOne(context.Background(), otpDoc)
	if err != nil {
		logger.StdErr.Println(err)
		c.JSON(http.StatusInternalServerError, responses.Error{Error: "failed to store the verification code"})
		return
	}

	listmonk.SendEmailAddSubscriberIfNotExist(email, otpTemplateId, bson.M{
		"code": code,
	}, false, fromAddress)

	c.JSON(http.StatusOK, gin.H{})
}

// @Summary Verifies an OTP code and signs the user in
// @Tags auth
// @Accept json
// @Produce json
// @Param payload body object{email=string,code=string,timezoneOffset=int} true "Email, OTP code, and timezone offset"
// @Success 200
// @Router /auth/otp/verify [post]
func verifyOtp(c *gin.Context) {
	payload := struct {
		Email          string `json:"email" binding:"required"`
		Code           string `json:"code" binding:"required"`
		TimezoneOffset *int   `json:"timezoneOffset" binding:"required"`
		FirstName      string `json:"firstName"`
		LastName       string `json:"lastName"`
	}{}
	if err := c.BindJSON(&payload); err != nil {
		return
	}

	email := strings.ToLower(strings.TrimSpace(payload.Email))

	// Find the OTP document
	var otpDoc models.OtpCode
	err := db.OtpCodesCollection.FindOne(context.Background(), bson.M{
		"email":     email,
		"expiresAt": bson.M{"$gt": time.Now()},
	}).Decode(&otpDoc)

	if err == mongo.ErrNoDocuments {
		c.JSON(http.StatusBadRequest, responses.Error{Error: errs.OtpExpired})
		return
	} else if err != nil {
		logger.StdErr.Panicln(err)
	}

	// Rate-limit: max 5 attempts per code
	if otpDoc.Attempts >= 5 {
		db.OtpCodesCollection.DeleteOne(context.Background(), bson.M{"_id": otpDoc.Id})
		c.JSON(http.StatusTooManyRequests, responses.Error{Error: errs.OtpTooManyAttempts})
		return
	}

	// Increment attempts
	db.OtpCodesCollection.UpdateByID(context.Background(), otpDoc.Id, bson.M{
		"$inc": bson.M{"attempts": 1},
	})

	if otpDoc.Code != payload.Code {
		c.JSON(http.StatusBadRequest, responses.Error{Error: errs.OtpInvalidCode})
		return
	}

	// OTP verified — delete it
	db.OtpCodesCollection.DeleteOne(context.Background(), bson.M{"_id": otpDoc.Id})

	firstName := strings.TrimSpace(payload.FirstName)
	lastName := strings.TrimSpace(payload.LastName)

	// OTP challenge storage stays in MongoDB, but successful authentication
	// resolves an authoritative PostgreSQL account.
	ctx := context.Background()
	account, created, err := accounts.ResolveForSignIn(ctx, accounts.Profile{
		Email:          email,
		FirstName:      firstName,
		LastName:       lastName,
		TimezoneOffset: *payload.TimezoneOffset,
	})
	if err != nil {
		logger.StdErr.Panicln(err)
	}

	if created {
		if exists, listmonkUserId := listmonk.DoesUserExist(email); exists {
			listmonk.AddUserToListmonk(email, firstName, lastName, "", listmonkUserId, true)
		} else {
			listmonk.AddUserToListmonk(email, firstName, lastName, "", nil, true)
		}
	}

	// Set session — same mechanism as OAuth sign-in
	session := sessions.Default(c)
	session.Set("userId", account.ExternalUserID)
	session.Save()

	integration, err := accounts.EnsureIntegrationDocument(ctx, account.ExternalUserID)
	if err != nil {
		logger.StdErr.Panicln(err)
	}
	c.JSON(http.StatusOK, db.MergeAccountProfile(integration, account))
}

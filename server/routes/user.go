/* The /user group contains all the routes to get all the information about the currently signed in user */
package routes

import (
	"context"
	"encoding/json"
	"errors"
	"log"
	"net/http"
	"strings"
	"time"

	"github.com/gin-contrib/sessions"
	"github.com/gin-gonic/gin"
	"github.com/jackc/pgx/v5"
	"go.mongodb.org/mongo-driver/bson"
	"go.mongodb.org/mongo-driver/bson/primitive"
	"go.mongodb.org/mongo-driver/mongo/options"
	"timeful/server/accounts"
	"timeful/server/db"
	"timeful/server/errs"
	"timeful/server/eventsource"
	"timeful/server/logger"
	"timeful/server/middleware"
	"timeful/server/models"
	pgstore "timeful/server/postgres"
	"timeful/server/responses"
	"timeful/server/services/auth"
	"timeful/server/services/calendar"
	"timeful/server/services/contacts"
	"timeful/server/services/microsoftgraph"
	"timeful/server/utils"
)

func InitUser(router *gin.RouterGroup) {
	userRouter := router.Group("/user")
	userRouter.Use(middleware.AuthRequired())

	userRouter.GET("/profile", getProfile)
	userRouter.PATCH("/name", updateName)
	userRouter.PATCH("/calendar-options", updateCalendarOptions)
	userRouter.GET("/events", getEvents)
	userRouter.POST("/events/:eventId/set-folder", setEventFolder)
	userRouter.GET("/calendars", getCalendars)
	userRouter.POST("/add-google-calendar-account", addGoogleCalendarAccount)
	userRouter.POST("/add-apple-calendar-account", addAppleCalendarAccount)
	userRouter.POST("/add-outlook-calendar-account", addOutlookCalendarAccount)
	userRouter.POST("/add-ics-calendar-account", addICSCalendarAccount)
	userRouter.DELETE("/remove-calendar-account", removeCalendarAccount)
	userRouter.POST("/toggle-calendar", toggleCalendar)
	userRouter.POST("/toggle-sub-calendar", toggleSubCalendar)
	userRouter.GET("/searchContacts", searchContacts)
	userRouter.DELETE("", deleteUser)
}

// @Summary Gets the user's profile
// @Tags user
// @Produce json
// @Success 200 {object} models.User "A user profile object"
// @Router /user/profile [get]
func getProfile(c *gin.Context) {
	userInterface, _ := c.Get("authUser")
	user := userInterface.(*models.User)

	// The usage counter is PostgreSQL-authoritative. The retained MongoDB
	// document must not supply or override numEventsCreated.
	db.UpdateDailyUserLog(user)

	c.JSON(http.StatusOK, user)
}

// @Summary Updates the user's name
// @Tags user
// @Accept json
// @Produce json
// @Param payload body object{firstName=string,lastName=string} true "Object containing the updated name"
// @Success 200
// @Router /user/name [patch]
func updateName(c *gin.Context) {
	payload := struct {
		FirstName string `json:"firstName" binding:"required"`
		LastName  string `json:"lastName" binding:"required"`
	}{}
	if err := c.BindJSON(&payload); err != nil {
		return
	}

	account := utils.GetAuthAccount(c)
	if account == nil {
		c.JSON(http.StatusUnauthorized, responses.Error{Error: errs.UserDoesNotExist})
		return
	}
	account.FirstName = payload.FirstName
	account.LastName = payload.LastName
	account.HasCustomName = utils.TruePtr()

	// The profile is PostgreSQL-authoritative; the retained MongoDB document is
	// never written from this path.
	if err := accounts.UpdateProfile(c.Request.Context(), account); err != nil {
		logger.StdErr.Panicln(err)
	}

	c.JSON(http.StatusOK, gin.H{})
}

// @Summary Updates the user's calendar options
// @Tags user
// @Accept json
// @Produce json
// @Param payload body object{bufferTime=models.BufferTimeOptions,workingHours=models.WorkingHoursOptions} true "Object containing the updated options"
// @Success 200
// @Router /user/calendar-options [patch]
func updateCalendarOptions(c *gin.Context) {
	payload := struct {
		BufferTime   *models.BufferTimeOptions   `json:"bufferTime"`
		WorkingHours *models.WorkingHoursOptions `json:"workingHours"`
	}{}
	if err := c.BindJSON(&payload); err != nil {
		return
	}

	authUser := utils.GetAuthUser(c)

	// Set default values for calendar options if nil
	if authUser.CalendarOptions == nil {
		authUser.CalendarOptions = &models.CalendarOptions{
			BufferTime: models.BufferTimeOptions{
				Enabled: false,
				Time:    15,
			},
			WorkingHours: models.WorkingHoursOptions{
				Enabled:   false,
				StartTime: 9,
				EndTime:   17,
			},
		}
	}

	// Update calendar options
	if payload.BufferTime != nil {
		authUser.CalendarOptions.BufferTime = *payload.BufferTime
	}
	if payload.WorkingHours != nil {
		authUser.CalendarOptions.WorkingHours = *payload.WorkingHours
	}

	// Update database
	if err := db.UpdateUserIntegrationFields(authUser); err != nil {
		logger.StdErr.Panicln(err)
	}

	c.JSON(http.StatusOK, gin.H{})
}

// @Summary Gets all the user's events
// @Description Returns an array containing all the user's events
// @Tags user
// @Produce json
// @Success 200 {object} []models.Event
// @Router /user/events [get]
func getEvents(c *gin.Context) {
	user := utils.GetAuthUser(c)
	userId := user.Id

	// Get the events associated with the current user
	events := make([]models.Event, 0)
	opts := options.Find().SetSort(bson.M{"_id": -1})

	// Get all the event ids that the user has responded to
	cursor, err := db.EventResponsesCollection.Find(context.Background(), bson.M{"userId": userId.Hex()})
	if err != nil {
		logger.StdErr.Panicln(err)
	}
	defer cursor.Close(context.Background())
	eventIds := make([]primitive.ObjectID, 0)
	for cursor.Next(context.Background()) {
		var eventResponse models.EventResponse
		if err := cursor.Decode(&eventResponse); err != nil {
			logger.StdErr.Panicln(err)
		}
		eventIds = append(eventIds, eventResponse.EventId)
	}

	// Get all the event ids that the user is an attendee of
	cursor, err = db.AttendeesCollection.Find(context.Background(), bson.M{"email": user.Email, "declined": false})
	if err != nil {
		logger.StdErr.Panicln(err)
	}
	defer cursor.Close(context.Background())
	hasRespondedEventIds := make(models.Set[primitive.ObjectID])
	for cursor.Next(context.Background()) {
		var attendee models.Attendee
		if err := cursor.Decode(&attendee); err != nil {
			logger.StdErr.Panicln(err)
		}
		if utils.Contains(eventIds, attendee.EventId) {
			hasRespondedEventIds[attendee.EventId] = struct{}{}
		} else {
			eventIds = append(eventIds, attendee.EventId)
		}
	}

	cursor, err = db.EventsCollection.Find(
		context.Background(),
		bson.M{
			"$and": bson.A{
				bson.M{
					"$or": bson.A{
						bson.M{"_id": bson.M{"$in": eventIds}},
						bson.M{"ownerId": userId},
					},
				},
				bson.M{
					"$or": bson.A{
						bson.M{"isDeleted": bson.M{"$exists": false}},
						bson.M{"isDeleted": false},
					},
				},
			},
		},
		opts,
	)
	if err != nil {
		logger.StdErr.Panicln(err)
	}
	if err := cursor.All(context.Background(), &events); err != nil {
		logger.StdErr.Panicln(err)
	}

	for i, event := range events {
		// Set the hasResponded field for availability groups
		if event.Type == models.GROUP {
			if _, ok := hasRespondedEventIds[event.Id]; ok {
				events[i].HasResponded = utils.TruePtr()
			} else {
				events[i].HasResponded = utils.FalsePtr()
			}
		}
	}

	// Merge PostgreSQL-owned events the account owns or responded to. MongoDB
	// and PostgreSQL own disjoint records, so each entry appears exactly once.
	result := make([]any, 0, len(events))
	for _, event := range events {
		result = append(result, event)
	}
	repository, err := pgstore.DefaultRepository()
	if err != nil && !errors.Is(err, pgstore.ErrPoolUninitialized) {
		logger.StdErr.Panicln(err)
	}
	if repository != nil {
		dashboardEvents, err := repository.ListDashboardEvents(c.Request.Context(), userId.Hex(), user.Email)
		if err != nil {
			c.JSON(http.StatusInternalServerError, responses.Error{Error: "failed-to-load-events"})
			return
		}
		for _, item := range dashboardEvents {
			payload, err := postgresDashboardEvent(item.Event, item.Owned, userId.Hex(), item.Responded && item.Member)
			if err != nil {
				logger.StdErr.Panicln(err)
			}
			result = append(result, payload)
		}
	}

	c.JSON(http.StatusOK, result)
}

// postgresDashboardEvent renders a PostgreSQL event in the MongoDB dashboard
// wire shape. The canonical public identifier is exposed as both _id and
// shortId so the frontend opens the event without a store prefix and uses it as
// a stable list key. ownerId carries the account identifier only for owned
// events, matching legacy owner detection; responded-only events stay anonymous.
// Group entries carry the derived responded state the legacy dashboard sets.
func postgresDashboardEvent(event pgstore.Event, owned bool, externalUserID string, responded bool) (map[string]any, error) {
	value, err := postgresEventModel(&event)
	if err != nil {
		return nil, err
	}
	value.ResponsesMap = nil
	value.HasResponded = nil
	encoded, err := json.Marshal(value)
	if err != nil {
		return nil, err
	}
	result := map[string]any{}
	if err := json.Unmarshal(encoded, &result); err != nil {
		return nil, err
	}
	result["_id"] = event.ShortID
	result["shortId"] = event.ShortID
	ownerID := primitive.NilObjectID.Hex()
	if owned {
		if objectID, err := primitive.ObjectIDFromHex(externalUserID); err == nil {
			ownerID = objectID.Hex()
		}
	}
	result["ownerId"] = ownerID
	if event.Type == pgstore.EventTypeGroup {
		result["hasResponded"] = responded
	}
	return result, nil
}

// @Summary Sets the folder for the specified event
// @Tags user
// @Accept json
// @Produce json
// @Param eventId path string true "The ID of the event to set the folder for"
// @Param payload body object{folderId=string} true "The ID of the folder to set the event to"
// @Success 200
// @Router /user/events/{eventId}/set-folder [post]
func setEventFolder(c *gin.Context) {
	source, storageID := eventsource.Parse(c.Param("eventId"))
	if source == eventsource.Unknown {
		c.JSON(http.StatusBadRequest, gin.H{"error": "Invalid event ID"})
		return
	}

	var body = struct {
		FolderId *string `json:"folderId"`
	}{}
	if err := c.ShouldBindJSON(&body); err != nil {
		c.JSON(http.StatusBadRequest, gin.H{"error": err.Error()})
		return
	}

	session := sessions.Default(c)
	accountUserID, ok := session.Get("userId").(string)
	if !ok || accountUserID == "" {
		c.JSON(http.StatusBadRequest, gin.H{"error": "Invalid user ID"})
		return
	}

	var folderId *string
	if body.FolderId != nil {
		if !validFolderID(*body.FolderId) {
			c.JSON(http.StatusBadRequest, gin.H{"error": "Invalid folder ID"})
			return
		}
		folderId = body.FolderId
	}

	repository := postgresRepository(c)
	if repository == nil {
		return
	}

	var member pgstore.FolderMember
	switch source {
	case eventsource.PostgreSQL:
		event, err := repository.GetEventByShortID(c.Request.Context(), storageID)
		if errors.Is(err, pgx.ErrNoRows) || (err == nil && event.IsDeleted) {
			c.JSON(http.StatusNotFound, responses.Error{Error: errs.EventNotFound})
			return
		}
		if err != nil {
			c.JSON(http.StatusInternalServerError, responses.Error{Error: "failed-to-load-event"})
			return
		}
		eventID := event.ID
		member.EventID = &eventID
	case eventsource.MongoDB:
		event := db.GetEventByEitherId(storageID)
		if event == nil {
			c.JSON(http.StatusNotFound, responses.Error{Error: errs.EventNotFound})
			return
		}
		legacyEventID := event.Id.Hex()
		member.LegacyEventID = &legacyEventID
	}

	err := repository.AssignEventToFolder(c.Request.Context(), accountUserID, folderId, member)
	if errors.Is(err, pgx.ErrNoRows) {
		c.JSON(http.StatusNotFound, gin.H{"error": "Folder not found"})
		return
	}
	if err != nil {
		c.JSON(http.StatusInternalServerError, gin.H{"error": "Failed to add event to folder"})
		return
	}

	c.Status(http.StatusOK)
}

// @Summary Gets the user's calendar events
// @Description Gets the user's calendar events between "timeMin" and "timeMax"
// @Tags user
// @Produce json
// @Param timeMin query string true "Lower bound for event's start time to filter by"
// @Param timeMax query string true "Upper bound for event's end time to filter by"
// @Param accounts query string false "Comma separated list of accounts to fetch calendar events from"
// @Success 200 {object} map[string]calendar.CalendarEventsWithError
// @Router /user/calendars [get]
func getCalendars(c *gin.Context) {
	// Bind query parameters
	payload := struct {
		TimeMin  time.Time `form:"timeMin" binding:"required"`
		TimeMax  time.Time `form:"timeMax" binding:"required"`
		Accounts string    `form:"accounts"`
	}{}
	if err := c.Bind(&payload); err != nil {
		return
	}

	var accounts []string
	if len(payload.Accounts) == 0 {
		accounts = make([]string, 0)
	} else {
		accounts = utils.ParseArrayQueryParam(payload.Accounts)
	}
	accountsSet := utils.ArrayToSet(accounts)
	user := utils.GetAuthUser(c)

	calendarEvents, editedCalendarAccounts := calendar.GetUsersCalendarEvents(user, accountsSet, payload.TimeMin, payload.TimeMax)

	if editedCalendarAccounts {
		if err := db.UpdateUserIntegrationFields(user); err != nil {
			logger.StdErr.Panicln(err)
		}
	}

	c.JSON(http.StatusOK, calendarEvents)
}

// @Summary Adds a new calendar account
// @Tags user
// @Accept json
// @Produce json
// @Param payload body object{code=string,scope=string} true "Object containing the Google authorization code and scope"
// @Success 200
// @Router /user/add-google-calendar-account [post]
func addGoogleCalendarAccount(c *gin.Context) {
	payload := struct {
		Code  string `json:"code" binding:"required"`
		Scope string `json:"scope" binding:"required"`
	}{}
	if err := c.BindJSON(&payload); err != nil {
		return
	}

	// Get tokens
	tokens := auth.GetTokensFromAuthCode(payload.Code, payload.Scope, utils.GetOrigin(c), models.GoogleCalendarType)

	// Get user info from JWT
	claims := utils.ParseJWT(tokens.IdToken)
	email, _ := claims.GetStr("email")
	picture, _ := claims.GetStr("picture")

	// Get access token expire time
	accessTokenExpireDate := utils.GetAccessTokenExpireDate(tokens.ExpiresIn)

	calendarAuth := &models.OAuth2CalendarAuth{
		AccessToken:           tokens.AccessToken,
		AccessTokenExpireDate: primitive.NewDateTimeFromTime(accessTokenExpireDate),
		RefreshToken:          tokens.RefreshToken,
	}

	addCalendarAccount(c, addCalendarAccountArgs{
		calendarType:       models.GoogleCalendarType,
		oAuth2CalendarAuth: calendarAuth,
		email:              email,
		picture:            picture,
	})

	c.JSON(http.StatusOK, gin.H{})
}

// @Summary Adds an apple calendar account
// @Tags user
// @Accept json
// @Produce json
// @Param payload body object{email=string,password=string} true "Object containing the email and app password of the apple account"
// @Success 200
// @Router /user/add-apple-calendar-account [post]
func addAppleCalendarAccount(c *gin.Context) {
	payload := struct {
		Email    string `json:"email" binding:"required"`
		Password string `json:"password" binding:"required"`
	}{}
	if err := c.BindJSON(&payload); err != nil {
		return
	}

	encryptedPassword, err := utils.Encrypt(payload.Password)
	if err != nil {
		logger.StdErr.Panicln(err)
	}

	auth := &models.AppleCalendarAuth{
		Email:    payload.Email,
		Password: encryptedPassword,
	}

	// Check if the provided credentials are valid
	calendarProvider := calendar.AppleCalendar{
		AppleCalendarAuth: *auth,
	}
	_, err = calendarProvider.GetCalendarList()
	if err != nil {
		c.JSON(http.StatusUnauthorized, responses.Error{Error: errs.InvalidCredentials})
		return
	}

	addCalendarAccount(c, addCalendarAccountArgs{
		calendarType:      models.AppleCalendarType,
		appleCalendarAuth: auth,
		email:             payload.Email,
		picture:           "",
	})

	c.JSON(http.StatusOK, gin.H{})
}

// @Summary Adds a new outlook calendar account
// @Tags user
// @Accept json
// @Produce json
// @Param payload body object{code=string,scope=string} true "Object containing the Outlook authorization code and scope"
// @Success 200
// @Router /user/add-outlook-calendar-account [post]
func addOutlookCalendarAccount(c *gin.Context) {
	payload := struct {
		Code  string `json:"code" binding:"required"`
		Scope string `json:"scope" binding:"required"`
	}{}
	if err := c.BindJSON(&payload); err != nil {
		return
	}

	// Get auth user
	authUser := utils.GetAuthUser(c)

	// Get tokens
	tokens := auth.GetTokensFromAuthCode(payload.Code, payload.Scope, utils.GetOrigin(c), models.OutlookCalendarType)

	// Get access token expire time
	accessTokenExpireDate := utils.GetAccessTokenExpireDate(tokens.ExpiresIn)

	// Construct calendarAuth object
	calendarAuth := &models.OAuth2CalendarAuth{
		AccessToken:           tokens.AccessToken,
		AccessTokenExpireDate: primitive.NewDateTimeFromTime(accessTokenExpireDate),
		RefreshToken:          tokens.RefreshToken,
		Scope:                 payload.Scope,
	}

	// Get user info
	userInfo := microsoftgraph.GetUserInfo(authUser, calendarAuth)

	addCalendarAccount(c, addCalendarAccountArgs{
		calendarType:       models.OutlookCalendarType,
		oAuth2CalendarAuth: calendarAuth,
		email:              userInfo.Email,
		picture:            "",
	})

	c.JSON(http.StatusOK, gin.H{})
}

// @Summary Adds an ICS calendar account
// @Tags user
// @Accept json
// @Produce json
// @Param payload body object{feedUrl=string,label=string} true "Object containing the feed URL and label of the ICS calendar"
// @Success 200
// @Router /user/add-ics-calendar-account [post]
func addICSCalendarAccount(c *gin.Context) {
	payload := struct {
		FeedURL string `json:"feedUrl" binding:"required"`
		Label   string `json:"label" binding:"required"`
	}{}
	if err := c.BindJSON(&payload); err != nil {
		return
	}

	auth := &models.ICSCalendarAuth{
		FeedURL: payload.FeedURL,
		Label:   payload.Label,
	}

	// Check if the provided feed URL is reachable
	calendarProvider := calendar.ICSCalendar{
		ICSCalendarAuth: *auth,
	}
	_, err := calendarProvider.GetCalendarList()
	if err != nil {
		c.JSON(http.StatusBadRequest, responses.Error{Error: "Invalid ICS feed URL"})
		return
	}

	addCalendarAccount(c, addCalendarAccountArgs{
		calendarType:    models.ICSCalendarType,
		icsCalendarAuth: auth,
		// ICS feeds don't have an email, so we use the label instead
		email:   payload.Label,
		picture: "",
	})

	c.JSON(http.StatusOK, gin.H{})
}

// Implements the shared functionality for adding a calendar account
type addCalendarAccountArgs struct {
	calendarType       models.CalendarType
	oAuth2CalendarAuth *models.OAuth2CalendarAuth
	appleCalendarAuth  *models.AppleCalendarAuth
	icsCalendarAuth    *models.ICSCalendarAuth
	email              string
	picture            string
}

func addCalendarAccount(c *gin.Context, args addCalendarAccountArgs) {
	// Get auth user
	authUser := utils.GetAuthUser(c)

	ident := args.email
	if args.calendarType != models.ICSCalendarType {
		ident = utils.NormalizeEmail(args.email)
	} else {
		ident = strings.TrimSpace(args.email)
	}

	// Create calendar account object
	calendarAccount := models.CalendarAccount{
		CalendarType: args.calendarType,

		Email:   ident,
		Picture: args.picture,
		Enabled: utils.TruePtr(), // Workaround to pass a boolean pointer
	}
	switch args.calendarType {
	case models.GoogleCalendarType:
		calendarAccount.OAuth2CalendarAuth = args.oAuth2CalendarAuth
	case models.OutlookCalendarType:
		calendarAccount.OAuth2CalendarAuth = args.oAuth2CalendarAuth
	case models.AppleCalendarType:
		calendarAccount.AppleCalendarAuth = args.appleCalendarAuth
	case models.ICSCalendarType:
		calendarAccount.ICSCalendarAuth = args.icsCalendarAuth
	}
	canonicalKey := utils.GetCalendarAccountKey(ident, args.calendarType)
	legacyKey := utils.ActualCalendarAccountMapKey(authUser, ident, args.calendarType)

	// Set subcalendars map based on whether calendar account already exists
	var oldForSub *models.CalendarAccount
	if legacyKey != "" {
		if acc, ok := authUser.CalendarAccounts[legacyKey]; ok {
			oldForSub = &acc
		}
	} else if acc, ok := authUser.CalendarAccounts[canonicalKey]; ok {
		oldForSub = &acc
	}
	if oldForSub != nil && oldForSub.SubCalendars != nil {
		calendarAccount.SubCalendars = oldForSub.SubCalendars
	} else {
		subCalendars, err := calendar.GetCalendarProvider(calendarAccount).GetCalendarList()
		if err == nil {
			calendarAccount.SubCalendars = &subCalendars
		}
	}

	if authUser.CalendarAccounts == nil {
		authUser.CalendarAccounts = make(map[string]models.CalendarAccount)
	}
	if legacyKey != "" && legacyKey != canonicalKey {
		delete(authUser.CalendarAccounts, legacyKey)
	}
	authUser.CalendarAccounts[canonicalKey] = calendarAccount

	// Retained integration fields only; the profile stays in PostgreSQL.
	if err := db.UpdateUserIntegrationFields(authUser); err != nil {
		logger.StdErr.Panicln(err)
	}
}

// @Summary Removes an existing calendar account
// @Tags user
// @Accept json
// @Produce json
// @Param payload body object{email=string,calendarType=models.CalendarType} true "Object containing the email + type of the calendar account to remove"
// @Success 200
// @Router /user/remove-calendar-account [delete]
func removeCalendarAccount(c *gin.Context) {
	payload := struct {
		Email        string              `json:"email" binding:"required"`
		CalendarType models.CalendarType `json:"calendarType" binding:"required"`
	}{}
	if err := c.BindJSON(&payload); err != nil {
		return
	}

	authUser := utils.GetAuthUser(c)
	calendarAccountKey := utils.ActualCalendarAccountMapKey(authUser, payload.Email, payload.CalendarType)
	if calendarAccountKey == "" {
		calendarAccountKey = utils.GetCalendarAccountKey(payload.Email, payload.CalendarType)
	}

	// Retained integration field removal only; the profile stays in PostgreSQL.
	if err := db.RemoveUserCalendarAccount(authUser.Id, calendarAccountKey); err != nil {
		logger.StdErr.Panicln(err)
	}

	c.JSON(http.StatusOK, gin.H{})
}

// @Summary Toggles whether the specified calendar is enabled or disabled for the user
// @Tags user
// @Accept json
// @Produce json
// @Param payload body object{calendarAccountKey=string,enabled=bool} true "Email of calendar account and whether to enable it"
// @Success 200
// @Router /user/toggle-calendar [post]
func toggleCalendar(c *gin.Context) {
	payload := struct {
		Email        string              `json:"email" binding:"required"`
		CalendarType models.CalendarType `json:"calendarType" binding:"required"`
		Enabled      *bool               `json:"enabled" binding:"required"`
	}{}
	if err := c.Bind(&payload); err != nil {
		logger.StdErr.Panicln(err)
		return
	}

	// Update enabled status for the specified account
	authUser := utils.GetAuthUser(c)
	calendarAccountKey := utils.ActualCalendarAccountMapKey(authUser, payload.Email, payload.CalendarType)
	if calendarAccountKey == "" {
		calendarAccountKey = utils.GetCalendarAccountKey(payload.Email, payload.CalendarType)
	}
	if account, ok := authUser.CalendarAccounts[calendarAccountKey]; ok {
		account.Enabled = payload.Enabled
		authUser.CalendarAccounts[calendarAccountKey] = account

		if err := db.UpdateUserIntegrationFields(authUser); err != nil {
			logger.StdErr.Panicln(err)
			return
		}
	}

	c.JSON(http.StatusOK, gin.H{})
}

// @Summary Toggles whether the specified sub-calendar is enabled or disabled for the user
// @Tags user
// @Accept json
// @Produce json
// @Param payload body object{calendarAccountKey=string,subCalendarId=string,enabled=bool} true "Email of calendar account, the sub calendar id, and whether to enable it"
// @Success 200
// @Router /user/toggle-sub-calendar [post]
func toggleSubCalendar(c *gin.Context) {
	payload := struct {
		Email         string              `json:"email" binding:"required"`
		CalendarType  models.CalendarType `json:"calendarType" binding:"required"`
		SubCalendarId string              `json:"subCalendarId" binding:"required"`
		Enabled       *bool               `json:"enabled" binding:"required"`
	}{}
	if err := c.Bind(&payload); err != nil {
		logger.StdErr.Panicln(err)
		return
	}

	// Update enabled status for the specified sub calendar
	authUser := utils.GetAuthUser(c)
	calendarAccountKey := utils.ActualCalendarAccountMapKey(authUser, payload.Email, payload.CalendarType)
	if calendarAccountKey == "" {
		calendarAccountKey = utils.GetCalendarAccountKey(payload.Email, payload.CalendarType)
	}
	if account, ok := authUser.CalendarAccounts[calendarAccountKey]; ok {
		if subCalendar, ok := (*account.SubCalendars)[payload.SubCalendarId]; ok {
			subCalendar.Enabled = payload.Enabled
			(*account.SubCalendars)[payload.SubCalendarId] = subCalendar
			authUser.CalendarAccounts[calendarAccountKey] = account

			if err := db.UpdateUserIntegrationFields(authUser); err != nil {
				logger.StdErr.Panicln(err)
				return
			}
		}
	}

	c.JSON(http.StatusOK, gin.H{})
}

// @Summary Searches the user's contacts based on the given query
// @Tags user
// @Produce json
// @Param query query string true "Query to search for"
// @Success 200 {object} []models.User
// @Router /user/searchContacts [get]
func searchContacts(c *gin.Context) {
	// Bind query parameters
	payload := struct {
		Query string `form:"query"`
	}{}
	if err := c.Bind(&payload); err != nil {
		return
	}

	userInterface, _ := c.Get("authUser")
	user := userInterface.(*models.User)

	contacts, googleError := contacts.SearchContacts(user, payload.Query)
	if googleError != nil {
		c.JSON(googleError.Code, responses.Error{Error: *googleError})
		return
	}

	c.JSON(http.StatusOK, contacts)
}

// @Summary Deletes the currently signed in user
// @Description Requires the account email address as confirmation. Deletion is permanent and immediate: the account profile, platform identity, and calendar connections are removed, events the account organized survive with ownership released, and the account's own responses, friend requests, folders, and historical logs are removed.
// @Tags user
// @Accept json
// @Produce json
// @Param payload body object{email=string} true "The account email address that must match the signed-in account"
// @Success 200
// @Failure 400 {object} responses.Error "The supplied email does not match the account"
// @Router /user [delete]
func deleteUser(c *gin.Context) {
	payload := struct {
		Email string `json:"email"`
	}{}
	if err := c.BindJSON(&payload); err != nil {
		c.JSON(http.StatusBadRequest, responses.Error{Error: errs.AccountEmailMismatch})
		return
	}

	account := utils.GetAuthAccount(c)
	if account == nil {
		c.JSON(http.StatusUnauthorized, responses.Error{Error: errs.UserDoesNotExist})
		return
	}
	if !strings.EqualFold(strings.TrimSpace(payload.Email), strings.TrimSpace(account.Email)) {
		c.JSON(http.StatusBadRequest, responses.Error{Error: errs.AccountEmailMismatch})
		return
	}

	// The deletion unit cleans the retained MongoDB data and then removes the
	// PostgreSQL account authority and platform identity in one transaction. The
	// session is cleared only after the whole unit succeeds, so a failure leaves
	// the visitor signed in and able to retry.
	if err := accounts.DeleteAccount(c.Request.Context(), account.ExternalUserID); err != nil {
		log.Printf("account deletion failed for %s: %v", account.ExternalUserID, err)
		c.JSON(http.StatusInternalServerError, responses.Error{Error: "account-deletion-failed"})
		return
	}

	session := sessions.Default(c)
	session.Delete("userId")
	if err := session.Save(); err != nil {
		logger.StdErr.Panicln(err)
	}

	c.JSON(http.StatusOK, gin.H{})
}

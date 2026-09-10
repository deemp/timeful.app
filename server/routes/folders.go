package routes

import (
	"context"
	"errors"
	"net/http"
	"regexp"

	"github.com/gin-contrib/sessions"
	"github.com/gin-gonic/gin"
	"github.com/jackc/pgx/v5"
	"go.mongodb.org/mongo-driver/bson/primitive"
	"timeful/server/db"
	"timeful/server/logger"
	"timeful/server/middleware"
	pgstore "timeful/server/postgres"
)

var folderIDPattern = regexp.MustCompile(`^[0-9a-fA-F]{8}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{12}$`)

func validFolderID(id string) bool { return folderIDPattern.MatchString(id) }

// folderResponse mirrors the documented models.Folder wire shape while carrying
// canonical public event identifiers in eventIds. MongoDB storage identifiers
// are never returned.
type folderResponse struct {
	Id        string   `json:"_id"`
	UserId    string   `json:"userId"`
	Name      string   `json:"name,omitempty"`
	Color     *string  `json:"color,omitempty"`
	IsDeleted *bool    `json:"isDeleted,omitempty"`
	EventIds  []string `json:"eventIds"`
}

func InitFolders(router *gin.RouterGroup) {
	folderRouter := router.Group("/user/folders")
	folderRouter.Use(middleware.AuthRequired())

	folderRouter.GET("", GetAllFolders)
	folderRouter.POST("", CreateFolder)
	folderRouter.GET("/:folderId", GetFolder)
	folderRouter.PATCH("/:folderId", UpdateFolder)
	folderRouter.DELETE("/:folderId", DeleteFolder)
}

func folderAccountUserID(c *gin.Context) (string, bool) {
	userIdString, ok := sessions.Default(c).Get("userId").(string)
	if !ok || userIdString == "" {
		c.JSON(http.StatusBadRequest, gin.H{"error": "Invalid user ID"})
		return "", false
	}
	return userIdString, true
}

// legacyFolderEventShortIDs resolves the legacy event short identifiers needed
// to render canonical m_ identifiers for a set of folders.
func legacyFolderEventShortIDs(ctx context.Context, folders []pgstore.Folder) (map[string]string, error) {
	ids := []primitive.ObjectID{}
	seen := map[string]struct{}{}
	for _, folder := range folders {
		for _, member := range folder.Members {
			if member.LegacyEventID == nil {
				continue
			}
			if _, ok := seen[*member.LegacyEventID]; ok {
				continue
			}
			objectID, err := primitive.ObjectIDFromHex(*member.LegacyEventID)
			if err != nil {
				continue
			}
			seen[*member.LegacyEventID] = struct{}{}
			ids = append(ids, objectID)
		}
	}
	if len(ids) == 0 {
		return map[string]string{}, nil
	}
	return db.GetEventShortIdsByObjectID(ids)
}

// canonicalFolderEventIDs renders each member as the identifier the frontend
// uses to match an event: the bare PostgreSQL short identifier, or the
// namespaced legacy public identifier.
func canonicalFolderEventIDs(members []pgstore.FolderMember, legacyShortIDs map[string]string) []string {
	ids := make([]string, 0, len(members))
	for _, member := range members {
		switch {
		case member.EventShortID != nil && *member.EventShortID != "":
			ids = append(ids, *member.EventShortID)
		case member.LegacyEventID != nil:
			if shortID, ok := legacyShortIDs[*member.LegacyEventID]; ok && shortID != "" {
				ids = append(ids, "m_"+shortID)
			} else {
				ids = append(ids, "m_"+*member.LegacyEventID)
			}
		}
	}
	return ids
}

func folderResponseFrom(folder pgstore.Folder, legacyShortIDs map[string]string) folderResponse {
	return folderResponse{
		Id:        folder.ID,
		UserId:    folder.AccountUserID,
		Name:      folder.Name,
		Color:     folder.Color,
		IsDeleted: folder.IsDeleted,
		EventIds:  canonicalFolderEventIDs(folder.Members, legacyShortIDs),
	}
}

// @Summary Get all folders
// @Tags folders
// @Produce json
// @Success 200 {array} models.Folder "A list of all folders for the user"
// @Failure 400 {object} map[string]string "Invalid user ID"
// @Failure 500 {object} map[string]string "Failed to get folders"
// @Router /user/folders [get]
func GetAllFolders(c *gin.Context) {
	accountUserID, ok := folderAccountUserID(c)
	if !ok {
		return
	}
	repository := postgresRepository(c)
	if repository == nil {
		return
	}

	folders, err := repository.ListFolders(c.Request.Context(), accountUserID)
	if err != nil {
		c.JSON(http.StatusInternalServerError, gin.H{"error": "Failed to get folders"})
		return
	}

	legacyShortIDs, err := legacyFolderEventShortIDs(c.Request.Context(), folders)
	if err != nil {
		c.JSON(http.StatusInternalServerError, gin.H{"error": "Failed to get folders"})
		return
	}

	result := make([]folderResponse, 0, len(folders))
	for _, folder := range folders {
		result = append(result, folderResponseFrom(folder, legacyShortIDs))
	}
	c.JSON(http.StatusOK, result)
}

// @Summary Get a folder by its ID and its contents
// @Tags folders
// @Produce json
// @Param folderId path string true "Folder ID"
// @Success 200 {object} models.Folder "The folder object with events"
// @Failure 400 {object} map[string]string "Invalid user ID or folder ID"
// @Failure 404 {object} map[string]string "Folder not found"
// @Failure 500 {object} map[string]string "Failed to get events in folder"
// @Router /user/folders/{folderId} [get]
func GetFolder(c *gin.Context) {
	accountUserID, ok := folderAccountUserID(c)
	if !ok {
		return
	}
	repository := postgresRepository(c)
	if repository == nil {
		return
	}

	folder, err := repository.GetFolderByID(c.Request.Context(), c.Param("folderId"), accountUserID)
	if errors.Is(err, pgx.ErrNoRows) {
		c.JSON(http.StatusNotFound, gin.H{"error": "Folder not found"})
		return
	}
	if err != nil {
		c.JSON(http.StatusInternalServerError, gin.H{"error": "Failed to get events in folder"})
		return
	}

	legacyShortIDs, err := legacyFolderEventShortIDs(c.Request.Context(), []pgstore.Folder{*folder})
	if err != nil {
		c.JSON(http.StatusInternalServerError, gin.H{"error": "Failed to get events in folder"})
		return
	}
	c.JSON(http.StatusOK, folderResponseFrom(*folder, legacyShortIDs))
}

type CreateFolderResponse struct {
	Id string `json:"id"`
}

// @Summary Create a new folder
// @Tags folders
// @Accept json
// @Produce json
// @Param payload body object{name=string,color=string} true "Folder name and optional color"
// @Success 201 {object} CreateFolderResponse "The ID of the created folder"
// @Failure 400 {object} map[string]string "Invalid user ID or request body"
// @Failure 500 {object} map[string]string "Failed to create folder"
// @Router /user/folders [post]
func CreateFolder(c *gin.Context) {
	var body struct {
		Name  string  `json:"name" binding:"required"`
		Color *string `json:"color"`
	}

	if err := c.ShouldBindJSON(&body); err != nil {
		c.JSON(http.StatusBadRequest, gin.H{"error": err.Error()})
		return
	}

	accountUserID, ok := folderAccountUserID(c)
	if !ok {
		return
	}
	repository := postgresRepository(c)
	if repository == nil {
		return
	}

	folder := pgstore.Folder{
		AccountUserID: accountUserID,
		Name:          body.Name,
		Color:         body.Color,
	}
	if err := repository.CreateFolder(c.Request.Context(), &folder); err != nil {
		c.JSON(http.StatusInternalServerError, gin.H{"error": "Failed to create folder"})
		return
	}

	c.JSON(http.StatusCreated, CreateFolderResponse{Id: folder.ID})
}

// @Summary Update a folder's name or color
// @Tags folders
// @Accept json
// @Produce json
// @Param folderId path string true "Folder ID"
// @Param payload body object{name=string,color=string} true "New folder name and/or color"
// @Success 200
// @Failure 400 {object} map[string]string "Invalid user ID or folder ID"
// @Failure 404 {object} map[string]string "Folder not found"
// @Failure 500 {object} map[string]string "Failed to update folder"
// @Router /user/folders/{folderId} [patch]
func UpdateFolder(c *gin.Context) {
	var body struct {
		Name  *string `json:"name"`
		Color *string `json:"color"`
	}

	if err := c.ShouldBindJSON(&body); err != nil {
		c.JSON(http.StatusBadRequest, gin.H{"error": err.Error()})
		return
	}

	accountUserID, ok := folderAccountUserID(c)
	if !ok {
		return
	}
	repository := postgresRepository(c)
	if repository == nil {
		return
	}

	err := repository.UpdateFolder(c.Request.Context(), c.Param("folderId"), accountUserID, body.Name, body.Color)
	if errors.Is(err, pgx.ErrNoRows) {
		c.JSON(http.StatusNotFound, gin.H{"error": "Folder not found"})
		return
	}
	if err != nil {
		c.JSON(http.StatusInternalServerError, gin.H{"error": "Failed to update folder"})
		return
	}

	c.Status(http.StatusOK)
}

// @Summary Delete a folder
// @Tags folders
// @Produce json
// @Param folderId path string true "Folder ID"
// @Success 200
// @Failure 400 {object} map[string]string "Invalid user ID or folder ID"
// @Failure 404 {object} map[string]string "Folder not found"
// @Failure 500 {object} map[string]string "Failed to delete folder"
// @Router /user/folders/{folderId} [delete]
func DeleteFolder(c *gin.Context) {
	accountUserID, ok := folderAccountUserID(c)
	if !ok {
		return
	}
	repository := postgresRepository(c)
	if repository == nil {
		return
	}

	legacyEventIDs, err := repository.DeleteFolder(c.Request.Context(), c.Param("folderId"), accountUserID)
	if errors.Is(err, pgx.ErrNoRows) {
		c.JSON(http.StatusNotFound, gin.H{"error": "Folder not found"})
		return
	}
	if err != nil {
		c.JSON(http.StatusInternalServerError, gin.H{"error": "Failed to delete folder"})
		return
	}

	// Legacy MongoDB member events remain outside PostgreSQL authority; release
	// the account's own events that were in the deleted folder.
	if ownerObjectID, err := primitive.ObjectIDFromHex(accountUserID); err == nil {
		objectIDs := make([]primitive.ObjectID, 0, len(legacyEventIDs))
		for _, legacyEventID := range legacyEventIDs {
			if objectID, err := primitive.ObjectIDFromHex(legacyEventID); err == nil {
				objectIDs = append(objectIDs, objectID)
			}
		}
		if err := db.MarkOwnedEventsDeleted(objectIDs, ownerObjectID); err != nil {
			logger.StdErr.Println(err)
		}
	}

	c.Status(http.StatusOK)
}

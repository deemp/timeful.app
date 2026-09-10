package main

import (
	"context"
	"fmt"
	"time"

	"github.com/jackc/pgx/v5"
	"go.mongodb.org/mongo-driver/bson"
	"go.mongodb.org/mongo-driver/bson/primitive"
	"go.mongodb.org/mongo-driver/mongo/options"

	"timeful/server/models"
)

// folderMembership is one prepared folder/event reference.
type folderMembership struct {
	legacyID       string
	accountUserID  string
	eventLegacyID  string
	eventTargetID  string
	hasEventTarget bool
	createdAt      time.Time
}

// unitFolder is one folder aggregate prepared for migration.
type unitFolder struct {
	legacyID      string
	accountUserID string
	name          string
	color         *string
	isDeleted     *bool
	createdAt     time.Time
	updatedAt     time.Time
	memberships   []folderMembership
	quarantine    []quarantineRecord
}

// migrateFolders pages the legacy folders collection and migrates each folder
// with its memberships in one transaction. Membership event references are
// rewritten from legacy MongoDB identities to the migrated PostgreSQL identities
// recorded in the ledger.
func (m *migrator) migrateFolders(ctx context.Context, config configuration) (migrationSummary, error) {
	collection := m.database.Collection("folders")
	summary := migrationSummary{}
	var lastID primitive.ObjectID
	hasCursor := false
	for {
		cursor, err := collection.Find(ctx, pageFilter(lastID, hasCursor), options.Find().SetSort(bson.M{"_id": 1}).SetLimit(config.batchSize))
		if err != nil {
			return summary, err
		}
		folders := make([]models.Folder, 0, config.batchSize)
		if err := cursor.All(ctx, &folders); err != nil {
			cursor.Close(ctx)
			return summary, err
		}
		cursor.Close(ctx)
		if len(folders) == 0 {
			break
		}
		for index := range folders {
			folder := folders[index]
			summary.Scanned++
			legacyID := folder.Id.Hex()
			if _, completed, err := m.completedUnit(ctx, ledgerKindFolder, legacyID); err != nil {
				return summary, err
			} else if completed {
				summary.Skipped++
				lastID = folder.Id
				hasCursor = true
				continue
			}
			unit, err := m.buildFolderUnit(ctx, folder)
			if err != nil {
				return summary, fmt.Errorf("build folder %s: %w", legacyID, err)
			}
			summary.Quarantined += len(unit.quarantine)
			if m.apply {
				if err := m.persistFolderUnit(ctx, &unit); err != nil {
					return summary, fmt.Errorf("persist folder %s: %w", legacyID, err)
				}
			}
			summary.Migrated++
			lastID = folder.Id
			hasCursor = true
		}
		if int64(len(folders)) < config.batchSize {
			break
		}
	}
	return summary, nil
}

func (m *migrator) buildFolderUnit(ctx context.Context, folder models.Folder) (unitFolder, error) {
	unit := unitFolder{
		legacyID:      folder.Id.Hex(),
		accountUserID: folder.UserId.Hex(),
		name:          folder.Name,
		color:         folder.Color,
		isDeleted:     folder.IsDeleted,
		createdAt:     folder.Id.Timestamp().UTC(),
	}
	unit.updatedAt = unit.createdAt

	cursor, err := m.database.Collection("folderEvents").Find(ctx, bson.M{"folderId": folder.Id})
	if err != nil {
		return unit, err
	}
	defer cursor.Close(ctx)
	var memberships []models.FolderEvent
	if err := cursor.All(ctx, &memberships); err != nil {
		return unit, err
	}
	for index := range memberships {
		membership := memberships[index]
		accountUserID := membership.UserId.Hex()
		if membership.UserId.IsZero() {
			accountUserID = unit.accountUserID
		}
		eventLegacyID := membership.EventId.Hex()
		targetID, found, err := m.completedUnit(ctx, ledgerKindEvent, eventLegacyID)
		if err != nil {
			return unit, err
		}
		entry := folderMembership{
			legacyID:       membership.Id.Hex(),
			accountUserID:  accountUserID,
			eventLegacyID:  eventLegacyID,
			createdAt:      membership.Id.Timestamp().UTC(),
			eventTargetID:  targetID,
			hasEventTarget: found,
		}
		if !found {
			unit.quarantine = append(unit.quarantine, quarantineRecord{
				kind:          ledgerKindFolder,
				legacyID:      membership.Id.Hex(),
				eventLegacyID: eventLegacyID,
				reason:        reasonOrphanMembership,
				detail:        "folder membership references an unmigrated event " + eventLegacyID,
			})
		}
		unit.memberships = append(unit.memberships, entry)
	}
	return unit, nil
}

func (m *migrator) persistFolderUnit(ctx context.Context, unit *unitFolder) error {
	tx, err := m.pool.Begin(ctx)
	if err != nil {
		return err
	}
	defer tx.Rollback(ctx)

	for _, record := range unit.quarantine {
		if err := m.recordQuarantine(ctx, tx, record.kind, record.legacyID, record.eventLegacyID, record.reason, record.detail); err != nil {
			return err
		}
	}

	var folderID string
	if err := tx.QueryRow(ctx, `INSERT INTO folders (account_user_id, name, color, is_deleted, created_at, updated_at)
VALUES ($1, $2, $3, $4, $5, $5)
RETURNING id`, unit.accountUserID, unit.name, unit.color, unit.isDeleted, unit.createdAt).Scan(&folderID); err != nil {
		return err
	}
	for _, membership := range unit.memberships {
		if !membership.hasEventTarget {
			continue
		}
		if err := insertFolderMembership(ctx, tx, folderID, membership); err != nil {
			return err
		}
	}
	if err := m.recordLedger(ctx, tx, ledgerKindFolder, unit.legacyID, folderID); err != nil {
		return err
	}
	return tx.Commit(ctx)
}

func insertFolderMembership(ctx context.Context, tx pgx.Tx, folderID string, membership folderMembership) error {
	_, err := tx.Exec(ctx, `INSERT INTO folder_events (account_user_id, folder_id, event_id, legacy_event_id, created_at)
VALUES ($1, $2, $3, NULL, $4)
ON CONFLICT DO NOTHING`, membership.accountUserID, folderID, membership.eventTargetID, membership.createdAt)
	return err
}

// scanOrphanResponses reports legacy responses whose event document is absent.
// They cannot be migrated because they have no aggregate to belong to.
func (m *migrator) scanOrphanResponses(ctx context.Context) (migrationSummary, error) {
	summary := migrationSummary{}
	cursor, err := m.database.Collection("eventResponses").Find(ctx, bson.M{})
	if err != nil {
		return summary, err
	}
	defer cursor.Close(ctx)
	for cursor.Next(ctx) {
		var response models.EventResponse
		if err := cursor.Decode(&response); err != nil {
			return summary, err
		}
		exists, err := m.eventExists(ctx, response.EventId)
		if err != nil {
			return summary, err
		}
		if exists {
			continue
		}
		summary.Quarantined++
		if !m.apply {
			continue
		}
		if err := m.recordQuarantine(ctx, m.pool, ledgerKindQuarantineItem, response.Id.Hex(), response.EventId.Hex(), reasonOrphanResponse, "response references an absent event"); err != nil {
			return summary, err
		}
	}
	return summary, cursor.Err()
}

func (m *migrator) eventExists(ctx context.Context, id primitive.ObjectID) (bool, error) {
	if id.IsZero() {
		return false, nil
	}
	count, err := m.database.Collection("events").CountDocuments(ctx, bson.M{"_id": id}, options.Count().SetLimit(1))
	if err != nil {
		return false, err
	}
	return count > 0, nil
}

package postgres

import (
	"context"
	"errors"
	"fmt"
	"strings"
	"time"

	"github.com/jackc/pgx/v5"
)

// Folder is an account-owned container for member events. ID is a hidden
// UUIDv7; AccountUserID is the legacy external account identifier held in
// platform_identities.external_user_id.
type Folder struct {
	ID            string
	AccountUserID string
	Name          string
	Color         *string
	IsDeleted     *bool
	CreatedAt     time.Time
	UpdatedAt     time.Time
	Members       []FolderMember
}

// FolderMember is one explicit event reference stored by folder_events. Exactly
// one of EventID (a PostgreSQL postgres_events.id) or LegacyEventID (a legacy
// MongoDB event _id) is populated. EventShortID is the Member event's public
// short identifier for a PostgreSQL member and is empty for a legacy member.
type FolderMember struct {
	EventID       *string
	LegacyEventID *string
	EventShortID  *string
}

const folderSelect = `SELECT f.id, f.account_user_id, f.name, f.color, f.is_deleted, f.created_at, f.updated_at,
       fe.event_id, fe.legacy_event_id, e.short_id
FROM folders f
LEFT JOIN folder_events fe ON fe.folder_id = f.id
LEFT JOIN postgres_events e ON e.id = fe.event_id`

// CreateFolder inserts an account-scoped folder and returns its hidden identity
// and timestamps.
func (r *Repository) CreateFolder(ctx context.Context, folder *Folder) error {
	if folder == nil || folder.AccountUserID == "" {
		return errors.New("folder account user ID is required")
	}
	return r.db.QueryRow(ctx, `INSERT INTO folders (account_user_id, name, color)
VALUES ($1, $2, $3)
RETURNING id, is_deleted, created_at, updated_at`, folder.AccountUserID, folder.Name, folder.Color).Scan(&folder.ID, &folder.IsDeleted, &folder.CreatedAt, &folder.UpdatedAt)
}

// ListFolders returns the account's non-deleted folders with their members. The
// account scope is enforced in the query, so another account's folders are
// never visible.
func (r *Repository) ListFolders(ctx context.Context, accountUserID string) ([]Folder, error) {
	if accountUserID == "" {
		return nil, errors.New("folder account user ID is required")
	}
	rows, err := r.db.Query(ctx, folderSelect+`
WHERE f.account_user_id = $1 AND f.is_deleted IS DISTINCT FROM TRUE
ORDER BY f.created_at, f.id, fe.created_at, fe.id`, accountUserID)
	if err != nil {
		return nil, err
	}
	return scanFolders(rows)
}

// GetFolderByID returns one account-scoped folder and its members. A missing or
// foreign folder is reported as pgx.ErrNoRows so the caller cannot distinguish
// non-existence from another account's folder.
func (r *Repository) GetFolderByID(ctx context.Context, folderID, accountUserID string) (*Folder, error) {
	if folderID == "" || accountUserID == "" {
		return nil, errors.New("folder ID and account user ID are required")
	}
	rows, err := r.db.Query(ctx, folderSelect+`
WHERE f.id = $1 AND f.account_user_id = $2 AND f.is_deleted IS DISTINCT FROM TRUE
ORDER BY fe.created_at, fe.id`, folderID, accountUserID)
	if err != nil {
		return nil, err
	}
	folders, err := scanFolders(rows)
	if err != nil {
		return nil, err
	}
	if len(folders) == 0 {
		return nil, pgx.ErrNoRows
	}
	return &folders[0], nil
}

// UpdateFolder writes only the supplied fields for one account-scoped folder. A
// missing or foreign folder is reported as pgx.ErrNoRows.
func (r *Repository) UpdateFolder(ctx context.Context, folderID, accountUserID string, name, color *string) error {
	if folderID == "" || accountUserID == "" {
		return errors.New("folder ID and account user ID are required")
	}
	sets := []string{}
	args := []any{folderID, accountUserID}
	if name != nil {
		args = append(args, *name)
		sets = append(sets, fmt.Sprintf("name = $%d", len(args)))
	}
	if color != nil {
		args = append(args, *color)
		sets = append(sets, fmt.Sprintf("color = $%d", len(args)))
	}
	if len(sets) == 0 {
		var exists bool
		if err := r.db.QueryRow(ctx, `SELECT EXISTS (SELECT 1 FROM folders
WHERE id = $1 AND account_user_id = $2 AND is_deleted IS DISTINCT FROM TRUE)`, folderID, accountUserID).Scan(&exists); err != nil {
			return err
		}
		if !exists {
			return pgx.ErrNoRows
		}
		return nil
	}
	sets = append(sets, "updated_at = clock_timestamp()")
	var id string
	return r.db.QueryRow(ctx, `UPDATE folders SET `+strings.Join(sets, ", ")+`
WHERE id = $1 AND account_user_id = $2 AND is_deleted IS DISTINCT FROM TRUE
RETURNING id`, args...).Scan(&id)
}

// DeleteFolder soft-deletes one account-scoped folder, soft-deletes the
// account's own PostgreSQL member events, and removes the memberships. It
// returns the legacy MongoDB event identifiers that were members so the caller
// can release the account's legacy events in MongoDB; those references are
// outside PostgreSQL authority.
func (r *Repository) DeleteFolder(ctx context.Context, folderID, accountUserID string) ([]string, error) {
	if folderID == "" || accountUserID == "" {
		return nil, errors.New("folder ID and account user ID are required")
	}
	legacyEventIDs := []string{}
	err := r.withTransaction(ctx, func(ctx context.Context, tx *Repository) error {
		var id string
		if err := tx.db.QueryRow(ctx, `UPDATE folders SET is_deleted = TRUE, updated_at = clock_timestamp()
WHERE id = $1 AND account_user_id = $2 AND is_deleted IS DISTINCT FROM TRUE
RETURNING id`, folderID, accountUserID).Scan(&id); err != nil {
			return err
		}
		if _, err := tx.db.Exec(ctx, `UPDATE postgres_events SET is_deleted = TRUE, updated_at = clock_timestamp()
WHERE id IN (
    SELECT fe.event_id FROM folder_events fe
    WHERE fe.folder_id = $1 AND fe.account_user_id = $2 AND fe.event_id IS NOT NULL
)
AND (
    owner_external_id = $2
    OR owner_platform_identity_id = (SELECT id FROM platform_identities WHERE external_user_id = $2)
)`, folderID, accountUserID); err != nil {
			return err
		}
		rows, err := tx.db.Query(ctx, `SELECT legacy_event_id FROM folder_events
WHERE folder_id = $1 AND account_user_id = $2 AND legacy_event_id IS NOT NULL
ORDER BY legacy_event_id`, folderID, accountUserID)
		if err != nil {
			return err
		}
		for rows.Next() {
			var legacyEventID string
			if err := rows.Scan(&legacyEventID); err != nil {
				rows.Close()
				return err
			}
			legacyEventIDs = append(legacyEventIDs, legacyEventID)
		}
		rows.Close()
		if err := rows.Err(); err != nil {
			return err
		}
		_, err = tx.db.Exec(ctx, `DELETE FROM folder_events WHERE folder_id = $1 AND account_user_id = $2`, folderID, accountUserID)
		return err
	})
	if err != nil {
		return nil, err
	}
	return legacyEventIDs, nil
}

// AssignEventToFolder moves one explicit event reference into an account-scoped
// folder, or removes it when folderID is nil. A given account holds at most one
// membership per event because the existing membership is deleted before the
// new one is inserted in the same transaction.
func (r *Repository) AssignEventToFolder(ctx context.Context, accountUserID string, folderID *string, member FolderMember) error {
	if accountUserID == "" {
		return errors.New("folder account user ID is required")
	}
	if (member.EventID == nil) == (member.LegacyEventID == nil) {
		return errors.New("exactly one event reference is required")
	}
	return r.withTransaction(ctx, func(ctx context.Context, tx *Repository) error {
		if member.EventID != nil {
			if _, err := tx.db.Exec(ctx, `DELETE FROM folder_events WHERE account_user_id = $1 AND event_id = $2`, accountUserID, *member.EventID); err != nil {
				return err
			}
		} else {
			if _, err := tx.db.Exec(ctx, `DELETE FROM folder_events WHERE account_user_id = $1 AND legacy_event_id = $2`, accountUserID, *member.LegacyEventID); err != nil {
				return err
			}
		}
		if folderID == nil {
			return nil
		}
		var exists bool
		if err := tx.db.QueryRow(ctx, `SELECT EXISTS (SELECT 1 FROM folders
WHERE id = $1 AND account_user_id = $2 AND is_deleted IS DISTINCT FROM TRUE)`, *folderID, accountUserID).Scan(&exists); err != nil {
			return err
		}
		if !exists {
			return pgx.ErrNoRows
		}
		_, err := tx.db.Exec(ctx, `INSERT INTO folder_events (account_user_id, folder_id, event_id, legacy_event_id)
VALUES ($1, $2, $3, $4)`, accountUserID, *folderID, member.EventID, member.LegacyEventID)
		return err
	})
}

func scanFolders(rows pgx.Rows) ([]Folder, error) {
	defer rows.Close()
	folders := []Folder{}
	indexByID := map[string]int{}
	for rows.Next() {
		var (
			folder                          Folder
			eventID, legacyEventID, shortID *string
		)
		if err := rows.Scan(&folder.ID, &folder.AccountUserID, &folder.Name, &folder.Color, &folder.IsDeleted, &folder.CreatedAt, &folder.UpdatedAt, &eventID, &legacyEventID, &shortID); err != nil {
			return nil, err
		}
		index, ok := indexByID[folder.ID]
		if !ok {
			folder.Members = []FolderMember{}
			folders = append(folders, folder)
			index = len(folders) - 1
			indexByID[folder.ID] = index
		}
		if eventID != nil || legacyEventID != nil {
			folders[index].Members = append(folders[index].Members, FolderMember{EventID: eventID, LegacyEventID: legacyEventID, EventShortID: shortID})
		}
	}
	return folders, rows.Err()
}

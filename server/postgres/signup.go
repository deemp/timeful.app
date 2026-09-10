package postgres

import (
	"context"
	"errors"
	"fmt"
	"strings"
	"time"

	"github.com/jackc/pgx/v5"

	"timeful/server/respondents"
)

// ErrSignupCapacityExceeded reports that at least one requested block is already
// at capacity. The mutation is rejected atomically, so no partial response or
// block membership is written.
var ErrSignupCapacityExceeded = errors.New("signup block capacity exceeded")

// ErrSignupBlockNotFound reports that a requested block does not belong to the
// signup form event.
var ErrSignupBlockNotFound = errors.New("signup block does not belong to the event")

// SignupBlock is one ordered, capacity-limited slot on a signup form event. ID
// is a fresh PostgreSQL UUIDv7 that replaces the legacy MongoDB block
// identifier. Capacity is nil when the block is unlimited. Position preserves
// the legacy block array order.
type SignupBlock struct {
	ID        string
	EventID   string
	Name      string
	Capacity  *int
	StartDate *time.Time
	EndDate   *time.Time
	Position  int
	CreatedAt time.Time
	UpdatedAt time.Time
}

const signupBlockColumns = `id, event_id, name, capacity, start_date, end_date, position, created_at, updated_at`

func scanSignupBlock(row interface{ Scan(...any) error }) (*SignupBlock, error) {
	block := &SignupBlock{}
	err := row.Scan(&block.ID, &block.EventID, &block.Name, &block.Capacity, &block.StartDate, &block.EndDate, &block.Position, &block.CreatedAt, &block.UpdatedAt)
	if err != nil {
		return nil, err
	}
	return block, nil
}

// SignupResponse is one respondent's signup on a signup form event. PublicID is
// the opaque identifier exposed to clients; ID and the owning Event Visitor
// Identity stay internal. AccountUserID or CanonicalGuestName identifies the
// respondent, matching the legacy account-hex-or-canonical-guest-name key.
// BlockIDs holds the claimed event_signup_blocks identities.
type SignupResponse struct {
	ID                     string
	PublicID               string
	EventID                string
	EventVisitorIdentityID string
	RespondentKind         string
	AccountUserID          *string
	CanonicalGuestName     *string
	Name                   string
	Email                  string
	BlockIDs               []string
	CreatedAt              time.Time
	UpdatedAt              time.Time
}

const signupResponseColumns = `id, public_id, event_id, event_visitor_identity_id, respondent_kind, account_user_id, canonical_guest_name, name, email, block_ids, created_at, updated_at`

func scanSignupResponse(row interface{ Scan(...any) error }) (*SignupResponse, error) {
	response := &SignupResponse{}
	err := row.Scan(&response.ID, &response.PublicID, &response.EventID, &response.EventVisitorIdentityID, &response.RespondentKind, &response.AccountUserID, &response.CanonicalGuestName, &response.Name, &response.Email, &response.BlockIDs, &response.CreatedAt, &response.UpdatedAt)
	if err != nil {
		return nil, err
	}
	return response, nil
}

// CreateSignupBlock appends one block to a signup form event. A non-positive
// position appends after the existing blocks. The event row is locked so a
// concurrent replace or signup cannot interleave block ordering.
func (r *Repository) CreateSignupBlock(ctx context.Context, block *SignupBlock) error {
	if block == nil || block.EventID == "" {
		return errors.New("signup block event ID is required")
	}
	if block.Name == "" {
		return errors.New("signup block name is required")
	}
	if block.Capacity != nil && *block.Capacity < 0 {
		return errors.New("signup block capacity must not be negative")
	}
	return r.withTransaction(ctx, func(ctx context.Context, tx *Repository) error {
		if _, err := tx.LockEvent(ctx, block.EventID); err != nil {
			return err
		}
		return tx.db.QueryRow(ctx, `INSERT INTO event_signup_blocks (event_id, name, capacity, start_date, end_date, position)
VALUES ($1, $2, $3, $4, $5, CASE WHEN $6 > 0 THEN $6 ELSE (SELECT COALESCE(MAX(position), 0) + 1 FROM event_signup_blocks WHERE event_id = $1) END)
RETURNING `+signupBlockColumns, block.EventID, block.Name, block.Capacity, block.StartDate, block.EndDate, block.Position).
			Scan(&block.ID, &block.EventID, &block.Name, &block.Capacity, &block.StartDate, &block.EndDate, &block.Position, &block.CreatedAt, &block.UpdatedAt)
	})
}

// ReplaceSignupBlocks writes the supplied blocks as the complete ordered block
// set for an event. A block with an ID must belong to the event and keeps its
// identity and response memberships; a block without an ID is inserted.
// Removed blocks are deleted and their identities are detached from every
// response in the same transaction, so the block/response relation never
// dangles. The event row is locked for the duration.
func (r *Repository) ReplaceSignupBlocks(ctx context.Context, eventID string, blocks []SignupBlock) ([]SignupBlock, error) {
	if eventID == "" {
		return nil, errors.New("signup block event ID is required")
	}
	stored := []SignupBlock{}
	err := r.withTransaction(ctx, func(ctx context.Context, tx *Repository) error {
		if _, err := tx.LockEvent(ctx, eventID); err != nil {
			return err
		}
		keepIDs := make([]string, 0, len(blocks))
		for i := range blocks {
			if blocks[i].Capacity != nil && *blocks[i].Capacity < 0 {
				return errors.New("signup block capacity must not be negative")
			}
			if blocks[i].ID != "" {
				keepIDs = append(keepIDs, blocks[i].ID)
			}
		}
		removed := []string{}
		rows, err := tx.db.Query(ctx, `SELECT id::text FROM event_signup_blocks
WHERE event_id = $1 AND id::text <> ALL($2)`, eventID, keepIDs)
		if err != nil {
			return err
		}
		for rows.Next() {
			var id string
			if err := rows.Scan(&id); err != nil {
				rows.Close()
				return err
			}
			removed = append(removed, id)
		}
		rows.Close()
		if err := rows.Err(); err != nil {
			return err
		}
		if len(removed) > 0 {
			if _, err := tx.db.Exec(ctx, `UPDATE event_signup_responses
SET block_ids = ARRAY(SELECT b FROM unnest(block_ids) AS b WHERE b <> ALL($2)), updated_at = clock_timestamp()
WHERE event_id = $1 AND block_ids && $2`, eventID, removed); err != nil {
				return err
			}
			if _, err := tx.db.Exec(ctx, `DELETE FROM event_signup_blocks
WHERE event_id = $1 AND id::text = ANY($2)`, eventID, removed); err != nil {
				return err
			}
		}
		for i := range blocks {
			block := &blocks[i]
			position := i + 1
			if block.ID == "" {
				if _, err := tx.db.Exec(ctx, `INSERT INTO event_signup_blocks (event_id, name, capacity, start_date, end_date, position)
VALUES ($1, $2, $3, $4, $5, $6)`, eventID, block.Name, block.Capacity, block.StartDate, block.EndDate, position); err != nil {
					return err
				}
				continue
			}
			tag, err := tx.db.Exec(ctx, `UPDATE event_signup_blocks
SET name = $3, capacity = $4, start_date = $5, end_date = $6, position = $7, updated_at = clock_timestamp()
WHERE id = $1 AND event_id = $2`, block.ID, eventID, block.Name, block.Capacity, block.StartDate, block.EndDate, position)
			if err != nil {
				return err
			}
			if tag.RowsAffected() == 0 {
				return pgx.ErrNoRows
			}
		}
		list, err := tx.ListSignupBlocks(ctx, eventID)
		if err != nil {
			return err
		}
		stored = list
		return nil
	})
	if err != nil {
		return nil, err
	}
	return stored, nil
}

// ListSignupBlocks returns the event's blocks in their stored order.
func (r *Repository) ListSignupBlocks(ctx context.Context, eventID string) ([]SignupBlock, error) {
	if eventID == "" {
		return nil, errors.New("signup block event ID is required")
	}
	rows, err := r.db.Query(ctx, `SELECT `+signupBlockColumns+`
FROM event_signup_blocks WHERE event_id = $1 ORDER BY position, created_at, id`, eventID)
	if err != nil {
		return nil, err
	}
	defer rows.Close()
	blocks := []SignupBlock{}
	for rows.Next() {
		block, err := scanSignupBlock(rows)
		if err != nil {
			return nil, err
		}
		blocks = append(blocks, *block)
	}
	return blocks, rows.Err()
}

// CreateSignupResponse inserts one response for an Event Visitor Identity. The
// respondent identity is inferred when RespondentKind is empty. Guest names are
// canonicalized through the shared respondents normalizer; a duplicate canonical
// guest name or account response surfaces as a unique violation. Capacity is
// reserved atomically under the event row lock, so an over-capacity signup is
// rejected before any row is written.
func (r *Repository) CreateSignupResponse(ctx context.Context, response *SignupResponse) error {
	if response == nil || response.EventID == "" {
		return errors.New("signup response event ID is required")
	}
	if response.EventVisitorIdentityID == "" {
		return errors.New("signup response event visitor identity is required")
	}
	if err := normalizeSignupResponseIdentity(response); err != nil {
		return err
	}
	blockIDs := normalizeSignupBlockIDs(response.BlockIDs)
	return r.withTransaction(ctx, func(ctx context.Context, tx *Repository) error {
		if _, err := tx.LockEvent(ctx, response.EventID); err != nil {
			return err
		}
		if err := tx.reserveSignupCapacity(ctx, response.EventID, blockIDs, ""); err != nil {
			return err
		}
		return tx.db.QueryRow(ctx, `INSERT INTO event_signup_responses
 (event_id, event_visitor_identity_id, respondent_kind, account_user_id, canonical_guest_name, name, email, block_ids)
 VALUES ($1, $2, $3, $4, $5, $6, $7, $8)
 RETURNING `+signupResponseColumns,
			response.EventID, response.EventVisitorIdentityID, response.RespondentKind, response.AccountUserID, response.CanonicalGuestName, response.Name, response.Email, blockIDs).
			Scan(&response.ID, &response.PublicID, &response.EventID, &response.EventVisitorIdentityID, &response.RespondentKind, &response.AccountUserID, &response.CanonicalGuestName, &response.Name, &response.Email, &response.BlockIDs, &response.CreatedAt, &response.UpdatedAt)
	})
}

// GetSignupResponseByPublicID resolves one response by its opaque public
// identifier within an event.
func (r *Repository) GetSignupResponseByPublicID(ctx context.Context, eventID, publicID string) (*SignupResponse, error) {
	if eventID == "" || publicID == "" {
		return nil, errors.New("signup response event ID and public ID are required")
	}
	return scanSignupResponse(r.db.QueryRow(ctx, `SELECT `+signupResponseColumns+`
FROM event_signup_responses WHERE event_id = $1 AND public_id = $2`, eventID, publicID))
}

// ListSignupResponses returns every signup response for an event in write order.
func (r *Repository) ListSignupResponses(ctx context.Context, eventID string) ([]SignupResponse, error) {
	if eventID == "" {
		return nil, errors.New("signup response event ID is required")
	}
	rows, err := r.db.Query(ctx, `SELECT `+signupResponseColumns+`
FROM event_signup_responses WHERE event_id = $1 ORDER BY created_at, id`, eventID)
	if err != nil {
		return nil, err
	}
	defer rows.Close()
	responses := []SignupResponse{}
	for rows.Next() {
		response, err := scanSignupResponse(rows)
		if err != nil {
			return nil, err
		}
		responses = append(responses, *response)
	}
	return responses, rows.Err()
}

// UpdateSignupResponse writes the respondent identity, name, email, and block
// membership for one response selected by internal ID or opaque public ID. The
// existing row is excluded from the capacity count, so re-saving a response
// never consumes an extra seat. The event row is locked, keeping capacity
// reservation atomic.
func (r *Repository) UpdateSignupResponse(ctx context.Context, response *SignupResponse) error {
	if response == nil || response.EventID == "" {
		return errors.New("signup response event ID is required")
	}
	if response.ID == "" && response.PublicID == "" {
		return errors.New("signup response ID is required")
	}
	if err := normalizeSignupResponseIdentity(response); err != nil {
		return err
	}
	blockIDs := normalizeSignupBlockIDs(response.BlockIDs)
	return r.withTransaction(ctx, func(ctx context.Context, tx *Repository) error {
		if _, err := tx.LockEvent(ctx, response.EventID); err != nil {
			return err
		}
		var responseID string
		var err error
		if response.ID != "" {
			err = tx.db.QueryRow(ctx, `SELECT id FROM event_signup_responses
WHERE id = $1 AND event_id = $2`, response.ID, response.EventID).Scan(&responseID)
		} else {
			err = tx.db.QueryRow(ctx, `SELECT id FROM event_signup_responses
WHERE public_id = $1 AND event_id = $2`, response.PublicID, response.EventID).Scan(&responseID)
		}
		if err != nil {
			return err
		}
		if err := tx.reserveSignupCapacity(ctx, response.EventID, blockIDs, responseID); err != nil {
			return err
		}
		return tx.db.QueryRow(ctx, `UPDATE event_signup_responses
SET respondent_kind = $2, account_user_id = $3, canonical_guest_name = $4, name = $5, email = $6, block_ids = $7, updated_at = clock_timestamp()
WHERE id = $1
RETURNING `+signupResponseColumns,
			responseID, response.RespondentKind, response.AccountUserID, response.CanonicalGuestName, response.Name, response.Email, blockIDs).
			Scan(&response.ID, &response.PublicID, &response.EventID, &response.EventVisitorIdentityID, &response.RespondentKind, &response.AccountUserID, &response.CanonicalGuestName, &response.Name, &response.Email, &response.BlockIDs, &response.CreatedAt, &response.UpdatedAt)
	})
}

// DeleteSignupResponse removes one response selected by opaque public ID. The
// event row is locked so a deletion cannot interleave with a capacity
// reservation. A missing response is reported as pgx.ErrNoRows.
func (r *Repository) DeleteSignupResponse(ctx context.Context, eventID, publicID string) error {
	if eventID == "" || publicID == "" {
		return errors.New("signup response event ID and public ID are required")
	}
	return r.withTransaction(ctx, func(ctx context.Context, tx *Repository) error {
		if _, err := tx.LockEvent(ctx, eventID); err != nil {
			return err
		}
		tag, err := tx.db.Exec(ctx, `DELETE FROM event_signup_responses
WHERE event_id = $1 AND public_id = $2`, eventID, publicID)
		if err != nil {
			return err
		}
		if tag.RowsAffected() == 0 {
			return pgx.ErrNoRows
		}
		return nil
	})
}

// reserveSignupCapacity verifies every requested block belongs to the event and
// that no limited block is already at capacity, excluding the response being
// rewritten. It must run inside the transaction that holds the event row lock,
// which serializes concurrent reservations for the event.
func (r *Repository) reserveSignupCapacity(ctx context.Context, eventID string, blockIDs []string, excludeResponseID string) error {
	if len(blockIDs) == 0 {
		return nil
	}
	rows, err := r.db.Query(ctx, `SELECT id::text, capacity FROM event_signup_blocks
WHERE event_id = $1 AND id::text = ANY($2)`, eventID, blockIDs)
	if err != nil {
		return err
	}
	capacities := make(map[string]*int, len(blockIDs))
	for rows.Next() {
		var id string
		var capacity *int
		if err := rows.Scan(&id, &capacity); err != nil {
			rows.Close()
			return err
		}
		capacities[id] = capacity
	}
	rows.Close()
	if err := rows.Err(); err != nil {
		return err
	}
	if len(capacities) != len(blockIDs) {
		return ErrSignupBlockNotFound
	}
	for _, blockID := range blockIDs {
		capacity := capacities[blockID]
		if capacity == nil {
			continue
		}
		var claimed int
		if excludeResponseID != "" {
			if err := r.db.QueryRow(ctx, `SELECT count(*) FROM event_signup_responses
WHERE event_id = $1 AND $2 = ANY(block_ids) AND id::text <> $3`, eventID, blockID, excludeResponseID).Scan(&claimed); err != nil {
				return err
			}
		} else {
			if err := r.db.QueryRow(ctx, `SELECT count(*) FROM event_signup_responses
WHERE event_id = $1 AND $2 = ANY(block_ids)`, eventID, blockID).Scan(&claimed); err != nil {
				return err
			}
		}
		if claimed >= *capacity {
			return ErrSignupCapacityExceeded
		}
	}
	return nil
}

// normalizeSignupResponseIdentity resolves the respondent kind and enforces the
// identity rules: account responses carry an account user ID, and guest
// responses carry a canonical guest name produced by the shared normalizer.
func normalizeSignupResponseIdentity(response *SignupResponse) error {
	switch response.RespondentKind {
	case RespondentKindAccount, RespondentKindGuest:
	case "":
		if response.AccountUserID != nil && *response.AccountUserID != "" {
			response.RespondentKind = RespondentKindAccount
		} else {
			response.RespondentKind = RespondentKindGuest
		}
	default:
		return fmt.Errorf("unsupported signup respondent kind %q", response.RespondentKind)
	}
	if response.RespondentKind == RespondentKindAccount {
		if response.AccountUserID == nil || *response.AccountUserID == "" {
			return errors.New("account signup response requires an account user ID")
		}
		response.CanonicalGuestName = nil
		return nil
	}
	response.AccountUserID = nil
	guestName := response.Name
	if guestName == "" && response.CanonicalGuestName != nil {
		guestName = *response.CanonicalGuestName
	}
	canonical := respondents.NormalizeGuestName(guestName)
	if canonical == "" {
		return errors.New("guest signup response requires a name")
	}
	response.Name = canonical
	response.CanonicalGuestName = &canonical
	return nil
}

// normalizeSignupBlockIDs trims, drops empty entries, and deduplicates block
// identities so a response cannot claim the same block twice.
func normalizeSignupBlockIDs(blockIDs []string) []string {
	seen := make(map[string]struct{}, len(blockIDs))
	result := make([]string, 0, len(blockIDs))
	for _, blockID := range blockIDs {
		blockID = strings.TrimSpace(blockID)
		if blockID == "" {
			continue
		}
		if _, ok := seen[blockID]; ok {
			continue
		}
		seen[blockID] = struct{}{}
		result = append(result, blockID)
	}
	return result
}

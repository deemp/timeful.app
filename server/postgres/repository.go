package postgres

import (
	"context"
	"crypto/rand"
	"errors"
	"fmt"

	"github.com/jackc/pgx/v5"
	"github.com/jackc/pgx/v5/pgconn"
	"github.com/jackc/pgx/v5/pgxpool"
)

const (
	crockfordBase32 = "0123456789ABCDEFGHJKMNPQRSTVWXYZ"
)

var ErrPoolUninitialized = errors.New("postgresql pool is not initialized")

type dbtx interface {
	Exec(context.Context, string, ...any) (pgconn.CommandTag, error)
	Query(context.Context, string, ...any) (pgx.Rows, error)
	QueryRow(context.Context, string, ...any) pgx.Row
}

// Repository persists PostgreSQL-owned compatibility events and responses.
// A transaction callback receives a repository bound to the same transaction.
type Repository struct {
	db dbtx
}

func NewRepository(pool *pgxpool.Pool) *Repository {
	return &Repository{db: pool}
}

// DefaultRepository uses the package-global pool initialized by Init.
func DefaultRepository() (*Repository, error) {
	if Pool == nil {
		return nil, ErrPoolUninitialized
	}
	return NewRepository(Pool), nil
}

func (r *Repository) WithTransaction(ctx context.Context, fn func(context.Context, *Repository) error) error {
	pool, ok := r.db.(*pgxpool.Pool)
	if !ok {
		return errors.New("repository is already transaction-scoped")
	}
	tx, err := pool.BeginTx(ctx, pgx.TxOptions{})
	if err != nil {
		return err
	}
	defer tx.Rollback(ctx) // A successful commit makes this a no-op.
	if err := fn(ctx, &Repository{db: tx}); err != nil {
		return err
	}
	return tx.Commit(ctx)
}

// WithTransaction runs fn against the package-global pool in one transaction.
func WithTransaction(ctx context.Context, fn func(context.Context, *Repository) error) error {
	repository, err := DefaultRepository()
	if err != nil {
		return err
	}
	return repository.WithTransaction(ctx, fn)
}

func GenerateShortID() (string, error) {
	var value [5]byte
	if _, err := rand.Read(value[:]); err != nil {
		return "", fmt.Errorf("generate short event ID: %w", err)
	}
	return encodeCrockford(value[:], 8), nil
}

func GenerateEventShortID() (string, error) { return GenerateShortID() }

func encodeCrockford(value []byte, length int) string {
	result := make([]byte, length)
	var buffer uint64
	bits := uint(0)
	index := 0
	for _, b := range value {
		buffer = buffer<<8 | uint64(b)
		bits += 8
		for bits >= 5 && index < length {
			bits -= 5
			result[index] = crockfordBase32[(buffer>>bits)&31]
			index++
		}
	}
	if index < length && bits > 0 {
		result[index] = crockfordBase32[(buffer<<(5-bits))&31]
	}
	return string(result)
}

func (r *Repository) CreateEvent(ctx context.Context, event *Event) error {
	if event == nil {
		return errors.New("event is nil")
	}
	payload, err := encodePayload(event.Payload)
	if err != nil {
		return err
	}
	if event.ScheduleVersion == 0 {
		event.ScheduleVersion = 1
	}
	for attempt := 0; attempt < 5; attempt++ {
		generatedShortID := event.ShortID == ""
		if event.ShortID == "" {
			event.ShortID, err = GenerateShortID()
			if err != nil {
				return err
			}
		}
		err = r.db.QueryRow(ctx, `INSERT INTO postgres_events (short_id, owner_external_id, name, type, is_archived, is_deleted, num_responses, schedule_version, creator_posthog_id, payload)
VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10)
RETURNING id, created_at, updated_at`, event.ShortID, event.OwnerExternalID, event.Name, event.Type, event.IsArchived, event.IsDeleted, event.NumResponses, event.ScheduleVersion, event.CreatorPosthogID, payload).Scan(&event.ID, &event.CreatedAt, &event.UpdatedAt)
		if err == nil || !isUniqueViolation(err) || !generatedShortID {
			event.Payload = decodePayload(payload)
			return err
		}
		event.ShortID = ""
	}
	return errors.New("generate unique event identifiers")
}

func (r *Repository) GetEventByShortID(ctx context.Context, shortID string) (*Event, error) {
	return r.getEvent(ctx, "short_id", shortID)
}

func (r *Repository) GetEventByID(ctx context.Context, id string) (*Event, error) {
	return r.getEvent(ctx, "id", id)
}

func (r *Repository) getEvent(ctx context.Context, column, value string) (*Event, error) {
	event := &Event{}
	err := r.db.QueryRow(ctx, `SELECT id, short_id, owner_edit_token_hash, owner_platform_identity_id, owner_event_visitor_identity_id, owner_external_id, name, type, is_archived, is_deleted, num_responses, schedule_version, creator_posthog_id, created_at, updated_at, payload FROM postgres_events WHERE `+column+` = $1`, value).Scan(&event.ID, &event.ShortID, &event.OwnerEditTokenHash, &event.OwnerPlatformIdentityID, &event.OwnerEventVisitorIdentityID, &event.OwnerExternalID, &event.Name, &event.Type, &event.IsArchived, &event.IsDeleted, &event.NumResponses, &event.ScheduleVersion, &event.CreatorPosthogID, &event.CreatedAt, &event.UpdatedAt, &event.Payload)
	if err != nil {
		return nil, err
	}
	event.Payload = decodePayload(event.Payload)
	return event, nil
}

func (r *Repository) UpdateEvent(ctx context.Context, event *Event) error {
	if event == nil || event.ID == "" {
		return errors.New("event ID is required")
	}
	payload, err := encodePayload(event.Payload)
	if err != nil {
		return err
	}
	err = r.db.QueryRow(ctx, `UPDATE postgres_events SET owner_external_id = $2, name = $3, type = $4, is_archived = $5, is_deleted = $6, num_responses = $7, schedule_version = $8, creator_posthog_id = $9, payload = $10, owner_event_visitor_identity_id = $11, updated_at = clock_timestamp() WHERE id = $1 RETURNING updated_at`, event.ID, event.OwnerExternalID, event.Name, event.Type, event.IsArchived, event.IsDeleted, event.NumResponses, event.ScheduleVersion, event.CreatorPosthogID, payload, event.OwnerEventVisitorIdentityID).Scan(&event.UpdatedAt)
	if err != nil {
		return err
	}
	event.Payload = decodePayload(payload)
	return nil
}

func (r *Repository) CreateResponse(ctx context.Context, response *Response) error {
	if response == nil || response.EventID == "" {
		return errors.New("response event ID is required")
	}
	payload, err := encodePayload(response.Payload)
	if err != nil {
		return err
	}
	err = r.db.QueryRow(ctx, `INSERT INTO postgres_event_responses (event_id, event_visitor_identity_id, respondent_kind, account_user_id, guest_id, canonical_guest_name, guest_edit_policy, guest_ownership_mode, guest_edit_token, payload)
VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10) RETURNING id, public_id, created_at, updated_at`, response.EventID, response.EventVisitorIdentityID, response.RespondentKind, response.AccountUserID, response.GuestID, response.CanonicalGuestName, response.GuestEditPolicy, response.GuestOwnershipMode, response.GuestEditToken, payload).Scan(&response.ID, &response.PublicID, &response.CreatedAt, &response.UpdatedAt)
	if err == nil {
		response.Payload = decodePayload(payload)
	}
	return err
}

func (r *Repository) GetResponseByID(ctx context.Context, id string) (*Response, error) {
	return r.getResponse(ctx, `id = $1`, id)
}

func (r *Repository) GetResponseByAccountUserID(ctx context.Context, eventID, accountUserID string) (*Response, error) {
	return r.getResponse(ctx, `event_id = $1 AND respondent_kind = 'account' AND account_user_id = $2`, eventID, accountUserID)
}

func (r *Repository) GetResponseByGuestID(ctx context.Context, eventID, guestID string) (*Response, error) {
	return r.getResponse(ctx, `event_id = $1 AND respondent_kind = 'guest' AND guest_id = $2`, eventID, guestID)
}

func (r *Repository) getResponse(ctx context.Context, predicate string, values ...any) (*Response, error) {
	response := &Response{}
	err := r.db.QueryRow(ctx, `SELECT id, public_id, event_visitor_identity_id, event_id, COALESCE(respondent_kind, ''), account_user_id, guest_id, canonical_guest_name, guest_edit_policy, guest_ownership_mode, guest_edit_token, payload, created_at, updated_at FROM postgres_event_responses WHERE `+predicate, values...).Scan(&response.ID, &response.PublicID, &response.EventVisitorIdentityID, &response.EventID, &response.RespondentKind, &response.AccountUserID, &response.GuestID, &response.CanonicalGuestName, &response.GuestEditPolicy, &response.GuestOwnershipMode, &response.GuestEditToken, &response.Payload, &response.CreatedAt, &response.UpdatedAt)
	if err != nil {
		return nil, err
	}
	response.Payload = decodePayload(response.Payload)
	return response, nil
}

func (r *Repository) ListResponses(ctx context.Context, eventID string) ([]Response, error) {
	rows, err := r.db.Query(ctx, `SELECT id, public_id, event_visitor_identity_id, event_id, COALESCE(respondent_kind, ''), account_user_id, guest_id, canonical_guest_name, guest_edit_policy, guest_ownership_mode, guest_edit_token, payload, created_at, updated_at FROM postgres_event_responses WHERE event_id = $1 ORDER BY created_at, id`, eventID)
	if err != nil {
		return nil, err
	}
	defer rows.Close()
	responses := []Response{}
	for rows.Next() {
		var response Response
		if err := rows.Scan(&response.ID, &response.PublicID, &response.EventVisitorIdentityID, &response.EventID, &response.RespondentKind, &response.AccountUserID, &response.GuestID, &response.CanonicalGuestName, &response.GuestEditPolicy, &response.GuestOwnershipMode, &response.GuestEditToken, &response.Payload, &response.CreatedAt, &response.UpdatedAt); err != nil {
			return nil, err
		}
		response.Payload = decodePayload(response.Payload)
		responses = append(responses, response)
	}
	return responses, rows.Err()
}

func (r *Repository) UpdateResponse(ctx context.Context, response *Response) error {
	if response == nil || response.ID == "" {
		return errors.New("response ID is required")
	}
	payload, err := encodePayload(response.Payload)
	if err != nil {
		return err
	}
	err = r.db.QueryRow(ctx, `UPDATE postgres_event_responses SET respondent_kind = $2, account_user_id = $3, guest_id = $4, canonical_guest_name = $5, guest_edit_policy = $6, guest_ownership_mode = $7, guest_edit_token = $8, payload = $9, updated_at = clock_timestamp() WHERE id = $1 RETURNING updated_at`, response.ID, response.RespondentKind, response.AccountUserID, response.GuestID, response.CanonicalGuestName, response.GuestEditPolicy, response.GuestOwnershipMode, response.GuestEditToken, payload).Scan(&response.UpdatedAt)
	if err != nil {
		return err
	}
	response.Payload = decodePayload(payload)
	return nil
}

// DeleteResponse removes one response by its hidden primary key.
func (r *Repository) DeleteResponse(ctx context.Context, id string) error {
	_, err := r.db.Exec(ctx, `DELETE FROM postgres_event_responses WHERE id = $1`, id)
	return err
}

// GetResponseByGuestName looks up a guest by its canonical display name.
func (r *Repository) GetResponseByGuestName(ctx context.Context, eventID, name string) (*Response, error) {
	return r.getResponse(ctx, `event_id = $1 AND respondent_kind = 'guest' AND canonical_guest_name = $2`, eventID, name)
}

func isUniqueViolation(err error) bool {
	var postgresError *pgconn.PgError
	return errors.As(err, &postgresError) && postgresError.Code == "23505"
}

// IsUniqueViolation reports PostgreSQL unique-index conflicts to route adapters.
func IsUniqueViolation(err error) bool { return isUniqueViolation(err) }

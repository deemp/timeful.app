package postgres

import (
	"context"
	"errors"
	"time"

	"github.com/jackc/pgx/v5"
)

// Attendee is one email-keyed group invitation. ID is a fresh PostgreSQL UUIDv7
// that replaces the legacy MongoDB attendee identity. AccountUserID is the
// resolved legacy external account identifier where an account with Email
// exists, and is nil when no such account exists or after that account is
// deleted. Declined is nil when the legacy document omitted it, which is
// distinct from an explicit false.
type Attendee struct {
	ID            string
	EventID       string
	Email         string
	AccountUserID *string
	Declined      *bool
	CreatedAt     time.Time
	UpdatedAt     time.Time
}

const attendeeColumns = `id, event_id, email, account_user_id, declined, created_at, updated_at`

func scanAttendee(row interface{ Scan(...any) error }) (*Attendee, error) {
	attendee := &Attendee{}
	err := row.Scan(&attendee.ID, &attendee.EventID, &attendee.Email, &attendee.AccountUserID, &attendee.Declined, &attendee.CreatedAt, &attendee.UpdatedAt)
	if err != nil {
		return nil, err
	}
	return attendee, nil
}

// AddAttendee inserts one email-keyed membership on a group event, resolving the
// email to a PostgreSQL account where one exists. Re-adding an existing email
// keeps the stored identity and decline state and only fills in a missing
// account resolution, so at most one membership exists per event and email.
func (r *Repository) AddAttendee(ctx context.Context, attendee *Attendee) error {
	if attendee == nil || attendee.EventID == "" {
		return errors.New("attendee event ID is required")
	}
	if attendee.Email == "" {
		return errors.New("attendee email is required")
	}
	accountUserID, err := r.resolveAttendeeAccount(ctx, attendee.Email)
	if err != nil {
		return err
	}
	return r.db.QueryRow(ctx, `INSERT INTO event_attendees (event_id, email, account_user_id, declined)
VALUES ($1, $2, $3, $4)
ON CONFLICT (event_id, email) DO UPDATE
SET account_user_id = COALESCE(event_attendees.account_user_id, EXCLUDED.account_user_id), updated_at = clock_timestamp()
RETURNING `+attendeeColumns,
		attendee.EventID, attendee.Email, accountUserID, attendee.Declined).
		Scan(&attendee.ID, &attendee.EventID, &attendee.Email, &attendee.AccountUserID, &attendee.Declined, &attendee.CreatedAt, &attendee.UpdatedAt)
}

// ListAttendees returns every email-keyed membership for a group event in write
// order.
func (r *Repository) ListAttendees(ctx context.Context, eventID string) ([]Attendee, error) {
	if eventID == "" {
		return nil, errors.New("attendee event ID is required")
	}
	rows, err := r.db.Query(ctx, `SELECT `+attendeeColumns+`
FROM event_attendees WHERE event_id = $1 ORDER BY created_at, id`, eventID)
	if err != nil {
		return nil, err
	}
	defer rows.Close()
	attendees := []Attendee{}
	for rows.Next() {
		attendee, err := scanAttendee(rows)
		if err != nil {
			return nil, err
		}
		attendees = append(attendees, *attendee)
	}
	return attendees, rows.Err()
}

// GetAttendeeByEmail resolves one membership by event and invitation email. A
// missing membership is reported as pgx.ErrNoRows.
func (r *Repository) GetAttendeeByEmail(ctx context.Context, eventID, email string) (*Attendee, error) {
	if eventID == "" || email == "" {
		return nil, errors.New("attendee event ID and email are required")
	}
	return scanAttendee(r.db.QueryRow(ctx, `SELECT `+attendeeColumns+`
FROM event_attendees WHERE event_id = $1 AND email = $2`, eventID, email))
}

// SetAttendeeDeclined writes the explicit decline state for one email-keyed
// membership. It serves both decline and undecline. A missing membership is
// reported as pgx.ErrNoRows.
func (r *Repository) SetAttendeeDeclined(ctx context.Context, eventID, email string, declined bool) error {
	if eventID == "" || email == "" {
		return errors.New("attendee event ID and email are required")
	}
	tag, err := r.db.Exec(ctx, `UPDATE event_attendees
SET declined = $3, updated_at = clock_timestamp()
WHERE event_id = $1 AND email = $2`, eventID, email, declined)
	if err != nil {
		return err
	}
	if tag.RowsAffected() == 0 {
		return pgx.ErrNoRows
	}
	return nil
}

// RemoveAttendee deletes one email-keyed membership. A missing membership is
// reported as pgx.ErrNoRows.
func (r *Repository) RemoveAttendee(ctx context.Context, eventID, email string) error {
	if eventID == "" || email == "" {
		return errors.New("attendee event ID and email are required")
	}
	tag, err := r.db.Exec(ctx, `DELETE FROM event_attendees WHERE event_id = $1 AND email = $2`, eventID, email)
	if err != nil {
		return err
	}
	if tag.RowsAffected() == 0 {
		return pgx.ErrNoRows
	}
	return nil
}

// resolveAttendeeAccount returns the legacy external account identifier for a
// case-insensitive email, or nil when no PostgreSQL account exists. It mirrors
// GetAccountByEmail's deterministic oldest-account resolution without requiring
// the caller to treat a missing account as an error.
func (r *Repository) resolveAttendeeAccount(ctx context.Context, email string) (*string, error) {
	var externalUserID string
	err := r.db.QueryRow(ctx, `SELECT p.external_user_id
FROM accounts a JOIN platform_identities p ON p.id = a.platform_identity_id
WHERE lower(a.email) = lower($1)
ORDER BY a.created_at, a.id LIMIT 1`, email).Scan(&externalUserID)
	if errors.Is(err, pgx.ErrNoRows) {
		return nil, nil
	}
	if err != nil {
		return nil, err
	}
	return &externalUserID, nil
}

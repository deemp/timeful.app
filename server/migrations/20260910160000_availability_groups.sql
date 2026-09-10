-- +goose Up
-- Availability groups get a dedicated event kind so PostgreSQL can distinguish
-- them from timed, dates-only, and signup events. The kind constraint already
-- admits specific_dates, dow, and signup (see 20260910150000_signup_forms.sql),
-- and this migration extends it with group.
ALTER TABLE postgres_events DROP CONSTRAINT postgres_events_type;
ALTER TABLE postgres_events ADD CONSTRAINT postgres_events_type
    CHECK (type IN ('specific_dates', 'dow', 'signup', 'group'));

-- An attendee is one group invitation keyed by the invited email address. email
-- keeps the invitation identity even when no account exists. account_user_id is
-- the legacy external account identifier resolved by email where an account
-- exists at write time, and is released (set NULL) when that account is deleted
-- so the email-keyed membership survives. declined is NULL when the legacy
-- document omitted it, distinct from an explicit false.
CREATE TABLE event_attendees (
    id UUID PRIMARY KEY DEFAULT uuidv7(),
    event_id UUID NOT NULL REFERENCES postgres_events(id) ON DELETE CASCADE,
    email TEXT NOT NULL CHECK (email <> ''),
    account_user_id TEXT NULL CHECK (account_user_id IS NULL OR account_user_id <> ''),
    declined BOOLEAN NULL,
    created_at TIMESTAMPTZ NOT NULL DEFAULT clock_timestamp(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT clock_timestamp()
);

-- At most one membership per event and email.
CREATE UNIQUE INDEX event_attendees_event_email_unique_idx
    ON event_attendees (event_id, email);

CREATE INDEX event_attendees_account_user_id_idx
    ON event_attendees (account_user_id);

-- +goose Down
DROP TABLE event_attendees;
ALTER TABLE postgres_events DROP CONSTRAINT postgres_events_type;
ALTER TABLE postgres_events ADD CONSTRAINT postgres_events_type
    CHECK (type IN ('specific_dates', 'dow', 'signup'));

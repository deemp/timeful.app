-- +goose Up
-- Signup forms get a dedicated event kind so PostgreSQL can distinguish them
-- from timed and dates-only polls without overloading the legacy isSignUpForm
-- payload flag. The availability-group kind is added by TASK-0190.05.
ALTER TABLE postgres_events DROP CONSTRAINT postgres_events_type;
ALTER TABLE postgres_events ADD CONSTRAINT postgres_events_type
    CHECK (type IN ('specific_dates', 'dow', 'signup'));

-- A signup block is an ordered, capacity-limited slot on a signup form event.
-- capacity is NULL when unlimited; zero capacity rejects every signup. The
-- start and end dates are millisecond instants. position preserves the legacy
-- block array order across replacements. The legacy MongoDB block identifier is
-- rewritten to this fresh PostgreSQL UUIDv7 during TASK-0190.06.
CREATE TABLE event_signup_blocks (
    id UUID PRIMARY KEY DEFAULT uuidv7(),
    event_id UUID NOT NULL REFERENCES postgres_events(id) ON DELETE CASCADE,
    name TEXT NOT NULL DEFAULT '',
    capacity INTEGER NULL CHECK (capacity IS NULL OR capacity >= 0),
    start_date TIMESTAMPTZ NULL,
    end_date TIMESTAMPTZ NULL,
    position INTEGER NOT NULL DEFAULT 0,
    created_at TIMESTAMPTZ NOT NULL DEFAULT clock_timestamp(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT clock_timestamp()
);

CREATE INDEX event_signup_blocks_event_id_idx
    ON event_signup_blocks (event_id, position, created_at, id);

-- A signup response is owned by an Event Visitor Identity and is keyed publicly
-- by an opaque UUID public_id. account_user_id or canonical_guest_name identifies
-- the respondent, matching the legacy account-hex-or-guest-name response key.
-- block_ids holds the claimed event_signup_blocks identities as text because a
-- PostgreSQL array cannot carry a foreign key; membership is validated in the
-- repository. name and canonical_guest_name hold the respondents.NormalizeGuestName
-- result for guest responses. Multiple responses per Event Visitor Identity are
-- permitted, matching the PostgreSQL response model.
CREATE TABLE event_signup_responses (
    id UUID PRIMARY KEY DEFAULT uuidv7(),
    public_id UUID NOT NULL UNIQUE DEFAULT gen_random_uuid(),
    event_id UUID NOT NULL REFERENCES postgres_events(id) ON DELETE CASCADE,
    event_visitor_identity_id UUID NOT NULL,
    respondent_kind TEXT NOT NULL CHECK (respondent_kind IN ('account', 'guest')),
    account_user_id TEXT NULL,
    canonical_guest_name TEXT NULL,
    name TEXT NOT NULL DEFAULT '',
    email TEXT NOT NULL DEFAULT '',
    block_ids TEXT[] NOT NULL DEFAULT '{}'::text[],
    created_at TIMESTAMPTZ NOT NULL DEFAULT clock_timestamp(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT clock_timestamp(),
    CONSTRAINT event_signup_responses_visitor_event_fk
        FOREIGN KEY (event_id, event_visitor_identity_id)
        REFERENCES event_visitor_identities(event_id, id) ON DELETE CASCADE,
    CONSTRAINT event_signup_responses_identity CHECK (
        (respondent_kind = 'account' AND account_user_id IS NOT NULL AND account_user_id <> '')
        OR
        (respondent_kind = 'guest' AND account_user_id IS NULL AND canonical_guest_name IS NOT NULL AND canonical_guest_name <> '')
    )
);

CREATE INDEX event_signup_responses_event_id_idx
    ON event_signup_responses (event_id, created_at, id);

CREATE UNIQUE INDEX event_signup_responses_account_unique_idx
    ON event_signup_responses (event_id, account_user_id)
    WHERE respondent_kind = 'account';

CREATE UNIQUE INDEX event_signup_responses_guest_name_unique_idx
    ON event_signup_responses (event_id, canonical_guest_name)
    WHERE respondent_kind = 'guest';

-- +goose Down
DROP TABLE event_signup_responses;
DROP TABLE event_signup_blocks;
ALTER TABLE postgres_events DROP CONSTRAINT postgres_events_type;
ALTER TABLE postgres_events ADD CONSTRAINT postgres_events_type
    CHECK (type IN ('specific_dates', 'dow'));

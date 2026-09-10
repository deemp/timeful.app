-- +goose Up
-- Accounts are the sole authority for account identity and profile. The legacy
-- MongoDB users document is retained only for calendar integration data and is
-- keyed by the same identifier stored in platform_identities.external_user_id.
CREATE TABLE accounts (
    id UUID PRIMARY KEY DEFAULT uuidv7(),
    platform_identity_id UUID NOT NULL UNIQUE REFERENCES platform_identities(id),
    email TEXT NOT NULL DEFAULT '',
    first_name TEXT NOT NULL DEFAULT '',
    last_name TEXT NOT NULL DEFAULT '',
    picture TEXT NOT NULL DEFAULT '',
    -- NULL preserves a legacy document that omitted hasCustomName, distinct
    -- from an explicit false.
    has_custom_name BOOLEAN NULL,
    timezone_offset INTEGER NOT NULL DEFAULT 0,
    num_events_created INTEGER NOT NULL DEFAULT 0 CHECK (num_events_created >= 0),
    created_at TIMESTAMPTZ NOT NULL DEFAULT clock_timestamp(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT clock_timestamp()
);

-- Sign-in resolves an account by case-insensitive email. Email is deliberately
-- not unique: distinct legacy accounts stay distinct even when emails compare
-- equal, per the migration contract.
CREATE INDEX accounts_email_lower_idx ON accounts (lower(email));

-- +goose Down
DROP TABLE accounts;

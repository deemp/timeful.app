-- +goose Up
-- Folders are account-scoped organization records. account_user_id is the
-- legacy external account identifier stored in platform_identities, matching
-- the retained MongoDB users._id for migrated accounts.
CREATE TABLE folders (
    id UUID PRIMARY KEY DEFAULT uuidv7(),
    account_user_id TEXT NOT NULL CHECK (account_user_id <> ''),
    name TEXT NOT NULL DEFAULT '',
    color TEXT NULL,
    -- NULL preserves a legacy document that omitted isDeleted, distinct from an
    -- explicit false. Reads treat NULL and FALSE as not deleted.
    is_deleted BOOLEAN NULL,
    created_at TIMESTAMPTZ NOT NULL DEFAULT clock_timestamp(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT clock_timestamp()
);

CREATE INDEX folders_account_user_id_idx ON folders (account_user_id);

-- A membership holds exactly one explicit event reference. event_id points at
-- a migrated or new PostgreSQL event and keeps referential integrity during the
-- transition. legacy_event_id holds the legacy MongoDB event _id so
-- TASK-0190.06 can rewrite it to a PostgreSQL event identity without a
-- permanent runtime legacy-identifier map.
CREATE TABLE folder_events (
    id UUID PRIMARY KEY DEFAULT uuidv7(),
    account_user_id TEXT NOT NULL CHECK (account_user_id <> ''),
    folder_id UUID NOT NULL REFERENCES folders(id) ON DELETE CASCADE,
    event_id UUID NULL REFERENCES postgres_events(id) ON DELETE CASCADE,
    legacy_event_id TEXT NULL,
    created_at TIMESTAMPTZ NOT NULL DEFAULT clock_timestamp(),
    CONSTRAINT folder_events_event_reference CHECK (
        (event_id IS NOT NULL AND legacy_event_id IS NULL)
        OR
        (event_id IS NULL AND legacy_event_id IS NOT NULL)
    )
);

CREATE INDEX folder_events_folder_id_idx ON folder_events (folder_id);

-- One folder per account per event, enforced for each reference kind.
CREATE UNIQUE INDEX folder_events_event_unique_idx
    ON folder_events (account_user_id, event_id)
    WHERE event_id IS NOT NULL;

CREATE UNIQUE INDEX folder_events_legacy_event_unique_idx
    ON folder_events (account_user_id, legacy_event_id)
    WHERE legacy_event_id IS NOT NULL;

-- +goose Down
DROP TABLE folder_events;
DROP TABLE folders;

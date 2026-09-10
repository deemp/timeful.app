-- +goose Up
-- Account deletion is recorded as a tombstone so a concurrent or repeated
-- account backfill cannot recreate a deleted account from the retained MongoDB
-- source document. The tombstone is written in the same transaction that
-- removes the account and platform identity, so deletion is atomic and
-- idempotent across stores.
CREATE TABLE account_deletion_tombstones (
    external_user_id TEXT PRIMARY KEY CHECK (external_user_id <> ''),
    deleted_at TIMESTAMPTZ NOT NULL DEFAULT clock_timestamp()
);

-- +goose Down
DROP TABLE account_deletion_tombstones;

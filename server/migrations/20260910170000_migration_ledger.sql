-- +goose Up
-- The migration ledger records each completed migration unit so a later run can
-- resume after the first incomplete unit instead of rewriting completed work.
-- It is operational tooling: no request path reads it, and it is dropped after
-- cutover validation. target_id holds the fresh PostgreSQL identity the unit
-- produced, and batch identifies the run that committed it.
CREATE TABLE migration_ledger (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    kind TEXT NOT NULL CHECK (kind <> ''),
    legacy_id TEXT NOT NULL CHECK (legacy_id <> ''),
    target_id TEXT NOT NULL CHECK (target_id <> ''),
    batch TEXT NOT NULL DEFAULT '',
    created_at TIMESTAMPTZ NOT NULL DEFAULT clock_timestamp(),
    UNIQUE (kind, legacy_id)
);

-- The quarantine ledger is append-only so a replayed run preserves the same
-- decisions. Each quarantined legacy credential or ambiguous record is recorded
-- with its legacy identity, event identity where known, reason code, and the
-- batch that observed it. Nothing here is imported as authority.
CREATE TABLE migration_quarantine (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    kind TEXT NOT NULL CHECK (kind <> ''),
    legacy_id TEXT NOT NULL CHECK (legacy_id <> ''),
    event_legacy_id TEXT NOT NULL DEFAULT '',
    reason TEXT NOT NULL CHECK (reason <> ''),
    detail TEXT NOT NULL DEFAULT '',
    batch TEXT NOT NULL DEFAULT '',
    created_at TIMESTAMPTZ NOT NULL DEFAULT clock_timestamp(),
    UNIQUE (kind, legacy_id, reason)
);

-- +goose Down
DROP TABLE migration_quarantine;
DROP TABLE migration_ledger;

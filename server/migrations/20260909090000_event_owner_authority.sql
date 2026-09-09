-- +goose Up
-- Ownership association is separate from the creator's response identity.
-- Existing anonymous events have no recoverable owner token; never promote an EVCC.
ALTER TABLE postgres_events
    ADD COLUMN owner_edit_token_hash BYTEA CHECK (octet_length(owner_edit_token_hash) = 32),
    ADD COLUMN owner_platform_identity_id UUID REFERENCES platform_identities(id);
-- Preserve ownership already associated under the identity foundation.
UPDATE postgres_events e SET owner_platform_identity_id = v.platform_identity_id
FROM event_visitor_identities v WHERE v.id = e.owner_event_visitor_identity_id;
CREATE INDEX postgres_events_owner_platform_idx ON postgres_events(owner_platform_identity_id);

-- Only a future source-approved transfer may issue a granted credential.
ALTER TABLE event_visitor_credentials
    ADD COLUMN kind TEXT NOT NULL DEFAULT 'base' CHECK (kind IN ('base', 'granted')),
    ADD COLUMN grants_owner BOOLEAN NOT NULL DEFAULT FALSE,
    ADD CONSTRAINT owner_grant_requires_granted CHECK (NOT grants_owner OR kind = 'granted');

-- +goose Down
ALTER TABLE event_visitor_credentials DROP CONSTRAINT owner_grant_requires_granted,
    DROP COLUMN grants_owner, DROP COLUMN kind;
ALTER TABLE postgres_events DROP COLUMN owner_platform_identity_id, DROP COLUMN owner_edit_token_hash;

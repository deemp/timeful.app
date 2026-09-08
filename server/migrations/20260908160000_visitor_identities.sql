-- +goose Up
CREATE TABLE platform_identities (
    id UUID PRIMARY KEY DEFAULT uuidv7(),
    external_user_id TEXT NOT NULL UNIQUE CHECK (external_user_id <> ''),
    created_at TIMESTAMPTZ NOT NULL DEFAULT clock_timestamp()
);

CREATE TABLE event_visitor_identities (
    id UUID PRIMARY KEY DEFAULT uuidv7(),
    event_id UUID NOT NULL REFERENCES postgres_events(id) ON DELETE CASCADE,
    public_id UUID NOT NULL UNIQUE DEFAULT gen_random_uuid(),
    platform_identity_id UUID REFERENCES platform_identities(id),
    created_at TIMESTAMPTZ NOT NULL DEFAULT clock_timestamp(),
    UNIQUE (event_id, id)
);
CREATE INDEX event_visitor_platform_idx ON event_visitor_identities(platform_identity_id, event_id);

CREATE TABLE event_visitor_credentials (
    id UUID PRIMARY KEY DEFAULT uuidv7(),
    event_visitor_identity_id UUID NOT NULL REFERENCES event_visitor_identities(id) ON DELETE CASCADE,
    credential_hash BYTEA NOT NULL CHECK (octet_length(credential_hash) = 32),
    created_at TIMESTAMPTZ NOT NULL DEFAULT clock_timestamp(),
    revoked_at TIMESTAMPTZ
);
CREATE INDEX event_visitor_credentials_visitor_idx ON event_visitor_credentials(event_visitor_identity_id);

ALTER TABLE postgres_events ADD COLUMN owner_event_visitor_identity_id UUID;
ALTER TABLE postgres_events ADD CONSTRAINT postgres_events_owner_visitor_fk
    FOREIGN KEY (id, owner_event_visitor_identity_id) REFERENCES event_visitor_identities(event_id, id);

ALTER TABLE postgres_event_responses ADD COLUMN public_id UUID NOT NULL DEFAULT gen_random_uuid() UNIQUE;
ALTER TABLE postgres_event_responses ADD COLUMN event_visitor_identity_id UUID;

INSERT INTO platform_identities (external_user_id)
SELECT DISTINCT account_user_id FROM postgres_event_responses WHERE account_user_id IS NOT NULL
ON CONFLICT DO NOTHING;

-- Existing uniqueness ensures each old response represents one visitor.
-- Allocate the relation first so the backfill preserves every payload and row.
UPDATE postgres_event_responses SET event_visitor_identity_id = uuidv7();
INSERT INTO event_visitor_identities (id, event_id, platform_identity_id)
SELECT r.event_visitor_identity_id, r.event_id, p.id
FROM postgres_event_responses r
LEFT JOIN platform_identities p ON p.external_user_id = r.account_user_id;

ALTER TABLE postgres_event_responses ALTER COLUMN event_visitor_identity_id SET NOT NULL;
ALTER TABLE postgres_event_responses ADD CONSTRAINT postgres_response_owner_event_fk
    FOREIGN KEY (event_id, event_visitor_identity_id) REFERENCES event_visitor_identities(event_id, id);
CREATE INDEX postgres_response_visitor_idx ON postgres_event_responses(event_visitor_identity_id);

-- PostgreSQL response ownership now belongs to the visitor relation.
DROP INDEX postgres_event_responses_account_unique_idx;
DROP INDEX postgres_event_responses_guest_id_unique_idx;
DROP INDEX postgres_event_responses_guest_name_unique_idx;
ALTER TABLE postgres_event_responses DROP CONSTRAINT postgres_event_responses_identity;
ALTER TABLE postgres_event_responses DROP CONSTRAINT postgres_event_responses_token_ownership;
ALTER TABLE postgres_event_responses ALTER COLUMN respondent_kind DROP NOT NULL;

-- +goose Down
-- A downgrade cannot represent multiple responses per visitor in the old model.
-- Refuse it instead of silently dropping identity or response data.
-- +goose StatementBegin
DO $$ BEGIN
    RAISE EXCEPTION 'Visitor identity migration requires a reviewed data-preserving downgrade';
END $$;
-- +goose StatementEnd

-- +goose Up
CREATE TABLE access_transfers (
 id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
 event_id UUID NOT NULL REFERENCES postgres_events(id) ON DELETE CASCADE,
 source_hash BYTEA NOT NULL CHECK (octet_length(source_hash) = 32),
 source_credential_id UUID REFERENCES event_visitor_credentials(id),
 external_user_id TEXT,
 grants_owner BOOLEAN NOT NULL DEFAULT FALSE,
 expires_at TIMESTAMPTZ NOT NULL DEFAULT (clock_timestamp() + interval '5 minutes'),
 state TEXT NOT NULL DEFAULT 'pending' CHECK (state IN ('pending','approved','redeemed','cancelled')),
 approved_request_id UUID,
 grant_id UUID REFERENCES event_visitor_credentials(id),
 CHECK ((source_credential_id IS NULL) <> (external_user_id IS NULL))
);
CREATE INDEX access_transfers_event_idx ON access_transfers(event_id);
CREATE TABLE access_transfer_requests (
 id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
 transfer_id UUID NOT NULL REFERENCES access_transfers(id) ON DELETE CASCADE,
 target_hash BYTEA NOT NULL CHECK (octet_length(target_hash) = 32),
 code TEXT NOT NULL,
 UNIQUE (transfer_id, code)
);
-- +goose Down
DROP TABLE access_transfer_requests;
DROP TABLE access_transfers;

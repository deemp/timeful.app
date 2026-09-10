package postgres

import (
	"context"
	"errors"
)

func (r *Repository) FindOrCreatePlatformIdentity(ctx context.Context, externalUserID string) (*PlatformIdentity, error) {
	if externalUserID == "" {
		return nil, errors.New("authenticated external user ID is required")
	}
	value := &PlatformIdentity{}
	err := r.db.QueryRow(ctx, `WITH inserted AS (
 INSERT INTO platform_identities (external_user_id) VALUES ($1)
 ON CONFLICT (external_user_id) DO NOTHING
 RETURNING id, external_user_id, created_at
)
SELECT id, external_user_id, created_at FROM inserted
UNION ALL
SELECT id, external_user_id, created_at FROM platform_identities WHERE external_user_id = $1
LIMIT 1`, externalUserID).Scan(&value.ID, &value.ExternalUserID, &value.CreatedAt)
	return value, err
}

func (r *Repository) CreateEventVisitorIdentity(ctx context.Context, eventID string) (*EventVisitorIdentity, error) {
	value := &EventVisitorIdentity{}
	err := r.db.QueryRow(ctx, `INSERT INTO event_visitor_identities (event_id) VALUES ($1)
 RETURNING id, event_id, public_id, platform_identity_id, created_at`, eventID).Scan(&value.ID, &value.EventID, &value.PublicID, &value.PlatformIdentityID, &value.CreatedAt)
	return value, err
}

func (r *Repository) GetEventVisitorIdentity(ctx context.Context, eventID, publicID string) (*EventVisitorIdentity, error) {
	value := &EventVisitorIdentity{}
	err := r.db.QueryRow(ctx, `SELECT id, event_id, public_id, platform_identity_id, created_at
 FROM event_visitor_identities WHERE event_id = $1 AND public_id::text = $2`, eventID, publicID).Scan(&value.ID, &value.EventID, &value.PublicID, &value.PlatformIdentityID, &value.CreatedAt)
	return value, err
}

// AssociateEventVisitorIdentity must be called only after proving browser authority.
// An association cannot be silently reassigned to another account.
func (r *Repository) AssociateEventVisitorIdentity(ctx context.Context, visitorID, platformID string) error {
	result, err := r.db.Exec(ctx, `UPDATE event_visitor_identities SET platform_identity_id = $2
 WHERE id = $1 AND (platform_identity_id IS NULL OR platform_identity_id = $2)`, visitorID, platformID)
	if err == nil && result.RowsAffected() != 1 {
		return errors.New("visitor is associated with another platform identity")
	}
	return err
}

func (r *Repository) CreateEventVisitorCredential(ctx context.Context, value *EventVisitorCredential) error {
	if value == nil || len(value.CredentialHash) != 32 {
		return errors.New("credential SHA-256 hash is required")
	}
	if value.Kind == "" {
		value.Kind = CredentialKindBase
	}
	return r.db.QueryRow(ctx, `INSERT INTO event_visitor_credentials (event_visitor_identity_id, credential_hash, kind, grants_owner)
 VALUES ($1, $2, $3, $4) RETURNING id, created_at`, value.EventVisitorIdentityID, value.CredentialHash, value.Kind, value.GrantsOwner).Scan(&value.ID, &value.CreatedAt)
}

func (r *Repository) GetEventVisitorCredential(ctx context.Context, visitorID, credentialID string) (*EventVisitorCredential, error) {
	value := &EventVisitorCredential{}
	err := r.db.QueryRow(ctx, `SELECT id, event_visitor_identity_id, credential_hash, created_at, revoked_at, kind, grants_owner
 FROM event_visitor_credentials WHERE event_visitor_identity_id = $1 AND id::text = $2`, visitorID, credentialID).Scan(&value.ID, &value.EventVisitorIdentityID, &value.CredentialHash, &value.CreatedAt, &value.RevokedAt, &value.Kind, &value.GrantsOwner)
	return value, err
}

func (r *Repository) RevokeEventVisitorCredentials(ctx context.Context, visitorID string) error {
	_, err := r.db.Exec(ctx, `UPDATE event_visitor_credentials SET revoked_at = clock_timestamp()
 WHERE event_visitor_identity_id = $1 AND revoked_at IS NULL`, visitorID)
	return err
}

func (r *Repository) VisitorBelongsToAccount(ctx context.Context, visitorID, externalUserID string) (bool, error) {
	var authorized bool
	err := r.db.QueryRow(ctx, `SELECT EXISTS (SELECT 1 FROM event_visitor_identities v
 JOIN platform_identities p ON p.id = v.platform_identity_id WHERE v.id = $1 AND p.external_user_id = $2)`, visitorID, externalUserID).Scan(&authorized)
	return authorized, err
}

func (r *Repository) GetResponseByPublicID(ctx context.Context, eventID, publicID string) (*Response, error) {
	return r.getResponse(ctx, `event_id = $1 AND public_id::text = $2`, eventID, publicID)
}

// LockEvent serializes response count changes across concurrent requests.
func (r *Repository) LockEvent(ctx context.Context, eventID string) (*Event, error) {
	var id string
	if err := r.db.QueryRow(ctx, `SELECT id FROM postgres_events WHERE id = $1 FOR UPDATE`, eventID).Scan(&id); err != nil {
		return nil, err
	}
	return r.GetEventByID(ctx, id)
}

// SetEventOwnerToken is used only during event creation; existing EVCCs cannot recover a token.
func (r *Repository) SetEventOwnerToken(ctx context.Context, eventID string, hash []byte) error {
	if len(hash) != 32 {
		return errors.New("owner token SHA-256 hash is required")
	}
	_, err := r.db.Exec(ctx, `UPDATE postgres_events SET owner_edit_token_hash = $2 WHERE id = $1 AND owner_edit_token_hash IS NULL`, eventID, hash)
	return err
}

// AssociateEventOwner must run under the event row lock after token proof.
// It deliberately does not reassign any Event Visitor Identity or response.
func (r *Repository) AssociateEventOwner(ctx context.Context, eventID, platformID string) error {
	_, err := r.db.Exec(ctx, `UPDATE postgres_events SET owner_platform_identity_id = $2, updated_at = clock_timestamp() WHERE id = $1`, eventID, platformID)
	return err
}

func (r *Repository) EventOwnerBelongsToAccount(ctx context.Context, eventID, externalID string) (bool, error) {
	var authorized bool
	err := r.db.QueryRow(ctx, `SELECT EXISTS (SELECT 1 FROM postgres_events e JOIN platform_identities p ON p.id = e.owner_platform_identity_id WHERE e.id = $1 AND p.external_user_id = $2)`, eventID, externalID).Scan(&authorized)
	return authorized, err
}

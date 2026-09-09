package postgres

import (
	"context"
	"time"
)

type AccessTransfer struct {
	ID                 string
	EventID            string
	SourceHash         []byte
	SourceCredentialID *string
	ExternalUserID     *string
	GrantsOwner        bool
	ExpiresAt          time.Time
	State              string
	ApprovedRequestID  *string
	GrantID            *string
}

type TransferRequest struct {
	ID         string `json:"id"`
	Code       string `json:"code"`
	TargetHash []byte `json:"-"`
}

func (r *Repository) CreateAccessTransfer(ctx context.Context, v *AccessTransfer) error {
	return r.db.QueryRow(ctx, `INSERT INTO access_transfers(event_id,source_hash,source_credential_id,external_user_id,grants_owner)
 VALUES($1,$2,$3,$4,$5) RETURNING id,expires_at,state`, v.EventID, v.SourceHash, v.SourceCredentialID, v.ExternalUserID, v.GrantsOwner).Scan(&v.ID, &v.ExpiresAt, &v.State)
}

// All lifecycle transitions use this row lock, including opening target requests.
func (r *Repository) LockAccessTransfer(ctx context.Context, eventID, id string) (*AccessTransfer, error) {
	v := &AccessTransfer{}
	err := r.db.QueryRow(ctx, `SELECT id,event_id,source_hash,source_credential_id,external_user_id,grants_owner,expires_at,state,approved_request_id,grant_id FROM access_transfers WHERE event_id=$1 AND id::text=$2 FOR UPDATE`, eventID, id).Scan(&v.ID, &v.EventID, &v.SourceHash, &v.SourceCredentialID, &v.ExternalUserID, &v.GrantsOwner, &v.ExpiresAt, &v.State, &v.ApprovedRequestID, &v.GrantID)
	return v, err
}

func (r *Repository) SaveAccessTransfer(ctx context.Context, v *AccessTransfer) error {
	_, err := r.db.Exec(ctx, `UPDATE access_transfers SET state=$2,approved_request_id=$3,grant_id=$4 WHERE id=$1`, v.ID, v.State, v.ApprovedRequestID, v.GrantID)
	return err
}

func (r *Repository) CreateTransferRequest(ctx context.Context, transferID string, v *TransferRequest) error {
	return r.db.QueryRow(ctx, `INSERT INTO access_transfer_requests(transfer_id,target_hash,code) VALUES($1,$2,$3) RETURNING id`, transferID, v.TargetHash, v.Code).Scan(&v.ID)
}

// PruneExpiredAccessTransfers deletes past-deadline transfers that can no
// longer progress, together with their cascade-deleted requests. Redeemed
// transfers are retained so the source can revoke issued grants.
func (r *Repository) PruneExpiredAccessTransfers(ctx context.Context) error {
	_, err := r.db.Exec(ctx, `DELETE FROM access_transfers WHERE expires_at < clock_timestamp() AND state IN ('pending','approved','cancelled')`)
	return err
}

func (r *Repository) ListTransferRequests(ctx context.Context, transferID string) ([]TransferRequest, error) {
	rows, err := r.db.Query(ctx, `SELECT id,code,target_hash FROM access_transfer_requests WHERE transfer_id=$1 ORDER BY id`, transferID)
	if err != nil {
		return nil, err
	}
	defer rows.Close()
	result := []TransferRequest{}
	for rows.Next() {
		var v TransferRequest
		if err := rows.Scan(&v.ID, &v.Code, &v.TargetHash); err != nil {
			return nil, err
		}
		result = append(result, v)
	}
	return result, rows.Err()
}

func (r *Repository) RevokeGrantedCredential(ctx context.Context, id string) error {
	_, err := r.db.Exec(ctx, `UPDATE event_visitor_credentials SET revoked_at=clock_timestamp() WHERE id=$1 AND kind='granted'`, id)
	return err
}

func (r *Repository) GetTransferSourceCredential(ctx context.Context, id string) (*EventVisitorCredential, error) {
	var visitorID string
	if err := r.db.QueryRow(ctx, `SELECT event_visitor_identity_id FROM event_visitor_credentials WHERE id=$1`, id).Scan(&visitorID); err != nil {
		return nil, err
	}
	return r.GetEventVisitorCredential(ctx, visitorID, id)
}
func (r *Repository) GetTransferSourceVisitor(ctx context.Context, id string) (*EventVisitorIdentity, error) {
	v := &EventVisitorIdentity{}
	err := r.db.QueryRow(ctx, `SELECT id,event_id,public_id,platform_identity_id,created_at FROM event_visitor_identities WHERE id=$1`, id).Scan(&v.ID, &v.EventID, &v.PublicID, &v.PlatformIdentityID, &v.CreatedAt)
	return v, err
}

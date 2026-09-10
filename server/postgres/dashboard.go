package postgres

import (
	"context"
	"errors"
)

// DashboardEvent pairs an account-visible event with whether the account owns
// it, whether the account has responded to it, and whether the account is a
// non-declined group member. A responded-but-not-owned event still appears on
// the dashboard, and only owned events carry owner authority. Responded is
// derived from response storage so a group invitee without a response stays in
// the pending state, and Member lets the dashboard derive group responded state
// the same way the legacy attendee lookup does.
type DashboardEvent struct {
	Event     Event
	Owned     bool
	Responded bool
	Member    bool
}

// ListDashboardEvents returns every non-deleted event the account owns, has
// responded to, or is invited to as a group attendee. Ownership resolves
// through the event's platform-identity or legacy external owner reference. A
// response counts when it names the account directly or when its Event Visitor
// Identity is associated with the account's platform identity, so a signed-in
// response is recovered from the session alone. Group membership resolves by
// the account's email against non-declined attendees. A group invitee keeps
// their pending state until they respond. PostgreSQL and MongoDB own disjoint
// records, so callers merge the two lists without duplicating an event.
func (r *Repository) ListDashboardEvents(ctx context.Context, externalUserID, email string) ([]DashboardEvent, error) {
	if externalUserID == "" {
		return nil, errors.New("account external user ID is required")
	}
	rows, err := r.db.Query(ctx, `SELECT e.id, e.short_id, e.owner_edit_token_hash, e.owner_platform_identity_id, e.owner_event_visitor_identity_id, e.owner_external_id, e.name, e.type, e.is_archived, e.is_deleted, e.num_responses, e.schedule_version, e.creator_posthog_id, e.created_at, e.updated_at, e.payload,
       COALESCE((e.owner_platform_identity_id = p.id) OR (e.owner_external_id = $1), FALSE) AS owned,
       (EXISTS (
          SELECT 1
          FROM postgres_event_responses r
          LEFT JOIN event_visitor_identities v ON v.id = r.event_visitor_identity_id
          WHERE r.event_id = e.id
            AND (r.account_user_id = $1 OR v.platform_identity_id = p.id)
        ) OR EXISTS (
          SELECT 1
          FROM event_signup_responses sr
          LEFT JOIN event_visitor_identities sv ON sv.id = sr.event_visitor_identity_id
          WHERE sr.event_id = e.id
            AND (sr.account_user_id = $1 OR sv.platform_identity_id = p.id)
        )) AS responded,
       ($2 <> '' AND EXISTS (
          SELECT 1
          FROM event_attendees a
          WHERE a.event_id = e.id
            AND a.declined IS NOT TRUE
            AND lower(a.email) = lower($2)
        )) AS member
FROM postgres_events e
LEFT JOIN platform_identities p ON p.external_user_id = $1
WHERE e.is_deleted = FALSE
  AND (
    e.owner_platform_identity_id = p.id
    OR e.owner_external_id = $1
    OR EXISTS (
      SELECT 1
      FROM postgres_event_responses r
      LEFT JOIN event_visitor_identities v ON v.id = r.event_visitor_identity_id
      WHERE r.event_id = e.id
        AND (r.account_user_id = $1 OR v.platform_identity_id = p.id)
    )
    OR EXISTS (
      SELECT 1
      FROM event_signup_responses sr
      LEFT JOIN event_visitor_identities sv ON sv.id = sr.event_visitor_identity_id
      WHERE sr.event_id = e.id
        AND (sr.account_user_id = $1 OR sv.platform_identity_id = p.id)
    )
    OR ($2 <> '' AND EXISTS (
      SELECT 1
      FROM event_attendees a
      WHERE a.event_id = e.id
        AND a.declined IS NOT TRUE
        AND lower(a.email) = lower($2)
    ))
  )
ORDER BY e.created_at DESC, e.id DESC`, externalUserID, email)
	if err != nil {
		return nil, err
	}
	defer rows.Close()
	events := []DashboardEvent{}
	for rows.Next() {
		var item DashboardEvent
		if err := rows.Scan(
			&item.Event.ID,
			&item.Event.ShortID,
			&item.Event.OwnerEditTokenHash,
			&item.Event.OwnerPlatformIdentityID,
			&item.Event.OwnerEventVisitorIdentityID,
			&item.Event.OwnerExternalID,
			&item.Event.Name,
			&item.Event.Type,
			&item.Event.IsArchived,
			&item.Event.IsDeleted,
			&item.Event.NumResponses,
			&item.Event.ScheduleVersion,
			&item.Event.CreatorPosthogID,
			&item.Event.CreatedAt,
			&item.Event.UpdatedAt,
			&item.Event.Payload,
			&item.Owned,
			&item.Responded,
			&item.Member,
		); err != nil {
			return nil, err
		}
		item.Event.Payload = decodePayload(item.Event.Payload)
		events = append(events, item)
	}
	return events, rows.Err()
}

// Package postgres contains persistence types for PostgreSQL-owned anonymous
// events. These types deliberately do not reuse MongoDB BSON models.
package postgres

import (
	"encoding/json"
	"time"
)

const (
	EventTypeSpecificDates = "specific_dates"
	EventTypeDayOfWeek     = "dow"

	RespondentKindAccount = "account"
	RespondentKindGuest   = "guest"
)

// Event is the storage aggregate for a PostgreSQL-owned anonymous poll.
// ID is a hidden UUIDv7; ShortID is the sole public event identifier. Payload
// holds compatibility fields whose JSON shape matters.
type Event struct {
	ID                          string
	OwnerEventVisitorIdentityID *string
	OwnerEditTokenHash          []byte
	OwnerPlatformIdentityID     *string
	ShortID                     string
	OwnerExternalID             *string
	Name                        string
	Type                        string
	IsArchived                  bool
	IsDeleted                   bool
	NumResponses                int
	ScheduleVersion             int
	CreatorPosthogID            *string
	CreatedAt                   time.Time
	UpdatedAt                   time.Time
	Payload                     json.RawMessage
}

// Response is stored independently so response mutations and event response
// counts can be committed in one transaction. Identity columns drive lookup
// and uniqueness; Payload retains the current response wire shape.
type Response struct {
	ID                     string
	PublicID               string
	EventVisitorIdentityID string
	EventID                string
	RespondentKind         string
	AccountUserID          *string
	GuestID                *string
	CanonicalGuestName     *string
	GuestEditPolicy        *string
	GuestOwnershipMode     *string
	GuestEditToken         *string
	Payload                json.RawMessage
	CreatedAt              time.Time
	UpdatedAt              time.Time
}

// PlatformIdentity is private and resolved only from an authenticated session.
type PlatformIdentity struct {
	ID             string
	ExternalUserID string
	CreatedAt      time.Time
}

// EventVisitorIdentity is event-scoped. PublicID conveys no authority.
type EventVisitorIdentity struct {
	ID                 string
	EventID            string
	PublicID           string
	PlatformIdentityID *string
	CreatedAt          time.Time
}

const (
	CredentialKindBase    = "base"
	CredentialKindGranted = "granted"
)

type EventVisitorCredential struct {
	Kind                   string
	GrantsOwner            bool
	ID                     string
	EventVisitorIdentityID string
	CredentialHash         []byte
	CreatedAt              time.Time
	RevokedAt              *time.Time
}

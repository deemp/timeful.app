# PostgreSQL Anonymous Event Compatibility Contract

## Scope

These tables own only new anonymous timed and dates-only polls.
MongoDB remains authoritative for legacy events, authenticated creation, groups, signup forms, folders, account adoption, and dashboard event loading. `postgres_events` and `postgres_event_responses` are not HTTP DTOs and must not use BSON types.

`postgres_events.id` and `postgres_event_responses.id` are internal UUIDv7 identities.
API handlers expose only `short_id`, an eight-character Crockford Base32 identifier.
PostgreSQL's UUID primary key remains internal.

## Explicit Columns

Event columns hold identifiers, soft-delete state, name, type, response count, schedule version, creator PostHog ID, and timestamps.
Response columns hold the event relation, an Event Visitor Identity owner, opaque response-map lookup identity, and timestamps.
PostgreSQL Platform Identities and Event Visitor Identities use internal UUID relations; Mongo user IDs remain external strings, with no cross-database foreign key.

`canonical_guest_name` is produced by `respondents.NormalizeGuestName` in Go.
PostgreSQL must not reimplement guest-name normalization.
PostgreSQL permits multiple responses per Event Visitor Identity.
Each response's event relation and its owner Event Visitor Identity must identify the same event through a composite database constraint or equivalent enforced invariant.

## JSONB Payloads

`postgres_events.payload` holds all remaining event state, including:

- Description and nullable/default settings.
- Dates, active slots, timezone, slot generation, and timed recurrence.
- Legacy schedule fields retained for compatibility.
- Selected-schedule snapshot, remindees, attendee-compatible fields, and
  unsupported-feature fields accepted by existing request decoding.

`postgres_event_responses.payload` holds display name, email, availability, if-needed availability, manual availability, and calendar-related fields.

JSON arrays preserve their existing behavior: date and recurrence arrays keep input order and duplicates; active slots are normalized by route validation; response availability keeps first-seen order after deduplication.
Instants are normalized to millisecond precision before writing JSONB and before API output.

## Compatibility Rules

The repository must distinguish absent fields, JSON null, empty arrays/maps, and zero scalar values.
In particular, an omitted description preserves the existing value, an explicit empty description persists, and a timed edit with an explicit empty `activeSlots` retains the existing slots to match Mongo BSON `omitempty` behavior.
Public schedule save/replace/clear remains supported while the event is not archived.

For PostgreSQL, an Event Visitor Control Credential (EVCC) authorizes management of every response owned by its Event Visitor Identity in that event.
The public `eventVisitorId` is an identifier, not proof.
A Granted EVCC is a distinct, source-revocable delegated credential; neither credential value is exposed to application JavaScript.
Legacy MongoDB guest-edit-token behavior is unchanged and is not a PostgreSQL compatibility constraint.

PostgreSQL response maps use opaque response IDs.
The API must define explicit creation, selected-response, update, and deletion contracts that remain valid when one Event Visitor Identity owns multiple responses.
Blind-availability payloads must expose a non-owner only responses the non-owner is authorized to manage and must not leak other-response counts.

## Delivered Identity Foundation

PostgreSQL event creation establishes an event-scoped Event Visitor Identity and returns its public `eventVisitorId` with the created event.
Creation also issues the private EVCC as an HttpOnly, SameSite=Lax cookie scoped to `/api`; the credential value never reaches application JavaScript.
The browser retains `eventVisitorId` per event in localStorage so the identity survives reloads and sign-out, while authority always comes from the EVCC cookie or an authenticated Platform Identity session.

Signing in associates known browser Event Visitor Identities with the private Platform Identity through `POST /auth/visitor-identities`.
Association never grants authority by itself; response authorization still requires the source EVCC or the associated Platform Identity session.

PostgreSQL response maps are keyed by the opaque `publicId`, and each entry carries `canEdit` so the client can offer exactly the edits the server will honor.
Response mutation uses an explicit-selection contract: `createResponse: true` creates a new response for the calling Event Visitor Identity, and every edit, deletion, and rename must carry the target `responseId`; otherwise the route rejects with `select-response-or-explicitly-create`.
The browser plugin `set-slots` wire contract is unchanged; the frontend maps the plugin's named response onto the explicit-selection contract (existing named response, else selected response, else create) before calling the API, and the respondents-list delete submits the same `responseId` contract.

Event creation records the creator's [Event Visitor Identity](../../docs/terminology/glossary.md#event-visitor-identity) separately from the event's ownership association.
A blind-availability read exposes all responses only with [Event Owner](../../docs/terminology/glossary.md#event-owner) authority; other visitors see only responses they are authorized to manage, with other-response counts omitted.

Matching-code transfers, Granted EVCC issuance, and source revocation flows remain deferred to TASK-0071.02.
The migration downgrade is intentionally refused because the legacy schema cannot represent multiple responses per Event Visitor Identity.

## Delivered Event Owner Authority

PostgreSQL creation issues a distinct [Event Owner Edit Token](../../docs/terminology/glossary.md#event-owner-edit-token) in an HttpOnly, SameSite=Lax cookie scoped to `/api`, with Secure enabled for HTTPS requests.
Only its SHA-256 hash is stored; the credential value never reaches application JavaScript.
The token authorizes [Event Settings](../../docs/terminology/glossary.md#event-settings) edits, archive/unarchive, and deletion, but does not authorize [Event Response](../../docs/terminology/glossary.md#event-response) edits.
Base [Event Visitor Control Credentials (EVCCs)](../../docs/terminology/glossary.md#event-visitor-control-credential-evcc) never authorize these owner actions, including the creator's credential.

Ownership has its own [Platform Visitor Identity](../../docs/terminology/glossary.md#platform-visitor-identity) association, separate from the creator's [Event Visitor Identity](../../docs/terminology/glossary.md#event-visitor-identity) and [Event Responses](../../docs/terminology/glossary.md#event-response).
An associated account can manage the event without the original cookie.
Proving the [Event Owner Edit Token](../../docs/terminology/glossary.md#event-owner-edit-token) while signed in associates ownership with that account, replacing any previous ownership association without transferring response ownership.
Ownership takeover and protected mutations serialize under the event row lock.

Event reads expose server-proven `canEditSettings` and `canManageEvent` capabilities for frontend controls.
Archived events remain readable and allow authorized unarchive or deletion, but reject settings, response, rename, and selected-schedule mutations.
Deleted events and their responses stop resolving through event routes.
MongoDB retains its legacy owner authorization.

The credential schema and validator distinguish a future owner-issued [Granted Event Visitor Control Credential (Granted EVCC)](../../docs/terminology/glossary.md#granted-event-visitor-control-credential-granted-evcc) through explicit credential-kind and owner-grant metadata, and reject revoked grants.
Repository-seeded regression fixtures verify this foundation; no transfer issuance endpoint, transfer UI, or end-to-end transfer flow is delivered here.

The migration preserves ownership already associated through the creator's [Event Visitor Identity](../../docs/terminology/glossary.md#event-visitor-identity).
Older anonymous events have no recoverable [Event Owner Edit Token](../../docs/terminology/glossary.md#event-owner-edit-token); without an existing ownership association, their settings, archive state, and deletion cannot be managed after this migration.
Existing base credentials are deliberately not promoted to owner authority.
PostgreSQL dashboard loading remains outside this foundation.

## Transactions

Response create, update, and delete lock the event row and update the response row plus `num_responses` in one transaction.
Guest rename, policy changes, and legacy-to-token transitions are also transactional.
Unique-index conflicts must map to the existing duplicate-name route error.
Event edit and selected schedule replace/clear write the event aggregate atomically.

Transactions deliberately prevent duplicate response races and response-count drift; reproducing those internal Mongo failure modes is not required for API compatibility.

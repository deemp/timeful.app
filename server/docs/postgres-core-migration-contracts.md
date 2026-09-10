# PostgreSQL Core Migration Contracts

## Scope

This document is the backend contract for moving core account, event, response, attendee, signup, group, and folder data from MongoDB to PostgreSQL.
It defines the authoritative-store boundary, the field ownership inventory, legacy identity resolution, authority-quarantine rules, and the staged backfill and cutover contract.
It constrains TASK-0190.02 through TASK-0190.08 and complements [PostgreSQL Anonymous Event Compatibility Contract](postgres-anonymous-event-compatibility.md).
Table and column names introduced here are contractual targets for later subtasks; this task adds no runtime code, schema, or migration tooling.

## Relationship To Existing Contracts

[PostgreSQL Anonymous Event Compatibility Contract](postgres-anonymous-event-compatibility.md) remains authoritative for the behavior of new anonymous PostgreSQL events.
Its statements that "MongoDB remains authoritative for legacy events, authenticated creation, groups, signup forms, folders, account adoption, and dashboard event loading" describe the repository before core cutover and stop applying to each migrated record once that record is served from PostgreSQL.
Where this document and the compatibility contract disagree about a PostgreSQL-owned record, this document governs the migration boundary and the compatibility contract continues to govern observable API behavior.

[PostgreSQL Retained-Data Migration Contracts](postgres-retained-data-contracts.md) supersedes this document's treatment of calendar integration fields, OTP challenges, historical daily user logs, friend requests, and reporting analytics.
The statements here that those fields stay in MongoDB describe the state before the retained-data cutover and stop applying to each record kind once that contract migrates it.
The retained-data contract governs their PostgreSQL destinations, the encrypted credential boundary, the retained-data backfill, and the removal of MongoDB.

The [Event Owner Edit Token](../../docs/terminology/glossary.md#event-owner-edit-token) rules in the compatibility contract continue to apply.
Legacy MongoDB owner authorization is preserved on MongoDB-served records and is never promoted into PostgreSQL authority.

## Authoritative Store Ownership

Every core record has exactly one authoritative store at any time.
A record is authoritative in the store that accepts its reads and writes, and the other store must not be consulted for that record or re-authorize it.

The migration moves authority per record kind in dependency order while MongoDB writes remain enabled.
After a record kind is cut over, its MongoDB document is retained as unmodified recovery source until the retention window ends and is never read as a second authority.

| Record kind                                                               | Before core cutover               | After core cutover | Notes                                                                                 |
| ------------------------------------------------------------------------- | --------------------------------- | ------------------ | ------------------------------------------------------------------------------------- |
| Account identity and profile                                              | MongoDB `users`                   | PostgreSQL         | Calendar connections, tokens, and preferences stay in MongoDB.                        |
| Calendar connections, provider tokens, calendar preferences, OAuth origin | MongoDB `users`                   | MongoDB            | Integration-only; keyed by the same legacy account identity; never account authority. |
| [Timed Event](../../docs/terminology/glossary.md#timed-event)             | MongoDB `events`                  | PostgreSQL         | Includes dates-and-times and dates-only variants.                                     |
| [Dates-Only Event](../../docs/terminology/glossary.md#dates-only-event)   | MongoDB `events`                  | PostgreSQL         | Same `events` document with `daysOnly`.                                               |
| Day-of-week event                                                         | MongoDB `events`                  | PostgreSQL         | `type = "dow"`.                                                                       |
| Availability group                                                        | MongoDB `events`                  | PostgreSQL         | `type = "group"` plus attendees.                                                      |
| Signup form                                                               | MongoDB `events`                  | PostgreSQL         | `isSignUpForm` with embedded blocks and responses.                                    |
| [Event Response](../../docs/terminology/glossary.md#event-response)       | MongoDB `eventResponses`          | PostgreSQL         | One response per legacy row.                                                          |
| Attendee and invitation                                                   | MongoDB `attendees`               | PostgreSQL         | Group membership and decline state.                                                   |
| Folder and folder membership                                              | MongoDB `folders`, `folderEvents` | PostgreSQL         | Membership references migrated event identities.                                      |
| OTP challenge                                                             | MongoDB `otpCodes`                | MongoDB            | Authentication still resolves a PostgreSQL account.                                   |
| Friend request                                                            | MongoDB `friendrequests`          | MongoDB            | Dormant storage; references resolve through the account mapping.                      |
| Historical daily user log                                                 | MongoDB `dailyuserlogs`           | MongoDB            | Retained analytics; profile fields resolve through the account mapping.               |

Retained MongoDB documents must not remain a second account authority.
After account cutover, the MongoDB `users` document keeps only its `_id` and integration and calendar fields, profile reads and writes go to PostgreSQL, and no retained document may create, merge, rename, or authorize an account.

## Field Ownership Inventory

The inventory names every persisted field the server reads or writes, its concept, its authoritative store after cutover, and its PostgreSQL destination.
A field listed as `payload` is stored inside the JSONB payload of its PostgreSQL table and keeps its existing JSON shape.
A field listed as a planned table or column is owned by the named later subtask and is recorded here so the boundary is fixed before implementation.

### Accounts And Profiles

| MongoDB field            | Concept            | After cutover | PostgreSQL destination                       | Notes                                                         |
| ------------------------ | ------------------ | ------------- | -------------------------------------------- | ------------------------------------------------------------- |
| `users._id`              | Account identity   | PostgreSQL    | `platform_identities.external_user_id` (hex) | Runtime mapping key; unique; one identity per legacy account. |
| `users.email`            | Profile            | PostgreSQL    | `accounts.email` (TASK-0190.02)              | Case-insensitive sign-in lookup is preserved.                 |
| `users.firstName`        | Profile            | PostgreSQL    | `accounts.first_name` (TASK-0190.02)         |                                                               |
| `users.lastName`         | Profile            | PostgreSQL    | `accounts.last_name` (TASK-0190.02)          |                                                               |
| `users.picture`          | Profile            | PostgreSQL    | `accounts.picture` (TASK-0190.02)            | Calendar-account pictures remain integration data.            |
| `users.hasCustomName`    | Profile preference | PostgreSQL    | `accounts.has_custom_name` (TASK-0190.02)    | Preserves absent versus `false`.                              |
| `users.timezoneOffset`   | Profile preference | PostgreSQL    | `accounts.timezone_offset` (TASK-0190.02)    | Also feeds retained daily-log bucketing.                      |
| `users.numEventsCreated` | Usage counter      | PostgreSQL    | `accounts.num_events_created` (TASK-0190.02) | Create paths increment it.                                    |

### Calendar Integration Records

These fields stay in MongoDB and are never account authority.
They are keyed by the same legacy account identity and resolve it through `platform_identities.external_user_id`.

| MongoDB field                                 | Concept                         | After cutover | Destination               | Notes                                                                     |
| --------------------------------------------- | ------------------------------- | ------------- | ------------------------- | ------------------------------------------------------------------------- |
| `users.calendarAccounts`                      | Calendar connections and tokens | MongoDB       | Retained `users` document | Includes OAuth2, Apple, and ICS credentials per `email_calendarType` key. |
| `users.calendarAccounts.*.oAuth2CalendarAuth` | OAuth2 provider tokens          | MongoDB       | Retained `users` document | Access token, refresh token, scope, and expiry.                           |
| `users.calendarAccounts.*.appleCalendarAuth`  | Apple credentials               | MongoDB       | Retained `users` document |                                                                           |
| `users.calendarAccounts.*.icsCalendarAuth`    | ICS feed credential             | MongoDB       | Retained `users` document |                                                                           |
| `users.calendarAccounts.*.enabled`            | Connection state                | MongoDB       | Retained `users` document |                                                                           |
| `users.calendarAccounts.*.subCalendars`       | Calendar visibility preference  | MongoDB       | Retained `users` document |                                                                           |
| `users.tokenOrigin`                           | OAuth client origin             | MongoDB       | Retained `users` document | Not exposed through the API.                                              |
| `users.primaryAccountKey`                     | Calendar preference             | MongoDB       | Retained `users` document |                                                                           |
| `users.calendarOptions`                       | Calendar autofill preference    | MongoDB       | Retained `users` document | Copied into responses as a snapshot but not authoritative there.          |

### Events

Common event fields apply to every event kind.
The PostgreSQL `postgres_events.type` check constraint currently admits only `specific_dates` and `dow`, so TASK-0190.04 and TASK-0190.05 must extend the accepted kinds before group and signup rows are written.

| MongoDB field                     | Concept                                                                           | After cutover | PostgreSQL destination               | Notes                                                                            |
| --------------------------------- | --------------------------------------------------------------------------------- | ------------- | ------------------------------------ | -------------------------------------------------------------------------------- |
| `events._id`                      | Event identity                                                                    | PostgreSQL    | Ledger only during migration         | Replaced by a new `postgres_events.id`; references are rewritten, not preserved. |
| `events.shortId`                  | Public event identifier                                                           | PostgreSQL    | `postgres_events.short_id`           | A fresh eight-character Crockford identifier is issued; public URLs may change.  |
| `events.ownerId`                  | Account reference                                                                 | PostgreSQL    | `postgres_events.owner_external_id`  | Null for anonymous events; resolves through `platform_identities`.               |
| `events.name`                     | Event                                                                             | PostgreSQL    | `postgres_events.name`               |                                                                                  |
| `events.type`                     | [Event Kind](../../docs/terminology/glossary.md#event-kind)                       | PostgreSQL    | `postgres_events.type`               | `group` and signup kinds require an extended constraint.                         |
| `events.description`              | Event settings                                                                    | PostgreSQL    | `postgres_events.payload`            | Absent versus explicit empty must survive.                                       |
| `events.isArchived`               | Lifecycle                                                                         | PostgreSQL    | `postgres_events.is_archived`        |                                                                                  |
| `events.isDeleted`                | Soft delete                                                                       | PostgreSQL    | `postgres_events.is_deleted`         |                                                                                  |
| `events.numResponses`             | Response count cache                                                              | PostgreSQL    | `postgres_events.num_responses`      | Reconciled against copied responses.                                             |
| `events.scheduleVersion`          | Schedule version                                                                  | PostgreSQL    | `postgres_events.schedule_version`   | Defaults to `1` when absent.                                                     |
| `events.creatorPosthogId`         | Attribution                                                                       | PostgreSQL    | `postgres_events.creator_posthog_id` | Retained analytics reads resolve it through event storage.                       |
| `events.notificationsEnabled`     | Notification preference                                                           | PostgreSQL    | `postgres_events.payload`            |                                                                                  |
| `events.sendEmailAfterXResponses` | Email threshold                                                                   | PostgreSQL    | `postgres_events.payload`            | The `-1` already-sent sentinel must survive.                                     |
| `events.collectEmails`            | Response email visibility                                                         | PostgreSQL    | `postgres_events.payload`            |                                                                                  |
| `events.blindAvailabilityEnabled` | Privacy mode                                                                      | PostgreSQL    | `postgres_events.payload`            |                                                                                  |
| `events.when2meetHref`            | Import metadata                                                                   | PostgreSQL    | `postgres_events.payload`            | Also read by the event-page title handler.                                       |
| `events.remindees`                | Email reminder recipients                                                         | PostgreSQL    | `postgres_events.payload`            | Includes `email`, `taskIds`, and `responded`.                                    |
| `events.scheduledEvent`           | [Event Occurrence Span](../../docs/terminology/glossary.md#event-occurrence-span) | PostgreSQL    | `postgres_events.payload`            | Embedded calendar snapshot, not an event reference.                              |
| `events.calendarEventId`          | External calendar event id                                                        | PostgreSQL    | `postgres_events.payload`            | Retained calendar integration value.                                             |

### Timed Event Fields

| MongoDB field             | Concept                                                             | After cutover | PostgreSQL destination    | Notes                                                               |
| ------------------------- | ------------------------------------------------------------------- | ------------- | ------------------------- | ------------------------------------------------------------------- |
| `events.daysOnly`         | Dates-only discriminator                                            | PostgreSQL    | `postgres_events.payload` | `false`/absent means dates-and-times.                               |
| `events.activeSlots`      | Active Slots                                                        | PostgreSQL    | `postgres_events.payload` | Millisecond instants; array order and duplicates preserved on copy. |
| `events.eventTimezone`    | [Event Timezone](../../docs/terminology/glossary.md#event-timezone) | PostgreSQL    | `postgres_events.payload` |                                                                     |
| `events.slotGeneration`   | Slot generation settings                                            | PostgreSQL    | `postgres_events.payload` | `startTimeLocal`, `endTimeLocal`, `timeIncrementMinutes`.           |
| `events.timedRecurrence`  | Timed recurrence                                                    | PostgreSQL    | `postgres_events.payload` | Includes `kind`, selected days, and `startOnMonday`.                |
| `events.dates`            | Event Picked Dates                                                  | PostgreSQL    | `postgres_events.payload` | Millisecond instants for dates-only and legacy timed rows.          |
| `events.duration`         | Legacy timed duration                                               | PostgreSQL    | `postgres_events.payload` | Retained for compatibility; no longer written by timed edits.       |
| `events.timeIncrement`    | Legacy slot increment                                               | PostgreSQL    | `postgres_events.payload` | Retained for compatibility.                                         |
| `events.hasSpecificTimes` | Legacy specific-times flag                                          | PostgreSQL    | `postgres_events.payload` | Retained for compatibility.                                         |
| `events.times`            | Legacy specific times                                               | PostgreSQL    | `postgres_events.payload` | Retained for compatibility.                                         |
| `events.startOnMonday`    | Legacy DOW start day                                                | PostgreSQL    | `postgres_events.payload` | Superseded by `timedRecurrence.startOnMonday`.                      |
| `enabledSlots`            | Derived legacy slot set                                             | Not persisted | Derived at read time      | Never written by current code.                                      |

### Availability Group Fields

| MongoDB field                      | Concept                    | After cutover | PostgreSQL destination             | Notes                                                  |
| ---------------------------------- | -------------------------- | ------------- | ---------------------------------- | ------------------------------------------------------ |
| `events.type = "group"`            | Availability group kind    | PostgreSQL    | `postgres_events.type`             | Requires extended kind constraint.                     |
| `events.duration`                  | Manual availability window | PostgreSQL    | `postgres_events.payload`          | Group responses use it to size manual availability.    |
| `attendees` collection             | Group membership           | PostgreSQL    | `event_attendees` (TASK-0190.05)   | See attendees section.                                 |
| `response.useCalendarAvailability` | Calendar-derived mode      | PostgreSQL    | `postgres_event_responses.payload` |                                                        |
| `response.enabledCalendars`        | Calendar selection         | PostgreSQL    | `postgres_event_responses.payload` | Keys may carry legacy `_google`/`_apple` suffixes.     |
| `response.calendarOptions`         | Copied calendar preference | PostgreSQL    | `postgres_event_responses.payload` | Snapshot only; integration authority stays in MongoDB. |
| `events.hasResponded`              | Derived membership state   | Not persisted | Derived at read time               | Never persisted.                                       |

### Signup Form Fields

| MongoDB field                          | Concept                 | After cutover | PostgreSQL destination                                  | Notes                                                  |
| -------------------------------------- | ----------------------- | ------------- | ------------------------------------------------------- | ------------------------------------------------------ |
| `events.isSignUpForm`                  | Signup form kind        | PostgreSQL    | `postgres_events.payload` or `type`                     | Kind interpretation is fixed by TASK-0190.04.          |
| `events.signUpBlocks[]._id`            | Block identity          | PostgreSQL    | `event_signup_blocks.id` (TASK-0190.04)                 | Legacy block identifiers are rewritten, not preserved. |
| `events.signUpBlocks[].name`           | Block label             | PostgreSQL    | `event_signup_blocks.name` (TASK-0190.04)               |                                                        |
| `events.signUpBlocks[].capacity`       | Block capacity          | PostgreSQL    | `event_signup_blocks.capacity` (TASK-0190.04)           | Capacity enforcement must be atomic.                   |
| `events.signUpBlocks[].startDate`      | Block start             | PostgreSQL    | `event_signup_blocks.start_date` (TASK-0190.04)         | Millisecond instant.                                   |
| `events.signUpBlocks[].endDate`        | Block end               | PostgreSQL    | `event_signup_blocks.end_date` (TASK-0190.04)           | Millisecond instant.                                   |
| `events.signUpResponses.<key>`         | Signup response         | PostgreSQL    | `event_signup_responses` (TASK-0190.04)                 | Keys are account hex or canonical guest name.          |
| `signUpResponses.<key>.signUpBlockIds` | Block membership        | PostgreSQL    | `event_signup_responses.block_ids` (TASK-0190.04)       | References rewritten to PostgreSQL block identities.   |
| `signUpResponses.<key>.name`           | Respondent display name | PostgreSQL    | `event_signup_responses.name` (TASK-0190.04)            | Canonicalized by guest-name rules.                     |
| `signUpResponses.<key>.email`          | Respondent email        | PostgreSQL    | `event_signup_responses.email` (TASK-0190.04)           |                                                        |
| `signUpResponses.<key>.userId`         | Account reference       | PostgreSQL    | `event_signup_responses.account_user_id` (TASK-0190.04) | Resolves through `platform_identities`.                |

### Event Responses

| MongoDB field                                | Concept                       | After cutover | PostgreSQL destination                                        | Notes                                                             |
| -------------------------------------------- | ----------------------------- | ------------- | ------------------------------------------------------------- | ----------------------------------------------------------------- |
| `eventResponses._id`                         | Response identity             | PostgreSQL    | Opaque `postgres_event_responses.public_id`                   | A fresh public response identifier is issued.                     |
| `eventResponses.eventId`                     | Event reference               | PostgreSQL    | `postgres_event_responses.event_id`                           | Rewritten to the migrated event UUID.                             |
| `eventResponses.userId`                      | Legacy lookup key             | Not stored    | Resolved during migration                                     | String form may hold account hex or guest key.                    |
| `eventResponses.response.userId`             | Account reference             | PostgreSQL    | `postgres_event_responses.account_user_id`                    | Resolves through `platform_identities`.                           |
| `eventResponses.response.name`               | Display name                  | PostgreSQL    | `postgres_event_responses.payload` and `canonical_guest_name` | Canonical name is produced by the existing guest-name normalizer. |
| `eventResponses.response.email`              | Respondent email              | PostgreSQL    | `postgres_event_responses.payload`                            |                                                                   |
| `eventResponses.response.guestId`            | Guest identity                | PostgreSQL    | `postgres_event_responses.guest_id`                           | A fresh Event Visitor Identity owns the migrated response.        |
| `eventResponses.response.guestEditToken`     | Legacy guest credential       | Quarantine    | Migration quarantine ledger                                   | Never imported as PostgreSQL authority.                           |
| `eventResponses.response.guestEditPolicy`    | Guest edit policy             | PostgreSQL    | `postgres_event_responses.guest_edit_policy`                  | `protected` or `open`.                                            |
| `eventResponses.response.guestOwnershipMode` | Guest ownership mode          | PostgreSQL    | `postgres_event_responses.guest_ownership_mode`               | `legacy` or `token`.                                              |
| `eventResponses.response.availability`       | Available statuses            | PostgreSQL    | `postgres_event_responses.payload`                            | Millisecond instants; dedupe rules applied.                       |
| `eventResponses.response.ifNeeded`           | If-needed statuses            | PostgreSQL    | `postgres_event_responses.payload`                            | Excludes instants already available.                              |
| `eventResponses.response.manualAvailability` | Manual availability map       | PostgreSQL    | `postgres_event_responses.payload`                            | Map keyed by millisecond instant.                                 |
| `eventResponses.response.user`               | Denormalized account snapshot | Not stored    | Rebuilt at read time                                          | Never authoritative.                                              |

### Attendees And Invitations

| MongoDB field        | Concept           | After cutover | PostgreSQL destination                    | Notes                                             |
| -------------------- | ----------------- | ------------- | ----------------------------------------- | ------------------------------------------------- |
| `attendees._id`      | Attendee identity | PostgreSQL    | `event_attendees.id` (TASK-0190.05)       | Fresh identity.                                   |
| `attendees.eventId`  | Event reference   | PostgreSQL    | `event_attendees.event_id` (TASK-0190.05) | Rewritten to the migrated event UUID.             |
| `attendees.email`    | Invitation email  | PostgreSQL    | `event_attendees.email` (TASK-0190.05)    | Resolves to an account by email where one exists. |
| `attendees.declined` | Decline state     | PostgreSQL    | `event_attendees.declined` (TASK-0190.05) | Preserves absent versus `false`.                  |

### Folders And Folder Membership

| MongoDB field           | Concept             | After cutover | PostgreSQL destination                         | Notes                                      |
| ----------------------- | ------------------- | ------------- | ---------------------------------------------- | ------------------------------------------ |
| `folders._id`           | Folder identity     | PostgreSQL    | `folders.id` (TASK-0190.03)                    | Fresh identity; references rewritten.      |
| `folders.userId`        | Account reference   | PostgreSQL    | `folders.account_user_id` (TASK-0190.03)       | Resolves through `platform_identities`.    |
| `folders.name`          | Folder label        | PostgreSQL    | `folders.name` (TASK-0190.03)                  |                                            |
| `folders.color`         | Folder color        | PostgreSQL    | `folders.color` (TASK-0190.03)                 |                                            |
| `folders.isDeleted`     | Soft delete         | PostgreSQL    | `folders.is_deleted` (TASK-0190.03)            | Preserves absent versus `false`.           |
| `folderEvents._id`      | Membership identity | PostgreSQL    | `folder_events.id` (TASK-0190.03)              | Fresh identity.                            |
| `folderEvents.userId`   | Account reference   | PostgreSQL    | `folder_events.account_user_id` (TASK-0190.03) | Resolves through `platform_identities`.    |
| `folderEvents.folderId` | Folder reference    | PostgreSQL    | `folder_events.folder_id` (TASK-0190.03)       | Rewritten to the migrated folder identity. |
| `folderEvents.eventId`  | Event reference     | PostgreSQL    | `folder_events.event_id` (TASK-0190.03)        | Rewritten to the migrated event identity.  |

### Retained Supporting Data

| MongoDB field      | Concept        | After cutover | Destination | Notes                                                                               |
| ------------------ | -------------- | ------------- | ----------- | ----------------------------------------------------------------------------------- |
| `otpCodes.*`       | OTP challenge  | MongoDB       | Retained    | Expiry and attempt lockout semantics unchanged; authentication resolves an account. |
| `friendrequests.*` | Friend request | MongoDB       | Retained    | Dormant; `from` and `to` resolve through the account mapping.                       |
| `dailyuserlogs.*`  | Historical log | MongoDB       | Retained    | `userIds` resolve through the account mapping; profile fields come from PostgreSQL. |

## Legacy Identity Resolution

### Accounts

`platform_identities.external_user_id` is the sole runtime mapping between a legacy MongoDB account and its PostgreSQL account, and it holds the hexadecimal MongoDB `users._id`.
Account migration is idempotent through `FindOrCreatePlatformIdentity`, so repeated backfill cannot create a duplicate identity for the same legacy account.
Distinct MongoDB accounts remain distinct PostgreSQL accounts even when their emails compare equal, because merging accounts would infer an identity the source does not establish.
Sessions remain cookie-held `userId` hexadecimal values and resolve the PostgreSQL account through this mapping without a session data migration.

### Pre-Cutover Lookup Behavior

The PostgreSQL account store is optional before account cutover, so account profile and existence lookups have one explicit pre-cutover behavior.
When the PostgreSQL pool is deliberately uninitialized, because `POSTGRES_APPLICATION_URI` is unset and the application never calls `postgres.Init`, those lookups read the retained MongoDB `users` document, which remains the legacy authority for that window.
Once the pool is initialized, a lookup that fails for any reason other than a genuine no-row result is reported as an error and never falls back to the retained document.
A runtime lookup failure therefore cannot restore the pre-cutover behavior or make the retained document a second source of account truth.
A genuine no-row result means the account is absent from PostgreSQL, and only then may a legacy lookup treat the retained document as the pre-backfill record.

### Migrated Records

Migrated events, responses, blocks, attendees, folders, and memberships receive new PostgreSQL identities.
All relationships among migrated records are rewritten in the same migration transaction, so no permanent legacy-identifier lookup table is exposed at runtime and no compatibility redirect exists for old public event URLs.
Public event URLs may stop resolving or resolve to a different identifier after cutover, and the frontend treats the PostgreSQL identifier as the canonical one.
The migration uses a temporary, migration-scoped ledger keyed by the legacy MongoDB identifier to achieve resumability and idempotency; the ledger is operational tooling, is not read by request paths, and is dropped after cutover validation.

### Retained MongoDB References

Retained `friendrequests.from`, `friendrequests.to`, and `dailyuserlogs.userIds[]` values stay as legacy account identifiers and resolve through `platform_identities.external_user_id` at their explicit boundary.
Retained calendar integration documents are matched to their account by the same mapping.
No retained document may create an account, merge two accounts, or authorize a request.

## Authority Preservation And Quarantine

### Legacy Guest Credentials

Legacy MongoDB `guestEditToken` values authorize a single legacy response under legacy MongoDB semantics and are not imported into PostgreSQL as authority.
Migrated guest responses are owned by a fresh Event Visitor Identity but receive no base [Event Visitor Control Credential (EVCC)](../../docs/terminology/glossary.md#event-visitor-control-credential-evcc) and no [Event Owner Edit Token](../../docs/terminology/glossary.md#event-owner-edit-token).
Each quarantined credential is recorded in the migration ledger with the legacy response identity, event identity, quarantine reason, and migration batch, so the loss is auditable and reversible by re-running from the untouched MongoDB source.
A guest whose legacy token is quarantined regains PostgreSQL response authority only by establishing new authority, such as creating a new response or associating an existing identity through [Event Sign-In](../../docs/terminology/glossary.md#event-sign-in), and never by presenting the legacy token.

### Ambiguous Ownership

Ambiguous records are quarantined and reported rather than repaired by inference.
No migration step may promote a legacy response credential into event ownership, convert a legacy guest credential into a PostgreSQL credential, or assign an event to an account that the source does not already associate.

At minimum, the following conditions are quarantined with distinct reason codes:

| Reason code                  | Condition                                                                                   |
| ---------------------------- | ------------------------------------------------------------------------------------------- |
| `missing-owner-account`      | An event `ownerId` has no resolvable MongoDB user.                                          |
| `incomplete-token-ownership` | A response has `guestOwnershipMode = "token"` but is missing `guestId` or `guestEditToken`. |
| `missing-response-identity`  | A response has neither a resolvable account reference nor a usable guest identity.          |
| `invalid-guest-name`         | A guest response fails the shared guest-name normalizer.                                    |
| `orphan-response`            | A response references an event that is absent or unmigratable.                              |
| `orphan-membership`          | Folder membership references an absent folder or event.                                     |

### Owner Authority

Ownership already associated through a creator [Event Visitor Identity](../../docs/terminology/glossary.md#event-visitor-identity) migrates to `postgres_events.owner_platform_identity_id`.
Older anonymous events carry no recoverable owner edit token, so without an existing ownership association their settings, archive state, and deletion remain unmanageable in PostgreSQL after cutover.
Existing base credentials are never promoted to owner authority, and ownership takeover and protected mutations continue to serialize under the event row lock.

## Backfill And Cutover Contract

### Migration Units And Ordering

A migration unit is one aggregate copied atomically: an account and its retained integration pointer, an event with its responses, an availability group with its attendees, or a folder with its memberships.
Units are migrated in dependency order: accounts, then events and their responses and attendees and signup data, then folders and folder memberships.
Calendar, OTP, friend-request, and daily-log collections are never copied in this migration.

### Resumability And Idempotency

Each unit is written in a single PostgreSQL transaction that also records completion in the migration ledger.
Re-running the migration re-reads the ledger, skips completed units, and re-inserts or upserts incompletely committed units without creating duplicates, relying on `external_user_id` uniqueness for accounts and ledger-recorded target identities for migrated aggregates.
Interruption at any point leaves completed units committed and the next run resumes from the first incomplete unit.

### Concurrent Writes And Freeze

The initial backfill runs in batches while the application continues to serve MongoDB, and a bounded catch-up pass re-reads changed source records so that edits made during backfill are copied.
After catch-up, the application enters a short write freeze for the migrating record kind in which new mutations are rejected or queued and not dual-written.
During the freeze the migration performs a final idempotent pass, runs reconciliation, and only then switches reads and writes for that record kind to PostgreSQL.
The freeze ends when the kind is authoritative in PostgreSQL.
No permanent dual write exists, and no record is authored in two stores after its cutover.

### Reconciliation Checks

Reconciliation runs before each cutover and records its evidence in the migration ledger and runbook.
Checks compare source and target by unit and include:

- Per-kind row counts and per-event response counts, including `num_responses` equality.
- Referential integrity: every response, attendee, signup response, and folder membership resolves to a migrated event or account.
- Uniqueness: exactly one `platform_identities.external_user_id` per legacy account and no duplicate event short identifiers.
- Relationship equality for ownership associations, folder membership, signup block membership, and attendee decline state.
- Payload equality for dates, active slots, availability, if-needed availability, manual availability, timezone, and recurrence, at millisecond precision.
- Timestamp and lifecycle equality for creation time, archive state, and soft-delete state.
- Quarantine totals and reason-code breakdown.

### Representative Fixtures

The migration ships a representative fixture set that exercises each migrated concept and each quarantine path:

1. An anonymous timed event with protected and open guest responses.
2. An anonymous dates-only event with responses.
3. A day-of-week event.
4. An authenticated timed event with an owner account and account responses.
5. An availability group with active and declined attendees and calendar-derived availability.
6. A signup form with multiple blocks, capacity limits, and account and guest signups.
7. A folder with member events the account owns and has responded to.
8. A retained calendar-integration account with provider tokens and calendar preferences.
9. Quarantine records for each reason code above.

### Interruption Recovery

Recovery is replay from the ledger, not manual repair.
A partially written aggregate is rolled back by its transaction boundary, completed aggregates are skipped, and the quarantine ledger is append-only so replayed runs preserve the same quarantine decisions.

### Rollback Boundaries

Before a kind's cutover, rollback is trivial: MongoDB remains unmodified and authoritative, and disabling the PostgreSQL route for that kind returns to MongoDB.
After a kind's cutover, the write freeze is the practical point of no return because mutations accepted by PostgreSQL are not dual-written, so a MongoDB rollback would lose post-cutover writes unless they are exported back.
The schema is additive and never dropped during migration, destructive downgrades are refused, and MongoDB source documents are retained unmodified until the retention window and final validation complete.
The staging and production runbook records the exact cutover gate, retention window, backup and restore procedure, and the handling of quarantined records that remain unresolved at cutover.

## Deferred Implementation Details

The following are intentionally left to later subtasks and are not decided here: concrete DDL and constraints for accounts, folders, signup blocks, signup responses, attendees, and groups; fixture and migration tooling; reconciliation tooling; and the operational runbook.
Those subtasks must obey the store boundary, identity mapping, quarantine rules, and cutover and rollback limits in this contract.

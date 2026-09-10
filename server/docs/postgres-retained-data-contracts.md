# PostgreSQL Retained-Data Migration Contracts

## Scope

This document is the backend contract for moving the data that the core migration deliberately retained in MongoDB into PostgreSQL, and for removing MongoDB afterward.
It defines the authoritative-store boundary for calendar integrations, OTP challenges, historical daily user logs, and reporting analytics; the friend-request retirement; the encrypted-at-rest credential boundary; the ledger-based backfill contract; and the staged MongoDB-removal sequencing with its rollback boundaries.
It constrains TASK-0199.02 through TASK-0199.09.
Table and column names introduced here are contractual targets for later subtasks; this task adds no runtime code, schema, or migration tooling.

## Relationship To Existing Contracts

[PostgreSQL Core Migration Contracts](postgres-core-migration-contracts.md) governs core account, event, response, attendee, signup, group, and folder data, and will continue to govern them.
This document governs the retained record kinds and supersedes the statements in the core contracts and [PostgreSQL Core Migration Runbook](postgres-core-migration-runbook.md) that calendar integration fields, OTP challenges, daily user logs, and friend requests stay in MongoDB.
Where the two documents disagree about a retained record kind, this document governs.

[PostgreSQL Anonymous Event Compatibility Contract](postgres-anonymous-event-compatibility.md) remains authoritative for observable anonymous-event API behavior.

The durable decisions are recorded as [ADR-015](../../docs/design/architecture/adr/ADR-015.md), [ADR-016](../../docs/design/architecture/adr/ADR-016.md), and [ADR-017](../../docs/design/architecture/adr/ADR-017.md).
ADR-016 supersedes the retained-integration boundary in [ADR-011](../../docs/design/architecture/adr/ADR-011.md).
The identity-mapping decision in [ADR-012](../../docs/design/architecture/adr/ADR-012.md) and the quarantine decision in [ADR-014](../../docs/design/architecture/adr/ADR-014.md) continue to apply, and the resumable-backfill decision in [ADR-013](../../docs/design/architecture/adr/ADR-013.md) is extended to the retained record kinds.

## Authoritative Store Ownership

Every retained record has exactly one authoritative store at any time.
A record is authoritative in the store that accepts its reads and writes, and the other store must not be consulted for that record or re-authorize it.
After a record kind is cut over, its MongoDB document is retained as unmodified recovery source until the retention window ends and is never read as a second authority.

| Record kind                                                         | Before retained-data cutover     | After retained-data cutover | Notes                                                                        |
| ------------------------------------------------------------------- | -------------------------------- | --------------------------- | ---------------------------------------------------------------------------- |
| Calendar connection, provider credentials, calendar preferences     | MongoDB retained `users`         | PostgreSQL                  | Whole integration aggregate moves together per account.                      |
| Sub-calendar and its enabled state                                  | MongoDB retained `users`         | PostgreSQL                  | Child of its calendar connection.                                            |
| OTP challenge                                                       | MongoDB `otpCodes`               | PostgreSQL                  | Ephemeral; the cutover drains the expiry window instead of backfilling rows. |
| Historical daily user log and its account membership                | MongoDB `dailyuserlogs`          | PostgreSQL                  | Retained history moves in full.                                              |
| Event-creator analytics                                             | MongoDB `events` aggregation     | PostgreSQL event storage    | Reads `postgres_events.creator_posthog_id`; no event row is copied again.    |
| Active-user and signed-up-user reporting                            | MongoDB `dailyuserlogs`, `users` | PostgreSQL                  | Reads `daily_user_logs` and `accounts`.                                      |
| Friend request                                                      | MongoDB `friendrequests`         | Retired                     | Never migrated; collection and accessors are removed.                        |
| Core account, event, response, attendee, signup, group, folder data | Per core contracts               | Per core contracts          | Owned by TASK-0190; read-only here.                                          |
| Retained MongoDB `users` document                                   | MongoDB                          | Removed                     | After all integration fields move, the document is deleted and then MongoDB. |

A retained MongoDB document must not remain a second authority for any record kind after that kind is cut over.
No retained document may create, merge, rename, or authorize an account.

## Field Ownership Inventory

The inventory names every persisted retained field the server reads or writes, its concept, its authoritative store after cutover, and its PostgreSQL destination.
A field listed as a planned table or column is owned by the named later subtask and is recorded here so the boundary is fixed before implementation.

### Calendar Integrations

These fields leave the retained `users` document and become PostgreSQL-owned.
They are keyed by the same legacy account identity and resolve it through `platform_identities.external_user_id`.

| MongoDB field                                 | Concept                      | After cutover | PostgreSQL destination                             | Notes                                                                    |
| --------------------------------------------- | ---------------------------- | ------------- | -------------------------------------------------- | ------------------------------------------------------------------------ |
| `users.calendarAccounts`                      | Calendar connection set      | PostgreSQL    | `calendar_accounts` (TASK-0199.02)                 | One row per account-map entry.                                           |
| `users.calendarAccounts.*.calendarType`       | Provider type                | PostgreSQL    | `calendar_accounts.calendar_type` (TASK-0199.02)   | `google`, `outlook`, `apple`, or `ics`.                                  |
| `users.calendarAccounts.*.email`              | Connection identity          | PostgreSQL    | `calendar_accounts.email` (TASK-0199.02)           | ICS uses its trimmed label; others use the normalized email.             |
| `users.calendarAccounts.*.picture`            | Connection picture           | PostgreSQL    | `calendar_accounts.picture` (TASK-0199.02)         |                                                                          |
| `users.calendarAccounts.*.enabled`            | Connection state             | PostgreSQL    | `calendar_accounts.enabled` (TASK-0199.02)         | Absent versus explicit `false` must survive.                             |
| `users.calendarAccounts.*.subCalendars`       | Sub-calendar visibility      | PostgreSQL    | `calendar_sub_calendars` (TASK-0199.02)            | One row per sub-calendar entry.                                          |
| `subCalendars.*.name`                         | Sub-calendar label           | PostgreSQL    | `calendar_sub_calendars.name` (TASK-0199.02)       |                                                                          |
| `subCalendars.*.enabled`                      | Sub-calendar state           | PostgreSQL    | `calendar_sub_calendars.enabled` (TASK-0199.02)    | Absent versus explicit `false` must survive.                             |
| `users.calendarAccounts.*.oAuth2CalendarAuth` | OAuth2 provider credentials  | PostgreSQL    | `calendar_account_credentials` (TASK-0199.02)      | Token fields are encrypted; expiry and scope stay plaintext columns.     |
| `oAuth2CalendarAuth.accessToken`              | OAuth2 access token          | PostgreSQL    | `...oauth_access_token_ciphertext` (TASK-0199.02)  | Encrypted at rest; never returned through the API.                       |
| `oAuth2CalendarAuth.refreshToken`             | OAuth2 refresh token         | PostgreSQL    | `...oauth_refresh_token_ciphertext` (TASK-0199.02) | Encrypted at rest; never returned through the API.                       |
| `oAuth2CalendarAuth.accessTokenExpireDate`    | Access-token expiry          | PostgreSQL    | `...oauth_access_token_expires_at` (TASK-0199.02)  | Not a secret; drives token refresh without decryption.                   |
| `oAuth2CalendarAuth.scope`                    | Granted OAuth2 scope         | PostgreSQL    | `...oauth_scope` (TASK-0199.02)                    | Not a secret; sent to the provider on refresh.                           |
| `users.calendarAccounts.*.appleCalendarAuth`  | Apple credentials            | PostgreSQL    | `calendar_account_credentials` (TASK-0199.02)      | Password is encrypted at rest.                                           |
| `appleCalendarAuth.email`                     | Apple account email          | PostgreSQL    | `calendar_accounts.email` (TASK-0199.02)           |                                                                          |
| `appleCalendarAuth.password`                  | Apple app password           | PostgreSQL    | `...apple_password_ciphertext` (TASK-0199.02)      | Encrypted at rest; legacy AES-CFB value is re-encrypted during backfill. |
| `users.calendarAccounts.*.icsCalendarAuth`    | ICS feed credential          | PostgreSQL    | `calendar_account_credentials` (TASK-0199.02)      | Feed URL is encrypted at rest.                                           |
| `icsCalendarAuth.feedUrl`                     | ICS feed URL                 | PostgreSQL    | `...ics_feed_url_ciphertext` (TASK-0199.02)        | May embed a private token, so it is encrypted.                           |
| `icsCalendarAuth.label`                       | ICS feed label               | PostgreSQL    | `calendar_accounts.email` (TASK-0199.02)           | ICS has no email; the label is the connection identity.                  |
| `users.primaryAccountKey`                     | Primary calendar preference  | PostgreSQL    | `calendar_preferences.primary_account_key`         | Absent preserves the legacy first-Google-account fallback.               |
| `users.tokenOrigin`                           | OAuth client origin          | PostgreSQL    | `calendar_preferences.token_origin`                | `ios`, `android`, `web`, or absent; never exposed through the API.       |
| `users.calendarOptions`                       | Calendar autofill preference | PostgreSQL    | `calendar_preferences.calendar_options` (JSONB)    | Preserve the existing JSON shape and absent-versus-present semantics.    |

### OTP Challenges

| MongoDB field        | Concept               | After cutover | PostgreSQL destination                     | Notes                                                               |
| -------------------- | --------------------- | ------------- | ------------------------------------------ | ------------------------------------------------------------------- |
| `otpCodes._id`       | Challenge identity    | PostgreSQL    | Fresh `otp_challenges.id` (TASK-0199.04)   | Legacy identifiers are not preserved.                               |
| `otpCodes.email`     | Challenge owner       | PostgreSQL    | `otp_challenges.email` (TASK-0199.04)      | One active challenge per email.                                     |
| `otpCodes.code`      | One-time code         | PostgreSQL    | `otp_challenges.code_hash` (TASK-0199.04)  | Stored as a salted one-way hash, never plaintext; compared by hash. |
| `otpCodes.expiresAt` | Challenge expiry      | PostgreSQL    | `otp_challenges.expires_at` (TASK-0199.04) | Ten-minute expiry is preserved.                                     |
| `otpCodes.attempts`  | Verification attempts | PostgreSQL    | `otp_challenges.attempts` (TASK-0199.04)   | Five-attempt lockout is preserved.                                  |

### Historical Daily User Logs

| MongoDB field           | Concept                    | After cutover | PostgreSQL destination                    | Notes                                                        |
| ----------------------- | -------------------------- | ------------- | ----------------------------------------- | ------------------------------------------------------------ |
| `dailyuserlogs._id`     | Log identity               | PostgreSQL    | Fresh `daily_user_logs.id` (TASK-0199.05) | Legacy identifiers are not preserved.                        |
| `dailyuserlogs.date`    | Timezone-adjusted log date | PostgreSQL    | `daily_user_logs.log_date` (TASK-0199.05) | Start of the account-local month/day/year; one row per date. |
| `dailyuserlogs.userIds` | Account membership         | PostgreSQL    | `daily_user_log_members` (TASK-0199.05)   | One row per account; first-seen order is preserved.          |
| `dailyuserlogs.users`   | Denormalized account list  | Not stored    | Rebuilt from `accounts` at read time      | Never authoritative.                                         |

### Reporting Analytics

| MongoDB field / query                          | Concept                       | After cutover | PostgreSQL destination                            | Notes                                                    |
| ---------------------------------------------- | ----------------------------- | ------------- | ------------------------------------------------- | -------------------------------------------------------- |
| `events.creatorPosthogId`                      | Event creator attribution     | PostgreSQL    | `postgres_events.creator_posthog_id`              | Already the core-contract destination; not copied again. |
| Distinct `creatorPosthogId` over recent events | Monthly active event creators | PostgreSQL    | Aggregation over `postgres_events` (TASK-0199.06) | Counts each migrated or new event exactly once.          |
| Grouped `creatorPosthogId` counts              | Creators above an event floor | PostgreSQL    | Aggregation over `postgres_events` (TASK-0199.06) | Same counting boundary as the distinct query.            |
| `users` count                                  | Number of signed-up accounts  | PostgreSQL    | `accounts` count (TASK-0199.05)                   | Reporting only; no account authority.                    |
| `dailyuserlogs` membership                     | Active users per day          | PostgreSQL    | `daily_user_logs`, `daily_user_log_members`       | Same list, chart, and count output.                      |

### Friend Requests

The `friendrequests` collection is dormant storage.
It is retired rather than migrated, so it has no PostgreSQL destination.

| MongoDB field              | Concept             | After cutover | Destination | Notes                             |
| -------------------------- | ------------------- | ------------- | ----------- | --------------------------------- |
| `friendrequests._id`       | Request identity    | Retired       | None        | Collection and model are removed. |
| `friendrequests.from`      | Requester reference | Retired       | None        | No account reference is resolved. |
| `friendrequests.to`        | Recipient reference | Retired       | None        | No account reference is resolved. |
| `friendrequests.createdAt` | Request creation    | Retired       | None        |                                   |
| `friendrequests.fromUser`  | Denormalized sender | Retired       | None        | Never persisted.                  |
| `friendrequests.toUser`    | Denormalized target | Retired       | None        | Never persisted.                  |

## Credential Encryption Boundary

Provider credentials are encrypted at rest with authenticated AES-256-GCM and an envelope that carries a format version.

- Algorithm: AES-256 in Galois/Counter Mode with a 128-bit authentication tag.
- Key source: the `ENCRYPTION_KEY` environment variable, read as exactly 32 raw bytes; startup validation refuses a missing or wrong-length key rather than deriving one.
- Nonce: a fresh 96-bit random nonce per encryption, never reused for a key.
- Envelope: the versioned string `v1:` followed by the base64 encoding of `nonce || ciphertext || tag`, so a future key or algorithm change is distinguishable without ambiguity.
- Encrypted fields: `oAuth2CalendarAuth.accessToken`, `oAuth2CalendarAuth.refreshToken`, `appleCalendarAuth.password`, and `icsCalendarAuth.feedUrl`.
- Plaintext fields: `accessTokenExpireDate`, `scope`, email, picture, enabled state, sub-calendar name and enabled state, `primaryAccountKey`, `tokenOrigin`, and `calendarOptions`.
  None of these is a provider secret.
- OTP one-time codes are not provider credentials and are not stored with this envelope; they are stored as salted one-way hashes so the code is not readable at rest.

Decryption failures are errors, never empty credentials.
A failed decrypt of an access token fails the token refresh for that connection and is reported; it never falls back to the retained MongoDB document and never submits an empty credential.
A failed decrypt of a refresh token, Apple password, or ICS feed URL surfaces as an error to the caller and does not partially load a connection.

Credentials are never returned through the API.
The credential fields keep their current non-serialized status, and no calendar route may expose a token, password, or feed URL in a response.

The legacy `server/utils/utils.go` AES-CFB helper is not the target codec.
The backfill decrypts any existing AES-CFB credential value and re-encrypts it with the AES-256-GCM envelope; request paths read and write only the versioned GCM envelope.
The version prefix makes the two formats distinguishable, and the backfill is the only code that reads the legacy CFB format.

## Fresh Identity And Single Authority

### Calendar Accounts And Sub-Calendars

Each calendar connection receives a fresh `calendar_accounts.id` and is owned by exactly one `platform_identities` row.
Its runtime key remains the `email_calendarType` map key, with the same normalization and legacy-suffix behavior as today, so the existing key semantics are preserved even though the identity is new.
Sub-calendars receive fresh identities scoped to their calendar connection.
The legacy account-map key is not preserved as a permanent lookup.

After calendar cutover, the connection, its encrypted credentials, its sub-calendars, and the calendar preferences are read and written only in PostgreSQL.
The retained `users` document is recovery source, and no calendar read may fall back to it.

### OTP Challenges

Each OTP challenge receives a fresh identity and is keyed by email.
A challenge grants no account authority: a successful verification resolves an authoritative PostgreSQL account exactly as today.
At most one challenge is active per email, replacing any existing challenge on send.

### Daily Logs

Each daily user log receives a fresh identity keyed by its account-local date, and each membership references an authoritative account.
Membership stays idempotent per account per day and preserves first-seen order.
After daily-log cutover, the log is read and written only in PostgreSQL.

### Cross-Store Rules

A record kind is migrated before it is read or written in PostgreSQL, and no permanent dual write exists.
Once a kind is cut over, request paths must not read the retained MongoDB document for that kind.

## Backfill And Cutover Contract

### Migration Units And Ordering

A migration unit is one aggregate copied atomically in a single PostgreSQL transaction.
Calendar integrations migrate per account as one unit covering that account's calendar connections, encrypted credentials, sub-calendars, and preferences.
Historical daily logs migrate as units with their memberships.
OTP challenges are not backfilled: a challenge lives ten minutes, so the cutover takes writes in PostgreSQL and lets any in-flight MongoDB challenge expire or be re-requested.
Event-creator and active-user reporting are not backfilled; their reads move to the already-migrated PostgreSQL records.

Units run in dependency order: calendar integrations, then historical daily logs, then the OTP drain, then the reporting read switch, then friend-request removal and retained-document removal, then MongoDB removal.

### Owner Resolution

Every retained unit resolves its owner through `platform_identities.external_user_id`, which holds the hexadecimal legacy `users._id`.
A unit whose owner has no `platform_identities` row is quarantined with the `missing-owner-account` reason code and is not migrated.
No migration step may create, merge, rename, or authorize an account from a retained document.

### Resumability And Idempotency

Each unit is written in a single PostgreSQL transaction that also records completion in the existing `migration_ledger`, keyed by `(kind, legacy_id)`, with the fresh PostgreSQL target identity.
Calendar units record their target in `calendar_accounts`; daily-log units record their target in `daily_user_logs`.
Re-running the migration re-reads the ledger, skips completed units, and re-inserts or upserts incompletely committed units without creating duplicates.
Interruption at any point leaves completed units committed and the next run resumes from the first incomplete unit.

### Concurrent Writes And Freeze

The initial backfill runs in batches while the application keeps serving the retained store, and a bounded catch-up pass re-reads changed source records.
After catch-up, the application enters a short write freeze for the migrating record kind in which new mutations are rejected or queued and not dual-written.
During the freeze the migration performs a final idempotent pass and reconciliation, and only then switches reads and writes for that kind to PostgreSQL.
The freeze ends when the kind is authoritative in PostgreSQL, and no record is authored in two stores after its cutover.

### Reconciliation Checks

Reconciliation runs before each cutover and records its evidence in the migration ledger and runbook.
Checks compare source and target by unit and include:

- Per-kind counts for calendar connections, sub-calendars, credential rows, preferences, daily logs, and memberships.
- Credential round-trip: every encrypted value decrypts to the source value after the legacy-format conversion.
- Enabled and preference equality, including absent versus explicit `false` and absent versus present `primaryAccountKey`.
- Credential non-exposure: no calendar response contains a token, password, or feed URL.
- Daily-log date bucketing and membership equality, including first-seen order.
- Reporting equality: monthly active event creators, the more-than-X count, active users per day, and signed-up user count match the pre-migration queries with no double counting.
- Quarantine totals and reason-code breakdown.

### Representative Fixtures

The migration ships a representative fixture set that exercises each migrated concept and each quarantine path:

1. A Google connection with OAuth2 tokens, an expiry, a scope, enabled and disabled sub-calendars, and calendar preferences.
2. An Outlook connection with OAuth2 tokens.
3. An Apple connection with an AES-CFB encrypted password.
4. An ICS connection with an encrypted feed URL.
5. An account with two calendar connections and a legacy account-map key suffix.
6. Historical daily logs with overlapping and empty days.
7. A retained calendar document with no PostgreSQL account row yet, which must quarantine as `missing-owner-account`.

### Interruption Recovery

Recovery is replay from the ledger, not manual repair.
A partially written aggregate is rolled back by its transaction boundary, completed aggregates are skipped, and quarantine is append-only so replayed runs preserve the same decisions.

## MongoDB Removal Sequencing And Rollback

The retained store is removed only in dependency order, and a later stage never starts until the earlier stage passes reconciliation.

1. Calendar cutover: TASK-0199.02 adds the schema and codec, TASK-0199.03 routes reads and writes to PostgreSQL, and TASK-0199.07 backfills and reconciles existing documents.
2. OTP cutover: TASK-0199.04 moves challenge storage and drains the expiry window.
3. Daily-log cutover: TASK-0199.05 moves historical logs and reporting.
4. Analytics cutover: TASK-0199.06 moves event-creator analytics to PostgreSQL event storage.
5. Friend-request retirement: TASK-0199.08 deletes the collection, model, and accessors instead of migrating them.
6. Retained-document removal: TASK-0199.08 removes the last `users` document reads and writes once every integration field is PostgreSQL-owned.
7. MongoDB removal: TASK-0199.09 removes the MongoDB runtime, driver, configuration, health check, Compose and environment entries, and collection variables, and only after the core-record cutover in TASK-0190.08 and the retained-data cutover both pass.

Rollback boundaries:

- Before a kind's write freeze, rollback is trivial: the retained source is unmodified and authoritative, and disabling the PostgreSQL route for that kind returns to it.
- The write freeze is the practical point of no return, because mutations accepted by PostgreSQL are not dual-written.
- Credential backfill is safe to replay or abandon before the freeze because the source document is never modified.
- Schema changes are additive and destructive downgrades are refused during the migration.
- Step 7 is irreversible: it requires a completed and validated cutover, an unexpired retention window, and verified backups, and it is the only stage with no rollback to the retained store.
- The operational gate for each stage is a clean reconciliation pass and a reviewed quarantine report, recorded with the change ticket.

## Deferred Implementation Details

The following are intentionally left to later subtasks and are not decided here: concrete DDL and constraints for the calendar, credential, OTP, and daily-log tables; the repository API; the OTP hash and salt construction; fixture and migration tooling; reconciliation tooling; and the operational runbook.
Those subtasks must obey the store boundary, identity mapping, encryption boundary, quarantine rules, and cutover and rollback limits in this contract.

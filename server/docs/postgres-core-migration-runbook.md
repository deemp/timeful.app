# PostgreSQL Core Migration Runbook

## Scope And Status

This runbook covers the one-time backfill of existing events, responses, attendees, signup blocks and responses, folders, and folder membership from MongoDB to PostgreSQL.
It implements the [PostgreSQL Core Migration Contracts](postgres-core-migration-contracts.md) and complements the [PostgreSQL Anonymous Event Compatibility Contract](postgres-anonymous-event-compatibility.md).
The tooling and its isolated rehearsal are delivered by TASK-0190.06; no live deployment or production data migration is performed by that task.
A live cutover is a separately scheduled operational action with a named operator and an approved change window.

This runbook covers the core-record backfill only.
[PostgreSQL Retained-Data Migration Contracts](postgres-retained-data-contracts.md) supersedes this runbook's statements that calendar, OTP, friend-request, and daily-log collections stay in MongoDB, and governs the retained-data backfill and the final MongoDB removal.

## Tooling

The migration lives at `server/scripts/20260910_mongo_events_to_postgres/` and runs as a dated one-off command.
It never writes to MongoDB.

```sh
go run ./scripts/20260910_mongo_events_to_postgres \
  --mongo-uri "$MONGODB_URI" \
  --mongo-database "$MONGODB_DATABASE" \
  --postgres-uri "$POSTGRES_APPLICATION_URI"
```

Flags:

| Flag                  | Purpose                                                                                                     |
| --------------------- | ----------------------------------------------------------------------------------------------------------- |
| `--apply`             | Writes PostgreSQL rows. Without it the command is a read-only preflight.                                    |
| `--batch-size N`      | Source documents read per MongoDB page.                                                                     |
| `--limit N`           | Stops after `N` committed event units; folders and reconciliation wait for a run that completes all events. |
| `--batch-label label` | Stamps every ledger and quarantine row with the run identity. Defaults to a UTC timestamp.                  |

The account backfill `server/scripts/20260910_mongo_accounts_to_postgres/` runs first so account ownership and response references resolve through `platform_identities.external_user_id`.

## Migration Units And Ordering

A migration unit is one aggregate copied atomically in a single PostgreSQL transaction.
Units are migrated in dependency order: accounts, then events with their responses, signup data, and attendees, then folders with their memberships.
The event tool owns the event, response, attendee, signup, folder, and membership units; the account tool owns account units.
Calendar, OTP, friend-request, and daily-log collections are never copied.

Each unit stamps its completion in `migration_ledger` inside the same transaction, including the fresh PostgreSQL target identity.
Folders rewrite each membership's legacy event reference to the migrated `postgres_events.id` recorded in the ledger, so migrated relationships never depend on a permanent legacy-identifier map.

## Resumability And Interruption Recovery

The run cursor advances only after a unit transaction commits.
A completed unit is skipped on the next run, and an incomplete unit is retried from scratch because its transaction rolled back.
Recovery is replay, not manual repair: rerun the same command with the same or a new `--batch-label`.
Replaying a completed run reports every unit as skipped and writes nothing.
The `--limit` flag simulates interruption and proves the resume point; the isolated rehearsal covers both interruption and replay.

## Source-Write Coordination

The backfill runs against the live MongoDB source without a maintenance window:

1. The initial pass copies units in batches while the application keeps serving MongoDB.
2. A bounded catch-up pass re-reads source records changed during the initial pass.
   Legacy event documents carry only an insertion timestamp, so catch-up re-runs the migration for the affected units rather than relying on a change cursor.
3. After catch-up, the affected record kind enters a short write freeze in which new mutations are rejected or queued and never dual-written.
4. During the freeze the migration performs one final idempotent pass and reconciliation.
5. Only after reconciliation passes are reads and writes switched for that record kind to PostgreSQL, ending the freeze.

No permanent dual write exists; a record is authored in exactly one store after its cutover.
Because the catch-up and freeze windows are operational, the tooling records the batch label and reconciliation evidence so the operator can evidence which pass produced the cutover state.

## Reconciliation Evidence

`--apply` runs reconciliation after a complete event and folder pass and prints a report.
It fails the run on any mismatch and never repairs.
Checks:

- Per-kind target counts for events, responses, signup blocks, signup responses, attendees, folders, and memberships.
- `num_responses` equality against the copied response rows for every non-signup migrated event.
- Referential integrity for folder membership and signup block claims.
- Quarantine totals grouped by reason code.

Reconciliation evidence is the input to the cutover gate; the operator records the printed report with the change ticket.

## Quarantine Handling

Ambiguous or corrupt records are reported in `migration_quarantine` and are never repaired by inference.

| Reason code                  | Handling                                                                                        |
| ---------------------------- | ----------------------------------------------------------------------------------------------- |
| `missing-owner-account`      | The event migrates ownerless; no ownership is invented.                                         |
| `incomplete-token-ownership` | The response migrates under a fresh Event Visitor Identity; the missing credential is recorded. |
| `missing-response-identity`  | The response is not imported because it has no account or guest identity.                       |
| `invalid-guest-name`         | The response is not imported because the shared guest-name normalizer rejects it.               |
| `orphan-response`            | The response references an absent event and is not imported.                                    |
| `orphan-membership`          | The folder membership references an unmigrated event and is not imported.                       |
| `legacy-guest-credential`    | The legacy `guestEditToken` is recorded and never imported as PostgreSQL authority.             |

Migrated guest responses receive no base Event Visitor Control Credential and no Event Owner Edit Token.
A guest whose legacy token is quarantined regains PostgreSQL authority only by establishing new authority, such as creating a new response or Event Sign-In.
The quarantine ledger is append-only, so replayed runs preserve the same decisions.

## Cutover Gate And Rollback Boundaries

Before the write freeze, rollback is trivial: MongoDB remains unmodified and authoritative, and disabling the PostgreSQL route for the affected kind returns to MongoDB.
The write freeze is the practical point of no return because mutations accepted by PostgreSQL are not dual-written, so a MongoDB rollback after the freeze loses post-cutover writes unless they are first exported back.
The operational rollback boundary for each record kind is therefore the start of its freeze, not the end.

Cutover of a record kind requires:

- A complete event and folder pass with the intended `--batch-label`.
- A replay that reports every unit skipped.
- A reconciliation report with no mismatches.
- A reviewed quarantine report with every unresolved record either accepted or separately resolved.

## Retention And Cleanup

The schema is additive and never dropped during migration.
MongoDB source documents are retained unmodified through the retention window and final validation.
Retained `users`, `calendarAccounts`, OTP, friend-request, and daily-log documents are never a second account authority and resolve their account references through `platform_identities.external_user_id`.
After cutover validation and the retention window, drop `migration_ledger` and `migration_quarantine`; they are operational tooling and are never read by request paths.

## Isolated Rehearsal

The rehearsal lives in `server/scripts/20260910_mongo_events_to_postgres/main_integration_test.go` and runs inside the isolated Compose test stack.
It seeds the contract's representative fixture set, including one record per quarantine path:

- An anonymous timed event with protected and open guest responses.
- An anonymous dates-only event with responses.
- A day-of-week event.
- An authenticated timed event with an owner account and an account response.
- An availability group with active and declined attendees and a calendar-derived response.
- A signup form with multiple blocks, capacity limits, and account and guest signups.
- A folder with owned member events.
- A retained calendar-integration account with provider tokens and preferences.
- Quarantine records for every reason code.

The rehearsal asserts target counts, ownership and response access, nullable and schedule fields, the quarantine breakdown, that the MongoDB source is unchanged, a clean reconciliation, idempotent replay, and resume after an interrupted `--limit` run.

Run it with:

```sh
docker compose --env-file .env.test -f compose.yaml -f compose.test.yaml run --rm server-route-test \
  go test ./scripts/20260910_mongo_events_to_postgres/ -count=1
```

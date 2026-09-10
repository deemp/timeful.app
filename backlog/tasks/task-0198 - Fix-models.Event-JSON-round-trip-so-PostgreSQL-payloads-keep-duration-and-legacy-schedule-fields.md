---
id: TASK-0198
title: >-
  Fix models.Event JSON round-trip so PostgreSQL payloads keep duration and
  legacy schedule fields
status: To Do
assignee: []
created_date: '2026-09-10 18:21'
labels:
  - postgresql
  - persistence
  - bug
dependencies: []
references:
  - >-
    backlog/tasks/task-0190.05.03 -
    Implement-PostgreSQL-group-response-mutation-and-calendar-derived-availability.md
  - server/models/event.go
  - server/routes/postgres_event_routes.go
  - server/routes/postgres_group.go
  - server/postgres/codec.go
priority: high
type: bug
ordinal: 219000
---

## Description

<!-- SECTION:DESCRIPTION:BEGIN -->
`models.Event.MarshalJSON` (server/models/event.go:125) wraps `Event` in an anonymous struct that embeds `*eventJSON` and re-declares `Duration`, `Dates`, `TimeIncrement`, `HasSpecificTimes`, `Times`, and `StartOnMonday`. The explicit wrapper fields shadow the promoted embedded fields, so those six fields always serialize from the nil wrapper values and are omitted for every event where `DaysOnly` is not true. Confirmed by marshaling a populated `models.Event` (`Duration`/`TimeIncrement` set): the JSON omits `duration` and `timeIncrement`.

This is not only an API-response concern: PostgreSQL event persistence uses the same custom marshaller. `postgresCreateEvent`/edit store `json.Marshal(event)` into `postgres_events.payload` (server/routes/postgres_event_routes.go:1015, and :563/:770), and reads decode it back with `json.Unmarshal` (server/postgres/codec.go:22). As a result the persisted payload loses `duration`, so `postgresMutateGroupResponse` computes the manual availability window from `eventModel.Duration` as zero (server/routes/postgres_group.go:490) and the legacy day-window replacement no longer spans the event duration. The route test seeded the payload directly, which hid the gap. `postgresEventPayload` (server/routes/postgres_event_routes.go:298) also marshals through this method for API responses.

Required outcome:
- Separate persistence encoding from the API-specific encoding so a PostgreSQL event payload round-trips all persisted fields, including `duration`, and live group creation/edit routes persist the manual availability window.
- Decide and document whether the six legacy schedule fields are intentionally omitted from the timed-event API; persistence must not lose fields regardless of that decision.
- Add regression coverage: a `models.Event` JSON round-trip test asserting `duration` (and the other persisted fields) survive marshal/unmarshal, and a route-level test that a live-created PostgreSQL group retains its manual availability window rather than defaulting to zero.
- Preserve the existing API contract and do not change browser-plugin `window.postMessage` payload shapes.

References:
- server/models/event.go:125 (MarshalJSON)
- server/routes/postgres_event_routes.go:298, 563, 770, 1015 (callers)
- server/postgres/codec.go:22 (decode)
- server/routes/postgres_group.go:490 (manual availability window)
- TASK-0190.05.03 Implementation Notes, "Discovered, not fixed (out of scope)"
<!-- SECTION:DESCRIPTION:END -->

## Acceptance Criteria
<!-- AC:BEGIN -->
- [ ] #1 Marshaling a populated models.Event preserves duration, dates, timeIncrement, hasSpecificTimes, times, and startOnMonday values instead of dropping them.
- [ ] #2 A PostgreSQL event payload written by live create/edit routes round-trips all persisted fields, and a live-created group's manual availability window uses the event duration rather than defaulting to zero.
- [ ] #3 Regression tests cover the models.Event JSON round-trip and the live group manual availability window.
- [ ] #4 The intended timed-event API contract for legacy schedule columns is explicitly decided and documented, and existing required frontend/backend checks pass.
<!-- AC:END -->

## Definition of Done
<!-- DOD:BEGIN -->
- [ ] #1 All acceptance criteria are satisfied
- [ ] #2 All required unit tests pass. Documentation-only changes are exempt unless the user requests unit tests
- [ ] #3 All required e2e tests pass. Documentation-only changes are exempt unless the user requests e2e tests
- [ ] #4 Changed Markdown files are formatted with npm run format:markdown
<!-- DOD:END -->

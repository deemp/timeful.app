# Requirements

This directory is the canonical record of Timeful product requirements.
Requirements state durable, verifiable behavior or quality constraints.
They are not implementation tasks, bug reports, design investigations, or decision records.

<h2>Table of contents</h2>

- [Layout](#layout)
- [Requirement Format](#requirement-format)
- [Related Artifacts](#related-artifacts)
- [Terminology](#terminology)
- [Functional Requirements](#functional-requirements)
- [Quality Requirements](#quality-requirements)

## Layout

- `functional/` contains functional requirements.
- `quality/README.md` contains quality-requirement authoring guidance.
- `quality/qr/` contains quality requirements.

Each requirement has its own file.
Use an ID-only filename so links remain stable when its title changes:

```text
functional/fr/FR-001.md
quality/qr/QR-001.md
```

The requirement ID and filename are permanent.
Titles may change.

## Requirement Format

Every requirement file starts with machine-readable YAML front matter followed by a human-readable title and requirement statement:

```md
---
id: FR-001
title: Preserve guest availability records
type: functional
components:
  - frontend
  - backend
status: accepted
---

# FR-001: Preserve Guest Availability Records

A guest can add availability multiple times.

The system shall retain every response record in that guest's browser.
```

Use one of these `components` values:

- `frontend` for browser application behavior.
- `backend` for API and server behavior.
- `infrastructure` for deployment and runtime environment behavior.

List the components responsible for enforcing the requirement.
A requirement that spans components remains one file and lists each applicable component; do not duplicate it.

Quality requirements also declare exactly one ISO/IEC 25010 quality characteristic and subcharacteristic:

```yaml
characteristic: security
subcharacteristic: confidentiality
```

See [`quality/README.md`](quality/README.md) for the allowed values and quality-scenario authoring rules.

Every requirement has a concise title and is atomic: it is independently understandable, decidable, and verifiable.
A requirement can contain several acceptance criteria when they jointly specify one behavior, but unrelated obligations belong in separate requirement files.

Describe observable outcomes rather than implementation mechanisms or incidental UI structure.

The `status` can be one of these:

- proposed
- rejected
- accepted
- deprecated
- superseded by FR-005

## Related Artifacts

- Functional requirements (`FR-*`) state required system behavior.
- Quality requirements (`QR-*`) state required quality attributes or runtime
  constraints.
- Specifications (`SPEC-*`) describe a feature or domain in broader context
  and may link to multiple requirements.
- Architecture decision records (ADRs) record architectural decisions.
- FRs and QRs must remain self-contained and must not cite ADRs as normative
  dependencies.
  ADRs may link to the FRs and QRs they enable, constrain, or
  satisfy.
  Requirement provenance is recorded separately from the requirement
  statement.
- Backlog tasks track work to investigate, implement, or verify requirements.

## Terminology

Use the controlled terms and linking conventions in the [terminology guide](../terminology/README.md).
When a requirement uses a controlled term, link its first occurrence in each paragraph, list item, and table cell to the matching [glossary](../terminology/glossary.md) entry.

## Functional Requirements

For guidance on authoring functional requirements, read [`functional/README.md`](functional/README.md).

| ID                                | Title                                                                                                                                                                                                                               | Components        |
| --------------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ----------------- |
| [FR-001](functional/fr/FR-001.md) | Preserve [Event Guest](../terminology/glossary.md#event-guest) [Event Responses](../terminology/glossary.md#event-response)                                                                                                         | frontend          |
| [FR-002](functional/fr/FR-002.md) | Project [Time Slots](../terminology/glossary.md#time-slot) into their [Projected Date Columns](../terminology/glossary.md#projected-date-column)                                                                                    | frontend          |
| [FR-003](functional/fr/FR-003.md) | Delete [Event Responses](../terminology/glossary.md#event-response)                                                                                                                                                                 | frontend, backend |
| [FR-004](functional/fr/FR-004.md) | Require a non-empty [Event Response](../terminology/glossary.md#event-response)                                                                                                                                                     | frontend          |
| [FR-005](functional/fr/FR-005.md) | Render the edited [Event Response](../terminology/glossary.md#event-response) elevated above other **Event Responses**                                                                                                              | frontend          |
| [FR-006](functional/fr/FR-006.md) | Keep [Availability Statuses](../terminology/glossary.md#availability-status) mutually exclusive                                                                                                                                     | frontend, backend |
| [FR-007](functional/fr/FR-007.md) | Hide [Platform Sign-In](../terminology/glossary.md#platform-sign-in) entry points when **Platform Sign-In** is disabled                                                                                                             | frontend          |
| [FR-008](functional/fr/FR-008.md) | Initialize the [Range Timed Domain Mode](../terminology/glossary.md#range-timed-domain-mode) [Active Slot Range](../terminology/glossary.md#active-slot-range)                                                                      | frontend          |
| [FR-009](functional/fr/FR-009.md) | Present [Timed Grid](../terminology/glossary.md#timed-grid) states consistently                                                                                                                                                     | frontend          |
| [FR-010](functional/fr/FR-010.md) | Support [Custom Timed Domain Editing](../terminology/glossary.md#custom-timed-domain-editing)                                                                                                                                       | frontend          |
| [FR-011](functional/fr/FR-011.md) | Collapse inactive [Timed Grid](../terminology/glossary.md#timed-grid) runs                                                                                                                                                          | frontend          |
| [FR-012](functional/fr/FR-012.md) | Maintain an optional [Event Occurrence Span](../terminology/glossary.md#event-occurrence-span)                                                                                                                                      | frontend, backend |
| [FR-013](functional/fr/FR-013.md) | Preserve [Time Slot](../terminology/glossary.md#time-slot) [Instants](../terminology/glossary.md#instant) across [Display Timezone](../terminology/glossary.md#display-timezone) changes                                            | frontend          |
| [FR-014](functional/fr/FR-014.md) | Derive [Timed Grid](../terminology/glossary.md#timed-grid) cell states from event domains                                                                                                                                           | frontend          |
| [FR-015](functional/fr/FR-015.md) | Save [Active Slots](../terminology/glossary.md#active-slots) only within the [Enabled Domain](../terminology/glossary.md#enabled-domain)                                                                                            | frontend, backend |
| [FR-016](functional/fr/FR-016.md) | Limit scheduling to [Active Slots](../terminology/glossary.md#active-slots)                                                                                                                                                         | frontend          |
| [FR-017](functional/fr/FR-017.md) | Preserve [Time Slots](../terminology/glossary.md#time-slot) across daylight saving transitions                                                                                                                                      | frontend, backend |
| [FR-018](functional/fr/FR-018.md) | Restrict [Event Settings](../terminology/glossary.md#event-settings) editing to the [Event Owner](../terminology/glossary.md#event-owner)                                                                                           | frontend, backend |
| [FR-019](functional/fr/FR-019.md) | Preserve multiline event descriptions                                                                                                                                                                                               | frontend, backend |
| [FR-020](functional/fr/FR-020.md) | Keep the mobile selected [Time Slot](../terminology/glossary.md#time-slot) tooltip available after scrolling                                                                                                                        | frontend          |
| [FR-021](functional/fr/FR-021.md) | Initialize a new [Event Timezone](../terminology/glossary.md#event-timezone) from the browser                                                                                                                                       | frontend          |
| [FR-022](functional/fr/FR-022.md) | Display adjacent-month days in the new-event date picker                                                                                                                                                                            | frontend          |
| [FR-023](functional/fr/FR-023.md) | Display email registration status during sign-in                                                                                                                                                                                    | frontend, backend |
| [FR-024](functional/fr/FR-024.md) | Keep the [Event Time Format](../terminology/glossary.md#event-time-format) and [Display Time Format](../terminology/glossary.md#display-time-format) independent                                                                    | frontend          |
| [FR-025](functional/fr/FR-025.md) | Require event date selection before creating an event                                                                                                                                                                               | frontend          |
| [FR-026](functional/fr/FR-026.md) | Define [Event Kind](../terminology/glossary.md#event-kind) values                                                                                                                                                                   | frontend          |
| [FR-027](functional/fr/FR-027.md) | Restrict [Dates-Only Event](../terminology/glossary.md#dates-only-event) Timezone settings to the [Event Owner](../terminology/glossary.md#event-owner)                                                                             | frontend          |
| [FR-028](functional/fr/FR-028.md) | Hide mobile response details during [Availability Editing](../terminology/glossary.md#availability-editing)                                                                                                                         | frontend          |
| [FR-029](functional/fr/FR-029.md) | Initialize the [Display Timezone](../terminology/glossary.md#display-timezone) from the browser                                                                                                                                     | frontend          |
| [FR-030](functional/fr/FR-030.md) | Persist only [Active Time Slots](../terminology/glossary.md#time-slot) in browser storage                                                                                                                                           | frontend          |
| [FR-031](functional/fr/FR-031.md) | Send registration [Sign-In Links](../terminology/glossary.md#sign-in-link) by email                                                                                                                                                 | frontend, backend |
| [FR-032](functional/fr/FR-032.md) | Complete registration after a [Sign-In Link](../terminology/glossary.md#sign-in-link) sign-in                                                                                                                                       | frontend, backend |
| [FR-033](functional/fr/FR-033.md) | Configure the feedback link                                                                                                                                                                                                         | frontend          |
| [FR-034](functional/fr/FR-034.md) | Gate the Discord banner with an environment flag                                                                                                                                                                                    | frontend          |
| [FR-035](functional/fr/FR-035.md) | Create and edit events with optional descriptions                                                                                                                                                                                   | frontend, backend |
| [FR-036](functional/fr/FR-036.md) | Reset the [Display Timezone](../terminology/glossary.md#display-timezone) to the [Event Timezone](../terminology/glossary.md#event-timezone)                                                                                        | frontend          |
| [FR-037](functional/fr/FR-037.md) | Do not reset the [Event Timezone](../terminology/glossary.md#event-timezone) in the event form                                                                                                                                      | frontend          |
| [FR-038](functional/fr/FR-038.md) | Keep the mobile availability-name input above the keyboard                                                                                                                                                                          | frontend          |
| [FR-039](functional/fr/FR-039.md) | Show [Event Settings](../terminology/glossary.md#event-settings) to non-owners                                                                                                                                                      | frontend          |
| [FR-040](functional/fr/FR-040.md) | Center the not-found page                                                                                                                                                                                                           | frontend          |
| [FR-041](functional/fr/FR-041.md) | Cue [Availability Editing](../terminology/glossary.md#availability-editing) from Unavailable [Timed Grid](../terminology/glossary.md#timed-grid) areas                                                                              | frontend          |
| [FR-042](functional/fr/FR-042.md) | Keep [Timed Grid](../terminology/glossary.md#timed-grid) highlights within their cells                                                                                                                                              | frontend          |
| [FR-043](functional/fr/FR-043.md) | Place [Time Slot](../terminology/glossary.md#time-slot) tooltips at the selected slot                                                                                                                                               | frontend          |
| [FR-044](functional/fr/FR-044.md) | Explain [Protected Event Responses](../terminology/glossary.md#protected-event-response)                                                                                                                                            | frontend          |
| [FR-045](functional/fr/FR-045.md) | Show [Event Guests](../terminology/glossary.md#event-guest) as [Unavailable](../terminology/glossary.md#unavailable) for **Unavailable** [Timed Grid](../terminology/glossary.md#timed-grid) states                                 | frontend          |
| [FR-046](functional/fr/FR-046.md) | Label the [Display Time Format](../terminology/glossary.md#display-time-format) control                                                                                                                                             | frontend          |
| [FR-047](functional/fr/FR-047.md) | Label the [Display Timezone](../terminology/glossary.md#display-timezone) control                                                                                                                                                   | frontend          |
| [FR-048](functional/fr/FR-048.md) | Center the no-response mobile [Collapse disabled times](../terminology/glossary.md#collapse-disabled-times-option) control                                                                                                          | frontend          |
| [FR-049](functional/fr/FR-049.md) | Arrange mobile event-page controls in three rows                                                                                                                                                                                    | frontend          |
| [FR-050](functional/fr/FR-050.md) | Generate [Active Slots](../terminology/glossary.md#active-slots) for newly added [Event Picked Dates](../terminology/glossary.md#event-picked-dates)                                                                                | frontend, backend |
| [FR-051](functional/fr/FR-051.md) | Keep [Active Slots](../terminology/glossary.md#active-slots) off newly added [Event Picked Dates](../terminology/glossary.md#event-picked-dates) in [Custom Timed Domain Mode](../terminology/glossary.md#custom-timed-domain-mode) | frontend, backend |
| [FR-052](functional/fr/FR-052.md) | Remove [Active Slots](../terminology/glossary.md#active-slots) for removed [Event Picked Dates](../terminology/glossary.md#event-picked-dates)                                                                                      | frontend, backend |
| [FR-053](functional/fr/FR-053.md) | Preserve [Active Slots](../terminology/glossary.md#active-slots) when converting to [Custom Timed Domain Mode](../terminology/glossary.md#custom-timed-domain-mode)                                                                 | frontend, backend |
| [FR-054](functional/fr/FR-054.md) | Regenerate [Active Slots](../terminology/glossary.md#active-slots) when converting to [Range Timed Domain Mode](../terminology/glossary.md#range-timed-domain-mode)                                                                 | frontend, backend |
| [FR-055](functional/fr/FR-055.md) | Persist changed [Timed Event](../terminology/glossary.md#timed-event) timezones                                                                                                                                                     | frontend, backend |
| [FR-056](functional/fr/FR-056.md) | Preserve [Active Slot Settings](../terminology/glossary.md#active-slot-settings) on no-op saves                                                                                                                                     | frontend, backend |
| [FR-057](functional/fr/FR-057.md) | Apply [Timed Event](../terminology/glossary.md#timed-event) timezone transition rules                                                                                                                                               | frontend, backend |
| [FR-058](functional/fr/FR-058.md) | Reject availability outside the [Enabled Domain](../terminology/glossary.md#enabled-domain)                                                                                                                                         | backend           |
| [FR-059](functional/fr/FR-059.md) | Validate and normalize [Event Response names](../terminology/glossary.md#event-response)                                                                                                                                            | frontend, backend |
| [FR-060](functional/fr/FR-060.md) | Create [Protected Event Responses](../terminology/glossary.md#protected-event-response) by default                                                                                                                                  | frontend, backend |
| [FR-061](functional/fr/FR-061.md) | Allow [Event Guests](../terminology/glossary.md#event-guest) to open their [Event Responses](../terminology/glossary.md#event-response)                                                                                             | frontend, backend |
| [FR-062](functional/fr/FR-062.md) | Restore [Event Guest](../terminology/glossary.md#event-guest) access after [Event Sign-In](../terminology/glossary.md#event-sign-in)                                                                                                | frontend, backend |
| [FR-063](functional/fr/FR-063.md) | Associate the [Event Owner](../terminology/glossary.md#event-owner) after [Event Sign-In](../terminology/glossary.md#event-sign-in)                                                                                                 | frontend, backend |
| [FR-064](functional/fr/FR-064.md) | Keep [Protected Event Responses](../terminology/glossary.md#protected-event-response) in [Schedule Overlap](../terminology/glossary.md#schedule-overlap)                                                                            | frontend          |
| [FR-065](functional/fr/FR-065.md) | Show [Event Responses](../terminology/glossary.md#event-response) for [Availability Editing](../terminology/glossary.md#availability-editing)                                                                                       | frontend          |
| [FR-066](functional/fr/FR-066.md) | Filter the response-editing grid by [Event Response](../terminology/glossary.md#event-response) selection                                                                                                                           | frontend          |
| [FR-067](functional/fr/FR-067.md) | Create [Timed Events](../terminology/glossary.md#timed-event) in [Custom Timed Domain Mode](../terminology/glossary.md#custom-timed-domain-mode)                                                                                    | frontend, backend |
| [FR-068](functional/fr/FR-068.md) | Regenerate [Active Slots](../terminology/glossary.md#active-slots) when the [Active Slot Range](../terminology/glossary.md#active-slot-range) changes                                                                               | frontend, backend |
| [FR-069](functional/fr/FR-069.md) | Calculate [Schedule Overlap](../terminology/glossary.md#schedule-overlap) from [Availability Statuses](../terminology/glossary.md#availability-status)                                                                              | frontend          |
| [FR-070](functional/fr/FR-070.md) | Omit advertising when Freemium Mode is disabled (rejected)                                                                                                                                                                          | frontend          |
| [FR-071](functional/fr/FR-071.md) | Remove advertising layout reservations when Freemium Mode is disabled (rejected)                                                                                                                                                    | frontend          |
| [FR-072](functional/fr/FR-072.md) | Bypass Freemium Mode restrictions when Freemium Mode is disabled (rejected)                                                                                                                                                         | frontend          |
| [FR-073](functional/fr/FR-073.md) | Retain browser-local [Event Visitor Identities](../terminology/glossary.md#event-visitor-identity)                                                                                                                                  | frontend          |
| [FR-074](functional/fr/FR-074.md) | Derive the [Timed Event](../terminology/glossary.md#timed-event) [Enabled Domain](../terminology/glossary.md#enabled-domain)                                                                                                        | frontend, backend |
| [FR-075](functional/fr/FR-075.md) | Generate initial [Range Timed Domain Mode](../terminology/glossary.md#range-timed-domain-mode) [Active Slots](../terminology/glossary.md#active-slots)                                                                              | frontend, backend |
| [FR-076](functional/fr/FR-076.md) | Separate the mobile event action bar from the [Timed Grid](../terminology/glossary.md#timed-grid)                                                                                                                                   | frontend          |
| [FR-077](functional/fr/FR-077.md) | Display optional event descriptions as read-only content                                                                                                                                                                            | frontend          |
| [FR-078](functional/fr/FR-078.md) | Provide mobile header navigation actions                                                                                                                                                                                            | frontend          |
| [FR-079](functional/fr/FR-079.md) | Associate [Event Visitor Identities](../terminology/glossary.md#event-visitor-identity) with [Platform Visitor Identities](../terminology/glossary.md#platform-visitor-identity)                                                    | frontend, backend |
| [FR-080](functional/fr/FR-080.md) | Default signed-in response names from the account profile                                                                                                                                                                           | frontend, backend |
| [FR-081](functional/fr/FR-081.md) | Transfer anonymous PostgreSQL guest authority to another browser                                                                                                                                                                    | frontend, backend |
| [FR-082](functional/fr/FR-082.md) | Transfer [Platform Sign-In](../terminology/glossary.md#platform-sign-in) from a PostgreSQL event to another browser                                                                                                                 | frontend, backend |
| [FR-083](functional/fr/FR-083.md) | Transfer anonymous PostgreSQL Event Owner authority to another browser                                                                                                                                                              | frontend, backend |
| [FR-084](functional/fr/FR-084.md) | Preserve [Blind Availability Mode](../terminology/glossary.md#blind-availability-mode) privacy                                                                                                                                      | frontend, backend |
| [FR-085](functional/fr/FR-085.md) | Exclude [Timed Event Occurrence Span](../terminology/glossary.md#timed-event-occurrence-span) cells from [Availability Editing](../terminology/glossary.md#availability-editing)                                                    | frontend          |
| [FR-086](functional/fr/FR-086.md) | Render the [Timed Event Occurrence Span](../terminology/glossary.md#timed-event-occurrence-span) on [Timed Grids](../terminology/glossary.md#timed-grid)                                                                            | frontend          |
| [FR-087](functional/fr/FR-087.md) | Block grid interactions behind the mobile Responses offcanvas                                                                                                                                                                       | frontend          |
| [FR-088](functional/fr/FR-088.md) | Preserve the selected [Time Slot](../terminology/glossary.md#time-slot) and tooltip when opening the mobile Responses offcanvas                                                                                                     | frontend          |
| [FR-089](functional/fr/FR-089.md) | Preserve new-event form scroll position on button selection                                                                                                                                                                         | frontend          |
| [FR-090](functional/fr/FR-090.md) | Label every whole-hour [Timed Grid](../terminology/glossary.md#timed-grid) line                                                                                                                                                     | frontend          |
| [FR-091](functional/fr/FR-091.md) | Present [End-of-Day Boundaries](../terminology/glossary.md#end-of-day-boundary) clearly in the time-range picker                                                                                                                    | frontend          |
| [FR-092](functional/fr/FR-092.md) | Keep the [Legend Section](../terminology/glossary.md#legend-section) visible without [Event Responses](../terminology/glossary.md#event-response)                                                                                   | frontend          |
| [FR-093](functional/fr/FR-093.md) | Clear the slot selection when interacting outside [Active Slots](../terminology/glossary.md#active-slots)                                                                                                                           | frontend          |
| [FR-094](functional/fr/FR-094.md) | Clear the selection immediately when tapping a disabled cell on mobile                                                                                                                                                              | frontend          |
| [FR-095](functional/fr/FR-095.md) | Keep the [Grid Pointer](../terminology/glossary.md#grid-pointer) off collapsed-hours strips                                                                                                                                         | frontend          |
| [FR-096](functional/fr/FR-096.md) | Keep tooltips fully on-screen on mobile event pages                                                                                                                                                                                 | frontend          |
| [FR-097](functional/fr/FR-097.md) | Include the [If needed](../terminology/glossary.md#if-needed) item in both [Legend Sections](../terminology/glossary.md#legend-section)                                                                                             | frontend          |
| [FR-098](functional/fr/FR-098.md) | Render If-needed responses yellow via the shared status color                                                                                                                                                                       | frontend          |
| [FR-099](functional/fr/FR-099.md) | Show [Disabled Status](../terminology/glossary.md#disabled-status) when hovering a disabled [Dates-Only Event](../terminology/glossary.md#dates-only-event) date                                                                    | frontend          |
| [FR-100](functional/fr/FR-100.md) | Contain the hover frame inside enabled dates-only cells                                                                                                                                                                             | frontend          |
| [FR-101](functional/fr/FR-101.md) | Use fixed wording for event-page availability summaries                                                                                                                                                                             | frontend          |
| [FR-102](functional/fr/FR-102.md) | Use fixed wording for personal availability on response editing pages                                                                                                                                                               | frontend          |
| [FR-103](functional/fr/FR-103.md) | Expose the editable [Slot Duration](../terminology/glossary.md#slot-duration) in new-event Advanced options                                                                                                                         | frontend, backend |
| [FR-104](functional/fr/FR-104.md) | Align the [Legend Section](../terminology/glossary.md#legend-section) label with the Responses label                                                                                                                                | frontend          |
| [FR-105](functional/fr/FR-105.md) | Fix the timed More-options toggle order                                                                                                                                                                                             | frontend          |
| [FR-106](functional/fr/FR-106.md) | Fix the dates-only More-options toggle order                                                                                                                                                                                        | frontend          |
| [FR-107](functional/fr/FR-107.md) | Aggregate hideable toggles under the More-options button                                                                                                                                                                            | frontend          |
| [FR-108](functional/fr/FR-108.md) | Reserve width for the mobile timezone control                                                                                                                                                                                       | frontend          |
| [FR-109](functional/fr/FR-109.md) | Use a counter-clockwise arrow icon for the timezone reset                                                                                                                                                                           | frontend          |
| [FR-110](functional/fr/FR-110.md) | Place the time-format button left of the timezone button                                                                                                                                                                            | frontend          |
| [FR-111](functional/fr/FR-111.md) | Place [Collapse disabled times](../terminology/glossary.md#collapse-disabled-times-option) beside the event description on desktop                                                                                                  | frontend          |
| [FR-112](functional/fr/FR-112.md) | Make Edit availability the only filled availability action                                                                                                                                                                          | frontend          |
| [FR-113](functional/fr/FR-113.md) | Require a non-empty [Timed Event Occurrence Span](../terminology/glossary.md#timed-event-occurrence-span) before saving                                                                                                             | frontend, backend |
| [FR-114](functional/fr/FR-114.md) | Switch mobile [Timed Grid](../terminology/glossary.md#timed-grid) pages between 3 and 7 day columns                                                                                                                                 | frontend          |
| [FR-115](functional/fr/FR-115.md) | Archive events as the [Event Owner](../terminology/glossary.md#event-owner)                                                                                                                                                         | frontend, backend |
| [FR-116](functional/fr/FR-116.md) | Delete events as the [Event Owner](../terminology/glossary.md#event-owner)                                                                                                                                                          | frontend, backend |
| [FR-117](functional/fr/FR-117.md) | Cancel a pending [Access Transfer](../terminology/glossary.md#access-transfer) from the source browser                                                                                                                              | frontend, backend |
| [FR-118](functional/fr/FR-118.md) | Restrict event-editor date selection to the [Event Timezone](../terminology/glossary.md#event-timezone) current date and later                                                                                                      | frontend          |
| [FR-119](functional/fr/FR-119.md) | Limit event names to 100 characters                                                                                                                                                                                                 | frontend, backend |
| [FR-120](functional/fr/FR-120.md) | Separate non-consecutive [Projected Date Columns](../terminology/glossary.md#projected-date-column) with a [Sub-grid Gap](../terminology/glossary.md#sub-grid-gap)                                                                  | frontend          |

## Quality Requirements

Read [`quality/README.md`](quality/README.md) before creating or changing a quality requirement.

| ID                             | Title                                                                                 | Components              |
| ------------------------------ | ------------------------------------------------------------------------------------- | ----------------------- |
| [QR-001](quality/qr/QR-001.md) | Restrict shared-event read access                                                     | frontend, backend       |
| [QR-002](quality/qr/QR-002.md) | Preserve shared-event modification integrity                                          | frontend, backend       |
| [QR-003](quality/qr/QR-003.md) | Authenticate anonymous edit credentials                                               | frontend, backend       |
| [QR-004](quality/qr/QR-004.md) | Exclude secrets from diagnostics                                                      | backend, infrastructure |
| [QR-005](quality/qr/QR-005.md) | Support accessible coordination flows                                                 | frontend                |
| [QR-006](quality/qr/QR-006.md) | Respond promptly for [Timed Events](../terminology/glossary.md#timed-event)           | frontend, backend       |
| [QR-007](quality/qr/QR-007.md) | Respond promptly for [Dates-Only Events](../terminology/glossary.md#dates-only-event) | frontend, backend       |
| [QR-008](quality/qr/QR-008.md) | Support large coordination workloads                                                  | frontend, backend       |
| [QR-009](quality/qr/QR-009.md) | Reject unsafe deployment configuration                                                | infrastructure          |
| [QR-010](quality/qr/QR-010.md) | Diagnose failed requests without exposing data                                        | backend, infrastructure |
| [QR-011](quality/qr/QR-011.md) | Authenticate [Access Transfers](../terminology/glossary.md#access-transfer)           | frontend, backend       |

When a requirement is migrated, add its row to the matching table with a stable relative link, for example `[FR-001](functional/fr/FR-001.md)`.

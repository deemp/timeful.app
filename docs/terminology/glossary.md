# Timeful Glossary

This glossary records controlled terms used in Timeful documentation.
Its definitions are concise references; the linked authoritative context defines the complete behavior and wins if the two conflict.

- [Text Terms](#text-terms)
  - [Unicode Normalization Form C (NFC)](#unicode-normalization-form-c-nfc)
- [Scheduling Domain](#scheduling-domain)
  - [Event Kind](#event-kind)
  - [Timed Event](#timed-event)
  - [Dates-Only Event](#dates-only-event)
  - [Event Picked Dates](#event-picked-dates)
  - [Slot](#slot)
  - [Time Slot](#time-slot)
  - [Date Slot](#date-slot)
  - [Instant](#instant)
  - [Civil Date](#civil-date)
  - [Slot Duration](#slot-duration)
  - [Enabled Domain](#enabled-domain)
  - [Active Slots](#active-slots)
  - [Inactive Slots](#inactive-slots)
  - [Timed Domain Mode](#timed-domain-mode)
  - [Range Timed Domain Mode](#range-timed-domain-mode)
  - [Custom Timed Domain Mode](#custom-timed-domain-mode)
  - [Custom Timed Domain Editing](#custom-timed-domain-editing)
  - [Active Slot Settings](#active-slot-settings)
  - [Active Slot Range](#active-slot-range)
  - [Event Timezone](#event-timezone)
  - [Display Timezone](#display-timezone)
  - [Wipe Rule](#wipe-rule)
  - [End-of-Day Boundary](#end-of-day-boundary)
  - [Event Occurrence Span](#event-occurrence-span)
  - [Timed Event Occurrence Span](#timed-event-occurrence-span)
  - [Dates-Only Event Occurrence Span](#dates-only-event-occurrence-span)
  - [Event Settings](#event-settings)
- [Event Pages](#event-pages)
  - [Timed Event Page](#timed-event-page)
  - [Timed Event Owner Page](#timed-event-owner-page)
  - [Timed Event Scheduling Page](#timed-event-scheduling-page)
  - [Timed Event Response Creation Page](#timed-event-response-creation-page)
  - [Timed Event Response Editing Page](#timed-event-response-editing-page)
  - [Dates-Only Event Page](#dates-only-event-page)
  - [Dates-Only Event Owner Page](#dates-only-event-owner-page)
  - [Dates-Only Event Scheduling Page](#dates-only-event-scheduling-page)
  - [Dates-Only Event Response Creation Page](#dates-only-event-response-creation-page)
  - [Dates-Only Event Response Editing Page](#dates-only-event-response-editing-page)
- [Identity \& Access](#identity--access)
  - [Platform Visitor](#platform-visitor)
  - [Platform Visitor Identity](#platform-visitor-identity)
  - [Authenticated Platform Visitor](#authenticated-platform-visitor)
  - [Anonymous Platform Visitor](#anonymous-platform-visitor)
  - [Event Visitor](#event-visitor)
  - [Event Visitor Identity](#event-visitor-identity)
  - [Authenticated Event Visitor](#authenticated-event-visitor)
  - [Anonymous Event Visitor](#anonymous-event-visitor)
  - [Event Guest](#event-guest)
  - [Event Owner](#event-owner)
  - [Event Visitor Control Credential (EVCC)](#event-visitor-control-credential-evcc)
  - [Granted Event Visitor Control Credential (Granted EVCC)](#granted-event-visitor-control-credential-granted-evcc)
  - [Event Owner Edit Token](#event-owner-edit-token)
  - [Event Response Edit Credential](#event-response-edit-credential)
  - [Access Transfer](#access-transfer)
  - [Event Sign-In](#event-sign-in)
  - [Platform Sign-In](#platform-sign-in)
  - [Sign-In Link](#sign-in-link)
- [Responses](#responses)
  - [Event Response](#event-response)
  - [Availability Status](#availability-status)
    - [Available](#available)
    - [If needed](#if-needed)
    - [Unavailable](#unavailable)
  - [Protected Event Response](#protected-event-response)
  - [Open Event Response](#open-event-response)
  - [Blind Availability Mode](#blind-availability-mode)
  - [Event Response Overlay](#event-response-overlay)
  - [Availability Editing](#availability-editing)
  - [Event Link](#event-link)
- [Presentation](#presentation)
  - [Timed Grid](#timed-grid)
  - [Dates-Only Grid](#dates-only-grid)
  - [Projected Date Column](#projected-date-column)
  - [Sub-grid Gap](#sub-grid-gap)
  - [Grid Pointer](#grid-pointer)
  - [Padding Cell](#padding-cell)
  - [Disabled Status](#disabled-status)
  - [Schedule Overlap](#schedule-overlap)
  - [Legend Section](#legend-section)
  - ["Collapse disabled times" Option](#collapse-disabled-times-option)
  - [Event Time Format](#event-time-format)
  - [Display Time Format](#display-time-format)

## Text Terms

### Unicode Normalization Form C (NFC)

A Unicode normalization form that applies canonical composition, producing a consistent composed code-point sequence for canonically equivalent text.

Authoritative context: [Unicode Standard Annex #15](https://www.unicode.org/reports/tr15/).

## Scheduling Domain

### Event Kind

The event's top-level scheduling model.
A [Timed Event](#timed-event) collects availability for [Time Slots](#time-slot); a [Dates-Only Event](#dates-only-event) collects availability for [Date Slots](#date-slot).
Their UI labels are `Dates and times` and `Dates only`, respectively.

Authoritative context: [FR-026](../requirements/functional/fr/FR-026.md).

### Timed Event

An [Event Kind](#event-kind) whose [Enabled Domain](#enabled-domain) consists of [Time Slots](#time-slot).
A **Timed Event** has a [Timed Domain Mode](#timed-domain-mode) and may have a [Timed Event Occurrence Span](#timed-event-occurrence-span).

Authoritative context: [FR-026](../requirements/functional/fr/FR-026.md) and [FR-074](../requirements/functional/fr/FR-074.md).

### Dates-Only Event

An [Event Kind](#event-kind) whose [Enabled Domain](#enabled-domain) consists of [Date Slots](#date-slot).
A **Dates-Only Event** may have a [Dates-Only Event Occurrence Span](#dates-only-event-occurrence-span).

Authoritative context: [FR-026](../requirements/functional/fr/FR-026.md).

### Event Picked Dates

The canonical selected-date membership for an event.
A [Timed Event's](#timed-event) [Enabled Domain](#enabled-domain) derives entirely from its **Event Picked Dates**.

Authoritative context: [FR-050](../requirements/functional/fr/FR-050.md), [FR-051](../requirements/functional/fr/FR-051.md), and [FR-052](../requirements/functional/fr/FR-052.md).

### Slot

The unit of an event's [Enabled Domain](#enabled-domain); respondents can select only [Active Slots](#active-slots).
A [Timed Event's](#timed-event) **Slots** are [Time Slots](#time-slot); a [Dates-Only Event's](#dates-only-event) **Slots** are [Date Slots](#date-slot).

Authoritative context: [FR-074](../requirements/functional/fr/FR-074.md) and [FR-058](../requirements/functional/fr/FR-058.md).

### Time Slot

A discrete availability unit of a [Timed Event](#timed-event).
A **Time Slot** has an [Instant](#instant); consecutive **Time Slots** of the [Slot Duration](#slot-duration) tile each [Event Picked Date](#event-picked-dates) from 00:00 inclusive through the next 00:00 exclusive in the [Event Timezone](#event-timezone).

Authoritative context: [FR-074](../requirements/functional/fr/FR-074.md) and [FR-017](../requirements/functional/fr/FR-017.md).

### Date Slot

The [Dates-Only Event](#dates-only-event) selectable unit: an [Event Picked Date](#event-picked-dates) offered for a response.

Authoritative context: [FR-026](../requirements/functional/fr/FR-026.md) and [FR-058](../requirements/functional/fr/FR-058.md).

### Instant

An absolute point in time that identifies a [Time Slot](#time-slot) independently of its rendered timezone, [Civil Date](#civil-date), or rendered clock time.

Authoritative context: [FR-013](../requirements/functional/fr/FR-013.md) and [FR-017](../requirements/functional/fr/FR-017.md).

### Civil Date

A bare calendar date with no time-of-day or timezone of its own; it gains interpretation only when paired with a timezone, such as the [Event Timezone](#event-timezone) or [Display Timezone](#display-timezone).

Authoritative context: [FR-002](../requirements/functional/fr/FR-002.md) and [FR-074](../requirements/functional/fr/FR-074.md).

### Slot Duration

The length of each [Time Slot](#time-slot) of a [Timed Event](#timed-event).

Authoritative context: [FR-074](../requirements/functional/fr/FR-074.md) and [FR-103](../requirements/functional/fr/FR-103.md).

### Enabled Domain

Everything generated from [Event Picked Dates](#event-picked-dates).
For a [Timed Event](#timed-event), full-civil-day [Time Slots](#time-slot) of the [Slot Duration](#slot-duration) through the next 00:00 exclusive in the [Event Timezone](#event-timezone); for a [Dates-Only Event](#dates-only-event), the **Event Picked Dates** as [Date Slots](#date-slot).
Everything outside the **Enabled Domain** is not answerable and renders with the disabled treatment: [Padding Cells](#padding-cell) on [Timed Grids](#timed-grid), or non-picked dates carrying [Disabled Status](#disabled-status) on [Dates-Only Grids](#dates-only-grid).

Authoritative context: [FR-074](../requirements/functional/fr/FR-074.md) and [FR-075](../requirements/functional/fr/FR-075.md).

### Active Slots

The canonical subset of the [Enabled Domain](#enabled-domain) that respondents can answer on.
Every **Active Slot** belongs to the **Enabled Domain**.
A [Timed Event](#timed-event) maintains its **Active Slots** through its [Timed Domain Mode](#timed-domain-mode); a [Dates-Only Event's](#dates-only-event) **Active Slots** are exactly its [Date Slots](#date-slot).

Authoritative context: [FR-016](../requirements/functional/fr/FR-016.md) and [FR-074](../requirements/functional/fr/FR-074.md).

### Inactive Slots

The [Enabled Domain](#enabled-domain) minus [Active Slots](#active-slots).
**Inactive Slots** are editable in [Custom Timed Domain Editing](#custom-timed-domain-editing) but not respondent-selectable; they are visually distinct from both [Active Slots](#active-slots) and [Padding Cells](#padding-cell).

Authoritative context: [FR-014](../requirements/functional/fr/FR-014.md).

### Timed Domain Mode

The persisted configuration that determines how a [Timed Event's](#timed-event) [Active Slots](#active-slots) are maintained.
[Range Timed Domain Mode](#range-timed-domain-mode) configures them from an [Active Slot Range](#active-slot-range); [Custom Timed Domain Mode](#custom-timed-domain-mode) configures them through [Custom Timed Domain Editing](#custom-timed-domain-editing).

Authoritative context: [FR-067](../requirements/functional/fr/FR-067.md), [FR-053](../requirements/functional/fr/FR-053.md), and [FR-054](../requirements/functional/fr/FR-054.md).

### Range Timed Domain Mode

A [Timed Domain Mode](#timed-domain-mode) that creates or restores the [Active Slots](#active-slots) from the [Active Slot Range](#active-slot-range) for the event's current [Event Picked Dates](#event-picked-dates).

Authoritative context: [FR-050](../requirements/functional/fr/FR-050.md) and [FR-075](../requirements/functional/fr/FR-075.md).

### Custom Timed Domain Mode

A [Timed Domain Mode](#timed-domain-mode) whose [Active Slots](#active-slots) are an explicitly chosen subset of the [Enabled Domain](#enabled-domain), maintained through [Custom Timed Domain Editing](#custom-timed-domain-editing).

Authoritative context: [FR-010](../requirements/functional/fr/FR-010.md), [FR-053](../requirements/functional/fr/FR-053.md), and [FR-054](../requirements/functional/fr/FR-054.md).

### Custom Timed Domain Editing

The slot-level editing UI available only in [Custom Timed Domain Mode](#custom-timed-domain-mode).
It adds or removes [Active Slots](#active-slots) without changing [Event Picked Dates](#event-picked-dates) or the canonical persistence model.

Authoritative context: [FR-010](../requirements/functional/fr/FR-010.md).

### Active Slot Settings

The persisted [Timed Event](#timed-event) configuration that determines [Active Slots](#active-slots).
It contains the [Timed Domain Mode](#timed-domain-mode) and, depending on the mode, an [Active Slot Range](#active-slot-range) ([Range Timed Domain Mode](#range-timed-domain-mode)) or the full [Active Slots](#active-slots) selection ([Custom Timed Domain Mode](#custom-timed-domain-mode)).

Authoritative context: [FR-056](../requirements/functional/fr/FR-056.md) and [FR-067](../requirements/functional/fr/FR-067.md).

### Active Slot Range

The start/end window in [Active Slot Settings](#active-slot-settings).
In [Range Timed Domain Mode](#range-timed-domain-mode) it defines the [Active Slots](#active-slots) generated for the event's current [Event Picked Dates](#event-picked-dates).

Authoritative context: [FR-050](../requirements/functional/fr/FR-050.md) and [FR-075](../requirements/functional/fr/FR-075.md).

### Event Timezone

The persisted timezone used to interpret [Event Picked Dates](#event-picked-dates) and generate the [Enabled Domain](#enabled-domain).
Changing it preserves **Event Picked Dates**, rebuilds the **Enabled Domain**, and filters [Active Slots](#active-slots) to the rebuilt domain.

Authoritative context: [FR-055](../requirements/functional/fr/FR-055.md) and [FR-057](../requirements/functional/fr/FR-057.md).

### Display Timezone

The timezone used to render [Time Slots](#time-slot) in the UI, controlled by the event-page **Display Timezone** control.
It affects projection and rendering only; it does not change [Event Picked Dates](#event-picked-dates), the [Enabled Domain](#enabled-domain), or [Active Slots](#active-slots).

Authoritative context: [FR-013](../requirements/functional/fr/FR-013.md) and [FR-047](../requirements/functional/fr/FR-047.md).

### Wipe Rule

On save, each [Active Slot](#active-slots) outside the [Enabled Domain](#enabled-domain) is dropped.
For example, this includes next-day `00:00` and `00:30` instants from a cross-midnight window on a picked UTC date.
Changing the [Event Timezone](#event-timezone) rebuilds the **Enabled Domain** and applies this rule; it does not alter [Event Picked Dates](#event-picked-dates) to preserve an otherwise out-of-domain [Slot](#slot).

Authoritative context: [FR-015](../requirements/functional/fr/FR-015.md) and [FR-057](../requirements/functional/fr/FR-057.md).

### End-of-Day Boundary

The picker option closing a [Civil Date](#civil-date), labeled `24:00` in both 12-hour and 24-hour pickers.
Selecting it renders as `00:00` in the next [Projected Date Column](#projected-date-column).
The [Wipe Rule](#wipe-rule) drops next-day instants beyond the enabled day this boundary closes.

Authoritative context: [FR-091](../requirements/functional/fr/FR-091.md) and [FR-015](../requirements/functional/fr/FR-015.md).

### Event Occurrence Span

The optional scheduled occurrence of an event.
It can be saved, replaced, or cleared, and its concrete shape depends on the event's [Event Kind](#event-kind).
A [Timed Event](#timed-event) schedules a [Timed Event Occurrence Span](#timed-event-occurrence-span).
A [Dates-Only Event](#dates-only-event) schedules a [Dates-Only Event Occurrence Span](#dates-only-event-occurrence-span).
The phrase "Scheduled Event Time" is a rejected alias for this concept.

Authoritative context: [FR-012](../requirements/functional/fr/FR-012.md).

### Timed Event Occurrence Span

The [Event Occurrence Span](#event-occurrence-span) of a [Timed Event](#timed-event).
It is a time range selected as the event's scheduled occurrence, and saving requires a non-empty range.

Authoritative context: [FR-012](../requirements/functional/fr/FR-012.md), [FR-086](../requirements/functional/fr/FR-086.md), and [FR-113](../requirements/functional/fr/FR-113.md).

### Dates-Only Event Occurrence Span

The [Event Occurrence Span](#event-occurrence-span) of a [Dates-Only Event](#dates-only-event).
It is a single date recorded as the event's scheduled occurrence.

Authoritative context: [FR-012](../requirements/functional/fr/FR-012.md).

### Event Settings

The settings that configure an event itself, rather than an individual [Event Response](#event-response).
Their scope includes the description, [Event Kind](#event-kind), [Event Picked Dates](#event-picked-dates), the [Event Timezone](#event-timezone) and [Display Timezone](#display-timezone), the [Event Time Format](#event-time-format) and [Display Time Format](#display-time-format), [Active Slot Settings](#active-slot-settings), and the [Active Slot Range](#active-slot-range).

Authoritative context: [FR-018](../requirements/functional/fr/FR-018.md).

### Archived Event

An event that its [Event Owner](#event-owner) has archived.

An **Archived Event** remains viewable through its [Event Link](#event-link) but is read-only: it accepts no [Event Response](#event-response) or [Event Settings](#event-settings) mutations until the **Event Owner** unarchives it.

Authoritative context: [FR-115](../requirements/functional/fr/FR-115.md).

## Event Pages

### Timed Event Page

One physical route renders every event-page surface in this family.
This page is the main page of a [Timed Event](#timed-event), where every [Event Response](#event-response) of the event is visible.
It is the umbrella for the owner, scheduling, response editing, and response creation variants below.

Authoritative context: [FR-002](../requirements/functional/fr/FR-002.md) and [FR-064](../requirements/functional/fr/FR-064.md).

### Timed Event Owner Page

This page shows a [Timed Event](#timed-event) as seen by its [Event Owner](#event-owner): `Edit Event` is available and [Event Settings](#event-settings) are editable rather than presented read-only to others.
Visibility differences are material under [Blind Availability Mode](#blind-availability-mode).

Authoritative context: [FR-018](../requirements/functional/fr/FR-018.md), [FR-039](../requirements/functional/fr/FR-039.md), and [FR-084](../requirements/functional/fr/FR-084.md).

### Timed Event Scheduling Page

This owner-only page schedules or reschedules a [Timed Event](#timed-event): the [Event Owner](#event-owner) selects a range on the [Timed Grid](#timed-grid) that sets or clears the [Timed Event Occurrence Span](#timed-event-occurrence-span) directly, without painting availability.
The phrases "specific-times page", "specific-times mode", and "specific-times editing" are rejected aliases for this page.

Authoritative context: [FR-016](../requirements/functional/fr/FR-016.md), [FR-085](../requirements/functional/fr/FR-085.md), and [FR-086](../requirements/functional/fr/FR-086.md).

### Timed Event Response Creation Page

This is the page where one adds a new [Event Response](#event-response) to a [Timed Event](#timed-event).
Saving requires at least one [Available](#available) or [If needed](#if-needed) [Slot](#slot).

Authoritative context: [FR-004](../requirements/functional/fr/FR-004.md).

### Timed Event Response Editing Page

This is the page where one can potentially edit an [Event Response](#event-response) of a [Timed Event](#timed-event); authority varies with access mode ([Protected Event Response](#protected-event-response) or [Open Event Response](#open-event-response)) and [Platform Visitor Identity](#platform-visitor-identity) recovery.

Authoritative context: [FR-060](../requirements/functional/fr/FR-060.md), [FR-061](../requirements/functional/fr/FR-061.md), and [FR-066](../requirements/functional/fr/FR-066.md).

### Dates-Only Event Page

One physical route renders every event-page surface in this family.
This page is the main page of a [Dates-Only Event](#dates-only-event), where every [Event Response](#event-response) of the event is visible.
It is the umbrella for the dates-only owner, scheduling, response editing, and response creation variants below.

Authoritative context: [FR-092](../requirements/functional/fr/FR-092.md) and [FR-101](../requirements/functional/fr/FR-101.md).

### Dates-Only Event Owner Page

This page shows a [Dates-Only Event](#dates-only-event) as seen by its [Event Owner](#event-owner): `Edit Event` is available and [Event Settings](#event-settings) are editable rather than presented read-only to others.

Authoritative context: [FR-018](../requirements/functional/fr/FR-018.md) and [FR-027](../requirements/functional/fr/FR-027.md).

### Dates-Only Event Scheduling Page

This owner-only page schedules or reschedules a [Dates-Only Event](#dates-only-event): the [Event Owner](#event-owner) selects a single date that sets or clears the [Dates-Only Event Occurrence Span](#dates-only-event-occurrence-span) directly.
The phrases "specific-times page", "specific-times mode", and "specific-times editing" are rejected aliases for this page.

Authoritative context: [FR-012](../requirements/functional/fr/FR-012.md) and [FR-027](../requirements/functional/fr/FR-027.md).

### Dates-Only Event Response Creation Page

This is the page where one adds a new [Event Response](#event-response) to a [Dates-Only Event](#dates-only-event).
Saving requires at least one [Available](#available) or [If needed](#if-needed) [Date Slot](#date-slot).

Authoritative context: [FR-004](../requirements/functional/fr/FR-004.md) and [FR-001](../requirements/functional/fr/FR-001.md).

### Dates-Only Event Response Editing Page

This is the page where one can potentially edit an [Event Response](#event-response) of a [Dates-Only Event](#dates-only-event); authority varies with access mode ([Protected Event Response](#protected-event-response) or [Open Event Response](#open-event-response)) and [Platform Visitor Identity](#platform-visitor-identity) recovery.

Authoritative context: [FR-060](../requirements/functional/fr/FR-060.md) and [FR-061](../requirements/functional/fr/FR-061.md).

## Identity & Access

### Platform Visitor

A person viewing any Timeful page.

Authoritative context: [FR-079](../requirements/functional/fr/FR-079.md).

### Platform Visitor Identity

The durable authenticated account identity for a person.
It can be associated with [Event Visitor Identities](#event-visitor-identity) for cross-browser recovery, but its raw value is not an event or [Event Response](#event-response) identifier.

Authoritative context: [FR-079](../requirements/functional/fr/FR-079.md).

### Account Profile

The account's profile fields: email, first name, last name, picture, timezone offset, custom-name preference, and usage counter.
It is distinct from the [Platform Visitor Identity](#platform-visitor-identity).

Authoritative context: [FR-123](../requirements/functional/fr/FR-123.md).

### Authenticated Platform Visitor

A [Platform Visitor](#platform-visitor) signed in with a [Platform Visitor Identity](#platform-visitor-identity).

Authoritative context: [FR-079](../requirements/functional/fr/FR-079.md).

### Anonymous Platform Visitor

A [Platform Visitor](#platform-visitor) not signed in with a [Platform Visitor Identity](#platform-visitor-identity).

Authoritative context: [FR-079](../requirements/functional/fr/FR-079.md).

### Event Visitor

A [Platform Visitor](#platform-visitor) viewing an event page.
Every **Event Visitor** has an [Event Visitor Identity](#event-visitor-identity) for that event.

Authoritative context: [FR-061](../requirements/functional/fr/FR-061.md) and [FR-073](../requirements/functional/fr/FR-073.md).

### Event Visitor Identity

The opaque, browser-local, event-scoped, non-authorizing identity established for every [Event Visitor](#event-visitor).
It persists across browser sessions and sign-out unless browser-local data is cleared.
A [Platform Visitor Identity](#platform-visitor-identity) may be associated with more than one **Event Visitor Identity** for an event, but is distinct from it.
The browser establishes an [Event Owner's](#event-owner) identity when event creation begins.

Authoritative context: [FR-073](../requirements/functional/fr/FR-073.md) and [FR-079](../requirements/functional/fr/FR-079.md).

### Authenticated Event Visitor

An [Event Visitor](#event-visitor) signed in with a [Platform Visitor Identity](#platform-visitor-identity).

Authoritative context: [FR-062](../requirements/functional/fr/FR-062.md), [FR-063](../requirements/functional/fr/FR-063.md), and [FR-079](../requirements/functional/fr/FR-079.md).

### Anonymous Event Visitor

An [Event Visitor](#event-visitor) not signed in with a [Platform Visitor Identity](#platform-visitor-identity).

Authoritative context: [FR-062](../requirements/functional/fr/FR-062.md) and [FR-063](../requirements/functional/fr/FR-063.md).

### Event Guest

An [Event Visitor](#event-visitor) who can create and own multiple [Event Responses](#event-response) through an [Event Visitor Identity](#event-visitor-identity).

Authoritative context: [FR-001](../requirements/functional/fr/FR-001.md), [FR-018](../requirements/functional/fr/FR-018.md), and [FR-073](../requirements/functional/fr/FR-073.md).

### Event Owner

An [Event Guest](#event-guest) with additional authority to manage an event's [Event Settings](#event-settings).
An **Event Owner** may associate that ownership with a [Platform Visitor Identity](#platform-visitor-identity) through [Event Sign-In](#event-sign-in).

Event ownership binds to exactly one [Platform Visitor Identity](#platform-visitor-identity).
Proving the [Event Owner Edit Token](#event-owner-edit-token) with a different **Platform Visitor Identity** moves the ownership to the proving identity, and the previously associated identity loses its authority.

Authoritative context: [FR-018](../requirements/functional/fr/FR-018.md) and [FR-063](../requirements/functional/fr/FR-063.md).

### Event Visitor Control Credential (EVCC)

A private browser-held credential that authorizes an [Event Visitor](#event-visitor) of a PostgreSQL event to manage every [Event Response](#event-response) owned by the visitor's [Event Visitor Identity](#event-visitor-identity) for that event.
It authorizes response management only and never authorizes [Event Settings](#event-settings) edits; this restriction does not apply to the [Granted Event Visitor Control Credential (Granted EVCC)](#granted-event-visitor-control-credential-granted-evcc) that an [Event Owner](#event-owner) issues.
It is distinct from the public, non-authorizing `eventVisitorId`, a [Platform Visitor Identity](#platform-visitor-identity), and legacy MongoDB response credentials.

Authoritative context: [FR-081](../requirements/functional/fr/FR-081.md), [QR-006](../requirements/quality/qr/QR-006.md), and [ADR-010](../design/architecture/adr/ADR-010.md).

### Granted Event Visitor Control Credential (Granted EVCC)

A private, browser-local, event-scoped credential issued to a target browser after a source-approved [Access Transfer](#access-transfer).
It is distinct from the source EVCC and preserves the source's delegated role without transferring ownership.
The source [Event Visitor Identity](#event-visitor-identity) remains the responses' owner; the **Granted EVCC** delegates management authority until the source revokes it or the target browser's data is cleared.
A **Granted EVCC** issued by an [Event Owner](#event-owner) additionally authorizes [Event Settings](#event-settings) edits as [FR-018](../requirements/functional/fr/FR-018.md) defines.

Authoritative context: [FR-018](../requirements/functional/fr/FR-018.md), [FR-081](../requirements/functional/fr/FR-081.md), [FR-083](../requirements/functional/fr/FR-083.md), and [ADR-010](../design/architecture/adr/ADR-010.md).

### Event Owner Edit Token

An opaque, event-scoped credential that authorizes an [Event Owner's](#event-owner) [Event Settings](#event-settings) edits.
It is a PostgreSQL-only credential; MongoDB events retain their legacy owner authorization unchanged.
It is distinct from guest-response credentials and does not authorize guest-response edits.

Authoritative context: [FR-018](../requirements/functional/fr/FR-018.md) and [FR-063](../requirements/functional/fr/FR-063.md).

### Event Response Edit Credential

The applicable opaque MongoDB credential that proves authority to edit a [Protected Event Response](#protected-event-response) before its owner is recoverable through an associated [Platform Visitor Identity](#platform-visitor-identity).
It is scoped to legacy MongoDB events and is distinct from an [Event Owner Edit Token](#event-owner-edit-token) and the PostgreSQL EVCC model.

Authoritative context: [FR-062](../requirements/functional/fr/FR-062.md).

### Access Transfer

A PostgreSQL-only, source-confirmed browser-to-browser process for granting another browser either a [Platform Visitor Identity](#platform-visitor-identity) session or delegated event authority.
The target displays a matching code that the source approves; the pending transfer is single-use and expires five minutes after creation.
The transfer delegates authority; it never transfers response, event, or [Event Visitor Identity](#event-visitor-identity) ownership.

Authoritative context: [FR-081](../requirements/functional/fr/FR-081.md), [FR-082](../requirements/functional/fr/FR-082.md), and [ADR-010](../design/architecture/adr/ADR-010.md).

### Event Sign-In

Sign-in performed within an event-page context, associating the [Event Visitor Identity](#event-visitor-identity) and restoring guest access, or associating event ownership with a [Platform Visitor Identity](#platform-visitor-identity) when a valid token is presented.
It is distinct from [Platform Sign-In](#platform-sign-in), whose availability is gated application-wide.

Authoritative context: [FR-062](../requirements/functional/fr/FR-062.md), [FR-063](../requirements/functional/fr/FR-063.md), and [FR-007](../requirements/functional/fr/FR-007.md).

### Platform Sign-In

Platform-wide authentication that signs a [Platform Visitor](#platform-visitor) in with a [Platform Visitor Identity](#platform-visitor-identity), distinct from [Event Sign-In](#event-sign-in)'s event-page context.
Its availability is gated application-wide.

Authoritative context: [FR-007](../requirements/functional/fr/FR-007.md).

### Sign-In Link

A registration or sign-in link sent by email that authenticates its recipient for the linked flow.

Authoritative context: [FR-031](../requirements/functional/fr/FR-031.md) and [FR-032](../requirements/functional/fr/FR-032.md).

## Integrations

### Calendar Connection

A linked external calendar together with the provider credentials and visibility preferences the account uses to read it.

Authoritative context: [FR-123](../requirements/functional/fr/FR-123.md).

## Responses

### Event Response

An [Event Guest's](#event-guest) recorded availability for an event, including its display name, access mode, and [Availability Statuses](#availability-status).
Its ownership belongs to the creating [Event Visitor Identity](#event-visitor-identity), not its display name.

Authoritative context: [FR-001](../requirements/functional/fr/FR-001.md), [FR-060](../requirements/functional/fr/FR-060.md), and [FR-061](../requirements/functional/fr/FR-061.md).

### Availability Status

The status an [Event Response](#event-response) assigns to a [Slot](#slot).
[Available](#available) and [If needed](#if-needed) count equally in overlap calculations.
[Unavailable](#unavailable) does not.

Authoritative context: [FR-006](../requirements/functional/fr/FR-006.md) and [FR-069](../requirements/functional/fr/FR-069.md).

#### Available

The [Availability Status](#availability-status) value recording that a [Slot](#slot) works for the respondent.
It contributes to overlap calculations exactly like [If needed](#if-needed) does.
Its canonical value spelling is the single capitalized word shown in this heading.

Authoritative context: [FR-006](../requirements/functional/fr/FR-006.md) and [FR-069](../requirements/functional/fr/FR-069.md).

#### If needed

The [Availability Status](#availability-status) value recording that a [Slot](#slot) works for the respondent when needed.
It contributes to overlap calculations exactly like [Available](#available) does.
The status label is always the two-word spelling shown in this heading; the hyphenated form appears only as an adjectival inflection, never as the status label itself.

Authoritative context: [FR-006](../requirements/functional/fr/FR-006.md) and [FR-069](../requirements/functional/fr/FR-069.md).

#### Unavailable

The [Availability Status](#availability-status) value recording that a [Slot](#slot) does not work for the respondent.
It does not contribute to overlap calculations.
Its canonical value spelling is the single capitalized word shown in this heading.

Authoritative context: [FR-006](../requirements/functional/fr/FR-006.md) and [FR-069](../requirements/functional/fr/FR-069.md).

### Protected Event Response

The default [Event Response](#event-response) access mode.
Only the [Event Guest](#event-guest) that owns the response may edit it through the applicable PostgreSQL EVCC authority, MongoDB [Event Response Edit Credential](#event-response-edit-credential), or associated [Platform Visitor Identity](#platform-visitor-identity).

Authoritative context: [FR-060](../requirements/functional/fr/FR-060.md), [FR-062](../requirements/functional/fr/FR-062.md), and [FR-073](../requirements/functional/fr/FR-073.md).

### Open Event Response

An [Event Response](#event-response) whose owning [Event Guest](#event-guest) has explicitly allowed any [Event Visitor](#event-visitor) to edit it.

Authoritative context: [FR-061](../requirements/functional/fr/FR-061.md).

### Blind Availability Mode

An event privacy mode in which a non-owner may view and manage only the [Event Responses](#event-response) the non-owner is authorized to manage, without learning about other responses or their count.
The [Event Owner](#event-owner) may view every **Event Response**.

Authoritative context: [FR-084](../requirements/functional/fr/FR-084.md).

### Event Response Overlay

The elevated rendering of the [Event Response](#event-response) being edited, shown above other **Event Responses** so its [Availability Statuses](#availability-status) stay visible and editable where other responses would otherwise paint over them.

Authoritative context: [FR-005](../requirements/functional/fr/FR-005.md).

### Availability Editing

The activity of creating, viewing, and editing [Event Responses](#event-response) on the response creation and editing pages.

Authoritative context: [FR-041](../requirements/functional/fr/FR-041.md), [FR-065](../requirements/functional/fr/FR-065.md), and [FR-066](../requirements/functional/fr/FR-066.md).

### Event Link

An event-scoped link whose validity gates disclosure of event metadata, respondent names, and availability data.
Without a valid **Event Link**, the system shall not disclose that information.

Authoritative context: [QR-001](../requirements/quality/qr/QR-001.md) and [QR-002](../requirements/quality/qr/QR-002.md).

## Presentation

### Timed Grid

The event-page grid that renders [Time Slots](#time-slot) and their availability or scheduling states.

Authoritative context: [FR-002](../requirements/functional/fr/FR-002.md) and [FR-014](../requirements/functional/fr/FR-014.md).

### Dates-Only Grid

The grid that renders a [Dates-Only Event's](#dates-only-event) dates and their availability or scheduling states.
It is the counterpart of the [Timed Grid](#timed-grid).

Authoritative context: [FR-099](../requirements/functional/fr/FR-099.md) and [FR-100](../requirements/functional/fr/FR-100.md).

### Projected Date Column

A grid column derived from [Time Slots](#time-slot) of the [Enabled Domain](#enabled-domain) projected into the [Display Timezone](#display-timezone).
A projected **Time Slot** belongs to its display-local calendar-date column; an adjacent column is created when that date is otherwise absent, and a slot crossing midnight is not duplicated.

Authoritative context: [FR-002](../requirements/functional/fr/FR-002.md).

### Sub-grid Gap

The visible separation between adjacent [Projected Date Columns](#projected-date-column) whose [Civil Dates](#civil-date) are not consecutive in the [Display Timezone](#display-timezone).
It splits a [Timed Grid](#timed-grid) into sub-grids and contains no grid cells.

Authoritative context: [FR-120](../requirements/functional/fr/FR-120.md).

### Grid Pointer

The interactive highlight marking the grid cell currently under the pointer during [Availability Editing](#availability-editing) or scheduling.
It is never rendered on collapsed-hours strips.

Authoritative context: [FR-095](../requirements/functional/fr/FR-095.md).

### Padding Cell

A [Timed Grid](#timed-grid) cell without a mapped [Slot](#slot) of the [Enabled Domain](#enabled-domain).
It is non-editable padding with a visually distinct unavailable treatment; it is not a [Slot](#slot).

Authoritative context: [FR-014](../requirements/functional/fr/FR-014.md).

### Disabled Status

The `Disabled` label and treatment shown when interacting with non-answerable cells.
In a [Dates-Only Grid](#dates-only-grid) it appears when hovering a disabled date, mirroring the [Timed Grid's](#timed-grid) disabled wording and treatment.

Authoritative context: [FR-099](../requirements/functional/fr/FR-099.md).

### Schedule Overlap

The event-page view that aggregates the [Availability Statuses](#availability-status) of the included [Event Responses](#event-response) per [Slot](#slot).
[Available](#available) and [If needed](#if-needed) count equally in **Schedule Overlap**; [Unavailable](#unavailable) does not contribute.

Authoritative context: [FR-064](../requirements/functional/fr/FR-064.md) and [FR-069](../requirements/functional/fr/FR-069.md).

### Legend Section

The event-page block labeled `Legend` explaining grid and response state colors.
It remains visible with zero [Event Responses](#event-response) and shows only states possible in the current mode.
It includes the [If needed](#if-needed) item for both [Event Kinds](#event-kind).

Authoritative context: [FR-009](../requirements/functional/fr/FR-009.md), [FR-092](../requirements/functional/fr/FR-092.md), and [FR-104](../requirements/functional/fr/FR-104.md).

### "Collapse disabled times" Option

The event-page switch whose state reflects whether all collapsible runs of a [Timed Grid](#timed-grid)'s disabled times are collapsed across every grid page.
Turning the switch on collapses every collapsible run and turning it off expands to the full civil-day axis.
Manually expanding a collapse band turns the switch off until collapse-all runs again, and only the collapsed or expanded baseline persists across reloads.

Authoritative context: [FR-011](../requirements/functional/fr/FR-011.md), [FR-014](../requirements/functional/fr/FR-014.md), and [FR-048](../requirements/functional/fr/FR-048.md).

### Event Time Format

The 12/24-hour format used to render times inside event-editor forms, including the `What times might work?` and `Time range` dropdowns and start/end time fields.
It persists independently of the [Display Time Format](#display-time-format), defaults to 24-hour, and changing it during event creation saves the new preference.

Authoritative context: [FR-024](../requirements/functional/fr/FR-024.md).

### Display Time Format

The format used to render times in the event-page schedule grid and tooltips, controlled by the event-page `12h/24h` switch.
It defaults to 24-hour and affects event-page rendering only, not event-editor forms.

Authoritative context: [FR-024](../requirements/functional/fr/FR-024.md) and [FR-046](../requirements/functional/fr/FR-046.md).

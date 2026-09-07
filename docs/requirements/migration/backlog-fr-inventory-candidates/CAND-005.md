---
id: CAND-005
verdict: proposed-requirement
requirement_type: FR
related_requirements: [FR-120]
confidence: confirmed
---

# CAND-005

## Source

> - [x] there should be a space between grids for non-consecutive days

## Candidate behavior

Adjacent [Projected Date Columns](../../../terminology/glossary.md#projected-date-column) whose [Civil Dates](../../../terminology/glossary.md#civil-date) are not consecutive in the [Display Timezone](../../../terminology/glossary.md#display-timezone) are separated by a [Sub-grid Gap](../../../terminology/glossary.md#sub-grid-gap) that splits the [Timed Grid](../../../terminology/glossary.md#timed-grid) into sub-grids.

## Applicability

Actor: event visitor.
Location: timed grid.
Event kind: timed.
Interaction mode: viewing.
Viewport: any.
State: non-consecutive displayed days.
Exclusions: consecutive days.

## Classification

candidate FR

## Existing Requirements and Confidence

FR-002 defines projected columns and their contents, not spacing; FR-093 presupposes the gap between split sub-grids without requiring it.
Confidence: confirmed.

## Disposition

Promoted to [FR-120](../../functional/fr/FR-120.md), reversing the earlier implementation-detail exclusion after product review confirmed the spacing behavior is durable, verifiable grid behavior.

## Open Questions

None.

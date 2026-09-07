---
id: CAND-108
verdict: proposed-requirement
requirement_type: FR
related_requirements: [FR-002, FR-093]
confidence: inferred
---

# CAND-108

## Source

> - [x] Given the selected dates are non-consecutive and make the grid split into sub-grids (e.g. Aug 6 and 9), when I click (desktop, mobile) or hover (desktop) in the space between sub-grids, the highlight and tooltip at the last selected timeslot must be cleared like when clicking or hovering inactive timeslots

[Source lines 440-440](../../../../backlog/backlog.md#L440-L440)

## Candidate behavior

Interacting in the [Sub-grid Gap](../../../terminology/glossary.md#sub-grid-gap) clears the prior slot highlight and tooltip.

## Applicability

Actor: event visitor; Location: timed grid; Event kind: timed; Interaction mode: click on desktop or mobile, hover on desktop; Viewport: desktop or mobile; State: non-consecutive dates split grid; Exclusions: contiguous grids.

## Classification

candidate FR

## Existing Requirements and Confidence

Overlap: accepted FR-002 projects timed slots into date columns but does not define inter-grid-space interaction.
Confidence: inferred.

## Disposition

Promoted to [FR-093](../../functional/fr/FR-093.md) with unified pointer-and-touch input.

## Open Questions

Should touch movement in the gap also clear selection?

import { landingScenario } from "./landing.js"
import { eventOptionsStyleScenario } from "./event-options-style.js"
import { eventOptionsStyleOnScenario } from "./event-options-style-on.js"
import { eventDescriptionStyleScenario } from "./event-description-style.js"
import { eventDescriptionRealScenario } from "./event-description-real.js"
import { eventHeaderActionsScenario } from "./event-header-actions.js"
import { eventRespondentsPanelScenario } from "./event-respondents-panel.js"
import { eventRespondentsPanelGuestEditScenario } from "./event-respondents-panel-guest-edit.js"
import { eventRespondentsPanelHoverScenario } from "./event-respondents-panel-hover.js"
import { eventBestTimesGridScenario } from "./event-best-times-grid.js"
import { eventCollapseHoursScenario } from "./event-collapse-hours.js"
import { eventHeatmapGridScenario } from "./event-heatmap-grid.js"
import { eventOverlayAvailabilityScenario } from "./event-overlay-availability.js"
import { newEventCalendarScenario } from "./new-event-calendar.js"
import { newEventFormScenario } from "./new-event-form.js"

import type { ScenarioDefinition } from "../types.js"

export const SCENARIOS: Record<string, ScenarioDefinition> = {
  landing: landingScenario,
  "new-event-form": newEventFormScenario,
  "new-event-calendar": newEventCalendarScenario,
  "event-options-style": eventOptionsStyleScenario,
  "event-options-style-on": eventOptionsStyleOnScenario,
  "event-description-style": eventDescriptionStyleScenario,
  "event-description-real": eventDescriptionRealScenario,
  "event-header-actions": eventHeaderActionsScenario,
  "event-respondents-panel": eventRespondentsPanelScenario,
  "event-respondents-panel-guest-edit": eventRespondentsPanelGuestEditScenario,
  "event-respondents-panel-hover": eventRespondentsPanelHoverScenario,
  "event-best-times-grid": eventBestTimesGridScenario,
  "event-collapse-hours": eventCollapseHoursScenario,
  "event-heatmap-grid": eventHeatmapGridScenario,
  "event-overlay-availability": eventOverlayAvailabilityScenario,
} as const

export type CompareTarget = keyof typeof SCENARIOS

export const SUPPORTED_TARGETS = Object.keys(SCENARIOS) as CompareTarget[]

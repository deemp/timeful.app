import type { Page } from "@playwright/test"

import type { PropertyName } from "./config.js"

export type InspectionTarget = {
  url: string
}

// Scenario modules receive the inspected frontend URL through this shared shape.
export type AppLabel = InspectionTarget

export type SelectorElementDescriptor = {
  name: string
  kind: "selector"
  selector: string
}

export type TextElementDescriptor = {
  name: string
  kind: "text" | "containsText"
  selector: string
  text: string
}

export type SpecialElementDescriptor = {
  name: string
  kind:
    | "heroCopy"
    | "newEventDialog"
    | "daysOnlyToggle"
    | "daysOnlyToggleFrame"
    | "daysOnlyToggleActiveLabel"
    | "advancedOptionsContent"
    | "advancedOptionsDisabledLabel"
    | "advancedOptionsSignInPrompt"
    | "advancedOptionsSignInLink"
    | "eventOptionsSection"
    | "eventOptionsSwitch"
    | "eventOptionsSwitchTrack"
    | "eventOptionsSwitchThumb"
    | "timeIncrementSelect"
    | "timezoneLabel"
    | "calendarMonthLabel"
    | "calendarYearLabel"
    | "calendarSelectedDay"
    | "respondentSelectionControl"
}

export type ElementDescriptor =
  | SelectorElementDescriptor
  | TextElementDescriptor
  | SpecialElementDescriptor

export type ScenarioDefinition = {
  readySelector: string
  elements: ElementDescriptor[]
  readyTimeoutMs?: number
  skipInitialGoto?: boolean
  prepare: (page: Page, target: InspectionTarget) => Promise<void>
}

export type Box = {
  width: number
  height: number
  x: number
  y: number
}

export type ElementProperties = Record<PropertyName, string>

export type SnapshotElement = {
  tagName: string
  className: string
  text: string
  box: Box
  properties: ElementProperties
}

export type SnapshotEntry = [name: string, element: SnapshotElement | null]
export type Snapshot = Record<string, SnapshotElement | null>

import type { Page } from "@playwright/test"

import { FLATTENED_PROPERTIES } from "./config.js"
import { resolveSnapshotEntries } from "./dom-resolvers.js"
import { preparePage, runWithPhaseTimeout } from "./page.js"

import type { InspectionTarget, ScenarioDefinition, Snapshot, SnapshotEntry } from "./types.js"

export async function collectStyles(
  page: Page,
  target: InspectionTarget,
  scenario: ScenarioDefinition,
): Promise<Snapshot> {
  console.error("[inspect] collect:start")
  await preparePage(page, target, scenario)

  console.error("[inspect] evaluate:start")
  const entries = (await runWithPhaseTimeout(
    "page.evaluate",
    page.evaluate(
      `((args) => {
        const __name = (target) => target
        return (${resolveSnapshotEntries.toString()})(args)
      })(${JSON.stringify({
        elements: scenario.elements,
        flattenedProperties: FLATTENED_PROPERTIES,
      })})`,
    ),
  )) as SnapshotEntry[]
  console.error("[inspect] evaluate:done")

  console.error("[inspect] collect:done")
  return Object.fromEntries(entries)
}

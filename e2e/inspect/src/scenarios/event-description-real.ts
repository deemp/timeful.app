import type { ScenarioDefinition } from "../types.js"
import {
  dismissConsentIfPresent,
  gotoComparatorEventUrl,
  resolveComparatorEventPath,
} from "./helpers.js"

export const eventDescriptionRealScenario = {
  skipInitialGoto: true,
  readySelector: "body",
  elements: [
    {
      name: "description",
      kind: "selector",
      selector: ".event-description-copy",
    },
  ],
  prepare: async (page, label) => {
    await gotoComparatorEventUrl(
      page,
      new URL(resolveComparatorEventPath(), label.url).toString(),
      "event-description-real",
    )
    await dismissConsentIfPresent(page)
    await page.waitForTimeout(1000)
  },
} satisfies ScenarioDefinition

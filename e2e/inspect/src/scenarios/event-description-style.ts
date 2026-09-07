import type { ScenarioDefinition } from "../types.js"

const TEST_PATH = "/test"

export const eventDescriptionStyleScenario = {
  readySelector: "#event-description-preview-fixture",
  elements: [
    {
      name: "previewDescription",
      kind: "selector",
      selector: "#event-description-preview-fixture .event-description-copy",
    },
    {
      name: "emptyDescription",
      kind: "selector",
      selector: "#event-description-empty-fixture .event-description-shell",
    },
  ],
  prepare: async (page, label) => {
    await page.goto(new URL(TEST_PATH, label.url).toString(), {
      waitUntil: "domcontentloaded",
    })
  },
} satisfies ScenarioDefinition

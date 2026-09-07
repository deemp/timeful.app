import type { ScenarioDefinition } from "../types.js"

export const landingScenario = {
  readySelector: "h1",
  elements: [
    {
      name: "headerRow",
      kind: "selector",
      selector: ".tw-relative.tw-m-auto.tw-flex.tw-h-full.tw-max-w-5xl",
    },
    {
      name: "headerBrand",
      kind: "selector",
      selector:
        ".tw-relative.tw-m-auto.tw-flex.tw-h-full.tw-max-w-5xl > :first-child",
    },
    {
      name: "headerActions",
      kind: "selector",
      selector:
        ".tw-relative.tw-m-auto.tw-flex.tw-h-full.tw-max-w-5xl > :last-child",
    },
    { name: "heroCopy", kind: "heroCopy" },
    { name: "heroBadge", kind: "selector", selector: ".landing-github-badge" },
    { name: "heroHeadingWrap", kind: "selector", selector: ".landing-hero-heading" },
    { name: "heroHeading", kind: "text", selector: "h1", text: "Find a time to meet" },
    {
      name: "heroSubtitle",
      kind: "containsText",
      selector: "div, p, span",
      text: "Coordinate group meetings without the back and forth.",
    },
    { name: "calendarLink", kind: "text", selector: "span, a", text: "calendar" },
  ],
  prepare: async () => {},
} satisfies ScenarioDefinition

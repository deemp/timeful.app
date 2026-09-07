import { openNewEventDialog } from "./helpers.js"

import type { ScenarioDefinition } from "../types.js"

const SELECTED_DATE = "2026-05-15"
async function clickCalendarDate(page: import("@playwright/test").Page, date: string) {
  await page.locator(`[data-v-date="${date}"]`).click()
}

async function collectSelectedDates(page: import("@playwright/test").Page) {
  return page.$$eval(".v-date-picker-month__day--selected[data-v-date]", (nodes) =>
    nodes
      .map((node) => (node instanceof HTMLElement ? node.dataset.vDate : undefined))
      .filter((date): date is string => Boolean(date))
      .sort(),
  )
}

function assertSelectedDates(selectedDates: string[], expectedDates: string[]) {
  if (JSON.stringify(selectedDates) !== JSON.stringify(expectedDates)) {
    throw new Error(
      `Selected dates mismatch: expected ${JSON.stringify(expectedDates)}, got ${JSON.stringify(selectedDates)}`,
    )
  }
}

async function selectStableCalendarDate(page: import("@playwright/test").Page) {
  await clickCalendarDate(page, SELECTED_DATE)
  await page.waitForTimeout(50)
}

export const newEventCalendarScenario = {
  readySelector: "button",
  elements: [
    {
      name: "calendarQuestion",
      kind: "text",
      selector: "div, span, label",
      text: "What dates might work?",
    },
    {
      name: "calendarHelper",
      kind: "text",
      selector: "div, span, label",
      text: "Drag to select multiple dates",
    },
    {
      name: "calendarPicker",
      kind: "selector",
      selector: ".v-picker, .v-date-picker",
    },
    {
      name: "calendarControls",
      kind: "selector",
      selector: ".v-date-picker-header, .v-date-picker-controls",
    },
    {
      name: "calendarMonthLabel",
      kind: "calendarMonthLabel",
    },
    {
      name: "calendarYearLabel",
      kind: "calendarYearLabel",
    },
    {
      name: "calendarSelectedDay",
      kind: "calendarSelectedDay",
    },
  ],
  prepare: async (page) => {
    await openNewEventDialog(page)
    await page.waitForFunction(() => {
      const helper = Array.from(document.querySelectorAll("div, span, label")).find(
        (node) => node.textContent?.trim() === "Drag to select multiple dates",
      )
      const picker = document.querySelector(".v-picker, .v-date-picker")
      return Boolean(helper && picker)
    })
    await selectStableCalendarDate(page)
  },
} satisfies ScenarioDefinition

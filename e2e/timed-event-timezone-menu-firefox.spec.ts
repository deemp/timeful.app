import { expect, test, type Page } from "@playwright/test"
import { Temporal } from "temporal-polyfill"
import {
  buildSpecificDateSeed,
  buildUtcSpecificTimesRangeInstants,
  openEventPage,
  seedCanonicalTimedEvent,
} from "./helpers/timed-event-helpers"
import { settlePage } from "./helpers/settle"

const TIMEZONE_MENU_WIDTH = 520

async function openTimezoneMenu(page: Page): Promise<void> {
  const triggerRoot = page.getByTestId("timezone-select-trigger").first()
  const trigger = triggerRoot.getByRole("combobox").first()

  await triggerRoot.scrollIntoViewIfNeeded()
  await expect(trigger).toBeVisible({ timeout: 30000 })

  const activeOptions = page.locator(
    '.v-overlay-container .v-overlay--active [data-testid="timezone-select-option"]:visible',
  )
  for (const openAction of [
    async () => triggerRoot.click({ force: true }),
    async () => trigger.click({ force: true }),
    async () => trigger.press("ArrowDown"),
    async () => trigger.press("Enter"),
    async () => trigger.press(" "),
  ]) {
    if ((await activeOptions.count()) > 0) {
      break
    }
    await openAction()
    await settlePage(page, 150)
  }
  await expect
    .poll(
      async () =>
        page.locator('[data-testid="timezone-select-option"]:visible').count(),
      { timeout: 15000 },
    )
    .toBeGreaterThan(0)
}

function activeTimezoneMenuContent(page: Page) {
  return page.locator(
    '.v-overlay-container .v-overlay--active:has([data-testid="timezone-select-option"]) .v-overlay__content',
  )
}

test("the open timezone menu keeps a fixed width regardless of the longest visible item", async ({
  page,
  request,
}) => {
  const today = Temporal.Now.plainDateISO()
  const selectedDays = [today.toString()]
  const activeSlots = buildUtcSpecificTimesRangeInstants({
    day: today.toString(),
    startHour: 9,
    startMinute: 0,
    endHour: 10,
    endMinute: 0,
    incrementMinutes: 60,
  })

  const { shortId } = await seedCanonicalTimedEvent(
    request,
    buildSpecificDateSeed({
      name: "Timezone menu fixed width regression",
      selectedDays,
      activeSlots,
      eventTimezone: "UTC",
      startTimeLocal: "09:00",
      endTimeLocal: "17:00",
      timeIncrementMinutes: 60,
    }),
  )
  await openEventPage(page, shortId)

  await openTimezoneMenu(page)

  const content = activeTimezoneMenuContent(page)
  await expect(content).toBeVisible()
  const box = await content.boundingBox()
  expect(box).not.toBeNull()
  if (!box)
    throw new Error("Expected the timezone menu overlay to have a bounding box")

  const menuWidthPx = Math.round(box.width)
  // Firefox subtracts its vertical scrollbar width from Vuetify's menu width.
  const tolerance = 6
  expect(menuWidthPx).toBeGreaterThanOrEqual(TIMEZONE_MENU_WIDTH - tolerance)
  expect(menuWidthPx).toBeLessThanOrEqual(TIMEZONE_MENU_WIDTH + tolerance)
})

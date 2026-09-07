import { expect, test } from "@playwright/test"
import {
  buildSpecificDateSeed,
  openEventPage,
  seedCanonicalTimedEvent,
} from "./helpers/timed-event-helpers"
import { Temporal } from "temporal-polyfill"

test("renders a saved multiline description without edit controls", async ({
  page,
  request,
}) => {
  const today = Temporal.Now.instant()
    .toZonedDateTimeISO("UTC")
    .toPlainDate()
    .toString()
  const seed = await seedCanonicalTimedEvent(request, {
    ...buildSpecificDateSeed({
      name: `Multiline description ${Temporal.Now.instant().epochMilliseconds}`,
      selectedDays: [today],
      activeSlots: [`${today}T09:00:00.000Z`],
      eventTimezone: "UTC",
      startTimeLocal: "09:00",
      endTimeLocal: "17:00",
      timeIncrementMinutes: 60,
    }),
    description: "First line\nSecond line\nThird line",
  })

  await openEventPage(page, seed.shortId)

  await expect(page.locator(".event-description-copy")).toHaveText(
    "First line\nSecond line\nThird line",
  )
  await expect(page.locator(".event-description-edit-button")).toHaveCount(0)
  await expect(page.locator('[contenteditable="true"]')).toHaveCount(0)
})

test("omits the description card when an event has no description", async ({
  page,
  request,
}, testInfo) => {
  const today = Temporal.Now.instant()
    .toZonedDateTimeISO("UTC")
    .toPlainDate()
    .toString()
  const seed = await seedCanonicalTimedEvent(request, {
    ...buildSpecificDateSeed({
      name: `Empty description ${Temporal.Now.instant().epochMilliseconds}`,
      selectedDays: [today],
      activeSlots: [`${today}T09:00:00.000Z`],
      eventTimezone: "UTC",
      startTimeLocal: "09:00",
      endTimeLocal: "17:00",
      timeIncrementMinutes: 60,
    }),
    description: "",
  })

  await openEventPage(page, seed.shortId)

  await expect(page.locator(".event-description-shell")).toHaveCount(0)
  await expect(
    page.getByRole("button", { name: /add description/i }),
  ).toHaveCount(0)
  await expect(page.locator(".event-header-description")).toHaveCount(0)

  if (testInfo.project.name !== "chromium-desktop") {
    return
  }

  const alignment = await page.evaluate(() => {
    const header = document.querySelector<HTMLElement>("#event-header")
    const scheduleAction = document.querySelector<HTMLElement>(
      "#desktop-schedule-event-btn",
    )?.parentElement

    if (!header || !scheduleAction) {
      return null
    }

    return {
      headerRight: header.getBoundingClientRect().right,
      scheduleRight: scheduleAction.getBoundingClientRect().right,
    }
  })

  expect(alignment).not.toBeNull()
  if (!alignment) {
    throw new Error("Expected the desktop Schedule event action")
  }
  expect(
    Math.abs(alignment.headerRight - alignment.scheduleRight),
  ).toBeLessThanOrEqual(1)
})

test("omits whitespace-only descriptions and their mobile header layout", async ({
  page,
  request,
}) => {
  await page.setViewportSize({ width: 390, height: 844 })
  const today = Temporal.Now.instant()
    .toZonedDateTimeISO("UTC")
    .toPlainDate()
    .toString()
  const seed = await seedCanonicalTimedEvent(request, {
    ...buildSpecificDateSeed({
      name: `Whitespace description ${Temporal.Now.instant().epochMilliseconds}`,
      selectedDays: [today],
      activeSlots: [`${today}T09:00:00.000Z`],
      eventTimezone: "UTC",
      startTimeLocal: "09:00",
      endTimeLocal: "17:00",
      timeIncrementMinutes: 60,
    }),
    description: " \n\t ",
  })

  await openEventPage(page, seed.shortId)

  await expect(page.locator(".event-description-shell")).toHaveCount(0)
  await expect(page.locator(".event-header-description")).toHaveCount(0)
})

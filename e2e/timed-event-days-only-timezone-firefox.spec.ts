import { expect, test } from "@playwright/test"
import { Temporal } from "temporal-polyfill"
import {
  changeTimezone,
  openEditDialog,
  openEventPage,
  seedCanonicalTimedEvent,
} from "./helpers/timed-event-helpers"
import { settlePage } from "./helpers/settle"

test.describe.configure({ mode: "serial" })

function compactOffsetForZone(
  zoneId: string,
  referenceDate: Temporal.ZonedDateTime,
): string {
  const offsetMinutes = Math.round(
    referenceDate.withTimeZone(zoneId).offsetNanoseconds /
      (1000 * 1000 * 1000 * 60),
  )
  const sign = offsetMinutes < 0 ? "-" : "+"
  const absMinutes = Math.abs(offsetMinutes)
  const hours = Math.floor(absMinutes / 60)
  const minutes = absMinutes % 60
  return `${sign}${String(hours)}:${String(minutes).padStart(2, "0")}`
}

test("persists a days-only event timezone through save and immediate reopen", async ({
  page,
  request,
}) => {
  const today = Temporal.Now.plainDateISO().toString()
  const now = Temporal.Now.instant()
  const savedTimezone = "America/Juneau"
  const { shortId } = await seedCanonicalTimedEvent(request, {
    name: `Days-only timezone roundtrip ${String(now.epochMilliseconds)}`,
    type: "specific_dates",
    daysOnly: true,
    dates: [`${today}T00:00:00.000Z`],
    eventTimezone: "America/Tijuana",
    slotGeneration: {
      startTimeLocal: "09:00",
      endTimeLocal: "17:00",
      timeIncrementMinutes: 60,
    },
    timedRecurrence: {
      kind: "specific_dates",
      selectedDays: [today],
      selectedDaysOfWeek: [],
      startOnMonday: false,
    },
  })

  await openEventPage(page, shortId)
  const editorCard = await openEditDialog(page)
  const tijuanaOffset = compactOffsetForZone(
    "America/Tijuana",
    Temporal.Now.zonedDateTimeISO(),
  )
  await expect(
    editorCard.locator(".timezone-select__selection-text"),
  ).toHaveText(tijuanaOffset)
  await changeTimezone(page, { optionValue: savedTimezone })

  const putResponsePromise = page.waitForResponse(
    (response) =>
      response.request().method() === "PUT" &&
      response.url().includes("/api/events/"),
  )
  const refreshedEventPromise = page.waitForResponse(
    (response) =>
      response.request().method() === "GET" &&
      new URL(response.url()).pathname === `/api/events/${shortId}`,
  )
  await page.locator(".new-event-submit-button").click({ force: true })

  const putResponse = await putResponsePromise
  expect(putResponse.ok()).toBeTruthy()
  expect(putResponse.request().postDataJSON()).toMatchObject({
    daysOnly: true,
    eventTimezone: savedTimezone,
  })

  const refreshedEvent = await refreshedEventPromise
  expect(refreshedEvent.ok()).toBeTruthy()
  expect(
    ((await refreshedEvent.json()) as { eventTimezone?: string }).eventTimezone,
  ).toBe(savedTimezone)
  await expect(page.getByRole("dialog")).toBeHidden()
  await expect(page.getByTestId("event-timezone")).toContainText("Alaska")
  await settlePage(page, 500)

  const juneauOffset = compactOffsetForZone(
    "America/Juneau",
    Temporal.Now.zonedDateTimeISO(),
  )
  const immediatelyReopenedEditor = await openEditDialog(page)
  await expect(
    immediatelyReopenedEditor.locator(".timezone-select__selection-text"),
  ).toHaveText(juneauOffset)

  await page.reload({ waitUntil: "domcontentloaded" })
  const reloadedEditor = await openEditDialog(page)
  await expect(
    reloadedEditor.locator(".timezone-select__selection-text"),
  ).toHaveText(juneauOffset)
})

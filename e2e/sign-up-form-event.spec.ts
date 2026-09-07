import { expect, test } from "@playwright/test"
import { Temporal } from "temporal-polyfill"
import { openEventPage } from "./helpers/timed-event-helpers"

test.describe.configure({ mode: "serial" })

test("sign-up blocks are visible on the event page", async ({
  page,
  request,
}) => {
  const now = Temporal.Now.instant()
  const today = Temporal.Now.plainDateISO("UTC").toString()

  // Seed a sign-up event
  const signUpBlocks = [
    {
      name: "Morning Slot",
      capacity: 3,
      startDate: `${today}T09:00:00.000Z`,
      endDate: `${today}T10:00:00.000Z`,
    },
  ]

  const response = await request.post("/api/events", {
    data: {
      name: `Sign-Up Test ${String(now.epochMilliseconds)}`,
      type: "specific_dates",
      activeSlots: [
        `${today}T09:00:00.000Z`,
        `${today}T10:00:00.000Z`,
        `${today}T11:00:00.000Z`,
      ],
      eventTimezone: "UTC",
      slotGeneration: {
        startTimeLocal: "09:00",
        endTimeLocal: "17:00",
        timeIncrementMinutes: 60,
      },
      timedRecurrence: {
        kind: "specific_dates",
        selectedDays: [today],
        selectedDaysOfWeek: [],
        startOnMonday: true,
      },
      isSignUpForm: true,
      signUpBlocks,
      daysOnly: false,
      notificationsEnabled: false,
      blindAvailabilityEnabled: false,
      collectEmails: false,
      sendEmailAfterXResponses: -1,
    },
  })

  expect(response.ok()).toBeTruthy()
  const { shortId } = (await response.json()) as {
    shortId: string
    eventId: string
  }
  expect(shortId).toBeTruthy()

  // Open the event page
  await openEventPage(page, shortId)

  // Verify "Slots" heading is visible
  const slotsHeading = page.getByText("Slots", { exact: true })
  await expect(slotsHeading.first()).toBeVisible()

  // Verify the sign-up block name is visible in the sidebar list
  const blockName = page.getByText("Morning Slot", { exact: true })
  await expect(blockName.first()).toBeVisible()
})

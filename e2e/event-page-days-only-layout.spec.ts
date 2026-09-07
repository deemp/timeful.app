import { expect, test } from "@playwright/test"
import {
  openEditDialog,
  openEventPage,
  seedCanonicalTimedEvent,
  waitForScheduleOverlapMounted,
} from "./helpers/timed-event-helpers"
import { measureVisualGap } from "./helpers/visual-gap-helpers"
import { Temporal } from "temporal-polyfill"

test.describe.configure({ mode: "serial" })

test("dates-only event Edit event opens the dates-only editor", async ({
  page,
  request,
}) => {
  const now = Temporal.Now.instant()
  const today = now.toZonedDateTimeISO("UTC").toPlainDate().toString()
  const tomorrow = now
    .toZonedDateTimeISO("UTC")
    .toPlainDate()
    .add({ days: 1 })
    .toString()

  const seed = await seedCanonicalTimedEvent(request, {
    name: `Dates-only edit dialog ${String(now.epochMilliseconds)}`,
    type: "specific_dates",
    daysOnly: true,
    dates: [`${today}T00:00:00.000Z`, `${tomorrow}T00:00:00.000Z`],
    eventTimezone: "UTC",
    slotGeneration: {
      startTimeLocal: "09:00",
      endTimeLocal: "17:00",
      timeIncrementMinutes: 60,
    },
    timedRecurrence: {
      kind: "specific_dates",
      selectedDays: [today, tomorrow],
      selectedDaysOfWeek: [],
      startOnMonday: false,
    },
  })

  await openEventPage(page, seed.shortId)
  await expect(page.locator("#edit-event-btn")).toBeVisible()

  const editorCard = await openEditDialog(page)
  await expect(
    page.getByRole("dialog").getByText("Edit event", { exact: true }),
  ).toBeVisible()
  await expect(editorCard.getByText("What dates might work?")).toBeVisible()
  await expect(
    editorCard.getByText("Drag to select multiple dates"),
  ).toBeVisible()
  await expect(editorCard.getByText("What times might work?")).not.toBeVisible()
})

test("days-only event page without responses shows an inline Start on Monday switch aligned with Add availability", async ({
  page,
  request,
}, testInfo) => {
  test.skip(
    testInfo.project.name === "chromium-mobile",
    "Desktop-only header layout",
  )

  const now = Temporal.Now.instant()
  const today = now.toZonedDateTimeISO("UTC").toPlainDate().toString()
  const tomorrow = now
    .toZonedDateTimeISO("UTC")
    .toPlainDate()
    .add({ days: 1 })
    .toString()

  const seed = await seedCanonicalTimedEvent(request, {
    name: `Days-only layout test ${String(now.epochMilliseconds)}`,
    type: "specific_dates",
    daysOnly: true,
    dates: [`${today}T00:00:00.000Z`, `${tomorrow}T00:00:00.000Z`],
    eventTimezone: "UTC",
    slotGeneration: {
      startTimeLocal: "09:00",
      endTimeLocal: "17:00",
      timeIncrementMinutes: 60,
    },
    timedRecurrence: {
      kind: "specific_dates",
      selectedDays: [today, tomorrow],
      selectedDaysOfWeek: [],
      startOnMonday: false,
    },
  })

  await openEventPage(page, seed.shortId)

  const addAvailabilityBtn = page.locator("#desktop-primary-availability-btn")
  await expect(addAvailabilityBtn).toBeVisible()
  await expect(addAvailabilityBtn).toHaveText(/Add availability/i)
  await expect(
    page.getByRole("button", { name: /^Schedule event$/i }),
  ).toBeVisible()

  const startOnMondayToggle = page.locator("#start-calendar-on-monday-toggle")
  await expect(startOnMondayToggle).toBeVisible()

  const moreOptions = page.locator("#desktop-header-more-options")
  await expect(moreOptions).not.toBeVisible()

  if (testInfo.project.name === "chromium-desktop") {
    const startOnMondaySwitch = page.locator(
      "#desktop-header-start-calendar-on-monday .v-input",
    )
    const [addAvailabilityBox, startOnMondayBox] = await Promise.all([
      addAvailabilityBtn.boundingBox(),
      startOnMondaySwitch.boundingBox(),
    ])

    if (addAvailabilityBox === null || startOnMondayBox === null) {
      throw new Error(
        "Expected Add availability and Start on Monday to have boxes",
      )
    }

    expect(
      Math.abs(
        addAvailabilityBox.x +
          addAvailabilityBox.width / 2 -
          (startOnMondayBox.x + startOnMondayBox.width / 2),
      ),
    ).toBeLessThanOrEqual(2)
  }
})

test("days-only event editing with responses shows Start on Monday to the right of Overlay availability", async ({
  page,
  request,
}, testInfo) => {
  test.skip(
    testInfo.project.name === "chromium-mobile",
    "Desktop-only header layout",
  )

  const now = Temporal.Now.instant()
  const today = now.toZonedDateTimeISO("UTC").toPlainDate().toString()
  const tomorrow = now
    .toZonedDateTimeISO("UTC")
    .toPlainDate()
    .add({ days: 1 })
    .toString()

  const seed = await seedCanonicalTimedEvent(request, {
    name: `Days-only overlay editing ${String(now.epochMilliseconds)}`,
    type: "specific_dates",
    daysOnly: true,
    dates: [`${today}T00:00:00.000Z`, `${tomorrow}T00:00:00.000Z`],
    eventTimezone: "UTC",
    slotGeneration: {
      startTimeLocal: "09:00",
      endTimeLocal: "17:00",
      timeIncrementMinutes: 60,
    },
    timedRecurrence: {
      kind: "specific_dates",
      selectedDays: [today, tomorrow],
      selectedDaysOfWeek: [],
      startOnMonday: false,
    },
  })

  const guestResponse = await request.post(
    `/api/events/${seed.eventId}/response`,
    {
      data: {
        guest: true,
        name: "Days-only Guest",
        email: "",
        availability: [`${today}T00:00:00.000Z`, `${tomorrow}T00:00:00.000Z`],
        ifNeeded: [],
        guestEditPolicy: "open",
      },
    },
  )
  expect(guestResponse.ok()).toBeTruthy()
  const guestBody = (await guestResponse.json()) as {
    guestCredentials?: {
      name?: string
      guestId: string
      guestEditToken: string
      guestEditPolicy: string
      guestOwnershipMode: string
    }
  }
  const guestCredentials = guestBody.guestCredentials
  if (guestCredentials == null || guestCredentials.guestId.length === 0) {
    throw new Error("Expected the guest response to return credentials")
  }

  const seededEvent = await request.get(`/api/events/${seed.shortId}`)
  expect(seededEvent.ok()).toBeTruthy()
  const seededEventBody = (await seededEvent.json()) as {
    _id?: string
  }
  const eventMongoId = seededEventBody._id
  if (eventMongoId == null || eventMongoId.length === 0) {
    throw new Error("Expected the seeded event to expose its Mongo id")
  }

  await page.addInitScript(
    ({ eventId, guestCredentials }) => {
      const record = {
        name: guestCredentials.name ?? "Days-only Guest",
        guestId: guestCredentials.guestId,
        guestEditToken: guestCredentials.guestEditToken,
        guestEditPolicy: guestCredentials.guestEditPolicy,
        guestOwnershipMode: guestCredentials.guestOwnershipMode,
        lookupKey: guestCredentials.guestId,
        lastUsedAt: Temporal.Now.instant().epochMilliseconds,
      }
      localStorage.setItem(
        `${eventId}.guestOwnershipCollection`,
        JSON.stringify({
          version: 1,
          selectedLookupKey: record.guestId,
          records: [record],
        }),
      )
    },
    { eventId: eventMongoId, guestCredentials },
  )

  await openEventPage(page, seed.shortId)
  await waitForScheduleOverlapMounted(page)
  const editAvailabilityBtn = page.locator("#desktop-primary-availability-btn")
  await expect(editAvailabilityBtn).toBeVisible()
  await expect(editAvailabilityBtn).toHaveText(/Edit availability/i)
  await editAvailabilityBtn.click()

  const overlayToggle = page.locator("#overlay-availabilities-toggle")
  const startOnMondayToggle = page.locator(
    "#desktop-editing-start-calendar-on-monday-toggle",
  )
  await expect(overlayToggle).toBeVisible()
  await expect(startOnMondayToggle).toBeVisible()
  await expect(page.locator("#desktop-editing-more-options")).not.toBeVisible()

  const [overlayBox, startOnMondayBox] = await Promise.all([
    overlayToggle.boundingBox(),
    startOnMondayToggle.boundingBox(),
  ])

  if (overlayBox === null || startOnMondayBox === null) {
    throw new Error(
      "Expected Overlay availability and Start on Monday to have boxes",
    )
  }

  expect(startOnMondayBox.x).toBeGreaterThanOrEqual(
    overlayBox.x + overlayBox.width - 2,
  )
  expect(
    Math.abs(
      overlayBox.y +
        overlayBox.height / 2 -
        (startOnMondayBox.y + startOnMondayBox.height / 2),
    ),
  ).toBeLessThanOrEqual(2)
})

test("dates-only event timezone top edge stays aligned with the grid top edge", async ({
  page,
  request,
}, testInfo) => {
  test.skip(
    testInfo.project.name === "chromium-mobile",
    "Desktop-only sidebar layout",
  )

  const now = Temporal.Now.instant()
  const today = now.toZonedDateTimeISO("UTC").toPlainDate().toString()
  const tomorrow = now
    .toZonedDateTimeISO("UTC")
    .toPlainDate()
    .add({ days: 1 })
    .toString()

  const seed = await seedCanonicalTimedEvent(request, {
    name: `Days-only responses alignment ${String(now.epochMilliseconds)}`,
    type: "specific_dates",
    daysOnly: true,
    dates: [`${today}T00:00:00.000Z`, `${tomorrow}T00:00:00.000Z`],
    eventTimezone: "UTC",
    slotGeneration: {
      startTimeLocal: "09:00",
      endTimeLocal: "17:00",
      timeIncrementMinutes: 60,
    },
    timedRecurrence: {
      kind: "specific_dates",
      selectedDays: [today, tomorrow],
      selectedDaysOfWeek: [],
      startOnMonday: false,
    },
  })

  await openEventPage(page, seed.shortId)

  const monthGrid = page.locator(".schedule-overlap-days-only-grid__month")
  await expect(monthGrid).toBeVisible()

  const eventTimezone = page.getByTestId("event-timezone")
  const responsesHeading = page.getByText("Responses", { exact: true })
  await expect(eventTimezone).toHaveText("Timezone: (GMT+0:00) UTC")
  await expect(responsesHeading).toBeVisible()

  const [monthBox, timezoneBox, headingBox] = await Promise.all([
    monthGrid.boundingBox(),
    eventTimezone.boundingBox(),
    responsesHeading.boundingBox(),
  ])

  if (monthBox === null || timezoneBox === null || headingBox === null) {
    throw new Error(
      "Expected the days-only grid, event timezone, and Responses heading to have boxes",
    )
  }

  const gridTopMinusTimezoneTop = monthBox.y - timezoneBox.y
  const gridRightToSidebarLeft = timezoneBox.x - (monthBox.x + monthBox.width)

  expect(Math.abs(gridTopMinusTimezoneTop)).toBeLessThanOrEqual(1)
  expect(gridRightToSidebarLeft).toBeGreaterThanOrEqual(16)
  expect(gridRightToSidebarLeft).toBeLessThanOrEqual(20)
  expect(headingBox.y).toBeGreaterThan(timezoneBox.y)
})

test("dates-only empty Responses state stays close to the Legend", async ({
  page,
  request,
}, testInfo) => {
  test.skip(
    testInfo.project.name === "chromium-mobile",
    "Desktop-only sidebar layout",
  )

  const now = Temporal.Now.instant()
  const today = now.toZonedDateTimeISO("UTC").toPlainDate().toString()
  const tomorrow = now
    .toZonedDateTimeISO("UTC")
    .toPlainDate()
    .add({ days: 1 })
    .toString()

  const seed = await seedCanonicalTimedEvent(request, {
    name: `Days-only empty responses spacing ${String(now.epochMilliseconds)}`,
    type: "specific_dates",
    daysOnly: true,
    dates: [`${today}T00:00:00.000Z`, `${tomorrow}T00:00:00.000Z`],
    eventTimezone: "UTC",
    slotGeneration: {
      startTimeLocal: "09:00",
      endTimeLocal: "17:00",
      timeIncrementMinutes: 60,
    },
    timedRecurrence: {
      kind: "specific_dates",
      selectedDays: [today, tomorrow],
      selectedDaysOfWeek: [],
      startOnMonday: false,
    },
  })

  await openEventPage(page, seed.shortId)

  const emptyState = page.getByText("No responses yet!", { exact: true })
  const legend = page.getByText("Legend", { exact: true })
  await expect(emptyState).toBeVisible()
  await expect(legend).toBeVisible()

  const [emptyStateBox, legendBox] = await Promise.all([
    emptyState.boundingBox(),
    legend.boundingBox(),
  ])

  if (emptyStateBox === null || legendBox === null) {
    throw new Error(
      "Expected the empty Responses state and Legend to have boxes",
    )
  }

  expect(
    legendBox.y - (emptyStateBox.y + emptyStateBox.height),
  ).toBeLessThanOrEqual(10)
})

test("dates-only empty state has matching timezone-to-Responses and responses-to-Legend gaps", async ({
  page,
  request,
}, testInfo) => {
  test.skip(
    testInfo.project.name === "chromium-mobile",
    "Desktop-only sidebar layout",
  )

  const now = Temporal.Now.instant()
  const today = now.toZonedDateTimeISO("UTC").toPlainDate().toString()
  const seed = await seedCanonicalTimedEvent(request, {
    name: `Days-only empty visual gaps ${String(now.epochMilliseconds)}`,
    type: "specific_dates",
    daysOnly: true,
    dates: [`${today}T00:00:00.000Z`],
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
      startOnMonday: false,
    },
  })

  await openEventPage(page, seed.shortId)

  const timezone = page.getByTestId("event-timezone")
  const heading = page.getByText("Responses", { exact: true })
  const emptyState = page.getByText("No responses yet!", { exact: true })
  const legend = page.getByText("Legend", { exact: true })
  await expect(timezone).toBeVisible()
  await expect(heading).toBeVisible()
  await expect(emptyState).toBeVisible()
  await expect(legend).toBeVisible()

  const timezoneToHeading = await measureVisualGap(
    page,
    {
      locator: timezone,
      edge: "box-bottom",
    },
    {
      locator: heading,
      edge: "ink-top",
    },
  )
  const responsesToLegend = await measureVisualGap(
    page,
    {
      locator: emptyState,
      edge: "ink-bottom",
    },
    {
      locator: legend,
      edge: "ink-top",
    },
  )

  expect(Math.abs(timezoneToHeading - responsesToLegend)).toBeLessThanOrEqual(2)
  expect(timezoneToHeading).toBeGreaterThanOrEqual(12)
  expect(responsesToLegend).toBeLessThanOrEqual(24)
})

test("dates-only add availability controls stay close to the Legend", async ({
  page,
  request,
}, testInfo) => {
  test.skip(
    testInfo.project.name === "chromium-mobile",
    "Desktop-only sidebar layout",
  )

  const now = Temporal.Now.instant()
  const today = now.toZonedDateTimeISO("UTC").toPlainDate().toString()
  const seed = await seedCanonicalTimedEvent(request, {
    name: `Days-only add availability spacing ${String(now.epochMilliseconds)}`,
    type: "specific_dates",
    daysOnly: true,
    dates: [`${today}T00:00:00.000Z`],
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
      startOnMonday: false,
    },
  })

  await openEventPage(page, seed.shortId)
  await waitForScheduleOverlapMounted(page)
  await page.locator("#desktop-primary-availability-btn").click()

  const toggle = page.locator(".slide-toggle")
  const legend = page.getByText("Legend", { exact: true })
  await expect(toggle).toBeVisible()
  await expect(legend).toBeVisible()

  const [toggleBox, legendBox] = await Promise.all([
    toggle.boundingBox(),
    legend.boundingBox(),
  ])
  if (toggleBox === null || legendBox === null) {
    throw new Error(
      "Expected Add availability controls and Legend to have boxes",
    )
  }

  expect(legendBox.y - (toggleBox.y + toggleBox.height)).toBeLessThanOrEqual(10)
})

test("dates-only calendar cells are twice as wide as they are tall", async ({
  page,
  request,
}) => {
  const now = Temporal.Now.instant()
  const today = now.toZonedDateTimeISO("UTC").toPlainDate().toString()
  const tomorrow = now
    .toZonedDateTimeISO("UTC")
    .toPlainDate()
    .add({ days: 1 })
    .toString()

  const seed = await seedCanonicalTimedEvent(request, {
    name: `Days-only rectangular cells ${String(now.epochMilliseconds)}`,
    type: "specific_dates",
    daysOnly: true,
    dates: [`${today}T00:00:00.000Z`, `${tomorrow}T00:00:00.000Z`],
    eventTimezone: "UTC",
    slotGeneration: {
      startTimeLocal: "09:00",
      endTimeLocal: "17:00",
      timeIncrementMinutes: 60,
    },
    timedRecurrence: {
      kind: "specific_dates",
      selectedDays: [today, tomorrow],
      selectedDaysOfWeek: [],
      startOnMonday: false,
    },
  })

  await openEventPage(page, seed.shortId)

  const cellBox = await page
    .locator(".schedule-overlap-days-only-grid .timeslot")
    .first()
    .boundingBox()
  if (cellBox === null) {
    throw new Error("Expected a dates-only calendar cell to have a box")
  }

  expect(cellBox.width / cellBox.height).toBeCloseTo(2, 1)
})

test("dates-only grid keeps gutters across narrow viewports", async ({
  page,
  request,
}, testInfo) => {
  test.skip(
    testInfo.project.name === "chromium-mobile",
    "Runs an explicit viewport matrix on desktop Chromium",
  )

  const now = Temporal.Now.instant()
  const today = now.toZonedDateTimeISO("UTC").toPlainDate().toString()
  const tomorrow = now
    .toZonedDateTimeISO("UTC")
    .toPlainDate()
    .add({ days: 1 })
    .toString()

  const seed = await seedCanonicalTimedEvent(request, {
    name: `Days-only narrow layout ${String(now.epochMilliseconds)}`,
    type: "specific_dates",
    daysOnly: true,
    dates: [`${today}T00:00:00.000Z`, `${tomorrow}T00:00:00.000Z`],
    eventTimezone: "UTC",
    slotGeneration: {
      startTimeLocal: "09:00",
      endTimeLocal: "17:00",
      timeIncrementMinutes: 60,
    },
    timedRecurrence: {
      kind: "specific_dates",
      selectedDays: [today, tomorrow],
      selectedDaysOfWeek: [],
      startOnMonday: false,
    },
  })

  for (const width of [320, 390, 410, 480, 639, 640]) {
    await page.setViewportSize({ width, height: 900 })
    await openEventPage(page, seed.shortId)

    const monthGrid = page.locator(".schedule-overlap-days-only-grid__month")
    await expect(monthGrid).toBeVisible()
    await expect
      .poll(() =>
        page.evaluate(
          () => document.documentElement.scrollWidth <= window.innerWidth,
        ),
      )
      .toBe(true)

    const monthBox = await monthGrid.boundingBox()
    if (monthBox === null) {
      throw new Error("Expected the days-only grid to have a box")
    }

    expect(monthBox.x).toBeGreaterThanOrEqual(16)
    expect(monthBox.x + monthBox.width).toBeLessThanOrEqual(width - 16)

    if (width < 640) {
      const sidebar = page.locator(".schedule-overlap-sidebar")
      await expect(sidebar).toBeVisible()
      const sidebarBox = await sidebar.boundingBox()

      if (sidebarBox === null) {
        throw new Error("Expected the sidebar to have a box")
      }

      expect(sidebarBox.y).toBeGreaterThanOrEqual(monthBox.y + monthBox.height)
      expect(sidebarBox.x + sidebarBox.width).toBeLessThanOrEqual(width)
      continue
    }

    const responsesHeading = page.getByText("Responses", { exact: true })
    await expect(responsesHeading).toBeVisible()

    const headingBox = await responsesHeading.boundingBox()

    if (headingBox === null) {
      throw new Error("Expected the Responses heading to have a box")
    }

    const gridRightToSidebarLeft = headingBox.x - (monthBox.x + monthBox.width)
    expect(gridRightToSidebarLeft).toBeGreaterThanOrEqual(16)
    expect(gridRightToSidebarLeft).toBeLessThanOrEqual(20)
  }
})

import { expect, test, type Locator } from "@playwright/test"
import {
  buildSpecificDateSeed,
  openEventPage,
  seedCanonicalTimedEvent,
} from "./helpers/timed-event-helpers"
import { Temporal } from "temporal-polyfill"

test.describe.configure({ mode: "serial" })

test("mobile timed toolbar groups row 1 left and stacks the action rows", async ({
  page,
  request,
}, testInfo) => {
  test.skip(
    testInfo.project.name !== "chromium-mobile",
    "Mobile toolbar layout assertions",
  )

  const now = Temporal.Now.instant()
  const today = now.toZonedDateTimeISO("UTC").toPlainDate().toString()
  // Four picked days keep the 3 days/7 days switch visible (FR-114 hides it
  // when the Timed Grid spans 3 or fewer day columns).
  const pickedDays = [0, 1, 2, 3].map((offset) =>
    Temporal.PlainDate.from(today).add({ days: offset }).toString(),
  )

  const seed = await seedCanonicalTimedEvent(
    request,
    buildSpecificDateSeed({
      name: `Mobile toolbar layout ${String(now.epochMilliseconds)}`,
      selectedDays: pickedDays,
      activeSlots: [`${today}T09:00:00.000Z`, `${today}T10:00:00.000Z`],
      eventTimezone: "UTC",
      startTimeLocal: "09:00",
      endTimeLocal: "17:00",
      timeIncrementMinutes: 60,
    }),
  )

  const guestResponse = await request.post(
    `/api/events/${seed.eventId}/response`,
    {
      data: {
        guest: true,
        name: "Mobile Toolbar Guest",
        email: "",
        availability: [`${today}T09:00:00.000Z`, `${today}T10:00:00.000Z`],
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
  const seededEventBody = (await seededEvent.json()) as { _id?: string }
  const eventMongoId = seededEventBody._id
  if (eventMongoId == null || eventMongoId.length === 0) {
    throw new Error("Expected the seeded event to expose its Mongo id")
  }

  await page.addInitScript(
    ({ eventId, guestCredentials }) => {
      const record = {
        name: guestCredentials.name ?? "Mobile Toolbar Guest",
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

  // Row 1: time format, timezone, days-per-page grouped left with compact
  // gaps instead of spreading across the width.
  const timeFormatToggles = page.locator(".time-format-toggle")
  await expect(timeFormatToggles).toHaveCount(2)
  await expect(timeFormatToggles.nth(0)).toContainText("12h")
  await expect(timeFormatToggles.nth(0)).toContainText("24h")
  await expect(timeFormatToggles.nth(1)).toContainText("3 days")
  await expect(timeFormatToggles.nth(1)).toContainText("7 days")

  const timezone = page.locator("#timezone-select-container")
  await expect(timezone).toBeVisible()

  const [fmtBox, tzBox, daysBox] = await Promise.all([
    timeFormatToggles.nth(0).boundingBox(),
    timezone.boundingBox(),
    timeFormatToggles.nth(1).boundingBox(),
  ])
  if (fmtBox === null || tzBox === null || daysBox === null) {
    throw new Error("Expected the row-1 controls to have boxes")
  }

  const fmtToTimezoneGap = tzBox.x - (fmtBox.x + fmtBox.width)
  const timezoneToDaysGap = daysBox.x - (tzBox.x + tzBox.width)
  expect(fmtToTimezoneGap).toBeGreaterThan(0)
  expect(fmtToTimezoneGap).toBeLessThanOrEqual(16)
  expect(Math.abs(fmtToTimezoneGap - timezoneToDaysGap)).toBeLessThanOrEqual(1)
  expect(tzBox.width).toBeLessThan(160)

  // Row 2: Show best times on its own row. Row 3: content-sized More
  // options. (Getting the best-times switch via the checkbox input the `id`
  // lands on would yield the invisible input box, so grab the containing
  // .v-switch.)
  const bestTimesToggle = page.locator(".v-switch", {
    has: page.locator("#mobile-show-best-times-toggle"),
  })
  await expect(bestTimesToggle).toBeVisible()

  const track = bestTimesToggle.locator(".v-switch__track")
  await expect(track).toBeVisible()
  const trackBox = await track.boundingBox()
  if (trackBox === null) {
    throw new Error("Expected the compact switch track to have a box")
  }
  expect(trackBox.height).toBeGreaterThanOrEqual(20)
  expect(trackBox.height).toBeLessThanOrEqual(25)

  const moreOptionsButton = page
    .locator("#event-options-menu-activator")
    .first()
  await expect(moreOptionsButton).toBeVisible()

  const viewportWidth = page.viewportSize()?.width
  if (viewportWidth === undefined) {
    throw new Error("Expected the page to expose a viewport size")
  }

  const [bestTimesBox, moreOptionsBox] = await Promise.all([
    bestTimesToggle.boundingBox(),
    moreOptionsButton.boundingBox(),
  ])
  if (bestTimesBox === null || moreOptionsBox === null) {
    throw new Error("Expected the row-2 and row-3 controls to have boxes")
  }

  // Rows 1-3 share the toolbar's left edge.
  expect(Math.abs(bestTimesBox.x - fmtBox.x)).toBeLessThanOrEqual(2)
  expect(Math.abs(moreOptionsBox.x - fmtBox.x)).toBeLessThanOrEqual(2)

  // More options stacks below Show best times and is sized to its text:
  // one line tall, not collapsed, with empty space left over on the right.
  expect(moreOptionsBox.y).toBeGreaterThanOrEqual(
    bestTimesBox.y + bestTimesBox.height,
  )
  expect(moreOptionsBox.height).toBeLessThanOrEqual(40)
  expect(moreOptionsBox.width).toBeGreaterThanOrEqual(100)
  expect(moreOptionsBox.x + moreOptionsBox.width).toBeLessThan(
    viewportWidth - 40,
  )

  // More options opens the desktop-style options menu.
  await moreOptionsButton.click()
  const collapseDisabledTimes = page
    .locator("#collapse-disabled-times-toggle")
    .first()
  await expect(collapseDisabledTimes).toBeVisible()
})

test("mobile toolbar hides the days switch and left-aligns row 1 when the grid spans 3 or fewer day columns", async ({
  page,
  request,
}, testInfo) => {
  test.skip(
    testInfo.project.name !== "chromium-mobile",
    "Mobile toolbar layout assertions",
  )

  const now = Temporal.Now.instant()
  const today = now.toZonedDateTimeISO("UTC").toPlainDate().toString()

  const seed = await seedCanonicalTimedEvent(
    request,
    buildSpecificDateSeed({
      name: `Mobile toolbar days switch hidden ${String(now.epochMilliseconds)}`,
      selectedDays: [today],
      activeSlots: [`${today}T09:00:00.000Z`, `${today}T10:00:00.000Z`],
      eventTimezone: "UTC",
      startTimeLocal: "09:00",
      endTimeLocal: "17:00",
      timeIncrementMinutes: 60,
    }),
  )

  await openEventPage(page, seed.shortId)

  // FR-114: a single-day Timed Grid cannot display more than 3 day columns,
  // so the 3 days/7 days switch is hidden and row 1 groups the two remaining
  // controls at the toolbar's left edge instead of centering them.
  const timeFormatToggles = page.locator(".time-format-toggle")
  await expect(timeFormatToggles).toHaveCount(1)
  await expect(timeFormatToggles.nth(0)).toContainText("12h")
  await expect(timeFormatToggles.nth(0)).toContainText("24h")
  await expect(page.getByText("3 days")).toHaveCount(0)
  await expect(page.getByText("7 days")).toHaveCount(0)

  const timezone = page.locator("#timezone-select-container")
  await expect(timezone).toBeVisible()

  const collapseDisabledTimesSwitch = page.locator(".v-switch", {
    has: page.locator("#mobile-collapse-disabled-times-toggle"),
  })
  await expect(collapseDisabledTimesSwitch).toBeVisible()

  const viewportWidth = page.viewportSize()?.width
  if (viewportWidth === undefined) {
    throw new Error("Expected the page to expose a viewport size")
  }
  const [fmtBox, tzBox, collapseDisabledTimesBox] = await Promise.all([
    timeFormatToggles.nth(0).boundingBox(),
    timezone.boundingBox(),
    collapseDisabledTimesSwitch.boundingBox(),
  ])
  if (fmtBox === null || tzBox === null || collapseDisabledTimesBox === null) {
    throw new Error("Expected the row-1 and row-2 controls to have boxes")
  }

  // Left-aligned: the grouped row starts at the toolbar's left edge, shared
  // with the Collapse disabled times switch below, well before a centered row would.
  const rowWidth = tzBox.x + tzBox.width - fmtBox.x
  const centeredStart = (viewportWidth - rowWidth) / 2
  expect(fmtBox.x).toBeLessThan(centeredStart - 8)
  expect(Math.abs(collapseDisabledTimesBox.x - fmtBox.x)).toBeLessThanOrEqual(2)
})

test("mobile timezone control keeps its fixed width when the reset button appears", async ({
  page,
  request,
}, testInfo) => {
  test.skip(
    testInfo.project.name !== "chromium-mobile",
    "Mobile toolbar layout assertions",
  )

  const now = Temporal.Now.instant()
  const today = now.toZonedDateTimeISO("UTC").toPlainDate().toString()

  const seed = await seedCanonicalTimedEvent(
    request,
    buildSpecificDateSeed({
      name: `Mobile tz fixed width ${String(now.epochMilliseconds)}`,
      selectedDays: [today],
      activeSlots: [`${today}T09:00:00.000Z`, `${today}T10:00:00.000Z`],
      eventTimezone: "UTC",
      startTimeLocal: "09:00",
      endTimeLocal: "17:00",
      timeIncrementMinutes: 60,
    }),
  )

  await openEventPage(page, seed.shortId)

  const timezoneContainer = page.locator("#timezone-select-container")
  await expect(timezoneContainer).toBeVisible()

  const timezoneField = timezoneContainer.locator("#timezone-select")
  const widthWithoutReset = (await timezoneContainer.boundingBox())?.width
  const fieldWidthWithoutReset = (await timezoneField.boundingBox())?.width
  if (widthWithoutReset === undefined || fieldWidthWithoutReset === undefined) {
    throw new Error("Expected the timezone container and field to have a width")
  }

  const trigger = timezoneContainer.getByTestId("timezone-select-trigger")
  await trigger.click({ force: true })

  const options = page.locator('[data-testid="timezone-select-option"]:visible')
  await expect.poll(async () => options.count()).toBeGreaterThan(0)
  const optionCount = await options.count()
  let chosenOption: Locator | null = null
  for (let index = 0; index < optionCount; index += 1) {
    const option = options.nth(index)
    const classNames = (await option.getAttribute("class")) ?? ""
    if (!classNames.includes("timezone-select__item--active")) {
      chosenOption = option
      break
    }
  }
  if (chosenOption === null) {
    throw new Error("Expected a non-selected timezone option")
  }
  // The timezone menu animates its items in on open; clicking before the
  // geometry settles lands on overlapping items and the selection is lost.
  await expect
    .poll(async () => (await chosenOption.boundingBox())?.height ?? 0, {
      timeout: 10000,
    })
    .toBeGreaterThanOrEqual(44)
  await chosenOption.click({ force: true })

  const resetButton = timezoneContainer.locator(
    ".timezone-select__reset-button--right",
  )
  await expect(resetButton).toBeVisible()

  const [containerBox, resetBox, fieldBox] = await Promise.all([
    timezoneContainer.boundingBox(),
    resetButton.boundingBox(),
    timezoneField.boundingBox(),
  ])
  if (containerBox === null || resetBox === null || fieldBox === null) {
    throw new Error(
      "Expected the timezone container, reset button, and field to have boxes",
    )
  }

  expect(Math.abs(containerBox.width - widthWithoutReset)).toBeLessThanOrEqual(
    1,
  )
  expect(resetBox.x + resetBox.width).toBeLessThanOrEqual(
    containerBox.x + containerBox.width + 1,
  )
  expect(resetBox.x).toBeGreaterThanOrEqual(fieldBox.x + fieldBox.width - 1)
  expect(fieldBox.width).toBeLessThan(widthWithoutReset)

  await resetButton.click({ force: true })
  await expect(resetButton).not.toBeVisible()

  const restoredFieldBox = await timezoneField.boundingBox()
  const restoredContainerBox = await timezoneContainer.boundingBox()
  if (restoredFieldBox === null || restoredContainerBox === null) {
    throw new Error(
      "Expected the timezone container and field to have boxes after reset",
    )
  }
  expect(
    Math.abs(restoredContainerBox.width - widthWithoutReset),
  ).toBeLessThanOrEqual(1)
  expect(
    Math.abs(restoredFieldBox.width - fieldWidthWithoutReset),
  ).toBeLessThanOrEqual(1)
})

test("timed event header no longer shows the day-of-week range summary", async ({
  page,
  request,
}) => {
  const seed = await seedCanonicalTimedEvent(request, {
    name: "Weekly timed no range summary",
    type: "weekly",
    activeSlots: [
      "2026-01-05T17:00:00Z",
      "2026-01-05T17:30:00Z",
      "2026-01-07T17:00:00Z",
      "2026-01-07T17:30:00Z",
    ],
    eventTimezone: "UTC",
    slotGeneration: {
      startTimeLocal: "09:00:00",
      endTimeLocal: "10:00:00",
      timeIncrementMinutes: 30,
    },
    timedRecurrence: {
      kind: "weekly",
      selectedDays: ["2026-01-05", "2026-01-07"],
      selectedDaysOfWeek: [1, 3],
      startOnMonday: true,
    },
    hasSpecificTimes: false,
  })

  await openEventPage(page, seed.shortId)

  const header = page.locator("#event-header")
  await expect(header).toBeVisible()
  const headerText = await header.innerText()
  expect(headerText).not.toMatch(
    /(Sun|Mon|Tue|Wed|Thu|Fri|Sat),\s*(Sun|Mon|Tue|Wed|Thu|Fri|Sat)/,
  )
})

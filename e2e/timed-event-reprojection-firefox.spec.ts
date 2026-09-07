import {
  expect,
  test,
  type APIRequestContext,
  type Page,
} from "@playwright/test"
import {
  buildSpecificDateSeed,
  changeTimezone,
  collectDatePickerState,
  collectGridState,
  countGridCellsByClass,
  dismissConsent,
  fetchEventByShortId,
  openEditDialog,
  openEventPage,
  proceedToSpecificTimesGrid,
  readGridCellState,
  revealAdvancedOptions,
  saveEditorAndWaitForPut,
  seedCanonicalTimedEvent,
  selectedDatesFromState,
  setSpecificTimesEnabled,
  sortIsoInstants,
  type CanonicalTimedSeedInput,
} from "./helpers/timed-event-helpers"
import { Temporal } from "temporal-polyfill"

test.describe.configure({ mode: "serial" })

test("reprojects a canonical timed event with the same slot window after reload", async ({
  page,
  request,
}) => {
  const selectedDays = ["2026-06-02", "2026-06-03"]
  const seeded = await seedCanonicalTimedEvent(
    request,
    buildSpecificDateSeed({
      name: `Seeded timed event ${String(Temporal.Now.instant().epochMilliseconds)}`,
      selectedDays,
      activeSlots: [
        "2026-06-02T09:00:00Z",
        "2026-06-02T09:15:00Z",
        "2026-06-02T09:30:00Z",
        "2026-06-02T09:45:00Z",
        "2026-06-02T10:00:00Z",
        "2026-06-02T10:15:00Z",
        "2026-06-02T10:30:00Z",
        "2026-06-02T10:45:00Z",
        "2026-06-02T11:00:00Z",
        "2026-06-02T11:15:00Z",
        "2026-06-02T11:30:00Z",
        "2026-06-02T11:45:00Z",
        "2026-06-02T12:00:00Z",
        "2026-06-02T12:15:00Z",
        "2026-06-02T12:30:00Z",
        "2026-06-02T12:45:00Z",
        "2026-06-02T13:00:00Z",
        "2026-06-02T13:15:00Z",
        "2026-06-02T13:30:00Z",
        "2026-06-02T13:45:00Z",
        "2026-06-02T14:00:00Z",
        "2026-06-02T14:15:00Z",
        "2026-06-02T14:30:00Z",
        "2026-06-02T14:45:00Z",
        "2026-06-02T15:00:00Z",
        "2026-06-02T15:15:00Z",
        "2026-06-02T15:30:00Z",
        "2026-06-02T15:45:00Z",
        "2026-06-02T16:00:00Z",
        "2026-06-02T16:15:00Z",
        "2026-06-02T16:30:00Z",
        "2026-06-02T16:45:00Z",
        "2026-06-03T09:00:00Z",
        "2026-06-03T09:15:00Z",
        "2026-06-03T09:30:00Z",
        "2026-06-03T09:45:00Z",
        "2026-06-03T10:00:00Z",
        "2026-06-03T10:15:00Z",
        "2026-06-03T10:30:00Z",
        "2026-06-03T10:45:00Z",
        "2026-06-03T11:00:00Z",
        "2026-06-03T11:15:00Z",
        "2026-06-03T11:30:00Z",
        "2026-06-03T11:45:00Z",
        "2026-06-03T12:00:00Z",
        "2026-06-03T12:15:00Z",
        "2026-06-03T12:30:00Z",
        "2026-06-03T12:45:00Z",
        "2026-06-03T13:00:00Z",
        "2026-06-03T13:15:00Z",
        "2026-06-03T13:30:00Z",
        "2026-06-03T13:45:00Z",
        "2026-06-03T14:00:00Z",
        "2026-06-03T14:15:00Z",
        "2026-06-03T14:30:00Z",
        "2026-06-03T14:45:00Z",
        "2026-06-03T15:00:00Z",
        "2026-06-03T15:15:00Z",
        "2026-06-03T15:30:00Z",
        "2026-06-03T15:45:00Z",
        "2026-06-03T16:00:00Z",
        "2026-06-03T16:15:00Z",
        "2026-06-03T16:30:00Z",
        "2026-06-03T16:45:00Z",
      ],
      eventTimezone: "UTC",
      startTimeLocal: "09:00:00",
      endTimeLocal: "17:00:00",
      timeIncrementMinutes: 15,
      hasSpecificTimes: false,
    }),
  )
  const savedEvent = await fetchEventByShortId(request, seeded.shortId)

  expect(savedEvent.timedRecurrence).toMatchObject({
    kind: "specific_dates",
    selectedDays,
    selectedDaysOfWeek: [],
  })
  expect(savedEvent).not.toHaveProperty("enabledSlots")
  expect(savedEvent.slotGeneration).toMatchObject({
    startTimeLocal: "09:00:00",
    endTimeLocal: "17:00:00",
    timeIncrementMinutes: 15,
  })

  await openEventPage(page, seeded.shortId)
  await page.reload({ waitUntil: "domcontentloaded" })
  await dismissConsent(page)
  const editorCard = await openEditDialog(page)
  const selectedDates = selectedDatesFromState(
    await collectDatePickerState(editorCard),
  )
  expect(selectedDates).toEqual(selectedDays)

  await setSpecificTimesEnabled(editorCard, true)
  await proceedToSpecificTimesGrid(page)

  const gridState = await collectGridState(page)
  expect(gridState.headerColumns).toEqual([
    expect.stringMatching(/jun/i),
    expect.stringMatching(/jun/i),
  ])
  expect(gridState.visibleDateStrings).toEqual([
    expect.stringMatching(/^jun 2$/i),
    expect.stringMatching(/^jun 3$/i),
  ])
  expect(
    ((await page.locator("#time-row-0").textContent()) ?? "")
      .replace(/\s+/g, " ")
      .trim(),
  ).toBe("00:00")
  expect(
    ((await page.locator("#time-row-36").textContent()) ?? "")
      .replace(/\s+/g, " ")
      .trim(),
  ).toBe("09:00")
  expect(
    ((await page.locator("#time-row-64").textContent()) ?? "")
      .replace(/\s+/g, " ")
      .trim(),
  ).toBe("16:00")

  // Spot-check the timezone-projected cell states; the full class-to-state
  // mapping is unit-locked in scheduleOverlapRendering.test.ts.
  expect((await readGridCellState(page, 0, 0)).className).toContain(
    "tw-bg-light-gray-stroke",
  )
  expect((await readGridCellState(page, 36, 0)).className).toContain(
    "tw-bg-white",
  )
  expect((await readGridCellState(page, 67, 1)).className).toContain(
    "tw-bg-white",
  )
  expect(await countGridCellsByClass(page, "tw-bg-white")).toBeGreaterThan(0)
})

test("preserves timed instants when the event timezone changes and shifts projected local days", async ({
  page,
  request,
}) => {
  // The enabled domain is the full civil day of each membership day, so a
  // wrapped-window event may only carry actives inside its membership day;
  // the post-midnight portion now rejects at ingest. These two Los Angeles
  // instants (Jan 4 23:00/23:30) project to Jan 5 07:00/07:30 UTC, which
  // re-anchors the membership day to 2026-01-05 after the timezone change.
  const activeSlots = ["2026-01-05T07:00:00Z", "2026-01-05T07:30:00Z"]
  const seeded = await seedCanonicalTimedEvent(
    request,
    buildSpecificDateSeed({
      name: "Timezone preservation regression",
      selectedDays: ["2026-01-04"],
      activeSlots,
      eventTimezone: "America/Los_Angeles",
      startTimeLocal: "23:00:00",
      endTimeLocal: "01:00:00",
      timeIncrementMinutes: 30,
    }),
  )

  await openEventPage(page, seeded.shortId)
  const editorCard = await openEditDialog(page)
  await revealAdvancedOptions(editorCard)
  await changeTimezone(page, {
    currentSelectionPattern:
      /\(GMT-8:00\)|-[78]:00|America\/Los_Angeles|Pacific/i,
    optionValue: "UTC",
    optionLabelPattern: /\(GMT\+0:00\).*UTC/i,
  })
  await proceedToSpecificTimesGrid(page)
  await saveEditorAndWaitForPut(page, { action: "next" })

  const savedEvent = await fetchEventByShortId(request, seeded.shortId)
  expect(savedEvent.eventTimezone).toMatch(/UTC|GMT/)
  expect(savedEvent).not.toHaveProperty("enabledSlots")
  expect(sortIsoInstants(savedEvent.activeSlots)).toEqual(
    sortIsoInstants(activeSlots),
  )

  await page.reload({ waitUntil: "domcontentloaded" })
  await dismissConsent(page)
  const reopenedEditor = await openEditDialog(page)
  const selectedDates = selectedDatesFromState(
    await collectDatePickerState(reopenedEditor),
  )
  expect(selectedDates).toEqual(["2026-01-05"])
})

test("reopens cross-midnight fixture without dropping membership days or drifting instants", async ({
  page,
  request,
}) => {
  // The enabled domain of the picked 2026-01-05 UTC event is that day's full
  // civil day ending at 00:00 on 2026-01-06, so next-day wrapped-window
  // instants (2026-01-06T00:00:00Z onward) are rejected at ingest. The raw
  // POST rejection is covered by the server route test
  // TestCreateEventRejectsActiveSlotsOutsideDerivedDomain.
  const seed = buildSpecificDateSeed({
    name: "Cross-midnight timed fixture",
    selectedDays: ["2026-01-05"],
    activeSlots: ["2026-01-05T23:00:00Z", "2026-01-05T23:30:00Z"],
    eventTimezone: "UTC",
    startTimeLocal: "23:00:00",
    endTimeLocal: "01:00:00",
    timeIncrementMinutes: 30,
  })

  await expectTimedFixtureReopen({
    page,
    request,
    seed,
    expectedSelectedDays: ["2026-01-05"],
    expectedSlotGeneration: {
      startTimeLocal: "23:00:00",
      endTimeLocal: "01:00:00",
      timeIncrementMinutes: 30,
    },
  })
})

test("reopens DST-boundary fixture without dropping membership days or drifting instants", async ({
  page,
  request,
}) => {
  const seed = buildSpecificDateSeed({
    name: "DST-boundary timed fixture",
    selectedDays: ["2026-03-08"],
    activeSlots: [
      "2026-03-08T09:30:00Z",
      "2026-03-08T10:00:00Z",
      "2026-03-08T10:15:00Z",
    ],
    eventTimezone: "America/Los_Angeles",
    startTimeLocal: "01:30:00",
    endTimeLocal: "03:30:00",
    timeIncrementMinutes: 15,
  })

  await expectTimedFixtureReopen({
    page,
    request,
    seed,
    expectedSelectedDays: ["2026-03-08"],
    // The 23-hour LA spring-forward day spans Mar 8 08:00Z through Mar 9
    // 07:00Z, so the UTC viewer renders two projected columns.
    expectedColumns: 2,
  })
})

async function expectTimedFixtureReopen(input: {
  page: Page
  request: APIRequestContext
  seed: CanonicalTimedSeedInput
  expectedSelectedDays: string[]
  expectedSlotGeneration?: {
    startTimeLocal: string
    endTimeLocal: string
    timeIncrementMinutes: number
  }
  // FR-026 projects the enabled domain (a full civil day per membership day)
  // into the viewer timezone, so DST-short days legitimately span an extra
  // UTC column; default to one column per membership day.
  expectedColumns?: number
}) {
  const seeded = await seedCanonicalTimedEvent(input.request, input.seed)
  await openEventPage(input.page, seeded.shortId)
  const editorCard = await openEditDialog(input.page)
  const selectedDates = selectedDatesFromState(
    await collectDatePickerState(editorCard),
  )
  expect(selectedDates).toEqual(input.expectedSelectedDays)

  await proceedToSpecificTimesGrid(input.page)
  const gridState = await collectGridState(input.page)
  expect(gridState.headerColumns.length).toBe(
    input.expectedColumns ?? input.expectedSelectedDays.length,
  )
  expect(new Set(gridState.headerColumns).size).toBe(
    gridState.headerColumns.length,
  )

  const activeBeforeSave = sortIsoInstants(
    input.seed.activeSlots ?? input.seed.enabledSlots ?? [],
  )
  await saveEditorAndWaitForPut(input.page, { action: "next" })

  const savedEvent = await fetchEventByShortId(input.request, seeded.shortId)
  expect(savedEvent).not.toHaveProperty("enabledSlots")
  expect(sortIsoInstants(savedEvent.activeSlots)).toEqual(activeBeforeSave)
  expect(savedEvent.timedRecurrence).toMatchObject({
    selectedDays: input.expectedSelectedDays,
  })
  if (input.expectedSlotGeneration) {
    expect(savedEvent.slotGeneration).toEqual(input.expectedSlotGeneration)
  }
}

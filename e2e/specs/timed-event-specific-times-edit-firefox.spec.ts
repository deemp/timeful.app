import { expect, test } from "@playwright/test"
import {
  SLOT_UTC_MAY_28,
  SLOT_UTC_MAY_29,
  buildUtcSpecificTimesRangeInstants,
  buildSpecificDateSeed,
  clickDateCell,
  collectDatePickerState,
  createSpecificTimesEventFromDialog,
  dismissConsent,
  fetchEventByShortId,
  openEditDialog,
  openEventPage,
  proceedToSpecificTimesGrid,
  revealAdvancedOptions,
  saveEditorAndWaitForPut,
  seedCanonicalTimedEvent,
  selectedDatesFromState,
  setSpecificTimesEnabled,
  sortIsoInstants,
} from "../helpers/timed-event-helpers"

test.describe.configure({ mode: "serial" })

test("mobile compatibility mouse press shows the selected-slot tooltip", async ({
  page,
}) => {
  await createSpecificTimesEventFromDialog(
    page,
    "Mobile compatibility mouse tooltip regression",
  )
  await page.setViewportSize({ width: 375, height: 900 })

  const selectedSlot = page.locator(
    '#drag-section .timeslot[data-row="1"][data-col="0"]',
  )
  await selectedSlot.scrollIntoViewIfNeeded()
  const selectedSlotBox = await selectedSlot.boundingBox()
  expect(selectedSlotBox).not.toBeNull()
  if (!selectedSlotBox) {
    throw new Error("Expected selected grid slot to be visible")
  }

  await selectedSlot.dispatchEvent("mousedown", {
    clientX: selectedSlotBox.x + selectedSlotBox.width / 2,
    clientY: selectedSlotBox.y + selectedSlotBox.height / 2,
  })

  const tooltip = page.locator(".tw\\:fixed.timeful-tooltip-layer")
  await expect(tooltip).toBeVisible()
  expect(await tooltip.textContent()).not.toBe("")
})

test("mobile timeslot click shows the selected-slot tooltip", async ({
  page,
}) => {
  await createSpecificTimesEventFromDialog(
    page,
    "Mobile click tooltip regression",
  )
  await page.setViewportSize({ width: 375, height: 900 })

  const selectedSlot = page.locator(
    '#drag-section .timeslot[data-row="1"][data-col="0"]',
  )
  await selectedSlot.scrollIntoViewIfNeeded()
  await selectedSlot.dispatchEvent("click")

  const tooltip = page.locator(".tw\\:fixed.timeful-tooltip-layer")
  await expect(tooltip).toBeVisible()
  expect(await tooltip.textContent()).not.toBe("")

  const [selectedSlotBox, tooltipBox] = await Promise.all([
    selectedSlot.boundingBox(),
    tooltip.boundingBox(),
  ])
  expect(selectedSlotBox).not.toBeNull()
  expect(tooltipBox).not.toBeNull()
  if (!selectedSlotBox || !tooltipBox) {
    throw new Error("Expected visible selected slot and tooltip")
  }

  const verticalGap =
    tooltipBox.y + tooltipBox.height <= selectedSlotBox.y
      ? selectedSlotBox.y - (tooltipBox.y + tooltipBox.height)
      : tooltipBox.y - (selectedSlotBox.y + selectedSlotBox.height)
  expect(verticalGap).toBeGreaterThan(0)

  expect(tooltipBox.x).toBeGreaterThanOrEqual(0)
  expect(tooltipBox.x + tooltipBox.width).toBeLessThanOrEqual(375)
})

test("mobile Responses heading does not dispatch a gesture to the grid", async ({
  page,
}) => {
  await createSpecificTimesEventFromDialog(
    page,
    "Mobile Responses interaction boundary regression",
  )
  await page.setViewportSize({ width: 375, height: 900 })

  const selectedSlot = page.locator(
    '#drag-section .timeslot[data-row="1"][data-col="0"]',
  )
  await selectedSlot.scrollIntoViewIfNeeded()
  await selectedSlot.dispatchEvent("click")

  const overlay = page.locator(".schedule-overlap-mobile-overlay")
  const responsesHeading = overlay.getByText("Responses", { exact: true })
  await expect(responsesHeading).toBeVisible()

  await page.evaluate(() => {
    const dragSection = document.querySelector("#drag-section")
    if (!(dragSection instanceof HTMLElement)) {
      throw new Error("Expected drag section")
    }
    dragSection.dataset.pointerDowns = "0"
    dragSection.dataset.clicks = "0"
    dragSection.addEventListener("pointerdown", () => {
      dragSection.dataset.pointerDowns = String(
        Number(dragSection.dataset.pointerDowns) + 1,
      )
    })
    dragSection.addEventListener("click", () => {
      dragSection.dataset.clicks = String(
        Number(dragSection.dataset.clicks) + 1,
      )
    })
  })

  const headingBox = await responsesHeading.boundingBox()
  expect(headingBox).not.toBeNull()
  if (!headingBox) {
    throw new Error("Expected the Responses heading to be visible")
  }
  await page.mouse.click(
    headingBox.x + headingBox.width / 2,
    headingBox.y + headingBox.height / 2,
  )

  await expect
    .poll(() =>
      page.locator("#drag-section").evaluate((element) => ({
        pointerDowns: Number((element as HTMLElement).dataset.pointerDowns),
        clicks: Number((element as HTMLElement).dataset.clicks),
      })),
    )
    .toEqual({ pointerDowns: 0, clicks: 0 })
  await expect(page.locator(".tw\\:fixed.timeful-tooltip-layer")).toHaveCount(0)
})

test("enabling specific-times and saving without grid edits preserves canonical timed fields", async ({
  page,
  request,
}) => {
  const seeded = await seedCanonicalTimedEvent(
    page.request,
    buildSpecificDateSeed({
      name: "Specific-times no-op regression",
      selectedDays: ["2026-05-28", "2026-05-29"],
      eventTimezone: "UTC",
      startTimeLocal: "00:00:00",
      endTimeLocal: "04:00:00",
      timeIncrementMinutes: 60,
      activeSlots: [...SLOT_UTC_MAY_28, ...SLOT_UTC_MAY_29],
      hasSpecificTimes: false,
    }),
  )
  const baselineEvent = await fetchEventByShortId(request, seeded.shortId)

  await openEventPage(page, seeded.shortId)
  const editorCard = await openEditDialog(page)
  await revealAdvancedOptions(editorCard)
  await setSpecificTimesEnabled(editorCard, true)
  await proceedToSpecificTimesGrid(page)
  await saveEditorAndWaitForPut(page, { action: "next" })

  const savedEvent = await fetchEventByShortId(request, seeded.shortId)
  expect(savedEvent).not.toHaveProperty("enabledSlots")
  expect(sortIsoInstants(savedEvent.activeSlots)).toEqual(
    sortIsoInstants([...SLOT_UTC_MAY_28, ...SLOT_UTC_MAY_29]),
  )
  expect(savedEvent.eventTimezone).toBe(baselineEvent.eventTimezone)
  expect(savedEvent.slotGeneration).toEqual(baselineEvent.slotGeneration)
  expect(savedEvent.timedRecurrence).toEqual(baselineEvent.timedRecurrence)

  await page.reload({ waitUntil: "domcontentloaded" })
  await dismissConsent(page)
  const reopenedEditor = await openEditDialog(page)
  const selectedDates = selectedDatesFromState(
    await collectDatePickerState(reopenedEditor),
  )
  expect(selectedDates).toEqual(["2026-05-28", "2026-05-29"])
})

// The enabled domain is the full civil day (00:00-23:00 at the configured
// increment), so disabling specific-times restores every enabled slot as an
// active slot. endHour 23 + endMinute 0 with a 60-minute increment yields an
// exclusive end at the next day's 00:00, i.e. the complete 00:00-23:00 day
// without spilling into the next civil day (membership-day rule; next-day
// 00:00 instants are stale and rejected at the boundary, covered by the server
// route test TestCreateEventRejectsActiveSlotsOutsideDerivedDomain).
const buildFullDayUtcRange = (day: string) =>
  buildUtcSpecificTimesRangeInstants({
    day,
    startHour: 0,
    startMinute: 0,
    endHour: 23,
    endMinute: 0,
    incrementMinutes: 60,
  })

test("disabling specific-times restores active slots to the full enabled domain", async ({
  page,
  request,
}) => {
  const seeded = await seedCanonicalTimedEvent(
    page.request,
    buildSpecificDateSeed({
      name: "Disable specific-times regression",
      selectedDays: ["2026-05-28", "2026-05-29"],
      activeSlots: [...SLOT_UTC_MAY_29],
      eventTimezone: "UTC",
      startTimeLocal: "00:00:00",
      endTimeLocal: "04:00:00",
      timeIncrementMinutes: 60,
    }),
  )

  await openEventPage(page, seeded.shortId)
  const editorCard = await openEditDialog(page)
  await revealAdvancedOptions(editorCard)
  await setSpecificTimesEnabled(editorCard, false)
  await saveEditorAndWaitForPut(page, { action: "save" })

  const savedEvent = await fetchEventByShortId(request, seeded.shortId)
  expect(savedEvent).not.toHaveProperty("enabledSlots")
  expect(sortIsoInstants(savedEvent.activeSlots)).toEqual(
    sortIsoInstants([
      ...buildFullDayUtcRange("2026-05-28"),
      ...buildFullDayUtcRange("2026-05-29"),
    ]),
  )
})

test("timed date edits preserve active subsets on add and remove slots on delete", async ({
  page,
  request,
}) => {
  const seeded = await seedCanonicalTimedEvent(
    page.request,
    buildSpecificDateSeed({
      name: "Date add remove regression",
      selectedDays: ["2026-05-28", "2026-05-29"],
      activeSlots: [...SLOT_UTC_MAY_29],
      eventTimezone: "UTC",
      startTimeLocal: "00:00:00",
      endTimeLocal: "04:00:00",
      timeIncrementMinutes: 60,
    }),
  )

  await openEventPage(page, seeded.shortId)
  let editorCard = await openEditDialog(page)
  await clickDateCell(editorCard, "2026-05-30")
  await proceedToSpecificTimesGrid(page)
  await saveEditorAndWaitForPut(page, { action: "next" })

  let savedEvent = await fetchEventByShortId(request, seeded.shortId)
  expect(savedEvent).not.toHaveProperty("enabledSlots")
  expect(sortIsoInstants(savedEvent.activeSlots)).toEqual(
    sortIsoInstants(SLOT_UTC_MAY_29),
  )

  await page.reload({ waitUntil: "domcontentloaded" })
  await dismissConsent(page)
  editorCard = await openEditDialog(page)
  await clickDateCell(editorCard, "2026-05-28")
  await proceedToSpecificTimesGrid(page)
  await saveEditorAndWaitForPut(page, { action: "next" })

  savedEvent = await fetchEventByShortId(request, seeded.shortId)
  expect(savedEvent).not.toHaveProperty("enabledSlots")
  expect(sortIsoInstants(savedEvent.activeSlots)).toEqual(
    sortIsoInstants(SLOT_UTC_MAY_29),
  )
})

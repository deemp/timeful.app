import { expect, test } from "@playwright/test"
import {
  buildUtcSpecificTimesRangeInstants,
  countGridCellsByClass,
  createSpecificTimesEventFromDialog,
  dismissConsent,
  dragSelectGridRange,
  fetchEventByShortId,
  openEventPage,
  openSpecificTimesEditor,
  rowIndexForTime,
  saveEditorAndWaitForPut,
  sortIsoInstants,
  waitForSpecificTimesGrid,
  type CreateSpecificTimesEventResult,
} from "./helpers/timed-event-helpers"
import { Temporal } from "temporal-polyfill"

test.describe.configure({ mode: "serial" })

function expectedCreatedDomain(
  created: CreateSpecificTimesEventResult,
): string[] {
  return [
    ...buildUtcSpecificTimesRangeInstants({
      day: created.selectedDates[0],
      startHour: 9,
      startMinute: 0,
      endHour: 16,
      endMinute: 45,
    }),
    ...buildUtcSpecificTimesRangeInstants({
      day: created.selectedDates[1],
      startHour: 9,
      startMinute: 0,
      endHour: 16,
      endMinute: 45,
    }),
  ]
}

test("create flow with specific-times lands directly in the specific-times grid", async ({
  page,
}) => {
  const created = await createSpecificTimesEventFromDialog(
    page,
    `Create flow handoff ${String(Temporal.Now.instant().epochMilliseconds)}`,
  )

  expect(created.createPayload.activeSlots ?? []).toEqual([])
  expect(created.createPayload).not.toHaveProperty("enabledSlots")
  // Smoke: the create grid starts with an empty selection; the class-to-state
  // mapping itself is unit-locked in scheduleOverlapRendering.test.ts.
  expect(await countGridCellsByClass(page, "tw-bg-white")).toBe(0)
})

test("create specific-times saves and reopens the canonical active subset instead of the full domain", async ({
  page,
  request,
}) => {
  const created = await createSpecificTimesEventFromDialog(
    page,
    `Create subset ${String(Temporal.Now.instant().epochMilliseconds)}`,
  )

  await dragSelectGridRange(page, {
    startRow: rowIndexForTime(9, 0),
    startCol: 0,
    endRow: rowIndexForTime(10, 45),
    endCol: 0,
  })
  await saveEditorAndWaitForPut(page, { action: "next" })

  const savedEvent = await fetchEventByShortId(request, created.shortId)
  const expectedActiveSlots = expectedCreatedDomain(created).slice(0, 8)
  expect(sortIsoInstants(savedEvent.activeSlots)).toEqual(
    sortIsoInstants(expectedActiveSlots),
  )
  expect(savedEvent).not.toHaveProperty("enabledSlots")

  await openEventPage(page, created.shortId)
  await openSpecificTimesEditor(page)
  await expect(page.locator("#drag-section .timeslot").first()).toBeVisible()
})

test("create specific-times saves the exact visible UTC grid selection instead of failing normalization", async ({
  page,
  request,
}) => {
  const created = await createSpecificTimesEventFromDialog(
    page,
    `Create visible UTC subset ${String(Temporal.Now.instant().epochMilliseconds)}`,
    {
      timezone: {
        optionValue: "UTC",
        optionLabelPattern: /\(GMT\+0:00\).*UTC/i,
      },
    },
  )

  const selectedGridInstants = buildUtcSpecificTimesRangeInstants({
    day: created.selectedDates[0],
    startHour: 9,
    startMinute: 0,
    endHour: 10,
    endMinute: 45,
  })

  await dragSelectGridRange(page, {
    startRow: rowIndexForTime(9, 0),
    startCol: 0,
    endRow: rowIndexForTime(10, 45),
    endCol: 0,
  })

  await saveEditorAndWaitForPut(page, { action: "next" })

  await expect(
    page.getByText("Select at least one time before saving."),
  ).toHaveCount(0)
  await expect(page).toHaveURL(new RegExp(`/e/${created.shortId}$`))

  const savedEvent = await fetchEventByShortId(request, created.shortId)
  expect(selectedGridInstants.length).toBeGreaterThan(0)
  expect(created.createPayload).not.toHaveProperty("enabledSlots")
  expect(savedEvent).not.toHaveProperty("enabledSlots")
  expect(sortIsoInstants(savedEvent.activeSlots)).toEqual(
    sortIsoInstants(selectedGridInstants),
  )
  expect(
    selectedGridInstants.every((instant) =>
      expectedCreatedDomain(created).includes(instant),
    ),
  ).toBe(true)
  expect(
    savedEvent.activeSlots?.every((instant) =>
      selectedGridInstants.includes(instant),
    ) ?? false,
  ).toBe(true)
  expect(savedEvent.activeSlots?.length ?? 0).toBeGreaterThan(0)
})

test("anonymous specific-times create flow survives save, reload, and reopen with canonical slots intact", async ({
  page,
  request,
}) => {
  const created = await createSpecificTimesEventFromDialog(
    page,
    `Anonymous create reload ${String(Temporal.Now.instant().epochMilliseconds)}`,
  )

  await dragSelectGridRange(page, {
    startRow: rowIndexForTime(9, 0),
    startCol: 0,
    endRow: rowIndexForTime(10, 45),
    endCol: 0,
  })
  await saveEditorAndWaitForPut(page, { action: "next" })

  const expectedActiveSlots = expectedCreatedDomain(created).slice(0, 8)
  let savedEvent = await fetchEventByShortId(request, created.shortId)
  expect(sortIsoInstants(savedEvent.activeSlots)).toEqual(
    sortIsoInstants(expectedActiveSlots),
  )
  expect(savedEvent).not.toHaveProperty("enabledSlots")

  await page.reload({ waitUntil: "domcontentloaded" })
  await dismissConsent(page)
  await openSpecificTimesEditor(page)
  await expect(page.locator("#drag-section .timeslot").first()).toBeVisible()

  await saveEditorAndWaitForPut(page, { action: "next" })
  savedEvent = await fetchEventByShortId(request, created.shortId)
  expect(sortIsoInstants(savedEvent.activeSlots)).toEqual(
    sortIsoInstants(expectedActiveSlots),
  )
  expect(savedEvent).not.toHaveProperty("enabledSlots")
})

test("create specific-times without grid edits persists an empty active subset until the first save", async ({
  page,
  request,
}) => {
  const created = await createSpecificTimesEventFromDialog(
    page,
    `Create untouched ${String(Temporal.Now.instant().epochMilliseconds)}`,
  )

  const savedEvent = await fetchEventByShortId(request, created.shortId)
  expect(savedEvent).not.toHaveProperty("enabledSlots")
  expect(sortIsoInstants(savedEvent.activeSlots)).toEqual([])

  await openEventPage(page, created.shortId)
  await waitForSpecificTimesGrid(page)
  expect(await countGridCellsByClass(page, "tw-bg-white")).toBe(0)
})

test("selecting midnight slots outside the default 9-5 enabled range saves the exact cross-day selection", async ({
  page,
  request,
}) => {
  const created = await createSpecificTimesEventFromDialog(
    page,
    `Midnight outside 9-5 ${String(Temporal.Now.instant().epochMilliseconds)}`,
  )

  await dragSelectGridRange(page, {
    startRow: rowIndexForTime(0, 0),
    startCol: 0,
    endRow: rowIndexForTime(1, 0),
    endCol: 1,
  })

  await saveEditorAndWaitForPut(page, { action: "next" })

  await expect(
    page.getByText("Select at least one time before saving."),
  ).toHaveCount(0)
  await expect(page).toHaveURL(new RegExp(`/e/${created.shortId}$`))

  const savedEvent = await fetchEventByShortId(request, created.shortId)
  const expectedActiveSlots = created.selectedDates.flatMap((day) =>
    buildUtcSpecificTimesRangeInstants({
      day,
      startHour: 0,
      startMinute: 0,
      endHour: 1,
      endMinute: 0,
    }),
  )

  expect(sortIsoInstants(savedEvent.activeSlots)).toEqual(
    sortIsoInstants(expectedActiveSlots),
  )
})

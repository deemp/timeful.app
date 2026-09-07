import { expect, test } from "@playwright/test"
import {
  collectGridState,
  dismissConsent,
  fetchEventByShortId,
  getEditorNameInput,
  openEditDialog,
  openEventPage,
  proceedToSpecificTimesGrid,
  revealAdvancedOptions,
  saveEditorAndWaitForPut,
  seedCanonicalTimedEvent,
  setSpecificTimesEnabled,
  sortIsoInstants,
} from "./helpers/timed-event-helpers"

test.describe.configure({ mode: "serial" })

test("round-trips weekly canonical timed fields through the edit flow", async ({
  page,
  request,
}) => {
  const activeSlots = [
    "2026-01-05T17:00:00Z",
    "2026-01-05T17:30:00Z",
    "2026-01-07T17:00:00Z",
    "2026-01-07T17:30:00Z",
  ]
  const seeded = await seedCanonicalTimedEvent(request, {
    name: "Weekly timed roundtrip",
    type: "weekly",
    activeSlots,
    eventTimezone: "America/Los_Angeles",
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

  await openEventPage(page, seeded.shortId)
  const editorCard = await openEditDialog(page)
  await revealAdvancedOptions(editorCard)
  await getEditorNameInput(page).fill("Weekly timed roundtrip edited")
  await saveEditorAndWaitForPut(page, { action: "next" })

  const savedEvent = await fetchEventByShortId(request, seeded.shortId)
  expect(savedEvent.eventTimezone).toBe("America/Los_Angeles")
  expect(savedEvent.slotGeneration).toMatchObject({
    startTimeLocal: "09:00:00",
    endTimeLocal: "10:00:00",
    timeIncrementMinutes: 30,
  })
  expect(savedEvent.timedRecurrence).toMatchObject({
    kind: "weekly",
    selectedDaysOfWeek: [1, 3],
    startOnMonday: true,
  })
  expect(savedEvent).not.toHaveProperty("enabledSlots")
  expect(sortIsoInstants(savedEvent.activeSlots)).toEqual(
    sortIsoInstants(activeSlots),
  )

  await page.reload({ waitUntil: "domcontentloaded" })
  await dismissConsent(page)
  const reopenedEditor = await openEditDialog(page)
  const selectedDowLabels = await reopenedEditor.evaluate((card) =>
    Array.from(
      card.querySelectorAll<HTMLElement>(".editor-dow-button--selected"),
    ).map((element) => element.textContent.replace(/\s+/g, " ").trim()),
  )
  expect(selectedDowLabels).toEqual(["Mon", "Wed"])

  await revealAdvancedOptions(reopenedEditor)
  await setSpecificTimesEnabled(reopenedEditor, true)
  await proceedToSpecificTimesGrid(page)
  const gridState = await collectGridState(page)
  // FR-026: columns are the enabled domain projected into the viewer timezone.
  // The Firefox project fixes the viewer to UTC, so each Los Angeles
  // full-day domain column (Jan 5, Jan 7) spills into the next UTC day.
  // Weekly columns render day names only, never a date line.
  expect(gridState.headerColumns).toEqual(["mon", "tue", "wed", "thu"])
  expect(gridState.visibleDateStrings).toEqual([])
})

test("round-trips group canonical timed fields through the edit flow", async ({
  page,
  request,
}) => {
  const activeSlots = [
    "2026-01-05T17:00:00Z",
    "2026-01-05T17:30:00Z",
    "2026-01-07T17:00:00Z",
    "2026-01-07T17:30:00Z",
  ]
  const seeded = await seedCanonicalTimedEvent(request, {
    name: "Group timed roundtrip",
    type: "group",
    activeSlots,
    eventTimezone: "America/Los_Angeles",
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

  await page.goto(`/g/${seeded.shortId}`, { waitUntil: "domcontentloaded" })
  await dismissConsent(page)
  const editorCard = await openEditDialog(page)
  await revealAdvancedOptions(editorCard)
  await getEditorNameInput(page).fill("Group timed roundtrip edited")
  await saveEditorAndWaitForPut(page, { action: "save" })

  const savedEvent = await fetchEventByShortId(request, seeded.shortId)
  expect(savedEvent.type).toBe("group")
  expect(savedEvent.eventTimezone).toBe("America/Los_Angeles")
  expect(savedEvent.slotGeneration).toMatchObject({
    startTimeLocal: "09:00:00",
    endTimeLocal: "10:00:00",
    timeIncrementMinutes: 30,
  })
  expect(savedEvent.timedRecurrence).toMatchObject({
    kind: "weekly",
    selectedDaysOfWeek: [1, 3],
    startOnMonday: true,
  })
  expect(savedEvent).not.toHaveProperty("enabledSlots")
  expect(sortIsoInstants(savedEvent.activeSlots)).toEqual(
    sortIsoInstants(activeSlots),
  )

  await page.reload({ waitUntil: "domcontentloaded" })
  await dismissConsent(page)
  const reopenedEditor = await openEditDialog(page)
  await expect(getEditorNameInput(page)).toHaveValue(
    "Group timed roundtrip edited",
  )
  const selectedDowLabels = await reopenedEditor.evaluate((card) =>
    Array.from(
      card.querySelectorAll<HTMLElement>(".editor-dow-button--selected"),
    ).map((element) => element.textContent.replace(/\s+/g, " ").trim()),
  )
  expect(selectedDowLabels).toEqual(["Mon", "Wed"])
})

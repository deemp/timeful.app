import { expect, test } from "@playwright/test"
import {
  buildSpecificDateSeed,
  buildUtcSpecificTimesRangeInstants,
  changeDisplayTimezone,
  clickDateCell,
  countGridCellsByClass,
  openEditDialog,
  openEventPage,
  proceedToSpecificTimesGrid,
  readTimeGridHeaderGeometry,
  seedCanonicalTimedEvent,
} from "../helpers/timed-event-helpers"

test.describe.configure({ mode: "serial" })

// Scenario steps preserved verbatim from
// e2e/repro/scenarios/specifict-times-event-keeps-after-adding-date.md,
// which was deleted together with the e2e/repro/ area (TASK-0169):
// 1. Start creating a new event
// 2. Choose "specific times" in the form
// 3. Select June 3, June 4 in the date picker
// 4. Select Time zone +02:00
// 5. Click Next
// 6. Select time in the specific times grid: 0:00 to 1:00 for June 3, 0:00 to 1:00 for June 4
// 7. Click Next to save.
// 8. On the event page, click "Edit event".
// 9. In the form, keep June 3 and June 4 selected, click June 9 to add it
// 10. Click Next to save the change
// 11. Specific times page will open
// 12. Expected:
//     - June 3, June 4, June 9 column labels are visible
//     - previous selection for June 3, June 4 is rendered
//     - for June 9, the whole column is grey
//
//     Not expected:
//     - everything grey, previous selection not rendered
//     - June 4 column label is duplicated
//     - June 3 and June 4 columns are separated by a horizontal gap
//
// 13. Click Edit event
// 14. Remove June 9 in the date picke
// 15. Click Next to save
// 16. Expected: See in the grid that June 9 is gone (only June 3, June 4 remain)
//
//     Not expected: June 9 is still there

test("adding a non-consecutive date keeps one column per projected civil date at +02:00", async ({
  page,
}) => {
  // Historical bug (repro-date-added-visual-gap-and-duplicate.ts): after
  // adding a non-consecutive Event Picked Date while viewing at +02:00, the
  // grid header recomputation rendered a duplicated "June 4" Projected Date
  // Column and misplaced spacers, separating the consecutive Jun 3 and Jun 4
  // columns with a spacer that belongs only between non-consecutive dates.
  // FR-002: exactly one Projected Date Column per distinct Civil Date.
  //
  // June 2026 in Europe/Paris is CEST (+02:00). The firefox-desktop project
  // pins the browser timezone to UTC, so +02:00 is established in-app via the
  // grid-page Display Timezone control, never via browser TZ. The menu has no
  // Europe/Paris entry; its +02:00 bucket is Europe/Brussels ("Brussels,
  // Copenhagen, Madrid, Paris").
  const parisMorningSlots = [
    ...buildUtcSpecificTimesRangeInstants({
      day: "2026-06-02", // Jun 3 00:00-00:45 CEST slot starts (00:00-01:00)
      startHour: 22,
      startMinute: 0,
      endHour: 22,
      endMinute: 45,
    }),
    ...buildUtcSpecificTimesRangeInstants({
      day: "2026-06-03", // Jun 4 00:00-00:45 CEST slot starts (00:00-01:00)
      startHour: 22,
      startMinute: 0,
      endHour: 22,
      endMinute: 45,
    }),
  ]

  const seeded = await seedCanonicalTimedEvent(
    page.request,
    buildSpecificDateSeed({
      name: "Date-added header layout regression",
      selectedDays: ["2026-06-03", "2026-06-04"],
      activeSlots: parisMorningSlots,
      eventTimezone: "Europe/Paris",
      // Equal start and end express the full-day wrapped window the old UI
      // repro produced; the server derives the full civil day regardless.
      startTimeLocal: "00:00",
      endTimeLocal: "00:00",
      timeIncrementMinutes: 15,
    }),
  )
  console.log(`Seeded event: /e/${seeded.shortId}`)

  await openEventPage(page, seeded.shortId)
  await changeDisplayTimezone(page, {
    optionValue: "Europe/Brussels",
    optionLabelPattern: /\(GMT\+2:00\)/i,
  })

  await test.step("add June 9 in the edit dialog and open the grid", async () => {
    const editorCard = await openEditDialog(page)
    await clickDateCell(editorCard, "2026-06-09")
    await proceedToSpecificTimesGrid(page)
  })

  const dayColumns = page.locator(
    ".schedule-overlap-time-grid__header .schedule-overlap-time-grid__day-column",
  )
  const dateLabels = dayColumns.locator(".tw\\:text-\\[12px\\]")
  await expect(dayColumns).toHaveCount(3)
  await expect(dateLabels).toHaveText([/^jun 3$/i, /^jun 4$/i, /^jun 9$/i])

  const geometry = await readTimeGridHeaderGeometry(page)
  expect(geometry.columns.map((column) => column.dateLabel)).toEqual([
    "jun 3",
    "jun 4",
    "jun 9",
  ])

  // FR-013 AC3 artifact class: no structural split gaps between consecutive
  // Projected Date Columns; Jun 3 and Jun 4 must sit edge to edge.
  const [jun3, jun4, jun9] = geometry.columns
  expect(jun4.x - (jun3.x + jun3.width)).toBeLessThan(1)

  // Exactly one spacer, positioned between Jun 4 and Jun 9. Design-pinned,
  // not FR-mandated: the single spacer between non-consecutive dates is the
  // current header design (the isConsecutive gap in
  // ScheduleOverlapTimeGrid.vue) and may be relaxed if that design changes.
  expect(geometry.spacers).toHaveLength(1)
  const [spacer] = geometry.spacers
  expect(spacer.x).toBeGreaterThanOrEqual(jun4.x + jun4.width)
  expect(spacer.x + spacer.width).toBeLessThanOrEqual(jun9.x)

  // FR-051: the newly added Event Picked Date contributes its full Enabled
  // Domain without adding Active Slots; the prior selection still renders
  // active (00:00-01:00 Paris on both seeded days = 4 cells per column) and
  // the added Jun 9 column has none.
  await expect(
    page.locator('#drag-section .timeslot.tw\\:bg-white[data-col="0"]'),
  ).toHaveCount(4)
  await expect(
    page.locator('#drag-section .timeslot.tw\\:bg-white[data-col="1"]'),
  ).toHaveCount(4)
  await expect(
    page.locator('#drag-section .timeslot.tw\\:bg-white[data-col="2"]'),
  ).toHaveCount(0)
  expect(await countGridCellsByClass(page, "tw:bg-white")).toBe(8)
})

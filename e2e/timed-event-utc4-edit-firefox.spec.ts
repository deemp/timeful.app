import { expect, test } from "@playwright/test"
import {
  buildSpecificDateSeed,
  countGridCellsByClass,
  openEditDialog,
  openEventPage,
  proceedToSpecificTimesGrid,
  seedCanonicalTimedEvent,
} from "./helpers/timed-event-helpers"

test.describe.configure({ mode: "serial" })

test("UTC+4 specific-times edit preserves active slots in grid", async ({
  page,
  request,
}) => {
  // Seed: UTC+4 (Asia/Dubai), Jun 24-25, 03:00-05:00 window, 60-min increments
  // 2 slots per day x 2 days = 4 slots total
  const allSlots = [
    "2026-06-23T23:00:00Z", // Jun 24 03:00 UTC+4
    "2026-06-24T00:00:00Z", // Jun 24 04:00 UTC+4
    "2026-06-24T23:00:00Z", // Jun 25 03:00 UTC+4
    "2026-06-25T00:00:00Z", // Jun 25 04:00 UTC+4
  ]

  const seeded = await seedCanonicalTimedEvent(
    request,
    buildSpecificDateSeed({
      name: "UTC+4 specific-times grid regression",
      selectedDays: ["2026-06-24", "2026-06-25"],
      activeSlots: allSlots,
      eventTimezone: "Asia/Dubai",
      startTimeLocal: "03:00",
      endTimeLocal: "05:00",
      timeIncrementMinutes: 60,
    }),
  )

  console.log(`Seeded event: /e/${seeded.shortId}`)
  await openEventPage(page, seeded.shortId)
  await openEditDialog(page)
  await proceedToSpecificTimesGrid(page)

  // The Firefox project fixes the display timezone to UTC. All four slots must
  // remain addressable through their event-timezone membership dates. FR-026
  // projects every enabled slot into the viewer timezone: the full-day Dubai
  // domain spans UTC Jun 23-25, so the grid renders 24 rows x 3 columns.
  const whiteCount = await countGridCellsByClass(page, "tw-bg-white")
  const totalCells = await page.locator("#drag-section .timeslot").count()
  console.log(
    `White cells: ${String(whiteCount)}, Total cells: ${String(totalCells)}`,
  )

  expect(totalCells).toBe(72)
  expect(whiteCount).toBe(4)
})

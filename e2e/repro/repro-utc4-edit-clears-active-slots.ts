import {
  APP_BASE_URL,
  openEventPage,
  openEditDialog,
  runFirefoxScenario,
  withEventMutationLog,
  collectSpecificTimesPageEvidence,
} from "../helpers/firefox-timed-event-harness.ts"
import { Temporal } from "temporal-polyfill"

/**
 * Bug repro: UTC+4 specific-times event shows no active slots in grid on edit.
 *
 * Setup:
 * - eventTimezone = Asia/Dubai (UTC+4)
 * - membership: Jun 24 + Jun 25
 * - slot window: 03:00-05:00 local (2 h, 60 min increments = 2 slots/day)
 * - all 4 slots are active
 *
 * Expected when opening the editor and entering the specific-times grid:
 * All 4 grid cells should be white/selected (active).
 *
 * Bug: All cells appear grey (unselected), as if activeSlots is empty.
 */
async function seedEvent(name: string): Promise<{ shortId: string }> {
  const buildSlots = (day: string, startHour: number, count: number) =>
    Array.from({ length: count }, (_, offset) =>
      Temporal.Instant.from(
        `${day}T${String(startHour).padStart(2, "0")}:00:00Z`,
      )
        .add({ hours: offset })
        .toString(),
    )

  // June 24 03:00 Dubai = Jun 23 23:00 UTC; 04:00 Dubai = Jun 24 00:00 UTC
  const jun24Slots = buildSlots("2026-06-23", 23, 2) // 23:00, 00:00
  // June 25 03:00 Dubai = Jun 24 23:00 UTC; 04:00 Dubai = Jun 25 00:00 UTC
  const jun25Slots = buildSlots("2026-06-24", 23, 2) // 23:00, 00:00
  const allSlots = [...jun24Slots, ...jun25Slots]

  const body = {
    name,
    duration: 2,
    dates: ["2026-06-23T23:00:00.000Z", "2026-06-24T23:00:00.000Z"],
    type: "specific_dates",
    hasSpecificTimes: true,
    activeSlots: [...allSlots],
    times: [...allSlots],
    notificationsEnabled: false,
    blindAvailabilityEnabled: false,
    daysOnly: false,
    remindees: [],
    sendEmailAfterXResponses: -1,
    collectEmails: false,
    startOnMonday: true,
    timeIncrement: 60,
    eventTimezone: "Asia/Dubai",
    slotGeneration: {
      startTimeLocal: "03:00",
      endTimeLocal: "05:00",
      timeIncrementMinutes: 60,
    },
    timedRecurrence: {
      kind: "specific_dates",
      selectedDays: ["2026-06-24", "2026-06-25"],
      selectedDaysOfWeek: [],
      startOnMonday: true,
    },
    creatorPosthogId: `repro-${String(Temporal.Now.instant().epochMilliseconds)}`,
  }

  const response = await fetch(`${APP_BASE_URL}/api/events`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
  })

  const bodyText = await response.text()
  let json: { shortId?: string }
  try {
    json = JSON.parse(bodyText) as { shortId?: string }
  } catch {
    throw new Error(
      `Seed failed: invalid JSON. status=${String(response.status)}, body=${bodyText}`,
    )
  }

  if (!response.ok || !json.shortId) {
    throw new Error(
      `Seed failed: ${JSON.stringify({ status: response.status, body: json })}`,
    )
  }

  return { shortId: json.shortId }
}

void runFirefoxScenario("utc4-edit-clears-active-slots", async ({ page }) => {
  const eventName = `utc4-slots-${String(Temporal.Now.instant().epochMilliseconds)}`
  console.log(`Seeding event: ${eventName}`)
  const seed = await seedEvent(eventName).catch((err: unknown) => {
    console.error("seedEvent failed:", err)
    throw err
  })
  console.log(`Seeded: ${seed.shortId}`)

  console.log("Opening event page...")
  await openEventPage(page, seed.shortId).catch((err: unknown) => {
    console.error("openEventPage failed:", err)
    throw err
  })
  console.log("Opening edit dialog...")
  await openEditDialog(page).catch((err: unknown) => {
    console.error("openEditDialog failed:", err)
    throw err
  })

  await withEventMutationLog(page, async () => {
    // Enter the specific-times grid
    await page.getByRole("button", { name: /^Next$/ }).click({ force: true })
    await page.waitForSelector(".schedule-overlap-time-grid__header")
    await page.waitForSelector(
      '#drag-section .timeslot[data-row="0"][data-col="0"]',
    )
    await page.waitForTimeout(1500)
  })

  // Collect grid evidence
  const evidence = await collectSpecificTimesPageEvidence(page)

  // Get detailed cell state
  const cellDetails = await page.evaluate(() => {
    const cells = document.querySelectorAll(
      "#drag-section .timeslot[data-row][data-col]",
    )
    return Array.from(cells).map((cell) => {
      const el = cell as HTMLElement
      return {
        row: el.getAttribute("data-row"),
        col: el.getAttribute("data-col"),
        className: el.className,
      }
    })
  })

  const selectedCells = cellDetails.filter((c) =>
    c.className.includes("tw-bg-white"),
  )
  const grayCells = cellDetails.filter((c) =>
    c.className.includes("tw-bg-gray"),
  )
  const totalCells = cellDetails.length
  const expectedActiveCount = 4

  const isBugReproduced =
    selectedCells.length !== expectedActiveCount ||
    totalCells < expectedActiveCount

  return {
    setup: {
      shortId: seed.shortId,
    },
    gridEvidence: {
      headerColumns: evidence.headerColumns,
      visibleDateStrings: evidence.visibleDateStrings,
      totalCells,
      expectedActiveCount,
      selectedCellCount: selectedCells.length,
      grayCellCount: grayCells.length,
    },
    verdict: isBugReproduced ? "BUG REPRODUCED" : "NO BUG",
  }
})

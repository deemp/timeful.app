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
 * Regression scenario for viewer-timezone column duplication.
 *
 * Setup: event with eventTimezone=Asia/Bangkok (+7), membership Jun 14+15,
 * active slots from Jun 14 17:00 UTC (= Jun 15 00:00 Bangkok) onward.
 *
 * Historical bug: When viewer timezone was +6, the Jun 15 display seed (Jun 14 17:00 UTC)
 * converts to Jun 14 23:00 +6 → truncated midnight → Jun 14.
 * Both membership dates produced "Jun 14" columns → duplicated.
 *
 * When viewer timezone is +7, Jun 14 17:00 UTC → Jun 15 00:00 +7 → Jun 15.
 * Columns must remain correct (Jun 14, Jun 15).
 */
async function seedEvent(name: string): Promise<{ shortId: string }> {
  const generateSlots = (
    day: string,
    startHour: number,
    endHour: number,
    increment = 15,
  ) => {
    const slots: string[] = []
    let totalMinutes = startHour * 60
    const endMinutes = endHour * 60
    while (totalMinutes < endMinutes) {
      const h = Math.floor(totalMinutes / 60)
      const m = totalMinutes % 60
      slots.push(
        `${day}T${String(h).padStart(2, "0")}:${String(m).padStart(2, "0")}:00.000Z`,
      )
      totalMinutes += increment
    }
    return slots
  }

  const jun14Active = generateSlots("2026-06-14", 17, 24) // 17:00-23:45 UTC
  const jun15Active = generateSlots("2026-06-15", 0, 17) // 00:00-16:45 UTC
  const activeSlots = [...jun14Active, ...jun15Active]

  const body = {
    name,
    type: "specific_dates",
    activeSlots,
    notificationsEnabled: false,
    blindAvailabilityEnabled: false,
    daysOnly: false,
    remindees: [],
    sendEmailAfterXResponses: -1,
    collectEmails: false,
    eventTimezone: "Asia/Bangkok",
    slotGeneration: {
      startTimeLocal: "00:00",
      endTimeLocal: "23:45",
      timeIncrementMinutes: 15,
    },
    timedRecurrence: {
      kind: "specific_dates",
      selectedDays: ["2026-06-14", "2026-06-15"],
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

  const json = (await response.json()) as { shortId?: string }
  if (!response.ok || !json.shortId) {
    throw new Error(
      `Seed failed: ${JSON.stringify({ status: response.status, body: json })}`,
    )
  }

  return { shortId: json.shortId }
}

void runFirefoxScenario("viewer-tz-column-duplication", async ({ page }) => {
  const seed = await seedEvent(
    `tz-column-repro-${String(Temporal.Now.instant().epochMilliseconds)}`,
  )

  await openEventPage(page, seed.shortId)
  await openEditDialog(page)

  const networkLog = await withEventMutationLog(page, async () => {
    // Enter the specific-times grid (SET_SPECIFIC_TIMES state)
    await page.getByRole("button", { name: /^Next$/ }).click({ force: true })
    await page.waitForSelector(".schedule-overlap-time-grid__header")
  })

  // Collect column evidence with default viewer timezone (should be UTC/browser)
  await page.waitForTimeout(500)
  const defaultTzEvidence = await collectSpecificTimesPageEvidence(page)

  // Now change the viewer timezone to UTC+6
  const timezoneTrigger = page.locator(
    '[data-testid="timezone-select-trigger"]',
  )
  if (await timezoneTrigger.isVisible().catch(() => false)) {
    await timezoneTrigger.click({ force: true })
    // Look for Etc/GMT-6 or similar offset option
    const gmt6Option = page.locator('[data-timezone-value="Etc/GMT-6"]')
    if (await gmt6Option.isVisible().catch(() => false)) {
      await gmt6Option.click({ force: true })
    } else {
      // Try text-based selection
      await page
        .locator('.v-list-item:has-text("GMT-6")')
        .first()
        .click({ force: true })
    }
    await page.waitForTimeout(500)
  }
  const gmt6Evidence = await collectSpecificTimesPageEvidence(page)

  // Change to UTC+7
  if (await timezoneTrigger.isVisible().catch(() => false)) {
    await timezoneTrigger.click({ force: true })
    const gmt7Option = page.locator('[data-timezone-value="Etc/GMT-7"]')
    if (await gmt7Option.isVisible().catch(() => false)) {
      await gmt7Option.click({ force: true })
    } else {
      await page
        .locator('.v-list-item:has-text("GMT-7")')
        .first()
        .click({ force: true })
    }
    await page.waitForTimeout(500)
  }
  const gmt7Evidence = await collectSpecificTimesPageEvidence(page)

  return {
    setup: { shortId: seed.shortId },
    networkLog,
    columnsByTz: {
      default: {
        columns: defaultTzEvidence.headerColumns,
        labels: defaultTzEvidence.visibleDateStrings,
        uniqueLabels: [...new Set(defaultTzEvidence.visibleDateStrings)],
      },
      gmt6: {
        columns: gmt6Evidence.headerColumns,
        labels: gmt6Evidence.visibleDateStrings,
        uniqueLabels: [...new Set(gmt6Evidence.visibleDateStrings)],
      },
      gmt7: {
        columns: gmt7Evidence.headerColumns,
        labels: gmt7Evidence.visibleDateStrings,
        uniqueLabels: [...new Set(gmt7Evidence.visibleDateStrings)],
      },
    },
    checks: {
      // BUG: gmt6 should show 2 unique column labels (Jun 14 and Jun 15)
      // but currently shows 1 because Jun 15 seed shifts to Jun 14 in +6
      gmt6HasTwoUniqueColumns:
        [...new Set(gmt6Evidence.visibleDateStrings)].length === 2,
      gmt6HasCorrectLabels:
        [...new Set(gmt6Evidence.visibleDateStrings)].some((s) =>
          s.includes("14"),
        ) &&
        [...new Set(gmt6Evidence.visibleDateStrings)].some((s) =>
          s.includes("15"),
        ),
      gmt6ColumnsMatchMembership: gmt6Evidence.headerColumns.length === 2,
      // gmt7 should also show 2 unique columns
      gmt7HasTwoUniqueColumns:
        [...new Set(gmt7Evidence.visibleDateStrings)].length === 2,
    },
  }
})

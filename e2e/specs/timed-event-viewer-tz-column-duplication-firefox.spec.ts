import {
  expect,
  test,
  type APIRequestContext,
  type Page,
} from "@playwright/test"
import {
  buildSpecificDateSeed,
  buildUtcSpecificTimesRangeInstants,
  changeDisplayTimezone,
  openEventPage,
  openSpecificTimesEditor,
  seedCanonicalTimedEvent,
} from "../helpers/timed-event-helpers"

test.describe.configure({ mode: "serial" })

// Historical bug (repro-viewer-tz-column-duplication.ts): with eventTimezone
// Asia/Bangkok and slots spanning midnight, switching the Display Timezone to
// UTC+6 collapsed the Jun 15 column into a duplicated Jun 14 column, because
// the Jun 15 display seed (Jun 14 17:00 UTC) converted to Jun 14 23:00 +06 and
// truncated to Jun 14; both membership dates produced "jun 14" columns. At
// UTC+7 the same seed converts to Jun 15 00:00 +07, so columns stayed correct
// (jun 14, jun 15). FR-013: changing the Display Timezone updates each slot's
// projected date and Projected Date Column, and a Time Slot renders no more
// than once, including across midnight. FR-002: one Projected Date Column per
// distinct Civil Date in the Display Timezone.
//
// Column count at UTC+6 (verified against current app behavior and unit
// coverage): both the event-page view state and the SET_SPECIFIC_TIMES edit
// grid derive columns from the derived enabled domain, which is always the
// full Bangkok civil days per the server contract, so at +6 each membership
// day crosses the display midnight and the grid legitimately renders jun 13
// in addition to jun 14 and jun 15. The regression under test is duplicated
// labels, so each offset asserts exactly one column per distinct Civil Date
// label; AC #3's original "exactly 2 unique labels at +6" premise was amended
// with this diagnosis (user-approved).
//
// POSIX Etc/GMT-6 and Etc/GMT-7 equal UTC+6 and UTC+7 (inverted sign). The
// app timezone menu exposes civil zones only, so UTC+6 maps to Asia/Dhaka
// ("(GMT+6:00) Astana, Dhaka") and UTC+7 maps to Asia/Bangkok
// ("(GMT+7:00) Bangkok, Hanoi, Jakarta").
//
// Seed: active slots from 2026-06-14T17:00:00Z through 2026-06-15T16:45:00Z
// (= Jun 15 00:00-23:45 Bangkok at 15-minute increments). The task estimated
// 89 slots; 17:00Z Jun 14 through 16:45Z Jun 15 inclusive at 15 minutes is
// 28 + 68 = 96, matching the deleted repro's own generator. No assertion
// depends on the exact count.

async function seedBangkokMidnightEvent(
  request: APIRequestContext,
  name: string,
): Promise<string> {
  const { shortId } = await seedCanonicalTimedEvent(
    request,
    buildSpecificDateSeed({
      name,
      selectedDays: ["2026-06-14", "2026-06-15"],
      activeSlots: [
        ...buildUtcSpecificTimesRangeInstants({
          day: "2026-06-14",
          startHour: 17,
          startMinute: 0,
          endHour: 23,
          endMinute: 45,
        }),
        ...buildUtcSpecificTimesRangeInstants({
          day: "2026-06-15",
          startHour: 0,
          startMinute: 0,
          endHour: 16,
          endMinute: 45,
        }),
      ],
      eventTimezone: "Asia/Bangkok",
      startTimeLocal: "00:00",
      endTimeLocal: "23:45",
      timeIncrementMinutes: 15,
    }),
  )

  return shortId
}

function getHeaderParts(page: Page) {
  const dayColumns = page.locator(
    ".schedule-overlap-time-grid__header .schedule-overlap-time-grid__day-column",
  )

  return { dayColumns, dateLabels: dayColumns.locator(".tw-text-\\[12px\\]") }
}

test("event page renders unique projected civil date labels at UTC+6 and UTC+7", async ({
  page,
  request,
}) => {
  const shortId = await seedBangkokMidnightEvent(
    request,
    "Viewer TZ column duplication regression",
  )
  console.log(`Seeded event: /e/${shortId}`)
  await openEventPage(page, shortId)

  await test.step("switch display timezone to UTC+6", async () => {
    await changeDisplayTimezone(page, {
      optionValue: "Asia/Dhaka",
      optionLabelPattern: /\(GMT\+6:00\)/i,
    })
    const { dayColumns, dateLabels } = getHeaderParts(page)
    // The enabled domain (full Bangkok days) crosses the +6 display midnight
    // and legitimately contributes jun 13; the bug under test is duplicated
    // labels, so assert exactly one column per distinct Civil Date label.
    await expect(dayColumns).toHaveCount(3)
    await expect(dateLabels).toHaveText([/^jun 13$/i, /^jun 14$/i, /^jun 15$/i])
  })

  await test.step("switch display timezone to UTC+7", async () => {
    await changeDisplayTimezone(page, {
      optionValue: "Asia/Bangkok",
      optionLabelPattern: /\(GMT\+7:00\)/i,
    })
    const { dayColumns, dateLabels } = getHeaderParts(page)
    await expect(dayColumns).toHaveCount(2)
    await expect(dateLabels).toHaveText([/^jun 14$/i, /^jun 15$/i])
  })
})

test("specific-times edit grid projects enabled-domain columns per display timezone", async ({
  page,
  request,
}) => {
  const shortId = await seedBangkokMidnightEvent(
    request,
    "Viewer TZ edit grid column regression",
  )
  console.log(`Seeded event: /e/${shortId}`)
  await openEventPage(page, shortId)
  await openSpecificTimesEditor(page)

  await test.step("UTC+6 keeps unique labels while the enabled domain crosses display midnight", async () => {
    await changeDisplayTimezone(page, {
      optionValue: "Asia/Dhaka",
      optionLabelPattern: /\(GMT\+6:00\)/i,
    })
    const { dayColumns, dateLabels } = getHeaderParts(page)
    // In SET_SPECIFIC_TIMES the columns are picked dates plus the civil dates
    // of the enabled domain in the display timezone; each full Bangkok day
    // crosses the +6 display midnight, legitimately yielding jun 13
    // (unit-confirmed in useCalendarGrid.test.ts). Duplicated labels are the
    // regression under test.
    await expect(dayColumns).toHaveCount(3)
    await expect(dateLabels).toHaveText([/^jun 13$/i, /^jun 14$/i, /^jun 15$/i])
  })

  await test.step("UTC+7 collapses back to the two membership days", async () => {
    await changeDisplayTimezone(page, {
      optionValue: "Asia/Bangkok",
      optionLabelPattern: /\(GMT\+7:00\)/i,
    })
    const { dayColumns, dateLabels } = getHeaderParts(page)
    await expect(dayColumns).toHaveCount(2)
    await expect(dateLabels).toHaveText([/^jun 14$/i, /^jun 15$/i])
  })
})

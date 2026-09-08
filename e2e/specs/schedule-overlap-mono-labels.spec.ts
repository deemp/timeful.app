import { expect, test } from "@playwright/test"
import {
  buildSpecificDateSeed,
  openEventPage,
  seedCanonicalTimedEvent,
} from "../helpers/timed-event-helpers"

// Regression: the unlayered `* { font-family: "DM Sans" }` rule in App.vue
// outranked every cascade layer, so the layered tw:font-mono utility never
// reached grid labels. The default now lives on root-level rules and can only
// act through inheritance, letting layered utilities win direct declarations.
test("grid time labels render Chivo Mono through the layered mono utility", async ({
  page,
  request,
}) => {
  const seeded = await seedCanonicalTimedEvent(
    request,
    buildSpecificDateSeed({
      name: "Mono label cascade",
      selectedDays: ["2026-06-02", "2026-06-03"],
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

  await openEventPage(page, seeded.shortId)

  // The grid collapses non-working rows, and the viewer timezone shifts the
  // visible window per project, so assert the mono family across every
  // rendered mono element (gutter labels and collapsed-hour buttons) instead
  // of anchoring to one row id.
  const firstMonoElement = page.locator("[class*='font-mono']").first()
  await expect(firstMonoElement).toBeVisible()
  const monoFamilies = await page.evaluate(() =>
    Array.from(
      document.querySelectorAll<HTMLElement>("[class*='font-mono']"),
    ).map((element) => getComputedStyle(element).fontFamily),
  )
  expect(monoFamilies.length).toBeGreaterThan(0)
  for (const family of monoFamilies) {
    expect(family).toContain("Chivo Mono")
  }

  const bodyFamily = await page.evaluate(
    () => getComputedStyle(document.body).fontFamily,
  )
  expect(bodyFamily).toContain("DM Sans")
})

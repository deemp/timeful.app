import { expect, test } from "@playwright/test"
import {
  buildSpecificDateSeed,
  createSpecificTimesEventFromDialog,
  openEventPage,
  rowIndexForTime,
  seedCanonicalTimedEvent,
} from "./helpers/timed-event-helpers"
import { Temporal } from "temporal-polyfill"

test.beforeEach(({ hasTouch }) => {
  test.skip(
    !hasTouch,
    "The touch spec requires a touch-enabled browser context (firefox-touch / a mobile device)",
  )
})

test("disabled mobile Schedule keeps the scheduled-event blue at full opacity", async ({
  page,
}) => {
  await createSpecificTimesEventFromDialog(
    page,
    "Mobile disabled Schedule color regression",
  )

  const selectedSlot = page.locator(
    '#drag-section .timeslot[data-row="1"][data-col="0"]',
  )
  const selectedSlotBox = await selectedSlot.boundingBox()
  expect(selectedSlotBox).not.toBeNull()
  if (!selectedSlotBox) {
    throw new Error("Expected a selectable grid slot")
  }
  await page.touchscreen.tap(
    selectedSlotBox.x + selectedSlotBox.width / 2,
    selectedSlotBox.y + selectedSlotBox.height / 2,
  )
  await page.getByTestId("specific-times-grid-next").click()
  await page.getByRole("button", { name: "Schedule" }).click()

  const scheduleButton = page.locator("button.mobile-schedule-button")
  await expect(scheduleButton).toBeDisabled()
  await expect(scheduleButton).toHaveCSS(
    "background-color",
    "rgb(118, 175, 242)",
  )
  await expect(scheduleButton).toHaveCSS(
    "border-top-color",
    "rgb(118, 175, 242)",
  )
  await expect(scheduleButton).toHaveCSS("color", "rgb(255, 255, 255)")
  await expect(scheduleButton).toHaveCSS("opacity", "1")
})

test("Responses panel prevents touch gestures from reaching the mobile grid", async ({
  page,
}) => {
  await createSpecificTimesEventFromDialog(
    page,
    "Mobile Responses touch shield regression",
  )

  const selectedSlot = page.locator(
    '#drag-section .timeslot[data-row="1"][data-col="0"]',
  )
  await selectedSlot.scrollIntoViewIfNeeded()
  await selectedSlot.dispatchEvent("click")

  await page.evaluate(() => {
    const dragSection = document.querySelector("#drag-section")
    if (!(dragSection instanceof HTMLElement)) {
      throw new Error("Expected drag section")
    }
    dragSection.dataset.pointerDowns = "0"
    dragSection.dataset.mouseDowns = "0"
    dragSection.dataset.clicks = "0"
    dragSection.addEventListener("pointerdown", () => {
      dragSection.dataset.pointerDowns = String(
        Number(dragSection.dataset.pointerDowns) + 1,
      )
    })
    dragSection.addEventListener("mousedown", () => {
      dragSection.dataset.mouseDowns = String(
        Number(dragSection.dataset.mouseDowns) + 1,
      )
    })
    dragSection.addEventListener("click", () => {
      dragSection.dataset.clicks = String(
        Number(dragSection.dataset.clicks) + 1,
      )
    })
  })

  const responsesHeading = page
    .locator(".schedule-overlap-mobile-overlay")
    .getByText("Responses", { exact: true })
  await expect(responsesHeading).toBeVisible()
  const headingBox = await responsesHeading.boundingBox()
  expect(headingBox).not.toBeNull()
  if (!headingBox) {
    throw new Error("Expected the Responses heading to be visible")
  }
  await page.touchscreen.tap(
    headingBox.x + headingBox.width / 2,
    headingBox.y + headingBox.height / 2,
  )
  await expect(responsesHeading).toBeVisible()
  await expect
    .poll(() =>
      page.locator("#drag-section").evaluate((element) => ({
        pointerDowns: Number((element as HTMLElement).dataset.pointerDowns),
        mouseDowns: Number((element as HTMLElement).dataset.mouseDowns),
        clicks: Number((element as HTMLElement).dataset.clicks),
      })),
    )
    .toEqual({ pointerDowns: 0, mouseDowns: 0, clicks: 0 })
})

test("Responses panel stacks above an overlapping mobile tooltip", async ({
  page,
}) => {
  await createSpecificTimesEventFromDialog(
    page,
    "Mobile Responses tooltip layering regression",
  )

  const selectedSlot = page.locator(
    '#drag-section .timeslot[data-row="1"][data-col="0"]',
  )
  await selectedSlot.scrollIntoViewIfNeeded()
  await selectedSlot.dispatchEvent("click")

  const overlay = page.locator(".schedule-overlap-mobile-overlay")
  const tooltip = page.locator(".tw-fixed.timeful-tooltip-layer")
  await expect(overlay.getByText("Responses", { exact: true })).toBeVisible()
  await expect(tooltip).toBeVisible()

  await expect
    .poll(() =>
      page.evaluate(() => {
        const overlayElement = document.querySelector<HTMLElement>(
          ".schedule-overlap-mobile-overlay",
        )
        const tooltipElement = document.querySelector<HTMLElement>(
          ".tw-fixed.timeful-tooltip-layer",
        )
        if (!overlayElement || !tooltipElement) return false

        const overlayRect = overlayElement.getBoundingClientRect()
        tooltipElement.style.left = `${String(overlayRect.left + overlayRect.width / 2)}px`
        tooltipElement.style.top = `${String(overlayRect.top + 16)}px`
        tooltipElement.style.transform = "translate(-50%, 0)"
        tooltipElement.style.pointerEvents = "auto"

        return overlayElement.contains(
          document.elementFromPoint(
            overlayRect.left + overlayRect.width / 2,
            overlayRect.top + 16,
          ),
        )
      }),
    )
    .toBe(true)
})

test("mobile action bar stacks above an overlapping mobile tooltip", async ({
  page,
}) => {
  await createSpecificTimesEventFromDialog(
    page,
    "Mobile action bar tooltip layering regression",
  )

  const selectedSlot = page.locator(
    '#drag-section .timeslot[data-row="1"][data-col="0"]',
  )
  await selectedSlot.scrollIntoViewIfNeeded()
  const selectedSlotBox = await selectedSlot.boundingBox()
  expect(selectedSlotBox).not.toBeNull()
  if (!selectedSlotBox) {
    throw new Error("Expected a selectable grid slot")
  }
  await page.touchscreen.tap(
    selectedSlotBox.x + selectedSlotBox.width / 2,
    selectedSlotBox.y + selectedSlotBox.height / 2,
  )
  await page.getByTestId("specific-times-grid-next").click()

  const actionBar = page.locator(".mobile-event-action-bar")
  await expect(actionBar).toBeVisible()

  await selectedSlot.scrollIntoViewIfNeeded()
  await selectedSlot.dispatchEvent("click")

  const tooltip = page.locator(".tw-fixed.timeful-tooltip-layer")
  await expect(tooltip).toBeVisible()

  await expect
    .poll(() =>
      page.evaluate(() => {
        const actionBarElement = document.querySelector<HTMLElement>(
          ".mobile-event-action-bar",
        )
        const tooltipElement = document.querySelector<HTMLElement>(
          ".tw-fixed.timeful-tooltip-layer",
        )
        if (!actionBarElement || !tooltipElement) return false

        const actionBarRect = actionBarElement.getBoundingClientRect()
        tooltipElement.style.left = `${String(actionBarRect.left + actionBarRect.width / 2)}px`
        tooltipElement.style.top = `${String(actionBarRect.top + actionBarRect.height / 2)}px`
        tooltipElement.style.transform = "translate(-50%, 0)"
        tooltipElement.style.pointerEvents = "auto"

        return actionBarElement.contains(
          document.elementFromPoint(
            actionBarRect.left + actionBarRect.width / 2,
            actionBarRect.top + actionBarRect.height / 2,
          ),
        )
      }),
    )
    .toBe(true)
})

test("touching a timeslot keeps its mobile tooltip anchored while scrolling", async ({
  page,
}) => {
  await createSpecificTimesEventFromDialog(
    page,
    "Mobile touch selected-slot tooltip regression",
  )

  const selectedSlot = page.locator(
    '#drag-section .timeslot[data-row="1"][data-col="0"]',
  )
  await selectedSlot.scrollIntoViewIfNeeded()
  const selectedSlotBox = await selectedSlot.boundingBox()
  expect(selectedSlotBox).not.toBeNull()
  if (!selectedSlotBox) {
    throw new Error("Expected selected grid slot to be visible")
  }

  await page.touchscreen.tap(
    selectedSlotBox.x + selectedSlotBox.width / 2,
    selectedSlotBox.y + selectedSlotBox.height / 2,
  )

  const tooltip = page.locator(".tw-fixed.timeful-tooltip-layer")
  await expect(tooltip).toBeVisible()
  expect(await tooltip.textContent()).not.toBe("")

  await page.evaluate(() => {
    window.scrollBy({ top: 50 })
  })

  await expect
    .poll(async () => {
      return page.evaluate(() => {
        const slot = document.querySelector<HTMLElement>(
          '#drag-section .timeslot[data-row="1"][data-col="0"]',
        )
        const tooltipElement = document.querySelector<HTMLElement>(
          ".tw-fixed.timeful-tooltip-layer",
        )
        if (!slot || !tooltipElement) return false

        const slotRect = slot.getBoundingClientRect()
        return (
          Number.parseFloat(tooltipElement.style.left) ===
            slotRect.left + slotRect.width / 2 &&
          Number.parseFloat(tooltipElement.style.top) ===
            (tooltipElement.style.transform.includes("calc")
              ? slotRect.top
              : slotRect.top + slotRect.height)
        )
      })
    })
    .toBe(true)
})

test("mobile grid tooltip stays below the top navbar when scrolled underneath it", async ({
  page,
}) => {
  await createSpecificTimesEventFromDialog(
    page,
    "Mobile tooltip navbar layering regression",
  )

  const selectedSlot = page.locator(
    '#drag-section .timeslot[data-row="1"][data-col="0"]',
  )
  await selectedSlot.scrollIntoViewIfNeeded()
  const selectedSlotBox = await selectedSlot.boundingBox()
  expect(selectedSlotBox).not.toBeNull()
  if (!selectedSlotBox) {
    throw new Error("Expected selected grid slot to be visible")
  }

  await page.touchscreen.tap(
    selectedSlotBox.x + selectedSlotBox.width / 2,
    selectedSlotBox.y + selectedSlotBox.height / 2,
  )

  const tooltip = page.locator(".tw-fixed.timeful-tooltip-layer")
  await expect(tooltip).toBeVisible()

  await page.evaluate(() => {
    const header = document.querySelector<HTMLElement>(
      ".tw-fixed.tw-h-14.tw-w-screen",
    )
    const slot = document.querySelector<HTMLElement>(
      '#drag-section .timeslot[data-row="1"][data-col="0"]',
    )
    const scrollContainer = document.scrollingElement as HTMLElement | null
    if (!header || !slot || !scrollContainer) {
      throw new Error(
        "Expected top navbar, selected grid slot, and scroll container",
      )
    }

    const headerRect = header.getBoundingClientRect()
    const slotRect = slot.getBoundingClientRect()
    scrollContainer.style.scrollBehavior = "auto"
    scrollContainer.scrollTop +=
      slotRect.top - (headerRect.height - slotRect.height - 16)
    window.dispatchEvent(new Event("scroll"))
  })

  await expect
    .poll(() =>
      page.evaluate(() => {
        const header = document.querySelector<HTMLElement>(
          ".tw-fixed.tw-h-14.tw-w-screen",
        )
        const tooltipElement = document.querySelector<HTMLElement>(
          ".tw-fixed.timeful-tooltip-layer",
        )
        if (!header || !tooltipElement) return false

        // Allow hit testing without changing the tooltip's stacking context.
        tooltipElement.style.pointerEvents = "auto"

        const headerRect = header.getBoundingClientRect()
        const tooltipRect = tooltipElement.getBoundingClientRect()
        const left = Math.max(headerRect.left, tooltipRect.left)
        const right = Math.min(headerRect.right, tooltipRect.right)
        const top = Math.max(headerRect.top, tooltipRect.top)
        const bottom = Math.min(headerRect.bottom, tooltipRect.bottom)
        if (left >= right || top >= bottom) return false

        return header.contains(
          document.elementFromPoint((left + right) / 2, (top + bottom) / 2),
        )
      }),
    )
    .toBe(true)
})

test("Responses panel list scrolls under a static Responses heading", async ({
  page,
  request,
}) => {
  const now = Temporal.Now.instant()
  const today = now.toZonedDateTimeISO("UTC").toPlainDate().toString()
  const startTimeLocal = "09:00"
  const timeIncrementMinutes = 60
  const slot = `${today}T09:00:00.000Z`

  const seed = await seedCanonicalTimedEvent(
    request,
    buildSpecificDateSeed({
      name: `Mobile Responses scrollable panel ${String(now.epochMilliseconds)}`,
      selectedDays: [today],
      activeSlots: [slot, `${today}T10:00:00.000Z`],
      eventTimezone: "UTC",
      startTimeLocal,
      endTimeLocal: "17:00",
      timeIncrementMinutes,
    }),
  )

  // Zero-padded names keep the alphabetical DOM order aligned with the
  // seeding order, so the last seeded guest is the last rendered row.
  const guestNames = Array.from(
    { length: 24 },
    (_unused, index) => `Guest ${String(index + 1).padStart(2, "0")}`,
  )
  for (const name of guestNames) {
    const guestResponse = await request.post(
      `/api/events/${seed.eventId}/response`,
      {
        data: {
          guest: true,
          name,
          email: "",
          availability: [slot],
          ifNeeded: [],
          guestEditPolicy: "open",
        },
      },
    )
    expect(guestResponse.ok()).toBeTruthy()
  }

  await openEventPage(page, seed.shortId)

  // Grid rows are indexed from midnight, so the first active slot at 09:00
  // with a 60-minute increment sits at base row index 9, above the collapsed
  // 00:00-09:00 disabled span.
  const firstSlotRowIndex = rowIndexForTime(9, 0, timeIncrementMinutes)
  const selectedSlot = page.locator(
    `#drag-section .timeslot[data-row="${String(firstSlotRowIndex)}"][data-col="0"]`,
  )
  await selectedSlot.scrollIntoViewIfNeeded()
  await selectedSlot.dispatchEvent("click")

  const overlay = page.locator(".schedule-overlap-mobile-overlay")
  const responsesHeading = overlay.getByText("Responses", { exact: true })
  await expect(responsesHeading).toBeVisible()

  const scrollView = overlay.locator('[data-testid="respondents-scroll-view"]')
  await expect(scrollView).toBeVisible()

  expect(
    await scrollView.evaluate(
      (element) => window.getComputedStyle(element).maxHeight,
    ),
  ).toBe("240px")

  await expect
    .poll(() =>
      scrollView.evaluate(
        (element) => element.scrollHeight - element.clientHeight,
      ),
    )
    .toBeGreaterThan(0)

  // The sticky panel enters through an expand transition, so the heading only
  // reaches its final viewport position once the animation settles. Measure
  // the baseline box only after it is stable.
  let previousHeadingBox: { x: number; y: number } | null = null
  await expect
    .poll(async () => {
      const box = await responsesHeading.boundingBox()
      const stable =
        previousHeadingBox != null &&
        box != null &&
        Math.abs(box.x - previousHeadingBox.x) <= 1 &&
        Math.abs(box.y - previousHeadingBox.y) <= 1
      previousHeadingBox = box
      return stable
    })
    .toBe(true)

  const headingBox = await responsesHeading.boundingBox()
  expect(headingBox).not.toBeNull()
  if (!headingBox) {
    throw new Error("Expected the Responses heading to have a bounding box")
  }

  await scrollView.evaluate((element) => {
    element.scrollTop = element.scrollHeight
  })

  const headingBoxAfterScroll = await responsesHeading.boundingBox()
  expect(headingBoxAfterScroll).not.toBeNull()
  if (!headingBoxAfterScroll) {
    throw new Error("Expected the Responses heading to keep a bounding box")
  }
  expect(Math.abs(headingBoxAfterScroll.y - headingBox.y)).toBeLessThanOrEqual(
    1,
  )
  expect(Math.abs(headingBoxAfterScroll.x - headingBox.x)).toBeLessThanOrEqual(
    1,
  )

  const lastSeededRow = overlay
    .locator(".respondent-row")
    .filter({ hasText: guestNames[guestNames.length - 1] })
  await expect(lastSeededRow).toHaveCount(1)
  const lastRowBox = await lastSeededRow.boundingBox()
  const scrollViewBox = await scrollView.boundingBox()
  expect(lastRowBox).not.toBeNull()
  expect(scrollViewBox).not.toBeNull()
  if (!lastRowBox || !scrollViewBox) {
    throw new Error("Expected the last row and the scroll view to have boxes")
  }
  expect(lastRowBox.y).toBeGreaterThanOrEqual(scrollViewBox.y - 1)
  expect(lastRowBox.y + lastRowBox.height).toBeLessThanOrEqual(
    scrollViewBox.y + scrollViewBox.height + 1,
  )
})

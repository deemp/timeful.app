import { expect, test } from "@playwright/test"
import {
  buildSpecificDateSeed,
  openEventPage,
  seedCanonicalTimedEvent,
  waitForScheduleOverlapMounted,
} from "./helpers/timed-event-helpers"
import { Temporal } from "temporal-polyfill"

test.describe.configure({ mode: "serial" })

test("event page without responses pairs each header row with one action column", async ({
  page,
  request,
}, testInfo) => {
  test.skip(
    testInfo.project.name === "chromium-mobile",
    "Desktop-only header layout",
  )

  const now = Temporal.Now.instant()
  const today = now.toZonedDateTimeISO("UTC").toPlainDate().toString()

  const seed = await seedCanonicalTimedEvent(
    request,
    buildSpecificDateSeed({
      name: `Layout test ${String(now.epochMilliseconds)}`,
      selectedDays: [today],
      activeSlots: [`${today}T09:00:00.000Z`, `${today}T10:00:00.000Z`],
      eventTimezone: "UTC",
      startTimeLocal: "09:00",
      endTimeLocal: "17:00",
      timeIncrementMinutes: 60,
    }),
  )

  await openEventPage(page, seed.shortId)

  // Verify "Add availability" button exists
  const addAvailabilityBtn = page.locator("#desktop-primary-availability-btn")
  await expect(addAvailabilityBtn).toBeVisible()
  await expect(addAvailabilityBtn).toHaveText(/Add availability/i)

  const collapseDisabledTimesToggle = page.locator(
    ".desktop-event-header-options__collapse-disabled-times-switch",
  )
  const scheduleEventButton = page.getByRole("button", {
    name: /^Schedule event$/i,
  })
  await expect(collapseDisabledTimesToggle).toBeVisible()
  await expect(scheduleEventButton).toBeVisible()

  if (testInfo.project.name === "chromium-desktop") {
    const timeFormatToggle = page.locator(".time-format-toggle")
    const firstTimeGridRow = page
      .locator(".schedule-overlap-time-grid__body-row")
      .first()
    const nextPageButton = page.locator(
      ".schedule-overlap-sidebar__pager button.v-btn",
    )
    const title = page.locator(
      "#event-header > .event-header-row:first-child > .tw-min-w-0.tw-flex-1 > div:first-child",
    )
    const editEventButton = page.locator("#edit-event-btn")
    const [
      titleBox,
      addAvailabilityBox,
      editEventBox,
      collapseDisabledTimesBox,
      scheduleEventBox,
      timeFormatToggleBox,
      firstTimeGridRowBox,
      nextPageButtonBox,
      sidebarBox,
      githubLinkBox,
    ] = await Promise.all([
      title.boundingBox(),
      addAvailabilityBtn.boundingBox(),
      editEventButton.boundingBox(),
      collapseDisabledTimesToggle.boundingBox(),
      scheduleEventButton.boundingBox(),
      timeFormatToggle.boundingBox(),
      firstTimeGridRow.boundingBox(),
      nextPageButton.boundingBox(),
      page.locator(".schedule-overlap-sidebar").boundingBox(),
      page.getByRole("link", { name: "GitHub" }).boundingBox(),
    ])
    if (
      titleBox === null ||
      addAvailabilityBox === null ||
      editEventBox === null ||
      collapseDisabledTimesBox === null ||
      scheduleEventBox === null ||
      timeFormatToggleBox === null ||
      firstTimeGridRowBox === null ||
      nextPageButtonBox === null ||
      sidebarBox === null ||
      githubLinkBox === null
    ) {
      throw new Error(
        "Expected each header-row detail and action to have boxes",
      )
    }
    for (const [detailBox, actionBox] of [
      [titleBox, addAvailabilityBox],
      [editEventBox, collapseDisabledTimesBox],
    ]) {
      expect(
        Math.abs(
          detailBox.y +
            detailBox.height / 2 -
            (actionBox.y + actionBox.height / 2),
        ),
      ).toBeLessThanOrEqual(1)
      expect(
        Math.abs(actionBox.width - addAvailabilityBox.width),
      ).toBeLessThanOrEqual(1)
      expect(Math.abs(actionBox.x - addAvailabilityBox.x)).toBeLessThanOrEqual(
        1,
      )
    }
    expect(
      Math.abs(scheduleEventBox.width - addAvailabilityBox.width),
    ).toBeLessThanOrEqual(1)
    expect(
      Math.abs(scheduleEventBox.x - addAvailabilityBox.x),
    ).toBeLessThanOrEqual(1)
    expect(
      Math.abs(timeFormatToggleBox.y - firstTimeGridRowBox.y),
    ).toBeLessThanOrEqual(1)
    const gridRightToTimeFormatToggleLeft =
      timeFormatToggleBox.x -
      (firstTimeGridRowBox.x + firstTimeGridRowBox.width)
    expect(gridRightToTimeFormatToggleLeft).toBeGreaterThanOrEqual(16)
    expect(gridRightToTimeFormatToggleLeft).toBeLessThanOrEqual(20)
    expect(
      Math.abs(nextPageButtonBox.x - timeFormatToggleBox.x),
    ).toBeLessThanOrEqual(2)
    expect(
      Math.abs(
        addAvailabilityBox.x +
          addAvailabilityBox.width -
          (sidebarBox.x + sidebarBox.width),
      ),
    ).toBeLessThanOrEqual(1)
    expect(
      Math.abs(
        githubLinkBox.x +
          githubLinkBox.width -
          (sidebarBox.x + sidebarBox.width),
      ),
    ).toBeLessThanOrEqual(1)

    const viewport = page.viewportSize()
    if (viewport === null) {
      throw new Error("Expected a viewport size")
    }
    const columnSideInset = (viewport.width - 1024) / 2
    expect(
      Math.abs(
        sidebarBox.x +
          sidebarBox.width -
          (viewport.width - columnSideInset - 16),
      ),
    ).toBeLessThanOrEqual(1)
    expect(Math.abs(titleBox.x - (columnSideInset + 16))).toBeLessThanOrEqual(1)

    const allHoursContentCenter = await page.evaluate<number | null>(() => {
      const toggle = document.querySelector<HTMLElement>(
        "#collapse-disabled-times-toggle",
      )
      const control = toggle?.closest<HTMLElement>(".v-selection-control")
      const input = control?.querySelector<HTMLElement>(
        ".v-selection-control__wrapper",
      )
      const label = control?.querySelector<HTMLElement>(".v-label")

      if (!toggle || !input || !label) return null

      const inputRect = input.getBoundingClientRect()
      const labelRect = label.getBoundingClientRect()
      return (
        (Math.min(inputRect.left, labelRect.left) +
          Math.max(inputRect.right, labelRect.right)) /
        2
      )
    })
    expect(allHoursContentCenter).not.toBeNull()
    if (allHoursContentCenter === null) {
      throw new Error("Expected the Collapse disabled times switch content")
    }
    expect(
      Math.abs(
        allHoursContentCenter -
          (collapseDisabledTimesBox.x + collapseDisabledTimesBox.width / 2),
      ),
    ).toBeLessThanOrEqual(2)
  }

  // Verify the parent wrapper does NOT have tw-col-span-2 (which makes it very wide)
  const parentWrapper = page.locator(
    "#event-header-actions .desktop-primary-availability-anchor",
  )
  const parentClass = await parentWrapper.getAttribute("class")
  expect(parentClass).not.toContain("tw-col-span-2")

  // Verify "More options" is NOT present
  const moreOptions = page.locator("#desktop-header-more-options")
  await expect(moreOptions).not.toBeVisible()
})

test("timed event timezone stays close to Responses", async ({
  page,
  request,
}, testInfo) => {
  test.skip(
    testInfo.project.name === "chromium-mobile",
    "Desktop-only sidebar layout",
  )

  const now = Temporal.Now.instant()
  const today = now.toZonedDateTimeISO("UTC").toPlainDate().toString()
  const seed = await seedCanonicalTimedEvent(
    request,
    buildSpecificDateSeed({
      name: `Timed responses spacing ${String(now.epochMilliseconds)}`,
      selectedDays: [today],
      activeSlots: [`${today}T09:00:00.000Z`, `${today}T10:00:00.000Z`],
      eventTimezone: "UTC",
      startTimeLocal: "09:00",
      endTimeLocal: "17:00",
      timeIncrementMinutes: 60,
    }),
  )

  await openEventPage(page, seed.shortId)

  const timezone = page.getByTestId("timezone-select-trigger")
  const responsesHeading = page.getByText("Responses", { exact: true })
  await expect(timezone).toBeVisible()
  await expect(responsesHeading).toBeVisible()

  const [timezoneBox, responsesHeadingBox] = await Promise.all([
    timezone.boundingBox(),
    responsesHeading.boundingBox(),
  ])

  if (timezoneBox === null || responsesHeadingBox === null) {
    throw new Error(
      "Expected the timezone selector and Responses heading to have boxes",
    )
  }

  expect(
    responsesHeadingBox.y - (timezoneBox.y + timezoneBox.height),
  ).toBeLessThanOrEqual(10)
})

test("timed add availability controls stay close to the Legend", async ({
  page,
  request,
}, testInfo) => {
  test.skip(
    testInfo.project.name === "chromium-mobile",
    "Desktop-only sidebar layout",
  )

  const now = Temporal.Now.instant()
  const today = now.toZonedDateTimeISO("UTC").toPlainDate().toString()
  const seed = await seedCanonicalTimedEvent(
    request,
    buildSpecificDateSeed({
      name: `Timed add availability spacing ${String(now.epochMilliseconds)}`,
      selectedDays: [today],
      activeSlots: [`${today}T09:00:00.000Z`, `${today}T10:00:00.000Z`],
      eventTimezone: "UTC",
      startTimeLocal: "09:00",
      endTimeLocal: "17:00",
      timeIncrementMinutes: 60,
    }),
  )

  await openEventPage(page, seed.shortId)
  await waitForScheduleOverlapMounted(page)
  await page.locator("#desktop-primary-availability-btn").click()
  await page.getByRole("button", { name: "Manually", exact: true }).click()

  const lastEditControl = page.locator(".calendar-options-button")
  const legend = page.getByText("Legend", { exact: true })
  await expect(lastEditControl).toBeVisible()
  await expect(legend).toBeVisible()

  const [lastEditControlBox, legendBox] = await Promise.all([
    lastEditControl.boundingBox(),
    legend.boundingBox(),
  ])
  if (lastEditControlBox === null || legendBox === null) {
    throw new Error(
      "Expected Add availability controls and Legend to have boxes",
    )
  }

  expect(
    legendBox.y - (lastEditControlBox.y + lastEditControlBox.height),
  ).toBeLessThanOrEqual(10)
})

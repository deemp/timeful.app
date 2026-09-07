import { expect, test, type Locator } from "@playwright/test"
import { Temporal } from "temporal-polyfill"
import {
  buildSpecificDateSeed,
  openEditDialog,
  openEventPage,
  revealAdvancedOptions,
  seedCanonicalTimedEvent,
  setSpecificTimesEnabled,
} from "./helpers/timed-event-helpers"

test.describe.configure({ mode: "serial" })

interface ToggleGeometry {
  centerDrift: number
  gapT: number
  gapB: number
  gapL: number
  gapR: number
}

async function readToggleGeometry(
  option: Locator,
  indicator: Locator,
): Promise<ToggleGeometry> {
  const optionBox = await option.boundingBox()
  const indicatorBox = await indicator.boundingBox()
  if (optionBox === null || indicatorBox === null) {
    return {
      centerDrift: Number.POSITIVE_INFINITY,
      gapT: Number.POSITIVE_INFINITY,
      gapB: Number.POSITIVE_INFINITY,
      gapL: Number.POSITIVE_INFINITY,
      gapR: Number.POSITIVE_INFINITY,
    }
  }
  return {
    centerDrift: Math.abs(
      optionBox.x +
        optionBox.width / 2 -
        (indicatorBox.x + indicatorBox.width / 2),
    ),
    gapT: Math.abs(indicatorBox.y - optionBox.y - TOGGLE_GAP),
    gapB: Math.abs(
      optionBox.y +
        optionBox.height -
        indicatorBox.y -
        indicatorBox.height -
        TOGGLE_GAP,
    ),
    gapL: Math.abs(indicatorBox.x - optionBox.x - TOGGLE_GAP),
    gapR: Math.abs(
      optionBox.x +
        optionBox.width -
        indicatorBox.x -
        indicatorBox.width -
        TOGGLE_GAP,
    ),
  }
}

const TOGGLE_GAP = 3

async function expectUniformToggle(toggle: Locator): Promise<void> {
  const options = toggle.locator(".time-format-toggle__option")
  const indicator = toggle.locator(".time-format-toggle__indicator")
  const count = await options.count()
  expect(count).toBeGreaterThan(1)

  const indicatorWidths: number[] = []

  for (let index = 0; index < count; index += 1) {
    const option = options.nth(index)
    await option.click({ force: true })

    await expect
      .poll(async () => {
        const indicatorBox = await indicator.boundingBox()
        if (indicatorBox !== null) {
          indicatorWidths.push(indicatorBox.width)
        }
        const geometry = await readToggleGeometry(option, indicator)
        return Math.max(
          geometry.centerDrift,
          geometry.gapT,
          geometry.gapB,
          geometry.gapL,
          geometry.gapR,
        )
      })
      .toBeLessThanOrEqual(0.75)

    const singleLine = await option.evaluate((element) => {
      const range = document.createRange()
      range.selectNodeContents(element)
      return range.getClientRects().length === 1
    })
    expect(singleLine, "option label must stay on a single line").toBe(true)
  }

  const buttonWidths = await options.evaluateAll((elements) =>
    elements.map((element) => element.getBoundingClientRect().width),
  )
  const buttonWidthSpread =
    Math.max(...buttonWidths) - Math.min(...buttonWidths)
  expect(
    buttonWidthSpread,
    "all option buttons must be the same width",
  ).toBeLessThanOrEqual(0.5)

  const indicatorWidthSpread =
    Math.max(...indicatorWidths) - Math.min(...indicatorWidths)
  expect(
    indicatorWidthSpread,
    "indicator size must stay fixed across selections",
  ).toBeLessThanOrEqual(0.5)

  for (let index = 0; index < count; index += 1) {
    const option = options.nth(index)
    const classNames = (await option.getAttribute("class")) ?? ""
    const isNonSelected = classNames.includes("hover:tw-text-black")
    const colorBeforeHover = await option.evaluate(
      (element) => getComputedStyle(element).color,
    )
    await option.hover()
    if (isNonSelected) {
      await expect(option).toHaveCSS("color", "rgb(0, 0, 0)")
    } else {
      await expect(option).toHaveCSS("color", colorBeforeHover)
    }
    await expect(option).toHaveCSS("background-color", "rgba(0, 0, 0, 0)")
  }
}

test("keeps the toggle indicator uniformly inset in the new event form", async ({
  page,
  request,
}) => {
  const today = Temporal.Now.plainDateISO().toString()
  const { shortId } = await seedCanonicalTimedEvent(
    request,
    buildSpecificDateSeed({
      name: `Toggle alignment ${String(Temporal.Now.instant().epochMilliseconds)}`,
      selectedDays: [today],
      activeSlots: [`${today}T09:00:00.000Z`, `${today}T10:00:00.000Z`],
      eventTimezone: "UTC",
      startTimeLocal: "09:00",
      endTimeLocal: "17:00",
      timeIncrementMinutes: 15,
    }),
  )

  await openEventPage(page, shortId)
  const editorCard = await openEditDialog(page)
  // Specific-times events hide the 12h/24h toggle row; uncheck the switch so
  // the row (and the toggle under test) re-appears.
  await setSpecificTimesEnabled(editorCard, false)
  await revealAdvancedOptions(editorCard)

  const timeTypeToggle = editorCard
    .locator(".time-format-toggle")
    .filter({ hasText: /12h/ })
  const incrementToggle = editorCard.locator(
    ".advanced-options-panel .time-format-toggle",
  )

  await expect(timeTypeToggle).toBeVisible()
  await expect(
    timeTypeToggle.locator(".time-format-toggle__option"),
  ).toHaveText(["12h", "24h"])
  await expect(incrementToggle).toBeVisible()
  await expect(
    incrementToggle.locator(".time-format-toggle__option"),
  ).toHaveText(["15 min", "30 min", "60 min"])

  await expectUniformToggle(timeTypeToggle)
  await expectUniformToggle(incrementToggle)
})

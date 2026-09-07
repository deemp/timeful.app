import { expect, test, type Page } from "@playwright/test"
import { dismissConsent, getEditorCard } from "./helpers/timed-event-helpers"
import { settlePage } from "./helpers/settle"

test.describe.configure({ mode: "serial" })

interface ChipMetrics {
  width: number
  text: string
  textTruncated: boolean
  caretOverflowsChip: boolean
}

interface RowMetrics {
  toggleRight: number
  pickerLeft: number
  gap: number
  rowWidth: number
  chips: ChipMetrics[]
}

async function openCreateForm(
  page: Page,
  viewportWidth: number,
): Promise<void> {
  await page.setViewportSize({ width: viewportWidth, height: 800 })
  await page.goto("/", { waitUntil: "domcontentloaded" })
  await dismissConsent(page)
  await page
    .getByRole("button", { name: /create event/i })
    .first()
    .click({ force: true })
  const editorCard = getEditorCard(page)
  await editorCard.waitFor({ state: "visible" })
}

async function measureRow(page: Page): Promise<RowMetrics> {
  return page.evaluate(() => {
    const row = document.querySelector<HTMLElement>(".time-range-row")
    if (row === null) throw new Error("missing .time-range-row")
    const toggle = row.querySelector<HTMLElement>(".time-format-toggle")
    const picker = row.querySelector<HTMLElement>(".time-range-picker")
    if (toggle === null || picker === null) {
      throw new Error("missing toggle or picker in .time-range-row")
    }
    const toggleRect = toggle.getBoundingClientRect()
    const pickerRect = picker.getBoundingClientRect()
    const rowRect = row.getBoundingClientRect()
    const chips: ChipMetrics[] = Array.from(
      row.querySelectorAll<HTMLElement>(".time-range-select .v-field"),
    ).map((field) => {
      const fieldRect = field.getBoundingClientRect()
      const selection = field.querySelector<HTMLElement>(".v-select__selection")
      const selectionRect = selection?.getBoundingClientRect()
      const caret = field.querySelector<HTMLElement>(".v-field__append-inner")
      const caretRect = caret?.getBoundingClientRect()
      return {
        width: fieldRect.width,
        text: (selection?.textContent ?? "").trim(),
        textTruncated:
          selectionRect !== undefined &&
          (selectionRect.right > fieldRect.right + 0.5 ||
            selectionRect.left < fieldRect.left - 0.5),
        caretOverflowsChip:
          caretRect !== undefined &&
          (caretRect.right > fieldRect.right + 0.5 ||
            caretRect.left < fieldRect.left - 0.5),
      }
    })
    return {
      toggleRight: toggleRect.right,
      pickerLeft: pickerRect.left,
      gap: pickerRect.left - toggleRect.right,
      rowWidth: rowRect.width,
      chips,
    }
  })
}

async function readOpenMenuMetrics(page: Page): Promise<{
  menuWidth: number
  itemTruncated: boolean
  itemMinHeight: number
}> {
  const content = activeRangeMenuContent(page).first()
  await content
    .locator(".time-range-select-item")
    .first()
    .waitFor({ state: "visible" })
  return content.evaluate((menu) => {
    const menuRect = menu.getBoundingClientRect()
    const item = menu.querySelector<HTMLElement>(".time-range-select-item")
    const itemRect = item?.getBoundingClientRect()
    return {
      menuWidth: menuRect.width,
      itemTruncated:
        item !== null &&
        itemRect !== undefined &&
        item.scrollWidth > item.clientWidth + 0.5,
      itemMinHeight: itemRect?.height ?? 0,
    }
  })
}

function activeRangeMenuContent(page: Page) {
  return page
    .locator(
      ".v-overlay-container .v-menu.v-overlay--active:has(.time-range-select-item)",
    )
    .locator(".v-overlay__content")
}

async function openStartMenu(page: Page): Promise<void> {
  const field = page
    .locator(".time-range-row .time-range-select .v-field")
    .first()
  await field.scrollIntoViewIfNeeded()

  const activeItems = activeRangeMenuContent(page).locator(
    ".time-range-select-item:visible",
  )
  for (const openAction of [
    async () => field.click({ force: true }),
    async () =>
      field.locator(".v-select__selection").first().click({ force: true }),
    async () =>
      field.locator(".v-field__append-inner").first().click({ force: true }),
    async () => field.press("ArrowDown"),
    async () => field.press("Enter"),
  ]) {
    if ((await activeItems.count()) > 0) {
      break
    }
    await openAction()
    await settlePage(page, 150)
  }
  await expect(activeItems.first()).toBeVisible({ timeout: 15000 })
}

for (const viewportWidth of [360, 375]) {
  test(`row fits at ${viewportWidth}px with visible gap and no truncation`, async ({
    page,
  }) => {
    await openCreateForm(page, viewportWidth)
    const metrics = await measureRow(page)

    expect(metrics.gap).toBeGreaterThan(0)
    expect(metrics.chips).toHaveLength(2)
    for (const chip of metrics.chips) {
      expect(chip.textTruncated, `chip "${chip.text}" must not clip`).toBe(
        false,
      )
      expect(chip.caretOverflowsChip).toBe(false)
    }

    await openStartMenu(page)
    const menu = await readOpenMenuMetrics(page)
    expect(menu.itemTruncated).toBe(false)
    expect(menu.itemMinHeight).toBeGreaterThanOrEqual(39)
    expect(menu.menuWidth).toBeCloseTo(metrics.chips[0].width, 0)
    await page.keyboard.press("Escape")
  })
}

// Disabled follow-up (TASK-0124.03): the NewSignUp form is not reachable from
// the signed-out landing page create dialog — the dialog renders no "Sign up
// form" tab button there, so the mobile row cannot be verified yet. NewEvent
// coverage above already exercises the shared TimeRangePicker row.
test.fixme("sign-up form keeps the one-row layout with a visible gap at 375px", async ({
  page,
}) => {
  await openCreateForm(page, 375)
  await page
    .getByRole("button", { name: /sign up form/i })
    .click({ force: true })
  const row = page.locator(".time-range-row")
  await row.waitFor({ state: "visible" })

  const metrics = await measureRow(page)
  expect(metrics.gap).toBeGreaterThan(0)
  expect(metrics.chips).toHaveLength(2)
  for (const chip of metrics.chips) {
    expect(chip.textTruncated, `chip "${chip.text}" must not clip`).toBe(false)
  }
})

test("chip width grows from 100px at 350px to 120px at 400px viewport", async ({
  page,
}) => {
  await openCreateForm(page, 350)
  const at350 = await measureRow(page)
  expect(at350.chips[0].width).toBeCloseTo(100, 0)
  expect(at350.gap).toBeGreaterThan(0)

  await page.setViewportSize({ width: 400, height: 800 })
  await settlePage(page, 150)
  const at400 = await measureRow(page)
  expect(at400.chips[0].width).toBeCloseTo(120, 0)
  expect(at400.chips[1].width).toBeCloseTo(120, 0)
})

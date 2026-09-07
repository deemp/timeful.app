import { expect, test } from "@playwright/test"
import {
  createSpecificTimesEventFromDialog,
  dragSelectGridRange,
  saveEditorAndWaitForPut,
} from "./helpers/timed-event-helpers"

test("a read-only mobile grid lets a touch swipe scroll the event page", async ({
  page,
  browserName,
}, testInfo) => {
  test.skip(
    browserName !== "chromium" || testInfo.project.name !== "chromium-mobile",
    "Native touch move dispatch is only available in the Chromium mobile project",
  )

  await createSpecificTimesEventFromDialog(
    page,
    "Mobile read-only grid scroll regression",
  )
  await dragSelectGridRange(page, {
    startRow: 1,
    startCol: 0,
    endRow: 1,
    endCol: 0,
  })
  await saveEditorAndWaitForPut(page, { action: "next" })

  const slot = page.locator(
    '#drag-section .timeslot[data-row="1"][data-col="0"]',
  )
  await slot.scrollIntoViewIfNeeded()
  const box = await slot.boundingBox()
  expect(box).not.toBeNull()
  if (!box) throw new Error("Expected a visible grid slot")

  const startScrollTop = await page.evaluate(
    () => document.scrollingElement?.scrollTop ?? 0,
  )
  const session = await page.context().newCDPSession(page)
  const x = box.x + box.width / 2
  const y = box.y + box.height / 2

  await session.send("Input.dispatchTouchEvent", {
    type: "touchStart",
    touchPoints: [{ x, y, id: 1 }],
  })
  await session.send("Input.dispatchTouchEvent", {
    type: "touchMove",
    touchPoints: [{ x, y: y - 80, id: 1 }],
  })
  await session.send("Input.dispatchTouchEvent", {
    type: "touchMove",
    touchPoints: [{ x, y: y - 160, id: 1 }],
  })
  await session.send("Input.dispatchTouchEvent", {
    type: "touchEnd",
    touchPoints: [],
  })

  await expect
    .poll(() => page.evaluate(() => document.scrollingElement?.scrollTop ?? 0))
    .toBeGreaterThan(startScrollTop)
})

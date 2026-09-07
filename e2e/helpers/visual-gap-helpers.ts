import type { Locator, Page } from "@playwright/test"

export type VisualEdge = "box-top" | "box-bottom" | "ink-top" | "ink-bottom"

export interface VisualGapTarget {
  locator: Locator
  edge: VisualEdge
}

interface Box {
  x: number
  y: number
  width: number
  height: number
}

async function boxOf(locator: Locator): Promise<Box | null> {
  const box = await locator.boundingBox()
  return box
    ? { x: box.x, y: box.y, width: box.width, height: box.height }
    : null
}

interface EvaluateInput {
  pngBytes: Uint8Array<ArrayBuffer>
  topBox: Box
  bottomBox: Box
  topEdge: VisualEdge
  bottomEdge: VisualEdge
}

/**
 * Measure the visual vertical gap between two rendered regions using the
 * actual pixels of a full-page screenshot, so line-box leading, font metrics,
 * and padding are all accounted for the same way a user sees them:
 * - box edges come from the element borders,
 * - ink edges come from the first/last dark pixel row inside the element.
 */
export async function measureVisualGap(
  page: Page,
  top: VisualGapTarget,
  bottom: VisualGapTarget,
): Promise<number> {
  const png = await page.screenshot()
  const [topBox, bottomBox] = await Promise.all([
    boxOf(top.locator),
    boxOf(bottom.locator),
  ])
  if (!topBox || !bottomBox) {
    throw new Error("Missing bounding boxes for visual gap measurement")
  }
  const input: EvaluateInput = {
    pngBytes: new Uint8Array(png),
    topBox,
    bottomBox,
    topEdge: top.edge,
    bottomEdge: bottom.edge,
  }
  return page.evaluate(
    async ({ pngBytes, topBox, bottomBox, topEdge, bottomEdge }) => {
      const bitmap = await createImageBitmap(
        new Blob([pngBytes], { type: "image/png" }),
      )
      const canvas = document.createElement("canvas")
      canvas.width = bitmap.width
      canvas.height = bitmap.height
      const ctx = canvas.getContext("2d")
      if (!ctx) throw new Error("Canvas 2D context unavailable")
      ctx.drawImage(bitmap, 0, 0)
      const data = ctx.getImageData(0, 0, canvas.width, canvas.height).data

      const scaleX = (pointX: number) =>
        pointX * (canvas.width / window.innerWidth)
      const scaleY = (pointY: number) =>
        pointY * (canvas.height / window.innerHeight)
      const toCssY = (pixelY: number) =>
        pixelY / (canvas.height / window.innerHeight)

      const scaled = (box: typeof topBox) => ({
        x: Math.max(0, Math.floor(scaleX(box.x))),
        y: Math.max(0, Math.floor(scaleY(box.y))),
        right: Math.min(canvas.width, Math.ceil(scaleX(box.x + box.width))),
        bottom: Math.min(canvas.height, Math.ceil(scaleY(box.y + box.height))),
      })
      const topRegion = scaled(topBox)
      const bottomRegion = scaled(bottomBox)

      const x0 = Math.min(topRegion.x, bottomRegion.x)
      const x1 = Math.max(topRegion.right, bottomRegion.right)
      if (x0 >= x1) throw new Error("Empty horizontal scan range")

      const firstInkRow = (region: {
        y: number
        bottom: number
      }): number | null => {
        for (let y = region.y; y < region.bottom; y += 1) {
          for (let x = x0; x < x1; x += 1) {
            const i = (y * canvas.width + x) * 4
            if (data[i] < 140 && data[i + 1] < 140 && data[i + 2] < 140) {
              return toCssY(y)
            }
          }
        }
        return null
      }
      const lastInkRow = (region: {
        y: number
        bottom: number
      }): number | null => {
        for (let y = region.bottom - 1; y >= region.y; y -= 1) {
          for (let x = x0; x < x1; x += 1) {
            const i = (y * canvas.width + x) * 4
            if (data[i] < 140 && data[i + 1] < 140 && data[i + 2] < 140) {
              return toCssY(y)
            }
          }
        }
        return null
      }

      const edgeY = (
        box: typeof topBox,
        region: { y: number; bottom: number },
        edge: typeof topEdge,
      ): number => {
        switch (edge) {
          case "box-top":
            return box.y
          case "box-bottom":
            return box.y + box.height
          case "ink-top": {
            const row = firstInkRow(region)
            if (row === null)
              throw new Error("No ink rows found for ink-top edge")
            return row
          }
          case "ink-bottom": {
            const row = lastInkRow(region)
            if (row === null)
              throw new Error("No ink rows found for ink-bottom edge")
            return row
          }
        }
      }

      const topY = edgeY(topBox, topRegion, topEdge)
      const bottomY = edgeY(bottomBox, bottomRegion, bottomEdge)
      return bottomY - topY
    },
    input,
  )
}

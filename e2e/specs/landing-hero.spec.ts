import { expect, test, type Page, type Route } from "@playwright/test"
import {
  getActiveToolingMode,
  resolveLandingSignInEnabled,
} from "../config/tooling"

const landingSignInEnabled = resolveLandingSignInEnabled(getActiveToolingMode())

function assertPresent<T>(value: T | null, message: string): T {
  expect(value, message).not.toBeNull()
  if (value === null) {
    throw new Error(message)
  }

  return value
}

async function stabilizeLanding(page: Page) {
  await page.route("https://buttons.github.io/**", (route: Route) =>
    route.abort(),
  )
  await page.route("https://player.vimeo.com/**", (route: Route) =>
    route.abort(),
  )
  await page.route("https://i.vimeocdn.com/**", (route: Route) => route.abort())
  await page.route("https://f.vimeocdn.com/**", (route: Route) => route.abort())

  await page.goto("/")
  await page.addStyleTag({
    content: `
      *, *::before, *::after {
        animation: none !important;
        transition: none !important;
        caret-color: transparent !important;
      }

      iframe,
      .github-button iframe,
      .vp-preview,
      .vp-player-layout,
      [data-vimeo-initialized="true"] {
        visibility: hidden !important;
      }
    `,
  })
}

test.describe("landing hero", () => {
  test("preserves the key desktop layout contract", async ({
    page,
    isMobile,
  }) => {
    test.skip(isMobile, "Desktop assertions only apply to the desktop project.")

    await stabilizeLanding(page)

    const heading = page.getByRole("heading", { name: "Find a time to meet" })
    const subtitle = page.locator(".landing-hero-subtitle")
    const cta = page.getByRole("button", { name: "Create event" })
    const calendarLink = page.locator(".landing-calendar-link")

    await expect(heading).toBeVisible()
    await expect(cta).toBeVisible()
    await expect(heading).toHaveCSS("font-size", "48px")
    await expect(heading).toHaveCSS("font-weight", "500")
    await expect(heading).toHaveCSS("line-height", "48px")
    await expect(cta).toHaveCSS("color", "rgb(255, 255, 255)")

    const header = page.locator("div.tw-fixed.tw-z-\\[60\\]")
    await expect(header).toBeVisible()
    await expect(header).toHaveCSS("position", "fixed")
    await expect(header).toHaveCSS("height", "64px")

    if (landingSignInEnabled) {
      await expect(subtitle).toBeVisible()
      await expect(calendarLink).toBeVisible()
      await expect(subtitle).toHaveCSS("text-align", "center")
      await expect(subtitle).toHaveCSS("font-size", "18px")
      await expect(subtitle).toHaveCSS("line-height", "28px")
      await expect(calendarLink).toHaveCSS("border-bottom-style", "dashed")
      await expect(calendarLink).toHaveCSS("text-decoration-line", "none")
      await expect(calendarLink).toHaveCSS("outline-style", "none")

      const headingBox = await heading.boundingBox()
      expect(
        assertPresent(headingBox, "Expected landing hero heading box").y,
      ).toBeCloseTo(68, 0)

      const subtitleBox = await subtitle.boundingBox()
      expect(
        assertPresent(subtitleBox, "Expected landing hero subtitle box").y,
      ).toBeCloseTo(132, 0)
    } else {
      await expect(subtitle).toHaveCount(0)
      await expect(calendarLink).toHaveCount(0)
    }
  })

  test("keeps the mobile hero readable without overflow", async ({
    page,
    isMobile,
  }) => {
    test.skip(!isMobile, "Mobile assertions only apply to the mobile project.")

    await stabilizeLanding(page)

    const heading = page.getByRole("heading", { name: "Find a time to meet" })
    const headingBox = await heading.boundingBox()
    const viewportSize = page.viewportSize()

    const safeHeadingBox = assertPresent(
      headingBox,
      "Expected mobile landing hero heading box",
    )
    const safeViewportSize = assertPresent(
      viewportSize,
      "Expected mobile viewport size",
    )
    expect(safeHeadingBox.width).toBeLessThanOrEqual(
      safeViewportSize.width - 32,
    )

    const header = page.locator("div.tw-fixed.tw-z-\\[60\\]")
    await expect(header).toBeVisible()
    await expect(header).toHaveCSS("position", "fixed")
    const headerBox = assertPresent(
      await header.boundingBox(),
      "Expected mobile landing header box",
    )
    expect(headerBox.x).toBe(0)
    expect(headerBox.width).toBeLessThanOrEqual(safeViewportSize.width)
  })
})

import { expect, test } from "@playwright/test"
import { existsSync } from "node:fs"
import { fileURLToPath } from "node:url"

test("production styles establish cascade order before component styles", async ({
  page,
  baseURL,
}) => {
  // The production-assets dependency builds once for both production projects.
  // Serve that build through the isolated origin; API calls still use the test server.
  const dist = new URL("../../frontend/dist/", import.meta.url)
  expect(existsSync(new URL("index.html", dist))).toBe(true)
  await page.route(`${baseURL}/**`, async (route) => {
    const pathname = new URL(route.request().url()).pathname
    const asset = new URL(
      pathname === "/" ? "index.html" : `.${pathname}`,
      dist,
    )
    if (asset.href.startsWith(dist.href) && existsSync(asset)) {
      await route.fulfill({ path: fileURLToPath(asset) })
    } else {
      await route.continue()
    }
  })
  await page.goto("/")
  const createEvent = page.getByRole("button", {
    name: "Create event",
    exact: true,
  })
  await expect(createEvent).toBeVisible()
  expect(
    await page.evaluate(() => {
      for (const sheet of document.styleSheets) {
        // Vuetify prepends its theme element at runtime, after the document's
        // linked stylesheets have already established the cascade order.
        if (
          (sheet.ownerNode as HTMLElement | null)?.id ===
          "vuetify-theme-stylesheet"
        )
          continue
        try {
          for (const rule of sheet.cssRules) {
            if (rule.cssText.startsWith("@layer")) return rule.cssText
          }
        } catch {
          // Cross-origin font stylesheets do not participate in app layers.
        }
      }
      return null
    }),
  ).toBe(
    "@layer tailwind-theme, tailwind-reset, vuetify-core, vuetify-components, vuetify-overrides, vuetify-utilities, tailwind-utilities, vuetify-final;",
  )
  await expect(createEvent).toHaveCSS("color", "rgb(255, 255, 255)")
  await expect(createEvent).toHaveCSS("background-color", "rgb(0, 153, 76)")
})

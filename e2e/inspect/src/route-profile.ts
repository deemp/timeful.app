import process from "node:process"

import { chromium, firefox } from "@playwright/test"

import { DEFAULT_FRONTEND_URL, VIEWPORT } from "./config.js"
import {
  createInspectionContext,
  THIRD_PARTY_BLOCKLIST,
  installStableBrowserLocale,
  runWithPhaseTimeout,
  waitForUrl,
} from "./page.js"
import {
  resolveInspectionEventPath,
  resolveInspectionEventWaitUntil,
} from "./scenarios/helpers.js"

type RouteProfile = {
  browser: "chromium" | "firefox"
  route: string
  url: string
  waitUntil: string
  javaScriptEnabled: boolean
  localeShimEnabled: boolean
  viewport: {
    width: number
    height: number
  }
  documentResponse: null | {
    url: string
    status: number
    ok: boolean
  }
  requestFailures: Array<{
    url: string
    errorText: string
  }>
  finalPageUrl: string | null
  title: string | null
  error: null | {
    name: string
    message: string
  }
}

function parseBooleanEnv(name: string, defaultValue = false) {
  const value = process.env[name]?.trim().toLowerCase()
  if (!value) {
    return defaultValue
  }

  if (["1", "true", "yes", "on"].includes(value)) {
    return true
  }

  if (["0", "false", "no", "off"].includes(value)) {
    return false
  }

  throw new Error(`Invalid boolean env ${name}=${JSON.stringify(process.env[name])}`)
}

function parseIntEnv(name: string, defaultValue: number) {
  const value = process.env[name]?.trim()
  if (!value) {
    return defaultValue
  }

  const parsed = Number.parseInt(value, 10)
  if (!Number.isFinite(parsed) || parsed <= 0) {
    throw new Error(`Invalid integer env ${name}=${JSON.stringify(process.env[name])}`)
  }

  return parsed
}

async function main() {
  const browserName = process.env.PLAYWRIGHT_BROWSER === "chromium" ? "chromium" : "firefox"
  const appUrl = process.env.FRONTEND_URL || DEFAULT_FRONTEND_URL
  const route = resolveInspectionEventPath()
  const url = new URL(route, appUrl).toString()
  const waitUntil = resolveInspectionEventWaitUntil()
  const javaScriptEnabled = !parseBooleanEnv("INSPECT_DISABLE_JS")
  const localeShimEnabled = !parseBooleanEnv("INSPECT_SKIP_LOCALE_SHIM")
  const viewport = {
    width: parseIntEnv("INSPECT_VIEWPORT_WIDTH", VIEWPORT.width),
    height: parseIntEnv("INSPECT_VIEWPORT_HEIGHT", VIEWPORT.height),
  }

  await waitForUrl(appUrl)

  const browserType = browserName === "firefox" ? firefox : chromium
  const browser = await browserType.launch()

  const profile: RouteProfile = {
    browser: browserName,
    route,
    url,
    waitUntil,
    javaScriptEnabled,
    localeShimEnabled,
    viewport,
    documentResponse: null,
    requestFailures: [],
    finalPageUrl: null,
    title: null,
    error: null,
  }

  try {
    const context = await createInspectionContext(browser, {
      javaScriptEnabled,
      viewport,
    })
    const page = await context.newPage()

    if (localeShimEnabled) {
      await installStableBrowserLocale(page)
    }

    page.on("response", async (response) => {
      if (profile.documentResponse || response.request().resourceType() !== "document") {
        return
      }

      if (response.url() !== url) {
        return
      }

      profile.documentResponse = {
        url: response.url(),
        status: response.status(),
        ok: response.ok(),
      }
    })

    page.on("requestfailed", (request) => {
      profile.requestFailures.push({
        url: request.url(),
        errorText: request.failure()?.errorText ?? "unknown",
      })
    })

    console.error(
      `[inspect] route-profile:start url=${url} waitUntil=${waitUntil} js=${String(javaScriptEnabled)} localeShim=${String(localeShimEnabled)}`,
    )

    await runWithPhaseTimeout(
      `route-profile goto ${url}`,
      page.goto(url, { waitUntil }),
      30_000,
    )

    profile.finalPageUrl = page.url()
    profile.title = await page.title().catch(() => null)

    console.error(`[inspect] route-profile:done url=${url}`)

    await context.close()
  } catch (error) {
    profile.error = {
      name: error instanceof Error ? error.name : "Error",
      message: error instanceof Error ? error.message : String(error),
    }
    throw error
  } finally {
    console.log(JSON.stringify(profile, null, 2))
    await browser.close()
  }
}

main().catch((error: unknown) => {
  console.error(error)
  process.exitCode = 1
})

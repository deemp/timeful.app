import process from "node:process"

import { chromium, firefox } from "@playwright/test"

import { parseArgs } from "./cli.js"
import { DEFAULT_FRONTEND_URL, VIEWPORT } from "./config.js"
import { createInspectionContext, waitForUrl } from "./page.js"
import { printSnapshot } from "./report.js"
import { SCENARIOS, SUPPORTED_TARGETS } from "./scenarios/index.js"
import { collectStyles } from "./snapshot.js"

import type { InspectionTarget } from "./types.js"

async function main() {
  const target = parseArgs(process.argv.slice(2), SUPPORTED_TARGETS)
  const scenario = SCENARIOS[target]
  const browserName = process.env.PLAYWRIGHT_BROWSER ?? "firefox"
  const targetApp: InspectionTarget = {
    url: process.env.FRONTEND_URL || DEFAULT_FRONTEND_URL,
  }

  await waitForUrl(targetApp.url)

  const browserType = browserName === "firefox" ? firefox : chromium
  const browser = await browserType.launch()

  try {
    const context = await createInspectionContext(browser, { viewport: VIEWPORT })
    const page = await context.newPage()
    const snapshot = await collectStyles(page, targetApp, scenario)
    await context.close()
    printSnapshot(target, snapshot)
  } finally {
    await browser.close()
  }
}

main().catch((error: unknown) => {
  console.error(error)
  process.exitCode = 1
})

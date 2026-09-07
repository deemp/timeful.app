import { defineConfig, devices } from "@playwright/test"
import {
  createPlaywrightArtifactsDir,
  createPlaywrightConfig,
  getActiveToolingMode,
} from "./config/tooling"

const { baseURL, webServerCommand, webServerPort } = createPlaywrightConfig(
  getActiveToolingMode(),
)
const outputDir = createPlaywrightArtifactsDir()

export default defineConfig({
  testDir: ".",
  outputDir,
  fullyParallel: true,
  forbidOnly: Boolean(process.env.CI),
  retries: process.env.CI ? 2 : 0,
  reporter: "list",
  snapshotPathTemplate: "{testDir}/__screenshots__/{testFilePath}/{arg}{ext}",
  globalSetup: "./isolated-test-stack.ts",
  use: {
    baseURL,
    trace: "retain-on-failure",
    screenshot: "only-on-failure",
    video: "retain-on-failure",
    actionTimeout: 15_000,
  },
  webServer: {
    command: webServerCommand,
    cwd: "../frontend",
    port: webServerPort,
    reuseExistingServer: false,
    timeout: 120_000,
  },
  projects: [
    {
      name: "chromium-desktop",
      testIgnore: [
        /timed-event-.*firefox\.spec\.ts/,
        /schedule-overlap-mobile-touch-firefox\.spec\.ts/,
      ],
      use: {
        ...devices["Desktop Chrome"],
        viewport: { width: 1440, height: 1400 },
      },
    },
    {
      name: "chromium-mobile",
      testIgnore: [
        /timed-event-.*firefox\.spec\.ts/,
        /schedule-overlap-mobile-touch-firefox\.spec\.ts/,
      ],
      use: {
        ...devices["iPhone 13"],
        browserName: "chromium",
      },
    },
    {
      name: "firefox-desktop",
      testMatch: /timed-event-.*firefox\.spec\.ts/,
      workers: 1,
      use: {
        ...devices["Desktop Firefox"],
        timezoneId: "UTC",
        viewport: { width: 1440, height: 1600 },
      },
    },
    {
      name: "firefox-touch",
      testMatch: /schedule-overlap-mobile-touch-firefox\.spec\.ts/,
      workers: 1,
      use: {
        browserName: "firefox",
        hasTouch: true,
        timezoneId: "UTC",
        viewport: { width: 375, height: 900 },
      },
    },
  ],
})

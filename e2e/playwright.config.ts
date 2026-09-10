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
  testDir: "specs",
  outputDir,
  fullyParallel: true,
  workers: process.env.CI ? 1 : 2,
  forbidOnly: Boolean(process.env.CI),
  retries: process.env.CI ? 2 : 0,
  reporter: "list",
  snapshotPathTemplate: "{testDir}/__screenshots__/{testFilePath}/{arg}{ext}",
  globalSetup: "./isolated-test-stack.ts",
  use: {
    baseURL,
    trace: "retain-on-failure",
    screenshot: "only-on-failure",
    video: process.env.E2E_VIDEO === "on" ? "on" : "retain-on-failure",
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
        /styling-production\.spec\.ts/,
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
        /styling-production\.spec\.ts/,
      ],
      use: {
        ...devices["iPhone 13"],
        browserName: "chromium",
      },
    },
    {
      name: "firefox-desktop",
      testMatch: /timed-event-.*firefox\.spec\.ts/,
      use: {
        ...devices["Desktop Firefox"],
        timezoneId: "UTC",
        viewport: { width: 1440, height: 1600 },
      },
    },
    {
      name: "firefox-touch",
      testMatch: /schedule-overlap-mobile-touch-firefox\.spec\.ts/,
      use: {
        browserName: "firefox",
        hasTouch: true,
        timezoneId: "UTC",
        viewport: { width: 375, height: 900 },
      },
    },
    {
      name: "production-assets",
      testDir: "config",
      testMatch: "production-assets.setup.ts",
    },
    {
      name: "chromium-production-desktop",
      testMatch: /styling-production\.spec\.ts/,
      dependencies: ["production-assets"],
      use: {
        ...devices["Desktop Chrome"],
        viewport: { width: 1440, height: 1400 },
      },
    },
    {
      name: "chromium-production-mobile",
      testMatch: /styling-production\.spec\.ts/,
      dependencies: ["production-assets"],
      use: {
        ...devices["iPhone 13"],
        browserName: "chromium",
      },
    },
  ],
})

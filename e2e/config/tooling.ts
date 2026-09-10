import { mkdirSync } from "node:fs"
import os from "node:os"
import path from "node:path"
import { fileURLToPath } from "node:url"
import { Temporal } from "temporal-polyfill"
import { loadEnv } from "vite"

const e2eRootDir = path.dirname(path.dirname(fileURLToPath(import.meta.url)))
const repoRootDir = path.dirname(e2eRootDir)

type ToolingMode = string
type RootEnvMode = "development" | "test" | "staging" | "production"

interface LoadedRootEnv {
  env: Record<string, string>
  filePath: string
}

interface IsolatedE2ENetwork {
  viteHost: string
  vitePort: number
  apiHost: string
  apiPort: number
}

interface PlaywrightDevServerConfig {
  baseURL: string
  webServerCommand: string
  webServerPort: number
}

function requireNonEmpty(
  rawValue: string | undefined,
  envName: string,
  usage: string,
): string {
  const value = rawValue?.trim()

  if (!value) {
    throw new Error(`Missing ${envName}. ${usage}`)
  }

  return value
}

function parsePort(
  rawValue: string | undefined,
  envName: string,
  usage: string,
): number {
  const value = requireNonEmpty(rawValue, envName, usage)
  const port = Number(value)

  if (!Number.isInteger(port) || port < 1 || port > 65535) {
    throw new Error(`Invalid ${envName}: "${value}". ${usage}`)
  }

  return port
}

function normalizeRootEnvMode(mode: ToolingMode): RootEnvMode {
  switch (mode.trim().toLowerCase()) {
    case "staging":
      return "staging"
    case "test":
      return "test"
    case "production":
      return "production"
    case "development":
    default:
      return "development"
  }
}

export function getActiveToolingMode(): RootEnvMode {
  return normalizeRootEnvMode(process.env.PLAYWRIGHT_TOOLING_MODE ?? "test")
}

function readProcessEnv(): Record<string, string> {
  return Object.fromEntries(
    Object.entries(process.env).filter(
      (entry): entry is [string, string] => entry[1] !== undefined,
    ),
  )
}

function loadRootEnv(mode: ToolingMode): LoadedRootEnv {
  const rootEnvMode = normalizeRootEnvMode(mode)
  const filePath = path.join(repoRootDir, `.env.${rootEnvMode}`)
  const env = {
    ...loadEnv(rootEnvMode, repoRootDir, ""),
    ...readProcessEnv(),
  }

  return {
    env,
    filePath,
  }
}

function loadIsolatedE2ENetwork(): IsolatedE2ENetwork {
  const { env, filePath } = loadRootEnv("test")
  const usage = `Set it in ${filePath} or export it before starting browser E2E.`

  return {
    viteHost: requireNonEmpty(env.E2E_VITE_HOST, "E2E_VITE_HOST", usage),
    vitePort: parsePort(env.E2E_VITE_PORT, "E2E_VITE_PORT", usage),
    apiHost: requireNonEmpty(env.E2E_API_HOST, "E2E_API_HOST", usage),
    apiPort: parsePort(env.E2E_API_PORT, "E2E_API_PORT", usage),
  }
}

function getIsolatedE2EViteBaseURL(network: IsolatedE2ENetwork): string {
  return `http://${network.viteHost}:${network.vitePort}`
}

function getIsolatedE2EApiBaseURL(network: IsolatedE2ENetwork): string {
  return `http://${network.apiHost}:${network.apiPort}`
}

export function getIsolatedE2EHealthcheckURL(): string {
  return new URL(
    "/api/health",
    getIsolatedE2EApiBaseURL(loadIsolatedE2ENetwork()),
  ).toString()
}

function isFrontendFlagEnabled(rawValue: string | undefined): boolean {
  const value = rawValue?.trim().toLowerCase()

  if (!value) {
    return true
  }

  return value !== "false"
}

export function resolveLandingSignInEnabled(mode: ToolingMode): boolean {
  const { env } = loadRootEnv(mode)
  return (
    isFrontendFlagEnabled(env.VITE_ENABLE_SIGN_IN) &&
    isFrontendFlagEnabled(env.VITE_ENABLE_RICH_LANDING)
  )
}

function nonBlankOr(value: string | undefined, fallback: string): string {
  if (value) {
    return value
  }

  return fallback
}

export function createPlaywrightArtifactsDir(): string {
  const artifactsRoot = nonBlankOr(
    process.env.E2E_ARTIFACTS_DIR?.trim(),
    path.join(os.tmpdir(), "opencode", "timeful-e2e-artifacts"),
  )
  const runId = nonBlankOr(
    process.env.E2E_ARTIFACTS_RUN_ID?.trim(),
    `${Temporal.Now.instant().toString().replaceAll(":", "-")}-p${process.pid}`,
  )
  const artifactsDir = path.join(artifactsRoot, runId)
  mkdirSync(artifactsDir, { recursive: true })
  process.env.E2E_ARTIFACTS_RUN_ID ??= runId
  return artifactsDir
}

export function createPlaywrightConfig(
  mode: ToolingMode,
): PlaywrightDevServerConfig {
  if (normalizeRootEnvMode(mode) === "test") {
    const network = loadIsolatedE2ENetwork()
    return {
      baseURL: getIsolatedE2EViteBaseURL(network),
      webServerCommand:
        process.env.E2E_FRONTEND === "bundled"
          ? "../e2e/node_modules/.bin/tsx ../e2e/config/bundled-frontend.ts"
          : "npm run dev:test",
      webServerPort: network.vitePort,
    }
  }

  const { env, filePath } = loadRootEnv(mode)
  const usage = `Set it in ${filePath} or export it before starting browser E2E.`
  const devHost = requireNonEmpty(env.VITE_DEV_HOST, "VITE_DEV_HOST", usage)
  const devPort = parsePort(env.VITE_DEV_PORT, "VITE_DEV_PORT", usage)
  const baseURL = new URL(`http://${devHost}:${devPort}`)

  return {
    baseURL: baseURL.toString().replace(/\/$/, ""),
    webServerCommand: `npm run dev:test -- --host ${devHost} --port ${devPort}`,
    webServerPort: devPort,
  }
}

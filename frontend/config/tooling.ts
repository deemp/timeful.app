import { mkdirSync } from "node:fs"
import os from "node:os"
import path from "node:path"
import { fileURLToPath } from "node:url"
import { loadEnv } from "vite"
import { isLandingSignInEnabled } from "../src/utils/featureAvailability"

const frontendRootDir = path.dirname(
  path.dirname(fileURLToPath(import.meta.url)),
)
const repoRootDir = path.dirname(frontendRootDir)

type ToolingMode = string
type RootEnvMode = "development" | "test" | "staging" | "production"

interface LoadedRootEnv {
  env: Record<string, string>
  filePath: string
}

interface FrontendToolingEnv {
  devHost?: string
  devPort?: number
  apiProxyTarget?: string
  previewHost?: string
  previewPort?: number
}

interface FrontendDevServerConfig {
  host: string
  port: number
  proxy: {
    "/api": {
      target: string
      changeOrigin: true
    }
    "/swagger": {
      target: string
      changeOrigin: true
    }
  }
}

interface FrontendPlaywrightConfig {
  baseURL: string
  webServerCommand: string
  webServerPort: number
}

interface FrontendPreviewServerConfig {
  host: string
  port: number
}

interface IsolatedE2ENetwork {
  viteHost: string
  vitePort: number
  apiHost: string
  apiPort: number
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

function parseOptionalHost(rawValue: string | undefined): string | undefined {
  const value = rawValue?.trim()
  if (!value) {
    return undefined
  }

  return value
}

function parseOptionalPort(
  rawValue: string | undefined,
  envName: string,
): number | undefined {
  const value = rawValue?.trim()
  if (!value) {
    return undefined
  }

  const port = Number(value)
  if (!Number.isInteger(port) || port < 1 || port > 65535) {
    throw new Error(
      `Invalid ${envName}: "${value}". Set ${envName} to an integer between 1 and 65535.`,
    )
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

export function resolveLandingSignInEnabled(mode: ToolingMode): boolean {
  const { env } = loadRootEnv(mode)
  return isLandingSignInEnabled(env)
}

export function getFrontendEnvDir(): string {
  return repoRootDir
}

export function loadFrontendToolingEnv(mode: ToolingMode): FrontendToolingEnv {
  const { env, filePath } = loadRootEnv(mode)
  const devUsage = `Set it in ${filePath} or export it before starting the frontend tooling.`
  const previewHost = parseOptionalHost(env.VITE_PREVIEW_HOST)
  const previewPort = parseOptionalPort(
    env.VITE_PREVIEW_PORT,
    "VITE_PREVIEW_PORT",
  )

  if (
    (previewHost && previewPort === undefined) ||
    (!previewHost && previewPort !== undefined)
  ) {
    throw new Error(
      "Set both VITE_PREVIEW_HOST and VITE_PREVIEW_PORT together when configuring vite preview.",
    )
  }

  return {
    devHost: parseOptionalHost(env.VITE_DEV_HOST),
    devPort: parseOptionalPort(env.VITE_DEV_PORT, "VITE_DEV_PORT"),
    apiProxyTarget: parseOptionalHost(env.VITE_API_PROXY_TARGET),
    previewHost,
    previewPort,
  }
}

export function createFrontendDevServerConfig(
  mode: ToolingMode,
): FrontendDevServerConfig {
  if (normalizeRootEnvMode(mode) === "test") {
    const network = loadIsolatedE2ENetwork()
    const apiProxyTarget = getIsolatedE2EApiBaseURL(network)

    return {
      host: network.viteHost,
      port: network.vitePort,
      proxy: {
        "/api": { target: apiProxyTarget, changeOrigin: true },
        "/swagger": { target: apiProxyTarget, changeOrigin: true },
      },
    }
  }

  const env = loadFrontendToolingEnv(mode)
  const { filePath } = loadRootEnv(mode)

  return {
    host: requireNonEmpty(
      env.devHost,
      "VITE_DEV_HOST",
      `Set VITE_DEV_HOST in ${filePath} or export it before starting the frontend tooling.`,
    ),
    port: parsePort(
      env.devPort === undefined ? undefined : String(env.devPort),
      "VITE_DEV_PORT",
      `Set VITE_DEV_PORT in ${filePath} or export it before starting the frontend tooling.`,
    ),
    proxy: {
      "/api": {
        target: requireNonEmpty(
          env.apiProxyTarget,
          "VITE_API_PROXY_TARGET",
          `Set VITE_API_PROXY_TARGET in ${filePath} or export it before starting the frontend tooling.`,
        ),
        changeOrigin: true,
      },
      "/swagger": {
        target: requireNonEmpty(
          env.apiProxyTarget,
          "VITE_API_PROXY_TARGET",
          `Set VITE_API_PROXY_TARGET in ${filePath} or export it before starting the frontend tooling.`,
        ),
        changeOrigin: true,
      },
    },
  }
}

export function createFrontendPlaywrightArtifactsDir(): string {
  const artifactsRoot =
    process.env.E2E_ARTIFACTS_DIR?.trim() ||
    path.join(os.tmpdir(), "opencode", "timeful-e2e-artifacts")
  const runId =
    process.env.E2E_ARTIFACTS_RUN_ID?.trim() ||
    `${new Date().toISOString().replaceAll(":", "-")}-p${process.pid}`
  const artifactsDir = path.join(artifactsRoot, runId)
  mkdirSync(artifactsDir, { recursive: true })
  process.env.E2E_ARTIFACTS_RUN_ID ??= runId
  return artifactsDir
}

export function createFrontendPlaywrightConfig(
  mode: ToolingMode,
): FrontendPlaywrightConfig {
  if (normalizeRootEnvMode(mode) === "test") {
    const network = loadIsolatedE2ENetwork()
    return {
      baseURL: getIsolatedE2EViteBaseURL(network),
      webServerCommand: "npm run dev:test",
      webServerPort: network.vitePort,
    }
  }

  const env = loadFrontendToolingEnv(mode)
  const { filePath } = loadRootEnv(mode)
  const devHost = requireNonEmpty(
    env.devHost,
    "VITE_DEV_HOST",
    `Set VITE_DEV_HOST in ${filePath} or export it before starting the frontend tooling.`,
  )
  const devPort = String(
    parsePort(
      env.devPort === undefined ? undefined : String(env.devPort),
      "VITE_DEV_PORT",
      `Set VITE_DEV_PORT in ${filePath} or export it before starting the frontend tooling.`,
    ),
  )
  const baseURL = new URL(`http://${devHost}:${devPort}`)

  return {
    baseURL: baseURL.toString().replace(/\/$/, ""),
    webServerCommand: `npm run dev:test -- --host ${devHost} --port ${devPort}`,
    webServerPort: Number(devPort),
  }
}

export function createFrontendPreviewServerConfig(
  mode: ToolingMode,
): FrontendPreviewServerConfig | undefined {
  const env = loadFrontendToolingEnv(mode)

  if (!env.previewHost || env.previewPort === undefined) {
    return undefined
  }

  return {
    host: env.previewHost,
    port: env.previewPort,
  }
}

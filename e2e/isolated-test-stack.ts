import { execFile } from "node:child_process"
import { randomUUID } from "node:crypto"
import path from "node:path"
import { fileURLToPath } from "node:url"
import { promisify } from "node:util"
import { Temporal } from "temporal-polyfill"
import { loadEnv } from "vite"
import { getIsolatedE2EHealthcheckURL } from "./config/tooling"

const execFileAsync = promisify(execFile)
const e2eRootDir = path.dirname(fileURLToPath(import.meta.url))
const repositoryRoot = path.dirname(e2eRootDir)
const testEnv = loadEnv("test", repositoryRoot, "")
const persistDatabases =
  "TEST_DB_PERSIST" in testEnv &&
  testEnv.TEST_DB_PERSIST.trim().toLowerCase() === "true"
const postgresTestDatabase = `timeful-test-${randomUUID().replaceAll("-", "")}`
const postgresAnonymousCreationEnabled =
  process.env.E2E_POSTGRES_ANONYMOUS_EVENT_CREATION_ENABLED ?? "false"
const goBuildCacheVolume = "timeful-test-go-build-cache"
const goModCacheVolume = "timeful-test-go-mod-cache"

function composeArguments(...args: string[]): string[] {
  return [
    "compose",
    "--env-file",
    path.join(repositoryRoot, ".env.test"),
    "-f",
    path.join(repositoryRoot, "compose.yaml"),
    "-f",
    path.join(repositoryRoot, "compose.test.yaml"),
    ...args,
  ]
}

async function runCompose(...args: string[]): Promise<void> {
  await execFileAsync("docker", composeArguments(...args), {
    cwd: repositoryRoot,
    env: {
      ...process.env,
      POSTGRES_TEST_DATABASE: postgresTestDatabase,
      POSTGRES_ANONYMOUS_EVENT_CREATION_ENABLED:
        postgresAnonymousCreationEnabled,
    },
  })
}

async function waitForHealthcheck(): Promise<void> {
  const url = getIsolatedE2EHealthcheckURL()
  const deadline = Temporal.Now.instant().epochMilliseconds + 120_000

  while (Temporal.Now.instant().epochMilliseconds < deadline) {
    try {
      const response = await fetch(url)
      if (response.ok) {
        return
      }
    } catch {
      // The server can still be compiling or waiting for either database.
    }
    await new Promise((resolve) => setTimeout(resolve, 500))
  }

  throw new Error(`Timed out waiting for isolated E2E server at ${url}`)
}

async function ensureExternalVolume(name: string): Promise<void> {
  try {
    await execFileAsync("docker", ["volume", "inspect", name])
  } catch {
    await execFileAsync("docker", ["volume", "create", name])
  }
}

async function start(): Promise<void> {
  try {
    await ensureExternalVolume(goBuildCacheVolume)
    await ensureExternalVolume(goModCacheVolume)
    await runCompose(
      "up",
      "-d",
      "--build",
      "mongo-test",
      "postgres-test",
      "postgres-test-bootstrap",
      "server-test",
    )
    await waitForHealthcheck()
  } catch (error) {
    await stop().catch(() => undefined)
    throw error
  }
}

async function stop(): Promise<void> {
  if (persistDatabases) {
    await runCompose("stop", "server-test")
  } else {
    await runCompose("down", "-v")
  }
}

export default async function isolatedTestStack(): Promise<
  () => Promise<void>
> {
  const setupStarted = performance.now()
  await start()
  console.log(
    `[e2e stack] setup: ${Math.round(performance.now() - setupStarted)}ms`,
  )
  return async () => {
    const teardownStarted = performance.now()
    await stop()
    console.log(
      `[e2e stack] teardown: ${Math.round(performance.now() - teardownStarted)}ms`,
    )
  }
}

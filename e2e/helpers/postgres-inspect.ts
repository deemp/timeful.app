import { execFileSync } from "node:child_process"
import { fileURLToPath } from "node:url"

const repositoryRoot = fileURLToPath(new URL("../../", import.meta.url))

const composeArguments = [
  "compose",
  "--env-file",
  ".env.test",
  "-f",
  "compose.yaml",
  "-f",
  "compose.test.yaml",
]

// Resolves the Playwright-owned PostgreSQL database from the application URI
// the isolated server-test container actually connected to, so inspections can
// never read a development database.
function isolatedPostgresDatabase(): string {
  const uri = execFileSync(
    "docker",
    [
      ...composeArguments,
      "exec",
      "-T",
      "server-test",
      "printenv",
      "POSTGRES_APPLICATION_URI",
    ],
    { cwd: repositoryRoot, encoding: "utf8" },
  ).trim()
  const database = new URL(uri).pathname.slice(1)
  if (!database.startsWith("timeful-test-")) {
    throw new Error(
      "PostgreSQL inspection requires Playwright's isolated test database",
    )
  }
  return database
}

// Runs a scalar SQL statement against the isolated database and returns the
// unaligned, tuple-only result, so callers can assert on exact values.
export function postgresScalar(sql: string): string {
  const database = isolatedPostgresDatabase()
  return execFileSync(
    "docker",
    [
      ...composeArguments,
      "exec",
      "-T",
      "postgres-test",
      "sh",
      "-ec",
      'psql --username "$POSTGRES_USER" --dbname "$1" --set=ON_ERROR_STOP=1 --tuples-only --no-align --command "$2"',
      "postgres-inspect",
      database,
      sql,
    ],
    { cwd: repositoryRoot, encoding: "utf8" },
  ).trim()
}

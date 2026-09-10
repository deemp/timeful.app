import { execFile } from "node:child_process"
import { fileURLToPath } from "node:url"
import { promisify } from "node:util"
import { test } from "@playwright/test"

const execFileAsync = promisify(execFile)

test("build fresh production assets", async () => {
  test.setTimeout(120_000)
  const { stdout, stderr } = await execFileAsync("npm", ["run", "build"], {
    cwd: fileURLToPath(new URL("../../frontend/", import.meta.url)),
    timeout: 115_000,
    maxBuffer: 10 * 1024 * 1024,
  })
  console.log(stdout)
  if (stderr) console.error(stderr)
})

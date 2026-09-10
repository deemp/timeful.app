import path from "node:path"
import { fileURLToPath } from "node:url"
import { build, preview } from "vite"
import { createFrontendDevServerConfig } from "../../frontend/config/tooling"
import { createPlaywrightArtifactsDir } from "./tooling"

// Build once per invocation, with the same test-mode flags and isolated proxy
// as the dev server. Keep these assets separate from production-style fixtures.
const root = fileURLToPath(new URL("../../frontend", import.meta.url))
const outDir = path.join(createPlaywrightArtifactsDir(), "frontend-dist")
const started = performance.now()
await build({ root, mode: "test", build: { outDir, emptyOutDir: true } })
console.error(
  `[e2e frontend] build: ${Math.round(performance.now() - started)}ms`,
)
const server = await preview({
  root,
  mode: "test",
  build: { outDir },
  preview: { ...createFrontendDevServerConfig("test"), strictPort: true },
})
server.printUrls()

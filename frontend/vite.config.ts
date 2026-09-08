import { defineConfig } from "vite"
import vue from "@vitejs/plugin-vue"
import vuetify from "vite-plugin-vuetify"
import path from "node:path"
import { fileURLToPath } from "node:url"
import {
  createFrontendDevServerConfig,
  createFrontendPreviewServerConfig,
  getFrontendEnvDir,
} from "./config/tooling"
import tailwindcss from "@tailwindcss/vite"

const rootDir = path.dirname(fileURLToPath(import.meta.url))

export default defineConfig(({ command, mode, isPreview }) => {
  return {
    plugins: [vue(), vuetify({ autoImport: true }), tailwindcss()],
    envDir: process.env.VITEST ? undefined : getFrontendEnvDir(),
    resolve: {
      alias: {
        "@": path.resolve(rootDir, "./src"),
      },
    },
    server:
      command === "serve" && !isPreview
        ? createFrontendDevServerConfig(mode)
        : undefined,
    preview: isPreview ? createFrontendPreviewServerConfig(mode) : undefined,
    optimizeDeps: {
      // Vite 8 miscompiles v0's Vue namespace import during prebundling.
      exclude: ["@vuetify/v0"],
      include: [
        "vuetify/components/VOverlay",
        "vuetify/components/VDialog",
        "vuetify/components/VMenu",
        "vuetify/components/VSelect",
        "vuetify/components/VTooltip",
      ],
    },
    build: {
      outDir: "dist",
    },
  }
})

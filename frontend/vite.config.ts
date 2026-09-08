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
      // Pre-bundle every Vuetify component used in src at server startup.
      // Otherwise the dep optimizer discovers them lazily on first render and
      // full-reloads the page mid-session ("optimized dependencies changed.
      // reloading"), discarding in-memory app state (seen as flaky e2e
      // failures when the dep cache is cold). Keep in sync with components
      // auto-imported in src templates.
      include: [
        "vuetify/components/VApp",
        "vuetify/components/VAvatar",
        "vuetify/components/VBtn",
        "vuetify/components/VBtnToggle",
        "vuetify/components/VCard",
        "vuetify/components/VCheckbox",
        "vuetify/components/VChip",
        "vuetify/components/VCombobox",
        "vuetify/components/VDatePicker",
        "vuetify/components/VDialog",
        "vuetify/components/VDivider",
        "vuetify/components/VExpansionPanel",
        "vuetify/components/VForm",
        "vuetify/components/VGrid",
        "vuetify/components/VIcon",
        "vuetify/components/VImg",
        "vuetify/components/VInput",
        "vuetify/components/VList",
        "vuetify/components/VMain",
        "vuetify/components/VMenu",
        "vuetify/components/VOverlay",
        "vuetify/components/VProgressCircular",
        "vuetify/components/VSelect",
        "vuetify/components/VSnackbar",
        "vuetify/components/VSpeedDial",
        "vuetify/components/VSwitch",
        "vuetify/components/VTextarea",
        "vuetify/components/VTextField",
        "vuetify/components/VTooltip",
        "vuetify/components/transitions",
      ],
    },
    build: {
      outDir: "dist",
    },
  }
})

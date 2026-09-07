import eslint from "@eslint/js"
import tseslint, { type ConfigArray } from "typescript-eslint"
import oxlint from "eslint-plugin-oxlint"
import configPrettier from "eslint-config-prettier"

const temporalNoDateRestrictions = [
  {
    selector: "NewExpression[callee.name='Date']",
    message:
      "Use Temporal instead of constructing Date directly outside explicit native-Date boundaries.",
  },
  {
    selector: "CallExpression[callee.name='Date']",
    message:
      "Use Temporal instead of calling Date directly outside explicit native-Date boundaries.",
  },
  {
    selector:
      "CallExpression[callee.object.name='Date'][callee.property.name='now']",
    message: "Use Temporal.Now instead of Date.now().",
  },
  {
    selector:
      "CallExpression[callee.object.name='Date'][callee.property.name='parse']",
    message: "Use Temporal parsing instead of Date.parse().",
  },
  {
    selector:
      "CallExpression[callee.object.name='Date'][callee.property.name='UTC']",
    message: "Use Temporal instead of Date.UTC().",
  },
  {
    selector: "TSTypeReference > Identifier[name='Date']",
    message:
      "Use Temporal types instead of the native Date type outside explicit native-Date boundaries.",
  },
]

const e2eLocatorHygieneRestrictions = [
  {
    selector: "CallExpression[callee.property.name='waitForSelector']",
    message:
      "Use page.locator(...).waitFor() instead of page.waitForSelector().",
  },
  {
    selector: "CallExpression[callee.property.name='waitForTimeout']",
    message:
      "Prefer web-first expect() or locator.waitFor(); for an unavoidable fixed settle delay use settlePage from helpers/settle.",
  },
  {
    selector: "CallExpression[callee.property.name='$']",
    message:
      "Use page.locator() instead of page.$; locators auto-wait and fail loudly on ambiguous matches.",
  },
  {
    selector: "CallExpression[callee.property.name='$$']",
    message:
      "Use page.locator() with toHaveCount() instead of page.$$; locators auto-wait and fail loudly on ambiguous matches.",
  },
  {
    selector: "CallExpression[callee.property.name='pause']",
    message:
      "Use playwright --debug or --ui for interactive debugging; committed tests must not pause.",
  },
]

const config: ConfigArray = [
  {
    ignores: ["node_modules/**", "dist/**", "inspect/**"],
  },

  // Core JS rules
  eslint.configs.recommended,
  {
    linterOptions: {
      reportUnusedDisableDirectives: "off",
    },
    plugins: {
      "@typescript-eslint": tseslint.plugin,
    },
    rules: {
      // TypeScript and Node types know browser, Node, and DOM globals; ESLint does not.
      "no-undef": "off",
    },
  },

  // Parse TypeScript without constructing a project-wide TypeScript program.
  {
    files: ["**/*.ts"],
    languageOptions: {
      parser: tseslint.parser,
    },
  },

  // Disable rules delegated to Oxlint's native implementation.
  ...oxlint.configs["flat/recommended"],
  {
    rules: {
      "no-unused-vars": "off",
      // Keep the suite on the Temporal model; native Date is allowed only in
      // the diagnostic entrypoints that intentionally use raw page APIs.
      "no-restricted-syntax": ["error", ...temporalNoDateRestrictions],
    },
  },

  // E2E locator hygiene: auto-waiting locators over raw page queries, and no
  // fixed sleeps outside the single documented settle helper.
  {
    files: ["**/*.spec.ts", "helpers/**/*.ts", "isolated-test-stack.ts"],
    rules: {
      "no-restricted-syntax": [
        "error",
        ...temporalNoDateRestrictions,
        ...e2eLocatorHygieneRestrictions,
      ],
    },
  },
  {
    files: ["helpers/settle.ts"],
    rules: {
      "no-restricted-syntax": ["error", ...temporalNoDateRestrictions],
    },
  },

  // Must be last — disables formatting rules that conflict with Prettier
  configPrettier,
]

export default config

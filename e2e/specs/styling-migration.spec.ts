import { expect, test } from "@playwright/test"

test("respondent actions hide over the email without important utilities", async ({
  page,
  hasTouch,
}) => {
  test.skip(hasTouch, "Mouse hover behavior")
  await page.goto("/")
  await expect(
    page.getByRole("heading", { name: "Find a time to meet" }),
  ).toBeVisible()
  await page.evaluate(() => {
    const section = document.createElement("dialog")
    section.setAttribute("aria-label", "Respondent hover probe")
    section.className = "tw:group"
    section.innerHTML =
      '<p>Respondent name</p><div class="tw:opacity-0 tw:group-hover:opacity-100 tw:group-[&:has(.email-hover-target:hover)]:opacity-0">Respondent actions</div><p class="email-hover-target">respondent@example.test</p>'
    document.body.append(section)
    section.showModal()
  })
  const probe = page.getByRole("dialog", { name: "Respondent hover probe" })
  const actions = probe.getByText("Respondent actions")
  await probe.getByText("Respondent name").hover()
  await expect(actions).toHaveCSS("opacity", "1")
  await probe.getByText("respondent@example.test").hover()
  await expect(actions).toHaveCSS("opacity", "0")
  await probe.getByText("Respondent name").hover()
  await expect(actions).toHaveCSS("opacity", "1")
})

test("Tailwind utilities override Vuetify component colors", async ({
  page,
}) => {
  await page.goto("/")
  const createEvent = page.getByRole("button", {
    name: "Create event",
    exact: true,
  })
  await expect(createEvent).toHaveCSS("color", "rgb(255, 255, 255)")
  await expect(createEvent).toHaveCSS("background-color", "rgb(0, 153, 76)")
})

test("default action buttons retain shared dimensions", async ({ page }) => {
  await page.goto("/")
  const createEvent = page.getByRole("button", {
    name: "Create event",
    exact: true,
  })
  await expect(createEvent).toHaveCSS("height", "38px")
  await expect(createEvent).toHaveCSS("border-radius", "6px")
})

test("icon actions retain their circular dimensions", async ({ page }) => {
  await page.goto("/")
  const github = page
    .getByTestId("app-header")
    .getByRole("link", { name: "GitHub", exact: true })
  await expect(github).toHaveCount(1)
  await expect(github).toHaveCSS("height", "48px")
  await expect(github).toHaveCSS("width", "48px")
  await expect(github).toHaveCSS("border-radius", "50%")
})

test("the compatibility reset removes native spacing and button borders", async ({
  page,
}) => {
  await page.goto("/")
  await expect(
    page.getByRole("heading", { name: "Find a time to meet" }),
  ).toBeVisible()
  // Exercise native elements against the app's loaded styles without adding any CSS.
  await page.evaluate(() => {
    const section = document.createElement("section")
    section.setAttribute("aria-label", "Native reset probe")
    section.innerHTML =
      "<h2>Reset heading</h2><p>Reset paragraph</p><ul><li>Reset list</li></ul><button>Reset button</button>"
    document.body.append(section)
  })
  const probe = page.getByRole("region", { name: "Native reset probe" })
  await expect(probe.getByRole("heading")).toHaveCSS("margin", "0px")
  await expect(probe.getByText("Reset paragraph")).toHaveCSS("margin", "0px")
  await expect(probe.getByRole("list")).toHaveCSS("margin", "0px")
  await expect(probe.getByRole("list")).toHaveCSS("padding", "0px")
  await expect(probe.getByRole("button")).toHaveCSS("border-top-width", "0px")
  await expect(probe.getByRole("button")).toHaveCSS(
    "background-color",
    "rgba(0, 0, 0, 0)",
  )
})

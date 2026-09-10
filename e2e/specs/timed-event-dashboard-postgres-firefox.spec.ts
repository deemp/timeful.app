import { expect, test } from "@playwright/test"
import { Temporal } from "temporal-polyfill"
import { signInNewAccount } from "../helpers/account-auth"
import {
  dismissConsent,
  waitForEventShell,
} from "../helpers/timed-event-helpers"

// A signed-in PostgreSQL poll must appear on the dashboard, open through its
// canonical bare short identifier, and survive a dashboard reload.
test("signed-in PostgreSQL event loads on the dashboard and persists across reload", async ({
  page,
}) => {
  await signInNewAccount(page.request, "dashboard")

  const name = `Dashboard PostgreSQL ${String(Temporal.Now.instant().epochMilliseconds)}`
  const created = await page.request.post("/api/events", {
    data: {
      name,
      type: "specific_dates",
      daysOnly: true,
      dates: ["2026-10-05T00:00:00Z"],
    },
  })
  expect(created.status()).toBe(201)
  const { eventId } = (await created.json()) as { eventId: string }
  expect(eventId).toMatch(/^[0-9A-HJKMNPQRSTVWXYZ]{8}$/)

  await test.step("the event appears on the dashboard", async () => {
    await page.goto("/home", { waitUntil: "domcontentloaded" })
    const link = page.getByRole("link", { name: new RegExp(name) })
    await expect(link).toBeVisible()
    await expect(link).toHaveAttribute("href", `/e/${eventId}`)
  })

  await test.step("the event opens through its canonical identifier", async () => {
    await page.getByText(name, { exact: true }).click()
    await expect(page).toHaveURL(new RegExp(`/e/${eventId}$`))
    await waitForEventShell(page)
    await expect(page.getByText(name, { exact: true })).toBeVisible()
  })

  await test.step("the event survives a dashboard reload", async () => {
    await page.goto("/home", { waitUntil: "domcontentloaded" })
    await dismissConsent(page)
    await page.reload({ waitUntil: "domcontentloaded" })
    await expect(
      page.getByRole("link", { name: new RegExp(name) }),
    ).toBeVisible()
  })
})

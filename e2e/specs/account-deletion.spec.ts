import { expect, test, type Page } from "@playwright/test"
import {
  seedOtpAccount,
  signInNewAccount,
  verifySignIn,
} from "../helpers/account-auth"

async function openDeleteDialog(page: Page) {
  await page.getByRole("button", { name: "Delete account" }).click()
  const dialog = page.getByRole("dialog")
  await expect(dialog).toBeVisible()
  return dialog
}

test("account deletion requires the account email and signs the visitor out", async ({
  page,
}) => {
  const { email } = await signInNewAccount(page.request, "confirm")

  await test.step("the Settings dialog describes the ratified outcome", async () => {
    await page.goto("/settings")
    const dialog = await openDeleteDialog(page)
    await expect(dialog).toContainText("permanent and immediate")
    await expect(dialog).toContainText(
      "signing in again with the same email creates a new account",
    )
  })

  await test.step("Delete stays disabled until the account email is typed", async () => {
    const dialog = page.getByRole("dialog")
    const confirm = dialog.getByPlaceholder(email)
    await expect(confirm).toBeVisible()
    const deleteButton = dialog.getByRole("button", {
      name: "Delete",
      exact: true,
    })
    await expect(deleteButton).toBeDisabled()
    await confirm.fill("someone-else@example.invalid")
    await expect(deleteButton).toBeDisabled()
    await confirm.fill(email)
    await expect(deleteButton).toBeEnabled()
  })

  await test.step("deleting removes the account and signs the visitor out", async () => {
    const deletion = page.waitForResponse(
      (response) =>
        response.request().method() === "DELETE" &&
        response.url().endsWith("/api/user"),
    )
    await page
      .getByRole("dialog")
      .getByRole("button", { name: "Delete", exact: true })
      .click()
    expect((await deletion).status()).toBe(200)
    await expect(page).toHaveURL("/")
    expect((await page.request.get("/api/user/profile")).status()).toBe(401)
  })
})

test("re-signing in after deletion creates a fresh account and identity", async ({
  request,
}) => {
  const { email, userId } = await signInNewAccount(request, "resurrect")

  expect(
    (await request.delete("/api/user", { data: { email } })).status(),
  ).toBe(200)
  expect((await request.get("/api/user/profile")).status()).toBe(401)

  await seedOtpAccount(email)
  const freshUserId = await verifySignIn(request, email)
  expect(freshUserId).not.toBe(userId)
  expect((await request.get("/api/user/profile")).status()).toBe(200)
})

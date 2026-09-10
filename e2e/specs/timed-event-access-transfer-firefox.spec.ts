import { execFile, execFileSync } from "node:child_process"
import { promisify } from "node:util"
import { fileURLToPath } from "node:url"
import { expect, type APIRequestContext } from "@playwright/test"
import { test } from "../helpers/actor-context"

const payload = {
  name: "Transfer browser coverage",
  type: "specific_dates",
  daysOnly: true,
  dates: ["2026-10-05T00:00:00Z"],
  blindAvailabilityEnabled: true,
}

function expireTransfer(transferId: string) {
  if (!/^[0-9a-f-]{36}$/.test(transferId))
    throw new Error("Invalid test transfer ID")
  const compose = [
    "compose",
    "--env-file",
    ".env.test",
    "-f",
    "compose.yaml",
    "-f",
    "compose.test.yaml",
  ]
  const options = {
    cwd: fileURLToPath(new URL("../../", import.meta.url)),
    encoding: "utf8" as const,
  }
  const uri = execFileSync(
    "docker",
    [
      ...compose,
      "exec",
      "-T",
      "server-test",
      "printenv",
      "POSTGRES_APPLICATION_URI",
    ],
    options,
  ).trim()
  const database = new URL(uri).pathname.slice(1)
  if (!database.startsWith("timeful-test-"))
    throw new Error("Requires Playwright's isolated database")
  execFileSync(
    "docker",
    [
      ...compose,
      "exec",
      "-T",
      "postgres-test",
      "sh",
      "-ec",
      'psql --username "$POSTGRES_USER" --dbname "$1" --set=ON_ERROR_STOP=1 --command "$2"',
      "test-expiry",
      database,
      `UPDATE access_transfers SET expires_at=clock_timestamp()-interval '1 second' WHERE id='${transferId}'`,
    ],
    options,
  )
}

const execFileAsync = promisify(execFile)

// Prepare accounts independently of the browser journey; only OTP verification
// signs an actor in, at the scenario's required point.
async function seedAccount(label: string) {
  const email = `transfer-${label}-${crypto.randomUUID()}@example.invalid`
  await execFileAsync(
    "docker",
    [
      "compose",
      "--env-file",
      ".env.test",
      "-f",
      "compose.yaml",
      "-f",
      "compose.test.yaml",
      "exec",
      "-T",
      "mongo-test",
      "mongosh",
      "--quiet",
      "mongodb://localhost:27017/timeful-test",
      "--eval",
      `db.users.insertOne({email:${JSON.stringify(email)},firstName:"Transfer",lastName:"Test",calendarAccounts:{}}); db.otpCodes.insertOne({email:${JSON.stringify(email)},code:"123456",expiresAt:new Date(Date.now()+600000),attempts:0});`,
    ],
    { cwd: fileURLToPath(new URL("../../", import.meta.url)) },
  )
  return email
}

async function verifySignIn(request: APIRequestContext, email: string) {
  const result = await request.post("/api/auth/otp/verify", {
    data: { email, code: "123456", timezoneOffset: 0 },
  })
  expect(result.status()).toBe(200)
  return (await result.json()) as { _id: string }
}

async function signIn(request: APIRequestContext, label: string) {
  return verifySignIn(request, await seedAccount(label))
}

for (const mode of ["guest", "owner", "signed-in"] as const) {
  test(`Source approves the exact target code for ${mode} access`, async ({
    page,
    actorContext,
  }) => {
    const owner = await actorContext("owner")
    const target = await actorContext("target")
    const stranger = await actorContext("stranger")
    const created = await owner.request.post("/api/events", { data: payload })
    expect(created.status()).toBe(201)
    const { eventId } = (await created.json()) as { eventId: string }
    const api = `/api/events/${eventId}`
    if (mode === "owner") await page.context().addCookies(await owner.cookies())
    await page.request.get(api)
    const account =
      mode === "signed-in" ? await signIn(page.request, "source") : undefined
    expect(
      (
        await page.request.post(`${api}/response`, {
          data: {
            createResponse: true,
            name: "Source response",
            availability: ["2026-10-05T00:00:00Z"],
          },
        })
      ).status(),
    ).toBe(200)
    await stranger.request.get(api)
    expect(
      (
        await stranger.request.post(`${api}/response`, {
          data: {
            createResponse: true,
            name: "Private other response",
            availability: ["2026-10-05T00:00:00Z"],
          },
        })
      ).status(),
    ).toBe(200)
    await page.goto(`/e/${eventId}`, { waitUntil: "domcontentloaded" })
    await page
      .getByRole("button", {
        name: "Continue on another device",
        exact: true,
      })
      .click()
    await page
      .getByRole("button", { name: "Create transfer link", exact: true })
      .click()
    const linkField = page.getByLabel("Transfer link", { exact: true })
    await expect(linkField).toHaveValue(/\/transfer\//)
    const link = await linkField.inputValue()
    // Page startup is independent; opening both actors together avoids paying
    // Firefox's recorded-page startup latency twice on the critical path.
    const [targetPage, otherPage, guestAccountEmail] = await Promise.all([
      target.newPage(),
      stranger.newPage(),
      mode === "guest" ? seedAccount("target") : Promise.resolve(undefined),
    ])
    await targetPage.goto(link, { waitUntil: "domcontentloaded" })
    const code = targetPage.getByTestId("matching-code")
    await expect(code).toHaveText(/^[A-Z0-9]{8}$/)
    await targetPage
      .getByRole("button", { name: "Continue after approval" })
      .click()
    await expect(
      targetPage.getByText(/Access has not been approved/),
    ).toBeVisible()
    const before = await target.request.get(api)
    const beforeEvent = (await before.json()) as {
      responses: Record<string, unknown>
    }
    expect(beforeEvent.responses).toEqual({})
    // A different target opening first/also must not get the selected browser's grant.
    await otherPage.goto(link, { waitUntil: "domcontentloaded" })
    await expect(otherPage.getByTestId("matching-code")).not.toHaveText(
      await code.innerText(),
    )
    await test.step("Reject a wrong code and approve the selected target", async () => {
      await page.getByLabel("Matching code from other browser").fill("WRONG")
      await page.getByRole("button", { name: "Approve matching code" }).click()
      await expect(
        page.getByText(/Could not approve the transfer. Check the code/),
      ).toBeVisible()
      await page
        .getByLabel("Matching code from other browser")
        .fill(await code.innerText())
      await page.getByRole("button", { name: "Approve matching code" }).click()
      await expect(page.getByRole("status")).toContainText(
        "Approved — waiting for the other browser",
      )
    })
    await test.step("Reject the other browser and redeem only on the approved target", async () => {
      await otherPage
        .getByRole("button", { name: "Continue after approval" })
        .click()
      await expect(
        otherPage.getByText(/Access has not been approved/),
      ).toBeVisible()
      // This actor's journey is complete; finalize its recording before the
      // target's reload and revocation checks instead of encoding an idle page.
      await stranger.close()
      await targetPage
        .getByRole("button", { name: "Continue after approval" })
        .click()
      await expect(targetPage).toHaveURL(new RegExp(`/e/${eventId}$`))
    })
    const transferId = new URL(link).pathname.split("/").at(-1)
    expect(
      (
        await target.request.post(`${api}/transfers/${transferId}/redeem`, {
          data: {},
        })
      ).status(),
    ).toBe(403)
    const after = await target.request.get(api)
    const event = (await after.json()) as {
      responses: Record<string, { name: string; canEdit: boolean }>
      numResponses?: number
    }
    expect(Object.keys(event.responses)).toHaveLength(mode === "owner" ? 2 : 1)
    if (mode !== "owner") expect(event.numResponses).toBeUndefined()
    const sourceResponse = Object.entries(event.responses).find(
      ([, response]) => response.name === "Source response",
    )
    expect(sourceResponse).toBeDefined()
    const responseId = sourceResponse?.[0]
    expect(
      (
        await target.request.post(`${api}/response`, {
          data: { responseId, name: "Edited on target" },
        })
      ).status(),
    ).toBe(200)
    await targetPage.reload({ waitUntil: "domcontentloaded" })
    await expect(
      targetPage.getByRole("button", {
        name: "Edit Edited on target",
        exact: true,
      }),
    ).toBeVisible()
    expect(
      (
        await page.request.post(`${api}/response`, {
          data: { responseId, name: "Source still owns response" },
        })
      ).status(),
    ).toBe(200)
    if (mode === "signed-in") {
      expect((await target.request.get("/api/auth/status")).status()).toBe(200)
      const profile = (await (
        await target.request.get("/api/user/profile")
      ).json()) as { _id: string }
      expect(profile._id).toBe(account?._id)
      await expect(
        page.getByRole("button", { name: "Revoke access", exact: true }),
      ).toHaveCount(0)
    } else {
      const grant = (await target.cookies()).find(
        (cookie) => cookie.name === `timeful_grant_${eventId}`,
      )
      expect(grant).toMatchObject({
        httpOnly: true,
        sameSite: "Lax",
        path: "/api",
      })
      expect(await targetPage.evaluate(() => document.cookie)).not.toContain(
        "timeful_grant_",
      )
      if (mode === "owner") {
        await expect(
          targetPage.getByRole("button", {
            name: "Archive event",
            exact: true,
          }),
        ).toBeVisible()
        expect(
          (
            await target.request.put(api, {
              data: { ...payload, name: "Updated by delegated owner" },
            })
          ).status(),
        ).toBe(200)
        expect(
          (
            await target.request.post(`${api}/archive`, {
              data: { archive: true },
            })
          ).status(),
        ).toBe(200)
        expect(
          (
            await target.request.post(`${api}/archive`, {
              data: { archive: false },
            })
          ).status(),
        ).toBe(200)
      }
      if (mode === "guest") {
        if (!guestAccountEmail)
          throw new Error("Expected a seeded guest account")
        await verifySignIn(target.request, guestAccountEmail)
        await targetPage.goto("/home", { waitUntil: "domcontentloaded" })
        await expect(
          targetPage.getByText(
            "Keep transferred responses with your account?",
            { exact: true },
          ),
        ).toBeVisible()
        await targetPage
          .getByRole("button", { name: "Not now", exact: true })
          .click()
      }
      await page
        .getByRole("button", { name: "Revoke access", exact: true })
        .click()
      await expect(
        page.getByRole("button", { name: "Revoke access", exact: true }),
      ).toHaveCount(0)
      const revoked = await target.request.get(api)
      const revokedEvent = (await revoked.json()) as {
        responses: Record<string, unknown>
      }
      expect(revokedEvent.responses).toEqual({})
      expect(
        (
          await target.request.post(`${api}/response`, {
            data: { responseId, name: "Revoked edit" },
          })
        ).status(),
      ).toBe(403)
      expect((await target.request.delete(api)).status()).toBe(403)
      if (mode === "owner") {
        expect((await page.request.put(api, { data: payload })).status()).toBe(
          200,
        )
        const renewed = (await (
          await page.request.post(`${api}/transfers`)
        ).json()) as { id: string }
        const transferApi = `${api}/transfers/${renewed.id}`
        const opened = (await (
          await target.request.post(`${transferApi}/open`, { data: {} })
        ).json()) as { requestId: string; code: string }
        expect(
          (
            await page.request.post(`${transferApi}/approve`, {
              data: opened,
            })
          ).status(),
        ).toBe(200)
        expect(
          (
            await target.request.post(`${transferApi}/redeem`, { data: {} })
          ).status(),
        ).toBe(200)
        expect((await target.request.delete(api)).status()).toBe(200)
        expect((await page.request.get(api)).status()).toBe(404)
      }
    }
    if (mode !== "owner") {
      await expect(page.getByRole("status")).toContainText(
        mode === "signed-in" ? "Completed" : "Access revoked",
      )
      const storage = await page.evaluate(
        (eventId): unknown =>
          JSON.parse(
            localStorage.getItem(`timeful.transfers.${eventId}`) ?? "{}",
          ),
        eventId,
      )
      expect(storage).toEqual(expect.objectContaining({ transfers: [] }))
    }
  })
}

for (const mode of ["guest", "account-switch"] as const) {
  test(`Approved ${mode} transfer survives target reload and redeems with required consent`, async ({
    page,
    actorContext,
  }) => {
    const owner = await actorContext("owner")
    const target = await actorContext("target")
    const { eventId, api, sourceAccount, targetAccount, transferApi, link } =
      await test.step("Seed source access and create a transfer", async () => {
        const created = await owner.request.post("/api/events", {
          data: payload,
        })
        expect(created.status()).toBe(201)
        const { eventId } = (await created.json()) as { eventId: string }
        const api = `/api/events/${eventId}`
        expect((await page.request.get(api)).status()).toBe(200)
        const sourceAccount =
          mode === "account-switch"
            ? await signIn(page.request, "reload-source")
            : undefined
        const targetAccount =
          mode === "account-switch"
            ? await signIn(target.request, "reload-target")
            : undefined
        expect(
          (
            await page.request.post(`${api}/response`, {
              data: {
                createResponse: true,
                name: "Reload source response",
                availability: ["2026-10-05T00:00:00Z"],
              },
            })
          ).status(),
        ).toBe(200)
        const createdTransfer = await page.request.post(`${api}/transfers`)
        expect(createdTransfer.status()).toBe(201)
        const { id } = (await createdTransfer.json()) as { id: string }
        return {
          eventId,
          api,
          sourceAccount,
          targetAccount,
          transferApi: `${api}/transfers/${id}`,
          link: `/transfer/${eventId}/${id}`,
        }
      })
    const targetPage = await target.newPage()
    await test.step("Approve the on-page code and restore it after reload", async () => {
      await targetPage.goto(link, { waitUntil: "domcontentloaded" })
      const code = targetPage.getByTestId("matching-code")
      await expect(code).toHaveText(/^[A-Z0-9]{8}$/)
      const matchingCode = await code.innerText()
      const status = await page.request.post(`${transferApi}/status`, {
        data: {},
      })
      expect(status.status()).toBe(200)
      const { requests } = (await status.json()) as {
        requests: { id: string; code: string }[]
      }
      const selected = requests.find((request) => request.code === matchingCode)
      expect(selected).toBeDefined()
      expect(
        (
          await page.request.post(`${transferApi}/approve`, {
            data: { requestId: selected?.id, code: matchingCode },
          })
        ).status(),
      ).toBe(200)
      await targetPage.reload({ waitUntil: "domcontentloaded" })
      await expect(code).toHaveText(matchingCode)
      await expect(targetPage.getByRole("status")).toContainText(
        "Approved — you can continue",
      )
    })
    await test.step("Redeem only after any required account-switch consent", async () => {
      await targetPage
        .getByRole("button", { name: "Continue after approval", exact: true })
        .click()
      if (mode === "account-switch") {
        const dialog = targetPage.getByRole("dialog")
        await expect(dialog).toContainText("Switch accounts on this device?")
        await expect(dialog).toContainText("Transfer Test")
        await expect(dialog).toContainText("replacing your current sign-in")
        await expect(dialog).toContainText("does not merge accounts")
        await dialog
          .getByRole("button", { name: "Cancel", exact: true })
          .click()
        await expect(dialog).toBeHidden()
        await expect(targetPage).toHaveURL(new RegExp(`${link}$`))
        const profile = (await (
          await target.request.get("/api/user/profile")
        ).json()) as { _id: string }
        expect(profile._id).toBe(targetAccount?._id)
        const status = (await (
          await page.request.post(`${transferApi}/status`, { data: {} })
        ).json()) as { state: string }
        expect(status.state).toBe("approved")
        await targetPage
          .getByRole("button", {
            name: "Continue after approval",
            exact: true,
          })
          .click()
        await dialog
          .getByRole("button", { name: "Switch accounts", exact: true })
          .click()
      }
      await expect(targetPage).toHaveURL(new RegExp(`/e/${eventId}$`))
      await expect(
        targetPage.getByRole("button", {
          name: "Edit Reload source response",
          exact: true,
        }),
      ).toBeVisible()
      const event = (await (await target.request.get(api)).json()) as {
        responses: Record<string, { name: string; canEdit: boolean }>
      }
      expect(Object.values(event.responses)).toEqual([
        expect.objectContaining({
          name: "Reload source response",
          canEdit: true,
        }),
      ])
      if (sourceAccount) {
        const profile = (await (
          await target.request.get("/api/user/profile")
        ).json()) as { _id: string }
        expect(profile._id).toBe(sourceAccount._id)
      }
    })
  })
}

test("Source cancels approved access before the target redeems", async ({
  page,
  actorContext,
}) => {
  const target = await actorContext("target")
  const created = await page.request.post("/api/events", { data: payload })
  expect(created.status()).toBe(201)
  const { eventId } = (await created.json()) as { eventId: string }
  await page.goto(`/e/${eventId}`, { waitUntil: "domcontentloaded" })
  await page.getByRole("button", { name: "Continue on another device" }).click()
  await page.getByRole("button", { name: "Create transfer link" }).click()
  const linkField = page.getByLabel("Transfer link", { exact: true })
  await expect(linkField).toHaveValue(/\/transfer\//)
  const link = await linkField.inputValue()
  const targetPage = await target.newPage()
  await targetPage.goto(link, { waitUntil: "domcontentloaded" })
  const code = targetPage.getByTestId("matching-code")
  await expect(code).toHaveText(/^[A-Z0-9]{8}$/)
  await page
    .getByLabel("Matching code from other browser")
    .fill(await code.innerText())
  await page.getByRole("button", { name: "Approve matching code" }).click()
  await expect(page.getByRole("status")).toContainText(
    "Approved — waiting for the other browser",
  )
  await page
    .getByRole("button", { name: "Cancel transfer", exact: true })
    .click()
  await expect(page.getByRole("status")).toContainText("Cancelled")
  await expect(
    page.getByRole("button", { name: "Cancel transfer", exact: true }),
  ).toHaveCount(0)
  await targetPage
    .getByRole("button", { name: "Continue after approval" })
    .click()
  await expect(
    targetPage.getByText(/Access has not been approved/),
  ).toBeVisible()
  expect(
    (await target.cookies()).some((cookie) =>
      cookie.name.startsWith("timeful_grant_"),
    ),
  ).toBe(false)
})

for (const state of ["cancelled", "expired"] as const) {
  test(`A ${state} link cannot grant access`, async ({
    page,
    actorContext,
  }) => {
    const target = await actorContext("target")
    const created = (await (
      await page.request.post("/api/events", { data: payload })
    ).json()) as { eventId: string }
    const api = `/api/events/${created.eventId}/transfers`
    const transfer = (await (await page.request.post(api)).json()) as {
      id: string
    }
    const targetPage = await target.newPage()
    const link = `/transfer/${created.eventId}/${transfer.id}`
    await targetPage.goto(link, { waitUntil: "domcontentloaded" })
    await expect(targetPage.getByTestId("matching-code")).toHaveText(
      /^[A-Z0-9]{8}$/,
    )
    if (state === "cancelled") {
      expect(
        (
          await page.request.post(`${api}/${transfer.id}/cancel`, {
            data: {},
          })
        ).status(),
      ).toBe(200)
    } else {
      expireTransfer(transfer.id)
    }
    await targetPage
      .getByRole("button", { name: "Continue after approval" })
      .click()
    await expect(
      targetPage.getByText(/Access has not been approved/),
    ).toBeVisible()
    await targetPage.reload({ waitUntil: "domcontentloaded" })
    await expect(
      targetPage.getByText(
        /This transfer is expired, cancelled, or unavailable/,
      ),
    ).toBeVisible()
    expect(
      (await target.cookies()).some((cookie) =>
        cookie.name.startsWith("timeful_grant_"),
      ),
    ).toBe(false)
  })
}

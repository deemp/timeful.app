import {
  expect,
  type APIRequestContext,
  type Locator,
  type Page,
} from "@playwright/test"
import { Temporal } from "temporal-polyfill"
import { test } from "../helpers/actor-context"
import { signInNewAccount } from "../helpers/account-auth"
import { postgresScalar } from "../helpers/postgres-inspect"

interface FolderResponse {
  _id: string
  name: string
  eventIds: string[]
}

const folderColor = "#D3D3D3"

function pollPayload(name: string) {
  return {
    name,
    type: "specific_dates",
    daysOnly: true,
    dates: ["2026-10-05T00:00:00Z"],
  }
}

function uniqueName(label: string): string {
  return `${label} ${String(Temporal.Now.instant().epochMilliseconds)}`
}

async function fetchFolders(
  request: APIRequestContext,
): Promise<FolderResponse[]> {
  const response = await request.get("/api/user/folders")
  expect(response.status()).toBe(200)
  return (await response.json()) as FolderResponse[]
}

function eventLink(page: Page, eventId: string): Locator {
  return page.locator(`a[href="/e/${eventId}"]`)
}

// The EventItem menu activator is the only button rendered inside the event's
// dashboard link; clicking it opens the owner actions for that event.
async function openEventMenu(item: Locator): Promise<void> {
  await item.getByRole("button").first().click()
}

test("signed-in PostgreSQL poll persists in PostgreSQL and survives a dashboard reload", async ({
  page,
}) => {
  await signInNewAccount(page.request, "poll")
  const name = uniqueName("Signed-in poll")

  const created = await page.request.post("/api/events", {
    data: pollPayload(name),
  })
  expect(created.status()).toBe(201)
  const { eventId } = (await created.json()) as { eventId: string }
  expect(eventId).toMatch(/^[0-9A-HJKMNPQRSTVWXYZ]{8}$/)

  await test.step("the poll is owned in PostgreSQL", async () => {
    expect(
      postgresScalar(
        `SELECT count(*) FROM postgres_events WHERE short_id='${eventId}' AND is_deleted=false`,
      ),
    ).toBe("1")
    expect((await page.request.get(`/api/events/${eventId}`)).status()).toBe(
      200,
    )
  })

  await test.step("the poll appears on the dashboard", async () => {
    await page.goto("/home", { waitUntil: "domcontentloaded" })
    const link = page.getByRole("link", { name: new RegExp(name) })
    await expect(link).toBeVisible()
    await expect(link).toHaveAttribute("href", `/e/${eventId}`)
  })

  await test.step("the poll survives a dashboard reload", async () => {
    await page.reload({ waitUntil: "domcontentloaded" })
    await expect(
      page.getByRole("link", { name: new RegExp(name) }),
    ).toBeVisible()
  })
})

test("signed-in folder keeps a PostgreSQL event member across reload", async ({
  page,
}) => {
  await signInNewAccount(page.request, "folder")
  const eventName = uniqueName("Folder member poll")
  const folderName = uniqueName("Dashboard folder")

  const created = await page.request.post("/api/events", {
    data: pollPayload(eventName),
  })
  expect(created.status()).toBe(201)
  const { eventId } = (await created.json()) as { eventId: string }

  await page.goto("/home", { waitUntil: "domcontentloaded" })

  const folders =
    await test.step("create a folder through the dashboard", async () => {
      await page.getByRole("button", { name: "New folder" }).click()
      await page.getByLabel("Folder name").fill(folderName)
      await page
        .getByRole("dialog")
        .getByRole("button", { name: "Create", exact: true })
        .click()
      await expect(page.getByText(folderName, { exact: true })).toBeVisible()
      return fetchFolders(page.request)
    })
  const folder = folders.find((candidate) => candidate.name === folderName)
  expect(folder).toBeDefined()
  if (!folder) throw new Error("Expected the created folder")

  await test.step("move the poll into the folder through its dashboard menu", async () => {
    const item = eventLink(page, eventId)
    await expect(item).toBeVisible()
    await openEventMenu(item)
    await page.getByText("Move to", { exact: true }).hover()
    await page.getByRole("listitem").filter({ hasText: folderName }).click()
    await expect
      .poll(async () => {
        const current = await fetchFolders(page.request)
        return (
          current.find((candidate) => candidate._id === folder._id)?.eventIds ??
          []
        )
      })
      .toContain(eventId)
  })

  await test.step("folder membership persists after reload", async () => {
    await page.reload({ waitUntil: "domcontentloaded" })
    await expect(
      page
        .locator(`[data-folder-id="${folder._id}"]`)
        .getByRole("link", { name: new RegExp(eventName) }),
    ).toBeVisible()
  })

  expect(
    postgresScalar(
      `SELECT count(*) FROM folder_events WHERE folder_id='${folder._id}' AND event_id=(SELECT id FROM postgres_events WHERE short_id='${eventId}')`,
    ),
  ).toBe("1")
})

test("signed-in poll archives and deletes from the dashboard", async ({
  page,
}) => {
  await signInNewAccount(page.request, "lifecycle")
  const name = uniqueName("Lifecycle poll")

  const created = await page.request.post("/api/events", {
    data: pollPayload(name),
  })
  expect(created.status()).toBe(201)
  const { eventId } = (await created.json()) as { eventId: string }

  await page.goto("/home", { waitUntil: "domcontentloaded" })
  await expect(eventLink(page, eventId)).toBeVisible()

  await test.step("archive the poll from the dashboard", async () => {
    await openEventMenu(eventLink(page, eventId))
    const archived = page.waitForResponse(
      (response) =>
        response.request().method() === "POST" &&
        response.url().endsWith(`/api/events/${eventId}/archive`),
    )
    await page.getByText("Archive", { exact: true }).click()
    expect((await archived).status()).toBe(200)
    expect(
      postgresScalar(
        `SELECT is_archived FROM postgres_events WHERE short_id='${eventId}'`,
      ),
    ).toBe("t")
    await expect(page.locator(`[data-folder-id="archived"]`)).toHaveCount(1)
  })

  await test.step("the archived poll only reappears under Archived", async () => {
    await page.reload({ waitUntil: "domcontentloaded" })
    await expect(eventLink(page, eventId)).not.toBeVisible()
    await page
      .getByText("Archived", { exact: true })
      .locator("..")
      .getByRole("button")
      .click()
    await expect(eventLink(page, eventId)).toBeVisible()
  })

  await test.step("delete the poll from the dashboard", async () => {
    await openEventMenu(eventLink(page, eventId))
    await page.getByText("Delete event", { exact: true }).click()
    const deleted = page.waitForResponse(
      (response) =>
        response.request().method() === "DELETE" &&
        response.url().endsWith(`/api/events/${eventId}`),
    )
    await page.getByRole("button", { name: "I'm sure", exact: true }).click()
    expect((await deleted).status()).toBe(200)
    await expect(eventLink(page, eventId)).toHaveCount(0)
    expect(
      postgresScalar(
        `SELECT is_deleted FROM postgres_events WHERE short_id='${eventId}'`,
      ),
    ).toBe("t")
    expect((await page.request.get(`/api/events/${eventId}`)).status()).toBe(
      404,
    )
  })
})

test("a stranger cannot view or mutate another account's poll or folder", async ({
  actorContext,
}) => {
  const owner = await actorContext("owner")
  const stranger = await actorContext("stranger")
  await signInNewAccount(owner.request, "isolation-owner")
  await signInNewAccount(stranger.request, "isolation-stranger")

  const name = uniqueName("Private poll")
  const folderName = uniqueName("Private folder")

  const created = await owner.request.post("/api/events", {
    data: pollPayload(name),
  })
  expect(created.status()).toBe(201)
  const { eventId } = (await created.json()) as { eventId: string }

  const folderCreated = await owner.request.post("/api/user/folders", {
    data: { name: folderName, color: folderColor },
  })
  expect(folderCreated.status()).toBe(201)
  const { id: folderId } = (await folderCreated.json()) as { id: string }
  expect(
    (
      await owner.request.post(`/api/user/events/${eventId}/set-folder`, {
        data: { folderId },
      })
    ).status(),
  ).toBe(200)

  await test.step("the owner sees the poll and folder on the dashboard", async () => {
    const ownerPage = await owner.newPage()
    await ownerPage.goto("/home", { waitUntil: "domcontentloaded" })
    await expect(
      ownerPage.getByRole("link", { name: new RegExp(name) }),
    ).toBeVisible()
    await expect(ownerPage.getByText(folderName, { exact: true })).toBeVisible()
  })

  await test.step("the stranger dashboard lists neither record", async () => {
    const events = (await (
      await stranger.request.get("/api/user/events")
    ).json()) as Array<{ _id?: string; shortId?: string }>
    expect(
      events.some(
        (event) => event._id === eventId || event.shortId === eventId,
      ),
    ).toBe(false)
    const folders = await fetchFolders(stranger.request)
    expect(folders.some((folder) => folder._id === folderId)).toBe(false)

    const strangerPage = await stranger.newPage()
    await strangerPage.goto("/home", { waitUntil: "domcontentloaded" })
    await expect(
      strangerPage.getByRole("link", { name: new RegExp(name) }),
    ).toHaveCount(0)
    await expect(
      strangerPage.getByText(folderName, { exact: true }),
    ).toHaveCount(0)
  })

  await test.step("the stranger cannot read or mutate the folder", async () => {
    expect(
      (await stranger.request.get(`/api/user/folders/${folderId}`)).status(),
    ).toBe(404)
    expect(
      (
        await stranger.request.patch(`/api/user/folders/${folderId}`, {
          data: { name: "Hijacked folder" },
        })
      ).status(),
    ).toBe(404)
    expect(
      (await stranger.request.delete(`/api/user/folders/${folderId}`)).status(),
    ).toBe(404)
  })

  await test.step("the stranger cannot mutate the poll", async () => {
    expect(
      (
        await stranger.request.post(`/api/events/${eventId}/archive`, {
          data: { archive: true },
        })
      ).status(),
    ).toBe(403)
    expect(
      (await stranger.request.delete(`/api/events/${eventId}`)).status(),
    ).toBe(403)
    expect(
      (
        await stranger.request.put(`/api/events/${eventId}`, {
          data: pollPayload(name),
        })
      ).status(),
    ).toBe(403)
  })
})

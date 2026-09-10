import { expect, test } from "@playwright/test"

const payload = {
  name: "Owner authority",
  type: "specific_dates",
  daysOnly: true,
  dates: ["2026-10-05T00:00:00Z", "2026-10-06T00:00:00Z"],
}

test("Only the PostgreSQL owner can edit settings; a base EVCC never grants owner actions", async ({
  page,
  browser,
  baseURL,
}) => {
  const created = await page.request.post("/api/events", { data: payload })
  expect(created.status()).toBe(201)
  const { eventId } = (await created.json()) as { eventId: string }
  await page.goto(`/e/${eventId}`)
  await expect(
    page.getByRole("button", { name: "Edit event", exact: true }),
  ).toBeVisible()
  await expect(
    page.getByRole("button", { name: "Archive event", exact: true }),
  ).toBeVisible()
  const cookies = await page.context().cookies()
  expect(
    cookies.find((cookie) => cookie.name === `timeful_owner_${eventId}`),
  ).toMatchObject({ httpOnly: true, sameSite: "Lax", path: "/api" })
  expect(await page.evaluate(() => document.cookie)).not.toContain(
    "timeful_owner_",
  )
  await page.getByRole("button", { name: "Edit event", exact: true }).click()
  await page.getByLabel("Event name (required)").fill("Owner edited title")
  const saved = page.waitForResponse(
    (response) =>
      response.request().method() === "PUT" &&
      response.url().endsWith(`/api/events/${eventId}`),
  )
  await page.getByRole("button", { name: "Save edits", exact: true }).click()
  expect((await saved).status()).toBe(200)
  await expect(
    page.getByText("Owner edited title", { exact: true }),
  ).toBeVisible()
  const visitor = await browser.newContext({ baseURL })
  try {
    await visitor.addCookies(
      cookies.filter((cookie) => cookie.name === `timeful_evcc_${eventId}`),
    )
    const otherPage = await visitor.newPage()
    await otherPage.goto(`/e/${eventId}`)
    await expect(
      otherPage.getByText("Owner edited title", { exact: true }),
    ).toBeVisible()
    for (const name of ["Edit event", "Archive event", "Delete event"]) {
      await expect(
        otherPage.getByRole("button", { name, exact: true }),
      ).toHaveCount(0)
    }
    expect(
      (
        await visitor.request.put(`/api/events/${eventId}`, { data: payload })
      ).status(),
    ).toBe(403)
    expect(
      (
        await visitor.request.post(`/api/events/${eventId}/archive`, {
          data: { archive: true },
        })
      ).status(),
    ).toBe(403)
    expect(
      (await visitor.request.delete(`/api/events/${eventId}`)).status(),
    ).toBe(403)
    await visitor.clearCookies()
    expect(
      (
        await visitor.request.put(`/api/events/${eventId}`, { data: payload })
      ).status(),
    ).toBe(403)
  } finally {
    await visitor.close()
  }
})

test("PostgreSQL owner archives, restores, and deletes an event through the event page", async ({
  page,
}) => {
  const created = await page.request.post("/api/events", { data: payload })
  expect(created.status()).toBe(201)
  const { eventId } = (await created.json()) as { eventId: string }
  const response = await page.request.post(`/api/events/${eventId}/response`, {
    data: {
      createResponse: true,
      name: "Ada",
      availability: ["2026-10-05T00:00:00Z"],
    },
  })
  expect(response.status()).toBe(200)
  await page.goto(`/e/${eventId}`)
  await page.getByRole("button", { name: "Archive event", exact: true }).click()
  await expect(
    page.getByText("This event is archived and read-only."),
  ).toBeVisible()
  await expect(
    page.getByRole("button", { name: "Edit event", exact: true }),
  ).toHaveCount(0)
  await expect(
    page.getByRole("button", { name: "Edit Ada", exact: true }),
  ).toHaveCount(0)
  await expect(
    page.getByRole("button", { name: "Schedule event", exact: true }),
  ).toHaveCount(0)
  expect(
    (
      await page.request.put(`/api/events/${eventId}`, { data: payload })
    ).status(),
  ).toBe(403)
  expect(
    (
      await page.request.post(`/api/events/${eventId}/response`, {
        data: { createResponse: true, name: "Blocked" },
      })
    ).status(),
  ).toBe(403)
  await page.reload()
  await expect(
    page.getByText("This event is archived and read-only."),
  ).toBeVisible()
  await page
    .getByRole("button", { name: "Unarchive event", exact: true })
    .click()
  await expect(
    page.getByRole("button", { name: "Edit event", exact: true }),
  ).toBeVisible()
  await expect(
    page.getByRole("button", { name: "Edit Ada", exact: true }),
  ).toBeVisible()
  await expect(
    page.getByRole("button", { name: "Schedule event", exact: true }),
  ).toBeVisible()
  await page.getByRole("button", { name: "Delete event", exact: true }).click()
  await page.getByRole("button", { name: "Cancel", exact: true }).click()
  expect((await page.request.get(`/api/events/${eventId}`)).status()).toBe(200)
  await page.getByRole("button", { name: "Delete event", exact: true }).click()
  await page.getByRole("button", { name: "Delete", exact: true }).click()
  await expect(page).toHaveURL("/")
  expect((await page.request.get(`/api/events/${eventId}`)).status()).toBe(404)
})

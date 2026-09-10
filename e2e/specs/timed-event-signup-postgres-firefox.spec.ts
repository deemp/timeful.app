import { expect, type APIRequestContext, type Page } from "@playwright/test"
import { Temporal } from "temporal-polyfill"
import { test } from "../helpers/actor-context"
import { signInNewAccount } from "../helpers/account-auth"
import { postgresScalar } from "../helpers/postgres-inspect"
import { openEventPage } from "../helpers/timed-event-helpers"

test.skip(
  process.env.E2E_POSTGRES_ANONYMOUS_EVENT_CREATION_ENABLED !== "true",
  "requires PostgreSQL creation",
)

const blockName = "Morning Slot"
const joinSlotLink = "+ Join this slot"

function uniqueName(label: string): string {
  return `${label} ${String(Temporal.Now.instant().epochMilliseconds)}`
}

interface SeededSignupEvent {
  shortId: string
  blockId: string
}

async function seedSignupEvent(
  request: APIRequestContext,
  input: { name: string; capacity: number; collectEmails: boolean },
): Promise<SeededSignupEvent> {
  const today = Temporal.Now.plainDateISO("UTC").toString()
  const response = await request.post("/api/events", {
    data: {
      name: input.name,
      type: "specific_dates",
      activeSlots: [
        `${today}T09:00:00.000Z`,
        `${today}T10:00:00.000Z`,
        `${today}T11:00:00.000Z`,
      ],
      eventTimezone: "UTC",
      slotGeneration: {
        startTimeLocal: "09:00",
        endTimeLocal: "17:00",
        timeIncrementMinutes: 60,
      },
      timedRecurrence: {
        kind: "specific_dates",
        selectedDays: [today],
        selectedDaysOfWeek: [],
        startOnMonday: true,
      },
      isSignUpForm: true,
      signUpBlocks: [
        {
          name: blockName,
          capacity: input.capacity,
          startDate: `${today}T09:00:00.000Z`,
          endDate: `${today}T10:00:00.000Z`,
        },
      ],
      daysOnly: false,
      notificationsEnabled: false,
      blindAvailabilityEnabled: false,
      collectEmails: input.collectEmails,
      sendEmailAfterXResponses: -1,
    },
  })
  expect(response.status()).toBe(201)
  const body = (await response.json()) as { shortId?: string; eventId: string }
  const shortId = body.shortId ?? body.eventId
  expect(shortId).toBeTruthy()

  const read = await request.get(`/api/events/${shortId}`)
  expect(read.status()).toBe(200)
  const event = (await read.json()) as {
    signUpBlocks?: { _id: string }[]
  }
  const blockId = event.signUpBlocks?.[0]?._id
  expect(blockId).toBeTruthy()

  return { shortId, blockId: String(blockId) }
}

function sidebar(page: Page) {
  return page.locator(".schedule-overlap-sidebar")
}

function blockLocator(page: Page, blockId: string) {
  return sidebar(page).locator(`[data-id="${blockId}"]`)
}

async function joinSlot(page: Page, blockId: string) {
  await blockLocator(page, blockId)
    .getByText(joinSlotLink, { exact: true })
    .click()
}

function guestResponseCount(shortId: string, kind: string): string {
  return postgresScalar(
    `SELECT count(*) FROM event_signup_responses WHERE event_id=(SELECT id FROM postgres_events WHERE short_id='${shortId}') AND respondent_kind='${kind}'`,
  )
}

test("an anonymous visitor joins a signup block and it persists in PostgreSQL", async ({
  page,
  request,
}) => {
  const name = uniqueName("Anonymous signup")
  const { shortId, blockId } = await seedSignupEvent(request, {
    name,
    capacity: 3,
    collectEmails: true,
  })

  await openEventPage(page, shortId)
  await expect(
    sidebar(page).getByText(blockName, { exact: true }),
  ).toBeVisible()

  const submitted = page.waitForResponse(
    (response) =>
      response.request().method() === "POST" &&
      new URL(response.url()).pathname.endsWith("/response"),
  )
  await test.step("the visitor joins the slot as a guest", async () => {
    await joinSlot(page, blockId)
    await page.getByPlaceholder("Enter your name...").fill("Ada Lovelace")
    await page.getByPlaceholder("Enter your email...").fill("ada@example.com")
    await page.getByRole("button", { name: "Join slot", exact: true }).click()
    expect((await submitted).status()).toBe(200)
  })

  await test.step("PostgreSQL stores the guest response", () => {
    expect(guestResponseCount(shortId, "guest")).toBe("1")
    expect(
      postgresScalar(
        `SELECT canonical_guest_name FROM event_signup_responses WHERE event_id=(SELECT id FROM postgres_events WHERE short_id='${shortId}')`,
      ),
    ).toBe("Ada Lovelace")
  })

  await test.step("the guest response survives a reload", async () => {
    await page.reload({ waitUntil: "domcontentloaded" })
    await expect(
      sidebar(page).getByText("Ada Lovelace", { exact: true }),
    ).toBeVisible()
    expect(guestResponseCount(shortId, "guest")).toBe("1")
  })
})

test("a signed-in visitor joins a signup block and it persists in PostgreSQL", async ({
  page,
  actorContext,
}) => {
  const name = uniqueName("Signed-in signup")
  await signInNewAccount(page.request, "signup-owner")
  const { shortId, blockId } = await seedSignupEvent(page.request, {
    name,
    capacity: 3,
    collectEmails: true,
  })

  const responder = await actorContext("responder")
  const { userId } = await signInNewAccount(
    responder.request,
    "signup-responder",
  )
  const responderPage = await responder.newPage()

  await openEventPage(responderPage, shortId)
  await expect(
    sidebar(responderPage).getByText(blockName, { exact: true }),
  ).toBeVisible()

  const submitted = responderPage.waitForResponse(
    (response) =>
      response.request().method() === "POST" &&
      new URL(response.url()).pathname.endsWith("/response"),
  )
  await test.step("the signed-in visitor joins the slot without a name", async () => {
    await joinSlot(responderPage, blockId)
    await responderPage
      .getByRole("button", { name: "Join slot", exact: true })
      .click()
    expect((await submitted).status()).toBe(200)
  })

  await test.step("PostgreSQL stores the account response", () => {
    expect(guestResponseCount(shortId, "account")).toBe("1")
    expect(
      postgresScalar(
        `SELECT account_user_id FROM event_signup_responses WHERE event_id=(SELECT id FROM postgres_events WHERE short_id='${shortId}')`,
      ),
    ).toBe(userId)
  })

  await test.step("the owner reads the account response", async () => {
    const read = await page.request.get(`/api/events/${shortId}`)
    expect(read.status()).toBe(200)
    const event = (await read.json()) as {
      signUpResponses?: Record<string, { userId?: string }>
    }
    const responses = Object.values(event.signUpResponses ?? {})
    expect(responses.some((response) => response.userId === userId)).toBe(true)
  })

  await test.step("the signed-in response survives a reload and locks further joins", async () => {
    await responderPage.reload({ waitUntil: "domcontentloaded" })
    await expect(
      sidebar(responderPage).getByText("E2E Deletion", { exact: true }),
    ).toBeVisible()
    await expect(
      blockLocator(responderPage, blockId).getByText(joinSlotLink, {
        exact: true,
      }),
    ).toHaveCount(0)
  })
})

test("a full signup block rejects a second anonymous visitor", async ({
  actorContext,
}) => {
  const seeded = await seedSignupEvent((await actorContext("seed")).request, {
    name: uniqueName("Capacity signup"),
    capacity: 1,
    collectEmails: false,
  })

  const first = await actorContext("first")
  const firstPage = await first.newPage()
  await openEventPage(firstPage, seeded.shortId)
  await joinSlot(firstPage, seeded.blockId)
  await firstPage.getByPlaceholder("Enter your name...").fill("Capacity One")
  await Promise.all([
    firstPage.waitForResponse(
      (response) =>
        response.request().method() === "POST" &&
        new URL(response.url()).pathname.endsWith("/response"),
    ),
    firstPage.getByRole("button", { name: "Join slot", exact: true }).click(),
  ])
  expect(guestResponseCount(seeded.shortId, "guest")).toBe("1")

  const second = await actorContext("second")
  const secondPage = await second.newPage()
  await openEventPage(secondPage, seeded.shortId)
  await expect(
    sidebar(secondPage).getByText("1/1", { exact: true }),
  ).toBeVisible()
  await expect(
    blockLocator(secondPage, seeded.blockId).getByText(joinSlotLink, {
      exact: true,
    }),
  ).toHaveCount(0)
  expect(guestResponseCount(seeded.shortId, "guest")).toBe("1")
})

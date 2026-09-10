import { expect, type APIRequestContext, type Page } from "@playwright/test"
import { Temporal } from "temporal-polyfill"
import { test } from "../helpers/actor-context"
import { signInNewAccount } from "../helpers/account-auth"
import { postgresScalar } from "../helpers/postgres-inspect"
import {
  dismissConsent,
  rowIndexForTime,
  waitForEventShell,
} from "../helpers/timed-event-helpers"

function uniqueName(label: string): string {
  return `${label} ${String(Temporal.Now.instant().epochMilliseconds)}`
}

function uniqueEmail(label: string): string {
  return `delete-${label}-${String(Temporal.Now.instant().epochMilliseconds)}-${String(Math.floor(Math.random() * 1_000_000))}@example.invalid`
}

interface GroupSchedule {
  activeSlots: string[]
  timedRecurrence: {
    kind: "weekly"
    selectedDays: string[]
    selectedDaysOfWeek: number[]
    startOnMonday: boolean
  }
  column: number
  row: number
}

// The group grid renders the anchor week, so seeding the current UTC day keeps
// the paintable column predictable: the group's single selected day renders as
// column 0.
function groupSchedule(): GroupSchedule {
  const today = Temporal.Now.plainDateISO("UTC")
  const day = today.toString()
  return {
    activeSlots: [`${day}T09:00:00.000Z`, `${day}T10:00:00.000Z`],
    timedRecurrence: {
      kind: "weekly",
      selectedDays: [day],
      selectedDaysOfWeek: [today.dayOfWeek],
      startOnMonday: true,
    },
    column: 0,
    row: rowIndexForTime(9, 0, 60),
  }
}

async function seedGroup(
  request: APIRequestContext,
  input: { name: string; attendees: string[] },
): Promise<{ shortId: string; schedule: GroupSchedule }> {
  const schedule = groupSchedule()
  const response = await request.post("/api/events", {
    data: {
      name: input.name,
      type: "group",
      attendees: input.attendees,
      collectEmails: false,
      activeSlots: schedule.activeSlots,
      eventTimezone: "UTC",
      slotGeneration: {
        startTimeLocal: "09:00:00",
        endTimeLocal: "17:00:00",
        timeIncrementMinutes: 60,
      },
      timedRecurrence: schedule.timedRecurrence,
      notificationsEnabled: false,
      blindAvailabilityEnabled: false,
      sendEmailAfterXResponses: -1,
    },
  })
  expect(response.status()).toBe(201)
  const body = (await response.json()) as {
    shortId?: string
    eventId?: string
  }
  const shortId = body.shortId ?? body.eventId
  expect(shortId).toBeTruthy()
  return { shortId: String(shortId), schedule }
}

function eventIdExpression(shortId: string): string {
  return `(SELECT id FROM postgres_events WHERE short_id='${shortId}')`
}

function attendeeDeclined(shortId: string, email: string): string {
  return postgresScalar(
    `SELECT coalesce(declined::text, 'unset') FROM event_attendees WHERE event_id=${eventIdExpression(shortId)} AND email='${email}'`,
  )
}

function attendeeCount(shortId: string): string {
  return postgresScalar(
    `SELECT count(*) FROM event_attendees WHERE event_id=${eventIdExpression(shortId)}`,
  )
}

function accountResponseCount(shortId: string): string {
  return postgresScalar(
    `SELECT count(*) FROM postgres_event_responses WHERE event_id=${eventIdExpression(shortId)} AND respondent_kind='account'`,
  )
}

function manualAvailabilityCount(shortId: string): string {
  return postgresScalar(
    `SELECT count(*) FROM postgres_event_responses WHERE event_id=${eventIdExpression(shortId)} AND payload->'manualAvailability' <> '{}'::jsonb`,
  )
}

async function openGroupPage(page: Page, shortId: string): Promise<void> {
  await page.goto(`/g/${shortId}`, { waitUntil: "domcontentloaded" })
  await dismissConsent(page)
  await waitForEventShell(page)
}

async function paintSlots(
  page: Page,
  schedule: GroupSchedule,
  count: number,
): Promise<void> {
  for (let offset = 0; offset < count; offset += 1) {
    const cell = page.locator(
      `#drag-section .timeslot[data-row="${String(schedule.row + offset)}"][data-col="${String(schedule.column)}"]`,
    )
    await cell.scrollIntoViewIfNeeded()
    const box = await cell.boundingBox()
    if (box == null) {
      throw new Error("Expected a paintable timeslot cell to have a box")
    }
    await page.mouse.move(box.x + box.width / 2, box.y + box.height / 2)
    await page.mouse.down()
    await page.mouse.up()
  }
}

test("a signed-in invitee accepts a PostgreSQL group invitation and submits availability", async ({
  page,
  actorContext,
}) => {
  const name = uniqueName("Group accept")
  await signInNewAccount(page.request, "group-owner")
  const invitee = await actorContext("invitee")
  const { email: inviteeEmail } = await signInNewAccount(
    invitee.request,
    "group-invitee",
  )
  const { shortId, schedule } = await seedGroup(page.request, {
    name,
    attendees: [inviteeEmail],
  })

  const inviteePage = await invitee.newPage()
  await openGroupPage(inviteePage, shortId)

  await test.step("the invitee sees the invitation and accepts it", async () => {
    await expect(
      inviteePage.getByText(
        `Accept invitation to share your calendar availability with "${name}"?`,
      ),
    ).toBeVisible()
    await inviteePage
      .getByRole("button", { name: "Accept Invitation", exact: true })
      .click()
    await expect
      .poll(() => attendeeDeclined(shortId, inviteeEmail))
      .toBe("false")
    await expect.poll(() => accountResponseCount(shortId)).toBe("1")
  })

  await test.step("the invitee paints and saves availability", async () => {
    await inviteePage.locator("#desktop-primary-availability-btn").click()
    await paintSlots(inviteePage, schedule, 2)
    const saved = inviteePage.waitForResponse(
      (response) =>
        response.request().method() === "POST" &&
        new URL(response.url()).pathname.endsWith("/response"),
    )
    await inviteePage.locator(".desktop-editing-save-button").click()
    expect((await saved).status()).toBe(200)
    await expect.poll(() => manualAvailabilityCount(shortId)).toBe("1")
  })

  await test.step("the availability survives a reload", async () => {
    await openGroupPage(inviteePage, shortId)
    await expect(
      inviteePage.getByText(
        `Accept invitation to share your calendar availability with "${name}"?`,
      ),
    ).toHaveCount(0)
    await expect(
      inviteePage.locator("#desktop-primary-availability-btn"),
    ).toContainText("Edit availability")
    await expect.poll(() => accountResponseCount(shortId)).toBe("1")
    await expect.poll(() => manualAvailabilityCount(shortId)).toBe("1")
  })
})

test("an invitee declines and rejoins a PostgreSQL availability group", async ({
  page,
  actorContext,
}) => {
  const name = uniqueName("Group decline")
  await signInNewAccount(page.request, "group-owner")
  const invitee = await actorContext("invitee")
  const { email: inviteeEmail } = await signInNewAccount(
    invitee.request,
    "group-invitee",
  )
  const { shortId } = await seedGroup(page.request, {
    name,
    attendees: [inviteeEmail],
  })

  const inviteePage = await invitee.newPage()
  await openGroupPage(inviteePage, shortId)

  await test.step("the invitee rejects the invitation", async () => {
    await inviteePage
      .getByRole("button", { name: "Reject invitation", exact: true })
      .click()
    await inviteePage
      .getByRole("button", { name: "I'm sure", exact: true })
      .click()
    await expect
      .poll(() => attendeeDeclined(shortId, inviteeEmail))
      .toBe("true")
  })

  await test.step("the invitee rejoins by accepting on the next visit", async () => {
    await openGroupPage(inviteePage, shortId)
    await inviteePage
      .getByRole("button", { name: "Accept Invitation", exact: true })
      .click()
    await expect
      .poll(() => attendeeDeclined(shortId, inviteeEmail))
      .toBe("false")
    await expect.poll(() => accountResponseCount(shortId)).toBe("1")
  })
})

test("an owner adds a PostgreSQL group member through the edit dialog", async ({
  page,
}) => {
  const name = uniqueName("Group membership")
  await signInNewAccount(page.request, "group-owner")
  const existingMember = uniqueEmail("group-member")
  const addedMember = uniqueEmail("group-added")
  const { shortId } = await seedGroup(page.request, {
    name,
    attendees: [existingMember],
  })

  await openGroupPage(page, shortId)
  await expect(page.getByText(existingMember, { exact: true })).toBeVisible()

  await page.locator("#edit-event-btn").click()
  const membersField = page.getByTestId("email-input-combobox")
  await membersField.locator(".v-field").click()
  const memberInput = membersField.locator("input").last()
  await memberInput.fill(addedMember)
  await memberInput.press("Enter")

  const saved = page.waitForResponse(
    (response) =>
      response.request().method() === "PUT" &&
      new URL(response.url()).pathname.includes("/api/events/"),
  )
  await page.getByRole("button", { name: "Save edits", exact: true }).click()
  expect((await saved).status()).toBe(200)

  await expect.poll(() => attendeeCount(shortId)).toBe("3")
  await expect.poll(() => attendeeDeclined(shortId, addedMember)).toBe("false")
})

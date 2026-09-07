import { expect, test, type Page } from "@playwright/test"
import {
  buildSpecificDateSeed,
  openEventPage,
  seedCanonicalTimedEvent,
} from "./helpers/timed-event-helpers"
import { Temporal } from "temporal-polyfill"

test.describe.configure({ mode: "serial" })

async function expectNoBottomBarOptionsButton(page: Page) {
  const cancelButton = page.locator(".mobile-editing-cancel-button")
  await expect(cancelButton).toBeVisible()
  const actionsRow = cancelButton.locator("..")
  await expect(
    actionsRow.getByRole("button", { name: "Options", exact: true }),
  ).toHaveCount(0)
}

test("mobile editing with no responses shows Collapse disabled times in row 2 and no Options button", async ({
  page,
  request,
}, testInfo) => {
  test.skip(
    testInfo.project.name !== "chromium-mobile",
    "Mobile editing toolbar layout assertions",
  )

  const now = Temporal.Now.instant()
  const today = now.toZonedDateTimeISO("UTC").toPlainDate().toString()

  const seed = await seedCanonicalTimedEvent(
    request,
    buildSpecificDateSeed({
      name: `Mobile no responses edit ${String(now.epochMilliseconds)}`,
      selectedDays: [today],
      activeSlots: [`${today}T09:00:00.000Z`, `${today}T10:00:00.000Z`],
      eventTimezone: "UTC",
      startTimeLocal: "09:00",
      endTimeLocal: "17:00",
      timeIncrementMinutes: 60,
    }),
  )

  await openEventPage(page, seed.shortId)

  // Row 2 shows the inline Collapse disabled times switch above the grid.
  const collapseDisabledTimesToggle = page.locator(
    "#mobile-collapse-disabled-times-toggle",
  )
  await expect(collapseDisabledTimesToggle).toBeVisible()

  const gridRow = page.locator(".schedule-overlap-time-grid__body-row").first()
  await expect(gridRow).toBeVisible()
  const toggleBox = await collapseDisabledTimesToggle.boundingBox()
  const gridBox = await gridRow.boundingBox()
  if (toggleBox === null || gridBox === null) {
    throw new Error(
      "Expected the Collapse disabled times toggle and grid to have boxes",
    )
  }
  expect(toggleBox.y + toggleBox.height).toBeLessThanOrEqual(gridBox.y)

  // Enter editing through the bottom-bar availability action.
  await page.locator("#mobile-primary-availability-btn").click()
  await page.getByRole("button", { name: "Manually", exact: true }).click()

  await expect(page.locator(".mobile-editing-cancel-button")).toBeVisible()
  await expect(page.locator(".mobile-editing-save-button")).toBeVisible()

  // The toggle stays in the toolbar row 2 while editing, and the bottom bar
  // has no Options button next to Cancel/Save.
  await expect(collapseDisabledTimesToggle).toBeVisible()
  await expectNoBottomBarOptionsButton(page)
})

test("mobile editing with responses keeps Show best times in row 2 and More options in row 3 and no Options button", async ({
  page,
  request,
}, testInfo) => {
  test.skip(
    testInfo.project.name !== "chromium-mobile",
    "Mobile editing toolbar layout assertions",
  )

  const now = Temporal.Now.instant()
  const today = now.toZonedDateTimeISO("UTC").toPlainDate().toString()

  const seed = await seedCanonicalTimedEvent(
    request,
    buildSpecificDateSeed({
      name: `Mobile responses edit ${String(now.epochMilliseconds)}`,
      selectedDays: [today],
      activeSlots: [`${today}T09:00:00.000Z`, `${today}T10:00:00.000Z`],
      eventTimezone: "UTC",
      startTimeLocal: "09:00",
      endTimeLocal: "17:00",
      timeIncrementMinutes: 60,
    }),
  )

  const guestResponse = await request.post(
    `/api/events/${seed.eventId}/response`,
    {
      data: {
        guest: true,
        name: "Mobile Editing Guest",
        email: "",
        availability: [`${today}T09:00:00.000Z`, `${today}T10:00:00.000Z`],
        ifNeeded: [],
        guestEditPolicy: "open",
      },
    },
  )
  expect(guestResponse.ok()).toBeTruthy()
  const guestBody = (await guestResponse.json()) as {
    guestCredentials?: {
      name?: string
      guestId: string
      guestEditToken: string
      guestEditPolicy: string
      guestOwnershipMode: string
    }
  }
  const guestCredentials = guestBody.guestCredentials
  if (guestCredentials == null || guestCredentials.guestId.length === 0) {
    throw new Error("Expected the guest response to return credentials")
  }

  const seededEvent = await request.get(`/api/events/${seed.shortId}`)
  expect(seededEvent.ok()).toBeTruthy()
  const seededEventBody = (await seededEvent.json()) as { _id?: string }
  const eventMongoId = seededEventBody._id
  if (eventMongoId == null || eventMongoId.length === 0) {
    throw new Error("Expected the seeded event to expose its Mongo id")
  }

  await page.addInitScript(
    ({ eventId, guestCredentials }) => {
      const record = {
        name: guestCredentials.name ?? "Mobile Editing Guest",
        guestId: guestCredentials.guestId,
        guestEditToken: guestCredentials.guestEditToken,
        guestEditPolicy: guestCredentials.guestEditPolicy,
        guestOwnershipMode: guestCredentials.guestOwnershipMode,
        lookupKey: guestCredentials.guestId,
        lastUsedAt: Temporal.Now.instant().epochMilliseconds,
      }
      localStorage.setItem(
        `${eventId}.guestOwnershipCollection`,
        JSON.stringify({
          version: 1,
          selectedLookupKey: record.guestId,
          records: [record],
        }),
      )
    },
    { eventId: eventMongoId, guestCredentials },
  )

  await openEventPage(page, seed.shortId)

  // Row 2: Show best times. Row 3: More options.
  const bestTimesToggle = page.locator(".v-switch", {
    has: page.locator("#mobile-show-best-times-toggle"),
  })
  await expect(bestTimesToggle).toBeVisible()
  const moreOptionsButton = page
    .locator("#event-options-menu-activator")
    .first()
  await expect(moreOptionsButton).toBeVisible()

  // Enter editing through the bottom-bar availability action.
  await page.locator("#mobile-primary-availability-btn").click()
  await expect(page.locator(".mobile-editing-cancel-button")).toBeVisible()
  await expect(page.locator(".mobile-editing-save-button")).toBeVisible()

  // Both rows stay in the toolbar while editing, and the bottom bar has no
  // Options button next to Cancel/Save.
  await expect(bestTimesToggle).toBeVisible()
  await expect(moreOptionsButton).toBeVisible()
  await expectNoBottomBarOptionsButton(page)

  // The bottom action bar buttons share edges with the elevated panel above:
  // Delete aligns with the left edge of Calendar options, and Save aligns
  // with the right edge of the Available/If needed row.
  const calendarOptionsButton = page.locator(".calendar-options-button")
  const availabilityToggleRow = calendarOptionsButton.locator("xpath=..")
  const deleteButton = page
    .locator(".mobile-event-action-bar")
    .getByRole("button", { name: "Delete" })
  const saveButton = page.locator(".mobile-editing-save-button")
  await expect(calendarOptionsButton).toBeVisible()
  await expect(deleteButton).toBeVisible()
  await expect(saveButton).toBeVisible()
  const [calendarOptionsBox, toggleRowBox, deleteBox, saveBox] =
    await Promise.all([
      calendarOptionsButton.boundingBox(),
      availabilityToggleRow.boundingBox(),
      deleteButton.boundingBox(),
      saveButton.boundingBox(),
    ])
  if (
    calendarOptionsBox === null ||
    toggleRowBox === null ||
    deleteBox === null ||
    saveBox === null
  ) {
    throw new Error("Expected the action bar and editing panel to have boxes")
  }
  expect(Math.abs(deleteBox.x - calendarOptionsBox.x)).toBeLessThanOrEqual(1)
  expect(
    Math.abs(saveBox.x + saveBox.width - (toggleRowBox.x + toggleRowBox.width)),
  ).toBeLessThanOrEqual(1)
})

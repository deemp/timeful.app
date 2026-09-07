import { expect, test, type Page } from "@playwright/test"

test.skip(
  process.env.E2E_POSTGRES_ANONYMOUS_EVENT_CREATION_ENABLED !== "true",
  "requires PostgreSQL anonymous event creation",
)

interface EventIDs {
  shortId: string
  longId: string
}

interface PluginResponse {
  type: string
  command: string
  requestId: string
  ok: boolean
  payload?: {
    slots?: Record<
      string,
      {
        name: string
        availability: string[]
        ifNeeded: string[]
      }
    >
  }
  error?: {
    message: string
  }
}

async function sendPluginMessage(
  page: Page,
  requestId: string,
  payload: Record<string, unknown>,
): Promise<PluginResponse> {
  return page.evaluate(
    async ({ requestId, payload }) => {
      return new Promise<PluginResponse>((resolve, reject) => {
        const timeout = window.setTimeout(() => {
          window.removeEventListener("message", listener)
          reject(
            new Error(`Timed out waiting for plugin response ${requestId}`),
          )
        }, 10_000)
        const listener = (event: MessageEvent<PluginResponse>) => {
          if (
            event.data.type === "FILL_CALENDAR_EVENT_RESPONSE" &&
            event.data.requestId === requestId
          ) {
            window.clearTimeout(timeout)
            window.removeEventListener("message", listener)
            resolve(event.data)
          }
        }
        window.addEventListener("message", listener)
        window.postMessage(
          {
            type: "FILL_CALENDAR_EVENT",
            requestId,
            payload,
          },
          "*",
        )
      })
    },
    { requestId, payload },
  )
}

test("PostgreSQL anonymous poll preserves the plugin slot contract", async ({
  page,
  request,
}) => {
  const created = await request.post("/api/events", {
    data: {
      name: "PostgreSQL plugin contract",
      type: "specific_dates",
      daysOnly: false,
      activeSlots: ["2026-01-05T14:00:00Z", "2026-01-05T14:15:00Z"],
      eventTimezone: "GMT",
      slotGeneration: {
        startTimeLocal: "14:00",
        endTimeLocal: "14:30",
        timeIncrementMinutes: 15,
      },
      timedRecurrence: {
        kind: "specific_dates",
        selectedDays: ["2026-01-05"],
        selectedDaysOfWeek: [],
        startOnMonday: false,
      },
    },
  })
  expect(created.status()).toBe(201)
  const { eventId } = (await created.json()) as { eventId: string }
  expect(eventId).toMatch(/^[0-9A-HJKMNPQRSTVWXYZ]{8}$/)

  const idsResponse = await request.get(`/api/events/${eventId}/ids`)
  expect(idsResponse.status()).toBe(200)
  const ids = (await idsResponse.json()) as EventIDs
  expect(ids).toEqual({ shortId: eventId, longId: eventId })

  const eventLoad = page.waitForResponse(
    (response) =>
      response.url().includes(`/api/events/${ids.shortId}`) &&
      response.status() === 200,
  )
  await page.goto(`/e/${ids.shortId}`)
  await eventLoad

  // The plugin message listener registers at mount, but the ScheduleOverlap
  // time grid mounts later; set-slots validates against the grid's valid time
  // ranges, so wait for the grid itself before posting any plugin message.
  await expect(
    page.getByTestId("schedule-overlap-time-grid-scroller"),
  ).toBeVisible()

  const setResponse = await sendPluginMessage(page, "postgres-set-slots", {
    type: "set-slots",
    timezone: "GMT",
    guestName: "Ada",
    slots: [
      {
        start: "2026-01-05T14:00:00",
        end: "2026-01-05T14:30:00",
        status: "available",
      },
    ],
  })
  expect(setResponse.ok, JSON.stringify(setResponse)).toBe(true)
  expect(setResponse).toMatchObject({
    type: "FILL_CALENDAR_EVENT_RESPONSE",
    command: "set-slots",
    requestId: "postgres-set-slots",
    ok: true,
  })

  const getResponse = await sendPluginMessage(page, "postgres-get-slots", {
    type: "get-slots",
    timezone: "GMT",
  })
  expect(getResponse.ok, JSON.stringify(getResponse)).toBe(true)
  expect(getResponse).toMatchObject({
    type: "FILL_CALENDAR_EVENT_RESPONSE",
    command: "get-slots",
    requestId: "postgres-get-slots",
    ok: true,
  })
  const slots = Object.values(getResponse.payload?.slots ?? {})
  expect(slots).toHaveLength(1)
  expect(slots[0]).toMatchObject({
    name: "Ada",
    ifNeeded: [],
  })
  expect(slots[0]?.availability).toHaveLength(2)
})

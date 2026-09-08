import {
  retainEventVisitorId,
  withEventVisitorIdentity,
} from "./visitorIdentityStorage"
import { _delete, get, put, post } from "@/utils"
import type { Temporal } from "temporal-polyfill"
import type { Event, Response } from "@/types"
import type { RawEvent, RawResponse } from "@/types/transport"
import { fromRawEvent, fromRawResponse } from "@/types/transport"

export async function fetchEventById(eventId: string): Promise<Event> {
  const rawEvent = await get<RawEvent>(
    withEventVisitorIdentity(`/events/${eventId}`),
  )
  const event = fromRawEvent(rawEvent)
  if (event._id && event.eventVisitorId)
    retainEventVisitorId(event._id, event.eventVisitorId)
  return event
}

export async function fetchEventFromPath(path: string): Promise<Event> {
  const rawEvent = await get<RawEvent>(withEventVisitorIdentity(path))
  const event = fromRawEvent(rawEvent)
  if (event._id && event.eventVisitorId)
    retainEventVisitorId(event._id, event.eventVisitorId)
  return event
}

export async function fetchEventResponses(
  url: string,
): Promise<Record<string, Response>> {
  const rawResponses = await get<Record<string, RawResponse>>(
    withEventVisitorIdentity(url),
  )

  return Object.fromEntries(
    Object.entries(rawResponses).map(([userId, rawResponse]) => [
      userId,
      fromRawResponse(rawResponse),
    ]),
  )
}

export async function saveTimefulSchedule(
  eventId: string,
  range: { startDate: Temporal.ZonedDateTime; endDate: Temporal.ZonedDateTime },
): Promise<void> {
  await put(`/events/${eventId}/schedule`, {
    startDate: range.startDate.toInstant().toString(),
    endDate: range.endDate.toInstant().toString(),
  })
}

export async function clearTimefulSchedule(eventId: string): Promise<void> {
  await _delete(`/events/${eventId}/schedule`)
}

export async function createEventAtBoundary(payload: unknown) {
  const result = await post<{
    eventId: string
    shortId?: string
    eventVisitorId?: string
  }>("/events", payload)
  if (result.eventVisitorId)
    retainEventVisitorId(result.eventId, result.eventVisitorId)
  return result
}

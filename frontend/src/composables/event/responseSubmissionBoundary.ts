import type { Temporal } from "temporal-polyfill"
import type { CalendarOptions } from "@/composables/schedule_overlap/types"
import type { ZdtMap, ZdtSet } from "@/utils"
import type { SharedCalendarAccounts } from "@/composables/schedule_overlap/types"
import { generateEnabledCalendarsPayload } from "@/utils"
import type { RawCalendarOptions } from "@/types/transport"
import {
  toRawCalendarOptions,
  toTransportDateTimeStrings,
} from "@/types/transport"
import { validateGuestName } from "@/utils/guestName"
import { normalizeTimedResponseSlots } from "@/utils/timedResponseSlots"

interface GuestPayload {
  name: string
  email?: string
  guestId?: string
  guestEditToken?: string
  guestEditPolicy?: "protected" | "open"
}

export interface EventResponseSubmissionPayload {
  availability: Temporal.ZonedDateTime[]
  ifNeeded: Temporal.ZonedDateTime[]
  guest: boolean
  name?: string
  email?: string
  guestId?: string
  guestEditToken?: string
  guestEditPolicy?: "protected" | "open"
}

export interface EncodedEventResponseSubmissionPayload {
  availability: string[]
  ifNeeded: string[]
  guest: boolean
  name?: string
  email?: string
  guestId?: string
  guestEditToken?: string
  guestEditPolicy?: "protected" | "open"
}

export interface GuestResponseCredentials {
  name?: string
  guestId: string
  guestEditToken: string
  guestEditPolicy: "protected" | "open"
  guestOwnershipMode: "token"
}

export interface GuestResponseMutationResult {
  guestCredentials?: GuestResponseCredentials
}

export interface GroupResponseSubmissionPayload extends GroupAvailabilityPayloadBase {
  manualAvailability: Record<string, number[]>
  calendarOptions: RawCalendarOptions
}

export interface SignUpBlockResponseSubmissionPayload {
  guest: boolean
  signUpBlockIds: string[]
  name?: string
  email?: string
}

export interface GroupAvailabilityPayloadBase {
  guest: boolean
  useCalendarAvailability: boolean
  enabledCalendars: Record<string, string[]>
}

export function toEventResponseSubmissionPayload(input: {
  availability: Temporal.ZonedDateTime[]
  ifNeeded: Temporal.ZonedDateTime[]
  authUserId?: string
  addingAvailabilityAsGuest: boolean
  guestPayload: GuestPayload
}): EventResponseSubmissionPayload {
  const normalizedSlots = normalizeTimedResponseSlots({
    availability: input.availability,
    ifNeeded: input.ifNeeded,
  })

  if (input.authUserId && !input.addingAvailabilityAsGuest) {
    return {
      availability: normalizedSlots.availability,
      ifNeeded: normalizedSlots.ifNeeded,
      guest: false,
    }
  }

  const guestName = validateGuestName(input.guestPayload.name).normalizedName

  return {
    availability: normalizedSlots.availability,
    ifNeeded: normalizedSlots.ifNeeded,
    guest: true,
    name: guestName,
    email: input.guestPayload.email,
    guestId: input.guestPayload.guestId,
    guestEditToken: input.guestPayload.guestEditToken,
    guestEditPolicy: input.guestPayload.guestEditPolicy,
  }
}

export function toGroupResponseSubmissionPayload(input: {
  sharedCalendarAccounts: SharedCalendarAccounts
  manualAvailability: ZdtMap<ZdtSet>
  calendarOptions: CalendarOptions
}): GroupResponseSubmissionPayload {
  const payload = {
    ...generateEnabledCalendarsPayload(input.sharedCalendarAccounts),
  } as GroupAvailabilityPayloadBase & GroupResponseSubmissionPayload
  const encodedManualAvailability: Record<string, number[]> = {}

  for (const [day, instants] of input.manualAvailability.entries()) {
    encodedManualAvailability[day.toString()] = [...instants].map(
      (instant) => instant.epochMilliseconds,
    )
  }

  payload.manualAvailability = encodedManualAvailability
  payload.calendarOptions = toRawCalendarOptions(input.calendarOptions)

  return payload
}

export function encodeEventResponseSubmissionPayload(
  payload: EventResponseSubmissionPayload,
): EncodedEventResponseSubmissionPayload {
  const guestName = validateGuestName(payload.name).normalizedName
  const normalizedSlots = normalizeTimedResponseSlots({
    availability: payload.availability,
    ifNeeded: payload.ifNeeded,
  })

  return {
    availability:
      toTransportDateTimeStrings(normalizedSlots.availability) ?? [],
    ifNeeded: toTransportDateTimeStrings(normalizedSlots.ifNeeded) ?? [],
    guest: payload.guest,
    name: guestName,
    email: payload.email,
    guestId: payload.guestId,
    guestEditToken: payload.guestEditToken,
    guestEditPolicy: payload.guestEditPolicy,
  }
}

export function toSignUpBlockResponseSubmissionPayload(input: {
  signUpBlockId: string
  authUserId?: string
  guestPayload: GuestPayload
}): SignUpBlockResponseSubmissionPayload {
  if (input.authUserId) {
    return {
      guest: false,
      signUpBlockIds: [input.signUpBlockId],
    }
  }

  const guestName = validateGuestName(input.guestPayload.name).normalizedName

  return {
    guest: true,
    signUpBlockIds: [input.signUpBlockId],
    name: guestName,
    email: input.guestPayload.email,
  }
}

export function encodeVisitorResponseSubmission(input: {
  availability: Temporal.ZonedDateTime[]
  ifNeeded: Temporal.ZonedDateTime[]
  responseId?: string
  name: string
  email?: string
}) {
  const slots = normalizeTimedResponseSlots(input)
  return {
    availability: toTransportDateTimeStrings(slots.availability),
    ifNeeded: toTransportDateTimeStrings(slots.ifNeeded),
    responseId: input.responseId,
    createResponse: !input.responseId,
    name: validateGuestName(input.name).normalizedName,
    email: input.email,
  }
}

export interface VisitorGroupResponseSubmissionPayload
  extends
    ReturnType<typeof encodeVisitorResponseSubmission>,
    GroupAvailabilityPayloadBase {
  manualAvailability: Record<string, number[]>
  calendarOptions: RawCalendarOptions
}

// encodeVisitorGroupResponseSubmission keeps the explicit-selection visitor
// contract and adds the availability-group manual availability and
// calendar-derived fields so PostgreSQL group responses persist the same data as
// legacy group responses.
export function encodeVisitorGroupResponseSubmission(input: {
  availability: Temporal.ZonedDateTime[]
  ifNeeded: Temporal.ZonedDateTime[]
  responseId?: string
  name: string
  email?: string
  sharedCalendarAccounts: SharedCalendarAccounts
  manualAvailability: ZdtMap<ZdtSet>
  calendarOptions: CalendarOptions
}): VisitorGroupResponseSubmissionPayload {
  const groupPayload = toGroupResponseSubmissionPayload({
    sharedCalendarAccounts: input.sharedCalendarAccounts,
    manualAvailability: input.manualAvailability,
    calendarOptions: input.calendarOptions,
  })
  return {
    ...encodeVisitorResponseSubmission(input),
    ...groupPayload,
  }
}

export interface VisitorSignUpResponseSubmissionPayload {
  responseId?: string
  createResponse: boolean
  signUpBlockIds: string[]
  name?: string
  email?: string
}

// encodeVisitorSignUpResponseSubmission maps a sign-up block selection onto the
// PostgreSQL explicit-selection contract: a new response carries
// createResponse=true, and any later submission carries the target responseId so
// the server edits instead of overwriting by name.
export function encodeVisitorSignUpResponseSubmission(input: {
  responseId?: string
  signUpBlockId: string
  name?: string
  email?: string
}): VisitorSignUpResponseSubmissionPayload {
  return {
    responseId: input.responseId,
    createResponse: !input.responseId,
    signUpBlockIds: [input.signUpBlockId],
    name: input.name ? validateGuestName(input.name).normalizedName : undefined,
    email: input.email,
  }
}

import { FetchError, post } from "@/utils/fetch_utils"
import type { RawAccessTransfer } from "@/types/transport"

export interface AccessTransfer {
  revocable: boolean
  id: string
  state: string
  requestId: string
  code: string
  requests: { id: string; code: string }[]
  confirmationRequired: boolean
}

export function decodeTransfer(raw: RawAccessTransfer): AccessTransfer {
  return {
    revocable: raw.revocable === true,
    id: raw.id ?? "",
    state: raw.state ?? "pending",
    requestId: raw.requestId ?? "",
    code: raw.code ?? "",
    requests: (raw.requests ?? []).map(({ id, code }) => ({ id, code })),
    confirmationRequired: raw.confirmationRequired === true,
  }
}

export async function createTransfer(eventId: string) {
  return decodeTransfer(
    await post<RawAccessTransfer>(`/events/${eventId}/transfers`),
  )
}

export async function transferAction(
  eventId: string,
  transferId: string,
  action: "open" | "status" | "approve" | "redeem" | "cancel" | "revoke",
  payload?: {
    requestId?: string
    code?: string
    confirmAccountSwitch?: boolean
  },
) {
  return decodeTransfer(
    await post<RawAccessTransfer>(
      `/events/${eventId}/transfers/${transferId}/${action}`,
      payload ?? {},
    ),
  )
}

export function requiresAccountSwitch(error: unknown): boolean {
  return (
    error instanceof FetchError &&
    error.status === 409 &&
    typeof error.parsed === "object" &&
    error.parsed !== null &&
    "accountSwitchRequired" in error.parsed &&
    error.parsed.accountSwitchRequired === true
  )
}

export async function grantAssociation(eventId: string, confirm = false) {
  return decodeTransfer(
    await post<RawAccessTransfer>(`/events/${eventId}/grant-association`, {
      confirm,
    }),
  )
}

export function matchingRequest(transfer: AccessTransfer, code: string) {
  return transfer.requests.find(
    (request) => request.code === code.trim().toUpperCase(),
  )
}

export function savedTransfers(eventId: string): string[] {
  try {
    const value: unknown = JSON.parse(
      localStorage.getItem(`timeful.transfers.${eventId}`) ?? "[]",
    )
    return Array.isArray(value)
      ? value.filter((id): id is string => typeof id === "string")
      : []
  } catch {
    return []
  }
}
export function rememberTransfer(eventId: string, id: string) {
  try {
    localStorage.setItem(
      `timeful.transfers.${eventId}`,
      JSON.stringify([...savedTransfers(eventId), id]),
    )
  } catch {
    /* The current dialog still retains the transfer. */
  }
}

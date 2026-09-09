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

export interface SavedTransfer {
  id: string
  number: number
}

interface TransferStorage {
  nextNumber: number
  transfers: SavedTransfer[]
}

function readTransferStorage(eventId: string): TransferStorage {
  try {
    const value: unknown = JSON.parse(
      localStorage.getItem(`timeful.transfers.${eventId}`) ?? "[]",
    )
    const legacy = Array.isArray(value)
    const raw: unknown[] = legacy
      ? value.map((id: unknown, index) => ({ id, number: index + 1 }))
      : value &&
          typeof value === "object" &&
          "transfers" in value &&
          Array.isArray(value.transfers)
        ? value.transfers
        : []
    const transfers: SavedTransfer[] = []
    for (const entry of raw) {
      if (
        entry &&
        typeof entry === "object" &&
        "id" in entry &&
        typeof entry.id === "string" &&
        entry.id &&
        "number" in entry &&
        typeof entry.number === "number" &&
        Number.isSafeInteger(entry.number) &&
        entry.number > 0 &&
        !transfers.some(({ id }) => id === entry.id)
      ) {
        transfers.push({ id: entry.id, number: entry.number })
      }
    }
    const storedNext =
      value && typeof value === "object" && "nextNumber" in value
        ? value.nextNumber
        : 1
    const nextNumber =
      typeof storedNext === "number" &&
      Number.isSafeInteger(storedNext) &&
      storedNext > 0
        ? storedNext
        : 1
    return {
      transfers,
      nextNumber: transfers.reduce(
        (next, entry) => Math.max(next, entry.number + 1),
        nextNumber,
      ),
    }
  } catch {
    return { nextNumber: 1, transfers: [] }
  }
}
function writeTransferStorage(eventId: string, storage: TransferStorage) {
  try {
    localStorage.setItem(
      `timeful.transfers.${eventId}`,
      JSON.stringify(storage),
    )
  } catch {
    /* The current dialog still retains the transfer. */
  }
}

export function savedTransfers(eventId: string): SavedTransfer[] {
  return readTransferStorage(eventId).transfers
}

export function rememberTransfer(eventId: string, id: string): SavedTransfer {
  const storage = readTransferStorage(eventId)
  const existing = storage.transfers.find((entry) => entry.id === id)
  if (existing) return existing
  const entry = { id, number: storage.nextNumber++ }
  storage.transfers.push(entry)
  writeTransferStorage(eventId, storage)
  return entry
}

export function forgetTransfer(eventId: string, id: string) {
  const storage = readTransferStorage(eventId)
  storage.transfers = storage.transfers.filter((entry) => entry.id !== id)
  writeTransferStorage(eventId, storage)
}

export function isTransferUnavailable(error: unknown): boolean {
  return (
    error instanceof FetchError &&
    (error.status === 403 || error.status === 404)
  )
}

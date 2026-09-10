import type { Event } from "@/types"

const postgresShortIdPattern = /^[0-9A-HJKMNPQRSTVWXYZ]{8}$/

// Canonical public identifier used to open an event. PostgreSQL events carry
// their bare short identifier in _id; MongoDB events keep a namespaced m_ link
// so the server routes them to the legacy store.
export function eventPublicId(event: Pick<Event, "_id" | "shortId">): string {
  const storageId = event._id ?? ""
  if (postgresShortIdPattern.test(storageId)) {
    return storageId
  }

  return `m_${event.shortId ?? storageId}`
}

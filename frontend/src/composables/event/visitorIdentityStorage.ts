import { ref } from "vue"

const prefix = "timeful.eventVisitor."
const selectionVersion = ref(0)

export function readEventVisitorId(eventId: string): string | undefined {
  try {
    return localStorage.getItem(`${prefix}${eventId}`) ?? undefined
  } catch {
    return undefined
  }
}

export function retainEventVisitorId(eventId: string, eventVisitorId: string) {
  try {
    localStorage.setItem(`${prefix}${eventId}`, eventVisitorId)
  } catch {
    // The HttpOnly cookie still supports this browser session.
  }
}

export function browserEventVisitorIdentities() {
  const identities: { eventId: string; eventVisitorId: string }[] = []
  try {
    for (let i = 0; i < localStorage.length; i++) {
      const key = localStorage.key(i)
      if (!key?.startsWith(prefix)) continue
      const eventVisitorId = localStorage.getItem(key)
      if (eventVisitorId)
        identities.push({ eventId: key.slice(prefix.length), eventVisitorId })
    }
  } catch {
    return identities
  }
  return identities
}

export function withEventVisitorIdentity(path: string): string {
  const eventId = /^\/events\/([^/?]+)/.exec(path)?.[1]
  const identity = eventId ? readEventVisitorId(eventId) : undefined
  if (!identity) return path
  return `${path}${path.includes("?") ? "&" : "?"}eventVisitorId=${encodeURIComponent(identity)}`
}

export function selectedVisitorResponse(eventId: string): string | undefined {
  void selectionVersion.value
  try {
    return (
      localStorage.getItem(`timeful.selectedResponse.${eventId}`) ?? undefined
    )
  } catch {
    return undefined
  }
}

export function selectVisitorResponse(eventId: string, responseId?: string) {
  try {
    const key = `timeful.selectedResponse.${eventId}`
    if (responseId) localStorage.setItem(key, responseId)
    else localStorage.removeItem(key)
  } catch {
    // Storage may be unavailable in a restricted browser.
  } finally {
    selectionVersion.value++
  }
}

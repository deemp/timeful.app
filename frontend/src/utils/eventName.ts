export const EVENT_NAME_MAX_LENGTH = 100

export type EventNameValidationCode = "required" | "tooLong"

export interface EventNameValidationResult {
  code?: EventNameValidationCode
  normalizedName?: string
}

export function validateEventName(
  name?: string | null,
): EventNameValidationResult {
  if (typeof name !== "string" || name.trim().length === 0) {
    return { code: "required" }
  }

  if (name.length > EVENT_NAME_MAX_LENGTH) {
    return { code: "tooLong" }
  }

  return { normalizedName: name.trim() }
}

export function getEventNameValidationMessage(
  code?: EventNameValidationCode,
): string | undefined {
  switch (code) {
    case "required":
      return "Event name must be non-empty"
    case "tooLong":
      return `Event name must be ${EVENT_NAME_MAX_LENGTH} characters or fewer`
    default:
      return undefined
  }
}

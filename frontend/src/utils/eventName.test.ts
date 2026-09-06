import { describe, expect, it } from "vitest"
import {
  EVENT_NAME_MAX_LENGTH,
  getEventNameValidationMessage,
  validateEventName,
} from "./eventName"

describe("eventName validation", () => {
  it("reports required for empty, whitespace-only, and missing names", () => {
    expect(validateEventName("").code).toBe("required")
    expect(validateEventName("   ").code).toBe("required")
    expect(validateEventName("\t\n").code).toBe("required")
    expect(validateEventName(null).code).toBe("required")
    expect(validateEventName(undefined).code).toBe("required")
  })

  it("accepts non-empty names and returns the trimmed name", () => {
    expect(validateEventName("Planning sync").normalizedName).toBe(
      "Planning sync",
    )
    expect(validateEventName("  Planning sync  ").normalizedName).toBe(
      "Planning sync",
    )
    expect(validateEventName("Planning sync").code).toBeUndefined()
  })

  it("reports tooLong only past the maximum length", () => {
    expect(
      validateEventName("a".repeat(EVENT_NAME_MAX_LENGTH)).code,
    ).toBeUndefined()
    expect(validateEventName("a".repeat(EVENT_NAME_MAX_LENGTH + 1)).code).toBe(
      "tooLong",
    )
    expect(
      validateEventName(`a`.repeat(EVENT_NAME_MAX_LENGTH) + "  ").code,
    ).toBe("tooLong")
  })

  it("returns a specific message for each failure mode", () => {
    expect(getEventNameValidationMessage("required")).toBe(
      "Event name must be non-empty",
    )
    expect(getEventNameValidationMessage("tooLong")).toBe(
      "Event name must be 100 characters or fewer",
    )
    expect(getEventNameValidationMessage(undefined)).toBeUndefined()
  })
})

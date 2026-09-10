import { describe, expect, it } from "vitest"
import { eventPublicId } from "./eventIdentity"

describe("eventPublicId", () => {
  it("returns the bare short identifier for a PostgreSQL event", () => {
    expect(eventPublicId({ _id: "7Q2M4XKP", shortId: "7Q2M4XKP" })).toBe(
      "7Q2M4XKP",
    )
  })

  it("namespaces a MongoDB event by its short identifier", () => {
    expect(
      eventPublicId({
        _id: "64f5e4d3c2b1a09876543210",
        shortId: "7Q2M4XKP",
      }),
    ).toBe("m_7Q2M4XKP")
  })

  it("falls back to the storage identifier when no short identifier exists", () => {
    expect(eventPublicId({ _id: "64f5e4d3c2b1a09876543210" })).toBe(
      "m_64f5e4d3c2b1a09876543210",
    )
  })

  it("does not treat a 24-character MongoDB identifier as a PostgreSQL id", () => {
    expect(eventPublicId({ _id: "64f5e4d3c2b1a09876543210" })).not.toBe(
      "64f5e4d3c2b1a09876543210",
    )
  })
})

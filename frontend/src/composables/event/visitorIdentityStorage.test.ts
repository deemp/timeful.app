import { createLocalStorageMock } from "@/test/localStorage"
import { beforeEach, describe, expect, it } from "vitest"
import { computed } from "vue"
import {
  browserEventVisitorIdentities,
  readEventVisitorId,
  retainEventVisitorId,
  selectedVisitorResponse,
  selectVisitorResponse,
  withEventVisitorIdentity,
} from "./visitorIdentityStorage"
import { useScheduleOverlapPreferences } from "@/components/schedule_overlap/useScheduleOverlapPreferences"
import { canGuestEditResponse } from "@/composables/schedule_overlap/useScheduleOverlapUI"
import { ZdtSet } from "@/utils"

describe("Event Visitor Identity storage and response selection", () => {
  beforeEach(() => {
    globalThis.localStorage = createLocalStorageMock()
  })
  it("retains a public identity independently of response selection and legacy guest credentials", () => {
    localStorage.setItem("ABCD1234.guestOwnershipCollection", "legacy")
    retainEventVisitorId("ABCD1234", "visitor-public-id")
    selectVisitorResponse("ABCD1234", "response-one")
    expect(selectedVisitorResponse("ABCD1234")).toBe("response-one")
    selectVisitorResponse("ABCD1234")
    expect(readEventVisitorId("ABCD1234")).toBe("visitor-public-id")
    expect(browserEventVisitorIdentities()).toEqual([
      { eventId: "ABCD1234", eventVisitorId: "visitor-public-id" },
    ])
    expect(localStorage.getItem("ABCD1234.guestOwnershipCollection")).toBe(
      "legacy",
    )
    expect(
      withEventVisitorIdentity("/events/ABCD1234/responses?timeMin=now"),
    ).toBe(
      "/events/ABCD1234/responses?timeMin=now&eventVisitorId=visitor-public-id",
    )
    expect(withEventVisitorIdentity("/events/m_legacy/response")).toBe(
      "/events/m_legacy/response",
    )
  })
  it("selects multiple same-name responses by public ID and trusts server edit permission", () => {
    const prefs = useScheduleOverlapPreferences({
      eventId: computed(() => "ABCD1234"),
      event: computed(() => ({
        eventVisitorId: "visitor",
        responses: {
          one: { publicId: "one", canEdit: true, name: "Ada" },
          two: { publicId: "two", canEdit: true, name: "Ada" },
          other: { publicId: "other", canEdit: false, name: "Ada" },
        },
      })),
    })
    expect(prefs.ownedGuestResponses.value.map((row) => row.lookupKey)).toEqual(
      ["one", "two"],
    )
    prefs.selectGuestOwnership("two")
    expect(prefs.guestResponseLookupKey.value).toBe("two")
    prefs.clearSelectedGuestOwnership()
    expect(prefs.guestResponseLookupKey.value).toBeUndefined()
    expect(localStorage.getItem("ABCD1234.guestOwnershipCollection")).toBeNull()
    expect(
      canGuestEditResponse(
        {
          publicId: "other",
          canEdit: false,
          guest: true,
          user: { _id: "other" },
          availability: new ZdtSet(),
        },
        new Set(["other"]),
      ),
    ).toBe(false)
  })
})

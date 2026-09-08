import { computed } from "vue"
import { describe, expect, it } from "vitest"
import { Temporal } from "temporal-polyfill"
import { UTC } from "@/constants"
import { ZdtSet } from "@/utils"
import type { TimedCellState } from "@/composables/schedule_overlap/types"
import {
  respondentStatusClass,
  useRespondentsListState,
} from "./useRespondentsListState"

const baseSlot = Temporal.Instant.from(
  "2026-01-01T09:00:00Z",
).toZonedDateTimeISO(UTC)
const otherSlot = Temporal.Instant.from(
  "2026-01-01T10:00:00Z",
).toZonedDateTimeISO(UTC)

function makeState(options: {
  active?: Temporal.ZonedDateTime
  inactive?: boolean
  cellState?: TimedCellState | null
  collapsed?: boolean
  availability?: Temporal.ZonedDateTime[]
  ifNeeded?: Temporal.ZonedDateTime[]
  hideIfNeeded?: boolean
}) {
  const parsedResponses = {
    "user-1": {
      user: { _id: "user-1", firstName: "Ada" } as never,
      availability: new ZdtSet(options.availability ?? []),
      ifNeeded: new ZdtSet(options.ifNeeded ?? []),
      guest: false,
    },
  }
  return useRespondentsListState({
    event: { blindAvailabilityEnabled: false },
    respondents: computed(() => [parsedResponses["user-1"].user]),
    curRespondents: computed(() => []),
    curTimeslotAvailability: computed(() => ({ "user-1": false })),
    curTimeslotInactive: computed(() => options.inactive ?? false),
    curTimeslotCellState: computed(() => options.cellState ?? null),
    curTimeslotCollapsed: computed(() => options.collapsed ?? false),
    parsedResponses: computed(() => parsedResponses),
    curDate: computed(() => options.active ?? undefined),
    hideIfNeeded: computed(() => options.hideIfNeeded ?? false),
    isGroup: computed(() => false),
    attendees: computed(() => []),
    isOwner: computed(() => false),
    isPhone: computed(() => false),
  })
}

describe("useRespondentsListState respondentSlotStatus", () => {
  it("returns null when no slot is in context", () => {
    const state = makeState({})
    expect(state.respondentSlotStatus("user-1")).toBeNull()
  })

  it("returns available when the active slot is in the respondent availability", () => {
    const state = makeState({
      active: baseSlot,
      availability: [baseSlot],
      ifNeeded: [baseSlot],
    })
    expect(state.respondentSlotStatus("user-1")).toBe("available")
  })

  it("returns if-needed when the active slot only matches the if-needed set", () => {
    const state = makeState({ active: baseSlot, ifNeeded: [baseSlot] })
    expect(state.respondentSlotStatus("user-1")).toBe("if-needed")
  })

  it("returns unavailable when the active slot is in neither set", () => {
    const state = makeState({ active: otherSlot })
    expect(state.respondentSlotStatus("user-1")).toBe("unavailable")
  })

  it("returns disabled-inactive when hovering an enabled-inactive cell", () => {
    const state = makeState({
      inactive: true,
      cellState: "enabled_inactive",
      active: baseSlot,
    })
    expect(state.respondentSlotStatus("user-1")).toBe("disabled-inactive")
  })

  it("returns disabled-collapsed when hovering collapsed hours", () => {
    const state = makeState({
      collapsed: true,
      inactive: true,
      cellState: "enabled_inactive",
      active: baseSlot,
    })
    expect(state.respondentSlotStatus("user-1")).toBe("disabled-collapsed")
  })

  it("returns disabled-out-of-range for any other inactive cell state", () => {
    const outsideRange = makeState({
      inactive: true,
      cellState: "outside_range",
    })
    expect(outsideRange.respondentSlotStatus("user-1")).toBe(
      "disabled-out-of-range",
    )

    const padding = makeState({ inactive: true, cellState: "padding" })
    expect(padding.respondentSlotStatus("user-1")).toBe("disabled-out-of-range")

    const unknown = makeState({ inactive: true, cellState: null })
    expect(unknown.respondentSlotStatus("user-1")).toBe("disabled-out-of-range")
  })

  it("suppresses if-needed status when hideIfNeeded is on", () => {
    const state = makeState({
      active: baseSlot,
      ifNeeded: [baseSlot],
      hideIfNeeded: true,
    })
    expect(state.respondentSlotStatus("user-1")).toBe("unavailable")
  })

  it("maps statuses to their legend tailwind classes", () => {
    expect(respondentStatusClass("available")).toBe("tw:bg-[#00994C77]")
    expect(respondentStatusClass("if-needed")).toBe("tw:bg-yellow")
    expect(respondentStatusClass("unavailable")).toBe("tw:bg-[#F9CCCC]")
    expect(respondentStatusClass("disabled-inactive")).toBe(
      "tw:bg-light-gray-stroke",
    )
    expect(respondentStatusClass("disabled-collapsed")).toBe(
      "tw:bg-(--timeful-collapsed-hours-bg) respondent-status--collapsed",
    )
    expect(respondentStatusClass("disabled-out-of-range")).toBe("tw:bg-gray")
    expect(respondentStatusClass(null)).toBe("")
  })
})

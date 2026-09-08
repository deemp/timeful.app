// @vitest-environment happy-dom

import { beforeEach, describe, expect, it } from "vitest"
import { nextTick } from "vue"
import { Temporal } from "temporal-polyfill"
import {
  resetScheduleOverlapMocks,
  viewportWidth,
} from "./scheduleOverlapTestMocks"
import {
  buildScheduleOverlapProps,
  installScheduleOverlapTestGlobals,
  mountScheduleOverlap,
  utcTimezone,
  zdt,
} from "./scheduleOverlapTestUtils"
import Tooltip from "../Tooltip.vue"
import ScheduleOverlapMobileOverlay from "./ScheduleOverlapMobileOverlay.vue"

describe("ScheduleOverlap mobile tooltip", () => {
  beforeEach(() => {
    resetScheduleOverlapMocks()
    installScheduleOverlapTestGlobals()
  })

  it("renders the mobile tooltip for the current hovered timeslot", async () => {
    viewportWidth.value = 375
    const wrapper = mountScheduleOverlap({
      props: {
        calendarOnly: true,
        event: {
          ...buildScheduleOverlapProps().event,
          dates: [Temporal.PlainDate.from("2026-01-01")],
          timeSeed: zdt("2026-01-01T09:00:00Z"),
          startTime: Temporal.PlainTime.from("09:00"),
          duration: Temporal.Duration.from({ hours: 3 }),
          timeIncrement: Temporal.Duration.from({ hours: 1 }),
        },
        initialTimezone: utcTimezone,
      },
      global: {
        stubs: {
          Tooltip,
        },
      },
    })
    const vm = wrapper.vm as unknown as {
      getTimeslotVon: (row: number, col: number) => Record<string, () => void>
    }

    vm.getTimeslotVon(1, 0).mouseover()
    await wrapper.get(".tw\\:relative").trigger("mouseenter")
    await nextTick()

    expect(wrapper.find(".tw\\:fixed.timeful-tooltip-layer").exists()).toBe(
      true,
    )
  })

  it("shows the mobile tooltip after selecting a timeslot by click", async () => {
    viewportWidth.value = 375
    const cell = document.createElement("div")
    cell.className = "timeslot"
    cell.dataset.row = "1"
    cell.dataset.col = "0"
    cell.getBoundingClientRect = () =>
      ({ left: 40, top: 80, width: 120, height: 20 }) as DOMRect
    const dragSection = document.createElement("div")
    dragSection.id = "drag-section"
    dragSection.append(cell)
    document.body.append(dragSection)

    const wrapper = mountScheduleOverlap({
      props: {
        calendarOnly: true,
        event: {
          ...buildScheduleOverlapProps().event,
          dates: [Temporal.PlainDate.from("2026-01-01")],
          timeSeed: zdt("2026-01-01T09:00:00Z"),
          startTime: Temporal.PlainTime.from("09:00"),
          duration: Temporal.Duration.from({ hours: 3 }),
          timeIncrement: Temporal.Duration.from({ hours: 1 }),
        },
        initialTimezone: utcTimezone,
      },
      global: {
        stubs: {
          Tooltip,
        },
      },
    })
    const vm = wrapper.vm as unknown as {
      getTimeslotVon: (row: number, col: number) => Record<string, () => void>
      selectedTooltipSlot: { row: number; col: number } | null
    }

    vm.getTimeslotVon(1, 0).click()
    await nextTick()

    expect(vm.selectedTooltipSlot).toEqual({ row: 1, col: 0 })
    expect(wrapper.find(".tw\\:fixed.timeful-tooltip-layer").exists()).toBe(
      true,
    )

    wrapper.unmount()
    dragSection.remove()
  })

  it("dismisses the mobile tooltip when clicking outside the grid", async () => {
    viewportWidth.value = 375
    const cell = document.createElement("div")
    cell.className = "timeslot"
    cell.dataset.row = "1"
    cell.dataset.col = "0"
    cell.getBoundingClientRect = () =>
      ({ left: 40, top: 80, width: 120, height: 20 }) as DOMRect
    const dragSection = document.createElement("div")
    dragSection.id = "drag-section"
    dragSection.append(cell)
    document.body.append(dragSection)

    const wrapper = mountScheduleOverlap({
      props: {
        calendarOnly: true,
        event: {
          ...buildScheduleOverlapProps().event,
          dates: [Temporal.PlainDate.from("2026-01-01")],
          timeSeed: zdt("2026-01-01T09:00:00Z"),
          startTime: Temporal.PlainTime.from("09:00"),
          duration: Temporal.Duration.from({ hours: 3 }),
          timeIncrement: Temporal.Duration.from({ hours: 1 }),
        },
        initialTimezone: utcTimezone,
      },
      global: {
        stubs: {
          Tooltip,
        },
      },
    })
    const vm = wrapper.vm as unknown as {
      getTimeslotVon: (row: number, col: number) => Record<string, () => void>
      selectedTooltipSlot: { row: number; col: number } | null
    }

    vm.getTimeslotVon(1, 0).click()
    await nextTick()
    expect(wrapper.find(".tw\\:fixed.timeful-tooltip-layer").exists()).toBe(
      true,
    )

    document.body.dispatchEvent(new MouseEvent("click", { bubbles: true }))
    await nextTick()

    expect(vm.selectedTooltipSlot).toBeNull()
    expect(wrapper.find(".tw\\:fixed.timeful-tooltip-layer").exists()).toBe(
      false,
    )

    wrapper.unmount()
    dragSection.remove()
  })

  it("stacks the shared tooltip layer below the mobile bottom overlay panels", async () => {
    viewportWidth.value = 375
    const wrapper = mountScheduleOverlap({
      props: {
        event: {
          ...buildScheduleOverlapProps().event,
          dates: [Temporal.PlainDate.from("2026-01-01")],
          timeSeed: zdt("2026-01-01T09:00:00Z"),
          startTime: Temporal.PlainTime.from("09:00"),
          duration: Temporal.Duration.from({ hours: 3 }),
          timeIncrement: Temporal.Duration.from({ hours: 1 }),
        },
        initialTimezone: utcTimezone,
      },
      global: {
        stubs: {
          Tooltip,
          ScheduleOverlapMobileOverlay,
        },
      },
    })
    const vm = wrapper.vm as unknown as {
      getTimeslotVon: (row: number, col: number) => Record<string, () => void>
    }

    vm.getTimeslotVon(1, 0).mouseover()
    await wrapper.get(".tw\\:relative").trigger("mouseenter")
    await nextTick()

    const tooltip = wrapper.get(".tw\\:fixed.timeful-tooltip-layer")
    expect(tooltip.classes()).not.toContain("timeful-bottom-overlay-layer")

    const overlayRoot = wrapper.get(".schedule-overlap-mobile-overlay")
    expect(overlayRoot.classes()).toContain("timeful-bottom-overlay-layer")
    expect(overlayRoot.classes()).toContain("tw:isolate")

    wrapper.unmount()
  })

  it("clears the mobile selection and tooltip when clicking an inactive gap", async () => {
    viewportWidth.value = 375
    const wrapper = mountScheduleOverlap({
      props: {
        calendarOnly: true,
        event: {
          ...buildScheduleOverlapProps().event,
          dates: [Temporal.PlainDate.from("2026-01-01")],
          timeSeed: zdt("2026-01-01T09:00:00Z"),
          hasSpecificTimes: true,
          startTime: Temporal.PlainTime.from("09:00"),
          duration: Temporal.Duration.from({ hours: 3 }),
          timeIncrement: Temporal.Duration.from({ hours: 1 }),
          times: [zdt("2026-01-01T09:00:00Z"), zdt("2026-01-01T11:00:00Z")],
        },
        initialTimezone: utcTimezone,
      },
      global: {
        stubs: {
          Tooltip,
        },
      },
    })
    const vm = wrapper.vm as unknown as {
      curTimeslot: { row: number; col: number }
      getTimeslotVon: (row: number, col: number) => Record<string, () => void>
    }

    vm.getTimeslotVon(0, 0).click()
    await nextTick()

    expect(vm.curTimeslot).toEqual({ row: 0, col: 0 })
    expect(wrapper.find(".tw\\:fixed.timeful-tooltip-layer").exists()).toBe(
      true,
    )

    vm.getTimeslotVon(1, 0).click()
    await nextTick()

    expect(vm.curTimeslot).toEqual({ row: -1, col: -1 })
    expect(wrapper.find(".tw\\:fixed.timeful-tooltip-layer").exists()).toBe(
      false,
    )

    wrapper.unmount()
  })
})

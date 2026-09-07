// @vitest-environment happy-dom

import { describe, expect, it } from "vitest"
import { shallowMount } from "@vue/test-utils"
import { states } from "@/composables/schedule_overlap/types"
import {
  buildScheduleOverlapProps,
  buildScheduleOverlapSidebarViewModel,
} from "./scheduleOverlapTestUtils"
import ScheduleOverlapSidebar from "./ScheduleOverlapSidebar.vue"
import type { ScheduleOverlapSidebarViewModel } from "./scheduleOverlapViewModelContracts"

const mountSidebar = (
  overrides: Partial<ScheduleOverlapSidebarViewModel> = {},
) =>
  shallowMount(ScheduleOverlapSidebar, {
    props: {
      sidebar: {
        ...buildScheduleOverlapSidebarViewModel(),
        ...overrides,
      },
    },
  })

const sidebarBody = (wrapper: ReturnType<typeof mountSidebar>) =>
  wrapper.get(".schedule-overlap-sidebar__body")

const availabilityToggle = (wrapper: ReturnType<typeof mountSidebar>) =>
  wrapper.find("availability-type-toggle-stub")

describe("ScheduleOverlapSidebar grid-to-Legend spacing", () => {
  it("drops the desktop editing top padding between grid and Legend while editing on phone", () => {
    const wrapper = mountSidebar({
      state: states.EDIT_AVAILABILITY,
      isPhone: true,
    })

    expect(sidebarBody(wrapper).classes()).not.toContain("tw:pt-5")

    wrapper.unmount()
  })

  it("renders no availability toggle wrapper while editing on phone", () => {
    const wrapper = mountSidebar({
      state: states.EDIT_AVAILABILITY,
      isPhone: true,
    })

    expect(availabilityToggle(wrapper).exists()).toBe(false)

    wrapper.unmount()
  })

  it("keeps the availability toggle while editing on desktop", () => {
    const wrapper = mountSidebar({ state: states.EDIT_AVAILABILITY })

    expect(sidebarBody(wrapper).classes()).toContain("tw:pt-5")
    expect(availabilityToggle(wrapper).exists()).toBe(true)

    wrapper.unmount()
  })

  it("keeps the shared mobile top padding in non-editing states", () => {
    const wrapper = mountSidebar({ state: states.HEATMAP, isPhone: true })

    expect(sidebarBody(wrapper).classes()).toContain("tw:pt-2")

    wrapper.unmount()
  })

  it("keeps the shared desktop top padding in non-editing states", () => {
    const wrapper = mountSidebar({ state: states.HEATMAP })

    expect(sidebarBody(wrapper).classes()).toContain("tw:pt-2")

    wrapper.unmount()
  })

  it("keeps the desktop days-only top padding", () => {
    const wrapper = mountSidebar({
      state: states.HEATMAP,
      event: { ...buildScheduleOverlapProps().event, daysOnly: true },
    })

    expect(sidebarBody(wrapper).classes()).toContain("tw:pt-16")

    wrapper.unmount()
  })
})

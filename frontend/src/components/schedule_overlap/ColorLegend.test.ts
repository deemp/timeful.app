// @vitest-environment happy-dom

import { mount } from "@vue/test-utils"
import { describe, expect, it } from "vitest"

import ColorLegend from "./ColorLegend.vue"
import colorLegendSource from "./ColorLegend.vue?raw"

describe("ColorLegend", () => {
  const mountLegend = (
    props?: Partial<InstanceType<typeof ColorLegend>["$props"]>,
  ) =>
    mount(ColorLegend, {
      props: {
        activeSlotsCount: 0,
        responseCount: 0,
        isAddingAvailability: false,
        canCollapseHours: false,
        ...props,
      },
    })

  const expectStructuralColors = (wrapper: ReturnType<typeof mountLegend>) => {
    expect(wrapper.text()).toContain(
      "Disabled, inside the event dates in the event timezone",
    )
    expect(wrapper.html()).toContain("tw:bg-light-gray-stroke")
    expect(wrapper.text()).toContain(
      "Disabled, outside the event dates in the event timezone",
    )
    expect(wrapper.html()).toContain("tw:bg-gray")
    expect(wrapper.text()).toContain("Scheduled event")
    expect(wrapper.find(".scheduled-event-legend-indicator").classes()).toEqual(
      expect.arrayContaining([
        "tw:border-scheduled-event",
        "tw:bg-scheduled-event",
      ]),
    )
  }

  const labels = (wrapper: ReturnType<typeof mountLegend>) =>
    wrapper.findAll("span").map((label) => label.text())

  it("shows only structural colors when the event has no active slots or responses", () => {
    const wrapper = mountLegend()

    expectStructuralColors(wrapper)
    expect(labels(wrapper)).toEqual([
      "Disabled, inside the event dates in the event timezone",
      "Disabled, outside the event dates in the event timezone",
      "Scheduled event",
    ])
    expect(wrapper.html()).not.toContain("tw:bg-[#F9CCCC]")
  })

  it("adds unavailable when the event has active slots", () => {
    const wrapper = mountLegend({ activeSlotsCount: 1 })

    expectStructuralColors(wrapper)
    expect(labels(wrapper)).toEqual([
      "Unavailable, change in Add/Edit availability",
      "Disabled, inside the event dates in the event timezone",
      "Disabled, outside the event dates in the event timezone",
      "Scheduled event",
    ])
    expect(wrapper.html()).toContain("tw:bg-[#F9CCCC]")
  })

  it("shows the response palette and active-slot guidance after a response is received", () => {
    const wrapper = mountLegend({ activeSlotsCount: 1, responseCount: 1 })

    expectStructuralColors(wrapper)
    expect(wrapper.text()).toContain("Available")
    expect(wrapper.html()).toContain("tw:bg-[#00994C77]")
    expect(wrapper.text()).toContain("If needed")
    expect(wrapper.html()).toContain("tw:bg-yellow")
    expect(wrapper.text()).toContain(
      "Unavailable, change in Add/Edit availability",
    )
    expect(wrapper.html()).toContain("tw:bg-[#F9CCCC]")
    expect(labels(wrapper)).toHaveLength(6)
  })

  it("shows the response palette and active-slot guidance while adding availability", () => {
    const wrapper = mountLegend({
      activeSlotsCount: 1,
      isAddingAvailability: true,
    })

    expect(wrapper.text()).toContain("Available")
    expect(wrapper.text()).toContain("If needed")
    expect(wrapper.text()).toContain(
      "Unavailable, change in Add/Edit availability",
    )
    expect(labels(wrapper)).toHaveLength(6)
  })

  it("uses the respondent checkbox control geometry for each indicator", () => {
    const wrapper = mountLegend({ activeSlotsCount: 1, responseCount: 1 })

    const indicatorSlots = wrapper.findAll(".color-legend__indicator-slot")
    expect(indicatorSlots).toHaveLength(6)

    for (const indicatorSlot of indicatorSlots) {
      expect(indicatorSlot.find(".tw\\:h-4.tw\\:w-4").exists()).toBe(true)
    }
  })

  it("never shows the removed edit-event guidance entry", () => {
    const wrapper = mountLegend({ activeSlotsCount: 1 })

    expect(wrapper.text()).toContain(
      "Unavailable, change in Add/Edit availability",
    )
    expect(wrapper.text()).toContain(
      "Disabled, inside the event dates in the event timezone",
    )
    expect(wrapper.text()).not.toContain("Disabled, change in Edit event")
    expect(wrapper.text()).not.toContain("Disabled, collapsed")
    expect(wrapper.html()).not.toContain("tw:bg-yellow")
  })

  it("shows the collapsed-hours item only when hours can collapse", () => {
    const wrapper = mountLegend({ canCollapseHours: true })

    expect(wrapper.text()).toContain("Disabled, collapsed")
    expect(
      wrapper.find(".color-legend-indicator--collapsed").classes(),
    ).toContain("tw:bg-(--timeful-collapsed-hours-bg)")
  })

  it("outlines the collapsed-hours indicator with a dashed grid-line border", () => {
    expect(colorLegendSource).toMatch(
      /\.color-legend-indicator--collapsed\s*\{[^}]*dashed/,
    )
    expect(colorLegendSource).not.toContain("dotted")
  })
})

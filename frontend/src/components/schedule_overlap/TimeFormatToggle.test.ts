// @vitest-environment happy-dom

import { mount } from "@vue/test-utils"
import { describe, expect, it } from "vitest"
import { timeTypes } from "@/constants"
import TimeFormatToggle from "./TimeFormatToggle.vue"

const DEFAULT_SLOT_WIDTH = 33 + 3 * 2

describe("TimeFormatToggle", () => {
  it("keeps the compact time-format styling local", () => {
    const wrapper = mount(TimeFormatToggle, {
      props: { modelValue: timeTypes.HOUR12 },
    })

    expect(wrapper.classes()).toContain("tw:h-8")
    expect(wrapper.classes()).toContain("tw:bg-white")
    expect(wrapper.get(".time-format-toggle__indicator").classes()).toContain(
      "tw:z-0",
    )
    const indicatorStyle = wrapper
      .get(".time-format-toggle__indicator")
      .attributes("style")
    expect(indicatorStyle).toContain("left: 3px")
    expect(indicatorStyle).toContain("top: 3px")
    expect(indicatorStyle).toContain("bottom: 3px")
    expect(indicatorStyle).toContain("width: 33px")
    expect(indicatorStyle).toContain("transform: translateX(0px)")
    expect(indicatorStyle).not.toContain("calc(")
    expect(wrapper.get(".time-format-toggle__indicator").classes()).toContain(
      "tw:border-outline-neutral",
    )
    expect(indicatorStyle).toContain("background-color: transparent")
    expect(
      wrapper.findAll(".time-format-toggle__option")[0].classes(),
    ).toContain("tw:z-10")
  })

  it("sizes the track from the indicator width and gap", () => {
    const wrapper = mount(TimeFormatToggle, {
      props: { modelValue: timeTypes.HOUR12 },
    })

    expect(wrapper.attributes("style")).toContain(
      `width: ${2 * DEFAULT_SLOT_WIDTH + 2}px`,
    )
  })

  it("gives every option an equal share of the track", () => {
    const wrapper = mount(TimeFormatToggle, {
      props: {
        modelValue: 15,
        options: [
          { label: "15 min", value: 15 },
          { label: "30 min", value: 30 },
          { label: "60 min", value: 60 },
        ],
        indicatorWidth: 56,
      },
    })

    expect(wrapper.attributes("style")).toContain("width: 188px")
    for (const option of wrapper.findAll(".time-format-toggle__option")) {
      expect(option.classes()).toContain("tw:flex-1")
    }
  })

  it("keeps the indicator size fixed across selections", async () => {
    const wrapper = mount(TimeFormatToggle, {
      props: { modelValue: timeTypes.HOUR12 },
    })

    const styleFor = () =>
      wrapper.get(".time-format-toggle__indicator").attributes("style")

    expect(styleFor()).toContain("width: 33px")
    expect(styleFor()).toContain("transform: translateX(0px)")

    await wrapper.setProps({ modelValue: timeTypes.HOUR24 })
    expect(styleFor()).toContain("width: 33px")
    expect(styleFor()).toContain(
      `transform: translateX(${DEFAULT_SLOT_WIDTH}px)`,
    )

    expect(
      wrapper.findAll(".time-format-toggle__option")[0].classes(),
    ).toContain("tw:min-w-8")
    expect(
      wrapper.findAll(".time-format-toggle__option")[0].classes(),
    ).toContain("tw:px-1.5")
    expect(
      wrapper.findAll(".time-format-toggle__option")[0].classes(),
    ).toContain("tw:whitespace-nowrap")
  })

  it("respects custom indicator width and gap props", () => {
    const wrapper = mount(TimeFormatToggle, {
      props: {
        modelValue: timeTypes.HOUR24,
        indicatorWidth: 40,
        gap: 5,
      },
    })

    expect(wrapper.attributes("style")).toContain("width: 102px")
    const indicatorStyle = wrapper
      .get(".time-format-toggle__indicator")
      .attributes("style")
    expect(indicatorStyle).toContain("left: 5px")
    expect(indicatorStyle).toContain("top: 5px")
    expect(indicatorStyle).toContain("bottom: 5px")
    expect(indicatorStyle).toContain("width: 40px")
    expect(indicatorStyle).toContain("transform: translateX(50px)")
  })

  it("treats a string indicator width as a number", () => {
    const wrapper = mount(TimeFormatToggle, {
      props: {
        modelValue: 15,
        options: [
          { label: "15 min", value: 15 },
          { label: "30 min", value: 30 },
          { label: "60 min", value: 60 },
        ],
        indicatorWidth: "56" as unknown as number,
      },
    })

    expect(wrapper.attributes("style")).toContain("width: 188px")
    expect(wrapper.attributes("style")).not.toContain("1700")
  })

  it("darkens only non-selected options on hover", () => {
    const wrapper = mount(TimeFormatToggle, {
      props: { modelValue: timeTypes.HOUR12 },
    })

    const options = wrapper.findAll(".time-format-toggle__option")
    expect(options[0].classes()).toContain("tw:text-black")
    expect(options[0].classes()).not.toContain("tw:hover:text-black")
    expect(options[1].classes()).toContain("tw:text-dark-gray")
    expect(options[1].classes()).toContain("tw:hover:text-black")
  })

  it("shows only the 12h and 24h labels on narrow options", () => {
    const wrapper = mount(TimeFormatToggle, {
      props: { modelValue: timeTypes.HOUR12 },
    })

    const options = wrapper.findAll(".time-format-toggle__option")
    expect(options).toHaveLength(2)
    expect(options[0].text()).toBe("12h")
    expect(options[1].text()).toBe("24h")
    for (const option of options) {
      expect(option.classes()).toContain("tw:min-w-8")
      expect(option.classes()).toContain("tw:px-1.5")
    }
  })

  it("emits the selected time format", async () => {
    const wrapper = mount(TimeFormatToggle, {
      props: { modelValue: timeTypes.HOUR12 },
    })

    await wrapper.findAll(".time-format-toggle__option")[1].trigger("click")

    expect(wrapper.emitted("update:modelValue")).toEqual([[timeTypes.HOUR24]])
  })

  it("renders custom options like 3d and 7d", () => {
    const wrapper = mount(TimeFormatToggle, {
      props: {
        modelValue: 3,
        options: [
          { label: "3d", value: 3 },
          { label: "7d", value: 7 },
        ],
        indicatorWidth: 28,
      },
    })

    const options = wrapper.findAll(".time-format-toggle__option")
    expect(options).toHaveLength(2)
    expect(options[0].text()).toBe("3d")
    expect(options[1].text()).toBe("7d")
    expect(wrapper.attributes("style")).toContain("width: 70px")
    const indicatorStyle = wrapper
      .get(".time-format-toggle__indicator")
      .attributes("style")
    expect(indicatorStyle).toContain("left: 3px")
    expect(indicatorStyle).toContain("width: 28px")
    expect(indicatorStyle).toContain("transform: translateX(0px)")
  })

  it("emits the selected value for custom options", async () => {
    const wrapper = mount(TimeFormatToggle, {
      props: {
        modelValue: 3,
        options: [
          { label: "3d", value: 3 },
          { label: "7d", value: 7 },
        ],
      },
    })

    await wrapper.findAll(".time-format-toggle__option")[1].trigger("click")

    expect(wrapper.emitted("update:modelValue")).toEqual([[7]])
  })
})

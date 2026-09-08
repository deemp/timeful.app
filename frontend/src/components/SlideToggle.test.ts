// @vitest-environment happy-dom

import { mount } from "@vue/test-utils"
import { describe, expect, it } from "vitest"
import SlideToggle from "./SlideToggle.vue"

const options = [
  {
    text: "First",
    value: "first",
    activeClass: "active-first",
    indicatorBgClass: "bg-first",
    borderClass: "border-first",
    borderColor: "#123456",
    borderStyle: { boxShadow: "0px 0px 1px #123456" },
  },
  {
    text: "Second",
    value: "second",
    activeClass: "active-second",
    indicatorBgClass: "bg-second",
    borderClass: "border-second",
    borderColor: "#654321",
  },
] as const

const mountSlideToggle = (
  modelValue: "first" | "second" | "missing" = "first",
) =>
  mount(SlideToggle, {
    props: {
      modelValue,
      options: [...options],
    },
  })

describe("SlideToggle", () => {
  it("outlines the track with the shared neutral border token", () => {
    const wrapper = mountSlideToggle()

    expect(wrapper.classes()).toContain("tw:border-outline-neutral")
    expect(wrapper.classes()).not.toContain("tw:border-light-gray-stroke")
  })

  it("derives the active option from modelValue changes without mirrored local state", async () => {
    const wrapper = mountSlideToggle("second")

    const tabs = wrapper.findAll(".tw\\:cursor-pointer")
    expect(tabs[1].classes()).toContain("active-second")

    const indicator = wrapper.get(".slide-toggle__indicator")
    expect(indicator.classes()).toContain("border-second")
    expect(indicator.classes()).toContain("bg-second")
    expect(indicator.element.getAttribute("style")).toContain(
      "translateX(calc(100% + 6px))",
    )
    expect(indicator.element.getAttribute("style")).toContain(
      "width: calc(50% - 6px)",
    )

    await wrapper.setProps({ modelValue: "first" })

    expect(tabs[0].classes()).toContain("active-first")
    expect(wrapper.get(".slide-toggle__indicator").classes()).toContain(
      "border-first",
    )
    expect(
      wrapper.get(".slide-toggle__indicator").element.getAttribute("style"),
    ).toContain("translateX(calc(0% + 0px))")
  })

  it("falls back to the first option when modelValue is not present", () => {
    const wrapper = mountSlideToggle("missing")

    expect(wrapper.findAll(".tw\\:cursor-pointer")[0].classes()).toContain(
      "active-first",
    )
    expect(
      wrapper.get(".slide-toggle__indicator").element.getAttribute("style"),
    ).toContain("translateX(calc(0% + 0px))")
  })

  it("keeps emitting the clicked option value", async () => {
    const wrapper = mountSlideToggle("first")

    await wrapper.findAll(".tw\\:cursor-pointer")[1].trigger("click")

    expect(wrapper.emitted("update:modelValue")).toEqual([[options[1].value]])
  })

  it("renders a fixed 36px white box with an inset rounded indicator and no glow", () => {
    const wrapper = mountSlideToggle()

    const box = wrapper.get(".slide-toggle")
    expect(box.classes()).toContain("tw:h-9")
    expect(box.classes()).toContain("tw:rounded-md")
    expect(box.classes()).toContain("tw:bg-white")

    const indicator = wrapper.get(".slide-toggle__indicator")
    expect(indicator.classes()).toContain("tw:rounded-[5px]")
    const style = indicator.element.getAttribute("style") ?? ""
    expect(style).toContain("top: 3px")
    expect(style).toContain("bottom: 3px")
    expect(style).toContain("left: 3px")
    expect(style).not.toContain("box-shadow")

    const cells = wrapper.findAll(".tw\\:cursor-pointer")
    for (const cell of cells) {
      expect(cell.classes()).not.toContain("tw:py-2.5")
      expect(cell.classes()).not.toContain("tw:bg-off-white")
    }
  })

  it("applies default green accent styling for plain options", () => {
    const wrapper = mount(SlideToggle, {
      props: {
        modelValue: "solo",
        options: [{ text: "Solo", value: "solo" }],
      },
    })

    const cell = wrapper.get(".tw\\:cursor-pointer")
    expect(cell.classes()).toContain("tw:text-green")

    const indicator = wrapper.get(".slide-toggle__indicator")
    expect(indicator.classes()).toContain("tw:bg-green/10")
    expect(indicator.classes()).toContain("tw:border-green")
  })

  it("renders active option text above the solid indicator and lets clicks reach the cells", () => {
    const wrapper = mountSlideToggle()

    const indicator = wrapper.get(".slide-toggle__indicator")
    expect(indicator.classes()).toContain("tw:pointer-events-none")

    const cells = wrapper.findAll(".slide-toggle__option")
    expect(cells).toHaveLength(2)
    for (const cell of cells) {
      expect(cell.classes()).toContain("tw:relative")
    }
  })

  it("styles inactive options dark-gray with a hover brightening to black", () => {
    const wrapper = mountSlideToggle("first")

    const inactiveCell = wrapper.findAll(".tw\\:cursor-pointer")[1]
    expect(inactiveCell.classes()).toContain("tw:text-dark-gray")
    expect(inactiveCell.classes()).toContain("tw:hover:text-black")
  })
})

// @vitest-environment happy-dom

import { mount } from "@vue/test-utils"
import { describe, expect, it } from "vitest"
import { availabilityTypes } from "@/constants"
import AvailabilityTypeToggle from "./AvailabilityTypeToggle.vue"

const mountToggle = (modelValue: string = availabilityTypes.AVAILABLE) =>
  mount(AvailabilityTypeToggle, {
    props: { modelValue },
  })

describe("AvailabilityTypeToggle", () => {
  it("renders the Available and If needed options", () => {
    const wrapper = mountToggle()

    const texts = wrapper
      .findAll(".tw:cursor-pointer")
      .map((cell) => cell.text())
    expect(texts).toEqual(["Available", "If needed"])
  })

  it("styles the selected Available option green without a glow", () => {
    const wrapper = mountToggle(availabilityTypes.AVAILABLE)

    const cells = wrapper.findAll(".tw:cursor-pointer")
    expect(cells[0].classes()).toContain("tw:text-green")
    expect(cells[1].classes()).toContain("tw:text-dark-gray")

    const indicator = wrapper.get(".slide-toggle__indicator")
    expect(indicator.classes()).toContain("tw:bg-green/10")
    expect(indicator.classes()).toContain("tw:border-green")
    expect(indicator.element.getAttribute("style") ?? "").not.toContain(
      "box-shadow",
    )
    expect(indicator.classes()).toContain("tw:pointer-events-none")
  })

  it("styles the selected If needed option dark-yellow without a glow", () => {
    const wrapper = mountToggle(availabilityTypes.IF_NEEDED)

    const cells = wrapper.findAll(".tw:cursor-pointer")
    expect(cells[1].classes()).toContain("tw:text-dark-yellow")
    expect(cells[0].classes()).toContain("tw:text-dark-gray")

    const indicator = wrapper.get(".slide-toggle__indicator")
    expect(indicator.classes()).toContain("tw:bg-yellow/10")
    expect(indicator.classes()).toContain("tw:border-dark-yellow")
    expect(indicator.element.getAttribute("style") ?? "").not.toContain(
      "box-shadow",
    )
  })

  it("emits the clicked availability type", async () => {
    const wrapper = mountToggle(availabilityTypes.AVAILABLE)

    await wrapper.findAll(".tw:cursor-pointer")[1].trigger("click")

    expect(wrapper.emitted("update:modelValue")).toEqual([
      [availabilityTypes.IF_NEEDED],
    ])
  })
})

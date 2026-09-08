// @vitest-environment happy-dom

import { mount } from "@vue/test-utils"
import { describe, expect, it } from "vitest"

import SpecificTimesInstructions from "./SpecificTimesInstructions.vue"

describe("SpecificTimesInstructions", () => {
  it("emits saveTempTimes when Next is clicked", async () => {
    const wrapper = mount(SpecificTimesInstructions, {
      props: {
        numTempTimes: 1,
      },
      global: {
        stubs: {
          "v-btn": {
            props: ["disabled"],
            template:
              '<button :disabled="disabled" @click="$emit(\'click\')"><slot /></button>',
          },
        },
      },
    })

    await wrapper.get("button").trigger("click")

    expect(wrapper.emitted("saveTempTimes")?.length).toBeGreaterThan(0)
  })

  it("disables Next when there are no temporary times selected", () => {
    const wrapper = mount(SpecificTimesInstructions, {
      props: {
        numTempTimes: 0,
      },
      global: {
        stubs: {
          "v-btn": {
            props: ["disabled"],
            template: '<button :disabled="disabled"><slot /></button>',
          },
        },
      },
    })

    expect(wrapper.get("button").attributes("disabled")).toBeDefined()
  })

  it("describes editable, selected, and unavailable states", () => {
    const wrapper = mount(SpecificTimesInstructions, {
      props: { numTempTimes: 0 },
    })

    expect(wrapper.text()).toContain("Selectable for the event")
    expect(wrapper.text()).toContain("Selected for the event")
    expect(wrapper.text()).toContain(
      "Disabled, outside the event dates in the event timezone",
    )
    expect(
      wrapper.find(".specific-times-instructions-swatch--enabled").exists(),
    ).toBe(true)
    expect(
      wrapper
        .find(".specific-times-instructions-swatch--disabled-padding")
        .exists(),
    ).toBe(true)
    expect(
      wrapper.find(".specific-times-instructions-swatch--enabled").classes(),
    ).toContain("tw:bg-light-gray-stroke")
    expect(
      wrapper.find(".specific-times-instructions-swatch--potential").classes(),
    ).toContain("tw:bg-white")
    expect(
      wrapper
        .find(".specific-times-instructions-swatch--disabled-padding")
        .classes(),
    ).toContain("tw:bg-gray")
    expect(
      wrapper.find(".specific-times-instructions-swatch--disabled-padding")
        .element.parentElement?.classList,
    ).toContain("tw:items-start")
  })
})

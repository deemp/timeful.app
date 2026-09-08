// @vitest-environment happy-dom

import { shallowMount as baseShallowMount } from "@vue/test-utils"
import { defineComponent, type CSSProperties } from "vue"
import { afterEach, describe, expect, it } from "vitest"
import {
  vSelectStub as VSelectStub,
  type ComponentStubMap,
} from "@/test/componentStubs"
import type { TimeFormatOption } from "@/utils"
import timeRangePickerSource from "./TimeRangePicker.vue?raw"
import TimeRangePicker from "./TimeRangePicker.vue"

const mountedWrappers: ReturnType<typeof baseShallowMount>[] = []
const shallowMount: typeof baseShallowMount = (...args) => {
  const wrapper = baseShallowMount(...args)
  mountedWrappers.push(wrapper)
  return wrapper
}

const DEFAULT_WIDTH_EXPRESSION =
  "clamp(100px, calc(100px + (100vw - 350px) * 20 / 50), 120px)"

const items: TimeFormatOption[] = [
  { text: "09:00", time: 9, value: 9 },
  { text: "12:00", time: 12, value: 12 },
  { text: "17:00", time: 17, value: 17 },
]

const vSelectItemSlotStub = defineComponent({
  name: "VSelect",
  props: {
    items: {
      type: Array,
      default: () => [],
    },
    menuProps: {
      type: [Object, String],
      default: undefined,
    },
    modelValue: {
      type: null,
      required: false,
      default: undefined,
    },
  },
  template: `
    <div class="v-select-stub">
      <slot
        name="item"
        :item="items[0]"
        :props="{ class: 'stub-item-props' }"
      />
    </div>
  `,
})

type PickerProps = {
  items?: TimeFormatOption[]
  start?: TimeFormatOption
  end?: TimeFormatOption
  width?: number
}

const mountPicker = (
  props: PickerProps = {},
  stub: ComponentStubMap = { "v-select": VSelectStub },
) => {
  const wrapper = shallowMount(TimeRangePicker, {
    props: {
      items,
      ...props,
    },
    global: {
      stubs: stub,
    },
  })
  mountedWrappers.push(wrapper)
  return wrapper
}

describe("TimeRangePicker", () => {
  afterEach(() => {
    for (const wrapper of mountedWrappers.splice(0)) wrapper.unmount()
    document.body.replaceChildren()
  })

  it("renders the start select, separator, and end select", () => {
    const wrapper = mountPicker({
      start: items[0],
      end: items[1],
    })

    const selects = wrapper.findAllComponents(VSelectStub)
    expect(selects).toHaveLength(2)
    expect(selects[0]?.props("modelValue")).toEqual(items[0])
    expect(selects[1]?.props("modelValue")).toEqual(items[1])
    expect(wrapper.get(".time-range-separator").text()).toBe("to")
  })

  it("pins chip width and menu-props to the same fluid width expression by default", () => {
    const wrapper = mountPicker()

    const setupState = (
      wrapper.vm.$ as unknown as {
        setupState: { pickerWidth: string; selectStyle: CSSProperties }
      }
    ).setupState
    expect(setupState.pickerWidth).toBe(DEFAULT_WIDTH_EXPRESSION)
    expect(setupState.selectStyle).toEqual({
      width: DEFAULT_WIDTH_EXPRESSION,
      flex: "none",
    })

    const selects = wrapper.findAllComponents(VSelectStub)
    for (const select of selects) {
      expect(select.props("menuProps")).toEqual({
        minWidth: DEFAULT_WIDTH_EXPRESSION,
        maxWidth: DEFAULT_WIDTH_EXPRESSION,
      })
    }
  })

  it("clamps the width prop to the 100px hard floor", () => {
    const wrapper = mountPicker({ width: 80 })

    const select = wrapper.findAllComponents(VSelectStub)[0]
    expect(select.props("menuProps")).toEqual({
      minWidth: DEFAULT_WIDTH_EXPRESSION,
      maxWidth: DEFAULT_WIDTH_EXPRESSION,
    })
  })

  it("grows fluidly from the width base to 120px between 350px and 400px viewports", () => {
    const wrapper = mountPicker({ width: 110 })

    const grownExpression =
      "clamp(110px, calc(110px + (100vw - 350px) * 10 / 50), 120px)"
    const select = wrapper.findAllComponents(VSelectStub)[0]
    expect(select.props("menuProps")).toEqual({
      minWidth: grownExpression,
      maxWidth: grownExpression,
    })
  })

  it("keeps a width at or above the growth ceiling fixed", () => {
    const wrapper = mountPicker({ width: 132 })

    const select = wrapper.findAllComponents(VSelectStub)[0]
    expect(select.props("menuProps")).toEqual({
      minWidth: "132px",
      maxWidth: "132px",
    })
    expect(select.attributes("style")).toContain("width: 132px")
  })

  it("does not change width or menu size with the selected value", () => {
    const earlyWrapper = mountPicker({
      start: items[0],
      end: items[1],
    })
    const lateWrapper = mountPicker({
      start: items[2],
      end: items[1],
    })

    const expected = {
      minWidth: DEFAULT_WIDTH_EXPRESSION,
      maxWidth: DEFAULT_WIDTH_EXPRESSION,
    }
    const earlySelects = earlyWrapper.findAllComponents(VSelectStub)
    const lateSelects = lateWrapper.findAllComponents(VSelectStub)
    expect(earlySelects[0]?.props("menuProps")).toEqual(expected)
    expect(earlySelects[1]?.props("menuProps")).toEqual(expected)
    expect(lateSelects[0]?.props("menuProps")).toEqual(expected)
    expect(lateSelects[1]?.props("menuProps")).toEqual(expected)
  })

  it("highlights the item matching start and end selections", () => {
    const wrapper = mountPicker(
      {
        start: items[0],
        end: items[1],
      },
      { "v-select": vSelectItemSlotStub },
    )

    const itemWrappers = wrapper.findAll(".time-range-select-item")
    expect(itemWrappers).toHaveLength(2)
    expect(itemWrappers[0]?.classes()).toContain(
      "time-range-select-item--active",
    )
    expect(itemWrappers[1]?.classes()).not.toContain(
      "time-range-select-item--active",
    )
  })

  it("emits update:start and update:end with the selected return-object option", async () => {
    const wrapper = mountPicker({
      start: items[0],
      end: items[1],
    })

    const selects = wrapper.findAllComponents(VSelectStub)
    selects[0]?.vm.$emit("update:modelValue", items[2])
    selects[1]?.vm.$emit("update:modelValue", items[1])
    await wrapper.vm.$nextTick()

    expect(wrapper.emitted("update:start")).toEqual([[items[2]]])
    expect(wrapper.emitted("update:end")).toEqual([[items[1]]])
  })

  it("exposes a single chip-height knob that the field-level Vuetify density rules cannot re-pin", () => {
    expect(timeRangePickerSource).toMatch(
      /\.time-range-picker\s*\{\s*--time-range-chip-height:\s*58px;/,
    )
    expect(timeRangePickerSource).toMatch(
      /\.time-range-picker \.v-input\.time-range-select \.v-field\s*\{\s*--v-input-control-height:\s*calc\(var\(--time-range-chip-height\) - 2px\);\s*--v-field-input-padding-top:\s*0px;\s*--v-field-input-padding-bottom:\s*0px;\s*--v-field-padding-start:\s*8px;\s*min-height:\s*var\(--time-range-chip-height\);/,
    )
    expect(timeRangePickerSource).toMatch(
      /\.time-range-picker \.time-range-separator\s*\{[^}]*height:\s*var\(--time-range-chip-height\);/,
    )
    expect(timeRangePickerSource).toMatch(
      /\.time-range-select-item\s*\{[^}]*min-height:\s*40px;/,
    )
  })
})

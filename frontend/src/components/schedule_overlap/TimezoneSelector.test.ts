// @vitest-environment happy-dom
/* eslint-disable vue/one-component-per-file */

import { shallowMount } from "@vue/test-utils"
import { computed, defineComponent, type PropType } from "vue"
import { beforeEach, describe, expect, it, vi } from "vitest"
import { durations } from "@/constants"
import { Temporal } from "temporal-polyfill"
import type { Timezone } from "@/composables/schedule_overlap/types"
import { createLocalStorageMock } from "@/test/localStorage"
import { vSelectStub as VSelectStub } from "@/test/componentStubs"
import TimezoneSelector from "./TimezoneSelector.vue"
import timezoneSelectorSource from "./TimezoneSelector.vue?raw"

const RenderingVSelectStub = defineComponent({
  name: "RenderingVSelectStub",
  props: {
    items: {
      type: Array as PropType<Record<string, unknown>[]>,
      default: () => [],
    },
    modelValue: {
      type: String,
      required: false,
      default: undefined,
    },
    itemTitle: {
      type: String,
      default: "title",
    },
    itemValue: {
      type: String,
      default: "value",
    },
  },
  setup(props) {
    const selectedItem = computed(() =>
      props.items.find((item) => item[props.itemValue] === props.modelValue),
    )

    const renderedLabel = computed(() => {
      return selectedItem.value?.[props.itemTitle]
    })

    return { renderedLabel, selectedItem }
  },
  template: `
    <div>
      <slot
        v-if="selectedItem"
        name="selection"
        :item="{ raw: selectedItem }"
      />
      <div v-else>{{ renderedLabel }}</div>
    </div>
  `,
})

const ItemSlotRenderingVSelectStub = defineComponent({
  name: "ItemSlotRenderingVSelectStub",
  props: {
    items: {
      type: Array as PropType<Record<string, unknown>[]>,
      default: () => [],
    },
  },
  template: `
    <div>
      <slot
        v-for="item in items"
        :key="String(item.value)"
        name="item"
        :item="{ raw: item }"
        :props="{ title: item.title, value: item.value }"
      />
    </div>
  `,
})

const RenderingVListItemStub = defineComponent({
  name: "RenderingVListItemStub",
  template: `<div><slot /></div>`,
})

const RenderingVListItemTitleStub = defineComponent({
  name: "RenderingVListItemTitleStub",
  template: `<div><slot /></div>`,
})

const DirectRawItemVSelectStub = defineComponent({
  name: "DirectRawItemVSelectStub",
  props: {
    items: {
      type: Array as PropType<
        ({ timezone?: Timezone } & Record<string, unknown>)[]
      >,
      default: () => [],
    },
    modelValue: {
      type: String,
      required: false,
      default: undefined,
    },
  },
  setup(props) {
    const selectedTimezone = computed(
      () =>
        props.items.find((item) => item.value === props.modelValue)?.timezone ??
        props.items[0]?.timezone,
    )

    return { selectedTimezone }
  },
  template: `
    <div>
      <slot
        v-if="selectedTimezone"
        name="item"
        :item="{ raw: selectedTimezone }"
        :props="{ title: { text: '[object Object]' }, value: selectedTimezone.value }"
      />
      <slot
        v-if="selectedTimezone"
        name="selection"
        :item="{ raw: selectedTimezone }"
      />
    </div>
  `,
})

const mountTimezoneSelector = (modelValue?: Timezone) =>
  shallowMount(TimezoneSelector, {
    props: {
      modelValue: modelValue ?? {
        value: "",
        label: "",
        gmtString: "",
        offset: durations.ZERO,
      },
    },
    global: {
      stubs: {
        "v-btn": true,
        "v-icon": true,
        "v-list-item": true,
        "v-list-item-content": true,
        "v-list-item-title": true,
        "v-select": VSelectStub,
      },
    },
  })

describe("TimezoneSelector", () => {
  beforeEach(() => {
    vi.stubGlobal("localStorage", createLocalStorageMock())
    vi.spyOn(Intl, "DateTimeFormat").mockImplementation(
      () =>
        ({
          resolvedOptions: () => ({ timeZone: "America/New_York" }),
        }) as Intl.DateTimeFormat,
    )
  })

  it("does not initialize parent-owned timezone state during setup", () => {
    localStorage.setItem(
      "timezone",
      JSON.stringify({
        value: "",
        offset: Temporal.Duration.from({ hours: 5, minutes: 45 }).toString(),
      }),
    )

    const wrapper = mountTimezoneSelector()

    expect(wrapper.emitted("update:modelValue")).toBeUndefined()
  })

  it("uses explicit Vuetify 3 item bindings for timezone labels and values", () => {
    const wrapper = mountTimezoneSelector({
      value: "America/New_York",
      label: "Eastern Time",
      gmtString: "(GMT-5:00)",
      offset: Temporal.Duration.from({ hours: -5 }),
    })
    const select = wrapper.getComponent(VSelectStub)
    const selectProps = select.props()

    expect(selectProps.itemTitle).toBe("title")
    expect(selectProps.itemValue).toBe("value")
    expect(selectProps.modelValue).toBe("America/New_York")
    expect(selectProps.variant).toBe("underlined")
    expect(selectProps.density).toBe("compact")
    expect(String(selectProps.class)).toContain("compact-inline-select")
    expect(
      wrapper.get("#timezone-select-container").attributes("class"),
    ).toContain("tw:text-[rgba(0,0,0,0.6)]")
    const matchingTimezoneItem = (
      selectProps.items as Record<string, unknown>[]
    ).find((item) => item.value === "America/New_York")

    expect(matchingTimezoneItem).toMatchObject({
      value: "America/New_York",
    })
    expect(String(matchingTimezoneItem?.title)).toContain("Eastern Time")
  })

  it("supports the solo field treatment used by the desktop event toolbar", () => {
    const wrapper = shallowMount(TimezoneSelector, {
      props: {
        fieldVariant: "solo",
        compactButton: true,
        modelValue: {
          value: "America/New_York",
          label: "Eastern Time",
          gmtString: "(GMT-5:00)",
          offset: Temporal.Duration.from({ hours: -5 }),
        },
      },
      global: {
        stubs: {
          "v-btn": true,
          "v-icon": true,
          "v-list-item": true,
          "v-list-item-title": true,
          "v-select": VSelectStub,
        },
      },
    })

    const select = wrapper.getComponent(VSelectStub)

    expect(select.props("variant")).toBe("solo")
    expect(select.props("density")).toBe("compact")
    expect(String(select.props("class"))).toContain("timeful-solo-field")
    expect(String(select.props("class"))).toContain(
      "timezone-select--compact-button",
    )
  })

  it("exposes stable test hooks for the timezone trigger and canonical option values", () => {
    expect(timezoneSelectorSource).toContain(
      'data-testid="timezone-select-trigger"',
    )
    expect(timezoneSelectorSource).toContain(
      'data-testid="timezone-select-option"',
    )
    expect(timezoneSelectorSource).toContain(
      ':data-timezone-value="getTimezoneFromSelectItem(item.raw).value"',
    )
  })

  it("renders a readable timezone label even when the selected value is an offset-only timezone", () => {
    const wrapper = shallowMount(TimezoneSelector, {
      props: {
        modelValue: {
          value: "+05:45",
          label: "+05:45",
          gmtString: "(GMT+5:45)",
          offset: Temporal.Duration.from({ hours: 5, minutes: 45 }),
        },
      },
      global: {
        stubs: {
          "v-btn": true,
          "v-icon": true,
          "v-list-item": true,
          "v-list-item-title": true,
          "v-select": RenderingVSelectStub,
        },
      },
    })

    expect(wrapper.text()).toContain("(GMT+5:45) +05:45")
  }, 10000)

  it("keeps the custom timezone selection text in the truncation class path", () => {
    const wrapper = shallowMount(TimezoneSelector, {
      props: {
        modelValue: {
          value: "Europe/Moscow",
          label: "Istanbul, Minsk, Moscow, St. Petersburg, Volgograd",
          gmtString: "(GMT+3:00)",
          offset: Temporal.Duration.from({ hours: 3 }),
        },
      },
      global: {
        stubs: {
          "v-btn": true,
          "v-icon": true,
          "v-list-item": true,
          "v-list-item-title": true,
          "v-select": RenderingVSelectStub,
        },
      },
    })

    const selection = wrapper.get(".timezone-select__selection-text")

    expect(selection.text()).toContain("(GMT+3:00)")
    expect(selection.text()).toContain("Istanbul, Minsk, Moscow")
  })

  it("places the compact reset action after the timezone select", () => {
    expect(timezoneSelectorSource).toContain(
      "'timezone-select__field-row tw:flex tw:min-w-0 tw:items-center'",
    )
    expect(timezoneSelectorSource).toContain(
      'class="timezone-select__reset-button"',
    )
    expect(timezoneSelectorSource).toContain(
      'v-if="showReset && modified && !compact"',
    )
    expect(timezoneSelectorSource).toContain(
      'v-if="showReset && modified && compact"',
    )
    expect(timezoneSelectorSource).toContain("@mousedown.stop.prevent")
    expect(timezoneSelectorSource).toContain("@pointerdown.stop.prevent")
    expect(
      timezoneSelectorSource.indexOf('v-if="showReset && modified && compact"'),
    ).toBeGreaterThan(timezoneSelectorSource.indexOf('id="timezone-select"'))
  })

  it("hides the reset button entirely when showReset is false, even if modified", () => {
    const wrapper = shallowMount(TimezoneSelector, {
      props: {
        modified: true,
        showReset: false,
        modelValue: {
          value: "America/New_York",
          label: "Eastern Time",
          gmtString: "(GMT-5:00)",
          offset: Temporal.Duration.from({ hours: -5 }),
        },
      },
      global: {
        stubs: {
          "v-btn": {
            template:
              '<button class="reset-button" @click="(event) => $emit(\'click\', event)" />',
          },
          "v-icon": true,
          "v-list-item": true,
          "v-list-item-title": true,
          "v-select": VSelectStub,
        },
      },
    })

    expect(wrapper.find(".reset-button").exists()).toBe(false)

    const compactWrapper = shallowMount(TimezoneSelector, {
      props: {
        compact: true,
        modified: true,
        showReset: false,
        modelValue: {
          value: "America/New_York",
          label: "Eastern Time",
          gmtString: "(GMT-5:00)",
          offset: Temporal.Duration.from({ hours: -5 }),
        },
      },
      global: {
        stubs: {
          "v-btn": {
            template:
              '<button class="reset-button" @click="(event) => $emit(\'click\', event)" />',
          },
          "v-icon": true,
          "v-list-item": true,
          "v-list-item-title": true,
          "v-select": VSelectStub,
        },
      },
    })

    expect(compactWrapper.find(".reset-button").exists()).toBe(false)
  })

  it("keeps persistence out of the selector and delegates reset through emits", async () => {
    const wrapper = shallowMount(TimezoneSelector, {
      props: {
        modified: true,
        modelValue: {
          value: "America/New_York",
          label: "Eastern Time",
          gmtString: "(GMT-5:00)",
          offset: Temporal.Duration.from({ hours: -5 }),
        },
      },
      global: {
        stubs: {
          "v-btn": {
            template:
              '<button class="reset-button" @click="(event) => $emit(\'click\', event)" />',
          },
          "v-icon": true,
          "v-list-item": true,
          "v-list-item-title": true,
          "v-select": VSelectStub,
        },
      },
    })

    await wrapper.get(".reset-button").trigger("click")

    expect(timezoneSelectorSource).not.toContain("localStorage")
    expect(timezoneSelectorSource).not.toContain('storage?.setItem("timezone"')
    expect(timezoneSelectorSource).not.toContain(
      'storage?.removeItem("timezone")',
    )
    expect(wrapper.emitted("reset")).toBeTruthy()
  })

  it("allows the timezone select and its selection text to shrink for ellipsis", () => {
    expect(timezoneSelectorSource).toContain(
      "'tw:flex tw:min-w-0 tw:items-center tw:text-[rgba(0,0,0,0.6)]'",
    )
    expect(timezoneSelectorSource).toContain(
      "(compact && !fitContent) || fixedWidth\n            ? 'tw:w-full tw:flex-1'\n            : fitContent\n              ? 'tw:w-auto tw:flex-initial'\n              : 'tw:w-40 tw:sm:w-44 tw:md:w-64'",
    )
    expect(timezoneSelectorSource).toContain(
      "(compact && !fitContent) || fixedWidth ? 'tw:flex-1' : ''",
    )
    expect(timezoneSelectorSource).toContain(
      ".compact-inline-select:not(.timeful-solo-field) :deep(.v-field__input) {\n  flex-wrap: nowrap !important;\n  min-width: 0 !important;",
    )
    expect(timezoneSelectorSource).toContain(
      ".compact-inline-select :deep(.v-select__selection) {\n  display: block !important;",
    )
  })

  it("shortens the compact selected timezone to its offset only", () => {
    const wrapper = shallowMount(TimezoneSelector, {
      props: {
        compact: true,
        modelValue: {
          value: "America/New_York",
          label: "Eastern Time",
          gmtString: "(GMT-5:00)",
          offset: Temporal.Duration.from({ hours: -5 }),
        },
      },
      global: {
        stubs: {
          "v-btn": true,
          "v-icon": true,
          "v-list-item": true,
          "v-list-item-title": true,
          "v-select": RenderingVSelectStub,
        },
      },
    })

    expect(wrapper.get(".timezone-select__selection-text").text()).toMatch(
      /^-\d+:\d+$/,
    )
    expect(
      wrapper.get(".timezone-select__selection-text").text(),
    ).not.toContain("GMT")
  })

  it("styles the compact reset action as a square black button", () => {
    expect(timezoneSelectorSource).toContain(
      ".compact-inline-select :deep(.v-select__menu-icon) {\n  order: 1;",
    )
    expect(timezoneSelectorSource).toContain('size="32"')
    expect(timezoneSelectorSource).toContain('variant="outlined"')
    expect(timezoneSelectorSource).toContain(
      ".timezone-select__reset-button--right {\n  border-color: var(--timeful-outline-neutral) !important;\n  border-radius: 0.375rem;\n  color: rgb(0, 0, 0);\n  height: 32px;",
    )
    expect(timezoneSelectorSource).not.toContain(
      ".compact-inline-select :deep(.v-field__outline) {\n  display: none;",
    )
  })

  it("keeps the toolbar button as short as the time-format switch", () => {
    expect(timezoneSelectorSource).toContain(
      ".timezone-select--compact-button :deep(.v-field) {\n  min-height: 32px !important;\n  height: 32px !important;\n  filter: none !important;\n  box-shadow: none !important;\n  border: 1px solid var(--timeful-outline-neutral) !important;",
    )
    expect(timezoneSelectorSource).toContain(
      ".timezone-select--compact-button :deep(.v-field__input) {\n  align-items: center !important;\n  min-height: 32px !important;\n  padding-top: 0 !important;\n  padding-bottom: 0 !important;\n  font-size: 0.875rem;\n  font-weight: 500;",
    )
    expect(timezoneSelectorSource).toContain(
      ".timezone-select--compact-button :deep(.v-select__selection-text) {\n  color: rgb(0, 0, 0);\n  font-family: inherit;\n  font-size: 0.875rem;\n  font-weight: 500;",
    )
  })

  it("keeps the desktop toolbar zone label and chevron at the field sides", () => {
    expect(timezoneSelectorSource).toContain(
      ".timezone-select--compact-button :deep(.v-field) {\n  --v-field-padding-start: 8px;\n  padding-inline-end: 2px;",
    )
    expect(timezoneSelectorSource).toContain(
      ".timezone-select--compact-button :deep(.v-field.v-field--appended) {\n  --v-field-padding-end: 2px;",
    )
  })

  it("expands the compact selector across its available row", () => {
    expect(timezoneSelectorSource).toContain(
      "compact && !fitContent && 'tw:w-full'",
    )
    expect(timezoneSelectorSource).toContain(
      "(compact && !fitContent) || fixedWidth ? 'tw:flex-1' : ''",
    )
    expect(timezoneSelectorSource).toContain(
      "(compact && !fitContent) || fixedWidth\n            ? 'tw:w-full tw:flex-1'\n            : fitContent\n              ? 'tw:w-auto tw:flex-initial'\n              : 'tw:w-40 tw:sm:w-44 tw:md:w-64'",
    )
  })

  it("keeps a fixed compact selector width so the reset button fits without resizing", () => {
    expect(timezoneSelectorSource).toContain("fixedWidth && 'tw:w-28'")
    expect(timezoneSelectorSource).toContain("fitContent && 'tw:max-w-full'")

    const wrapper = shallowMount(TimezoneSelector, {
      props: {
        compact: true,
        fitContent: true,
        fixedWidth: true,
        modelValue: {
          value: "America/New_York",
          label: "Eastern Time",
          gmtString: "(GMT-5:00)",
          offset: Temporal.Duration.from({ hours: -5 }),
        },
      },
      global: {
        stubs: {
          "v-btn": true,
          "v-icon": true,
          "v-list-item": true,
          "v-list-item-title": true,
          "v-select": VSelectStub,
        },
      },
    })

    const container = wrapper.get("#timezone-select-container")
    expect(String(container.attributes("class"))).toContain("tw:w-28")
    const select = wrapper.getComponent(VSelectStub)
    expect(String(select.props("class"))).toContain("tw:w-full")
    expect(String(select.props("class"))).toContain("tw:flex-1")
  })

  it("fills the fixed-width container so the timezone button is a full 112px", () => {
    const wrapper = shallowMount(TimezoneSelector, {
      props: {
        compact: true,
        fixedWidth: true,
        modelValue: {
          value: "America/New_York",
          label: "Eastern Time",
          gmtString: "(GMT-5:00)",
          offset: Temporal.Duration.from({ hours: -5 }),
        },
      },
      global: {
        stubs: {
          "v-btn": true,
          "v-icon": true,
          "v-list-item": true,
          "v-list-item-title": true,
          "v-select": VSelectStub,
        },
      },
    })

    const container = wrapper.get("#timezone-select-container")
    expect(String(container.attributes("class"))).toContain("tw:w-28")
    const select = wrapper.getComponent(VSelectStub)
    expect(String(select.props("class"))).not.toContain(
      "timezone-select--compact",
    )
    expect(String(select.props("class"))).toContain("tw:w-full")
    expect(String(select.props("class"))).toContain("tw:flex-1")
  })

  it("renders no label inside the selector so the form owns the label", () => {
    expect(timezoneSelectorSource).not.toContain('v-if="label"')
    expect(timezoneSelectorSource).not.toContain("labelColor")
    expect(timezoneSelectorSource).not.toContain("label?: string")
    expect(timezoneSelectorSource).not.toContain('label: "Shown in"')
  })

  it("shrinks the compact selector to its content when fit-content is set", () => {
    expect(timezoneSelectorSource).toContain("fitContent && 'tw:max-w-full'")
    expect(timezoneSelectorSource).toContain(
      "fitContent\n              ? 'tw:w-auto tw:flex-initial'",
    )
    expect(timezoneSelectorSource).toContain(
      "compact && !fixedWidth && 'timezone-select--compact'",
    )

    const wrapper = shallowMount(TimezoneSelector, {
      props: {
        compact: true,
        fitContent: true,
        modelValue: {
          value: "America/New_York",
          label: "Eastern Time",
          gmtString: "(GMT-5:00)",
          offset: Temporal.Duration.from({ hours: -5 }),
        },
      },
      global: {
        stubs: {
          "v-btn": true,
          "v-icon": true,
          "v-list-item": true,
          "v-list-item-title": true,
          "v-select": VSelectStub,
        },
      },
    })

    const select = wrapper.getComponent(VSelectStub)
    expect(String(select.props("class"))).toContain("tw:w-auto")
    expect(String(select.props("class"))).toContain("tw:flex-initial")
    expect(String(select.props("class"))).not.toContain("tw:w-full")
  })

  it("does not restore the old field-level compact flex overrides", () => {
    expect(timezoneSelectorSource).not.toContain(
      ".compact-inline-select :deep(.v-input__control),\n.compact-inline-select :deep(.v-field__field)",
    )
    expect(timezoneSelectorSource).not.toContain(
      ".compact-inline-select :deep(.v-field__input) {\n  align-items: center !important;",
    )
    expect(timezoneSelectorSource).not.toContain(
      ".compact-inline-select :deep(.v-field) {\n  background: transparent;\n  border: 0;\n  border-radius: 0;\n  height: 26px !important;",
    )
  })

  it("does not render duplicate timezone item titles when using a custom item slot", () => {
    const wrapper = shallowMount(TimezoneSelector, {
      props: {
        modelValue: {
          value: "Europe/Moscow",
          label: "Istanbul, Minsk, Moscow, St. Petersburg, Volgograd",
          gmtString: "(GMT+3:00)",
          offset: Temporal.Duration.from({ hours: 3 }),
        },
      },
      global: {
        stubs: {
          "v-btn": true,
          "v-icon": true,
          "v-list-item": RenderingVListItemStub,
          "v-list-item-title": RenderingVListItemTitleStub,
          "v-select": ItemSlotRenderingVSelectStub,
        },
      },
    })

    expect(wrapper.text()).toContain("Istanbul, Minsk, Moscow")
    expect(wrapper.find(".generated-title").exists()).toBe(false)
  })

  it("renders timezone labels when Vuetify exposes the raw timezone object", () => {
    const wrapper = shallowMount(TimezoneSelector, {
      props: {
        modelValue: {
          value: "Europe/Moscow",
          label: "Istanbul, Minsk, Moscow, St. Petersburg, Volgograd",
          gmtString: "(GMT+3:00)",
          offset: Temporal.Duration.from({ hours: 3 }),
        },
      },
      global: {
        stubs: {
          "v-btn": true,
          "v-icon": true,
          "v-list-item": RenderingVListItemStub,
          "v-list-item-title": RenderingVListItemTitleStub,
          "v-select": DirectRawItemVSelectStub,
        },
      },
    })

    expect(wrapper.text()).toContain("(GMT+3:00) Istanbul, Minsk, Moscow")
    expect(wrapper.text()).not.toContain("[object Object]")
  })

  it("uses the shared selection palette for the active timezone dropdown item", () => {
    expect(timezoneSelectorSource).toContain('class="timezone-select__item"')
    expect(timezoneSelectorSource).toContain("'timezone-select__item--active':")
    expect(timezoneSelectorSource).toContain(
      'class="timezone-select__item-title"',
    )
    expect(timezoneSelectorSource).toContain(
      ".timezone-select__item {\n  min-height: 48px;\n}",
    )
    expect(timezoneSelectorSource).toContain(
      ".timezone-select__item-title {\n  color: rgba(0, 0, 0, 0.87);\n}",
    )
    expect(timezoneSelectorSource).toContain(
      ".timezone-select__item--active {\n  background-color: var(--timeful-selection-bg);\n}",
    )
    expect(timezoneSelectorSource).toContain(
      ".timezone-select__item--active :deep(.timezone-select__item-title) {\n  color: var(--timeful-selection-fg);\n}",
    )
  })
})

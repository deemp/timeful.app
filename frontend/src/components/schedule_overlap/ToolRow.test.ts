// @vitest-environment happy-dom

import { shallowMount } from "@vue/test-utils"
import { ref } from "vue"
import { describe, expect, it, vi } from "vitest"
import { eventTypes, timeTypes, UTC } from "@/constants"
import { states } from "@/composables/schedule_overlap/types"
import { Temporal } from "temporal-polyfill"
import ToolRow from "./ToolRow.vue"
import toolRowSource from "./ToolRow.vue?raw"

vi.mock("pinia", () => ({
  storeToRefs: (store: { authUser: unknown }) => ({
    authUser: store.authUser,
  }),
}))

vi.mock("@/stores/main", () => ({
  useMainStore: () => ({
    authUser: ref({ _id: "owner-1" }),
  }),
}))

const isPhoneValue = ref(false)

vi.mock("@/utils/useDisplayHelpers", () => ({
  useDisplayHelpers: () => ({
    isPhone: isPhoneValue,
  }),
}))

const passThroughStub = {
  template: "<div><slot /><slot name='activator' :props='{}' /></div>",
}

const VBtnStub = {
  props: ["variant", "size"],
  template:
    '<button :data-variant="variant" :data-size="size"><slot /></button>',
}

const baseToolRow = {
  event: {
    _id: "evt-1",
    ownerId: "owner-1",
    name: "Planning",
    type: eventTypes.SPECIFIC_DATES,
    dates: [Temporal.PlainDate.from("2026-01-01")],
    timeSeed: Temporal.Instant.from("2026-01-01T12:00:00Z").toZonedDateTimeISO(
      UTC,
    ),
    duration: Temporal.Duration.from({ hours: 1 }),
    daysOnly: false,
  },
  state: states.HEATMAP,
  states,
  actions: {
    updateCurTimezone: vi.fn(),
    resetCurTimezone: vi.fn(),
    updateTimeType: vi.fn(),
    updateMobileNumDays: vi.fn(),
    scheduleEvent: vi.fn(),
    cancelScheduleEvent: vi.fn(),
    confirmScheduleEvent: vi.fn(),
    updateWeekOffset: vi.fn(),
    updateShowBestTimes: vi.fn(),
    updateHideIfNeeded: vi.fn(),
    updateCollapseDisabledTimes: vi.fn(),
    updateStartCalendarOnMonday: vi.fn(),
  },
  curTimezone: {
    value: UTC,
    offset: Temporal.Duration.from({ hours: 0 }),
    label: "UTC",
    gmtString: "GMT+0",
  },
  timezoneModified: false,
  startCalendarOnMonday: false,
  showBestTimes: false,
  hideIfNeeded: false,
  collapseDisabledTimes: true,
  isWeekly: false,
  calendarPermissionGranted: false,
  weekOffset: 0,
  timezoneReferenceDate: Temporal.Instant.from(
    "2026-01-01T12:00:00Z",
  ).toZonedDateTimeISO(UTC),
  numResponses: 2,
  mobileNumDays: 3,
  showMobileNumDaysSwitch: true,
  allowScheduleEvent: true,
  timeType: timeTypes.HOUR12,
}

describe("ToolRow", () => {
  it("places the compact time-format switch and timezone selector on one row", () => {
    expect(toolRowSource).toContain(
      "compact && 'tool-row--compact tw:min-h-0 tw:justify-start'",
    )
    expect(toolRowSource).toContain(
      "compact && !mobileRow\n            ? 'tw:w-full tw:flex-col tw:items-start tw:justify-start tw:gap-0 tw:pb-0 tw:pt-14'\n            : ''",
    )
    expect(toolRowSource).toContain(
      "mobileRow &&\n            'tw:w-full tw:flex-col tw:items-stretch tw:justify-start tw:gap-y-2 tw:py-1'",
    )
    expect(toolRowSource).toContain('v-if="isCompact" class="tw:shrink-0"')
    expect(toolRowSource).toContain("<TimeFormatToggle")
    expect(toolRowSource).toContain(':model-value="toolRow.timeType"')
    expect(toolRowSource).toContain(
      '@update:model-value="toolRow.actions.updateTimeType"',
    )
    expect(toolRowSource).toContain(':compact="isCompact"')
    expect(toolRowSource).toContain(
      'v-if="!isCompact"\n              class="tw:order-first tw:text-sm tw:text-black"',
    )
    expect(toolRowSource).toContain('field-variant="solo"')
    expect(toolRowSource).toContain(':compact-button="true"')
  })

  it("places the mobile days switch on the first row, Show best times on the second, and More options on the third", () => {
    expect(toolRowSource).toContain('<template v-if="mobileRow">')
    expect(toolRowSource).toContain('v-if="!toolRow.event.daysOnly"')
    expect(toolRowSource).toContain('label: "3 days", value: 3')
    expect(toolRowSource).toContain('label: "7 days", value: 7')
    expect(toolRowSource).toContain(':options="mobileNumDaysOptions"')
    expect(toolRowSource).toContain(
      "typeof value === 'number' &&\n                    toolRow.actions.updateMobileNumDays(value)",
    )
    expect(toolRowSource).toContain('v-if="toolRow.showMobileNumDaysSwitch"')
    expect(toolRowSource).toContain(
      'v-if="!toolRow.event.daysOnly"\n            class="tw:flex tw:w-full tw:flex-row tw:items-center tw:gap-x-2"\n          >',
    )
    expect(toolRowSource).toContain("fit-content")
    expect(toolRowSource).toContain("fixed-width")
    expect(toolRowSource).not.toContain(
      'v-if="toolRow.state !== toolRow.states.EDIT_AVAILABILITY"',
    )
    expect(toolRowSource).toContain(
      'v-if="toolRow.numResponses >= 1 || collapseDisabledTimesDirect"',
    )
    expect(toolRowSource).toContain(
      'v-if="toolRow.numResponses >= 1 || collapseDisabledTimesDirect"\n            class="tw:flex tw:w-full tw:items-center"',
    )
    expect(toolRowSource).toContain('id="mobile-show-best-times-toggle"')
    expect(toolRowSource).toContain('v-if="toolRow.numResponses >= 1"')
    expect(toolRowSource).toContain("schedule-overlap-compact-switch tw:w-full")
    expect(toolRowSource).toContain(':model-value="toolRow.showBestTimes"')
    expect(toolRowSource).toContain(
      "toolRow.actions.updateShowBestTimes(!!val)",
    )
    expect(toolRowSource).toContain(
      'Show best {{ toolRow.event.daysOnly ? "days" : "times" }}',
    )
    expect(toolRowSource).toContain(
      "tw:whitespace-nowrap tw:text-sm tw:text-black",
    )
    expect(toolRowSource).toContain("<!-- Row 3: More options -->")
    expect(toolRowSource).toContain("<EventOptions")
    expect(toolRowSource).toContain('variant="menu"')
    expect(toolRowSource).toContain('menu-activator-class="tw:w-fit"')
    expect(toolRowSource).toContain('menu-button-label="More options"')
    expect(toolRowSource).toContain('menu-button-height="32"')
    expect(toolRowSource).toContain(':include-show-best-times="false"')
    expect(toolRowSource).toContain(
      'style scoped src="./ScheduleOverlapCompactSwitch.css"',
    )
  })

  it("shows the inline Show best times switch and More options menu when responses exist", async () => {
    isPhoneValue.value = true

    const updateShowBestTimes = vi.fn()

    const VSwitchStub = {
      props: ["id", "modelValue"],
      emits: ["update:modelValue"],
      template:
        '<div :id="id" class="event-options-switch" @click="$emit(\'update:modelValue\', !modelValue)"><slot name="label" /></div>',
    }

    const wrapper = shallowMount(ToolRow, {
      props: {
        toolRow: {
          ...baseToolRow,
          actions: {
            ...baseToolRow.actions,
            updateShowBestTimes,
          },
        },
        compact: true,
        mobileRow: true,
      },
      global: {
        stubs: {
          "v-btn": VBtnStub,
          "v-icon": true,
          "v-img": true,
          "v-list": passThroughStub,
          "v-list-item": passThroughStub,
          "v-list-item-content": passThroughStub,
          "v-list-item-title": passThroughStub,
          "v-menu": passThroughStub,
          "v-select": true,
          "v-spacer": true,
          EventOptions: false,
          GCalWeekSelector: true,
          TimezoneSelector: true,
          "v-switch": VSwitchStub,
        },
      },
    })

    const bestTimesToggle = wrapper.find("#mobile-show-best-times-toggle")
    expect(bestTimesToggle.exists()).toBe(true)
    expect(wrapper.text()).toContain("Show best times")
    expect(wrapper.text()).toContain("More options")
    expect(wrapper.text()).toContain("Collapse disabled times")

    await bestTimesToggle.trigger("click")

    expect(updateShowBestTimes).toHaveBeenCalledWith(true)

    isPhoneValue.value = false
  })

  it("shows the inline Collapse disabled times switch instead of More options on mobile with zero responses", async () => {
    isPhoneValue.value = true

    const VSwitchStub = {
      props: ["id", "modelValue"],
      emits: ["update:modelValue"],
      template:
        '<div :id="id" class="event-options-switch" @click="$emit(\'update:modelValue\', !modelValue)"><slot name="label" /></div>',
    }

    const updateCollapseDisabledTimes = vi.fn()

    const wrapper = shallowMount(ToolRow, {
      props: {
        toolRow: {
          ...baseToolRow,
          numResponses: 0,
          actions: {
            ...baseToolRow.actions,
            updateCollapseDisabledTimes,
          },
        },
        compact: true,
        mobileRow: true,
      },
      global: {
        stubs: {
          "v-btn": VBtnStub,
          "v-icon": true,
          "v-img": true,
          "v-list": passThroughStub,
          "v-list-item": passThroughStub,
          "v-list-item-content": passThroughStub,
          "v-list-item-title": passThroughStub,
          "v-menu": passThroughStub,
          "v-select": true,
          "v-spacer": true,
          EventOptions: false,
          GCalWeekSelector: true,
          TimezoneSelector: true,
          "v-switch": VSwitchStub,
        },
      },
    })

    expect(wrapper.find("#mobile-show-best-times-toggle").exists()).toBe(false)
    expect(
      wrapper.find("#mobile-collapse-disabled-times-toggle").exists(),
    ).toBe(true)
    expect(wrapper.text()).toContain("Collapse disabled times")
    expect(wrapper.text()).not.toContain("More options")
    expect(wrapper.text()).not.toContain("Show best times")
    expect(wrapper.text()).not.toContain("Hide if needed times")

    const collapseDisabledTimesToggle = wrapper.find(
      "#mobile-collapse-disabled-times-toggle",
    )
    expect(collapseDisabledTimesToggle.exists()).toBe(true)

    await collapseDisabledTimesToggle.trigger("click")

    expect(updateCollapseDisabledTimes).toHaveBeenCalledWith(false)

    isPhoneValue.value = false
  })

  it("keeps the inline Collapse disabled times switch in row 2 while editing with zero responses", async () => {
    isPhoneValue.value = true

    const VSwitchStub = {
      props: ["id", "modelValue"],
      emits: ["update:modelValue"],
      template:
        '<div :id="id" class="event-options-switch" @click="$emit(\'update:modelValue\', !modelValue)"><slot name="label" /></div>',
    }

    const updateCollapseDisabledTimes = vi.fn()

    const wrapper = shallowMount(ToolRow, {
      props: {
        toolRow: {
          ...baseToolRow,
          state: states.EDIT_AVAILABILITY,
          numResponses: 0,
          actions: {
            ...baseToolRow.actions,
            updateCollapseDisabledTimes,
          },
        },
        compact: true,
        mobileRow: true,
      },
      global: {
        stubs: {
          "v-btn": VBtnStub,
          "v-icon": true,
          "v-img": true,
          "v-list": passThroughStub,
          "v-list-item": passThroughStub,
          "v-list-item-content": passThroughStub,
          "v-list-item-title": passThroughStub,
          "v-menu": passThroughStub,
          "v-select": true,
          "v-spacer": true,
          EventOptions: false,
          GCalWeekSelector: true,
          TimezoneSelector: true,
          "v-switch": VSwitchStub,
        },
      },
    })

    expect(wrapper.find("#mobile-show-best-times-toggle").exists()).toBe(false)
    expect(
      wrapper.find("#mobile-collapse-disabled-times-toggle").exists(),
    ).toBe(true)
    expect(wrapper.text()).toContain("Collapse disabled times")
    expect(wrapper.text()).not.toContain("More options")

    await wrapper
      .find("#mobile-collapse-disabled-times-toggle")
      .trigger("click")

    expect(updateCollapseDisabledTimes).toHaveBeenCalledWith(false)

    isPhoneValue.value = false
  })

  it("keeps Show best times in row 2 and More options in row 3 while editing with responses", () => {
    isPhoneValue.value = true

    const VSwitchStub = {
      props: ["id"],
      template:
        '<div :id="id" class="event-options-switch"><slot name="label" /></div>',
    }

    const wrapper = shallowMount(ToolRow, {
      props: {
        toolRow: {
          ...baseToolRow,
          state: states.EDIT_AVAILABILITY,
        },
        compact: true,
        mobileRow: true,
      },
      global: {
        stubs: {
          "v-btn": VBtnStub,
          "v-icon": true,
          "v-img": true,
          "v-list": passThroughStub,
          "v-list-item": passThroughStub,
          "v-list-item-content": passThroughStub,
          "v-list-item-title": passThroughStub,
          "v-menu": passThroughStub,
          "v-select": true,
          "v-spacer": true,
          EventOptions: false,
          GCalWeekSelector: true,
          TimezoneSelector: true,
          "v-switch": VSwitchStub,
        },
      },
    })

    expect(wrapper.find("#mobile-show-best-times-toggle").exists()).toBe(true)
    expect(wrapper.text()).toContain("Show best times")
    expect(wrapper.text()).toContain("More options")
    expect(
      wrapper.find("#mobile-collapse-disabled-times-toggle").exists(),
    ).toBe(false)

    isPhoneValue.value = false
  })

  it("keeps the More options menu for mobile days-only events with zero responses", () => {
    isPhoneValue.value = true

    const VSwitchStub = {
      props: ["id"],
      template:
        '<div :id="id" class="event-options-switch"><slot name="label" /></div>',
    }

    const wrapper = shallowMount(ToolRow, {
      props: {
        toolRow: {
          ...baseToolRow,
          numResponses: 0,
          event: {
            ...baseToolRow.event,
            daysOnly: true,
          },
        },
        compact: true,
        mobileRow: true,
      },
      global: {
        stubs: {
          "v-btn": VBtnStub,
          "v-icon": true,
          "v-img": true,
          "v-list": passThroughStub,
          "v-list-item": passThroughStub,
          "v-list-item-content": passThroughStub,
          "v-list-item-title": passThroughStub,
          "v-menu": passThroughStub,
          "v-select": true,
          "v-spacer": true,
          EventOptions: false,
          GCalWeekSelector: true,
          TimezoneSelector: true,
          "v-switch": VSwitchStub,
        },
      },
    })

    expect(wrapper.find("#mobile-show-best-times-toggle").exists()).toBe(false)
    expect(
      wrapper.find("#mobile-collapse-disabled-times-toggle").exists(),
    ).toBe(false)
    expect(wrapper.text()).toContain("More options")
    expect(wrapper.text()).not.toContain("Collapse disabled times")
    expect(wrapper.text()).not.toContain("Show best times")

    isPhoneValue.value = false
  })

  it("emits the days switch update from the mobile 3d and 7d options", async () => {
    const updateMobileNumDays = vi.fn()

    const wrapper = shallowMount(ToolRow, {
      props: {
        toolRow: {
          ...baseToolRow,
          actions: {
            ...baseToolRow.actions,
            updateMobileNumDays,
          },
        },
        compact: true,
        mobileRow: true,
      },
      global: {
        stubs: {
          "v-btn": VBtnStub,
          "v-icon": true,
          "v-img": true,
          "v-list": passThroughStub,
          "v-list-item": passThroughStub,
          "v-list-item-content": passThroughStub,
          "v-list-item-title": passThroughStub,
          "v-menu": passThroughStub,
          "v-select": true,
          "v-spacer": true,
          EventOptions: true,
          GCalWeekSelector: true,
          TimezoneSelector: true,
          TimeFormatToggle: false,
        },
      },
    })

    const daysToggleOptions = wrapper
      .findAll(".time-format-toggle")[1]
      .findAll(".time-format-toggle__option")
    expect(daysToggleOptions[0].text()).toBe("3 days")
    expect(daysToggleOptions[1].text()).toBe("7 days")

    await daysToggleOptions[1].trigger("click")

    expect(updateMobileNumDays).toHaveBeenCalledWith(7)
  })

  it("keeps the days switch and the left-aligned first row when the grid spans more than 3 day columns", () => {
    isPhoneValue.value = true

    const wrapper = shallowMount(ToolRow, {
      props: {
        toolRow: { ...baseToolRow },
        compact: true,
        mobileRow: true,
      },
      global: {
        stubs: {
          "v-btn": VBtnStub,
          "v-icon": true,
          "v-img": true,
          "v-list": passThroughStub,
          "v-list-item": passThroughStub,
          "v-list-item-content": passThroughStub,
          "v-list-item-title": passThroughStub,
          "v-menu": passThroughStub,
          "v-select": true,
          "v-spacer": true,
          EventOptions: true,
          GCalWeekSelector: true,
          TimezoneSelector: true,
          TimeFormatToggle: false,
        },
      },
    })

    expect(wrapper.findAll(".time-format-toggle").length).toBe(2)
    expect(wrapper.text()).toContain("3 days")
    expect(wrapper.text()).toContain("7 days")

    const rowOne = wrapper
      .findAll("div")
      .find((div) => div.classes().includes("tw:flex-row"))
    expect(rowOne).toBeDefined()
    expect(rowOne?.classes()).toContain("tw:gap-x-2")
    expect(rowOne?.classes()).not.toContain("tw:justify-between")
    expect(rowOne?.classes()).not.toContain("tw:justify-center")

    isPhoneValue.value = false
  })

  it("hides the days switch and keeps the time format and timezone row left-aligned when the grid spans 3 or fewer day columns", () => {
    isPhoneValue.value = true

    const wrapper = shallowMount(ToolRow, {
      props: {
        toolRow: {
          ...baseToolRow,
          showMobileNumDaysSwitch: false,
        },
        compact: true,
        mobileRow: true,
      },
      global: {
        stubs: {
          "v-btn": VBtnStub,
          "v-icon": true,
          "v-img": true,
          "v-list": passThroughStub,
          "v-list-item": passThroughStub,
          "v-list-item-content": passThroughStub,
          "v-list-item-title": passThroughStub,
          "v-menu": passThroughStub,
          "v-select": true,
          "v-spacer": true,
          EventOptions: true,
          GCalWeekSelector: true,
          TimezoneSelector: true,
          TimeFormatToggle: false,
        },
      },
    })

    expect(wrapper.findAll(".time-format-toggle").length).toBe(1)
    expect(wrapper.text()).not.toContain("3 days")
    expect(wrapper.text()).not.toContain("7 days")

    const rowOne = wrapper
      .findAll("div")
      .find((div) => div.classes().includes("tw:flex-row"))
    expect(rowOne).toBeDefined()
    expect(rowOne?.classes()).toContain("tw:gap-x-2")
    expect(rowOne?.classes()).not.toContain("tw:justify-center")
    expect(rowOne?.classes()).not.toContain("tw:justify-between")

    isPhoneValue.value = false
  })
})

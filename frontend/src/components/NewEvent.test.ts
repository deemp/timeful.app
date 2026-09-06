// @vitest-environment happy-dom

import { readFileSync } from "node:fs"
import {
  flushPromises,
  shallowMount as baseShallowMount,
} from "@vue/test-utils"
import { defineComponent, nextTick, ref } from "vue"
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest"
import { durations } from "@/constants"
import { Temporal } from "temporal-polyfill"
import { createLocalStorageMock } from "@/test/localStorage"
import {
  buildEventEditorStubs,
  type ComponentStubMap,
  vSelectStub as VSelectStub,
} from "@/test/componentStubs"
import type * as UtilsModule from "@/utils"
import NewEvent from "./NewEvent.vue"
import newEventSource from "./NewEvent.vue?raw"
import timeRangePickerSource from "./TimeRangePicker.vue?raw"

const mountedWrappers: ReturnType<typeof baseShallowMount>[] = []
const shallowMount: typeof baseShallowMount = (...args) => {
  const wrapper = baseShallowMount(...args)
  mountedWrappers.push(wrapper)
  return wrapper
}

const { postMock, putMock } = vi.hoisted(() => ({
  postMock: vi.fn(),
  putMock: vi.fn(),
}))

const { routerPushMock, routerReplaceMock } = vi.hoisted(() => ({
  routerPushMock: vi.fn(),
  routerReplaceMock: vi.fn(),
}))

const mockAuthUser = ref<unknown>(null)
const mockDaysOnlyEnabled = ref(true)

vi.mock("@/utils", async () => {
  const actual = await vi.importActual<typeof UtilsModule>("@/utils")

  return {
    ...actual,
    post: postMock,
    put: putMock,
  }
})

vi.mock("vue-router", () => ({
  useRouter: () => ({
    push: routerPushMock,
    replace: routerReplaceMock,
  }),
}))

vi.mock("pinia", () => ({
  storeToRefs: (store: { authUser: unknown; daysOnlyEnabled: unknown }) => ({
    authUser: store.authUser,
    daysOnlyEnabled: store.daysOnlyEnabled,
  }),
}))

vi.mock("@/stores/main", () => ({
  useMainStore: () => ({
    authUser: mockAuthUser,
    daysOnlyEnabled: mockDaysOnlyEnabled,
    showInfo: vi.fn(),
    showError: vi.fn(),
  }),
}))

vi.mock("@/plugins/posthog", () => ({
  posthog: {
    capture: vi.fn(),
    get_distinct_id: vi.fn(() => "distinct-id"),
  },
}))

const formRefMethods = {
  validate: vi.fn<() => Promise<{ valid: boolean }>>(() =>
    Promise.resolve({ valid: true }),
  ),
  resetValidation: vi.fn<() => void>(() => undefined),
}

const defaultStubs: ComponentStubMap = buildEventEditorStubs(formRefMethods)

const DatePickerModelStub = {
  name: "DatePicker",
  props: {
    modelValue: {
      type: Array,
      required: true,
    },
  },
  emits: ["update:modelValue"],
  template: "<div />",
}

const VCheckboxSlotStub = {
  name: "VCheckbox",
  inheritAttrs: false,
  props: {
    class: {
      type: [String, Array, Object],
      default: undefined,
    },
    messages: {
      type: String,
      default: "",
    },
  },
  template: `
    <div class="v-checkbox-stub" :class="$props.class">
      <div class="v-checkbox-stub__label"><slot name="label" /></div>
      <div class="v-checkbox-stub__message">
        <slot name="message" :message="messages" />
      </div>
    </div>
  `,
}

const VSwitchSlotStub = {
  name: "VSwitch",
  inheritAttrs: false,
  props: {
    class: {
      type: [String, Array, Object],
      default: undefined,
    },
    messages: {
      type: String,
      default: "",
    },
  },
  template: `
    <div class="v-switch-stub" :class="$props.class">
      <div class="v-switch-stub__label"><slot name="label" /></div>
      <div class="v-switch-stub__message">
        <slot name="message" :message="messages" />
      </div>
    </div>
  `,
}

const TimezoneSelectorStub = {
  name: "TimezoneSelector",
  emits: ["update:modelValue"],
  template: `
    <button
      data-testid="timezone-selector-stub"
      @click="$emit('update:modelValue', {
        value: 'America/New_York',
        label: 'Eastern Time',
        gmtString: 'GMT-5',
        offset: '-PT5H',
      })"
    >Timezone selector</button>
  `,
}

const TimeFormatToggleStub = {
  name: "TimeFormatToggle",
  props: {
    modelValue: {
      type: [String, Number],
      default: undefined,
    },
    options: {
      type: Array,
      default: () => [],
    },
  },
  emits: ["update:modelValue"],
  template: `
    <div
      data-testid="time-format-toggle-stub"
      :data-model-value="String(modelValue)"
    >
      <span
        v-for="option in options"
        :key="option.value"
        :data-value="String(option.value)"
        :data-active="String(option.value === modelValue)"
        @click="$emit('update:modelValue', option.value)"
      >{{ option.label }}</span>
    </div>
  `,
}

const VBtnStub = defineComponent({
  name: "VBtn",
  props: {
    class: {
      type: [String, Array, Object],
      default: undefined,
    },
    color: {
      type: String,
      default: undefined,
    },
    disabled: {
      type: Boolean,
      default: false,
    },
  },
  template: `
    <button
      class="v-btn-stub"
      :class="$props.class"
      :data-color="color"
      :disabled="disabled"
    >
      <slot />
    </button>
  `,
})

const VTextFieldCaptureStub = defineComponent({
  name: "VTextField",
  props: {
    modelValue: {
      type: [String, Number],
      default: "",
    },
    label: {
      type: String,
      default: undefined,
    },
    placeholder: {
      type: String,
      default: undefined,
    },
    variant: {
      type: String,
      default: undefined,
    },
    appendInnerIcon: {
      type: String,
      default: undefined,
    },
    maxlength: {
      type: [Number, String],
      default: undefined,
    },
    rules: {
      type: Array,
      default: () => [],
    },
  },
  emits: ["update:modelValue"],
  template: `
    <input
      :value="modelValue"
      :placeholder="placeholder"
      :maxlength="maxlength"
      @input="$emit('update:modelValue', $event.target.value)"
    />
  `,
})

const newEventStyleBlock =
  /<style>([\s\S]*)<\/style>/.exec(newEventSource)?.[1] ?? ""
const appCssSource = readFileSync("src/index.css", "utf8")
const compactSwitchCssSource = readFileSync(
  "src/components/schedule_overlap/ScheduleOverlapCompactSwitch.css",
  "utf8",
)
const dayOfWeekButtonSnippet =
  /<v-btn\s+v-for="day in dayOfWeekButtons"[\s\S]*?<\/v-btn>/.exec(
    newEventSource,
  )?.[0] ?? ""

describe("NewEvent", () => {
  afterEach(() => {
    for (const wrapper of mountedWrappers.splice(0)) wrapper.unmount()
    document.body.replaceChildren()
    vi.useRealTimers()
    vi.unstubAllGlobals()
  })

  beforeEach(() => {
    vi.stubGlobal("localStorage", createLocalStorageMock())
    mockAuthUser.value = null
    mockDaysOnlyEnabled.value = true
    postMock.mockReset()
    putMock.mockReset()
    postMock.mockResolvedValue({ eventId: "evt-created" })
    putMock.mockResolvedValue(undefined)
    routerPushMock.mockReset()
    routerReplaceMock.mockReset()
    formRefMethods.validate.mockClear()
    formRefMethods.resetValidation.mockClear()
  })

  it("does not throw when editing an event whose dates array is empty", () => {
    expect(() =>
      shallowMount(NewEvent, {
        props: {
          edit: true,
          event: {
            _id: "evt-1",
            name: "Broken event",
            dates: [],
            duration: durations.ONE_HOUR,
          },
        },
        global: {
          stubs: defaultStubs,
        },
      }),
    ).not.toThrow()
  })

  it("imports every component it renders in its template", () => {
    const templateSource =
      /<template>([\s\S]*)<\/template>/.exec(newEventSource)?.[1] ?? ""
    const renderedComponents = Array.from(
      new Set(
        Array.from(templateSource.matchAll(/<([A-Z][A-Za-z0-9]*)/g)).map(
          (match) => match[1],
        ),
      ),
    )
    const importedComponents = Array.from(
      newEventSource.matchAll(
        /import (\w+)(?:, \{[^}]*\})? from "[^"]+\.vue"/g,
      ),
    ).map((match) => match[1])

    expect(renderedComponents.length).toBeGreaterThan(0)
    for (const component of renderedComponents) {
      expect(
        importedComponents,
        `NewEvent.vue renders <${component}> without importing it`,
      ).toContain(component)
    }
  })

  it("emits an explicit refresh event after editing instead of reloading the page", async () => {
    const wrapper = shallowMount(NewEvent, {
      props: {
        edit: true,
        event: {
          _id: "evt-1",
          name: "Edited event",
          type: "specific_dates",
          dates: [Temporal.PlainDate.from("2026-01-02")],
          duration: durations.ONE_HOUR,
        },
      },
      global: {
        stubs: {
          ...defaultStubs,
          TimezoneSelector: TimezoneSelectorStub,
        },
      },
    })

    await wrapper
      .findAll("button")
      .find((button) => button.text().includes("Save edits"))
      ?.trigger("click")
    await flushPromises()

    expect(putMock).toHaveBeenCalledTimes(1)
    expect(wrapper.emitted("refresh-event")).toEqual([
      [expect.objectContaining({ fromEditEvent: false, eventTimezone: "UTC" })],
    ])
  })

  it("persists the selected timezone when saving a day-only event", async () => {
    localStorage.setItem(
      "timezone",
      JSON.stringify({
        value: "America/New_York",
        offset: "-PT5H",
        label: "Eastern Time",
        gmtString: "GMT-5",
      }),
    )
    const wrapper = shallowMount(NewEvent, {
      props: {
        edit: true,
        event: {
          _id: "evt-legacy",
          name: "Day-only event",
          type: "specific_dates",
          dates: [Temporal.PlainDate.from("2026-06-15")],
          daysOnly: true,
        },
      },
      global: {
        stubs: {
          ...defaultStubs,
          TimezoneSelector: TimezoneSelectorStub,
        },
      },
    })

    const vm = wrapper.vm as unknown as {
      submit?: () => Promise<void>
      $: { setupState?: { submit?: () => Promise<void> } }
    }

    await wrapper.get('[data-testid="timezone-selector-stub"]').trigger("click")
    await nextTick()
    await (vm.submit ?? vm.$.setupState?.submit)?.()
    await flushPromises()

    expect(putMock).toHaveBeenCalledWith(
      "/events/evt-legacy",
      expect.objectContaining({ eventTimezone: "America/New_York" }),
    )
  })

  it("rehydrates the persisted timezone when reopening a day-only event", async () => {
    const wrapper = shallowMount(NewEvent, {
      props: {
        edit: true,
        event: {
          _id: "evt-phoenix",
          name: "Day-only event",
          type: "specific_dates",
          dates: [Temporal.PlainDate.from("2026-06-15")],
          daysOnly: true,
          eventTimezone: "America/Phoenix",
        },
        isDialogOpen: false,
      },
      global: {
        stubs: defaultStubs,
      },
    })

    const vm = wrapper.vm as unknown as {
      timezone?: { value: string }
      $: { setupState?: { timezone?: { value: string } } }
    }
    const timezone = () => vm.timezone ?? vm.$.setupState?.timezone

    expect(timezone()?.value).toBe("America/Phoenix")

    await wrapper.setProps({
      event: {
        _id: "evt-phoenix",
        name: "Day-only event",
        type: "specific_dates",
        dates: [Temporal.PlainDate.from("2026-06-15")],
        daysOnly: true,
        eventTimezone: "America/Tijuana",
      },
      isDialogOpen: true,
    })

    expect(timezone()?.value).toBe("America/Tijuana")
  })

  it("emits a specific-times edit draft that clears stale saved times when dates change", async () => {
    const wrapper = shallowMount(NewEvent, {
      props: {
        edit: true,
        event: {
          _id: "evt-2",
          name: "Edited event",
          type: "specific_dates",
          dates: [
            Temporal.PlainDate.from("2026-05-30"),
            Temporal.PlainDate.from("2026-05-31"),
          ],
          timeSeed: Temporal.Instant.from(
            "2026-05-30T09:00:00Z",
          ).toZonedDateTimeISO("UTC"),
          duration: durations.ONE_HOUR,
          hasSpecificTimes: true,
          timeIncrement: durations.FIFTEEN_MINUTES,
        },
      },
      global: {
        stubs: {
          ...defaultStubs,
          DatePicker: DatePickerModelStub,
        },
      },
    })

    const datePicker = wrapper.getComponent(DatePickerModelStub)
    ;(
      datePicker.vm as {
        $emit: (event: "update:modelValue", value: string[]) => void
      }
    ).$emit("update:modelValue", ["2026-05-28", "2026-05-29"])
    await nextTick()

    const nextButton = wrapper
      .findAll("button")
      .find((button) => button.text().includes("Next"))

    if (!nextButton) {
      throw new Error("Expected specific-times flow to render a Next button")
    }

    await nextButton.trigger("click")
    await flushPromises()

    expect(putMock).toHaveBeenCalledTimes(1)
    const refreshEvents = wrapper.emitted("refresh-event")

    expect(refreshEvents).toHaveLength(1)
    if (!refreshEvents) {
      throw new Error(
        "Expected refresh-event emission after saving specific times",
      )
    }

    expect(refreshEvents[0]?.[0]).toMatchObject({
      fromEditEvent: true,
      specificTimesEditDraft: {
        resetExistingTimes: true,
        timeIncrementMinutes: 15,
      },
    })
  })

  it("creates specific-times events with an empty canonical active subset and routes into the handoff flow", async () => {
    const wrapper = shallowMount(NewEvent, {
      global: {
        stubs: defaultStubs,
      },
    })

    const vm = wrapper.vm as unknown as {
      name: string
      description: string
      selectedDays: Temporal.PlainDate[]
      specificTimesEnabled: boolean
    }
    vm.name = "Created timed event"
    vm.description = "First line\nSecond line"
    vm.selectedDays = [
      Temporal.PlainDate.from("2026-05-28"),
      Temporal.PlainDate.from("2026-05-29"),
    ]
    vm.specificTimesEnabled = true
    await nextTick()

    await wrapper
      .findAll("button")
      .find((button) => button.text().includes("Next"))
      ?.trigger("click")
    await flushPromises()

    expect(postMock).toHaveBeenCalledTimes(1)
    expect(postMock).toHaveBeenCalledWith(
      "/events",
      expect.objectContaining({
        activeSlots: [],
        description: "First line\nSecond line",
      }),
    )
    expect(postMock.mock.calls[0]?.[1]).not.toHaveProperty("enabledSlots")
    const pushedState = (
      routerPushMock.mock.calls[0]?.[0] as {
        state?: {
          timefulSpecificTimesEntry?: {
            mode?: string
            draft?: {
              activeSlots?: string[]
              resetExistingTimes?: boolean
            }
          }
        }
      }
    ).state
    expect(routerPushMock).toHaveBeenCalledWith(
      expect.objectContaining({
        name: "event",
      }),
    )
    expect(pushedState?.timefulSpecificTimesEntry?.mode).toBe("create")
    expect(pushedState?.timefulSpecificTimesEntry?.draft?.activeSlots).toEqual(
      [],
    )
    expect(
      pushedState?.timefulSpecificTimesEntry?.draft?.resetExistingTimes,
    ).toBe(true)
  })

  it("includes the saved description when editing an event", async () => {
    const wrapper = shallowMount(NewEvent, {
      props: {
        edit: true,
        event: {
          _id: "evt-1",
          name: "Edited event",
          type: "specific_dates",
          dates: [Temporal.PlainDate.from("2026-01-02")],
          duration: durations.ONE_HOUR,
          description: "Saved description",
        },
      },
      global: { stubs: defaultStubs },
    })

    const vm = wrapper.vm as unknown as {
      description: string
      submit?: () => Promise<void>
      $: { setupState?: { submit?: () => Promise<void> } }
    }
    expect(vm.description).toBe("Saved description")
    await (vm.submit ?? vm.$.setupState?.submit)?.()
    await flushPromises()

    expect(putMock.mock.calls[0]?.[1]).toHaveProperty(
      "description",
      "Saved description",
    )
  })

  it("includes an explicitly cleared description when editing an event", async () => {
    const wrapper = shallowMount(NewEvent, {
      props: {
        edit: true,
        event: {
          _id: "evt-1",
          name: "Edited event",
          type: "specific_dates",
          dates: [Temporal.PlainDate.from("2026-01-02")],
          duration: durations.ONE_HOUR,
          description: "Saved description",
        },
      },
      global: { stubs: defaultStubs },
    })

    const vm = wrapper.vm as unknown as {
      description: string
      submit?: () => Promise<void>
      $: { setupState?: { submit?: () => Promise<void> } }
    }
    vm.description = ""
    await (vm.submit ?? vm.$.setupState?.submit)?.()
    await flushPromises()

    expect(putMock.mock.calls[0]?.[1]).toHaveProperty("description", "")
  })

  it("defaults Start on Monday to enabled for new events", () => {
    const wrapper = shallowMount(NewEvent, {
      global: {
        stubs: defaultStubs,
      },
    })

    const vm = wrapper.vm as unknown as { startOnMonday: boolean }
    expect(vm.startOnMonday).toBe(true)
  })

  it("passes explicit Vuetify 3 item mappings to event time and date option selects", () => {
    const wrapper = shallowMount(NewEvent, {
      global: {
        stubs: {
          ...defaultStubs,
          TimeRangePicker: false,
          "v-select": VSelectStub,
        },
      },
    })

    const selects = wrapper.findAllComponents(VSelectStub)
    const menuProps = {
      minWidth: "clamp(100px, calc(100px + (100vw - 350px) * 20 / 50), 120px)",
      maxWidth: "clamp(100px, calc(100px + (100vw - 350px) * 20 / 50), 120px)",
    }

    expect(selects).toHaveLength(3)
    expect(selects[0]?.props("itemTitle")).toBe("text")
    expect(selects[0]?.props("itemValue")).toBe("value")
    expect(selects[0]?.props("itemColor")).toBeUndefined()
    expect(selects[0]?.props("menuProps")).toEqual(menuProps)
    expect(selects[0]?.props("variant")).toBe("solo")
    expect(selects[0]?.props("items")).toEqual(
      expect.arrayContaining([
        expect.objectContaining({ text: "09:00", value: 9 }),
        expect.objectContaining({ text: "17:00", value: 17 }),
      ]),
    )
    expect(selects[1]?.props("itemTitle")).toBe("text")
    expect(selects[1]?.props("itemValue")).toBe("value")
    expect(selects[1]?.props("itemColor")).toBeUndefined()
    expect(selects[1]?.props("menuProps")).toEqual(menuProps)
    expect(selects[1]?.props("variant")).toBe("solo")
    expect(selects[2]?.props("itemColor")).toBeUndefined()
    expect(selects[2]?.props("variant")).toBe("solo")
  })

  it("renders the time increment as a segmented toggle with 15/30/60 minute options", () => {
    const wrapper = shallowMount(NewEvent, {
      global: {
        stubs: {
          ...defaultStubs,
          "v-select": VSelectStub,
          TimeFormatToggle: TimeFormatToggleStub,
        },
      },
    })

    const toggle = wrapper.get(
      ".advanced-options-panel [data-testid='time-format-toggle-stub']",
    )
    const options = toggle.findAll("span")
    expect(options).toHaveLength(3)
    expect(options.map((option) => option.text())).toEqual([
      "15 min",
      "30 min",
      "60 min",
    ])
    expect(options[0]?.attributes("data-active")).toBe("true")
    expect(toggle.attributes("data-model-value")).toBe("15")
  })

  it("updates the time increment when a toggle option is selected", async () => {
    const wrapper = shallowMount(NewEvent, {
      global: {
        stubs: {
          ...defaultStubs,
          "v-select": VSelectStub,
          TimeFormatToggle: TimeFormatToggleStub,
        },
      },
    })

    await wrapper
      .get(".advanced-options-panel [data-testid='time-format-toggle-stub']")
      .findAll("span")
      .find((option) => option.text() === "60 min")
      ?.trigger("click")

    const vm = wrapper.vm as unknown as {
      timeIncrement?: number
      $: { setupState?: { timeIncrement?: number } }
    }
    expect(vm.timeIncrement ?? vm.$.setupState?.timeIncrement).toBe(60)
  })

  it("renders advanced event options inline without an expandable toggle", () => {
    const wrapper = shallowMount(NewEvent, {
      global: {
        stubs: {
          ...defaultStubs,
          "v-switch": VSwitchSlotStub,
          "v-select": VSelectStub,
          TimezoneSelector: TimezoneSelectorStub,
        },
      },
    })

    expect(wrapper.text()).toContain("Advanced options")
    expect(wrapper.text()).toContain("Time increment")
    expect(wrapper.get('[data-testid="timezone-selector-stub"]').text()).toBe(
      "Timezone selector",
    )
    expect(
      wrapper
        .findAll("button")
        .some((button) => /advanced options/i.exec(button.text()) !== null),
    ).toBe(false)
    expect(newEventSource).toContain(
      'class="tw-flex tw-items-center tw-gap-x-2"',
    )
    expect(newEventSource).toContain('data-testid="timezone-label"')
    expect(newEventSource).toMatch(
      /data-testid="timezone-label"\s*>\s*Timezone\s*<\/div>/,
    )
  })

  it("renders the timezone selector in compact form like the event page", () => {
    const timezoneSelectorSnippet =
      /<TimezoneSelector[\s\S]*?\/>/.exec(newEventSource)?.[0] ?? ""

    expect(timezoneSelectorSnippet).not.toContain('label="Timezone"')
    expect(timezoneSelectorSnippet).toContain("compact")
    expect(timezoneSelectorSnippet).toContain("fit-content")
    expect(timezoneSelectorSnippet).toContain("fixed-width")
    expect(timezoneSelectorSnippet).toContain('field-variant="solo"')
    expect(timezoneSelectorSnippet).toContain("compact-button")
  })

  it("places the timezone label to the left of the fixed-width selector", () => {
    const timezoneRowSnippet =
      /<div class="tw-flex tw-items-center tw-gap-x-2">[\s\S]*?data-testid="timezone-label"[\s\S]*?fixed-width[\s\S]*?<\/div>/.exec(
        newEventSource,
      )?.[0] ?? ""

    expect(timezoneRowSnippet).toContain('data-testid="timezone-label"')
    expect(timezoneRowSnippet).toMatch(
      /data-testid="timezone-label"\s*>\s*Timezone\s*<\/div>/,
    )
    expect(timezoneRowSnippet).toContain("fixed-width")
  })

  it("does not offer a timezone reset in the new event form", () => {
    const timezoneSelectorSnippet =
      /<TimezoneSelector[\s\S]*?\/>/.exec(newEventSource)?.[0] ?? ""

    expect(timezoneSelectorSnippet).toContain(':show-reset="false"')
    expect(timezoneSelectorSnippet).not.toContain("@reset")
    expect(timezoneSelectorSnippet).not.toContain(":modified=")
  })

  it("hides the time increment for dates-only events", async () => {
    const wrapper = shallowMount(NewEvent, {
      global: {
        stubs: {
          ...defaultStubs,
          "v-select": VSelectStub,
        },
      },
    })

    const vm = wrapper.vm as unknown as { daysOnly: boolean }
    vm.daysOnly = true
    await nextTick()

    expect(wrapper.text()).toContain("Advanced options")
    expect(wrapper.text()).not.toContain("Time increment")
  })

  it("shows the time increment as a toggle for edited timed events", () => {
    const wrapper = shallowMount(NewEvent, {
      props: {
        edit: true,
      },
      global: {
        stubs: {
          ...defaultStubs,
          "v-select": VSelectStub,
          TimeFormatToggle: TimeFormatToggleStub,
        },
      },
    })

    expect(wrapper.text()).toContain("Time increment")
    expect(
      wrapper
        .find(".advanced-options-panel [data-testid='time-format-toggle-stub']")
        .exists(),
    ).toBe(true)
  })

  it("uses a compact numeric reminder threshold field and preserves its enabled gating", () => {
    expect(newEventSource).toContain('v-model="sendEmailAfterXResponses"')
    expect(newEventSource).toContain(
      ':disabled="!sendEmailAfterXResponsesEnabled"',
    )
    expect(newEventSource).toContain('density="compact"')
    expect(newEventSource).not.toContain(
      ':disabled="!sendEmailAfterXResponsesEnabled"\n                      dense',
    )
  })

  it("defines shared semantic styling tokens at the app layer", () => {
    expect(appCssSource).toMatch(/:root\s*\{/)
    expect(appCssSource).toMatch(/--timeful-selection-bg:\s*#f2faf6;/)
    expect(appCssSource).toMatch(/--timeful-selection-fg:\s*#00994c;/)
    expect(appCssSource).toMatch(/--timeful-error-foreground:\s*#dc2626;/i)
    expect(appCssSource).toMatch(/--timeful-unavailable-bg:\s*#e523230d;/i)
    expect(appCssSource).toMatch(
      /--timeful-unavailable-bg-time-grid:\s*#f9cccc;/i,
    )
    expect(appCssSource).toMatch(
      /--timeful-unavailable-bg-day-grid:\s*#e523233b;/i,
    )
    expect(appCssSource).toMatch(/--timeful-grid-line-color:\s*#999999;/i)
    expect(appCssSource).toMatch(/--timeful-grid-line-width:\s*1px;/i)
    expect(appCssSource).toMatch(/--timeful-grid-line-half-width:\s*0\.5px;/i)
    expect(appCssSource).toMatch(
      /--timeful-grid-separator:\s*var\(--timeful-grid-line-color\);/i,
    )
    expect(appCssSource).toMatch(
      /--timeful-grid-hour-separator:\s*var\(--timeful-grid-line-color\);/i,
    )
    expect(appCssSource).toMatch(
      /--timeful-grid-separator-strong:\s*var\(--timeful-grid-line-color\);/i,
    )
    expect(appCssSource).toMatch(
      /--timeful-grid-separator-soft:\s*var\(--timeful-grid-line-color\);/i,
    )
    expect(appCssSource).toMatch(
      /--timeful-muted-foreground:\s*rgba\(0,\s*0,\s*0,\s*0\.6\);/,
    )
    expect(appCssSource).toMatch(
      /--timeful-disabled-foreground:\s*rgba\(0,\s*0,\s*0,\s*0\.38\);/,
    )
    expect(appCssSource).toMatch(
      /--timeful-disabled-checkbox-icon:\s*#aaaaaa;/i,
    )
    expect(appCssSource).toMatch(/--timeful-emphasis-foreground:\s*#4f4f4f;/i)
    expect(appCssSource).toMatch(/--timeful-primary-action-bg:\s*#00994c;/i)
    expect(appCssSource).toMatch(/--timeful-primary-action-fg:\s*#ffffff;/i)
    expect(appCssSource).toMatch(
      /--timeful-primary-action-disabled-bg:\s*rgba\(0,\s*0,\s*0,\s*0\.12\);/i,
    )
    expect(appCssSource).toMatch(
      /--timeful-primary-action-disabled-fg:\s*rgba\(0,\s*0,\s*0,\s*0\.26\);/i,
    )
  })

  it("renders time-range menu items with shared semantic selection tokens", () => {
    expect(newEventSource).toContain(
      '<template #item="{ item, props: itemProps }">',
    )
    expect(newEventSource).toContain(
      "'time-range-select-item--active':\n                      item.raw === selectedDateOption",
    )
    expect(timeRangePickerSource).toContain("'time-range-select-item--active':")
    expect(timeRangePickerSource).toMatch(
      /\.time-range-select-item--active\s*\{\s*background-color:\s*var\(--timeful-selection-bg\);\s*color:\s*var\(--timeful-selection-fg\);/,
    )
  })

  it("uses the shared selection palette for the date option dropdown items", () => {
    expect(newEventSource).toContain(
      "'time-range-select-item--active':\n                      item.raw === selectedDateOption",
    )
    expect(newEventSource).not.toContain("item.raw.value === timeIncrement")
  })

  it("uses token-backed selected styling for day-of-week controls instead of Vuetify palette props", () => {
    expect(newEventSource).toContain(
      'class="editor-dow-toggle new-event-dow-toggle"',
    )
    expect(newEventSource).toContain('v-for="day in dayOfWeekButtons"')
    expect(newEventSource).toContain("getDayOfWeekButtonClass(day.value)")
    expect(newEventSource).not.toContain(
      '<v-btn-toggle\n                  v-model="selectedDaysOfWeek"\n                  multiple\n                  solo',
    )
    expect(dayOfWeekButtonSnippet).not.toContain('color="primary"')
    expect(newEventStyleBlock).toMatch(
      /\.editor-dow-button--selected\s*\{\s*background-color:\s*var\(--timeful-selection-bg\) !important;\s*color:\s*var\(--timeful-selection-fg\) !important;/,
    )
  })

  it("renders the day-of-week Monday toggle as a compact switch and defaults it on", () => {
    expect(newEventSource).toContain('v-model="startOnMonday"')
    expect(newEventSource).toContain(
      'class="compact-switch new-event-start-on-monday-switch schedule-overlap-compact-switch"',
    )
    expect(newEventSource).toContain(
      'class="compact-switch__label tw-text-sm tw-text-very-dark-gray"',
    )
    expect(newEventSource).not.toContain('<v-checkbox v-model="startOnMonday"')
    expect(newEventSource).toContain("const DEFAULT_START_ON_MONDAY = true")
    expect(newEventSource).toContain(
      "initialStartOnMonday: DEFAULT_START_ON_MONDAY",
    )
    expect(newEventSource).toContain(
      "props.contactsPayload.startOnMonday ?? DEFAULT_START_ON_MONDAY",
    )
  })

  it("uses semantic tokens for weekday segmented controls and compact switch tracks", () => {
    expect(newEventStyleBlock).toMatch(
      /\.editor-dow-toggle\s*\{\s*display:\s*grid;[\s\S]*grid-template-columns:\s*repeat\(7, minmax\(0, 1fr\)\);[\s\S]*border:\s*1px solid var\(--timeful-weekday-segment-border\);[\s\S]*border-radius:\s*12px;[\s\S]*background-color:\s*var\(--timeful-weekday-segment-surface\);/,
    )
    expect(newEventStyleBlock).toMatch(
      /\.editor-dow-button\s*\{[^}]*border-radius:\s*8px !important;[^}]*color:\s*var\(--timeful-weekday-segment-foreground\) !important;/,
    )
    expect(newEventStyleBlock).toMatch(
      /\.editor-dow-button \+ \.editor-dow-button\s*\{\s*border-left:\s*1px solid var\(--timeful-weekday-segment-border\);/,
    )
    expect(newEventStyleBlock).not.toContain("border-radius: 999px")
    expect(newEventStyleBlock).not.toMatch(
      /\.editor-dow-button\s*\{[^}]*rgba\(0,\s*0,\s*0,\s*0\.87\)/,
    )
    expect(appCssSource).toMatch(
      /--timeful-weekday-segment-border:\s*rgba\(79,\s*79,\s*79,\s*0\.18\);/i,
    )
    expect(appCssSource).toMatch(
      /--timeful-weekday-segment-surface:\s*#ffffff;/i,
    )
    expect(appCssSource).toMatch(
      /--timeful-weekday-segment-foreground:\s*rgba\(0,\s*0,\s*0,\s*0\.72\);/i,
    )
    expect(appCssSource).toMatch(/--timeful-outline-neutral:\s*#bdbdbd;/i)
    expect(appCssSource).toMatch(
      /--timeful-compact-switch-track-border:\s*var\(--timeful-outline-neutral\);/i,
    )
    expect(appCssSource).toMatch(
      /--timeful-compact-switch-track-bg:\s*#bdbdbd;/i,
    )
    expect(appCssSource).toMatch(
      /--timeful-compact-switch-track-active-border:\s*#29bc68;/i,
    )
    expect(appCssSource).toMatch(
      /--timeful-compact-switch-track-active-bg:\s*#00994c;/i,
    )
    expect(compactSwitchCssSource).toMatch(
      /border:\s*2px solid var\(--timeful-compact-switch-track-border\) !important;/,
    )
    expect(compactSwitchCssSource).toMatch(
      /background-color:\s*var\(--timeful-compact-switch-track-bg\) !important;/,
    )
    expect(compactSwitchCssSource).toMatch(
      /background-color:\s*var\(--timeful-compact-switch-thumb-bg\) !important;/,
    )
    expect(compactSwitchCssSource).toMatch(
      /border-color:\s*var\(--timeful-compact-switch-track-active-border\) !important;/,
    )
    expect(compactSwitchCssSource).toMatch(
      /background-color:\s*var\(--timeful-compact-switch-track-active-bg\) !important;/,
    )
  })

  it("renders an event time format switch above the time range dropdowns", () => {
    expect(newEventSource).toContain("What times might work?")
    expect(newEventSource).toContain(':model-value="eventTimeType"')
    expect(newEventSource).toContain(
      '@update:model-value="updateEventTimeType"',
    )
  })

  it("renders the specific-times toggle as the first row under the section heading", () => {
    const wrapper = shallowMount(NewEvent, {
      global: {
        stubs: {
          ...defaultStubs,
          TimeFormatToggle: TimeFormatToggleStub,
        },
      },
    })

    const heading = wrapper
      .findAll("div")
      .find((div) => div.text() === "What times might work?")
    const specificToggle = wrapper.get("[data-testid='specific-times-toggle']")
    const timeRangeRow = wrapper.get(".time-range-row")

    if (!heading) throw new Error("Missing 'What times might work?' heading")
    expect(
      specificToggle.element.compareDocumentPosition(heading.element) &
        Node.DOCUMENT_POSITION_PRECEDING,
    ).toBeTruthy()
    expect(
      timeRangeRow.element.compareDocumentPosition(specificToggle.element) &
        Node.DOCUMENT_POSITION_PRECEDING,
    ).toBeTruthy()
  })

  it("keeps the time format toggle and time range in one row when specific times are disabled", () => {
    const wrapper = shallowMount(NewEvent, {
      global: {
        stubs: {
          ...defaultStubs,
          TimeFormatToggle: TimeFormatToggleStub,
        },
      },
    })

    const timeRangeRow = wrapper.get(".time-range-row")
    expect(timeRangeRow.classes()).toContain("tw-justify-between")
    expect(timeRangeRow.classes()).toContain("tw-gap-x-2")
    expect(
      timeRangeRow.find("[data-testid='time-format-toggle-stub']").exists(),
    ).toBe(true)
    expect(
      timeRangeRow.findComponent({ name: "TimeRangePicker" }).exists(),
    ).toBe(true)
  })

  it("hides the time format toggle and time range row when specific times are enabled", async () => {
    const wrapper = shallowMount(NewEvent, {
      global: {
        stubs: {
          ...defaultStubs,
          TimeFormatToggle: TimeFormatToggleStub,
        },
      },
    })

    const rowTimeFormatToggle = () =>
      wrapper.find(".time-range-row [data-testid='time-format-toggle-stub']")
    expect(wrapper.find(".time-range-row").exists()).toBe(true)
    expect(rowTimeFormatToggle().exists()).toBe(true)

    const vm = wrapper.vm as unknown as { specificTimesEnabled: boolean }
    vm.specificTimesEnabled = true
    await nextTick()

    expect(wrapper.find(".time-range-row").exists()).toBe(false)
    expect(rowTimeFormatToggle().exists()).toBe(false)
    expect(wrapper.find("[data-testid='specific-times-toggle']").exists()).toBe(
      true,
    )
    expect(wrapper.text()).toContain("Click the Next button below")
  })

  it("uses explicit primary switch semantics for the specific-times toggle", () => {
    expect(newEventSource).toContain('data-testid="specific-times-toggle"')
    expect(newEventSource).toContain('v-model="specificTimesEnabled"')
    expect(newEventSource).toContain(
      'class="compact-switch specific-times-switch schedule-overlap-compact-switch"',
    )
    expect(newEventSource).toContain(
      'class="compact-switch-grid specific-times-switch-grid"',
    )
    expect(newEventSource).toContain(
      'class="compact-switch__label specific-times-switch__label tw-text-sm"',
    )
    expect(newEventSource).toContain('color="primary"')
    expect(newEventSource).toContain("inset")
    expect(newEventSource).toContain(
      'class="compact-switch__message specific-times-switch__message tw-pointer-events-auto tw-text-xs tw-text-dark-gray"',
    )
    expect(newEventSource).toContain("hide-details")
    expect(newEventStyleBlock).toMatch(
      /\.compact-switch-grid\s*\{\s*display:\s*grid;\s*grid-template-columns:\s*auto minmax\(0, 1fr\);\s*grid-template-rows:\s*auto auto;\s*column-gap:\s*0\.35rem;/,
    )
    expect(newEventStyleBlock).toMatch(
      /\.compact-switch__label\s*\{\s*grid-column:\s*2;\s*grid-row:\s*1;\s*align-self:\s*center;/,
    )
    expect(newEventStyleBlock).toMatch(
      /\.compact-switch__message\s*\{\s*grid-column:\s*2;\s*grid-row:\s*2;\s*margin-top:\s*2px;/,
    )
    expect(newEventStyleBlock).toMatch(
      /\.compact-switch :deep\(\.v-label\)\s*\{\s*display:\s*none;/,
    )
  })

  it("uses crossed-out Vuetify 3 false-icon for disabled unchecked gated checkboxes", () => {
    expect(newEventSource).toContain(
      'false-icon="mdi-checkbox-blank-off-outline"',
    )
    expect(newEventSource).not.toContain(
      'off-icon="mdi-checkbox-blank-off-outline"',
    )
  })

  it("uses the shared editor header for dialog title and actions", () => {
    expect(newEventSource).toContain("<EditorDialogHeader")
    expect(newEventSource).toContain('help-header="Events"')
    expect(newEventSource).toContain(
      `@close="emit('update:modelValue', false)"`,
    )
  })

  it("wires top and bottom overflow gradients to the scrollable form area", () => {
    const gradientBlocks =
      newEventSource.match(/<OverflowGradient\b[\s\S]*?\/>/g) ?? []
    expect(gradientBlocks).toHaveLength(2)

    const topGradient =
      gradientBlocks.find((block) => block.includes('position="top"')) ?? ""
    expect(topGradient).toContain('position="top"')
    expect(topGradient).toContain(':scroll-container="cardTextElement"')
    expect(topGradient).toContain(':show-arrow="false"')

    const bottomGradient =
      gradientBlocks.find((block) => !block.includes('position="top"')) ?? ""
    expect(bottomGradient).toContain(':scroll-container="cardTextElement"')
    expect(bottomGradient).not.toContain(':show-arrow="false"')
  })

  it("blocks the create button until the required name and date selection are present", async () => {
    const wrapper = shallowMount(NewEvent, {
      global: {
        stubs: {
          ...defaultStubs,
          "v-btn": VBtnStub,
        },
      },
    })

    const vm = wrapper.vm as unknown as {
      formValid: boolean
      name: string
      selectedDays: Temporal.PlainDate[]
    }
    vm.formValid = false
    vm.name = ""
    vm.selectedDays = []
    await nextTick()

    const button = wrapper.get(".v-btn-stub")
    expect(button.attributes("aria-disabled")).toBe("true")
    expect(button.attributes("tabindex")).toBe("-1")
    expect(button.classes()).toContain("new-event-submit-button")
    expect(button.classes()).toContain("new-event-submit-button--disabled")
    expect(button.classes()).not.toContain("new-event-submit-button--enabled")
    expect(button.attributes("style")).toContain(
      "--timeful-primary-action-disabled-bg",
    )
    expect(button.attributes("style")).toContain(
      "--timeful-primary-action-disabled-fg",
    )

    vm.formValid = false
    vm.name = "Planning sync"
    vm.selectedDays = []
    await nextTick()

    expect(button.attributes("aria-disabled")).toBe("true")
    expect(button.classes()).toContain("new-event-submit-button--disabled")

    vm.selectedDays = [Temporal.PlainDate.from("2026-01-02")]
    await nextTick()

    expect(button.attributes("aria-disabled")).toBe("false")
    expect(button.attributes("tabindex")).toBeUndefined()
    expect(button.classes()).toContain("new-event-submit-button")
    expect(button.classes()).toContain("new-event-submit-button--enabled")
    expect(button.classes()).not.toContain("new-event-submit-button--disabled")
    expect(button.attributes("style")).toContain("--timeful-primary-action-bg")
    expect(button.attributes("style")).toContain("--timeful-primary-action-fg")
  })

  it("blocks the create button in day-of-week mode until a weekday is selected", async () => {
    const wrapper = shallowMount(NewEvent, {
      global: {
        stubs: {
          ...defaultStubs,
          "v-btn": VBtnStub,
        },
      },
    })

    const vm = wrapper.vm as unknown as {
      name: string
      selectedDateOption: string
      selectedDays: Temporal.PlainDate[]
      selectedDaysOfWeek: number[]
    }

    vm.name = "Weekly sync"
    vm.selectedDateOption = "Days of the week"
    vm.selectedDays = []
    vm.selectedDaysOfWeek = []
    await nextTick()

    const button = wrapper.get(".v-btn-stub")
    expect(button.attributes("aria-disabled")).toBe("true")

    vm.selectedDaysOfWeek = [1]
    await nextTick()

    expect(button.attributes("aria-disabled")).toBe("false")
  })

  it("submits when the current form data is valid even if lazy form validity is stale", async () => {
    const wrapper = shallowMount(NewEvent, {
      props: {
        contactsPayload: {
          name: "Planning sync",
          startTime: Temporal.PlainTime.from("09:00"),
          endTime: Temporal.PlainTime.from("10:00"),
          daysOnly: false,
          selectedDateOption: "Specific dates",
          selectedDays: [Temporal.PlainDate.from("2026-01-02")],
          notificationsEnabled: false,
          timezone: {
            value: "UTC",
            label: "UTC",
            gmtString: "GMT",
            offset: durations.ZERO,
          },
        },
      },
      global: {
        stubs: {
          ...defaultStubs,
          "v-btn": VBtnStub,
        },
      },
    })

    const vm = wrapper.vm as unknown as { formValid: boolean }
    vm.formValid = false
    await nextTick()

    await wrapper.get(".v-btn-stub").trigger("click")
    await Promise.resolve()

    expect(formRefMethods.validate).toHaveBeenCalledTimes(1)
    expect(postMock).toHaveBeenCalledTimes(1)
    expect(postMock.mock.calls[0]?.[0]).toBe("/events")
  })

  it("shows the submit error only after an attempted submit fails validation", async () => {
    formRefMethods.validate.mockResolvedValueOnce({ valid: false })

    const wrapper = shallowMount(NewEvent, {
      props: {
        contactsPayload: {
          name: "Planning sync",
          startTime: Temporal.PlainTime.from("09:00"),
          endTime: Temporal.PlainTime.from("10:00"),
          daysOnly: false,
          selectedDateOption: "Specific dates",
          selectedDays: [Temporal.PlainDate.from("2026-01-02")],
          notificationsEnabled: false,
          timezone: {
            value: "UTC",
            label: "UTC",
            gmtString: "GMT",
            offset: durations.ZERO,
          },
        },
      },
      global: {
        stubs: {
          ...defaultStubs,
          "v-btn": VBtnStub,
        },
      },
    })

    const vm = wrapper.vm as unknown as { formValid: boolean }
    vm.formValid = false
    await nextTick()

    const error = wrapper.get(".new-event-submit-error")
    expect(error.classes()).toContain("tw-invisible")

    await wrapper.get(".v-btn-stub").trigger("click")
    await nextTick()

    expect(formRefMethods.validate).toHaveBeenCalledTimes(1)
    expect(postMock).not.toHaveBeenCalled()
    expect(error.classes()).toContain("tw-visible")
  })

  it("uses semantic tokens for submit error and invalid-name state styling", () => {
    expect(newEventSource).toContain(
      'class="new-event-submit-error tw-mt-1 tw-text-xs"',
    )
    expect(newEventStyleBlock).not.toMatch(/new-event-name-field/)
    expect(newEventStyleBlock).not.toMatch(/#ff0000/i)
    expect(newEventStyleBlock).not.toMatch(/--v-theme-error:/)
    const templateSource =
      /<template>([\s\S]*)<\/template>/.exec(newEventSource)?.[1] ?? ""
    expect(templateSource).toContain("timeful-invalid-field")
    expect(appCssSource).toMatch(
      /\.timeful-invalid-field \.v-field,\s*\.timeful-invalid-field\.v-input--error \.v-field\s*\{\s*outline:\s*none;/,
    )
    expect(appCssSource).toMatch(
      /\.timeful-invalid-field \.v-field__append-inner\s*\{\s*visibility:\s*hidden;/,
    )
    expect(appCssSource).toMatch(
      /\.timeful-invalid-field\.v-input--error \.v-field__append-inner\s*\{\s*visibility:\s*visible;/,
    )
    expect(appCssSource).toMatch(
      /\.timeful-invalid-field\.v-input--error \.v-field__outline\s*\{\s*--v-field-border-width:\s*2px;/,
    )
    expect(appCssSource).toMatch(
      /\.timeful-invalid-field\.v-input--error \.v-field--variant-solo\s*\{\s*outline: 2px solid rgb\(var\(--v-theme-error\)\);/,
    )
    expect(newEventStyleBlock).toMatch(
      /\.new-event-submit-error\s*\{\s*color:\s*var\(--timeful-error-foreground\);/,
    )
    expect(newEventStyleBlock).toMatch(
      /\.new-event-submit-button \.v-btn__content,\s*\.new-event-submit-button \.v-progress-circular,\s*\.new-event-submit-button \.v-icon\s*\{\s*color:\s*inherit;/,
    )
  })

  it("styles the event name field like the description field and caps it at 100 characters", () => {
    const wrapper = shallowMount(NewEvent, {
      global: {
        stubs: {
          ...defaultStubs,
          "v-text-field": VTextFieldCaptureStub,
        },
      },
    })

    const nameField = wrapper
      .findAllComponents({ name: "VTextField" })
      .find((field) => field.props("label") === "Event name (required)")
    expect(nameField).toBeDefined()
    expect(nameField?.props("variant")).toBe("outlined")
    expect(nameField?.props("appendInnerIcon")).toBe("mdi-alert-circle")
    expect(nameField?.props("placeholder")).toBe("Name your event ...")
    expect(nameField?.props("maxlength")).toBe(100)

    const input = wrapper.get("input[placeholder='Name your event ...']")
    expect(input.attributes("maxlength")).toBe("100")

    const rules = nameField?.props("rules") as unknown as Array<
      (value: string) => true | string
    >
    expect(rules).toHaveLength(1)
    expect(rules[0]?.("")).toBe("Event name must be non-empty")
    expect(rules[0]?.("   ")).toBe("Event name must be non-empty")
    expect(rules[0]?.("Planning sync")).toBe(true)
    expect(rules[0]?.("a".repeat(100))).toBe(true)
    expect(rules[0]?.("a".repeat(101))).toBe(
      "Event name must be 100 characters or fewer",
    )
  })

  it("renders all signed-out gated helpers with the legacy-emphasis helper markup", () => {
    const wrapper = shallowMount(NewEvent, {
      props: {
        event: {
          ownerId: "user-1",
        },
      },
      global: {
        stubs: {
          ...defaultStubs,
          "v-checkbox": VCheckboxSlotStub,
        },
      },
    })

    expect(wrapper.findAll(".gated-feature-checkbox")).toHaveLength(3)
    expect(wrapper.findAll(".advanced-options-disabled-label")).toHaveLength(3)
    expect(wrapper.findAll(".advanced-options-disabled-message")).toHaveLength(
      3,
    )
    expect(wrapper.findAll(".advanced-options-disabled-copy")).toHaveLength(3)
    expect(wrapper.findAll(".advanced-options-sign-in-link")).toHaveLength(3)
  })

  it("keeps disabled helper text and gated checkbox icon styling stable", () => {
    expect(newEventStyleBlock).toMatch(
      /\.new-event-form \.v-checkbox \.v-selection-control\s*\{\s*--v-selection-control-size:\s*32px;/,
    )
    expect(newEventStyleBlock).toMatch(
      /\.gated-feature-checkbox\s*\{\s*--v-disabled-opacity:\s*1;\s*opacity:\s*1 !important;/,
    )
    expect(newEventStyleBlock).toMatch(
      /\.gated-feature-checkbox \.v-selection-control\s*\{\s*opacity:\s*1 !important;/,
    )
    expect(newEventStyleBlock).toMatch(
      /\.gated-feature-checkbox \.v-input__details,\s*\.gated-feature-checkbox \.v-messages,\s*\.gated-feature-checkbox \.v-messages__message\s*\{\s*opacity:\s*1 !important;/,
    )
    expect(newEventSource).toMatch(
      /advanced-options-disabled-message[\s\S]*?tw-ml-\[32px\]/,
    )
    expect(newEventStyleBlock).toMatch(
      /\.gated-feature-checkbox \.v-selection-control__input > \.v-icon\s*\{\s*color:\s*var\(--timeful-disabled-checkbox-icon\) !important;\s*opacity:\s*1 !important;/,
    )
    expect(newEventStyleBlock).toMatch(
      /\.advanced-options-disabled-label\s*\{\s*color:\s*var\(--timeful-disabled-foreground\) !important;/,
    )
    expect(newEventStyleBlock).toMatch(
      /\.advanced-options-disabled-message\s*\{\s*color:\s*var\(--timeful-muted-foreground\) !important;/,
    )
    expect(newEventStyleBlock).toMatch(
      /\.advanced-options-disabled-copy\s*\{\s*color:\s*var\(--timeful-emphasis-foreground\) !important;/,
    )
    expect(newEventStyleBlock).toMatch(
      /\.advanced-options-sign-in-link\s*\{\s*color:\s*var\(--timeful-selection-fg\) !important;/,
    )
    expect(newEventStyleBlock).not.toMatch(
      /v-selection-control--disabled \.v-label/,
    )
    expect(newEventStyleBlock).not.toMatch(/v-input--disabled/)
    expect(newEventStyleBlock).not.toMatch(/v-input--density-default/)
    expect(newEventStyleBlock).not.toMatch(/v-input--density-compact/)
  })

  it("uses explicit shared control contracts instead of Vuetify 2 global selectors", () => {
    expect(newEventSource).toContain("timeful-solo-field")
    expect(newEventSource).toContain("timeful-elevated-button")
    expect(appCssSource).toContain(".timeful-solo-field")
    expect(appCssSource).toContain(".timeful-elevated-button")
    expect(appCssSource).toContain(".timeful-switch")
    expect(appCssSource).toMatch(
      /\.timeful-solo-field \.v-field\s*\{[^}]*box-shadow: none !important;/,
    )
    expect(appCssSource).toMatch(
      /\.timeful-solo-field \.v-field\s*\{[^}]*border: 1px solid var\(--timeful-outline-neutral\) !important;/,
    )
    expect(appCssSource).toMatch(
      /\.timeful-elevated-button\s*\{[^}]*border: 1px solid var\(--timeful-outline-neutral\) !important;/,
    )
    expect(appCssSource).toMatch(
      /\.timeful-switch \.v-switch__track\s*\{[^}]*border: 2px solid var\(--timeful-compact-switch-track-border\) !important;/,
    )
    expect(appCssSource).not.toContain("drop-shadow")
    expect(appCssSource).not.toContain(".v-btn--is-elevated")
    expect(appCssSource).not.toContain(".v-input--switch__track")
    expect(appCssSource).not.toContain(".v-input__slot")
  })

  it("uses the shared muted-foreground token for the advanced-options panel", () => {
    expect(newEventSource).toContain(
      'class="advanced-options-panel tw-flex tw-flex-col tw-gap-5 tw-pt-2"',
    )
    expect(newEventStyleBlock).toMatch(
      /\.advanced-options-panel\s*\{\s*color:\s*var\(--timeful-muted-foreground\);/,
    )
  })

  it("normalizes edit-flow time increment objects into the advanced-options toggle value", () => {
    const wrapper = shallowMount(NewEvent, {
      props: {
        edit: true,
        event: {
          _id: "evt-time-increment",
          name: "Duration-backed increment",
          dates: [Temporal.PlainDate.from("2026-01-02")],
          timeSeed: Temporal.ZonedDateTime.from(
            "2026-01-02T09:00:00+00:00[UTC]",
          ),
          duration: durations.ONE_HOUR,
          timeIncrement: Temporal.Duration.from({ minutes: 30 }),
        },
      },
      global: {
        stubs: {
          ...defaultStubs,
          "v-select": VSelectStub,
        },
      },
    })

    const vm = wrapper.vm as unknown as {
      timeIncrement?: number
      $: { setupState?: { timeIncrement?: number } }
    }

    expect(vm.timeIncrement ?? vm.$.setupState?.timeIncrement).toBe(30)
  })

  it("commits ISO dates emitted by DatePicker into Temporal selected days", async () => {
    const wrapper = shallowMount(NewEvent, {
      global: {
        stubs: {
          ...defaultStubs,
          DatePicker: DatePickerModelStub,
        },
      },
    })

    const datePicker = wrapper.getComponent(DatePickerModelStub)
    ;(
      datePicker.vm as { $emit: (event: string, payload: string[]) => void }
    ).$emit("update:modelValue", ["2026-05-15"])
    await nextTick()

    const selectedDays = (
      wrapper.vm as unknown as {
        selectedDays: Temporal.PlainDate[]
      }
    ).selectedDays

    expect(selectedDays.map((day) => day.toString())).toEqual(["2026-05-15"])
    expect(selectedDays[0]).toBeInstanceOf(Temporal.PlainDate)
  })

  it("wraps cross-midnight edit durations to the next day's local end time", () => {
    localStorage.setItem(
      "timezone",
      JSON.stringify({
        value: "UTC",
        offset: "PT0S",
        label: "UTC",
        gmtString: "GMT",
      }),
    )

    const wrapper = shallowMount(NewEvent, {
      props: {
        edit: true,
        event: {
          _id: "evt-2",
          name: "Late event",
          dates: [Temporal.PlainDate.from("2026-01-02")],
          timeSeed: Temporal.ZonedDateTime.from(
            "2026-01-02T23:30:00+00:00[UTC]",
          ),
          duration: Temporal.Duration.from({ minutes: 90 }),
        },
      },
      global: {
        stubs: defaultStubs,
      },
    })

    const vm = wrapper.vm as unknown as {
      startTimeNum?: number
      endTimeNum?: number
      $: { setupState?: { startTimeNum?: number; endTimeNum?: number } }
    }

    expect(vm.startTimeNum ?? vm.$.setupState?.startTimeNum).toBe(23.5)
    expect(vm.endTimeNum ?? vm.$.setupState?.endTimeNum).toBe(1)
  })

  it("uses saved timezone rules when reconstructing edit times across DST boundaries", () => {
    localStorage.setItem(
      "timezone",
      JSON.stringify({
        value: "America/New_York",
        offset: "-PT5H",
        label: "Eastern Time",
        gmtString: "GMT-5",
      }),
    )

    const wrapper = shallowMount(NewEvent, {
      props: {
        edit: true,
        event: {
          _id: "evt-3",
          name: "Summer event",
          dates: [Temporal.PlainDate.from("2026-06-15")],
          timeSeed: Temporal.ZonedDateTime.from(
            "2026-06-15T12:00:00+00:00[UTC]",
          ),
          duration: Temporal.Duration.from({ hours: 1 }),
        },
      },
      global: {
        stubs: defaultStubs,
      },
    })

    const vm = wrapper.vm as unknown as {
      startTime?: Temporal.PlainTime
      endTime?: Temporal.PlainTime
      $: {
        setupState?: {
          startTime?: Temporal.PlainTime
          endTime?: Temporal.PlainTime
        }
      }
    }

    expect((vm.startTime ?? vm.$.setupState?.startTime)?.toString()).toBe(
      "08:00:00",
    )
    expect((vm.endTime ?? vm.$.setupState?.endTime)?.toString()).toBe(
      "09:00:00",
    )
  })

  it("preserves non-hour-aligned edit times after saved timezone reconstruction", () => {
    localStorage.setItem(
      "timezone",
      JSON.stringify({
        value: "Asia/Kathmandu",
        offset: "PT5H45M",
        label: "Nepal Time",
        gmtString: "GMT+5:45",
      }),
    )

    const wrapper = shallowMount(NewEvent, {
      props: {
        edit: true,
        event: {
          _id: "evt-3a",
          name: "Quarter-hour event",
          dates: [Temporal.PlainDate.from("2026-06-15")],
          timeSeed: Temporal.ZonedDateTime.from(
            "2026-06-15T12:00:00+00:00[UTC]",
          ),
          duration: Temporal.Duration.from({ hours: 1, minutes: 30 }),
        },
      },
      global: {
        stubs: defaultStubs,
      },
    })

    const vm = wrapper.vm as unknown as {
      startTime?: Temporal.PlainTime
      endTime?: Temporal.PlainTime
      startTimeNum?: number
      endTimeNum?: number
      $: {
        setupState?: {
          startTime?: Temporal.PlainTime
          endTime?: Temporal.PlainTime
          startTimeNum?: number
          endTimeNum?: number
        }
      }
    }

    expect((vm.startTime ?? vm.$.setupState?.startTime)?.toString()).toBe(
      "17:45:00",
    )
    expect((vm.endTime ?? vm.$.setupState?.endTime)?.toString()).toBe(
      "19:15:00",
    )
    expect(vm.startTimeNum ?? vm.$.setupState?.startTimeNum).toBe(17.75)
    expect(vm.endTimeNum ?? vm.$.setupState?.endTimeNum).toBe(19.25)
  })

  it("prefers the explicit event time seed over membership dates when editing", () => {
    localStorage.setItem(
      "timezone",
      JSON.stringify({
        value: "UTC",
        offset: "PT0S",
        label: "UTC",
        gmtString: "GMT",
      }),
    )

    const wrapper = shallowMount(NewEvent, {
      props: {
        edit: true,
        event: {
          _id: "evt-3b",
          name: "Seeded event",
          type: "specific_dates",
          dates: [Temporal.PlainDate.from("2026-01-02")],
          timeSeed: Temporal.ZonedDateTime.from(
            "2026-01-02T09:30:00+00:00[UTC]",
          ),
          duration: Temporal.Duration.from({ hours: 1, minutes: 15 }),
        },
      },
      global: {
        stubs: defaultStubs,
      },
    })

    const vm = wrapper.vm as unknown as {
      startTime?: Temporal.PlainTime
      endTime?: Temporal.PlainTime
      $: {
        setupState?: {
          startTime?: Temporal.PlainTime
          endTime?: Temporal.PlainTime
        }
      }
    }

    expect((vm.startTime ?? vm.$.setupState?.startTime)?.toString()).toBe(
      "09:30:00",
    )
    expect((vm.endTime ?? vm.$.setupState?.endTime)?.toString()).toBe(
      "10:45:00",
    )
  })

  it("keeps specific-date edit membership stable when the saved timezone would shift the instant to the prior day", () => {
    localStorage.setItem(
      "timezone",
      JSON.stringify({
        value: "America/Los_Angeles",
        offset: "-PT8H",
        label: "Pacific Time",
        gmtString: "GMT-8",
      }),
    )

    const wrapper = shallowMount(NewEvent, {
      props: {
        edit: true,
        event: {
          _id: "evt-4",
          name: "Membership-stable event",
          type: "specific_dates",
          dates: [Temporal.PlainDate.from("2026-01-02")],
          timeSeed: Temporal.ZonedDateTime.from(
            "2026-01-02T00:30:00+00:00[UTC]",
          ),
          duration: Temporal.Duration.from({ hours: 1 }),
        },
      },
      global: {
        stubs: defaultStubs,
      },
    })

    const vm = wrapper.vm as unknown as {
      selectedDays?: Temporal.PlainDate[]
      $: { setupState?: { selectedDays?: Temporal.PlainDate[] } }
    }

    expect(
      (vm.selectedDays ?? vm.$.setupState?.selectedDays)?.map((day) =>
        day.toString(),
      ),
    ).toEqual(["2026-01-02"])
  })

  it("normalizes restored draft selectedDays into Temporal.PlainDate values", () => {
    const wrapper = shallowMount(NewEvent, {
      props: {
        contactsPayload: {
          name: "Legacy draft",
          startTime: Temporal.PlainTime.from("09:00"),
          endTime: Temporal.PlainTime.from("10:00"),
          daysOnly: true,
          selectedDateOption: "Specific dates",
          selectedDays: [
            Temporal.PlainDate.from("2026-01-02"),
            Temporal.PlainDate.from("2026-01-03"),
          ],
          notificationsEnabled: false,
          timezone: {
            value: "UTC",
            label: "UTC",
            gmtString: "GMT",
            offset: durations.ZERO,
          },
        },
      },
      global: {
        stubs: defaultStubs,
      },
    })

    const selectedDays = (
      wrapper.vm as unknown as {
        selectedDays: Temporal.PlainDate[]
      }
    ).selectedDays

    expect(selectedDays.map((day) => day.toString())).toEqual([
      "2026-01-02",
      "2026-01-03",
    ])
    expect(selectedDays.every((day) => day instanceof Temporal.PlainDate)).toBe(
      true,
    )
  })

  it("submits day-only events with a zero duration payload", async () => {
    const wrapper = shallowMount(NewEvent, {
      props: {
        contactsPayload: {
          name: "Day only event",
          startTime: Temporal.PlainTime.from("09:00"),
          endTime: Temporal.PlainTime.from("11:00"),
          daysOnly: true,
          selectedDateOption: "Specific dates",
          selectedDays: [Temporal.PlainDate.from("2026-01-02")],
          notificationsEnabled: false,
          timezone: {
            value: "UTC",
            label: "UTC",
            gmtString: "GMT",
            offset: durations.ZERO,
          },
        },
      },
      global: {
        stubs: defaultStubs,
      },
    })

    const vm = wrapper.vm as unknown as {
      submit?: () => Promise<void>
      $: { setupState?: { submit?: () => Promise<void> } }
    }

    await (vm.submit ?? vm.$.setupState?.submit)?.()
    await Promise.resolve()

    expect(postMock).toHaveBeenCalledTimes(1)
    expect(postMock.mock.calls[0]?.[0]).toBe("/events")
    expect(postMock.mock.calls[0]?.[1]).not.toHaveProperty("duration")
  })

  it("submits an overnight event with the next-day duration", async () => {
    const wrapper = shallowMount(NewEvent, {
      props: {
        contactsPayload: {
          name: "Late event",
          startTime: Temporal.PlainTime.from("23:30"),
          endTime: Temporal.PlainTime.from("01:00"),
          daysOnly: false,
          selectedDateOption: "Specific dates",
          selectedDays: [Temporal.PlainDate.from("2026-01-02")],
          notificationsEnabled: false,
          timezone: {
            value: "UTC",
            label: "UTC",
            gmtString: "GMT",
            offset: durations.ZERO,
          },
        },
      },
      global: {
        stubs: defaultStubs,
      },
    })

    const vm = wrapper.vm as unknown as {
      submit?: () => Promise<void>
      $: { setupState?: { submit?: () => Promise<void> } }
    }

    await (vm.submit ?? vm.$.setupState?.submit)?.()
    await Promise.resolve()

    expect(postMock).toHaveBeenCalledTimes(1)
    expect(postMock.mock.calls[0]?.[0]).toBe("/events")
    const payload = postMock.mock.calls[0]?.[1] as Record<string, unknown>
    expect(payload).not.toHaveProperty("duration")
    expect(payload).not.toHaveProperty("dates")
    expect(payload.slotGeneration).toMatchObject({
      startTimeLocal: "23:30:00",
      endTimeLocal: "01:00:00",
    })
  })

  it("treats equal start and end times as a 24-hour event duration", async () => {
    const wrapper = shallowMount(NewEvent, {
      props: {
        contactsPayload: {
          name: "All day event",
          startTime: Temporal.PlainTime.from("09:00"),
          endTime: Temporal.PlainTime.from("09:00"),
          daysOnly: false,
          selectedDateOption: "Specific dates",
          selectedDays: [Temporal.PlainDate.from("2026-01-02")],
          notificationsEnabled: false,
          timezone: {
            value: "UTC",
            label: "UTC",
            gmtString: "GMT",
            offset: durations.ZERO,
          },
        },
      },
      global: {
        stubs: defaultStubs,
      },
    })

    const vm = wrapper.vm as unknown as {
      submit?: () => Promise<void>
      $: { setupState?: { submit?: () => Promise<void> } }
    }

    await (vm.submit ?? vm.$.setupState?.submit)?.()
    await Promise.resolve()

    expect(postMock).toHaveBeenCalledTimes(1)
    expect(postMock.mock.calls[0]?.[0]).toBe("/events")
    expect(postMock.mock.calls[0]?.[1]).not.toHaveProperty("duration")
  })
})

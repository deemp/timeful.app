// @vitest-environment happy-dom

import { readFileSync } from "node:fs"
import { config, shallowMount as baseShallowMount } from "@vue/test-utils"
import { computed, nextTick, ref } from "vue"
import {
  afterAll,
  afterEach,
  beforeEach,
  describe,
  expect,
  it,
  vi,
} from "vitest"
import { eventTypes, guestUserId } from "@/constants"
import { Temporal } from "temporal-polyfill"
import EventView from "./Event.vue"
import eventViewSource from "./Event.vue?raw"

const mountedWrappers: ReturnType<typeof baseShallowMount>[] = []
const shallowMount: typeof baseShallowMount = (...args) => {
  const wrapper = baseShallowMount(...args)
  mountedWrappers.push(wrapper)
  return wrapper
}

const originalGlobalStubs = config.global.stubs
config.global.stubs = {
  ...originalGlobalStubs,
  "v-list": true,
  "v-list-item": true,
  "v-list-item-title": true,
  "v-menu": true,
  "v-switch": true,
}

afterEach(() => {
  for (const wrapper of mountedWrappers.splice(0)) wrapper.unmount()
  document.body.replaceChildren()
  vi.useRealTimers()
  vi.unstubAllGlobals()
})

afterAll(() => {
  config.global.stubs = originalGlobalStubs
})

interface EventTestResponse {
  name: string
  user: {
    _id?: string
    firstName: string
    lastName: string
    email: string
  }
  availability: unknown[]
  guestId?: string
  guestOwnershipMode?: "legacy" | "token"
}

interface EventTestState {
  _id: string
  shortId: string
  ownerId: string
  name: string
  type: string
  daysOnly?: boolean
  hasResponded?: boolean
  dates?: Temporal.PlainDate[]
  responses: Record<string, EventTestResponse>
  blindAvailabilityEnabled: boolean
  hasSpecificTimes?: boolean
  times?: Temporal.ZonedDateTime[]
  enabledSlots?: Temporal.ZonedDateTime[]
  activeSlots?: Temporal.ZonedDateTime[]
  scheduledEvent?: Record<string, unknown>
  eventTimezone?: string
  slotGeneration?: {
    startTimeLocal: Temporal.PlainTime
    endTimeLocal: Temporal.PlainTime
    timeIncrement: Temporal.Duration
  }
  timedRecurrence?: {
    kind: "specific_dates" | "weekly"
    selectedDays: Temporal.PlainDate[]
    selectedDaysOfWeek: number[]
    startOnMonday: boolean
  }
}

function createDefaultEventState(): EventTestState {
  const state: EventTestState = {
    _id: "evt-1",
    shortId: "dEeaF",
    ownerId: "owner-1",
    name: "dfg",
    type: "specific_dates",
    responses: {
      khh: {
        name: "khh",
        user: {
          _id: "000000000000000000000000",
          firstName: "khh",
          lastName: "",
          email: "",
        },
        availability: [],
      },
    },
    blindAvailabilityEnabled: false,
  }

  return state
}

const {
  editGuestAvailabilityMock,
  editOwnedGuestAvailabilityMock,
  authUserState,
  isPhoneState,
  curGuestIdState,
  routeState,
  loaderEventState,
  refreshEventMock,
  fetchCalendarAvailabilitiesMock,
  fetchAuthUserCalendarEventsMock,
  routerPushMock,
  routerReplaceMock,
  showErrorMock,
  addAvailabilityAsGuestMock,
  copyLinkMock,
  editEventMock,
} = vi.hoisted(() => ({
  editGuestAvailabilityMock: vi.fn(),
  editOwnedGuestAvailabilityMock: vi.fn(),
  authUserState: { value: null as null | { _id: string } },
  isPhoneState: { value: false },
  curGuestIdState: { value: "" },
  routeState: { value: { name: "event", query: {} } },
  refreshEventMock: vi.fn().mockResolvedValue(undefined),
  fetchCalendarAvailabilitiesMock: vi.fn().mockResolvedValue(undefined),
  fetchAuthUserCalendarEventsMock: vi.fn().mockResolvedValue(undefined),
  loaderEventState: {
    value: createDefaultEventState(),
  },
  routerPushMock: vi.fn(),
  routerReplaceMock: vi.fn(),
  showErrorMock: vi.fn(),
  addAvailabilityAsGuestMock: vi.fn(),
  copyLinkMock: vi.fn(),
  editEventMock: vi.fn(),
}))

const scheduleOverlapMethodMocks: Record<string, ReturnType<typeof vi.fn>> = {
  scheduleEvent: vi.fn(),
  cancelScheduleEvent: vi.fn(),
  confirmScheduleEvent: vi.fn(),
  clearScheduledEvent: vi.fn(),
  editOwnedGuestAvailability: editOwnedGuestAvailabilityMock,
}

vi.mock("vue-router", () => ({
  useRouter: () => ({
    push: routerPushMock,
    replace: routerReplaceMock,
  }),
  useRoute: () => routeState.value,
}))

vi.mock("pinia", () => ({
  storeToRefs: () => ({
    authUser: computed(() => authUserState.value),
  }),
}))

vi.mock("@/stores/main", () => ({
  useMainStore: () => ({
    showInfo: vi.fn(),
    showError: showErrorMock,
    setAuthUser: vi.fn(),
  }),
}))

vi.mock("@/utils/useDisplayHelpers", () => ({
  useDisplayHelpers: () => ({
    isPhone: computed(() => isPhoneState.value),
  }),
}))

vi.mock("@/composables/event/useEventLoader", () => ({
  useEventLoader: () => ({
    event: computed(() => loaderEventState.value),
    loading: ref(false),
    calendarEventsMap: ref({}),
    calendarAvailabilities: ref({}),
    calendarPermissionGranted: ref(false),
    fromEditEvent: ref(false),
    refreshEvent: refreshEventMock,
    refreshCalendar: vi.fn().mockResolvedValue(undefined),
    fetchCalendarAvailabilities: fetchCalendarAvailabilitiesMock,
    fetchAuthUserCalendarEvents: fetchAuthUserCalendarEventsMock,
  }),
}))

vi.mock("@/composables/event/useEventRespondent", () => ({
  useEventRespondent: () => ({
    curGuestId: ref(curGuestIdState.value),
    addingAvailabilityAsGuest: ref(false),
    currSignUpBlock: ref(null),
    signUpForSlotDialog: ref(false),
    initiateSignUpFlow: vi.fn(),
    signUpForBlock: vi.fn(),
  }),
}))

vi.mock("@/composables/event/useEventEditing", () => ({
  useEventEditing: () => ({
    editEventDialog: ref(false),
    choiceDialog: ref(false),
    webviewDialog: ref(false),
    guestDialog: ref(false),
    pagesNotVisitedDialog: ref(false),
    availabilityBtnOpacity: ref(1),
    availabilityBtnAttentionActive: ref(false),
    addAvailability: vi.fn(),
    addAvailabilityAsGuest: addAvailabilityAsGuestMock,
    cancelEditing: vi.fn(),
    copyLink: copyLinkMock,
    deleteAvailability: vi.fn(),
    editEvent: editEventMock,
    saveChanges: vi.fn(),
    saveChangesAsGuest: vi.fn(),
    setAvailabilityAutomatically: vi.fn(),
    setAvailabilityManually: vi.fn(),
    editGuestAvailability: editGuestAvailabilityMock,
    signInLinkApple: vi.fn(),
    addedAppleCalendar: vi.fn(),
    addedICSCalendar: vi.fn(),
    highlightAvailabilityBtn: vi.fn(),
    handleGuestDialogSubmit: vi.fn(),
  }),
}))

vi.mock("@/utils/services/UserService", () => ({
  fetchAuthUserProfile: vi.fn().mockResolvedValue(null),
}))

const ScheduleOverlapStub = {
  name: "ScheduleOverlap",
  props: {
    event: {
      type: Object,
      required: false,
      default: null,
    },
    fromCreateSpecificTimesDraft: {
      type: Boolean,
      required: false,
      default: false,
    },
    specificTimesEntryDraft: {
      type: Object,
      required: false,
      default: undefined,
    },
  },
  data() {
    return {
      ownedGuestResponses: [
        {
          lookupKey: "000000000000000000000000",
          name: "khh",
          lastUsedAt: 1,
        },
      ],
      respondents: [{ _id: "khh", name: "khh" }],
      editing: false,
      scheduling: false,
      allowScheduleEvent: false,
      respondentSaveAllowed: true,
      unsavedChanges: false,
      showBestTimes: true,
      hideIfNeeded: false,
      collapseDisabledTimes: true,
      showCalendarEvents: false,
      startCalendarOnMonday: false,
      overlayAvailability: false,
      showOverlayAvailabilityToggle: true,
      states: {
        SET_SPECIFIC_TIMES: "set_specific_times",
      },
      state: "heatmap",
    }
  },
  methods: {
    scheduleEvent: scheduleOverlapMethodMocks.scheduleEvent,
    cancelScheduleEvent: scheduleOverlapMethodMocks.cancelScheduleEvent,
    confirmScheduleEvent: scheduleOverlapMethodMocks.confirmScheduleEvent,
    clearScheduledEvent: scheduleOverlapMethodMocks.clearScheduledEvent,
    editOwnedGuestAvailability:
      scheduleOverlapMethodMocks.editOwnedGuestAvailability,
    updateShowBestTimes(this: Record<string, boolean>, value: boolean) {
      this.showBestTimes = value
    },
    updateHideIfNeeded(this: Record<string, boolean>, value: boolean) {
      this.hideIfNeeded = value
    },
    updateCollapseDisabledTimes(this: Record<string, boolean>, value: boolean) {
      this.collapseDisabledTimes = value
    },
    updateShowCalendarEvents(this: Record<string, boolean>, value: boolean) {
      this.showCalendarEvents = value
    },
    updateStartCalendarOnMonday(this: Record<string, boolean>, value: boolean) {
      this.startCalendarOnMonday = value
    },
    updateOverlayAvailability(this: Record<string, boolean>, value: boolean) {
      this.overlayAvailability = value
    },
    getAllValidTimeRanges() {
      return []
    },
  },
  template: "<div />",
}

const ScheduleOverlapNoGuestSelectionStub = {
  ...ScheduleOverlapStub,
  data() {
    return {
      ...ScheduleOverlapStub.data(),
      ownedGuestResponses: [
        {
          lookupKey: "000000000000000000000000",
          name: "khh",
          lastUsedAt: 2,
        },
        {
          lookupKey: "111111111111111111111111",
          name: "ada",
          lastUsedAt: 1,
        },
      ],
      respondents: [
        { _id: "khh", name: "khh" },
        { _id: "ada", name: "ada" },
      ],
    }
  },
}

const ScheduleOverlapNoOwnedGuestResponsesStub = {
  ...ScheduleOverlapStub,
  data() {
    return {
      ...ScheduleOverlapStub.data(),
      ownedGuestResponses: [],
      respondents: [],
    }
  },
}

const ScheduleOverlapResponsesWithoutOwnedGuestStub = {
  ...ScheduleOverlapStub,
  data() {
    return {
      ...ScheduleOverlapStub.data(),
      ownedGuestResponses: [],
      respondents: [{ _id: "khh", name: "khh" }],
    }
  },
}

const ScheduleOverlapEditingStub = {
  ...ScheduleOverlapStub,
  data() {
    return {
      ...ScheduleOverlapStub.data(),
      editing: true,
    }
  },
}

const ScheduleOverlapEditingNoOverlayStub = {
  ...ScheduleOverlapStub,
  data() {
    return {
      ...ScheduleOverlapStub.data(),
      editing: true,
      showOverlayAvailabilityToggle: false,
    }
  },
}

const modelValueSwitchStub = {
  name: "VSwitch",
  props: {
    modelValue: { type: Boolean, required: false, default: false },
  },
  emits: ["update:modelValue"],
  template: '<div><slot name="label" /></div>',
}

const ScheduleOverlapEditingSaveDisabledStub = {
  ...ScheduleOverlapStub,
  data() {
    return {
      ...ScheduleOverlapStub.data(),
      editing: true,
      respondentSaveAllowed: false,
    }
  },
}

const ScheduleOverlapSchedulingStub = {
  ...ScheduleOverlapStub,
  data() {
    return {
      ...ScheduleOverlapStub.data(),
      scheduling: true,
      allowScheduleEvent: true,
    }
  },
}

const ScheduleOverlapSchedulingDisabledStub = {
  ...ScheduleOverlapStub,
  data() {
    return {
      ...ScheduleOverlapStub.data(),
      scheduling: true,
      allowScheduleEvent: false,
    }
  },
}

const ScheduleOverlapLegacyAndTokenGuestSelectionStub = {
  ...ScheduleOverlapStub,
  data() {
    return {
      ...ScheduleOverlapStub.data(),
      ownedGuestResponses: [
        {
          lookupKey: "legacy-user-id",
          name: "Saved legacy guest",
          lastUsedAt: 2,
        },
        {
          lookupKey: "guest-token-id",
          name: "Saved token guest",
          lastUsedAt: 1,
        },
      ],
      respondents: [
        { _id: "legacy-response", name: "Legacy Display Name" },
        { _id: "token-response", name: "Token Display Name" },
      ],
    }
  },
}

const eventDescriptionStub = {
  name: "EventDescriptionStub",
  props: {
    event: { type: Object, required: true },
  },
  template: `
    <div
      id="event-description-stub"
      class="event-description-stub"
    />
  `,
}

const invitationDialogStub = {
  name: "InvitationDialogStub",
  props: {
    modelValue: { type: Boolean, required: true },
  },
  template: '<div :data-invitation-open="String(modelValue)" />',
}

const buttonClickStub = {
  template: "<button @click=\"$emit('click', $event)\"><slot /></button>",
}

const buttonSemanticStub = {
  inheritAttrs: false,
  emits: ["click"],
  props: {
    id: { type: String, default: "" },
    variant: { type: String, default: "" },
    color: { type: String, default: "" },
  },
  template: `
    <button
      v-bind="$attrs"
      :id="id"
      :data-variant="variant"
      :data-color="color"
      @click="$emit('click', $event)"
    >
      <slot />
    </button>
  `,
}

const menuStub = {
  name: "VMenu",
  props: {
    modelValue: {
      type: Boolean,
      default: false,
    },
  },
  template:
    '<div><slot name="activator" :props="{}" /><slot v-if="modelValue" /></div>',
}

const iconTextStub = {
  template: "<i><slot /></i>",
}

describe("Event primary availability button outline", () => {
  const eventViewStyleBlock =
    /<style>([\s\S]*?)<\/style>/.exec(eventViewSource)?.[1] ?? ""

  const extractRuleBody = (selector: string) =>
    new RegExp(`${selector}\\s*\\{([^}]*)\\}`).exec(eventViewStyleBlock)?.[1]

  it("outlines the solid-fill Edit availability button with the primary action color on desktop and mobile", () => {
    const desktopRuleBody = extractRuleBody(
      "\\.desktop-primary-availability-button",
    )
    const mobileRuleBody = extractRuleBody(
      "\\.mobile-primary-availability-button--edit",
    )

    expect(desktopRuleBody).toBeDefined()
    expect(mobileRuleBody).toBeDefined()
    for (const ruleBody of [desktopRuleBody, mobileRuleBody]) {
      expect(ruleBody).toContain(
        "border: 1px solid var(--timeful-primary-action-bg);",
      )
      expect(ruleBody).not.toContain("#29bc68")
    }
  })

  it("keeps the primary action token aligned with the solid fill green", () => {
    const appCssSource = readFileSync("src/index.css", "utf8")
    expect(appCssSource).toMatch(/--timeful-primary-action-bg:\s*#00994c;/i)
  })
})

describe("Event guest edit action", () => {
  it("uses the standard sm breakpoint for the compact desktop header", () => {
    expect(eventViewSource).toContain(
      "tw:sm:flex-row tw:sm:items-start tw:sm:gap-4",
    )
    expect(eventViewSource).not.toContain(
      "tw:md:flex-row tw:md:items-start tw:md:gap-4",
    )
  })

  it("matches the desktop title line height to availability controls", () => {
    expect(eventViewSource).toContain("tw:sm:text-3xl tw:sm:leading-10")
  })

  it("uses explicit desktop rows for metadata actions", () => {
    expect(eventViewSource).toContain('id="event-header-meta-row"')
    expect(eventViewSource).toContain(
      "event-header-row tw:flex tw:flex-col tw:gap-2 tw:sm:flex-row tw:sm:items-center tw:sm:gap-4",
    )
  })

  it("aligns mobile footer action edges with the elevated panel above", () => {
    expect(eventViewSource).toContain(
      "tw:flex tw:h-16 tw:w-full tw:items-center tw:px-4",
    )
    expect(eventViewSource).not.toContain("tw:max-sm:px-2")
    expect(eventViewSource).toContain(
      "tw:flex tw:min-w-0 tw:items-center tw:gap-2 tw:max-sm:gap-1",
    )
    expect(eventViewSource).toContain("tw:max-sm:px-1 tw:max-sm:text-xs")
  })

  beforeEach(() => {
    vi.clearAllMocks()
    vi.useFakeTimers()
    vi.stubGlobal("requestAnimationFrame", (callback: FrameRequestCallback) =>
      window.setTimeout(() => {
        callback(0)
      }, 0),
    )
    authUserState.value = null
    isPhoneState.value = false
    curGuestIdState.value = ""
    routeState.value = { name: "event", query: {} }
    loaderEventState.value = {
      ...createDefaultEventState(),
      type: eventTypes.SPECIFIC_DATES,
    }
  })

  async function flushDeferredMount() {
    await nextTick()
    vi.runAllTimers()
    await Promise.resolve()
    vi.runAllTimers()
    await nextTick()
    await nextTick()
  }

  it("renders a durable inline not-found state for missing event fetches", async () => {
    loaderEventState.value = null as unknown as EventTestState
    refreshEventMock.mockRejectedValueOnce({
      status: 404,
      parsed: { error: "event-not-found" },
    })

    const wrapper = shallowMount(EventView, {
      props: {
        eventId: "dEeaF",
      },
      global: {
        stubs: {
          ScheduleOverlap: ScheduleOverlapStub,
          NewDialog: true,
          GuestDialog: true,
          SignUpForSlotDialog: true,
          SignInNotSupportedDialog: true,
          MarkAvailabilityDialog: true,
          InvitationDialog: true,
          HelpDialog: true,
          EventDescription: true,
          AccessDenied: true,
          NotSignedIn: true,
          RouterLink: { template: "<a><slot /></a>" },
          "v-chip": true,
          "v-icon": true,
          "v-card": true,
          "v-card-title": true,
          "v-card-text": true,
          "v-card-actions": true,
          "v-dialog": true,
          "v-spacer": true,
          "v-btn": buttonSemanticStub,
        },
      },
    })

    await flushDeferredMount()
    await Promise.resolve()
    await nextTick()

    expect(wrapper.text()).toContain("Event not found")
    expect(wrapper.text()).toContain(
      "This event may have been deleted, or the link may be incorrect.",
    )
    const backToHome = wrapper
      .findAll("button")
      .find((button) => button.text().includes("Back to home"))
    expect(backToHome).toBeDefined()
    const backToHomeBtn = backToHome
    expect(backToHomeBtn?.attributes("data-color")).toBe("primary")
    expect(backToHomeBtn?.classes()).not.toContain("timeful-elevated-button")
    expect(backToHomeBtn?.classes()).not.toContain("tw:bg-green")
    expect(routerReplaceMock).not.toHaveBeenCalled()
    expect(showErrorMock).not.toHaveBeenCalled()
    expect(wrapper.findComponent(ScheduleOverlapStub).exists()).toBe(false)
  })

  it("shows generic edit copy when one owned guest response exists", async () => {
    const wrapper = shallowMount(EventView, {
      props: {
        eventId: "dEeaF",
      },
      global: {
        stubs: {
          ScheduleOverlap: ScheduleOverlapStub,
          NewDialog: true,
          GuestDialog: true,
          SignUpForSlotDialog: true,
          SignInNotSupportedDialog: true,
          MarkAvailabilityDialog: true,
          InvitationDialog: true,
          HelpDialog: true,
          EventDescription: true,
          AccessDenied: true,
          NotSignedIn: true,
          RouterLink: true,
          "v-chip": true,
          "v-icon": true,
          "v-card": true,
          "v-card-title": true,
          "v-card-text": true,
          "v-card-actions": true,
          "v-dialog": true,
          "v-spacer": true,
          "v-menu": menuStub,
          "v-btn": buttonSemanticStub,
        },
      },
    })

    await flushDeferredMount()

    expect(wrapper.text()).toContain("Edit availability")
  })

  it("applies a create-flow specific-times draft from history state before rendering the calendar", async () => {
    window.history.replaceState(
      {
        timefulSpecificTimesEntry: {
          mode: "create",
          draft: {
            enabledSlots: ["2026-05-28T09:00:00Z"],
            activeSlots: [],
            eventTimezone: "UTC",
            slotGeneration: {
              startTimeLocal: "09:00:00",
              endTimeLocal: "10:00:00",
              timeIncrementMinutes: 60,
            },
            timedRecurrence: {
              kind: "specific_dates",
              selectedDays: ["2026-05-28"],
              selectedDaysOfWeek: [],
              startOnMonday: true,
            },
            timeIncrementMinutes: 60,
            resetExistingTimes: true,
          },
        },
      },
      "",
      "http://localhost:3000/e/dEeaF",
    )
    loaderEventState.value = {
      ...createDefaultEventState(),
      hasSpecificTimes: true,
      times: [
        Temporal.Instant.from("2026-05-28T09:00:00Z").toZonedDateTimeISO("UTC"),
      ],
      enabledSlots: [
        Temporal.Instant.from("2026-05-28T09:00:00Z").toZonedDateTimeISO("UTC"),
      ],
      activeSlots: [
        Temporal.Instant.from("2026-05-28T09:00:00Z").toZonedDateTimeISO("UTC"),
      ],
    }

    const wrapper = shallowMount(EventView, {
      props: {
        eventId: "dEeaF",
      },
      global: {
        stubs: {
          ScheduleOverlap: ScheduleOverlapStub,
          NewDialog: true,
          GuestDialog: true,
          SignUpForSlotDialog: true,
          SignInNotSupportedDialog: true,
          MarkAvailabilityDialog: true,
          InvitationDialog: true,
          HelpDialog: true,
          EventDescription: true,
          AccessDenied: true,
          NotSignedIn: true,
          RouterLink: true,
          "v-chip": true,
          "v-icon": true,
          "v-card": true,
          "v-card-title": true,
          "v-card-text": true,
          "v-card-actions": true,
          "v-dialog": true,
          "v-spacer": true,
          "v-btn": true,
        },
      },
    })

    await flushDeferredMount()
    await Promise.resolve()
    await nextTick()

    const scheduleOverlap = wrapper.findComponent(ScheduleOverlapStub)
    expect(scheduleOverlap.exists()).toBe(true)
    expect(scheduleOverlap.props("fromCreateSpecificTimesDraft")).toBe(true)
    expect(
      (
        scheduleOverlap.props("specificTimesEntryDraft") as {
          activeSlots?: unknown[]
          resetExistingTimes?: boolean
        }
      ).activeSlots,
    ).toEqual([])
    expect(
      (window.history.state as { timefulSpecificTimesEntry?: unknown })
        .timefulSpecificTimesEntry,
    ).toBeUndefined()

    wrapper.unmount()
  })

  it("keeps the top button label generic when multiple owned guest responses exist", async () => {
    loaderEventState.value = {
      ...loaderEventState.value,
      responses: {
        khh: {
          name: "khh",
          user: {
            _id: "000000000000000000000000",
            firstName: "khh",
            lastName: "",
            email: "",
          },
          availability: [],
        },
        ada: {
          name: "ada",
          user: {
            _id: "111111111111111111111111",
            firstName: "ada",
            lastName: "",
            email: "",
          },
          availability: [],
        },
      },
    }

    const wrapper = shallowMount(EventView, {
      props: {
        eventId: "dEeaF",
      },
      global: {
        stubs: {
          ScheduleOverlap: ScheduleOverlapNoGuestSelectionStub,
          NewDialog: true,
          GuestDialog: true,
          SignUpForSlotDialog: true,
          SignInNotSupportedDialog: true,
          MarkAvailabilityDialog: true,
          InvitationDialog: true,
          HelpDialog: true,
          EventDescription: true,
          AccessDenied: true,
          NotSignedIn: true,
          RouterLink: true,
          "v-chip": true,
          "v-icon": true,
          "v-card": true,
          "v-card-title": true,
          "v-card-text": true,
          "v-card-actions": true,
          "v-dialog": true,
          "v-menu": menuStub,
          "v-spacer": true,
          "v-btn": buttonClickStub,
        },
      },
    })

    await flushDeferredMount()

    expect(wrapper.get("#desktop-primary-availability-btn").text()).toContain(
      "Edit availability",
    )
    expect(
      wrapper.get("#desktop-primary-availability-btn").classes(),
    ).toContain("desktop-primary-availability-button--edit")
    expect(wrapper.get("#desktop-secondary-availability-btn").text()).toContain(
      "Add availability",
    )
  })

  it("shows add-guest availability beside edit availability for signed-in respondents", async () => {
    authUserState.value = {
      _id: "000000000000000000000000",
    }

    const wrapper = shallowMount(EventView, {
      props: {
        eventId: "dEeaF",
      },
      global: {
        stubs: {
          ScheduleOverlap: ScheduleOverlapStub,
          NewDialog: true,
          GuestDialog: true,
          SignUpForSlotDialog: true,
          SignInNotSupportedDialog: true,
          MarkAvailabilityDialog: true,
          InvitationDialog: true,
          HelpDialog: true,
          EventDescription: true,
          AccessDenied: true,
          NotSignedIn: true,
          RouterLink: true,
          "v-chip": true,
          "v-icon": true,
          "v-card": true,
          "v-card-title": true,
          "v-card-text": true,
          "v-card-actions": true,
          "v-dialog": true,
          "v-menu": menuStub,
          "v-spacer": true,
          "v-btn": buttonClickStub,
        },
      },
    })

    await flushDeferredMount()

    expect(wrapper.get("#desktop-primary-availability-btn").text()).toContain(
      "Edit availability",
    )
    expect(
      wrapper.get("#desktop-primary-availability-btn").classes(),
    ).toContain("desktop-primary-availability-button--edit")
    expect(wrapper.get("#desktop-secondary-availability-btn").text()).toContain(
      "Add guest availability",
    )
  })

  it("renders desktop display options in the header action cluster", async () => {
    loaderEventState.value = {
      ...loaderEventState.value,
      responses: {
        ...loaderEventState.value.responses,
        ada: {
          name: "ada",
          user: {
            _id: "111111111111111111111111",
            firstName: "ada",
            lastName: "",
            email: "",
          },
          availability: [],
        },
      },
    }

    const wrapper = shallowMount(EventView, {
      props: {
        eventId: "dEeaF",
      },
      global: {
        stubs: {
          ScheduleOverlap: ScheduleOverlapStub,
          EventOptions: true,
          NewDialog: true,
          GuestDialog: true,
          SignUpForSlotDialog: true,
          SignInNotSupportedDialog: true,
          MarkAvailabilityDialog: true,
          InvitationDialog: true,
          HelpDialog: true,
          EventDescription: true,
          AccessDenied: true,
          NotSignedIn: true,
          RouterLink: true,
          "v-btn": buttonSemanticStub,
          "v-card": true,
          "v-card-actions": true,
          "v-card-text": true,
          "v-card-title": true,
          "v-chip": true,
          "v-dialog": true,
          "v-icon": true,
          "v-spacer": true,
        },
      },
    })

    await flushDeferredMount()
    await nextTick()
    await nextTick()

    expect(
      wrapper.get("#event-header-actions").element.parentElement?.className,
    ).toContain("desktop-event-header-actions")
    expect(
      wrapper.get("#desktop-primary-availability-btn").classes(),
    ).toContain("desktop-event-header-control")
    expect(
      wrapper.get("#desktop-secondary-availability-btn").classes(),
    ).toContain("desktop-event-header-control")
    expect(wrapper.find("#show-best-times-header-toggle").exists()).toBe(true)
    expect(wrapper.find("#desktop-header-more-options").exists()).toBe(true)
    expect(wrapper.find("#collapse-disabled-times-toggle").exists()).toBe(false)
  })

  it("uses the add-specific desktop CTA styling when the primary action is Add availability", async () => {
    loaderEventState.value = {
      ...loaderEventState.value,
      responses: {},
    }

    const wrapper = shallowMount(EventView, {
      props: {
        eventId: "dEeaF",
      },
      global: {
        stubs: {
          ScheduleOverlap: ScheduleOverlapNoOwnedGuestResponsesStub,
          EventOptions: true,
          NewDialog: true,
          GuestDialog: true,
          SignUpForSlotDialog: true,
          SignInNotSupportedDialog: true,
          MarkAvailabilityDialog: true,
          InvitationDialog: true,
          HelpDialog: true,
          EventDescription: true,
          AccessDenied: true,
          NotSignedIn: true,
          RouterLink: true,
          "v-btn": buttonSemanticStub,
          "v-card": true,
          "v-card-actions": true,
          "v-card-text": true,
          "v-card-title": true,
          "v-chip": true,
          "v-dialog": true,
          "v-icon": true,
          "v-spacer": true,
        },
      },
    })

    await flushDeferredMount()

    expect(wrapper.get("#desktop-primary-availability-btn").text()).toContain(
      "Add availability",
    )
    expect(
      wrapper.get("#desktop-primary-availability-btn").classes(),
    ).toContain("desktop-primary-availability-button--add")
  })

  it("keeps edit availability visible but disabled when responses exist without an editable response", async () => {
    const wrapper = shallowMount(EventView, {
      props: {
        eventId: "dEeaF",
      },
      global: {
        stubs: {
          ScheduleOverlap: ScheduleOverlapResponsesWithoutOwnedGuestStub,
          EventOptions: true,
          NewDialog: true,
          GuestDialog: true,
          SignUpForSlotDialog: true,
          SignInNotSupportedDialog: true,
          MarkAvailabilityDialog: true,
          InvitationDialog: true,
          HelpDialog: true,
          EventDescription: true,
          AccessDenied: true,
          NotSignedIn: true,
          RouterLink: true,
          "v-btn": buttonSemanticStub,
          "v-card": true,
          "v-card-actions": true,
          "v-card-text": true,
          "v-card-title": true,
          "v-chip": true,
          "v-dialog": true,
          "v-icon": true,
          "v-spacer": true,
        },
      },
    })

    await flushDeferredMount()

    expect(wrapper.get("#desktop-primary-availability-btn").text()).toContain(
      "Edit availability",
    )
    expect(
      wrapper.get("#desktop-primary-availability-btn").attributes("disabled"),
    ).toBe("")
    expect(wrapper.get("#desktop-secondary-availability-btn").text()).toContain(
      "Add availability",
    )
  })

  it("uses the elevated green treatment for mobile add availability", async () => {
    isPhoneState.value = true
    loaderEventState.value = {
      ...loaderEventState.value,
      responses: {},
    }

    const wrapper = shallowMount(EventView, {
      props: {
        eventId: "dEeaF",
      },
      global: {
        stubs: {
          ScheduleOverlap: ScheduleOverlapNoOwnedGuestResponsesStub,
          EventOptions: true,
          NewDialog: true,
          GuestDialog: true,
          SignUpForSlotDialog: true,
          SignInNotSupportedDialog: true,
          MarkAvailabilityDialog: true,
          InvitationDialog: true,
          HelpDialog: true,
          EventDescription: true,
          AccessDenied: true,
          NotSignedIn: true,
          RouterLink: true,
          "v-btn": buttonSemanticStub,
          "v-card": true,
          "v-card-actions": true,
          "v-card-text": true,
          "v-card-title": true,
          "v-chip": true,
          "v-dialog": true,
          "v-icon": true,
          "v-spacer": true,
        },
      },
    })

    await flushDeferredMount()

    expect(wrapper.get("#mobile-primary-availability-btn").text()).toContain(
      "Add availability",
    )
    expect(wrapper.get("#mobile-primary-availability-btn").classes()).toContain(
      "mobile-primary-availability-button",
    )
    expect(wrapper.get("#mobile-primary-availability-btn").classes()).toContain(
      "timeful-elevated-button",
    )
    const scheduleButton = wrapper
      .findAll("button")
      .find((button) => button.text().includes("Schedule"))
    expect(scheduleButton?.classes()).toContain("tw:border-blue")
    expect(scheduleButton?.classes()).toContain("tw:text-blue")
    expect(wrapper.get(".mobile-event-action-bar").classes()).toContain(
      "mobile-event-action-bar",
    )
  })

  it("keeps mobile edit availability visible but disabled when responses exist without an editable response", async () => {
    isPhoneState.value = true

    const wrapper = shallowMount(EventView, {
      props: {
        eventId: "dEeaF",
      },
      global: {
        stubs: {
          ScheduleOverlap: ScheduleOverlapResponsesWithoutOwnedGuestStub,
          EventOptions: true,
          NewDialog: true,
          GuestDialog: true,
          SignUpForSlotDialog: true,
          SignInNotSupportedDialog: true,
          MarkAvailabilityDialog: true,
          InvitationDialog: true,
          HelpDialog: true,
          EventDescription: true,
          AccessDenied: true,
          NotSignedIn: true,
          RouterLink: true,
          "v-btn": buttonSemanticStub,
          "v-card": true,
          "v-card-actions": true,
          "v-card-text": true,
          "v-card-title": true,
          "v-chip": true,
          "v-dialog": true,
          "v-icon": true,
          "v-spacer": true,
        },
      },
    })

    await flushDeferredMount()

    expect(wrapper.get("#mobile-primary-availability-btn").text()).toContain(
      "Edit availability",
    )
    expect(
      wrapper.get("#mobile-primary-availability-btn").attributes("disabled"),
    ).toBe("")
    expect(wrapper.get("#mobile-secondary-availability-btn").text()).toContain(
      "Add availability",
    )
  })

  it("keeps no-response desktop controls in their matching flex rows", async () => {
    loaderEventState.value = {
      ...loaderEventState.value,
      responses: {},
    }

    const wrapper = shallowMount(EventView, {
      props: {
        eventId: "dEeaF",
      },
      global: {
        stubs: {
          ScheduleOverlap: ScheduleOverlapNoOwnedGuestResponsesStub,
          EventOptions: true,
          NewDialog: true,
          GuestDialog: true,
          SignUpForSlotDialog: true,
          SignInNotSupportedDialog: true,
          MarkAvailabilityDialog: true,
          InvitationDialog: true,
          HelpDialog: true,
          EventDescription: true,
          AccessDenied: true,
          NotSignedIn: true,
          RouterLink: true,
          "v-btn": buttonSemanticStub,
          "v-card": true,
          "v-card-actions": true,
          "v-card-text": true,
          "v-card-title": true,
          "v-chip": true,
          "v-dialog": true,
          "v-icon": true,
          "v-spacer": true,
          "v-switch": true,
        },
      },
    })

    await flushDeferredMount()

    expect(wrapper.get("#event-header-actions").html()).toContain(
      "desktop-event-header-single-column",
    )
    expect(wrapper.get("#desktop-schedule-event-btn").classes()).toContain(
      "desktop-event-header-single-column",
    )
    expect(
      wrapper
        .find("#event-header-meta-row #collapse-disabled-times-toggle")
        .exists(),
    ).toBe(true)
    expect(
      wrapper
        .find("#event-header-actions #collapse-disabled-times-toggle")
        .exists(),
    ).toBe(false)
    expect(eventViewSource).toContain(".desktop-event-header-single-column")
    expect(eventViewSource).toContain("flex: 0 0 calc((100% - 0.5rem) / 2);")
    expect(
      wrapper.get("#desktop-schedule-event-btn").element.parentElement
        ?.className,
    ).toContain("tw:sm:ml-auto")
  })

  it("spans both desktop action columns when responses exist", async () => {
    const wrapper = shallowMount(EventView, {
      props: {
        eventId: "dEeaF",
      },
      global: {
        stubs: {
          ScheduleOverlap: ScheduleOverlapStub,
          EventOptions: true,
          NewDialog: true,
          GuestDialog: true,
          SignUpForSlotDialog: true,
          SignInNotSupportedDialog: true,
          MarkAvailabilityDialog: true,
          InvitationDialog: true,
          HelpDialog: true,
          EventDescription: true,
          AccessDenied: true,
          NotSignedIn: true,
          RouterLink: true,
          "v-btn": buttonSemanticStub,
          "v-card": true,
          "v-card-actions": true,
          "v-card-text": true,
          "v-card-title": true,
          "v-chip": true,
          "v-dialog": true,
          "v-icon": true,
          "v-spacer": true,
          "v-switch": true,
        },
      },
    })

    await flushDeferredMount()

    const scheduleEventButton = wrapper.get("#desktop-schedule-event-btn")
    expect(scheduleEventButton.classes()).toContain("tw:w-full")
    expect(scheduleEventButton.classes()).not.toContain(
      "desktop-event-header-single-column",
    )
  })

  it("triggers add guest availability from the new secondary desktop action", async () => {
    authUserState.value = {
      _id: "000000000000000000000000",
    }

    const wrapper = shallowMount(EventView, {
      props: {
        eventId: "dEeaF",
      },
      global: {
        stubs: {
          ScheduleOverlap: ScheduleOverlapStub,
          NewDialog: true,
          GuestDialog: true,
          SignUpForSlotDialog: true,
          SignInNotSupportedDialog: true,
          MarkAvailabilityDialog: true,
          InvitationDialog: true,
          HelpDialog: true,
          EventDescription: true,
          AccessDenied: true,
          NotSignedIn: true,
          RouterLink: true,
          "v-chip": true,
          "v-icon": true,
          "v-card": true,
          "v-card-title": true,
          "v-card-text": true,
          "v-card-actions": true,
          "v-dialog": true,
          "v-menu": menuStub,
          "v-spacer": true,
          "v-btn": buttonSemanticStub,
        },
      },
    })

    await flushDeferredMount()
    const initialCallCount = addAvailabilityAsGuestMock.mock.calls.length
    await wrapper.get("#desktop-secondary-availability-btn").trigger("click")

    expect(addAvailabilityAsGuestMock).toHaveBeenCalledTimes(
      initialCallCount + 1,
    )
  })

  it("opens direct guest editing when exactly one owned guest response exists", async () => {
    const wrapper = shallowMount(EventView, {
      props: {
        eventId: "dEeaF",
      },
      global: {
        stubs: {
          ScheduleOverlap: ScheduleOverlapStub,
          NewDialog: true,
          GuestDialog: true,
          SignUpForSlotDialog: true,
          SignInNotSupportedDialog: true,
          MarkAvailabilityDialog: true,
          InvitationDialog: true,
          HelpDialog: true,
          EventDescription: true,
          AccessDenied: true,
          NotSignedIn: true,
          RouterLink: true,
          "v-chip": true,
          "v-icon": true,
          "v-card": true,
          "v-card-title": true,
          "v-card-text": true,
          "v-card-actions": true,
          "v-dialog": true,
          "v-menu": menuStub,
          "v-spacer": true,
          "v-btn": buttonClickStub,
        },
      },
    })

    await flushDeferredMount()

    const guestEditButton = wrapper
      .findAll("button")
      .find((node) => node.text().includes("Edit availability"))

    expect(guestEditButton).toBeDefined()
    if (!guestEditButton) {
      throw new Error("Expected guest edit button to be rendered")
    }

    await guestEditButton.trigger("click")

    expect(editOwnedGuestAvailabilityMock).toHaveBeenCalledWith(
      "000000000000000000000000",
    )
  })

  it("uses generic edit copy for blind availability when a guest target is selected", async () => {
    loaderEventState.value = {
      ...loaderEventState.value,
      blindAvailabilityEnabled: true,
    }

    const wrapper = shallowMount(EventView, {
      props: {
        eventId: "dEeaF",
      },
      global: {
        stubs: {
          ScheduleOverlap: ScheduleOverlapStub,
          NewDialog: true,
          GuestDialog: true,
          SignUpForSlotDialog: true,
          SignInNotSupportedDialog: true,
          MarkAvailabilityDialog: true,
          InvitationDialog: true,
          HelpDialog: true,
          EventDescription: true,
          AccessDenied: true,
          NotSignedIn: true,
          RouterLink: true,
          "v-chip": true,
          "v-icon": true,
          "v-card": true,
          "v-card-title": true,
          "v-card-text": true,
          "v-card-actions": true,
          "v-dialog": true,
          "v-menu": menuStub,
          "v-spacer": true,
          "v-btn": buttonClickStub,
        },
      },
    })

    await flushDeferredMount()

    expect(wrapper.text()).toContain("Edit availability")
  })

  it("does not jump straight into editing when multiple guest responses exist", async () => {
    loaderEventState.value = {
      ...loaderEventState.value,
      responses: {
        khh: {
          name: "khh",
          user: {
            _id: "000000000000000000000000",
            firstName: "khh",
            lastName: "",
            email: "",
          },
          availability: [],
        },
        ada: {
          name: "ada",
          user: {
            _id: "111111111111111111111111",
            firstName: "ada",
            lastName: "",
            email: "",
          },
          availability: [],
        },
      },
    }
    const wrapper = shallowMount(EventView, {
      props: {
        eventId: "dEeaF",
      },
      global: {
        stubs: {
          ScheduleOverlap: ScheduleOverlapNoGuestSelectionStub,
          NewDialog: true,
          GuestDialog: true,
          SignUpForSlotDialog: true,
          SignInNotSupportedDialog: true,
          MarkAvailabilityDialog: true,
          InvitationDialog: true,
          HelpDialog: true,
          EventDescription: true,
          AccessDenied: true,
          NotSignedIn: true,
          RouterLink: true,
          "v-chip": true,
          "v-icon": true,
          "v-card": true,
          "v-card-title": true,
          "v-card-text": true,
          "v-card-actions": true,
          "v-dialog": true,
          "v-spacer": true,
          "v-btn": buttonClickStub,
        },
      },
    })

    await flushDeferredMount()

    const guestEditButton = wrapper
      .findAll("button")
      .find((node) => node.text().includes("Edit availability"))

    expect(guestEditButton).toBeDefined()
    if (!guestEditButton) {
      throw new Error("Expected guest edit button to be rendered")
    }

    await guestEditButton.trigger("click")
    await nextTick()

    expect(editOwnedGuestAvailabilityMock).not.toHaveBeenCalled()
  })

  it("renders the desktop owned guest chooser from the primary availability anchor", async () => {
    loaderEventState.value = {
      ...loaderEventState.value,
      responses: {
        khh: {
          name: "khh",
          user: {
            _id: "000000000000000000000000",
            firstName: "khh",
            lastName: "",
            email: "",
          },
          availability: [],
        },
        ada: {
          name: "ada",
          user: {
            _id: "111111111111111111111111",
            firstName: "ada",
            lastName: "",
            email: "",
          },
          availability: [],
        },
      },
    }

    const wrapper = shallowMount(EventView, {
      props: {
        eventId: "dEeaF",
      },
      global: {
        stubs: {
          ScheduleOverlap: ScheduleOverlapNoGuestSelectionStub,
          NewDialog: true,
          GuestDialog: true,
          SignUpForSlotDialog: true,
          SignInNotSupportedDialog: true,
          MarkAvailabilityDialog: true,
          InvitationDialog: true,
          HelpDialog: true,
          EventDescription: true,
          AccessDenied: true,
          NotSignedIn: true,
          RouterLink: true,
          "v-chip": true,
          "v-icon": true,
          "v-card": true,
          "v-card-title": true,
          "v-card-text": true,
          "v-card-actions": true,
          "v-dialog": true,
          "v-menu": menuStub,
          "v-spacer": true,
          "v-btn": buttonSemanticStub,
        },
      },
    })

    await flushDeferredMount()
    await wrapper.get("#desktop-primary-availability-btn").trigger("click")
    await nextTick()

    expect(
      (wrapper.vm as unknown as { showGuestEditMenu: boolean })
        .showGuestEditMenu,
    ).toBe(true)

    const primaryAnchor = wrapper.get(".desktop-primary-availability-anchor")
    expect(
      primaryAnchor.find("#desktop-primary-availability-btn").exists(),
    ).toBe(true)
    expect(primaryAnchor.findComponent({ name: "VMenu" }).exists()).toBe(true)

    const headerActionButtons = Array.from(
      wrapper.get("#event-header-actions").element.children,
    )
      .filter((child) => child.tagName === "BUTTON")
      .map((child) => child.textContent.trim())
    expect(headerActionButtons).not.toContain("khh")
    expect(headerActionButtons).not.toContain("ada")
  })

  it("renders the mobile owned guest chooser from the sticky primary availability action", async () => {
    isPhoneState.value = true
    loaderEventState.value = {
      ...loaderEventState.value,
      responses: {
        khh: {
          name: "khh",
          user: {
            _id: "000000000000000000000000",
            firstName: "khh",
            lastName: "",
            email: "",
          },
          availability: [],
        },
        ada: {
          name: "ada",
          user: {
            _id: "111111111111111111111111",
            firstName: "ada",
            lastName: "",
            email: "",
          },
          availability: [],
        },
      },
    }

    const wrapper = shallowMount(EventView, {
      props: {
        eventId: "dEeaF",
      },
      global: {
        stubs: {
          ScheduleOverlap: ScheduleOverlapNoGuestSelectionStub,
          NewDialog: true,
          GuestDialog: true,
          SignUpForSlotDialog: true,
          SignInNotSupportedDialog: true,
          MarkAvailabilityDialog: true,
          InvitationDialog: true,
          HelpDialog: true,
          EventDescription: true,
          AccessDenied: true,
          NotSignedIn: true,
          RouterLink: true,
          "v-chip": true,
          "v-icon": true,
          "v-card": true,
          "v-card-title": true,
          "v-card-text": true,
          "v-card-actions": true,
          "v-dialog": true,
          "v-menu": menuStub,
          "v-spacer": true,
          "v-btn": buttonSemanticStub,
        },
      },
    })

    await flushDeferredMount()
    await wrapper.get("#mobile-primary-availability-btn").trigger("click")
    await nextTick()

    expect(
      (wrapper.vm as unknown as { showGuestEditMenu: boolean })
        .showGuestEditMenu,
    ).toBe(true)
    expect(wrapper.get("#mobile-primary-availability-btn").text()).toContain(
      "Edit availability",
    )
    expect(wrapper.get("#mobile-primary-availability-btn").classes()).toContain(
      "mobile-primary-availability-button--edit",
    )
    expect(wrapper.findComponent({ name: "VMenu" }).exists()).toBe(true)
  })

  it("closes the owned guest edit menu when clicking outside it", async () => {
    loaderEventState.value = {
      ...loaderEventState.value,
      responses: {
        khh: {
          name: "khh",
          user: {
            _id: "000000000000000000000000",
            firstName: "khh",
            lastName: "",
            email: "",
          },
          availability: [],
        },
        ada: {
          name: "ada",
          user: {
            _id: "111111111111111111111111",
            firstName: "ada",
            lastName: "",
            email: "",
          },
          availability: [],
        },
      },
    }

    const wrapper = shallowMount(EventView, {
      props: {
        eventId: "dEeaF",
      },
      global: {
        stubs: {
          ScheduleOverlap: ScheduleOverlapNoGuestSelectionStub,
          NewDialog: true,
          GuestDialog: true,
          SignUpForSlotDialog: true,
          SignInNotSupportedDialog: true,
          MarkAvailabilityDialog: true,
          InvitationDialog: true,
          HelpDialog: true,
          EventDescription: true,
          AccessDenied: true,
          NotSignedIn: true,
          RouterLink: true,
          "v-chip": true,
          "v-icon": true,
          "v-card": true,
          "v-card-title": true,
          "v-card-text": true,
          "v-card-actions": true,
          "v-dialog": true,
          "v-menu": menuStub,
          "v-spacer": true,
          "v-btn": buttonClickStub,
        },
      },
    })

    await flushDeferredMount()
    ;(
      wrapper.vm as unknown as { editSelectedGuestAvailability: () => void }
    ).editSelectedGuestAvailability()
    await nextTick()

    expect(
      (wrapper.vm as unknown as { showGuestEditMenu: boolean })
        .showGuestEditMenu,
    ).toBe(true)

    document.body.dispatchEvent(new MouseEvent("click", { bubbles: true }))
    await nextTick()

    expect(
      (wrapper.vm as unknown as { showGuestEditMenu: boolean })
        .showGuestEditMenu,
    ).toBe(false)
    expect(editOwnedGuestAvailabilityMock).not.toHaveBeenCalled()
  })

  it("matches legacy owned guest menu options by canonical stored identity instead of response name", async () => {
    loaderEventState.value = {
      ...loaderEventState.value,
      responses: {
        "legacy-user-id": {
          name: "Legacy Display Name",
          user: {
            firstName: "legacy",
            lastName: "",
            email: "",
          },
          availability: [],
          guestOwnershipMode: "legacy",
        },
        tokenResponse: {
          name: "Token Display Name",
          user: {
            _id: "unrelated-user-id",
            firstName: "token",
            lastName: "",
            email: "",
          },
          availability: [],
          guestId: "guest-token-id",
          guestOwnershipMode: "token",
        },
      },
    }

    const wrapper = shallowMount(EventView, {
      props: {
        eventId: "dEeaF",
      },
      global: {
        stubs: {
          ScheduleOverlap: ScheduleOverlapLegacyAndTokenGuestSelectionStub,
          NewDialog: true,
          GuestDialog: true,
          SignUpForSlotDialog: true,
          SignInNotSupportedDialog: true,
          MarkAvailabilityDialog: true,
          InvitationDialog: true,
          HelpDialog: true,
          EventDescription: true,
          AccessDenied: true,
          NotSignedIn: true,
          RouterLink: true,
          "v-chip": true,
          "v-icon": true,
          "v-card": true,
          "v-card-title": true,
          "v-card-text": true,
          "v-card-actions": true,
          "v-dialog": true,
          "v-menu": menuStub,
          "v-spacer": true,
          "v-btn": buttonClickStub,
        },
      },
    })

    await flushDeferredMount()

    expect(wrapper.text()).toContain("Edit availability")
    ;(
      wrapper.vm as unknown as { editSelectedGuestAvailability: () => void }
    ).editSelectedGuestAvailability()
    await nextTick()

    const vm = wrapper.vm as unknown as {
      ownedGuestEditOptions: { lookupKey: string; name: string }[]
      editOwnedGuestAvailability: (lookupKey: string) => void
    }
    const legacyOption = vm.ownedGuestEditOptions.find(
      (option) => option.lookupKey === "legacy-user-id",
    )
    expect(legacyOption).toMatchObject({
      lookupKey: "legacy-user-id",
      name: "legacy",
    })

    vm.editOwnedGuestAvailability("legacy-user-id")
    await nextTick()

    expect(editOwnedGuestAvailabilityMock).toHaveBeenCalledWith(
      "legacy-user-id",
    )
  })

  it("matches token-owned guest menu options by guest id", async () => {
    loaderEventState.value = {
      ...loaderEventState.value,
      responses: {
        legacyResponse: {
          name: "Legacy Display Name",
          user: {
            _id: "legacy-user-id",
            firstName: "legacy",
            lastName: "",
            email: "",
          },
          availability: [],
          guestOwnershipMode: "legacy",
        },
        tokenResponse: {
          name: "Token Display Name",
          user: {
            _id: "unrelated-user-id",
            firstName: "token",
            lastName: "",
            email: "",
          },
          availability: [],
          guestId: "guest-token-id",
          guestOwnershipMode: "token",
        },
      },
    }

    const wrapper = shallowMount(EventView, {
      props: {
        eventId: "dEeaF",
      },
      global: {
        stubs: {
          ScheduleOverlap: ScheduleOverlapLegacyAndTokenGuestSelectionStub,
          NewDialog: true,
          GuestDialog: true,
          SignUpForSlotDialog: true,
          SignInNotSupportedDialog: true,
          MarkAvailabilityDialog: true,
          InvitationDialog: true,
          HelpDialog: true,
          EventDescription: true,
          AccessDenied: true,
          NotSignedIn: true,
          RouterLink: true,
          "v-chip": true,
          "v-icon": true,
          "v-card": true,
          "v-card-title": true,
          "v-card-text": true,
          "v-card-actions": true,
          "v-dialog": true,
          "v-menu": menuStub,
          "v-spacer": true,
          "v-btn": buttonClickStub,
        },
      },
    })

    await flushDeferredMount()

    expect(wrapper.text()).toContain("Edit availability")
    ;(
      wrapper.vm as unknown as { editSelectedGuestAvailability: () => void }
    ).editSelectedGuestAvailability()
    await nextTick()

    const vm = wrapper.vm as unknown as {
      ownedGuestEditOptions: { lookupKey: string; name: string }[]
      editOwnedGuestAvailability: (lookupKey: string) => void
    }
    const tokenEntry = vm.ownedGuestEditOptions.find(
      (option) => option.lookupKey === "guest-token-id",
    )
    if (tokenEntry == null) {
      throw new Error(
        "Expected token guest menu option metadata to be available",
      )
    }
    expect(tokenEntry.name).toContain("token")

    vm.editOwnedGuestAvailability("guest-token-id")
    await nextTick()

    expect(editOwnedGuestAvailabilityMock).toHaveBeenCalledWith(
      "guest-token-id",
    )
  })

  it("passes loaded event responses through to the schedule-overlap boundary", async () => {
    const wrapper = shallowMount(EventView, {
      props: {
        eventId: "dEeaF",
      },
      global: {
        stubs: {
          ScheduleOverlap: ScheduleOverlapStub,
          NewDialog: true,
          GuestDialog: true,
          SignUpForSlotDialog: true,
          SignInNotSupportedDialog: true,
          MarkAvailabilityDialog: true,
          InvitationDialog: true,
          HelpDialog: true,
          EventDescription: true,
          AccessDenied: true,
          NotSignedIn: true,
          RouterLink: true,
          "v-chip": true,
          "v-icon": true,
          "v-card": true,
          "v-card-title": true,
          "v-card-text": true,
          "v-card-actions": true,
          "v-dialog": true,
          "v-spacer": true,
          "v-btn": true,
        },
      },
    })

    await flushDeferredMount()

    const scheduleOverlapEvent = wrapper
      .findComponent(ScheduleOverlapStub)
      .props("event") as {
      responses?: Record<string, { user?: { firstName?: string } }>
    }

    expect(scheduleOverlapEvent.responses).toMatchObject({
      khh: {
        user: {
          firstName: "khh",
        },
      },
    })
  })

  it("renders the owner edit button as an outlined metadata action", async () => {
    authUserState.value = { _id: "owner-1" }

    const wrapper = shallowMount(EventView, {
      props: {
        eventId: "dEeaF",
      },
      global: {
        stubs: {
          ScheduleOverlap: ScheduleOverlapStub,
          NewDialog: true,
          GuestDialog: true,
          SignUpForSlotDialog: true,
          SignInNotSupportedDialog: true,
          MarkAvailabilityDialog: true,
          InvitationDialog: true,
          HelpDialog: true,
          EventDescription: true,
          AccessDenied: true,
          NotSignedIn: true,
          RouterLink: true,
          "v-chip": true,
          "v-icon": true,
          "v-card": true,
          "v-card-title": true,
          "v-card-text": true,
          "v-card-actions": true,
          "v-dialog": true,
          "v-spacer": true,
          "v-menu": menuStub,
          "v-btn": buttonSemanticStub,
        },
      },
    })

    await flushDeferredMount()

    const ownerEditButton = wrapper.get("#edit-event-btn")
    expect(ownerEditButton.text()).toContain("Edit event")
    expect(ownerEditButton.attributes("data-variant")).toBe("outlined")
    expect(ownerEditButton.attributes("data-color")).toBe("primary")
  })

  it("renders copy link in the metadata action cluster with outlined secondary styling", async () => {
    const wrapper = shallowMount(EventView, {
      props: {
        eventId: "dEeaF",
      },
      global: {
        stubs: {
          ScheduleOverlap: ScheduleOverlapStub,
          NewDialog: true,
          GuestDialog: true,
          SignUpForSlotDialog: true,
          SignInNotSupportedDialog: true,
          MarkAvailabilityDialog: true,
          InvitationDialog: true,
          HelpDialog: true,
          EventDescription: true,
          AccessDenied: true,
          NotSignedIn: true,
          RouterLink: true,
          "v-chip": true,
          "v-icon": iconTextStub,
          "v-card": true,
          "v-card-title": true,
          "v-card-text": true,
          "v-card-actions": true,
          "v-dialog": true,
          "v-spacer": true,
          "v-btn": buttonSemanticStub,
        },
      },
    })

    await flushDeferredMount()

    const metaRow = wrapper.get("#event-header-meta-row")
    const buttonRow = wrapper.get("#event-header-button-row")
    const copyLinkButton = wrapper.get("#copy-link-btn")

    expect(metaRow.classes()).toContain("event-header-row")
    expect(metaRow.text()).toContain("Copy link")
    expect(buttonRow.text()).toContain("Copy link")
    expect(copyLinkButton.attributes("data-variant")).toBe("outlined")
    expect(copyLinkButton.attributes("data-color")).toBe("primary")
    expect(copyLinkButton.text()).toContain("mdi-content-copy")
    expect(copyLinkButton.text()).toContain("Copy link")
  })

  it("hides the header date summary for timed specific-date events", async () => {
    loaderEventState.value = {
      ...createDefaultEventState(),
      type: eventTypes.SPECIFIC_DATES,
      daysOnly: false,
      dates: [Temporal.PlainDate.from("2026-05-28")],
      hasSpecificTimes: true,
      enabledSlots: [
        Temporal.Instant.from("2026-05-28T00:00:00Z").toZonedDateTimeISO("UTC"),
        Temporal.Instant.from("2026-05-29T00:00:00Z").toZonedDateTimeISO("UTC"),
      ],
      activeSlots: [
        Temporal.Instant.from("2026-05-29T00:00:00Z").toZonedDateTimeISO("UTC"),
      ],
      eventTimezone: "UTC",
      slotGeneration: {
        startTimeLocal: Temporal.PlainTime.from("00:00:00"),
        endTimeLocal: Temporal.PlainTime.from("01:00:00"),
        timeIncrement: Temporal.Duration.from({ minutes: 60 }),
      },
      timedRecurrence: {
        kind: "specific_dates",
        selectedDays: [Temporal.PlainDate.from("2026-05-28")],
        selectedDaysOfWeek: [],
        startOnMonday: true,
      },
    }

    const wrapper = shallowMount(EventView, {
      props: {
        eventId: "dEeaF",
      },
      global: {
        stubs: {
          ScheduleOverlap: ScheduleOverlapStub,
          NewDialog: true,
          GuestDialog: true,
          SignUpForSlotDialog: true,
          SignInNotSupportedDialog: true,
          MarkAvailabilityDialog: true,
          InvitationDialog: true,
          HelpDialog: true,
          EventDescription: true,
          AccessDenied: true,
          NotSignedIn: true,
          RouterLink: true,
          "v-chip": true,
          "v-icon": true,
          "v-card": true,
          "v-card-title": true,
          "v-card-text": true,
          "v-card-actions": true,
          "v-dialog": true,
          "v-spacer": true,
          "v-btn": buttonSemanticStub,
        },
      },
    })

    await flushDeferredMount()

    expect(wrapper.get("#event-header-meta-row").text()).not.toContain(
      "5/28 - 5/29",
    )
  })

  it("keeps timed specific-date header summaries hidden in viewer timezones too", async () => {
    loaderEventState.value = {
      ...createDefaultEventState(),
      type: eventTypes.SPECIFIC_DATES,
      daysOnly: false,
      dates: [Temporal.PlainDate.from("2026-05-28")],
      hasSpecificTimes: true,
      enabledSlots: [
        Temporal.Instant.from("2026-05-28T00:00:00Z").toZonedDateTimeISO("UTC"),
        Temporal.Instant.from("2026-05-29T00:00:00Z").toZonedDateTimeISO("UTC"),
      ],
      activeSlots: [
        Temporal.Instant.from("2026-05-29T00:00:00Z").toZonedDateTimeISO("UTC"),
      ],
      eventTimezone: "UTC",
      slotGeneration: {
        startTimeLocal: Temporal.PlainTime.from("00:00:00"),
        endTimeLocal: Temporal.PlainTime.from("01:00:00"),
        timeIncrement: Temporal.Duration.from({ minutes: 60 }),
      },
      timedRecurrence: {
        kind: "specific_dates",
        selectedDays: [Temporal.PlainDate.from("2026-05-28")],
        selectedDaysOfWeek: [],
        startOnMonday: true,
      },
    }

    const wrapper = shallowMount(EventView, {
      props: {
        eventId: "dEeaF",
        initialTimezone: {
          value: "America/Los_Angeles",
          offset: Temporal.Duration.from({ hours: 7 }),
          label: "America/Los_Angeles",
          gmtString: "GMT-7",
        },
      },
      global: {
        stubs: {
          ScheduleOverlap: ScheduleOverlapStub,
          NewDialog: true,
          GuestDialog: true,
          SignUpForSlotDialog: true,
          SignInNotSupportedDialog: true,
          MarkAvailabilityDialog: true,
          InvitationDialog: true,
          HelpDialog: true,
          EventDescription: true,
          AccessDenied: true,
          NotSignedIn: true,
          RouterLink: true,
          "v-chip": true,
          "v-icon": true,
          "v-card": true,
          "v-card-title": true,
          "v-card-text": true,
          "v-card-actions": true,
          "v-dialog": true,
          "v-spacer": true,
          "v-btn": buttonSemanticStub,
        },
      },
    })

    await flushDeferredMount()

    expect(wrapper.get("#event-header-meta-row").text()).not.toContain(
      "5/27 - 5/28",
    )
  })

  it("removes the header date summary for days-only specific-date events", async () => {
    loaderEventState.value = {
      ...createDefaultEventState(),
      type: eventTypes.SPECIFIC_DATES,
      daysOnly: true,
      dates: [
        Temporal.PlainDate.from("2026-05-28"),
        Temporal.PlainDate.from("2026-05-29"),
      ],
    }

    const wrapper = shallowMount(EventView, {
      props: {
        eventId: "dEeaF",
      },
      global: {
        stubs: {
          ScheduleOverlap: ScheduleOverlapStub,
          NewDialog: true,
          GuestDialog: true,
          SignUpForSlotDialog: true,
          SignInNotSupportedDialog: true,
          MarkAvailabilityDialog: true,
          InvitationDialog: true,
          HelpDialog: true,
          EventDescription: true,
          AccessDenied: true,
          NotSignedIn: true,
          RouterLink: true,
          "v-chip": true,
          "v-icon": true,
          "v-card": true,
          "v-card-title": true,
          "v-card-text": true,
          "v-card-actions": true,
          "v-dialog": true,
          "v-spacer": true,
          "v-btn": buttonSemanticStub,
        },
      },
    })

    await flushDeferredMount()

    expect(wrapper.get("#event-header").text()).not.toContain("5/28 - 5/29")
  })

  it("renders the Start on Monday switch inline for a days-only event without responses", async () => {
    loaderEventState.value = {
      ...createDefaultEventState(),
      type: eventTypes.SPECIFIC_DATES,
      daysOnly: true,
      dates: [
        Temporal.PlainDate.from("2026-05-28"),
        Temporal.PlainDate.from("2026-05-29"),
      ],
      responses: {},
    }

    const wrapper = shallowMount(EventView, {
      props: {
        eventId: "dEeaF",
      },
      global: {
        stubs: {
          ScheduleOverlap: ScheduleOverlapNoOwnedGuestResponsesStub,
          EventOptions: true,
          NewDialog: true,
          GuestDialog: true,
          SignUpForSlotDialog: true,
          SignInNotSupportedDialog: true,
          MarkAvailabilityDialog: true,
          InvitationDialog: true,
          HelpDialog: true,
          EventDescription: true,
          AccessDenied: true,
          NotSignedIn: true,
          RouterLink: true,
          "v-chip": true,
          "v-icon": true,
          "v-card": true,
          "v-card-title": true,
          "v-card-text": true,
          "v-card-actions": true,
          "v-dialog": true,
          "v-spacer": true,
          "v-btn": buttonSemanticStub,
        },
      },
    })

    await flushDeferredMount()

    expect(wrapper.find("#start-calendar-on-monday-toggle").exists()).toBe(true)
    expect(wrapper.find("#show-best-times-header-toggle").exists()).toBe(false)
    expect(wrapper.find("#desktop-header-more-options").exists()).toBe(false)
    expect(wrapper.text()).toContain("Schedule event")
  })

  it("keeps Show best days and the More options menu on desktop when a days-only event has responses", async () => {
    loaderEventState.value = {
      ...createDefaultEventState(),
      type: eventTypes.SPECIFIC_DATES,
      daysOnly: true,
      dates: [
        Temporal.PlainDate.from("2026-05-28"),
        Temporal.PlainDate.from("2026-05-29"),
      ],
    }

    const wrapper = shallowMount(EventView, {
      props: {
        eventId: "dEeaF",
      },
      global: {
        stubs: {
          ScheduleOverlap: ScheduleOverlapStub,
          EventOptions: true,
          NewDialog: true,
          GuestDialog: true,
          SignUpForSlotDialog: true,
          SignInNotSupportedDialog: true,
          MarkAvailabilityDialog: true,
          InvitationDialog: true,
          HelpDialog: true,
          EventDescription: true,
          AccessDenied: true,
          NotSignedIn: true,
          RouterLink: true,
          "v-chip": true,
          "v-icon": true,
          "v-card": true,
          "v-card-title": true,
          "v-card-text": true,
          "v-card-actions": true,
          "v-dialog": true,
          "v-spacer": true,
          "v-btn": buttonSemanticStub,
        },
      },
    })

    await flushDeferredMount()

    expect(wrapper.find("#show-best-times-header-toggle").exists()).toBe(true)
    expect(wrapper.find("#desktop-header-more-options").exists()).toBe(true)
    expect(wrapper.find("#start-calendar-on-monday-toggle").exists()).toBe(
      false,
    )
  })

  it("invokes copy link from the metadata action row", async () => {
    const wrapper = shallowMount(EventView, {
      props: {
        eventId: "dEeaF",
      },
      global: {
        stubs: {
          ScheduleOverlap: ScheduleOverlapStub,
          NewDialog: true,
          GuestDialog: true,
          SignUpForSlotDialog: true,
          SignInNotSupportedDialog: true,
          MarkAvailabilityDialog: true,
          InvitationDialog: true,
          HelpDialog: true,
          EventDescription: true,
          AccessDenied: true,
          NotSignedIn: true,
          RouterLink: true,
          "v-chip": true,
          "v-icon": true,
          "v-card": true,
          "v-card-title": true,
          "v-card-text": true,
          "v-card-actions": true,
          "v-dialog": true,
          "v-spacer": true,
          "v-btn": buttonClickStub,
        },
      },
    })

    await flushDeferredMount()

    await wrapper.get("#copy-link-btn").trigger("click")

    expect(copyLinkMock).toHaveBeenCalled()
  })

  it("renders related desktop header controls in explicit detail/action rows", async () => {
    const wrapper = shallowMount(EventView, {
      props: {
        eventId: "dEeaF",
      },
      global: {
        stubs: {
          ScheduleOverlap: ScheduleOverlapStub,
          NewDialog: true,
          GuestDialog: true,
          SignUpForSlotDialog: true,
          SignInNotSupportedDialog: true,
          MarkAvailabilityDialog: true,
          InvitationDialog: true,
          HelpDialog: true,
          EventDescription: eventDescriptionStub,
          AccessDenied: true,
          NotSignedIn: true,
          RouterLink: true,
          "v-chip": true,
          "v-icon": true,
          "v-card": true,
          "v-card-title": true,
          "v-card-text": true,
          "v-card-actions": true,
          "v-dialog": true,
          "v-spacer": true,
          "v-btn": buttonSemanticStub,
        },
      },
    })

    await flushDeferredMount()

    const rows = wrapper.findAll(".event-header-row")

    expect(rows).toHaveLength(3)
    expect(rows[0].html()).toContain("desktop-primary-availability-btn")
    expect(rows[1].html()).toContain("event-header-button-row")
    expect(rows[1].html()).toContain("desktop-header-show-best-times")
    expect(rows[1].html()).toContain("desktop-header-more-options")
    expect(rows[2].html()).not.toContain("event-description-stub")
    expect(rows[2].html()).toContain("Schedule event")
  })

  it("keeps copy link explicit on phones instead of switching to a share icon", async () => {
    isPhoneState.value = true

    const wrapper = shallowMount(EventView, {
      props: {
        eventId: "dEeaF",
      },
      global: {
        stubs: {
          ScheduleOverlap: ScheduleOverlapStub,
          NewDialog: true,
          GuestDialog: true,
          SignUpForSlotDialog: true,
          SignInNotSupportedDialog: true,
          MarkAvailabilityDialog: true,
          InvitationDialog: true,
          HelpDialog: true,
          EventDescription: true,
          AccessDenied: true,
          NotSignedIn: true,
          RouterLink: true,
          "v-chip": true,
          "v-icon": iconTextStub,
          "v-card": true,
          "v-card-title": true,
          "v-card-text": true,
          "v-card-actions": true,
          "v-dialog": true,
          "v-spacer": true,
          "v-btn": buttonSemanticStub,
        },
      },
    })

    await flushDeferredMount()

    const copyLinkButton = wrapper.get("#copy-link-btn")
    expect(copyLinkButton.text()).toContain("Copy link")
    expect(copyLinkButton.text()).toContain("mdi-content-copy")
    expect(copyLinkButton.text()).not.toContain("mdi-share")
  })

  it("moves mobile add availability into the sticky footer action cluster", async () => {
    isPhoneState.value = true

    const wrapper = shallowMount(EventView, {
      props: {
        eventId: "dEeaF",
      },
      global: {
        stubs: {
          ScheduleOverlap: ScheduleOverlapStub,
          NewDialog: true,
          GuestDialog: true,
          SignUpForSlotDialog: true,
          SignInNotSupportedDialog: true,
          MarkAvailabilityDialog: true,
          InvitationDialog: true,
          HelpDialog: true,
          EventDescription: true,
          AccessDenied: true,
          NotSignedIn: true,
          RouterLink: true,
          "v-chip": true,
          "v-icon": iconTextStub,
          "v-card": true,
          "v-card-title": true,
          "v-card-text": true,
          "v-card-actions": true,
          "v-dialog": true,
          "v-spacer": true,
          "v-btn": buttonSemanticStub,
        },
      },
    })

    await flushDeferredMount()

    expect(wrapper.get("#mobile-primary-availability-btn").text()).toContain(
      "Edit availability",
    )
    expect(wrapper.get("#mobile-primary-availability-btn").classes()).toContain(
      "mobile-primary-availability-button--edit",
    )
    expect(
      wrapper.get("#mobile-primary-availability-btn").classes(),
    ).not.toContain("timeful-elevated-button")
    expect(wrapper.get("#mobile-primary-availability-btn").classes()).toContain(
      "tw:bg-green",
    )
    expect(wrapper.get("#mobile-secondary-availability-btn").text()).toContain(
      "Add availability",
    )
    expect(wrapper.text()).not.toContain("+ Add availability")

    const bottomActionBar = wrapper.get(".timeful-action-bar-layer")
    expect(bottomActionBar.classes()).toContain("tw:fixed")
    expect(bottomActionBar.classes()).toContain("tw:bottom-0")
    expect(bottomActionBar.classes()).not.toContain(
      "timeful-bottom-overlay-layer",
    )
    expect(bottomActionBar.find(".mobile-event-action-bar").exists()).toBe(true)
  })

  it("uses a compact add-guest label in the mobile footer for signed-in respondents", async () => {
    isPhoneState.value = true
    authUserState.value = {
      _id: "000000000000000000000000",
    }

    const wrapper = shallowMount(EventView, {
      props: {
        eventId: "dEeaF",
      },
      global: {
        stubs: {
          ScheduleOverlap: ScheduleOverlapStub,
          NewDialog: true,
          GuestDialog: true,
          SignUpForSlotDialog: true,
          SignInNotSupportedDialog: true,
          MarkAvailabilityDialog: true,
          InvitationDialog: true,
          HelpDialog: true,
          EventDescription: true,
          AccessDenied: true,
          NotSignedIn: true,
          RouterLink: true,
          "v-chip": true,
          "v-icon": iconTextStub,
          "v-card": true,
          "v-card-title": true,
          "v-card-text": true,
          "v-card-actions": true,
          "v-dialog": true,
          "v-spacer": true,
          "v-btn": buttonSemanticStub,
        },
      },
    })

    await flushDeferredMount()

    expect(wrapper.get("#mobile-secondary-availability-btn").text()).toContain(
      "Add guest",
    )
  })

  it("aligns desktop availability editing controls with their related header rows", async () => {
    curGuestIdState.value = "guest-1"

    const wrapper = shallowMount(EventView, {
      props: {
        eventId: "dEeaF",
      },
      global: {
        stubs: {
          ScheduleOverlap: ScheduleOverlapEditingStub,
          NewDialog: true,
          GuestDialog: true,
          SignUpForSlotDialog: true,
          SignInNotSupportedDialog: true,
          MarkAvailabilityDialog: true,
          InvitationDialog: true,
          HelpDialog: true,
          EventDescription: eventDescriptionStub,
          AccessDenied: true,
          NotSignedIn: true,
          RouterLink: true,
          "v-chip": true,
          "v-icon": iconTextStub,
          "v-card": true,
          "v-card-title": true,
          "v-card-text": true,
          "v-card-actions": true,
          "v-dialog": true,
          "v-spacer": true,
          "v-btn": buttonSemanticStub,
        },
      },
    })

    await flushDeferredMount()

    const cancelButton = wrapper.get(".desktop-editing-cancel-button")
    const saveButton = wrapper.get(".desktop-editing-save-button")
    expect(cancelButton.text()).toContain("Cancel")
    expect(cancelButton.attributes("data-variant")).toBe("outlined")
    expect(cancelButton.classes()).toContain("desktop-editing-action-control")
    expect(eventViewSource).toContain('class="tw:flex tw:w-full tw:gap-2"')
    expect(saveButton.text()).toContain("Save")
    expect(saveButton.classes()).toContain("desktop-editing-save-button")
    expect(saveButton.classes()).toContain("desktop-editing-action-control")
    expect(saveButton.attributes("disabled")).toBeUndefined()
    const moreOptions = wrapper.get("#desktop-editing-more-options")
    expect(moreOptions.classes()).toContain("tw:flex-1")
    expect(moreOptions.classes()).toContain(
      "desktop-event-header-options__menu",
    )
    expect(
      moreOptions.get("event-options-stub").attributes("menubuttonlabel"),
    ).toBe("More options")
    expect(
      moreOptions.get("event-options-stub").attributes("menuactivatorclass"),
    ).toContain("desktop-event-header-control")
    expect(moreOptions.get("event-options-stub").classes()).toContain(
      "tw:w-full",
    )
    expect(eventViewSource).toContain(':include-hide-if-needed="false"')
    const overlayAvailability = wrapper.get("#overlay-availabilities-toggle")
    expect(overlayAvailability.classes()).toContain(
      "desktop-editing-overlay-availability-toggle",
    )
    expect(overlayAvailability.classes()).toContain("tw:w-full")
    expect(
      wrapper.get("#desktop-editing-overlay-availability-slot").classes(),
    ).toContain("tw:flex-1")
    expect(eventViewSource).toContain("Overlay availability")
    const desktopDeleteButton = wrapper.get("#desktop-delete-availability-btn")
    expect(desktopDeleteButton.attributes("data-variant")).toBe("outlined")
    expect(desktopDeleteButton.classes()).toContain(
      "desktop-editing-delete-button",
    )
    expect(desktopDeleteButton.classes()).toContain(
      "destructive-outlined-button",
    )
    expect(desktopDeleteButton.text()).toContain("Delete")
    expect(desktopDeleteButton.text()).toContain("mdi-trash-can-outline")
    expect(wrapper.get(".desktop-editing-delete-actions").classes()).toContain(
      "tw:sm:ml-auto",
    )
    expect(eventViewSource).toContain(
      "desktop-editing-delete-actions desktop-event-header-actions tw:flex tw:justify-end tw:sm:ml-auto",
    )
    expect(eventViewSource).toContain(
      ".desktop-editing-action-control {\n  flex: 1 1 0;\n  min-inline-size: 0;",
    )
    expect(eventViewSource).toContain(
      ".desktop-editing-delete-button {\n  inline-size: 100%;",
    )
    expect(eventViewSource).toContain(
      'class="destructive-outlined-button desktop-editing-delete-button desktop-event-header-control tw:normal-case"',
    )
    expect(eventViewSource).toContain(
      ".destructive-outlined-button {\n  color: var(--timeful-red-canonical);\n  border: 1px solid var(--timeful-red-canonical);\n  --v-hover-opacity: 0;\n}",
    )
    expect(eventViewSource).toContain(
      ".destructive-outlined-button:hover {\n  background-color: color-mix(\n    in srgb,\n    var(--timeful-red-canonical) 5%,\n    transparent\n  );\n}",
    )
    expect(eventViewSource).toContain(
      ".desktop-editing-overlay-availability-toggle :deep(.v-selection-control) {\n  align-items: center;\n  inline-size: 100%;\n  justify-content: center;\n  min-inline-size: 0;",
    )
    expect(eventViewSource).toContain(
      ".desktop-editing-overlay-availability-toggle :deep(.v-input__control) {\n  inline-size: 100%;\n  min-inline-size: 0;",
    )
    expect(eventViewSource).toContain(
      ".desktop-editing-overlay-availability-toggle :deep(.v-label) {\n  flex: 1 1 0;\n  line-height: 1.25;\n  min-inline-size: 0;\n  overflow-wrap: break-word;\n  white-space: normal;",
    )
    expect(eventViewSource).toContain(
      'v-else-if="!isPhone && !isGroup && isEditing"\n                  class="desktop-event-header-actions"',
    )
    expect(wrapper.find("#event-description-stub").exists()).toBe(false)
    expect(
      wrapper.find("#desktop-editing-start-calendar-on-monday-toggle").exists(),
    ).toBe(false)
  })

  it("renders the Start on Monday switch to the right of Overlay availability while editing a days-only event", async () => {
    loaderEventState.value = {
      ...createDefaultEventState(),
      type: eventTypes.SPECIFIC_DATES,
      daysOnly: true,
      dates: [
        Temporal.PlainDate.from("2026-05-28"),
        Temporal.PlainDate.from("2026-05-29"),
      ],
    }

    const wrapper = shallowMount(EventView, {
      props: {
        eventId: "dEeaF",
      },
      global: {
        stubs: {
          ScheduleOverlap: ScheduleOverlapEditingStub,
          NewDialog: true,
          GuestDialog: true,
          SignUpForSlotDialog: true,
          SignInNotSupportedDialog: true,
          MarkAvailabilityDialog: true,
          InvitationDialog: true,
          HelpDialog: true,
          EventDescription: true,
          AccessDenied: true,
          NotSignedIn: true,
          RouterLink: true,
          "v-chip": true,
          "v-icon": iconTextStub,
          "v-card": true,
          "v-card-title": true,
          "v-card-text": true,
          "v-card-actions": true,
          "v-dialog": true,
          "v-spacer": true,
          "v-btn": buttonSemanticStub,
          "v-switch": modelValueSwitchStub,
        },
      },
    })

    await flushDeferredMount()

    const startOnMondaySlot = wrapper.get(
      "#desktop-editing-start-calendar-on-monday",
    )
    expect(startOnMondaySlot.classes()).toContain("tw:flex-1")
    expect(startOnMondaySlot.classes()).toContain(
      "desktop-event-header-options__start-on-monday-slot",
    )
    expect(eventViewSource).toContain("Start on Monday")
    const startOnMonday = wrapper
      .findAllComponents(modelValueSwitchStub)
      .find(
        (component) =>
          (component.element as HTMLElement).id ===
          "desktop-editing-start-calendar-on-monday-toggle",
      )
    expect(startOnMonday).toBeTruthy()
    expect(startOnMonday?.props("modelValue")).toBe(false)
    expect(wrapper.find("#desktop-editing-more-options").exists()).toBe(false)
    expect(
      wrapper.find("#desktop-editing-overlay-availability-slot").exists(),
    ).toBe(true)
    expect(
      wrapper
        .get("#desktop-editing-overlay-availability-slot")
        .element.compareDocumentPosition(startOnMondaySlot.element) &
        Node.DOCUMENT_POSITION_FOLLOWING,
    ).toBe(Node.DOCUMENT_POSITION_FOLLOWING)
    ;(
      startOnMonday?.vm as unknown as {
        $emit: (event: string, ...args: unknown[]) => void
      }
    ).$emit("update:modelValue", true)
    await nextTick()
    expect(
      (
        wrapper.findComponent(ScheduleOverlapEditingStub).vm as unknown as {
          startCalendarOnMonday: boolean
        }
      ).startCalendarOnMonday,
    ).toBe(true)
  })

  it("keeps the Start on Monday switch hidden while editing a days-only event without responses", async () => {
    loaderEventState.value = {
      ...createDefaultEventState(),
      type: eventTypes.SPECIFIC_DATES,
      daysOnly: true,
      dates: [
        Temporal.PlainDate.from("2026-05-28"),
        Temporal.PlainDate.from("2026-05-29"),
      ],
    }

    const wrapper = shallowMount(EventView, {
      props: {
        eventId: "dEeaF",
      },
      global: {
        stubs: {
          ScheduleOverlap: ScheduleOverlapEditingNoOverlayStub,
          NewDialog: true,
          GuestDialog: true,
          SignUpForSlotDialog: true,
          SignInNotSupportedDialog: true,
          MarkAvailabilityDialog: true,
          InvitationDialog: true,
          HelpDialog: true,
          EventDescription: true,
          AccessDenied: true,
          NotSignedIn: true,
          RouterLink: true,
          "v-chip": true,
          "v-icon": iconTextStub,
          "v-card": true,
          "v-card-title": true,
          "v-card-text": true,
          "v-card-actions": true,
          "v-dialog": true,
          "v-spacer": true,
          "v-btn": buttonSemanticStub,
        },
      },
    })

    await flushDeferredMount()

    expect(
      wrapper.find("#desktop-editing-start-calendar-on-monday-toggle").exists(),
    ).toBe(false)
    expect(
      wrapper.find("#desktop-editing-overlay-availability-slot").exists(),
    ).toBe(false)
    expect(wrapper.find("#desktop-editing-more-options").exists()).toBe(false)
  })

  it("disables the desktop editing save button when respondent availability is empty", async () => {
    const wrapper = shallowMount(EventView, {
      props: {
        eventId: "dEeaF",
      },
      global: {
        stubs: {
          ScheduleOverlap: ScheduleOverlapEditingSaveDisabledStub,
          NewDialog: true,
          GuestDialog: true,
          SignUpForSlotDialog: true,
          SignInNotSupportedDialog: true,
          MarkAvailabilityDialog: true,
          InvitationDialog: true,
          HelpDialog: true,
          EventDescription: true,
          AccessDenied: true,
          NotSignedIn: true,
          RouterLink: true,
          "v-chip": true,
          "v-icon": iconTextStub,
          "v-card": true,
          "v-card-title": true,
          "v-card-text": true,
          "v-card-actions": true,
          "v-dialog": true,
          "v-spacer": true,
          "v-btn": buttonSemanticStub,
        },
      },
    })

    await flushDeferredMount()

    expect(
      wrapper.get(".desktop-editing-save-button").attributes("disabled"),
    ).toBe("")
  })

  it("renders mobile editing actions with outlined cancel and flat save", async () => {
    isPhoneState.value = true

    const wrapper = shallowMount(EventView, {
      props: {
        eventId: "dEeaF",
      },
      global: {
        stubs: {
          ScheduleOverlap: ScheduleOverlapEditingStub,
          NewDialog: true,
          GuestDialog: true,
          SignUpForSlotDialog: true,
          SignInNotSupportedDialog: true,
          MarkAvailabilityDialog: true,
          InvitationDialog: true,
          HelpDialog: true,
          EventDescription: true,
          AccessDenied: true,
          NotSignedIn: true,
          RouterLink: true,
          "v-chip": true,
          "v-icon": iconTextStub,
          "v-card": true,
          "v-card-title": true,
          "v-card-text": true,
          "v-card-actions": true,
          "v-dialog": true,
          "v-spacer": true,
          "v-btn": buttonSemanticStub,
        },
      },
    })

    await flushDeferredMount()

    const cancelButton = wrapper.get(".mobile-editing-cancel-button")
    const saveButton = wrapper.get(".mobile-editing-save-button")
    expect(cancelButton.text()).toContain("Cancel")
    expect(cancelButton.attributes("data-variant")).toBe("outlined")
    expect(saveButton.text()).toContain("Save")
    expect(saveButton.classes()).toContain("mobile-editing-save-button")
    expect(saveButton.classes()).toContain("tw:bg-green")
    expect(saveButton.classes()).toContain("tw:text-white")
    expect(saveButton.classes()).not.toContain("timeful-elevated-button")
    expect(saveButton.attributes("disabled")).toBeUndefined()
    expect(wrapper.text()).not.toContain("Options")
  })

  it("renders the mobile editing delete button as an outlined trash-icon button", async () => {
    isPhoneState.value = true
    curGuestIdState.value = "guest-1"

    const wrapper = shallowMount(EventView, {
      props: {
        eventId: "dEeaF",
      },
      global: {
        stubs: {
          ScheduleOverlap: ScheduleOverlapEditingStub,
          NewDialog: true,
          GuestDialog: true,
          SignUpForSlotDialog: true,
          SignInNotSupportedDialog: true,
          MarkAvailabilityDialog: true,
          InvitationDialog: true,
          HelpDialog: true,
          EventDescription: true,
          AccessDenied: true,
          NotSignedIn: true,
          RouterLink: true,
          "v-chip": true,
          "v-icon": iconTextStub,
          "v-card": true,
          "v-card-title": true,
          "v-card-text": true,
          "v-card-actions": true,
          "v-dialog": true,
          "v-spacer": true,
          "v-btn": buttonSemanticStub,
        },
      },
    })

    await flushDeferredMount()

    const deleteButton = wrapper.get(".destructive-outlined-button")
    expect(deleteButton.attributes("data-variant")).toBe("outlined")
    expect(deleteButton.text()).toContain("Delete")
    expect(deleteButton.text()).toContain("mdi-trash-can-outline")
    expect(eventViewSource).toContain(
      'class="destructive-outlined-button tw:text-sm tw:normal-case"',
    )
  })

  it("disables the mobile editing save button when respondent availability is empty", async () => {
    isPhoneState.value = true

    const wrapper = shallowMount(EventView, {
      props: {
        eventId: "dEeaF",
      },
      global: {
        stubs: {
          ScheduleOverlap: ScheduleOverlapEditingSaveDisabledStub,
          NewDialog: true,
          GuestDialog: true,
          SignUpForSlotDialog: true,
          SignInNotSupportedDialog: true,
          MarkAvailabilityDialog: true,
          InvitationDialog: true,
          HelpDialog: true,
          EventDescription: true,
          AccessDenied: true,
          NotSignedIn: true,
          RouterLink: true,
          "v-chip": true,
          "v-icon": iconTextStub,
          "v-card": true,
          "v-card-title": true,
          "v-card-text": true,
          "v-card-actions": true,
          "v-dialog": true,
          "v-spacer": true,
          "v-btn": buttonSemanticStub,
        },
      },
    })

    await flushDeferredMount()

    expect(
      wrapper.get(".mobile-editing-save-button").attributes("disabled"),
    ).toBe("")
  })

  it("renders mobile scheduling actions with outlined cancel and blue active schedule colors", async () => {
    isPhoneState.value = true

    const wrapper = shallowMount(EventView, {
      props: {
        eventId: "dEeaF",
      },
      global: {
        stubs: {
          ScheduleOverlap: ScheduleOverlapSchedulingStub,
          NewDialog: true,
          GuestDialog: true,
          SignUpForSlotDialog: true,
          SignInNotSupportedDialog: true,
          MarkAvailabilityDialog: true,
          InvitationDialog: true,
          HelpDialog: true,
          EventDescription: true,
          AccessDenied: true,
          NotSignedIn: true,
          RouterLink: true,
          "v-chip": true,
          "v-icon": iconTextStub,
          "v-card": true,
          "v-card-title": true,
          "v-card-text": true,
          "v-card-actions": true,
          "v-dialog": true,
          "v-spacer": true,
          "v-menu": menuStub,
          "v-btn": buttonSemanticStub,
        },
      },
    })

    await flushDeferredMount()

    const buttons = wrapper.findAll("button")
    const cancelButton = buttons.find((button) =>
      button.text().includes("Cancel"),
    )
    const scheduleButton = buttons.find((button) =>
      button.text().includes("Schedule"),
    )

    expect(cancelButton?.attributes("data-variant")).toBe("outlined")
    expect(scheduleButton?.classes()).toContain("mobile-schedule-button")
    expect(scheduleButton?.attributes("data-variant")).toBe("flat")
    expect(scheduleButton?.classes()).toContain("tw:bg-white")
    expect(scheduleButton?.classes()).toContain("tw:border-light-blue")
    expect(scheduleButton?.classes()).toContain("tw:text-blue")
  })

  it("moves Clear next to Cancel while rescheduling on desktop", async () => {
    loaderEventState.value = {
      ...loaderEventState.value,
      scheduledEvent: {},
    }

    const wrapper = shallowMount(EventView, {
      props: { eventId: "dEeaF" },
      global: {
        stubs: {
          ScheduleOverlap: ScheduleOverlapSchedulingStub,
          NewDialog: true,
          GuestDialog: true,
          SignUpForSlotDialog: true,
          SignInNotSupportedDialog: true,
          MarkAvailabilityDialog: true,
          InvitationDialog: true,
          HelpDialog: true,
          EventDescription: true,
          AccessDenied: true,
          NotSignedIn: true,
          RouterLink: true,
          "v-chip": true,
          "v-icon": iconTextStub,
          "v-card": true,
          "v-card-title": true,
          "v-card-text": true,
          "v-card-actions": true,
          "v-dialog": true,
          "v-spacer": true,
          "v-menu": menuStub,
          "v-btn": buttonSemanticStub,
        },
      },
    })

    await flushDeferredMount()

    const buttons = wrapper.findAll("button")
    const cancelIndex = buttons.findIndex(
      (button) => button.text().trim() === "Cancel",
    )
    const clearIndex = buttons.findIndex(
      (button) => button.text().trim() === "Clear",
    )
    const scheduleIndex = buttons.findIndex((button) =>
      button.text().includes("Schedule"),
    )

    expect(clearIndex).toBeGreaterThan(cancelIndex)
    expect(clearIndex).toBeLessThan(scheduleIndex)
    expect(buttons[clearIndex].element.parentElement?.className).toContain(
      "tw:gap-2",
    )
    await buttons[clearIndex].trigger("click")
    expect(
      scheduleOverlapMethodMocks.clearScheduledEvent,
    ).toHaveBeenCalledOnce()
  })

  it("right-aligns desktop scheduling buttons under the header options when the description is empty", async () => {
    const wrapper = shallowMount(EventView, {
      props: { eventId: "dEeaF" },
      global: {
        stubs: {
          ScheduleOverlap: ScheduleOverlapSchedulingStub,
          NewDialog: true,
          GuestDialog: true,
          SignUpForSlotDialog: true,
          SignInNotSupportedDialog: true,
          MarkAvailabilityDialog: true,
          InvitationDialog: true,
          HelpDialog: true,
          EventDescription: eventDescriptionStub,
          AccessDenied: true,
          NotSignedIn: true,
          RouterLink: true,
          "v-chip": true,
          "v-icon": iconTextStub,
          "v-card": true,
          "v-card-title": true,
          "v-card-text": true,
          "v-card-actions": true,
          "v-dialog": true,
          "v-spacer": true,
          "v-menu": menuStub,
          "v-btn": buttonSemanticStub,
        },
      },
    })

    await flushDeferredMount()

    expect(wrapper.find("#event-description-stub").exists()).toBe(false)

    const buttons = wrapper.findAll("button")
    const cancelButton = buttons.find((button) =>
      button.text().includes("Cancel"),
    )
    expect(cancelButton).toBeDefined()
    expect(cancelButton?.element.parentElement?.className).toContain(
      "desktop-event-header-actions",
    )
    expect(cancelButton?.element.parentElement?.className).toContain(
      "tw:sm:ml-auto",
    )
  })

  it("disables desktop editing actions while rescheduling", async () => {
    authUserState.value = { _id: "owner-1" }
    loaderEventState.value = {
      ...loaderEventState.value,
      scheduledEvent: {},
      responses: {
        "owner-1": {
          name: "Owner",
          user: {
            _id: "owner-1",
            firstName: "Owner",
            lastName: "",
            email: "owner@example.com",
          },
          availability: [],
        },
      },
    }

    const wrapper = shallowMount(EventView, {
      props: { eventId: "dEeaF" },
      global: {
        stubs: {
          ScheduleOverlap: ScheduleOverlapSchedulingStub,
          NewDialog: true,
          GuestDialog: true,
          SignUpForSlotDialog: true,
          SignInNotSupportedDialog: true,
          MarkAvailabilityDialog: true,
          InvitationDialog: true,
          HelpDialog: true,
          EventDescription: true,
          AccessDenied: true,
          NotSignedIn: true,
          RouterLink: true,
          "v-chip": true,
          "v-icon": iconTextStub,
          "v-card": true,
          "v-card-title": true,
          "v-card-text": true,
          "v-card-actions": true,
          "v-dialog": true,
          "v-spacer": true,
          "v-menu": menuStub,
          "v-btn": buttonSemanticStub,
        },
      },
    })

    await flushDeferredMount()

    const addAvailabilityButton = wrapper.get(
      "#desktop-secondary-availability-btn",
    )
    const editAvailabilityButton = wrapper.get(
      "#desktop-primary-availability-btn",
    )
    const editEventButton = wrapper.get("#edit-event-btn")

    expect(addAvailabilityButton.text()).toContain("Add guest availability")
    expect(addAvailabilityButton.attributes("disabled")).toBeDefined()
    expect(editAvailabilityButton.text()).toContain("Edit availability")
    expect(editAvailabilityButton.attributes("disabled")).toBeDefined()
    expect(editEventButton.attributes("disabled")).toBeDefined()
    await wrapper.find(".tw\\:text-xl").trigger("click")
    expect(editEventMock).not.toHaveBeenCalled()
    expect(wrapper.find("#show-best-times-header-toggle").exists()).toBe(true)
    expect(wrapper.find("#desktop-header-more-options").exists()).toBe(true)
    expect(wrapper.text()).toContain("Cancel")
    expect(wrapper.text()).toContain("Clear")
    expect(wrapper.text()).toContain("Schedule")
  })

  it("places Clear beside Cancel while rescheduling on mobile", async () => {
    isPhoneState.value = true
    loaderEventState.value = {
      ...loaderEventState.value,
      scheduledEvent: {},
    }

    const wrapper = shallowMount(EventView, {
      props: { eventId: "dEeaF" },
      global: {
        stubs: {
          ScheduleOverlap: ScheduleOverlapSchedulingStub,
          NewDialog: true,
          GuestDialog: true,
          SignUpForSlotDialog: true,
          SignInNotSupportedDialog: true,
          MarkAvailabilityDialog: true,
          InvitationDialog: true,
          HelpDialog: true,
          EventDescription: true,
          AccessDenied: true,
          NotSignedIn: true,
          RouterLink: true,
          "v-chip": true,
          "v-icon": iconTextStub,
          "v-card": true,
          "v-card-title": true,
          "v-card-text": true,
          "v-card-actions": true,
          "v-dialog": true,
          "v-spacer": true,
          "v-menu": menuStub,
          "v-btn": buttonSemanticStub,
        },
      },
    })

    await flushDeferredMount()

    const buttons = wrapper.findAll("button")
    const cancelIndex = buttons.findIndex(
      (button) => button.text().trim() === "Cancel",
    )
    const clearIndex = buttons.findIndex(
      (button) => button.text().trim() === "Clear",
    )
    const scheduleIndex = buttons.findIndex((button) =>
      button.text().includes("Schedule"),
    )

    expect(clearIndex).toBe(cancelIndex + 1)
    expect(clearIndex).toBeLessThan(scheduleIndex)
    expect(buttons[clearIndex].classes()).toContain("tw:ml-2")
    await buttons[clearIndex].trigger("click")
    expect(
      scheduleOverlapMethodMocks.clearScheduledEvent,
    ).toHaveBeenCalledOnce()
  })

  it("renders mobile scheduling actions with an inactive blue schedule treatment", async () => {
    isPhoneState.value = true

    const wrapper = shallowMount(EventView, {
      props: {
        eventId: "dEeaF",
      },
      global: {
        stubs: {
          ScheduleOverlap: ScheduleOverlapSchedulingDisabledStub,
          NewDialog: true,
          GuestDialog: true,
          SignUpForSlotDialog: true,
          SignInNotSupportedDialog: true,
          MarkAvailabilityDialog: true,
          InvitationDialog: true,
          HelpDialog: true,
          EventDescription: true,
          AccessDenied: true,
          NotSignedIn: true,
          RouterLink: true,
          "v-chip": true,
          "v-icon": iconTextStub,
          "v-card": true,
          "v-card-title": true,
          "v-card-text": true,
          "v-card-actions": true,
          "v-dialog": true,
          "v-spacer": true,
          "v-menu": menuStub,
          "v-btn": buttonSemanticStub,
        },
      },
    })

    await flushDeferredMount()

    const buttons = wrapper.findAll("button")
    const cancelButton = buttons.find((button) =>
      button.text().includes("Cancel"),
    )
    const scheduleButton = buttons.find((button) =>
      button.text().includes("Schedule"),
    )

    expect(cancelButton?.attributes("data-variant")).toBe("outlined")
    expect(scheduleButton?.attributes("disabled")).toBe("")
    expect(scheduleButton?.attributes("data-variant")).toBe("flat")
    expect(scheduleButton?.classes()).toContain(
      "mobile-schedule-button--disabled",
    )
    expect(scheduleButton?.classes()).toContain("tw:bg-scheduled-event")
    expect(scheduleButton?.classes()).toContain("tw:border-scheduled-event")
    expect(scheduleButton?.classes()).toContain("tw:text-white")
  })

  it("does not render the relocated copy link action for group events", async () => {
    loaderEventState.value = {
      ...loaderEventState.value,
      type: eventTypes.GROUP,
    }

    const wrapper = shallowMount(EventView, {
      props: {
        eventId: "dEeaF",
      },
      global: {
        stubs: {
          ScheduleOverlap: ScheduleOverlapStub,
          NewDialog: true,
          GuestDialog: true,
          SignUpForSlotDialog: true,
          SignInNotSupportedDialog: true,
          MarkAvailabilityDialog: true,
          InvitationDialog: true,
          HelpDialog: true,
          EventDescription: true,
          AccessDenied: true,
          NotSignedIn: true,
          RouterLink: true,
          "v-chip": true,
          "v-icon": true,
          "v-card": true,
          "v-card-title": true,
          "v-card-text": true,
          "v-card-actions": true,
          "v-dialog": true,
          "v-spacer": true,
          "v-btn": buttonSemanticStub,
        },
      },
    })

    await flushDeferredMount()

    expect(wrapper.find("#copy-link-btn").exists()).toBe(false)
  })

  it("renders the availability action for group events so members can add availability", async () => {
    routeState.value = { name: "group", query: {} }
    loaderEventState.value = {
      ...createDefaultEventState(),
      type: eventTypes.GROUP,
      responses: {},
    }

    const wrapper = shallowMount(EventView, {
      props: {
        eventId: "dEeaF",
      },
      global: {
        stubs: {
          ScheduleOverlap: ScheduleOverlapStub,
          NewDialog: true,
          GuestDialog: true,
          SignUpForSlotDialog: true,
          SignInNotSupportedDialog: true,
          MarkAvailabilityDialog: true,
          InvitationDialog: true,
          HelpDialog: true,
          EventDescription: true,
          AccessDenied: true,
          NotSignedIn: true,
          RouterLink: true,
          "v-chip": true,
          "v-icon": true,
          "v-card": true,
          "v-card-title": true,
          "v-card-text": true,
          "v-card-actions": true,
          "v-dialog": true,
          "v-spacer": true,
          "v-btn": buttonSemanticStub,
        },
      },
    })

    await flushDeferredMount()

    expect(wrapper.find("#desktop-primary-availability-btn").exists()).toBe(
      true,
    )
  })

  it("keeps metadata editing available for events created while not signed in", async () => {
    loaderEventState.value = {
      ...loaderEventState.value,
      ownerId: guestUserId,
    }

    const wrapper = shallowMount(EventView, {
      props: {
        eventId: "dEeaF",
      },
      global: {
        stubs: {
          ScheduleOverlap: ScheduleOverlapStub,
          NewDialog: true,
          GuestDialog: true,
          SignUpForSlotDialog: true,
          SignInNotSupportedDialog: true,
          MarkAvailabilityDialog: true,
          InvitationDialog: true,
          HelpDialog: true,
          EventDescription: eventDescriptionStub,
          AccessDenied: true,
          NotSignedIn: true,
          RouterLink: true,
          "v-chip": true,
          "v-icon": true,
          "v-card": true,
          "v-card-title": true,
          "v-card-text": true,
          "v-card-actions": true,
          "v-dialog": true,
          "v-spacer": true,
          "v-btn": buttonSemanticStub,
        },
      },
    })

    await flushDeferredMount()

    expect(wrapper.find("#edit-event-btn").exists()).toBe(true)
    expect(wrapper.find("#event-description-stub").exists()).toBe(false)
  })

  it("treats an empty owner id like an anonymous-created editable event", async () => {
    loaderEventState.value = {
      ...loaderEventState.value,
      ownerId: "",
    }

    const wrapper = shallowMount(EventView, {
      props: {
        eventId: "dEeaF",
      },
      global: {
        stubs: {
          ScheduleOverlap: ScheduleOverlapStub,
          NewDialog: true,
          GuestDialog: true,
          SignUpForSlotDialog: true,
          SignInNotSupportedDialog: true,
          MarkAvailabilityDialog: true,
          InvitationDialog: true,
          HelpDialog: true,
          EventDescription: eventDescriptionStub,
          AccessDenied: true,
          NotSignedIn: true,
          RouterLink: true,
          "v-chip": true,
          "v-icon": true,
          "v-card": true,
          "v-card-title": true,
          "v-card-text": true,
          "v-card-actions": true,
          "v-dialog": true,
          "v-spacer": true,
          "v-btn": true,
        },
      },
    })

    await flushDeferredMount()

    expect(wrapper.find("#edit-event-btn").exists()).toBe(true)
    expect(wrapper.find("#event-description-stub").exists()).toBe(false)
  })

  it("does not auto-open the group invitation dialog for anonymous editable groups", async () => {
    routeState.value = { name: "group", query: {} }
    loaderEventState.value = {
      ...createDefaultEventState(),
      type: eventTypes.GROUP,
      ownerId: guestUserId,
      responses: {},
    }

    const wrapper = shallowMount(EventView, {
      props: {
        eventId: "dEeaF",
      },
      global: {
        stubs: {
          ScheduleOverlap: ScheduleOverlapStub,
          NewDialog: true,
          GuestDialog: true,
          SignUpForSlotDialog: true,
          SignInNotSupportedDialog: true,
          MarkAvailabilityDialog: true,
          InvitationDialog: invitationDialogStub,
          HelpDialog: true,
          EventDescription: eventDescriptionStub,
          AccessDenied: true,
          NotSignedIn: true,
          RouterLink: true,
          "v-chip": true,
          "v-icon": true,
          "v-card": true,
          "v-card-title": true,
          "v-card-text": true,
          "v-card-actions": true,
          "v-dialog": true,
          "v-spacer": true,
          "v-btn": true,
        },
      },
    })

    await flushDeferredMount()

    expect(wrapper.find("#edit-event-btn").exists()).toBe(true)
    expect(wrapper.find("#event-description-stub").exists()).toBe(false)
    expect(wrapper.find('[data-invitation-open="true"]').exists()).toBe(false)
  })

  it("auto-opens the group invitation dialog for non-editable group viewers without a response", async () => {
    routeState.value = { name: "group", query: {} }
    loaderEventState.value = {
      ...createDefaultEventState(),
      type: eventTypes.GROUP,
      ownerId: "owner-1",
      responses: {},
    }

    const wrapper = shallowMount(EventView, {
      props: {
        eventId: "dEeaF",
      },
      global: {
        stubs: {
          ScheduleOverlap: ScheduleOverlapStub,
          NewDialog: true,
          GuestDialog: true,
          SignUpForSlotDialog: true,
          SignInNotSupportedDialog: true,
          MarkAvailabilityDialog: true,
          InvitationDialog: invitationDialogStub,
          HelpDialog: true,
          EventDescription: eventDescriptionStub,
          AccessDenied: true,
          NotSignedIn: true,
          RouterLink: true,
          "v-chip": true,
          "v-icon": true,
          "v-card": true,
          "v-card-title": true,
          "v-card-text": true,
          "v-card-actions": true,
          "v-dialog": true,
          "v-spacer": true,
          "v-btn": true,
        },
      },
    })

    await flushDeferredMount()

    expect(wrapper.find("#event-description-stub").exists()).toBe(false)
    expect(wrapper.find('[data-invitation-open="true"]').exists()).toBe(true)
  })

  it("does not auto-open the group invitation dialog for a PostgreSQL viewer reported as responded", async () => {
    routeState.value = { name: "group", query: {} }
    loaderEventState.value = {
      ...createDefaultEventState(),
      type: eventTypes.GROUP,
      ownerId: "owner-1",
      hasResponded: true,
      responses: {},
    }

    const wrapper = shallowMount(EventView, {
      props: {
        eventId: "dEeaF",
      },
      global: {
        stubs: {
          ScheduleOverlap: ScheduleOverlapStub,
          NewDialog: true,
          GuestDialog: true,
          SignUpForSlotDialog: true,
          SignInNotSupportedDialog: true,
          MarkAvailabilityDialog: true,
          InvitationDialog: invitationDialogStub,
          HelpDialog: true,
          EventDescription: eventDescriptionStub,
          AccessDenied: true,
          NotSignedIn: true,
          RouterLink: true,
          "v-chip": true,
          "v-icon": true,
          "v-card": true,
          "v-card-title": true,
          "v-card-text": true,
          "v-card-actions": true,
          "v-dialog": true,
          "v-spacer": true,
          "v-btn": true,
        },
      },
    })

    await flushDeferredMount()

    expect(wrapper.find('[data-invitation-open="true"]').exists()).toBe(false)
  })

  it("owns global listeners from mount through unmount and runs bootstrap on mount", async () => {
    const addEventListenerSpy = vi.spyOn(window, "addEventListener")
    const removeEventListenerSpy = vi.spyOn(window, "removeEventListener")

    const wrapper = shallowMount(EventView, {
      props: {
        eventId: "dEeaF",
      },
      global: {
        stubs: {
          ScheduleOverlap: ScheduleOverlapStub,
          NewDialog: true,
          GuestDialog: true,
          SignUpForSlotDialog: true,
          SignInNotSupportedDialog: true,
          MarkAvailabilityDialog: true,
          InvitationDialog: true,
          HelpDialog: true,
          EventDescription: true,
          AccessDenied: true,
          NotSignedIn: true,
          RouterLink: true,
          "v-chip": true,
          "v-icon": true,
          "v-card": true,
          "v-card-title": true,
          "v-card-text": true,
          "v-card-actions": true,
          "v-dialog": true,
          "v-spacer": true,
          "v-btn": true,
        },
      },
    })

    await flushDeferredMount()
    await Promise.resolve()

    expect(refreshEventMock).toHaveBeenCalled()
    expect(addEventListenerSpy).toHaveBeenCalledWith(
      "beforeunload",
      expect.any(Function),
    )
    expect(addEventListenerSpy).toHaveBeenCalledWith(
      "message",
      expect.any(Function),
    )

    wrapper.unmount()

    expect(removeEventListenerSpy).toHaveBeenCalledWith(
      "beforeunload",
      expect.any(Function),
    )
    expect(removeEventListenerSpy).toHaveBeenCalledWith(
      "message",
      expect.any(Function),
    )
  })
})

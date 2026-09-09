// @vitest-environment happy-dom

import { flushPromises, shallowMount } from "@vue/test-utils"
import { describe, expect, it, vi } from "vitest"
import { nextTick, ref } from "vue"
import { Temporal } from "temporal-polyfill"
import { durations, UTC } from "@/constants"
import {
  respondentsListStubs,
  passThroughStub,
  type ComponentStubMap,
} from "@/test/componentStubs"
import { createLocalStorageMock } from "@/test/localStorage"
import { ZdtMap, ZdtSet } from "@/utils"
import type * as UtilsModule from "@/utils"
import type { TimedCellState } from "@/composables/schedule_overlap/types"
import RespondentsList from "./RespondentsList.vue"
import respondentsListSource from "./RespondentsList.vue?raw"

const { deleteMock } = vi.hoisted(() => ({
  deleteMock: vi.fn(),
}))

vi.mock("@/utils", async (importOriginal) => ({
  ...(await importOriginal<typeof UtilsModule>()),
  _delete: deleteMock,
}))

vi.mock("pinia", () => ({
  storeToRefs: (store: { authUser: unknown }) => ({
    authUser: store.authUser,
  }),
}))

vi.mock("@/stores/main", () => ({
  useMainStore: () => ({
    authUser: { value: null },
    showInfo: vi.fn(),
    showError: vi.fn(),
  }),
}))

vi.mock("@/plugins/posthog", () => ({
  posthog: {
    capture: vi.fn(),
  },
}))

const isPhoneValue = ref(true)

vi.mock("@/utils/useDisplayHelpers", () => ({
  useDisplayHelpers: () => ({
    isPhone: isPhoneValue,
  }),
}))

const zdt = (iso: string) => Temporal.Instant.from(iso).toZonedDateTimeISO(UTC)
const baseDate = zdt("2026-01-01T09:00:00Z")
const sharedRespondentsListStubs: ComponentStubMap = respondentsListStubs

const OverflowGradientStub = {
  inheritAttrs: false,
  props: ["scrollContainer", "position", "showArrow"],
  template: "<div class='overflow-gradient-stub' v-bind='$attrs' />",
}

const mountRespondentsList = ({
  curDate,
  setEntry,
  timezone = UTC,
  daysOnly = false,
  eventTimezone,
  curTimeslotAvailability = { "user-1": true },
  curTimeslotInactive = false,
  curTimeslotCellState = null,
  curTimeslotCollapsed = false,
  availability = [],
  empty = false,
  maxHeight,
  stubs,
}: {
  curDate?: Temporal.ZonedDateTime
  setEntry: Temporal.ZonedDateTime
  timezone?: string
  daysOnly?: boolean
  eventTimezone?: string
  curTimeslotAvailability?: Record<string, boolean>
  curTimeslotInactive?: boolean
  curTimeslotCellState?: TimedCellState | null
  curTimeslotCollapsed?: boolean
  availability?: Temporal.ZonedDateTime[]
  empty?: boolean
  maxHeight?: number
  stubs?: ComponentStubMap
}) => {
  const eventSlot = curDate ?? baseDate

  return shallowMount(RespondentsList, {
    props: {
      eventId: "evt-1",
      event: {
        blindAvailabilityEnabled: false,
        collectEmails: false,
        dates: [eventSlot.toPlainDate()],
        timeSeed: eventSlot,
        duration: durations.ONE_HOUR,
        daysOnly,
        eventTimezone,
      },
      curGuestId: "",
      ownedGuestResponseLookupKeys: [],
      guestResponseLookupKey: "",
      days: [],
      times: [],
      curDate,
      curRespondent: "",
      curRespondents: [],
      curTimeslot: { dayIndex: -1, timeIndex: -1 },
      curTimeslotAvailability,
      curTimeslotInactive,
      curTimeslotCellState,
      curTimeslotCollapsed,
      respondents: empty
        ? []
        : [
            {
              _id: "user-1",
              firstName: "Ada",
              lastName: "Lovelace",
              picture: "https://example.com/ada.png",
            } as never,
          ],
      maxHeight,
      parsedResponses: empty
        ? {}
        : {
            "user-1": {
              user: {
                _id: "user-1",
                firstName: "Ada",
                lastName: "Lovelace",
                picture: "https://example.com/ada.png",
              } as never,
              availability: new ZdtSet(availability),
              ifNeeded: new ZdtSet([setEntry]),
              guest: false,
            },
          },
      isOwner: false,
      isGroup: false,
      showCalendarEvents: false,
      responsesFormatted: new ZdtMap<Set<string>>(),
      timezone: {
        value: timezone,
        offset: durations.ZERO,
        label: timezone,
        gmtString: timezone === UTC ? "GMT" : timezone,
      },
      showBestTimes: false,
      hideIfNeeded: false,
      collapseDisabledTimes: true,
      guestAddedAvailability: false,
      addingAvailabilityAsGuest: false,
    },
    global: {
      stubs: { ...sharedRespondentsListStubs, ...stubs },
    },
  })
}

describe("RespondentsList", () => {
  it("shows a read-only dates-only event timezone above Responses", () => {
    const wrapper = mountRespondentsList({
      curDate: undefined,
      setEntry: baseDate,
      daysOnly: true,
      eventTimezone: "America/New_York",
    })

    const timezone = wrapper.get('[data-testid="event-timezone"]')

    expect(timezone.text()).toMatch(
      /^Timezone: \(GMT[-+]\d+:\d{2}\) Eastern Time$/,
    )
    expect(timezone.classes()).toContain("tw:mb-3")
    expect(timezone.classes()).not.toContain("tw:mb-2")
    expect(
      timezone.element.compareDocumentPosition(
        wrapper.get(".tw\\:text-lg").element,
      ) & Node.DOCUMENT_POSITION_FOLLOWING,
    ).toBeTruthy()
  })

  it("does not show an event timezone for timed events", () => {
    const wrapper = mountRespondentsList({
      curDate: undefined,
      setEntry: baseDate,
      eventTimezone: "America/New_York",
    })

    expect(wrapper.find('[data-testid="event-timezone"]').exists()).toBe(false)
  })

  it("uses a tighter empty-state margin for dates-only events", () => {
    const daysOnlyWrapper = mountRespondentsList({
      curDate: undefined,
      setEntry: baseDate,
      daysOnly: true,
      empty: true,
    })
    const timedWrapper = mountRespondentsList({
      curDate: undefined,
      setEntry: baseDate,
      empty: true,
    })

    const daysOnlyEmptyState = daysOnlyWrapper.get(
      "span.tw\\:text-very-dark-gray",
    ).element.parentElement
    const timedEmptyState = timedWrapper.get("span.tw\\:text-very-dark-gray")
      .element.parentElement

    expect(daysOnlyEmptyState?.classList.contains("tw:mb-2")).toBe(true)
    expect(timedEmptyState?.classList.contains("tw:mb-6")).toBe(true)
  })

  it("keeps dates-only populated responses as close to the Legend as the empty state", () => {
    const daysOnlyWrapper = mountRespondentsList({
      curDate: undefined,
      setEntry: baseDate,
      daysOnly: true,
    })
    const timedWrapper = mountRespondentsList({
      curDate: undefined,
      setEntry: baseDate,
    })

    expect(daysOnlyWrapper.find(".tw\\:h-1").exists()).toBe(true)
    expect(timedWrapper.find(".tw\\:h-2").exists()).toBe(true)
  })

  it("uses a fixed respondent control slot with hover-visible checkbox shell", () => {
    const wrapper = mountRespondentsList({
      curDate: undefined,
      setEntry: baseDate,
    })

    const respondentRow = wrapper.find(".respondent-row")
    const labelColumn = wrapper.find(
      ".tw\\:flex.tw\\:flex-col.tw\\:justify-center",
    )
    const nameLabel = wrapper.find(
      ".tw\\:mr-1.tw\\:text-sm.tw\\:leading-5.tw\\:transition-all",
    )
    const controlSlot = wrapper.find(
      ".tw\\:ml-1.tw\\:mr-3.tw\\:flex.tw\\:h-5.tw\\:w-5.tw\\:shrink-0.tw\\:items-center.tw\\:justify-center",
    )

    expect(respondentRow.classes()).toContain("tw:text-sm")
    expect(respondentRow.classes()).toContain("tw:leading-5")
    expect(labelColumn.exists()).toBe(true)
    expect(nameLabel.exists()).toBe(true)
    expect(controlSlot.exists()).toBe(true)
    expect(wrapper.findComponent({ name: "UserAvatarContent" }).exists()).toBe(
      true,
    )
    const selectionButton = wrapper.find('button[aria-pressed="false"]')
    const checkboxShell = selectionButton.find(".respondent-control__checkbox")
    const avatar = selectionButton.find(".respondent-control__avatar")

    expect(selectionButton.exists()).toBe(true)
    expect(selectionButton.classes()).toContain("tw:appearance-none")
    expect(selectionButton.classes()).toContain("tw:h-5")
    expect(selectionButton.classes()).toContain("tw:w-5")
    expect(selectionButton.classes()).toContain("respondent-control")
    expect(avatar.exists()).toBe(true)
    expect(avatar.classes()).toContain("tw:flex")
    expect(checkboxShell.exists()).toBe(true)
    expect(checkboxShell.classes()).toContain("tw:flex")
    expect(checkboxShell.classes()).toContain("tw:h-4")
    expect(checkboxShell.classes()).toContain("tw:w-4")
    expect(checkboxShell.classes()).toContain("tw:border-2")
    expect(checkboxShell.classes()).toContain("tw:border-solid")
    expect(checkboxShell.classes()).not.toContain("tw:border-primary")
    expect(checkboxShell.attributes("style")).toContain(
      "border-color: var(--timeful-primary-action-bg);",
    )
  })

  it("shows the profile avatar when no grid slot is in context", () => {
    const wrapper = mountRespondentsList({
      curDate: undefined,
      setEntry: baseDate,
    })

    const avatar = wrapper.find(".respondent-control__avatar")
    expect(avatar.find("div.tw\\:h-4.tw\\:w-4").exists()).toBe(false)
    expect(wrapper.findComponent({ name: "UserAvatarContent" }).exists()).toBe(
      true,
    )
  })

  it("renders a green status square for an available respondent on an active slot", () => {
    const wrapper = mountRespondentsList({
      curDate: baseDate,
      setEntry: baseDate,
      availability: [baseDate],
    })

    const statusSquare = wrapper.find(
      ".respondent-control__avatar div.tw\\:h-4.tw\\:w-4",
    )
    expect(statusSquare.exists()).toBe(true)
    expect(statusSquare.classes()).toContain("tw:bg-[#00994C77]")
    expect(statusSquare.classes()).toContain("tw:border-outline-neutral")
    expect(wrapper.findComponent({ name: "UserAvatarContent" }).exists()).toBe(
      false,
    )
  })

  it("renders a yellow status square for an if-needed respondent on an active slot", () => {
    const wrapper = mountRespondentsList({
      curDate: baseDate,
      setEntry: baseDate,
    })

    const statusSquare = wrapper.find(
      ".respondent-control__avatar div.tw\\:h-4.tw\\:w-4",
    )
    expect(statusSquare.exists()).toBe(true)
    expect(statusSquare.classes()).toContain("tw:bg-yellow")
  })

  it("renders a pink status square for an unavailable respondent on an active slot", () => {
    const otherSlot = Temporal.Instant.from(
      "2026-01-01T10:00:00Z",
    ).toZonedDateTimeISO(UTC)

    const wrapper = mountRespondentsList({
      curDate: baseDate,
      setEntry: otherSlot,
    })

    const statusSquare = wrapper.find(
      ".respondent-control__avatar div.tw\\:h-4.tw\\:w-4",
    )
    expect(statusSquare.exists()).toBe(true)
    expect(statusSquare.classes()).toContain("tw:bg-[#F9CCCC]")
  })

  it("renders a light-gray-stroke status square when hovering an enabled-inactive cell", () => {
    const wrapper = mountRespondentsList({
      curDate: baseDate,
      setEntry: baseDate,
      curTimeslotInactive: true,
      curTimeslotCellState: "enabled_inactive",
    })

    const statusSquare = wrapper.find(
      ".respondent-control__avatar div.tw\\:h-4.tw\\:w-4",
    )
    expect(statusSquare.exists()).toBe(true)
    expect(statusSquare.classes()).toContain("tw:bg-light-gray-stroke")
    expect(wrapper.findComponent({ name: "UserAvatarContent" }).exists()).toBe(
      false,
    )
  })

  it("renders the collapsed-hours status square when hovering collapsed hours", () => {
    const wrapper = mountRespondentsList({
      curDate: baseDate,
      setEntry: baseDate,
      curTimeslotInactive: true,
      curTimeslotCellState: "enabled_inactive",
      curTimeslotCollapsed: true,
    })

    const statusSquare = wrapper.find(
      ".respondent-control__avatar div.tw\\:h-4.tw\\:w-4",
    )
    expect(statusSquare.exists()).toBe(true)
    expect(statusSquare.classes()).toContain(
      "tw:bg-(--timeful-collapsed-hours-bg)",
    )
    expect(statusSquare.classes()).toContain("respondent-status--collapsed")
    expect(wrapper.findComponent({ name: "UserAvatarContent" }).exists()).toBe(
      false,
    )
  })

  it("renders a gray status square when hovering an out-of-range or padding cell", () => {
    const wrapper = mountRespondentsList({
      curDate: baseDate,
      setEntry: baseDate,
      curTimeslotInactive: true,
      curTimeslotCellState: null,
    })

    const statusSquare = wrapper.find(
      ".respondent-control__avatar div.tw\\:h-4.tw\\:w-4",
    )
    expect(statusSquare.exists()).toBe(true)
    expect(statusSquare.classes()).toContain("tw:bg-gray")
    expect(wrapper.findComponent({ name: "UserAvatarContent" }).exists()).toBe(
      false,
    )
  })

  it("keeps the hover-to-select checkbox shell when a status square is shown", () => {
    const wrapper = mountRespondentsList({
      curDate: baseDate,
      setEntry: baseDate,
    })

    const selectionButton = wrapper.find('button[aria-pressed="false"]')
    expect(selectionButton.exists()).toBe(true)
    expect(selectionButton.find(".respondent-control__checkbox").exists()).toBe(
      true,
    )
    expect(selectionButton.find(".respondent-control__avatar").exists()).toBe(
      true,
    )
  })

  it("keeps the respondent action in the same inline row as the respondent name", () => {
    const wrapper = mountRespondentsList({
      curDate: zdt("2026-01-01T09:00:00Z"),
      setEntry: zdt("2026-01-01T09:00:00Z"),
    })

    const nameActionRow = wrapper.find(
      ".tw\\:flex.tw\\:items-center.tw\\:justify-between.tw\\:gap-2",
    )
    expect(nameActionRow.exists()).toBe(true)
    expect(nameActionRow.find(".respondent-name-line").exists()).toBe(true)
    expect(nameActionRow.find(".respondent-row-actions").exists()).toBe(true)
  })

  it("does not add extra top padding inside the respondents scroller", () => {
    expect(respondentsListSource).toContain(
      'class="tw:-ml-2 tw:pl-2 tw:text-sm"',
    )
    expect(respondentsListSource).not.toContain(
      'class="tw:-ml-2 tw:pl-2 tw:pt-2 tw:text-sm"',
    )
  })

  it("wires top and bottom fade gradients to the desktop respondents scroll view", () => {
    expect(
      respondentsListSource.match(/<OverflowGradient\b/g) ?? [],
    ).toHaveLength(2)
    expect(respondentsListSource).toContain('position="top"')
    expect(
      respondentsListSource.match(
        /:scroll-container="respondentsScrollView"/g,
      ) ?? [],
    ).toHaveLength(2)
  })

  it("wires both fade gradients to the capped mobile sticky respondents scroll view", async () => {
    const wrapper = mountRespondentsList({
      curDate: baseDate,
      setEntry: baseDate,
      maxHeight: 240,
      stubs: { OverflowGradient: OverflowGradientStub },
    })
    await nextTick()
    await nextTick()

    const gradients = wrapper.findAllComponents(OverflowGradientStub)
    expect(gradients).toHaveLength(2)
    expect(
      gradients.map(
        (gradient) => gradient.props("position") as string | undefined,
      ),
    ).toEqual([undefined, "top"])
    const scrollView = wrapper.get('[data-testid="respondents-scroll-view"]')
    expect(
      gradients.every(
        (gradient) => gradient.props("scrollContainer") === scrollView.element,
      ),
    ).toBe(true)
  })

  it("keeps the uncapped mobile respondents list free of fade gradients", async () => {
    const wrapper = mountRespondentsList({
      curDate: baseDate,
      setEntry: baseDate,
      stubs: { OverflowGradient: OverflowGradientStub },
    })
    await nextTick()
    await nextTick()

    expect(wrapper.findAllComponents(OverflowGradientStub)).toHaveLength(0)
  })

  it("caps the respondents scroll element with overflow-y-auto when maxHeight is set and keeps the Responses heading outside it", () => {
    const wrapper = mountRespondentsList({
      curDate: baseDate,
      setEntry: baseDate,
      maxHeight: 240,
    })

    const scrollView = wrapper.get('[data-testid="respondents-scroll-view"]')
    const scrollableSection = wrapper.get(
      '[data-testid="respondents-scrollable-section"]',
    )

    expect(scrollView.attributes("style")).toContain("max-height: 240px;")
    expect(scrollView.classes()).toContain("tw:overflow-y-auto")
    expect(scrollView.classes()).toContain("tw:overflow-x-hidden")
    expect(scrollableSection.attributes("style")).toBeUndefined()

    const responsesHeading = wrapper.get(".tw\\:text-lg")
    expect(responsesHeading.element.tagName).toBe("DIV")
    expect(scrollView.element.contains(responsesHeading.element)).toBe(false)
    expect(scrollableSection.element.contains(responsesHeading.element)).toBe(
      false,
    )
  })

  it("caps the desktop respondents scroll view at 300px with scrolling overflow and keeps the heading outside it", () => {
    isPhoneValue.value = false

    try {
      const wrapper = mountRespondentsList({
        curDate: baseDate,
        setEntry: baseDate,
      })

      const scrollView = wrapper.get('[data-testid="respondents-scroll-view"]')
      const scrollableSection = wrapper.get(
        '[data-testid="respondents-scrollable-section"]',
      )

      expect(scrollView.attributes("style")).toContain("max-height: 300px;")
      expect(scrollView.classes()).toContain("tw:overflow-y-auto")
      expect(scrollView.classes()).toContain("tw:overflow-x-hidden")
      expect(scrollableSection.attributes("style")).toBeUndefined()

      const responsesHeading = wrapper.get(".tw\\:text-lg")
      expect(responsesHeading.element.tagName).toBe("DIV")
      expect(scrollView.element.contains(responsesHeading.element)).toBe(false)
    } finally {
      isPhoneValue.value = true
    }
  })

  it("treats equal ZonedDateTime values as matching respondent if-needed slots without asterisk or highlight", () => {
    const matchingDate = zdt("2026-01-01T09:00:00Z")
    const setEntry = zdt("2026-01-01T09:00:00Z")

    const wrapper = mountRespondentsList({
      curDate: matchingDate,
      setEntry,
    })

    expect(wrapper.text()).toContain("Ada Lovelace")
    expect(wrapper.text()).not.toContain("Ada Lovelace*")
    expect(wrapper.text()).not.toContain("* if needed")
    expect(wrapper.find(".respondent-name-line").classes()).not.toContain(
      "tw:bg-yellow",
    )
    expect(
      wrapper
        .find(".respondent-control__avatar div.tw\\:h-4.tw\\:w-4")
        .classes(),
    ).toContain("tw:bg-yellow")
  })

  it("matches stored UTC if-needed slots against rendered local-time slots without asterisk or legend", () => {
    const storedUtcSlot = zdt("2026-01-01T09:00:00Z")
    const renderedLocalSlot = Temporal.Instant.from(
      "2026-01-01T09:00:00Z",
    ).toZonedDateTimeISO("America/Los_Angeles")

    const wrapper = mountRespondentsList({
      curDate: renderedLocalSlot,
      setEntry: storedUtcSlot,
      timezone: "America/Los_Angeles",
    })

    expect(wrapper.text()).toContain("Ada Lovelace")
    expect(wrapper.text()).not.toContain("Ada Lovelace*")
    expect(wrapper.text()).not.toContain("* if needed")
  })

  it("shows (0/N) and strikes through respondents when hovering an inactive timeslot", () => {
    const wrapper = mountRespondentsList({
      curDate: zdt("2026-01-01T09:00:00Z"),
      setEntry: zdt("2026-01-01T09:00:00Z"),
      curTimeslotAvailability: { "user-1": false },
      curTimeslotInactive: true,
    })

    expect(wrapper.text()).toContain("(0/1)")
    expect(wrapper.find(".respondent-name-line").classes()).toContain(
      "tw:line-through",
    )
    expect(wrapper.find(".respondent-name-line").classes()).toContain(
      "tw:text-gray",
    )
  })

  it("suppresses stale if-needed stars while hovering an inactive timeslot", () => {
    const wrapper = mountRespondentsList({
      curDate: zdt("2026-01-01T09:00:00Z"),
      setEntry: zdt("2026-01-01T09:00:00Z"),
      curTimeslotInactive: true,
    })

    expect(wrapper.text()).toContain("(1/1)")
    expect(wrapper.text()).not.toContain("Ada Lovelace*")
  })

  it("renders guest respondents without leaking undefined last names", () => {
    const wrapper = shallowMount(RespondentsList, {
      props: {
        eventId: "evt-1",
        event: {
          blindAvailabilityEnabled: false,
          collectEmails: false,
          dates: [zdt("2026-01-01T09:00:00Z").toPlainDate()],
          timeSeed: zdt("2026-01-01T09:00:00Z"),
          duration: durations.ONE_HOUR,
          daysOnly: false,
        },
        curGuestId: "",
        ownedGuestResponseLookupKeys: [],
        guestResponseLookupKey: "",
        days: [],
        times: [],
        curDate: zdt("2026-01-01T09:00:00Z"),
        curRespondent: "",
        curRespondents: [],
        curTimeslot: { dayIndex: -1, timeIndex: -1 },
        curTimeslotAvailability: { "guest-1": true },
        respondents: [
          {
            _id: "guest-1",
            firstName: "Ada",
          } as never,
        ],
        parsedResponses: {
          "guest-1": {
            user: {
              _id: "guest-1",
              firstName: "Ada",
            } as never,
            availability: new ZdtSet(),
            ifNeeded: new ZdtSet(),
            guest: true,
          },
        },
        isOwner: false,
        isGroup: false,
        showCalendarEvents: false,
        responsesFormatted: new ZdtMap<Set<string>>(),
        timezone: {
          value: UTC,
          offset: durations.ZERO,
          label: UTC,
          gmtString: "GMT",
        },
        showBestTimes: false,
        hideIfNeeded: false,
        collapseDisabledTimes: true,
        guestAddedAvailability: false,
        addingAvailabilityAsGuest: false,
      },
      global: {
        stubs: sharedRespondentsListStubs,
      },
    })

    expect(wrapper.text()).toContain("Ada")
    expect(wrapper.text()).not.toContain("undefined")
  })

  it("does not render desktop event options beneath the respondents list", () => {
    isPhoneValue.value = false

    const baseDate = zdt("2026-01-01T09:00:00Z")

    const wrapper = shallowMount(RespondentsList, {
      props: {
        eventId: "evt-1",
        event: {
          blindAvailabilityEnabled: false,
          collectEmails: false,
          dates: [baseDate.toPlainDate()],
          timeSeed: baseDate,
          duration: durations.ONE_HOUR,
          daysOnly: false,
        },
        curGuestId: "",
        ownedGuestResponseLookupKeys: ["guest"],
        guestResponseLookupKey: "guest",
        days: [],
        times: [],
        curDate: baseDate,
        curRespondent: "",
        curRespondents: [],
        curTimeslot: { dayIndex: -1, timeIndex: -1 },
        curTimeslotAvailability: { "user-1": true, "user-2": true },
        respondents: [
          {
            _id: "user-1",
            firstName: "Ada",
            lastName: "Lovelace",
          },
          {
            _id: "user-2",
            firstName: "Grace",
            lastName: "Hopper",
          },
        ],
        parsedResponses: {
          "user-1": {
            user: {
              _id: "user-1",
              firstName: "Ada",
              lastName: "Lovelace",
            },
            availability: new ZdtSet(),
            ifNeeded: new ZdtSet(),
            guest: false,
          },
          "user-2": {
            user: {
              _id: "user-2",
              firstName: "Grace",
              lastName: "Hopper",
            },
            availability: new ZdtSet(),
            ifNeeded: new ZdtSet(),
            guest: false,
          },
        },
        isOwner: false,
        isGroup: false,
        showCalendarEvents: false,
        responsesFormatted: new ZdtMap<Set<string>>(),
        timezone: {
          value: UTC,
          offset: durations.ZERO,
          label: UTC,
          gmtString: "GMT",
        },
        hideIfNeeded: false,
        guestAddedAvailability: false,
        addingAvailabilityAsGuest: false,
      },
      global: { stubs: sharedRespondentsListStubs },
    })

    expect(wrapper.text()).not.toContain("Options")
    expect(wrapper.text()).not.toContain("Show best times")
    expect(wrapper.text()).not.toContain("Collapse disabled times")
    isPhoneValue.value = true
  })

  it("keeps desktop timed respondents content-only when there are zero responses", () => {
    isPhoneValue.value = false

    const baseDate = zdt("2026-01-01T09:00:00Z")

    const wrapper = shallowMount(RespondentsList, {
      props: {
        eventId: "evt-1",
        event: {
          blindAvailabilityEnabled: false,
          collectEmails: false,
          dates: [baseDate.toPlainDate()],
          timeSeed: baseDate,
          duration: durations.ONE_HOUR,
          daysOnly: false,
        },
        curGuestId: "",
        ownedGuestResponseLookupKeys: [],
        guestResponseLookupKey: "",
        days: [],
        times: [],
        curDate: baseDate,
        curRespondent: "",
        curRespondents: [],
        curTimeslot: { dayIndex: -1, timeIndex: -1 },
        curTimeslotAvailability: {},
        respondents: [],
        parsedResponses: {},
        isOwner: false,
        isGroup: false,
        showCalendarEvents: false,
        responsesFormatted: new ZdtMap<Set<string>>(),
        timezone: {
          value: UTC,
          offset: durations.ZERO,
          label: UTC,
          gmtString: "GMT",
        },
        hideIfNeeded: false,
        guestAddedAvailability: false,
        addingAvailabilityAsGuest: false,
      },
      global: { stubs: sharedRespondentsListStubs },
    })

    expect(wrapper.text()).not.toContain("Options")
    expect(wrapper.text()).not.toContain("Collapse disabled times")
    expect(wrapper.text()).not.toContain("Hide if needed times")

    isPhoneValue.value = true
  })

  it("uses explicit Vuetify 3 select and list props for export actions", () => {
    expect(respondentsListSource).toContain(
      '<v-list class="tw:py-1" density="compact">',
    )
    expect(respondentsListSource).toContain('class="timeful-solo-field"')
    expect(respondentsListSource).toContain('variant="solo"')
    expect(respondentsListSource).toContain('item-title="text"')
    expect(respondentsListSource).toContain('item-value="value"')
    expect(respondentsListSource).not.toContain(
      '<v-list class="tw:py-1" dense>',
    )
    expect(respondentsListSource).not.toContain(
      "\n                      solo\n",
    )
    expect(respondentsListSource).not.toContain('item-text="text"')
  })

  it("does not render an inline add-availability CTA in the respondents panel", () => {
    expect(respondentsListSource).not.toContain("+ Add availability")
    expect(respondentsListSource).not.toContain("+ Add guest availability")
  })

  it("keeps row clicks separate from the guest pencil edit action", async () => {
    isPhoneValue.value = false

    const VBtnStub = {
      emits: ["click"],
      template:
        "<button @click.stop=\"$emit('click', $event)\"><slot /></button>",
    }
    const VIconStub = {
      template: "<span><slot /></span>",
    }

    const wrapper = shallowMount(RespondentsList, {
      props: {
        eventId: "evt-1",
        event: {
          blindAvailabilityEnabled: false,
          collectEmails: false,
          dates: [Temporal.PlainDate.from("2026-01-01")],
          timeSeed: zdt("2026-01-01T09:00:00Z"),
          duration: durations.ONE_HOUR,
          daysOnly: false,
        },
        curGuestId: "",
        ownedGuestResponseLookupKeys: ["guest"],
        guestResponseLookupKey: "guest",
        days: [],
        times: [],
        curDate: zdt("2026-01-01T09:00:00Z"),
        curRespondent: "",
        curRespondents: [],
        curTimeslot: { dayIndex: -1, timeIndex: -1 },
        curTimeslotAvailability: { guest: true },
        respondents: [
          {
            _id: "guest",
            firstName: "guest",
            lastName: "",
          },
        ],
        parsedResponses: {
          guest: {
            user: {
              _id: "guest",
              firstName: "guest",
              lastName: "",
            },
            availability: new ZdtSet(),
            ifNeeded: new ZdtSet(),
            guest: true,
          },
        },
        isOwner: false,
        isGroup: false,
        showCalendarEvents: false,
        responsesFormatted: new ZdtMap<Set<string>>(),
        timezone: {
          value: UTC,
          offset: durations.ZERO,
          label: UTC,
          gmtString: "GMT",
        },
        showBestTimes: false,
        hideIfNeeded: false,
        collapseDisabledTimes: true,
        guestAddedAvailability: false,
        addingAvailabilityAsGuest: false,
      },
      global: {
        stubs: {
          ...sharedRespondentsListStubs,
          "v-btn": VBtnStub,
          "v-icon": VIconStub,
        },
      },
    })

    await wrapper.get(".respondent-row").trigger("click")

    const pencilButton = wrapper
      .findAll("button")
      .find((node) => node.text().includes("mdi-pencil"))

    expect(pencilButton).toBeDefined()
    if (!pencilButton) {
      throw new Error("Expected guest pencil action to be rendered")
    }

    await pencilButton.trigger("click")

    expect(wrapper.emitted("clickRespondent")).toEqual([
      [expect.any(MouseEvent), "guest"],
    ])
    expect(wrapper.emitted("editGuestAvailability")).toEqual([["guest"]])
    isPhoneValue.value = true
  })

  it("renders a lock for protected guest responses owned by someone else", () => {
    isPhoneValue.value = false

    const VIconStub = {
      template: "<span><slot /></span>",
    }

    const wrapper = shallowMount(RespondentsList, {
      props: {
        eventId: "evt-1",
        event: {
          blindAvailabilityEnabled: false,
          collectEmails: false,
          dates: [Temporal.PlainDate.from("2026-01-01")],
          timeSeed: zdt("2026-01-01T09:00:00Z"),
          duration: durations.ONE_HOUR,
          daysOnly: false,
        },
        curGuestId: "",
        ownedGuestResponseLookupKeys: [],
        guestResponseLookupKey: "different-guest",
        days: [],
        times: [],
        curDate: zdt("2026-01-01T09:00:00Z"),
        curRespondent: "",
        curRespondents: [],
        curTimeslot: { dayIndex: -1, timeIndex: -1 },
        curTimeslotAvailability: { guest: true },
        respondents: [
          {
            _id: "guest",
            firstName: "guest",
            lastName: "",
          },
        ],
        parsedResponses: {
          guest: {
            user: {
              _id: "guest",
              firstName: "guest",
              lastName: "",
            },
            availability: new ZdtSet(),
            ifNeeded: new ZdtSet(),
            guest: true,
            guestId: "guest-token-id",
            guestEditPolicy: "protected",
            guestOwnershipMode: "token",
          },
        },
        isOwner: false,
        isGroup: false,
        showCalendarEvents: false,
        responsesFormatted: new ZdtMap<Set<string>>(),
        timezone: {
          value: UTC,
          offset: durations.ZERO,
          label: UTC,
          gmtString: "GMT",
        },
        showBestTimes: false,
        hideIfNeeded: false,
        collapseDisabledTimes: true,
        guestAddedAvailability: false,
        addingAvailabilityAsGuest: false,
      },
      global: {
        stubs: {
          ...sharedRespondentsListStubs,
          "v-icon": VIconStub,
        },
      },
    })

    const lockStatus = wrapper.get(".respondent-edit-status")
    expect(lockStatus.attributes("aria-disabled")).toBe("true")
    expect(lockStatus.attributes("aria-label")).toContain("cannot be edited")
    expect(lockStatus.classes()).toContain("tw:h-5")
    expect(lockStatus.classes()).toContain("tw:w-5")
    expect(lockStatus.classes()).toContain("tw:text-sm")
    expect(lockStatus.text()).toContain("mdi-lock")
    isPhoneValue.value = true
  })

  it("shows the guest pencil only for the matching legacy guest row", () => {
    isPhoneValue.value = false

    const VBtnStub = {
      template: "<button><slot /></button>",
    }
    const VIconStub = {
      template: "<span><slot /></span>",
    }

    const wrapper = shallowMount(RespondentsList, {
      props: {
        eventId: "evt-1",
        event: {
          blindAvailabilityEnabled: false,
          collectEmails: false,
          dates: [Temporal.PlainDate.from("2026-01-01")],
          timeSeed: zdt("2026-01-01T09:00:00Z"),
          duration: durations.ONE_HOUR,
          daysOnly: false,
        },
        curGuestId: "",
        ownedGuestResponseLookupKeys: ["Legacy Ada"],
        guestResponseLookupKey: "Legacy Ada",
        days: [],
        times: [],
        curDate: zdt("2026-01-01T09:00:00Z"),
        curRespondent: "",
        curRespondents: [],
        curTimeslot: { dayIndex: -1, timeIndex: -1 },
        curTimeslotAvailability: { "Legacy Ada": true, "Legacy Grace": true },
        respondents: [
          { _id: "Legacy Ada", firstName: "Legacy Ada", lastName: "" },
          { _id: "Legacy Grace", firstName: "Legacy Grace", lastName: "" },
        ],
        parsedResponses: {
          "Legacy Ada": {
            user: { _id: "Legacy Ada", firstName: "Legacy Ada", lastName: "" },
            availability: new ZdtSet(),
            ifNeeded: new ZdtSet(),
            guest: true,
            guestOwnershipMode: "legacy",
          },
          "Legacy Grace": {
            user: {
              _id: "Legacy Grace",
              firstName: "Legacy Grace",
              lastName: "",
            },
            availability: new ZdtSet(),
            ifNeeded: new ZdtSet(),
            guest: true,
            guestOwnershipMode: "legacy",
          },
        },
        isOwner: false,
        isGroup: false,
        showCalendarEvents: false,
        responsesFormatted: new ZdtMap<Set<string>>(),
        timezone: {
          value: UTC,
          offset: durations.ZERO,
          label: UTC,
          gmtString: "GMT",
        },
        showBestTimes: false,
        hideIfNeeded: false,
        collapseDisabledTimes: true,
        guestAddedAvailability: false,
        addingAvailabilityAsGuest: false,
      },
      global: {
        stubs: {
          ...sharedRespondentsListStubs,
          "v-btn": VBtnStub,
          "v-icon": VIconStub,
        },
      },
    })

    const pencilButtons = wrapper
      .findAll("button")
      .filter((node) => node.text().includes("mdi-pencil"))

    expect(pencilButtons).toHaveLength(1)
    expect(wrapper.text()).toContain("Legacy Ada")
    expect(wrapper.text()).toContain("Legacy Grace")
    isPhoneValue.value = true
  })

  it("keeps token-backed open guest responses editable by another guest", () => {
    isPhoneValue.value = false

    const VBtnStub = {
      template: "<button><slot /></button>",
    }
    const VIconStub = {
      template: "<span><slot /></span>",
    }

    const wrapper = shallowMount(RespondentsList, {
      props: {
        eventId: "evt-1",
        event: {
          blindAvailabilityEnabled: false,
          collectEmails: false,
          dates: [Temporal.PlainDate.from("2026-01-01")],
          timeSeed: zdt("2026-01-01T09:00:00Z"),
          duration: durations.ONE_HOUR,
          daysOnly: false,
        },
        curGuestId: "",
        ownedGuestResponseLookupKeys: [],
        guestResponseLookupKey: "different-guest",
        days: [],
        times: [],
        curDate: zdt("2026-01-01T09:00:00Z"),
        curRespondent: "",
        curRespondents: [],
        curTimeslot: { dayIndex: -1, timeIndex: -1 },
        curTimeslotAvailability: { guest: true },
        respondents: [
          {
            _id: "guest",
            firstName: "guest",
            lastName: "",
          },
        ],
        parsedResponses: {
          guest: {
            user: {
              _id: "guest",
              firstName: "guest",
              lastName: "",
            },
            availability: new ZdtSet(),
            ifNeeded: new ZdtSet(),
            guest: true,
            guestId: "guest-token-id",
            guestEditPolicy: "open",
            guestOwnershipMode: "token",
          },
        },
        isOwner: false,
        isGroup: false,
        showCalendarEvents: false,
        responsesFormatted: new ZdtMap<Set<string>>(),
        timezone: {
          value: UTC,
          offset: durations.ZERO,
          label: UTC,
          gmtString: "GMT",
        },
        showBestTimes: false,
        hideIfNeeded: false,
        collapseDisabledTimes: true,
        guestAddedAvailability: false,
        addingAvailabilityAsGuest: false,
      },
      global: {
        stubs: {
          ...sharedRespondentsListStubs,
          "v-btn": VBtnStub,
          "v-icon": VIconStub,
        },
      },
    })

    expect(wrapper.text()).toContain("mdi-pencil")
    isPhoneValue.value = true
  })

  it("shows a direct pencil on mobile without an overflow menu for editable guests", () => {
    isPhoneValue.value = true

    const VIconStub = {
      template: "<span><slot /></span>",
    }

    const wrapper = shallowMount(RespondentsList, {
      props: {
        eventId: "evt-1",
        event: {
          blindAvailabilityEnabled: false,
          collectEmails: false,
          dates: [Temporal.PlainDate.from("2026-01-01")],
          timeSeed: zdt("2026-01-01T09:00:00Z"),
          duration: durations.ONE_HOUR,
          daysOnly: false,
        },
        curGuestId: "",
        ownedGuestResponseLookupKeys: ["guest"],
        guestResponseLookupKey: "guest",
        days: [],
        times: [],
        curDate: zdt("2026-01-01T09:00:00Z"),
        curRespondent: "",
        curRespondents: [],
        curTimeslot: { dayIndex: -1, timeIndex: -1 },
        curTimeslotAvailability: { guest: true },
        respondents: [{ _id: "guest", firstName: "guest", lastName: "" }],
        parsedResponses: {
          guest: {
            user: {
              _id: "guest",
              firstName: "guest",
              lastName: "",
            },
            availability: new ZdtSet(),
            ifNeeded: new ZdtSet(),
            guest: true,
          },
        },
        isOwner: false,
        isGroup: false,
        showCalendarEvents: false,
        responsesFormatted: new ZdtMap<Set<string>>(),
        timezone: {
          value: UTC,
          offset: durations.ZERO,
          label: UTC,
          gmtString: "GMT",
        },
        hideIfNeeded: false,
        guestAddedAvailability: false,
        addingAvailabilityAsGuest: false,
      },
      global: {
        stubs: {
          ...sharedRespondentsListStubs,
          "v-icon": VIconStub,
        },
      },
    })

    const pencilStatus = wrapper.get(".respondent-edit-status")
    expect(pencilStatus.element.tagName).toBe("BUTTON")
    expect(pencilStatus.attributes("aria-disabled")).toBe("false")
    expect(pencilStatus.attributes("aria-label")).toContain("Edit guest")
    expect(pencilStatus.classes()).toContain("tw:h-5")
    expect(pencilStatus.classes()).toContain("tw:w-5")
    expect(pencilStatus.classes()).toContain("tw:text-sm")
    expect(pencilStatus.text()).toContain("mdi-pencil")
    expect(wrapper.text()).not.toContain("mdi-dots-vertical")
  })

  it("shows a direct lock on mobile without an overflow menu for non-editable responses", () => {
    isPhoneValue.value = true

    const VIconStub = {
      template: "<span><slot /></span>",
    }

    const wrapper = shallowMount(RespondentsList, {
      props: {
        eventId: "evt-1",
        event: {
          blindAvailabilityEnabled: false,
          collectEmails: false,
          dates: [Temporal.PlainDate.from("2026-01-01")],
          timeSeed: zdt("2026-01-01T09:00:00Z"),
          duration: durations.ONE_HOUR,
          daysOnly: false,
        },
        curGuestId: "",
        ownedGuestResponseLookupKeys: [],
        guestResponseLookupKey: "",
        days: [],
        times: [],
        curDate: zdt("2026-01-01T09:00:00Z"),
        curRespondent: "",
        curRespondents: [],
        curTimeslot: { dayIndex: -1, timeIndex: -1 },
        curTimeslotAvailability: { "user-1": true },
        respondents: [
          {
            _id: "user-1",
            firstName: "Ada",
            lastName: "Lovelace",
          } as never,
        ],
        parsedResponses: {
          "user-1": {
            user: {
              _id: "user-1",
              firstName: "Ada",
              lastName: "Lovelace",
            } as never,
            availability: new ZdtSet(),
            ifNeeded: new ZdtSet(),
            guest: false,
          },
        },
        isOwner: false,
        isGroup: false,
        showCalendarEvents: false,
        responsesFormatted: new ZdtMap<Set<string>>(),
        timezone: {
          value: UTC,
          offset: durations.ZERO,
          label: UTC,
          gmtString: "GMT",
        },
        hideIfNeeded: false,
        guestAddedAvailability: false,
        addingAvailabilityAsGuest: false,
      },
      global: {
        stubs: {
          ...sharedRespondentsListStubs,
          "v-icon": VIconStub,
        },
      },
    })

    const lockStatus = wrapper.get(".respondent-edit-status")
    expect(lockStatus.element.tagName).toBe("DIV")
    expect(lockStatus.attributes("aria-disabled")).toBe("true")
    expect(lockStatus.attributes("aria-label")).toContain("cannot be edited")
    expect(lockStatus.classes()).toContain("tw:h-5")
    expect(lockStatus.classes()).toContain("tw:w-5")
    expect(lockStatus.classes()).toContain("tw:text-sm")
    expect(lockStatus.text()).toContain("mdi-lock")
    expect(wrapper.text()).not.toContain("mdi-dots-vertical")
  })

  it("does not render mobile row-level delete for owners", () => {
    isPhoneValue.value = true

    const wrapper = shallowMount(RespondentsList, {
      props: {
        eventId: "evt-1",
        event: {
          blindAvailabilityEnabled: false,
          collectEmails: false,
          dates: [Temporal.PlainDate.from("2026-01-01")],
          timeSeed: zdt("2026-01-01T09:00:00Z"),
          duration: durations.ONE_HOUR,
          daysOnly: false,
        },
        curGuestId: "",
        ownedGuestResponseLookupKeys: [],
        guestResponseLookupKey: "",
        days: [],
        times: [],
        curDate: zdt("2026-01-01T09:00:00Z"),
        curRespondent: "",
        curRespondents: [],
        curTimeslot: { dayIndex: -1, timeIndex: -1 },
        curTimeslotAvailability: { "user-1": true },
        respondents: [
          {
            _id: "user-1",
            firstName: "Ada",
            lastName: "Lovelace",
          } as never,
        ],
        parsedResponses: {
          "user-1": {
            user: {
              _id: "user-1",
              firstName: "Ada",
              lastName: "Lovelace",
            } as never,
            availability: new ZdtSet(),
            ifNeeded: new ZdtSet(),
            guest: false,
          },
        },
        isOwner: true,
        isGroup: false,
        showCalendarEvents: false,
        responsesFormatted: new ZdtMap<Set<string>>(),
        timezone: {
          value: UTC,
          offset: durations.ZERO,
          label: UTC,
          gmtString: "GMT",
        },
        hideIfNeeded: false,
        guestAddedAvailability: false,
        addingAvailabilityAsGuest: false,
      },
      global: {
        stubs: sharedRespondentsListStubs,
      },
    })

    expect(wrapper.text()).not.toContain("mdi-delete")
  })

  it("deletes a PostgreSQL respondent through the explicit responseId contract", async () => {
    isPhoneValue.value = false
    deleteMock.mockReset()
    deleteMock.mockResolvedValue(undefined)
    const previousStorage = globalThis.localStorage
    globalThis.localStorage = createLocalStorageMock({
      "timeful.eventVisitor.evt-1": "visitor-1",
      "timeful.selectedResponse.evt-1": "public-1",
    })

    try {
      const wrapper = mountOwnerDeleteFixture({ eventVisitorId: "visitor-1" })

      const rowDeleteButton = wrapper
        .findAll("button")
        .find((node) => node.text().includes("mdi-delete"))
      if (!rowDeleteButton) {
        throw new Error("Expected owner row delete action to be rendered")
      }
      await rowDeleteButton.trigger("click")

      const confirmButton = wrapper
        .findAll("button")
        .find((node) => node.text() === "Delete")
      if (!confirmButton) {
        throw new Error("Expected delete confirmation action to be rendered")
      }
      await confirmButton.trigger("click")
      await flushPromises()

      expect(deleteMock).toHaveBeenCalledWith(
        "/events/evt-1/response?eventVisitorId=visitor-1",
        { responseId: "public-1" },
      )
      expect(localStorage.getItem("timeful.selectedResponse.evt-1")).toBeNull()
      expect(wrapper.emitted("guestAvailabilityDeleted")).toEqual([["user-1"]])
      expect(wrapper.emitted("refreshEvent")).toHaveLength(1)
    } finally {
      globalThis.localStorage = previousStorage
      isPhoneValue.value = true
    }
  })

  it("keeps the legacy delete payload for MongoDB respondents", async () => {
    isPhoneValue.value = false
    deleteMock.mockReset()
    deleteMock.mockResolvedValue(undefined)

    try {
      const wrapper = mountOwnerDeleteFixture()

      const rowDeleteButton = wrapper
        .findAll("button")
        .find((node) => node.text().includes("mdi-delete"))
      if (!rowDeleteButton) {
        throw new Error("Expected owner row delete action to be rendered")
      }
      await rowDeleteButton.trigger("click")

      const confirmButton = wrapper
        .findAll("button")
        .find((node) => node.text() === "Delete")
      if (!confirmButton) {
        throw new Error("Expected delete confirmation action to be rendered")
      }
      await confirmButton.trigger("click")
      await flushPromises()

      expect(deleteMock).toHaveBeenCalledWith("/events/evt-1/response", {
        guest: false,
        userId: "user-1",
        name: "Ada",
        guestId: undefined,
      })
      expect(wrapper.emitted("guestAvailabilityDeleted")).toEqual([["user-1"]])
      expect(wrapper.emitted("refreshEvent")).toHaveLength(1)
    } finally {
      isPhoneValue.value = true
    }
  })
})

function mountOwnerDeleteFixture({
  eventVisitorId,
}: { eventVisitorId?: string } = {}) {
  const VBtnStub = {
    emits: ["click"],
    template: "<button @click=\"$emit('click', $event)\"><slot /></button>",
  }
  const VIconStub = {
    template: "<span><slot /></span>",
  }
  const VDialogStub = {
    template: "<div><slot /></div>",
  }

  return shallowMount(RespondentsList, {
    props: {
      eventId: "evt-1",
      event: {
        blindAvailabilityEnabled: false,
        collectEmails: false,
        dates: [Temporal.PlainDate.from("2026-01-01")],
        timeSeed: zdt("2026-01-01T09:00:00Z"),
        duration: durations.ONE_HOUR,
        daysOnly: false,
        eventVisitorId,
      },
      curGuestId: "",
      ownedGuestResponseLookupKeys: [],
      guestResponseLookupKey: "",
      days: [],
      times: [],
      curDate: zdt("2026-01-01T09:00:00Z"),
      curRespondent: "",
      curRespondents: [],
      curTimeslot: { dayIndex: -1, timeIndex: -1 },
      curTimeslotAvailability: { "user-1": true },
      respondents: [
        {
          _id: "user-1",
          firstName: "Ada",
          lastName: "Lovelace",
        } as never,
      ],
      parsedResponses: {
        "user-1": {
          user: {
            _id: "user-1",
            firstName: "Ada",
            lastName: "Lovelace",
          } as never,
          availability: new ZdtSet(),
          ifNeeded: new ZdtSet(),
          guest: false,
          publicId: "public-1",
          canEdit: true,
        },
      },
      isOwner: true,
      isGroup: false,
      showCalendarEvents: false,
      responsesFormatted: new ZdtMap<Set<string>>(),
      timezone: {
        value: UTC,
        offset: durations.ZERO,
        label: UTC,
        gmtString: "GMT",
      },
      showBestTimes: false,
      hideIfNeeded: false,
      collapseDisabledTimes: true,
      guestAddedAvailability: false,
      addingAvailabilityAsGuest: false,
    },
    global: {
      stubs: {
        ...sharedRespondentsListStubs,
        "v-btn": VBtnStub,
        "v-card": passThroughStub,
        "v-card-actions": passThroughStub,
        "v-card-text": passThroughStub,
        "v-card-title": passThroughStub,
        "v-dialog": VDialogStub,
        "v-icon": VIconStub,
      },
    },
  })
}

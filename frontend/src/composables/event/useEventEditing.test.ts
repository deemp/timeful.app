import { computed, ref } from "vue"
import { beforeEach, describe, expect, it, vi } from "vitest"
import { durations } from "@/constants"
import type { Event } from "@/types"
import type { ScheduleOverlapInstance } from "./types"
import { useEventEditing } from "./useEventEditing"

const { showInfoMock, showErrorMock } = vi.hoisted(() => ({
  showInfoMock: vi.fn(),
  showErrorMock: vi.fn(),
}))

vi.mock("@/stores/main", () => ({
  useMainStore: () => ({
    showInfo: showInfoMock,
    showError: showErrorMock,
  }),
}))

describe("useEventEditing", () => {
  beforeEach(() => {
    showInfoMock.mockReset()
    showErrorMock.mockReset()
  })

  it("keeps the guest display name when saving edits for token-owned guest responses", async () => {
    const submitAvailability = vi.fn().mockResolvedValue(true)
    const resetCurUserAvailability = vi.fn()
    const stopEditing = vi.fn()
    const scheduleOverlapRef = ref<ScheduleOverlapInstance | null>({
      editing: false,
      scheduling: false,
      allowScheduleEvent: false,
      respondentSaveAllowed: true,
      unsavedChanges: false,
      curTimezone: {
        value: "UTC",
        offset: durations.ZERO,
        label: "UTC",
        gmtString: "GMT+0",
      },
      showBestTimes: false,
      hideIfNeeded: false,
      collapseDisabledTimes: true,
      showCalendarEvents: false,
      startCalendarOnMonday: false,
      overlayAvailability: false,
      showOverlayAvailabilityToggle: false,
      selectedGuestRespondent: undefined,
      ownedGuestResponses: [],
      pageHasChanged: true,
      hasPages: false,
      respondents: [],
      state: "edit_availability",
      submitAvailability,
      resetCurUserAvailability,
      stopEditing,
      startEditing: vi.fn(),
      updateShowBestTimes: vi.fn(),
      updateHideIfNeeded: vi.fn(),
      updateCollapseDisabledTimes: vi.fn(),
      updateShowCalendarEvents: vi.fn(),
      updateStartCalendarOnMonday: vi.fn(),
      updateOverlayAvailability: vi.fn(),
      clearSelectedGuestOwnership: vi.fn(),
      selectGuestOwnership: vi.fn(),
      editOwnedGuestAvailability: vi.fn(),
      setAvailabilityAutomatically: vi.fn(),
      deleteAvailability: vi.fn(),
      resetSignUpForm: vi.fn(),
      submitNewSignUpBlocks: vi.fn().mockResolvedValue(true),
      populateUserAvailability: vi.fn(),
      scheduleEvent: vi.fn(),
      cancelScheduleEvent: vi.fn(),
      confirmScheduleEvent: vi.fn(),
      getAllValidTimeRanges: vi.fn(() => new Map()),
    })

    const editing = useEventEditing({
      event: ref({
        _id: "evt-1",
        responses: {
          "6c8b01a4b5b0ceae94fe0cd1": {
            name: "Ada",
            email: "",
            guestId: "6c8b01a4b5b0ceae94fe0cd1",
            guestEditPolicy: "open",
          },
        },
      } as Event),
      eventId: ref("evt-1"),
      authUser: computed(() => null),
      scheduleOverlapRef,
      isSignUp: computed(() => false),
      isGroup: computed(() => false),
      userHasResponded: computed(() => false),
      curGuestId: ref("6c8b01a4b5b0ceae94fe0cd1"),
      addingAvailabilityAsGuest: ref(false),
      calendarPermissionGranted: ref(false),
      refreshEvent: vi.fn().mockResolvedValue(undefined),
    })

    await editing.saveChanges()

    expect(submitAvailability).toHaveBeenCalledWith({
      name: "Ada",
      email: "",
      allowOthersToEdit: true,
    })
    expect(showInfoMock).toHaveBeenCalledWith("Changes saved!")
    expect(resetCurUserAvailability).toHaveBeenCalledTimes(1)
    expect(stopEditing).toHaveBeenCalledTimes(1)
  })

  it("does not show a success toast when respondent submission is rejected", async () => {
    const submitAvailability = vi.fn().mockResolvedValue(false)
    const scheduleOverlapRef = ref<ScheduleOverlapInstance | null>({
      editing: false,
      scheduling: false,
      allowScheduleEvent: false,
      respondentSaveAllowed: false,
      unsavedChanges: false,
      curTimezone: {
        value: "UTC",
        offset: durations.ZERO,
        label: "UTC",
        gmtString: "GMT+0",
      },
      showBestTimes: false,
      hideIfNeeded: false,
      collapseDisabledTimes: true,
      showCalendarEvents: false,
      startCalendarOnMonday: false,
      overlayAvailability: false,
      showOverlayAvailabilityToggle: false,
      selectedGuestRespondent: undefined,
      ownedGuestResponses: [],
      pageHasChanged: true,
      hasPages: false,
      respondents: [],
      state: "edit_availability",
      submitAvailability,
      resetCurUserAvailability: vi.fn(),
      stopEditing: vi.fn(),
      startEditing: vi.fn(),
      updateShowBestTimes: vi.fn(),
      updateHideIfNeeded: vi.fn(),
      updateCollapseDisabledTimes: vi.fn(),
      updateShowCalendarEvents: vi.fn(),
      updateStartCalendarOnMonday: vi.fn(),
      updateOverlayAvailability: vi.fn(),
      clearSelectedGuestOwnership: vi.fn(),
      selectGuestOwnership: vi.fn(),
      editOwnedGuestAvailability: vi.fn(),
      setAvailabilityAutomatically: vi.fn(),
      deleteAvailability: vi.fn(),
      resetSignUpForm: vi.fn(),
      submitNewSignUpBlocks: vi.fn().mockResolvedValue(true),
      populateUserAvailability: vi.fn(),
      scheduleEvent: vi.fn(),
      cancelScheduleEvent: vi.fn(),
      confirmScheduleEvent: vi.fn(),
      getAllValidTimeRanges: vi.fn(() => new Map()),
    })

    const editing = useEventEditing({
      event: ref({
        _id: "evt-1",
        responses: {},
      } as Event),
      eventId: ref("evt-1"),
      authUser: computed(() => {
        return { _id: "user-1" }
      }),
      scheduleOverlapRef,
      isSignUp: computed(() => false),
      isGroup: computed(() => false),
      userHasResponded: computed(() => true),
      curGuestId: ref(""),
      addingAvailabilityAsGuest: ref(false),
      calendarPermissionGranted: ref(false),
      refreshEvent: vi.fn().mockResolvedValue(undefined),
    })

    await editing.saveChanges()

    expect(submitAvailability).toHaveBeenCalledTimes(1)
    expect(showInfoMock).not.toHaveBeenCalled()
  })

  it("keeps the selected visitor response when a responded PostgreSQL viewer edits availability", () => {
    const clearSelectedGuestOwnership = vi.fn()
    const startEditing = vi.fn()
    const setAvailabilityAutomatically = vi.fn()
    const scheduleOverlapRef = ref({
      clearSelectedGuestOwnership,
      startEditing,
      setAvailabilityAutomatically,
    } as unknown as ScheduleOverlapInstance)

    const editing = useEventEditing({
      event: ref({
        _id: "evt-1",
        eventVisitorId: "visitor-1",
        responses: {},
      } as Event),
      eventId: ref("evt-1"),
      authUser: computed(() => ({ _id: "user-1" })),
      scheduleOverlapRef,
      isSignUp: computed(() => false),
      isGroup: computed(() => true),
      userHasResponded: computed(() => true),
      curGuestId: ref("response-1"),
      addingAvailabilityAsGuest: ref(false),
      calendarPermissionGranted: ref(true),
      refreshEvent: vi.fn().mockResolvedValue(undefined),
    })

    editing.addAvailability()

    expect(clearSelectedGuestOwnership).not.toHaveBeenCalled()
    expect(startEditing).toHaveBeenCalledTimes(1)
    expect(setAvailabilityAutomatically).not.toHaveBeenCalled()
  })

  it("clears the selected visitor response when an unresponded PostgreSQL viewer adds availability", () => {
    const clearSelectedGuestOwnership = vi.fn()
    const startEditing = vi.fn()
    const setAvailabilityAutomatically = vi.fn()
    const scheduleOverlapRef = ref({
      clearSelectedGuestOwnership,
      startEditing,
      setAvailabilityAutomatically,
    } as unknown as ScheduleOverlapInstance)

    const editing = useEventEditing({
      event: ref({
        _id: "evt-1",
        eventVisitorId: "visitor-1",
        responses: {},
      } as Event),
      eventId: ref("evt-1"),
      authUser: computed(() => ({ _id: "user-1" })),
      scheduleOverlapRef,
      isSignUp: computed(() => false),
      isGroup: computed(() => true),
      userHasResponded: computed(() => false),
      curGuestId: ref(""),
      addingAvailabilityAsGuest: ref(false),
      calendarPermissionGranted: ref(true),
      refreshEvent: vi.fn().mockResolvedValue(undefined),
    })

    editing.addAvailability()

    expect(clearSelectedGuestOwnership).toHaveBeenCalledTimes(1)
    expect(startEditing).toHaveBeenCalledTimes(1)
  })
})

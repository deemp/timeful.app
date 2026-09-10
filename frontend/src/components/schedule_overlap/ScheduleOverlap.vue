<template>
  <span>
    <Tooltip
      :content="visibleTooltipContent"
      :position-override="tooltipPosition"
      :force-visible="Boolean(isPhone && selectedTooltipSlot)"
    >
      <div
        class="tw:select-none"
        :class="isPhone ? 'tw:py-2' : 'tw:py-4'"
        style="-webkit-touch-callout: none"
      >
        <ToolRow
          v-if="isPhone && !calendarOnly"
          class="tw:px-4"
          :tool-row="toolRowViewModel"
          compact
          mobile-row
        />

        <div
          class="schedule-overlap-layout tw:flex"
          :class="isPhone ? 'tw:flex-col' : 'tw:flex-row'"
        >
          <div
            class="schedule-overlap-layout__grid-pane tw:flex tw:grow tw:px-4"
          >
            <ScheduleOverlapDaysOnlyGrid
              v-if="event.daysOnly"
              :days-only-grid="daysOnlyGridViewModel"
            />
            <template v-else>
              <ScheduleOverlapTimeGrid :timed-grid="timedGridViewModel" />
            </template>
          </div>

          <!-- Right hand side content -->

          <ScheduleOverlapSidebar
            v-if="!calendarOnly"
            ref="sidebarRef"
            :sidebar="sidebarViewModel"
            v-on="sidebarListeners"
          />
        </div>

        <div
          v-if="mobileEditingBottomClearance"
          aria-hidden="true"
          class="schedule-overlap__mobile-editing-clearance"
          :style="{ height: mobileEditingBottomClearance }"
        />

        <ScheduleOverlapMobileOverlay
          v-if="isPhone && !calendarOnly"
          :overlay="mobileOverlayViewModel"
          @overlay-height-change="onMobileOverlayHeightChange"
          v-on="mobileOverlayListeners"
        />
      </div>
    </Tooltip>
  </span>
</template>

<script setup lang="ts">
import { ref, shallowRef, computed, nextTick, watch, watchEffect } from "vue"
import { useDisplay } from "vuetify"
import { Temporal } from "temporal-polyfill"
import {
  ZdtSet,
  getTimezoneReferenceDateForEvent,
  normalizeOptionalTimezone,
} from "@/utils"
import {
  availabilityTypes,
  eventTypes,
  UTC,
  type AvailabilityType,
} from "@/constants"
import { isSignedInOwner } from "@/composables/event/eventOwnership"
import { useMainStore } from "@/stores/main"
import ScheduleOverlapDaysOnlyGrid from "./ScheduleOverlapDaysOnlyGrid.vue"
import ScheduleOverlapMobileOverlay from "./ScheduleOverlapMobileOverlay.vue"
import ScheduleOverlapSidebar from "./ScheduleOverlapSidebar.vue"
import ScheduleOverlapTimeGrid from "./ScheduleOverlapTimeGrid.vue"
import ToolRow from "./ToolRow.vue"
import Tooltip from "../Tooltip.vue"
import {
  formatTooltipContent,
  getSignUpBlockStyle,
} from "./scheduleOverlapRendering"
import { useCalendarGrid } from "@/composables/schedule_overlap/useCalendarGrid"
import { useCalendarEvents } from "@/composables/schedule_overlap/useCalendarEvents"
import { useAvailabilityData } from "@/composables/schedule_overlap/useAvailabilityData"
import { useDragPaint } from "@/composables/schedule_overlap/useDragPaint"
import { useEventScheduling } from "@/composables/schedule_overlap/useEventScheduling"
import { useSignUpForm } from "@/composables/schedule_overlap/useSignUpForm"
import { useScheduleOverlapUI } from "@/composables/schedule_overlap/useScheduleOverlapUI"
import { useOwnedTimezone } from "@/composables/timezone/useOwnedTimezone"
import type { SpecificTimesEditDraft } from "@/composables/event/specificTimesEditDraft"
import { useScheduleOverlapController } from "./useScheduleOverlapController"
import {
  useScheduleOverlapPreferences,
  type UseScheduleOverlapPreferencesReturn,
} from "./useScheduleOverlapPreferences"
import { useScheduleOverlapViewModels } from "./useScheduleOverlapViewModels"
import { useTimedGridPresentation } from "./useTimedGridPresentation"
import { useTimedGridInteractions } from "./useTimedGridInteractions"
import { useGuestAvailabilityActions } from "./useGuestAvailabilityActions"
import { states } from "@/composables/schedule_overlap/types"
import type {
  FetchedResponse,
  RowCol,
  Timezone,
  ScheduleOverlapState,
  ScheduleOverlapEvent,
  NormalizedCalendarEvent,
  CalendarEventsByDay,
  CalendarEventsMap,
  SignUpBlockLite,
} from "@/composables/schedule_overlap/types"
import type {
  ScheduleOverlapDaysOnlyGridActions,
  ScheduleOverlapTimeGridActions,
  ScheduleOverlapToolRowActions,
} from "./scheduleOverlapViewModelContracts"
import type { ScheduleOverlapSidebarExposed as ScheduleOverlapSidebarContract } from "./scheduleOverlapContracts"
import {
  readCollapseDisabledTimesPreference,
  writeCollapseDisabledTimesPreference,
} from "@/composables/schedule_overlap/scheduleOverlapStorage"
import { SCHEDULE_OVERLAP_COMPACT_DESKTOP_BREAKPOINT } from "./scheduleOverlapBreakpoints"

// ── Props / Emits ──────────────────────────────────────────────────────
const props = withDefaults(
  defineProps<{
    event: ScheduleOverlapEvent
    fromEditEvent?: boolean
    fromCreateSpecificTimesDraft?: boolean
    specificTimesEntryDraft?: SpecificTimesEditDraft
    loadingCalendarEvents?: boolean
    calendarEventsMap?: CalendarEventsMap
    sampleCalendarEventsByDay?: CalendarEventsByDay
    calendarPermissionGranted?: boolean
    weekOffset?: number
    alwaysShowCalendarEvents?: boolean
    noEventNames?: boolean
    calendarOnly?: boolean
    interactable?: boolean
    showSnackbar?: boolean
    animateTimeslotAlways?: boolean
    showHintText?: boolean
    curGuestId?: string
    addingAvailabilityAsGuest?: boolean
    initialTimezone?: Timezone
    calendarAvailabilities?: Record<string, NormalizedCalendarEvent[]>
    refreshEventFn?: () => Promise<void>
  }>(),
  {
    fromEditEvent: false,
    fromCreateSpecificTimesDraft: false,
    specificTimesEntryDraft: undefined,
    loadingCalendarEvents: false,
    calendarEventsMap: () => ({}),
    calendarPermissionGranted: false,
    weekOffset: 0,
    alwaysShowCalendarEvents: false,
    noEventNames: false,
    sampleCalendarEventsByDay: () => [],
    calendarOnly: false,
    interactable: true,
    showSnackbar: true,
    animateTimeslotAlways: false,
    showHintText: true,
    curGuestId: "",
    addingAvailabilityAsGuest: false,
    initialTimezone: undefined,
    calendarAvailabilities: () => ({}),
    refreshEventFn: undefined,
  },
)

const emit = defineEmits<{
  "update:weekOffset": [n: number]
  highlightAvailabilityBtn: []
  addAvailabilityAsGuest: []
  setCurGuestId: [id: string]
  refreshEvent: []
  signUpForBlock: [block: SignUpBlockLite]
  addAvailability: []
  deleteAvailability: []
  guestAvailabilityDeleted: [userId: string]
}>()

// ── Store / Vuetify ────────────────────────────────────────────────────
const mainStore = useMainStore()
const { width } = useDisplay()
const isPhone = computed(
  () => width.value < SCHEDULE_OVERLAP_COMPACT_DESKTOP_BREAKPOINT,
)
const isSignUp = computed(() => Boolean(props.event.isSignUpForm))
const isGroup = computed(() => props.event.type === eventTypes.GROUP)
const isOwner = computed(() => isSignedInOwner(props.event, mainStore.authUser))
const authUser = computed(() => mainStore.authUser)

const cloneScheduleOverlapEvent = (
  event: ScheduleOverlapEvent,
): ScheduleOverlapEvent => ({
  ...event,
  dates: event.dates ? [...event.dates] : event.dates,
  times: event.times ? [...event.times] : event.times,
})

const eventRef = shallowRef<ScheduleOverlapEvent>(
  cloneScheduleOverlapEvent(props.event),
)
const eventReadonly = computed(() => eventRef.value)
watch(
  () => props.event,
  (event) => {
    eventRef.value = cloneScheduleOverlapEvent(event)
  },
)
const weekOffsetRef = computed(() => props.weekOffset)
const scheduleTimezoneReferenceDate = computed(() =>
  getTimezoneReferenceDateForEvent(eventRef.value, props.weekOffset),
)
const shownInTimezoneStorageKey = computed(
  () => `shownInTimezone_${props.event._id ?? ""}`,
)
const scheduleOverlapPreferences: UseScheduleOverlapPreferencesReturn =
  useScheduleOverlapPreferences({
    eventId: computed(() => props.event._id ?? ""),
    event: eventReadonly,
  })
const guestNameKey = scheduleOverlapPreferences.guestNameKey
const ownedGuestResponses = scheduleOverlapPreferences.ownedGuestResponses
const guestOwnership = scheduleOverlapPreferences.guestOwnership
const guestName = scheduleOverlapPreferences.guestName
const guestResponseLookupKey = scheduleOverlapPreferences.guestResponseLookupKey
const showBestTimes = scheduleOverlapPreferences.showBestTimes
const setGuestName = scheduleOverlapPreferences.setGuestName
const setGuestOwnership = scheduleOverlapPreferences.setGuestOwnership
const selectGuestOwnership = scheduleOverlapPreferences.selectGuestOwnership
const removeGuestOwnership = scheduleOverlapPreferences.removeGuestOwnership
const clearSelectedGuestOwnership =
  scheduleOverlapPreferences.clearSelectedGuestOwnership
const getOwnedGuestOwnership = scheduleOverlapPreferences.getOwnedGuestOwnership
const collapseDisabledTimesPreference = ref(
  readCollapseDisabledTimesPreference(),
)
watch(collapseDisabledTimesPreference, (value) => {
  writeCollapseDisabledTimesPreference(value)
})

const {
  timezone: curTimezone,
  modified: timezoneModified,
  setTimezone: setCurTimezone,
  resetTimezone: resetCurTimezone,
} = useOwnedTimezone({
  initialTimezone: computed(() =>
    normalizeOptionalTimezone(props.initialTimezone),
  ),
  referenceDate: scheduleTimezoneReferenceDate,
  storageKey: shownInTimezoneStorageKey.value,
})
const state = ref<ScheduleOverlapState>(states.BEST_TIMES)
const defaultState = computed<ScheduleOverlapState>(() =>
  showBestTimes.value ? states.BEST_TIMES : states.HEATMAP,
)
const availabilityType = ref<AvailabilityType>(availabilityTypes.AVAILABLE)
const allowDrag = computed(
  () =>
    state.value === states.EDIT_AVAILABILITY ||
    state.value === states.EDIT_SIGN_UP_BLOCKS ||
    state.value === states.SCHEDULE_EVENT ||
    state.value === states.SET_SPECIFIC_TIMES,
)
const dragging = ref(false)
const dragStart = ref<RowCol | null>(null)
const dragCur = ref<RowCol | null>(null)
const fetchedResponses = ref<Record<string, FetchedResponse | undefined>>({})
const loadingResponses = ref({
  loading: false,
  lastFetched: Temporal.Now.instant().toZonedDateTimeISO(UTC),
})

// Template refs
const sidebarRef = ref<ScheduleOverlapSidebarContract | null>(null)
const optionsSectionRef = ref<HTMLElement | null>(null)
const respondentsListRef = ref<HTMLElement | null>(null)
const mobileOverlayHeight = ref(0)

const onMobileOverlayHeightChange = (height: number) => {
  mobileOverlayHeight.value = height
}

watchEffect(() => {
  optionsSectionRef.value = sidebarRef.value?.optionsSectionEl ?? null
  respondentsListRef.value = sidebarRef.value?.respondentsPanelEl ?? null
})

// ── 1. useCalendarGrid ─────────────────────────────────────────────────
const grid = useCalendarGrid({
  event: eventRef,
  weekOffset: weekOffsetRef,
  curTimezone,
  state,
  isPhone,
})

const nextPage = (e?: Event) => {
  ;(e as MouseEvent | undefined)?.stopImmediatePropagation()
  grid.nextPage(e ?? new Event("click"), (n) => {
    emit("update:weekOffset", n)
  })
}
const prevPage = (e?: Event) => {
  ;(e as MouseEvent | undefined)?.stopImmediatePropagation()
  grid.prevPage(e ?? new Event("click"), (n) => {
    emit("update:weekOffset", n)
  })
}
const emitWeekOffsetUpdate = (value: number) => {
  emit("update:weekOffset", value)
}

const emitSignUpForBlock = (block: SignUpBlockLite) => {
  emit("signUpForBlock", block)
}
// ── 2. useCalendarEvents ───────────────────────────────────────────────
const calEvents = useCalendarEvents({
  event: eventRef,
  weekOffset: weekOffsetRef,
  curTimezone,
  calendarEventsMap: computed(() => props.calendarEventsMap),
  sampleCalendarEventsByDay: computed(() => props.sampleCalendarEventsByDay),
  calendarAvailabilities: computed(() => props.calendarAvailabilities),
  addingAvailabilityAsGuest: computed(() => props.addingAvailabilityAsGuest),
  calendarOnly: computed(() => props.calendarOnly),
  allDays: grid.allDays,
  times: grid.times,
  timeslotDuration: grid.timeslotDuration,
  timezoneOffset: grid.timezoneOffset,
  isGroup,
  guestOwnership,
  getDateFromDayTimeIndex: grid.getDateFromDayTimeIndex,
  fetchedResponses,
  loadingResponses,
})

// ── 3. useAvailabilityData ─────────────────────────────────────────────
const avail = useAvailabilityData({
  event: eventRef,
  weekOffset: weekOffsetRef,
  state,
  fetchedResponses,
  loadingResponses,
  curGuestId: computed(() => props.curGuestId),
  addingAvailabilityAsGuest: computed(() => props.addingAvailabilityAsGuest),
  showSnackbar: computed(() => props.showSnackbar),
  calendarPermissionGranted: computed(() => props.calendarPermissionGranted),
  loadingCalendarEvents: computed(() => props.loadingCalendarEvents),
  allDays: grid.allDays,
  days: grid.days,
  times: grid.times,
  splitTimes: grid.splitTimes,
  timeslotDuration: grid.timeslotDuration,
  page: grid.page,
  maxDaysPerPage: grid.maxDaysPerPage,
  isGroup,
  isOwner,
  guestNameKey,
  guestName,
  guestOwnership,
  guestResponseLookupKey,
  ownedGuestResponses,
  setGuestName,
  setGuestOwnership,
  selectGuestOwnership,
  removeGuestOwnership,
  getOwnedGuestOwnership,
  getDateFromRowCol: grid.getDateFromRowCol,
  getDateFromDayTimeIndex: grid.getDateFromDayTimeIndex,
  getTimedCellState: grid.getTimedCellState,
  calendarEventsByDay: calEvents.calendarEventsByDay,
  groupCalendarEventsByDay: calEvents.groupCalendarEventsByDay,
  bufferTime: calEvents.bufferTime,
  workingHours: calEvents.workingHours,
  sharedCalendarAccounts: calEvents.sharedCalendarAccounts,
  getAvailabilityFromCalendarEvents:
    calEvents.getAvailabilityFromCalendarEvents,
  refreshEvent: () => {
    emit("refreshEvent")
  },
})

// ── 4. useEventScheduling ──────────────────────────────────────────────
const eventSched = useEventScheduling({
  event: eventRef,
  weekOffset: weekOffsetRef,
  curTimezone,
  state,
  defaultState,
  splitTimes: grid.splitTimes,
  timeslotDuration: grid.timeslotDuration,
  timeslotHeight: grid.timeslotHeight,
  timezoneOffset: grid.timezoneOffset,
  isWeekly: grid.isWeekly,
  isGroup,
  isSpecificTimes: grid.isSpecificTimes,
  getDateFromRowCol: grid.getDateFromRowCol,
  numDisplayedDays: computed(() => grid.days.value.length),
  getMinMaxHoursFromTimes: grid.getMinMaxHoursFromTimes,
  dragging,
  dragStart,
  dragCur,
  tempTimes: avail.tempTimes,
  respondents: avail.respondents,
  refreshEvent: props.refreshEventFn,
})

// ── 5. useSignUpForm ───────────────────────────────────────────────────
const signUpForm = useSignUpForm({
  event: eventRef,
  isSignUp,
  days: grid.days,
  isOwner,
  dragStart,
})

// ── 6. useDragPaint ────────────────────────────────────────────────────
const drag = useDragPaint({
  event: eventRef,
  state,
  isSignUp,
  weekOffset: weekOffsetRef,
  dragging,
  dragStart,
  dragCur,
  curTimeslot: avail.curTimeslot,
  splitTimes: grid.splitTimes,
  times: grid.times,
  days: grid.days,
  monthDays: grid.monthDays,
  monthDayIncluded: grid.monthDayIncluded,
  columnOffsets: grid.columnOffsets,
  timeslot: grid.timeslot,
  availability: avail.availability,
  ifNeeded: avail.ifNeeded,
  tempTimes: avail.tempTimes,
  availabilityType,
  signUpBlocksByDay: signUpForm.signUpBlocksByDay,
  signUpBlocksToAddByDay: signUpForm.signUpBlocksToAddByDay,
  manualAvailability: avail.manualAvailability,
  curScheduledEvent: eventSched.curScheduledEvent,
  maxSignUpBlockRowSize: signUpForm.maxSignUpBlockRowSize,
  allowDrag,
  getDateFromRowCol: grid.getDateFromRowCol,
  getAvailabilityForColumn: avail.getAvailabilityForColumn,
  createSignUpBlock: signUpForm.createSignUpBlock,
  scrollToSignUpBlock: (id: string) =>
    sidebarRef.value?.scrollToSignUpBlock?.(id),
})

// ── 7. useScheduleOverlapUI ────────────────────────────────────────────
const guestAddedAvailability = computed<boolean>(() =>
  ownedGuestResponses.value.some((ownedGuest) =>
    Object.values(avail.parsedResponses.value).some((response) =>
      response.guestOwnershipMode === "token"
        ? response.guestId === ownedGuest.lookupKey
        : response.user._id === ownedGuest.lookupKey,
    ),
  ),
)

const ownedGuestResponseLookupKeys = computed<Set<string>>(
  () => new Set(ownedGuestResponses.value.map((record) => record.lookupKey)),
)

const ui = useScheduleOverlapUI({
  isPhone,
  isSignUp,
  isGroup,
  showHintText: computed(() => props.showHintText),
  state,
  showBestTimes,
  defaultState,
  allowDrag,
  availabilityType,
  parsedResponses: avail.parsedResponses,
  curTimeslot: avail.curTimeslot,
  endDrag: drag.endDrag,
  timeslotSelected: avail.timeslotSelected,
  curTimeslotAvailability: avail.curTimeslotAvailability,
  curTimeslotInactive: avail.curTimeslotInactive,
  curTimeslotCollapsed: avail.curTimeslotCollapsed,
  respondents: avail.respondents,
  curGuestId: computed(() => props.curGuestId),
  guestName,
  ownedGuestResponseLookupKeys,
  guestResponseLookupKey,
  guestAddedAvailability,
  optionsSectionRef,
  respondentsListRef,
})

// ── Destructure composable returns for template access ─────────────────
const {
  page,
  mobileNumDays,
  pageHasChanged,
  timeslot: _timeslot,
  calendarScrollLeft: _calendarScrollLeft,
  calendarMaxScroll: _calendarMaxScroll,
  timeType,
  startCalendarOnMonday,
  isSpecificDates: _isSpecificDates,
  isWeekly: _isWeekly,
  isSpecificTimes,
  daysOfWeek: _daysOfWeek,
  timezoneReferenceDate: _timezoneReferenceDate,
  dayOffset: _dayOffset,
  timeslotDuration,
  timeslotHeight: _timeslotHeight,
  splitTimes: _splitTimes,
  times: _times,
  allDays,
  days: _days,
  monthDays: _monthDays,
  monthDayIncluded: _monthDayIncluded,
  curMonthText: _curMonthText,
  columnOffsets: _columnOffsets,
  showLeftZigZag: _showLeftZigZag,
  showRightZigZag: _showRightZigZag,
  hasNextPage: _hasNextPage,
  hasPrevPage: _hasPrevPage,
  hasPages: _hasPages,
  maxDaysPerPage: _maxDaysPerPage,
  getDateFromDayHoursOffset: _getDateFromDayHoursOffset,
  getDateFromDayTimeIndex: _getDateFromDayTimeIndex,
  getDisplayDateFromRowCol,
  getDateFromRowCol,
  setTimeslotSize,
  onResize,
  onCalendarScroll,
  getLocalTimezone: _getLocalTimezone,
  getMinMaxHoursFromTimes: _getMinMaxHoursFromTimes,
} = grid

const {
  sharedCalendarAccounts: _sharedCalendarAccounts,
  bufferTime,
  workingHours,
  hasRefreshedAuthUser: _hasRefreshedAuthUser,
  calendarEventsByDay,
  groupCalendarEventsByDay: _groupCalendarEventsByDay,
  initSharedCalendarAccounts,
  toggleCalendarAccount: _toggleCalendarAccount,
  toggleSubCalendarAccount: _toggleSubCalendarAccount,
  getAvailabilityFromCalendarEvents: _getAvailabilityFromCalendarEvents,
  fetchResponses,
  refreshAuthUser: _refreshAuthUser,
} = calEvents

// Wrapper functions to handle optional payload fields from CalendarAccounts component
const toggleCalendarAccount = (payload: {
  email?: string
  calendarType?: string
  enabled: boolean
}) => {
  if (payload.email && payload.calendarType) {
    _toggleCalendarAccount({
      email: payload.email,
      calendarType: payload.calendarType,
      enabled: payload.enabled,
    })
  }
}

const toggleSubCalendarAccount = (payload: {
  email?: string
  calendarType?: string
  subCalendarId: string | number
  enabled: boolean
}) => {
  if (payload.email && payload.calendarType) {
    _toggleSubCalendarAccount({
      email: payload.email,
      calendarType: payload.calendarType,
      subCalendarId: String(payload.subCalendarId),
      enabled: payload.enabled,
    })
  }
}

const {
  availability,
  ifNeeded,
  tempTimes,
  availabilityAnimEnabled,
  availabilityAnimTimeouts: _availabilityAnimTimeouts,
  unsavedChanges,
  hideIfNeeded,
  manualAvailability: _manualAvailability,
  responsesFormatted: _responsesFormatted,
  curTimeslot: _curTimeslot,
  curTimeslotAvailability,
  curTimeslotInactive,
  timeslotSelected,
  availabilityArray: _availabilityArray,
  ifNeededArray: _ifNeededArray,
  parsedResponses,
  respondents,
  respondentSaveAllowed,
  userHasResponded,
  max: _max,
  getRespondentsForHoursOffset: _getRespondentsForHoursOffset,
  getResponsesFormatted,
  populateUserAvailability,
  resetCurUserAvailability,
  animateAvailability: _animateAvailability,
  stopAvailabilityAnim,
  setAvailabilityAutomatically: _setAvailabilityAutomatically,
  reanimateAvailability,
  isTouched: _isTouched,
  getAvailabilityForColumn: _getAvailabilityForColumn,
  getManualAvailabilityDow: _getManualAvailabilityDow,
  curRespondentsMaxFor,
  showAvailability,
  submitAvailability: _submitAvailability,
  deleteAvailability: _deleteAvailability,
  getAllValidTimeRanges: _getAllValidTimeRanges,
} = avail

const {
  curScheduledEvent,
  savedScheduledEvent: _savedScheduledEvent,
  allowScheduleEvent,
  scheduledEventStyle: _scheduledEventStyle,
  signUpBlockBeingDraggedStyle: _signUpBlockBeingDraggedStyle,
  scheduleEvent,
  cancelScheduleEvent,
  confirmScheduleEvent,
  clearScheduledEvent,
  saveTempTimes,
} = eventSched

const {
  signUpBlocksByDay: _signUpBlocksByDay,
  signUpBlocksToAddByDay: _signUpBlocksToAddByDay,
  newSignUpBlockName: _newSignUpBlockName,
  maxSignUpBlockRowSize: _maxSignUpBlockRowSize,
  alreadyRespondedToSignUpForm: _alreadyRespondedToSignUpForm,
  createSignUpBlock: _createSignUpBlock,
  editSignUpBlock,
  deleteSignUpBlock,
  resetSignUpForm: _resetSignUpForm,
  resetSignUpBlocksToAddByDay: _resetSignUpBlocksToAddByDay,
  submitNewSignUpBlocks: _submitNewSignUpBlocks,
  handleSignUpBlockClick,
} = signUpForm

const {
  normalizeXY: _normalizeXY,
  clampRow: _clampRow,
  clampCol: _clampCol,
  getRowColFromXY: _getRowColFromXY,
  startDrag,
  moveDrag,
  endDrag,
} = drag

const {
  showCalendarEvents,
  overlayAvailability,
  deleteAvailabilityDialog: _deleteAvailabilityDialog,
  calendarOptionsDialog,
  editGuestNameDialog,
  newGuestName,
  tooltipContent,
  optionsVisible: _optionsVisible,
  scrolledToRespondents: _scrolledToRespondents,
  delayedShowStickyRespondents,
  delayedShowStickyRespondentsTimeout,
  hintState: _hintState,
  curRespondent: _curRespondent,
  curRespondents: _curRespondents,
  editing,
  scheduling: _scheduling,
  curRespondentsSet,
  rightSideWidth: _rightSideWidth,
  showStickyRespondents: _showStickyRespondents,
  hintStateLocalStorageKey: _hintStateLocalStorageKey,
  hintText: _hintText,
  hintClosed: _hintClosed,
  hintTextShown: _hintTextShown,
  showOverlayAvailabilityToggle: _showOverlayAvailabilityToggle,
  selectedGuestRespondent: _selectedGuestRespondent,
  canEditGuestName: _canEditGuestName,
  mouseOverRespondent,
  mouseLeaveRespondent,
  clickRespondent,
  deselectRespondents,
  isGuest: _isGuest,
  checkElementsVisible,
  onScroll,
  onShowBestTimesChange,
  updateOverlayAvailability,
  closeHint,
} = ui

useScheduleOverlapController({
  event: eventReadonly,
  fromEditEvent: computed(() => props.fromEditEvent),
  fromCreateSpecificTimesDraft: computed(
    () => props.fromCreateSpecificTimesDraft,
  ),
  specificTimesEntryDraft: computed(() => props.specificTimesEntryDraft),
  calendarOnly: computed(() => props.calendarOnly),
  weekOffset: weekOffsetRef,
  isGroup,
  isSpecificTimes,
  showBestTimes,
  state,
  availability,
  parsedResponses,
  respondents,
  curTimeslotAvailability,
  curTimeslotInactive,
  unsavedChanges,
  hideIfNeeded,
  page,
  allDays,
  mobileNumDays,
  tempTimes,
  calendarEventsByDay,
  bufferTime,
  workingHours,
  curScheduledEvent,
  delayedShowStickyRespondents,
  delayedShowStickyRespondentsTimeout,
  showStickyRespondents: ui.showStickyRespondents,
  authUser,
  setTimeslotSize,
  onResize,
  onScroll,
  deselectRespondents,
  resetSignUpForm: _resetSignUpForm,
  resetCurUserAvailability,
  initSharedCalendarAccounts,
  fetchResponses,
  reanimateAvailability,
  getResponsesFormatted,
  populateUserAvailability,
  checkElementsVisible,
  onShowBestTimesChange,
})

// ── Local computed ──────────────────────────────────────────────────────
const showLoader = computed(
  () =>
    ((isGroup.value || props.alwaysShowCalendarEvents || editing.value) &&
      props.loadingCalendarEvents) ||
    loadingResponses.value.loading,
)

const showCalendarOptions = computed(
  () =>
    !props.addingAvailabilityAsGuest &&
    props.calendarPermissionGranted &&
    (isGroup.value || !userHasResponded.value),
)

const curRespondentsMax = computed(() =>
  curRespondentsMaxFor(curRespondentsSet.value, allDays.value),
)

const formattedAttendees = computed(
  () =>
    props.event.attendees as
      | { email: string; declined?: boolean }[]
      | undefined,
)

const timedGridInteractions = useTimedGridInteractions({
  isPhone,
  daysOnly: computed(() => Boolean(props.event.daysOnly)),
  interactable: computed(() => props.interactable),
  dragging,
  dragCur,
  timeslotSelected,
  tooltipContent,
  startDrag: drag.startDrag,
  moveDrag: drag.moveDrag,
  endDrag: drag.endDrag,
  showAvailability,
  shouldHighlightAvailability: () =>
    state.value === defaultState.value &&
    ((!isPhone.value &&
      !(userHasResponded.value || guestAddedAvailability.value)) ||
      respondents.value.length === 0),
  highlightAvailability: () => {
    emit("highlightAvailabilityBtn")
  },
  getTooltipContent: (row, col) => {
    const date =
      getDateFromRowCol(row, col) ?? getDisplayDateFromRowCol(row, col)
    return date
      ? formatTooltipContent({
          date,
          curTimezone: curTimezone.value,
          timeslotDuration: timeslotDuration.value,
          timeType: timeType.value,
          isSpecificDates: grid.isSpecificDates.value,
        })
      : undefined
  },
  isSelectableSlot: (row, col) => Boolean(getDateFromRowCol(row, col)),
  clearSelectedSlot: () => {
    avail.resetCurTimeslot()
  },
  markCurTimeslotInactive: (collapsed?: boolean) => {
    avail.markCurTimeslotInactive(collapsed)
  },
  resetGridOutside: () => {
    ui.resetCurTimeslot()
  },
  deselectGridOutside: () => {
    ui.deselectRespondentsSelection()
  },
})
const {
  selectedTooltipSlot,
  tooltipPosition,
  visibleTooltipContent,
  getTimeslotVon,
  markCollapsedRowInactive,
  markSplitGapOutside,
  clickSplitGapOutside,
  startTimedGridDrag,
  moveTimedGridDrag,
  endTimedGridDrag,
} = timedGridInteractions

const timedGridPresentation = useTimedGridPresentation({
  event: eventReadonly,
  state,
  defaultState,
  isSignUp,
  collapseDisabledTimesPreference,
  availabilityType,
  curGuestId: computed(() => props.curGuestId),
  authUserId: computed(() => mainStore.authUser?._id),
  animateTimeslotAlways: computed(() => props.animateTimeslotAlways),
  availabilityAnimEnabled,
  curRespondentsMax,
  dragging,
  dragStart,
  dragCur,
  getTimeslotVon,
  grid,
  avail,
  drag,
  scheduling: eventSched,
  ui,
})
const {
  dayTimeslotClassStyle: _dayTimeslotClassStyle,
  dayTimeslotVon: _dayTimeslotVon,
  getRenderedTimeBlockStyle: _getRenderedTimeBlockStyleForTemplate,
  getRenderedTimeBlockStyles: _getRenderedTimeBlockStylesForTemplate,
  overlaidAvailability: _overlaidAvailability,
  scheduledEventStyles: _scheduledEventStyles,
  timeslotClassStyle: _timeslotClassStyle,
  timeslotVon: _timeslotVon,
  collapseDisabledTimes,
  toggleCollapsedSpan,
  updateCollapseDisabledTimes,
} = timedGridPresentation

function updateTimeType(value: string | number) {
  timeType.value = value as typeof timeType.value
}

function updateNewGuestName(value: string) {
  newGuestName.value = value
}

function updateEditGuestNameDialog(value: boolean) {
  editGuestNameDialog.value = value
}

function updateAvailabilityType(value: AvailabilityType) {
  availabilityType.value = value
}

function updateCalendarOptionsDialog(value: boolean) {
  calendarOptionsDialog.value = value
}

function updateBufferTime(value: typeof bufferTime.value) {
  bufferTime.value = value
}

function updateWorkingHours(value: typeof workingHours.value) {
  workingHours.value = value
}

function updateShowCalendarEvents(value: boolean) {
  showCalendarEvents.value = value
}

function updateShowBestTimes(value: boolean) {
  showBestTimes.value = value
}

function updateHideIfNeeded(value: boolean) {
  hideIfNeeded.value = value
}

function updateStartCalendarOnMonday(value: boolean) {
  startCalendarOnMonday.value = value
}

function emitAddAvailability() {
  emit("addAvailability")
}

function emitAddAvailabilityAsGuest() {
  emit("addAvailabilityAsGuest")
}

const toolRowActions = computed<ScheduleOverlapToolRowActions>(() => ({
  updateCurTimezone: (value) => {
    setCurTimezone(value)
  },
  resetCurTimezone,
  updateTimeType,
  updateMobileNumDays: (value) => {
    mobileNumDays.value = value
  },
  updateShowBestTimes: (value) => {
    showBestTimes.value = value
  },
  updateHideIfNeeded: (value) => {
    hideIfNeeded.value = value
  },
  updateCollapseDisabledTimes,
  updateStartCalendarOnMonday,
  updateWeekOffset: emitWeekOffsetUpdate,
  scheduleEvent,
  cancelScheduleEvent,
  confirmScheduleEvent: (destination) => {
    void confirmScheduleEvent(destination)
  },
  clearScheduledEvent,
}))

const guestAvailabilityActions = useGuestAvailabilityActions({
  isAuthenticated: computed(() => mainStore.authUser !== null),
  event: eventReadonly,
  curGuestId: computed(() => props.curGuestId),
  parsedResponses,
  ownedGuestResponseLookupKeys,
  guestOwnership,
  guestResponseLookupKey,
  newGuestName,
  editGuestNameDialog,
  selectGuestOwnership,
  removeGuestOwnership,
  getOwnedGuestOwnership,
  setGuestOwnership,
  startEditing,
  stopEditing: _stopEditing,
  populateUserAvailability,
  setCurGuestId: (id) => {
    emit("setCurGuestId", id)
  },
  guestAvailabilityDeleted: (id) => {
    emit("guestAvailabilityDeleted", id)
  },
  refreshEvent,
  showInfo: mainStore.showInfo,
  showError: mainStore.showError,
})
const {
  editGuestAvailability,
  editOwnedGuestAvailability,
  handleGuestAvailabilityDeleted,
  openEditGuestNameDialog,
  saveGuestName,
} = guestAvailabilityActions

const sharedRespondentListeners = {
  mouseOverRespondent,
  mouseLeaveRespondent,
  clickRespondent,
  editGuestAvailability,
  guestAvailabilityDeleted: handleGuestAvailabilityDeleted,
}

const sharedDisplayListeners = {
  "update:showCalendarEvents": updateShowCalendarEvents,
  "update:showBestTimes": updateShowBestTimes,
  "update:hideIfNeeded": updateHideIfNeeded,
  "update:collapseDisabledTimes": updateCollapseDisabledTimes,
}

const sharedParentRelayListeners = {
  addAvailability: emitAddAvailability,
  addAvailabilityAsGuest: emitAddAvailabilityAsGuest,
  refreshEvent,
}

const sidebarListeners = {
  saveTempTimes,
  openEditGuestNameDialog,
  saveGuestName,
  "update:newGuestName": updateNewGuestName,
  "update:editGuestNameDialog": updateEditGuestNameDialog,
  "update:availabilityType": updateAvailabilityType,
  toggleCalendarAccount,
  toggleSubCalendarAccount,
  updateOverlayAvailability,
  "update:calendarOptionsDialog": updateCalendarOptionsDialog,
  "update:bufferTime": updateBufferTime,
  "update:workingHours": updateWorkingHours,

  updateSignUpBlock: editSignUpBlock,
  deleteSignUpBlock: deleteSignUpBlock,
  signUpForBlock: emitSignUpForBlock,
  ...sharedDisplayListeners,
  ...sharedParentRelayListeners,
  ...sharedRespondentListeners,
}

const mobileOverlayListeners = {
  closeHint,
  "update:availabilityType": updateAvailabilityType,
  "update:calendarOptionsDialog": updateCalendarOptionsDialog,
  "update:weekOffset": emitWeekOffsetUpdate,
  openEditGuestNameDialog,
  saveGuestName,
  "update:newGuestName": updateNewGuestName,
  "update:editGuestNameDialog": updateEditGuestNameDialog,
  ...sharedDisplayListeners,
  ...sharedParentRelayListeners,
  ...sharedRespondentListeners,
  saveTempTimes,
}

const daysOnlyGridActions = computed<ScheduleOverlapDaysOnlyGridActions>(
  () => ({
    prevPage,
    nextPage,
    startDrag,
    moveDrag,
    endDrag,
    resetCurTimeslot: ui.resetCurTimeslot,
    closeHint,
  }),
)

const timedGridActions = computed<ScheduleOverlapTimeGridActions>(() => ({
  prevPage,
  nextPage,
  calendarScroll: onCalendarScroll,
  startDrag: startTimedGridDrag,
  moveDrag: moveTimedGridDrag,
  endDrag: endTimedGridDrag,
  resetCurTimeslot: ui.resetCurTimeslot,
  closeHint,
  signUpForBlock: (block) => {
    handleSignUpBlockClick(block, emitSignUpForBlock)
  },
  toggleCollapsedSpan,
  markCollapsedRowInactive,
  markSplitGapOutside,
  clickSplitGapOutside,
}))

const {
  sidebarViewModel,
  mobileOverlayViewModel,
  toolRowViewModel,
  daysOnlyGridViewModel,
  timedGridViewModel,
} = useScheduleOverlapViewModels({
  event: eventReadonly,
  state,
  states,
  isSignUp,
  isOwner,
  isGroup,
  isPhone,
  authUser,
  props: {
    curGuestId: computed(() => props.curGuestId),
    addingAvailabilityAsGuest: computed(() => props.addingAvailabilityAsGuest),
    calendarPermissionGranted: computed(() => props.calendarPermissionGranted),
    calendarEventsMap: computed(() => props.calendarEventsMap),
    calendarOnly: computed(() => props.calendarOnly),
    loadingCalendarEvents: computed(() => props.loadingCalendarEvents),
    sampleCalendarEventsByDay: computed(() => props.sampleCalendarEventsByDay),
    alwaysShowCalendarEvents: computed(() => props.alwaysShowCalendarEvents),
    noEventNames: computed(() => props.noEventNames),
    weekOffset: computed(() => props.weekOffset),
  },
  derived: {
    showCalendarOptions,
    showLoader,
    attendees: formattedAttendees,
    collapseDisabledTimes,
  },
  rendering: {
    loadingResponsesLoading: computed(() => loadingResponses.value.loading),
    getSignUpBlockStyle,
  },
  preferences: { showBestTimes, collapseDisabledTimesPreference },
  guest: {
    ownedGuestResponseLookupKeys: computed(() =>
      ownedGuestResponses.value.map((record) => record.lookupKey),
    ),
    guestResponseLookupKey: computed(() => guestResponseLookupKey.value ?? ""),
    guestAddedAvailability,
  },
  timezone: {
    timezone: curTimezone,
    modified: timezoneModified,
    setTimezone: setCurTimezone,
    resetTimezone: resetCurTimezone,
  },
  grid,
  calendarEvents: calEvents,
  availability: avail,
  signUpForm,
  ui,
  scheduling: eventSched,
  presentation: timedGridPresentation,
  dragStart,
  actions: { toolRowActions, daysOnlyGridActions, timedGridActions },
})

const mobileLegendExistingTailPx = 64

const mobileEditingBottomClearance = computed<string | undefined>(() => {
  if (!isPhone.value || !editing.value || mobileOverlayHeight.value <= 0) {
    return undefined
  }
  return `calc(${mobileOverlayHeight.value}px + ${mobileOverlayViewModel.value.bottomOffset} - ${mobileLegendExistingTailPx}px)`
})

function startEditing() {
  if (props.event.eventVisitorId && props.event.isArchived) return
  state.value = isSignUp.value
    ? states.EDIT_SIGN_UP_BLOCKS
    : states.EDIT_AVAILABILITY
  availabilityType.value = availabilityTypes.AVAILABLE
  availability.value = new ZdtSet()
  ifNeeded.value = new ZdtSet()
  if (mainStore.authUser && !props.addingAvailabilityAsGuest) {
    resetCurUserAvailability()
  }
  void nextTick(() => (unsavedChanges.value = false))
  pageHasChanged.value = false
}

function _stopEditing() {
  state.value = defaultState.value
  stopAvailabilityAnim()
  availabilityType.value = availabilityTypes.AVAILABLE
  overlayAvailability.value = false
}

function refreshEvent() {
  emit("refreshEvent")
}

defineExpose({
  editing,
  scheduling: _scheduling,
  allowScheduleEvent,
  respondentSaveAllowed,
  unsavedChanges,
  curTimezone,
  selectedGuestRespondent: _selectedGuestRespondent,
  ownedGuestResponses,
  pageHasChanged,
  hasPages: _hasPages,
  respondents,
  state,
  showBestTimes,
  hideIfNeeded,
  collapseDisabledTimes,
  showCalendarEvents,
  startCalendarOnMonday,
  overlayAvailability,
  showOverlayAvailabilityToggle: _showOverlayAvailabilityToggle,
  startEditing,
  stopEditing: _stopEditing,
  updateShowBestTimes,
  updateHideIfNeeded,
  updateCollapseDisabledTimes,
  updateShowCalendarEvents,
  updateStartCalendarOnMonday,
  updateOverlayAvailability,
  clearSelectedGuestOwnership,
  selectGuestOwnership,
  days: _days,
  splitTimes: _splitTimes,
  responsesFormatted: _responsesFormatted,
  canEditGuestName: _canEditGuestName,
  curTimeslot: _curTimeslot,
  timeslotSelected,
  editOwnedGuestAvailability,
  setAvailabilityAutomatically: _setAvailabilityAutomatically,
  populateUserAvailability,
  submitAvailability: _submitAvailability,
  submitNewSignUpBlocks: _submitNewSignUpBlocks,
  deleteAvailability: _deleteAvailability,
  resetCurUserAvailability,
  resetSignUpForm: _resetSignUpForm,
  scheduleEvent,
  cancelScheduleEvent,
  confirmScheduleEvent,
  clearScheduledEvent,
  getAllValidTimeRanges: _getAllValidTimeRanges,
})
</script>

<style scoped>
.break {
  flex-basis: 100%;
  height: 0;
}
</style>

<style>
@keyframes schedule-overlap-bg-blink {
  0% {
    opacity: 0.8;
  }

  100% {
    opacity: 1;
  }
}

.animate-bg-color {
  animation: schedule-overlap-bg-blink 0.35s ease-in-out 0s 4 alternate;
  transition: background-color 0.25s ease-in-out;
}

.schedule-overlap-layout__grid-pane {
  min-width: 0;
}

@media (min-width: 640px) and (max-width: 767px) {
  .schedule-overlap-layout__grid-pane {
    flex: 1 1 0%;
  }
}
</style>

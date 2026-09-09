import { computed, ref } from "vue"
import type { ComputedRef, Ref } from "vue"
import type { Temporal } from "temporal-polyfill"
import {
  dateToDowDate,
  getEventDateSeeds,
  processEvent,
  getRenderedWeekStart,
  put,
} from "@/utils"
import { useMainStore } from "@/stores/main"
import { posthog } from "@/plugins/posthog"
import { toEventPatchPayload } from "@/composables/event/eventMutationBoundary"
import {
  clearTimefulSchedule,
  saveTimefulSchedule,
} from "@/composables/event/eventTransportBoundary"
import type { Event, Location } from "@/types"
import type { ZdtSet } from "@/utils"
import {
  getEventEnabledSlots,
  normalizeActiveSlots,
  sortAndUniqueSlots,
} from "@/utils/timedEventSlots"
import {
  HOUR_HEIGHT,
  getScheduledEventFromDragRange,
  states,
  type RowCol,
  type ScheduleOverlapEvent,
  type ScheduledEvent,
  type ScheduleOverlapState,
  type TimeItem,
  type Timezone,
} from "./types"

const getCurrentOrigin = () => {
  const location = Reflect.get(globalThis, "location") as unknown
  if (
    typeof location !== "object" ||
    location === null ||
    !("origin" in location) ||
    typeof location.origin !== "string"
  ) {
    return ""
  }

  return location.origin
}

export interface UseEventSchedulingOptions {
  event: Ref<ScheduleOverlapEvent>
  // TODO
  weekOffset: Ref<number>
  curTimezone: Ref<Timezone>
  state: Ref<ScheduleOverlapState>
  defaultState: ComputedRef<ScheduleOverlapState>

  // grid
  splitTimes: ComputedRef<TimeItem[][]>
  timeslotDuration: ComputedRef<Temporal.Duration>
  timeslotHeight: ComputedRef<number>
  timezoneOffset: ComputedRef<Temporal.Duration>
  isWeekly: ComputedRef<boolean>
  isGroup: ComputedRef<boolean>
  isSpecificTimes: ComputedRef<boolean>
  getDateFromRowCol: (row: number, col: number) => Temporal.ZonedDateTime | null
  numDisplayedDays?: ComputedRef<number>
  getMinMaxHoursFromTimes: (times: Temporal.ZonedDateTime[]) => {
    minHours: Temporal.PlainTime
    maxHours: Temporal.PlainTime
  }

  // drag
  dragging: Ref<boolean>
  dragStart: Ref<RowCol | null>
  dragCur: Ref<RowCol | null>

  // availability
  tempTimes: Ref<ZdtSet>
  respondents: ComputedRef<{ email?: string; firstName?: string }[]>

  // refresh
  refreshEvent?: () => Promise<void> | void
}

export function useEventScheduling(opts: UseEventSchedulingOptions) {
  const mainStore = useMainStore()
  const curScheduledEvent = ref<ScheduledEvent | null>(null)

  const getLocationText = (location: unknown): string => {
    if (!location || typeof location !== "object") {
      return ""
    }

    const normalizedLocation = location as Location

    return [
      normalizedLocation.city,
      normalizedLocation.state,
      normalizedLocation.country_name,
    ]
      .filter((value): value is string => Boolean(value))
      .join(", ")
  }

  const savedScheduledEvent = computed<ScheduledEvent | null>(() => {
    const saved = opts.event.value.scheduledEvent
    if (!saved?.startDate || !saved.endDate) return null

    const durationMinutes = saved.endDate
      .since(saved.startDate)
      .total("minutes")
    const numRows =
      durationMinutes / opts.timeslotDuration.value.total("minutes")
    if (!Number.isInteger(numRows) || numRows <= 0) return null

    const rowCount =
      opts.splitTimes.value[0].length + opts.splitTimes.value[1].length
    for (let col = 0; col < (opts.numDisplayedDays?.value ?? 0); col += 1) {
      for (let row = 0; row < rowCount; row += 1) {
        const date = opts.getDateFromRowCol(row, col)
        if (date?.toInstant().equals(saved.startDate.toInstant())) {
          return { col, row, numRows }
        }
      }
    }
    return null
  })

  const allowScheduleEvent = computed(
    () =>
      !(opts.event.value.eventVisitorId && opts.event.value.isArchived) &&
      Boolean(curScheduledEvent.value ?? savedScheduledEvent.value),
  )

  const scheduledEventStyle = computed<Record<string, string>>(() => {
    const style: Record<string, string> = {}
    let top: number
    let height: number
    if (opts.dragging.value && opts.dragStart.value && opts.dragCur.value) {
      const scheduledEvent = getScheduledEventFromDragRange(
        opts.dragStart.value,
        opts.dragCur.value,
      )
      if (!scheduledEvent) {
        return style
      }

      top = scheduledEvent.row
      height = scheduledEvent.numRows
    } else if (curScheduledEvent.value ?? savedScheduledEvent.value) {
      const scheduledEvent =
        curScheduledEvent.value ?? savedScheduledEvent.value
      if (!scheduledEvent) return style
      top = scheduledEvent.row
      height = scheduledEvent.numRows
    } else {
      return style
    }

    style.top = `calc(${String(top)} * ${String(opts.timeslotHeight.value)}px)`
    style.height = `calc(${String(height)} * ${String(
      opts.timeslotHeight.value,
    )}px)`
    return style
  })

  const signUpBlockBeingDraggedStyle = computed<Record<string, string>>(() => {
    const style: Record<string, string> = {}
    let top = 0
    let height = 0
    if (opts.dragging.value && opts.dragStart.value && opts.dragCur.value) {
      top = opts.dragStart.value.row
      height = opts.dragCur.value.row - opts.dragStart.value.row + 1
    }
    style.top = `calc(${String(top)} * 1rem)`
    style.height = `calc(${String(height)} * 1rem)`
    return style
  })

  const scheduleEvent = () => {
    opts.state.value = states.SCHEDULE_EVENT
    posthog.capture("schedule_event_button_clicked")
  }

  const cancelScheduleEvent = () => {
    opts.state.value = opts.defaultState.value
    curScheduledEvent.value = null
  }

  const getSelectedScheduleRange = () => {
    const scheduledEvent = curScheduledEvent.value ?? savedScheduledEvent.value
    if (!scheduledEvent) return
    const { col, row, numRows } = scheduledEvent
    let startDate = opts.getDateFromRowCol(row, col)
    if (!startDate) return
    const lastSlot = opts.getDateFromRowCol(row + numRows - 1, col)
    if (!lastSlot) return
    let endDate = lastSlot.add(opts.timeslotDuration.value)

    if (opts.isWeekly.value || opts.isGroup.value) {
      const eventDates = getEventDateSeeds(opts.event.value)
      const renderedWeekStart = getRenderedWeekStart(
        opts.weekOffset.value,
        opts.event.value.startOnMonday,
      )
      startDate = dateToDowDate(
        eventDates,
        startDate,
        opts.weekOffset.value,
        true,
        opts.event.value.startOnMonday,
        renderedWeekStart,
      )
      endDate = dateToDowDate(
        eventDates,
        endDate,
        opts.weekOffset.value,
        true,
        opts.event.value.startOnMonday,
        renderedWeekStart,
      )
    }

    return { startDate, endDate }
  }

  const confirmScheduleEvent = async (
    destination: "timeful" | "google" | "outlook" | boolean = "google",
  ) => {
    const selectedRange = getSelectedScheduleRange()
    if (!selectedRange) return

    const scheduleDestination =
      typeof destination === "boolean"
        ? destination
          ? "google"
          : "outlook"
        : destination
    posthog.capture("schedule_event_confirmed", {
      destination: scheduleDestination,
    })
    const { startDate, endDate } = selectedRange

    if (scheduleDestination === "timeful") {
      const eventId = opts.event.value.shortId ?? opts.event.value._id ?? ""
      try {
        await saveTimefulSchedule(eventId, { startDate, endDate })
        await opts.refreshEvent?.()
        opts.state.value = opts.defaultState.value
        curScheduledEvent.value = null
      } catch (err: unknown) {
        mainStore.showError(typeof err === "string" ? err : String(err))
      }
      return
    }

    const emails = opts.respondents.value.map((r) =>
      r.email && r.email.length > 0 ? r.email : null,
    )
    const emailsString = encodeURIComponent(emails.filter(Boolean).join(","))

    const eventId = opts.event.value.shortId ?? opts.event.value._id ?? ""
    const scheduleTimezoneId = encodeURIComponent(opts.curTimezone.value.value)
    const appOrigin = getCurrentOrigin()

    let url: string
    if (scheduleDestination === "google") {
      const start = startDate
        .toInstant()
        .toString()
        .replace(/([-:]|\.000)/g, "")
      const end = endDate
        .toInstant()
        .toString()
        .replace(/([-:]|\.000)/g, "")
      url = `https://calendar.google.com/calendar/render?action=TEMPLATE&text=${encodeURIComponent(
        opts.event.value.name ?? "",
      )}&dates=${start}/${end}&details=${encodeURIComponent(
        `\n\nThis event was scheduled with Timeful: ${appOrigin}/e/`,
      )}${eventId}&ctz=${scheduleTimezoneId}&add=${emailsString}`
    } else {
      url = `https://outlook.live.com/calendar/0/deeplink/compose?subject=${encodeURIComponent(
        opts.event.value.name ?? "",
      )}&body=${encodeURIComponent(
        `\n\nThis event was scheduled with Timeful: ${appOrigin}/e/` + eventId,
      )}&startdt=${startDate.toInstant().toString()}&enddt=${endDate
        .toInstant()
        .toString()}&location=${encodeURIComponent(
        getLocationText(opts.event.value.location),
      )}&path=/calendar/action/compose&timezone=${scheduleTimezoneId}`
    }

    window.open(url, "_blank")
    opts.state.value = opts.defaultState.value
  }

  const clearScheduledEvent = async () => {
    const eventId = opts.event.value.shortId ?? opts.event.value._id ?? ""
    try {
      await clearTimefulSchedule(eventId)
      await opts.refreshEvent?.()
      curScheduledEvent.value = null
      opts.state.value = opts.defaultState.value
    } catch (err: unknown) {
      mainStore.showError(typeof err === "string" ? err : String(err))
    }
  }

  const saveTempTimes = async () => {
    const eventValue: Pick<
      Event,
      | "_id"
      | "dates"
      | "timeSeed"
      | "times"
      | "duration"
      | "remindees"
      | "activeSlots"
      | "eventTimezone"
      | "slotGeneration"
      | "timedRecurrence"
    > = { ...opts.event.value }

    const selectedTimes = sortAndUniqueSlots([...opts.tempTimes.value])
    const existingActiveSlots = sortAndUniqueSlots(
      eventValue.activeSlots ?? eventValue.times,
    )
    const mergeEnabledWithSelected = (
      baseSlots: Temporal.ZonedDateTime[] | undefined,
    ): Temporal.ZonedDateTime[] =>
      sortAndUniqueSlots([...(baseSlots ?? []), ...selectedTimes])
    const givenEnabledSlots = getEventEnabledSlots(eventValue)
    const enabledSlots =
      givenEnabledSlots.length > 0
        ? mergeEnabledWithSelected(givenEnabledSlots)
        : mergeEnabledWithSelected(existingActiveSlots)
    const normalizedSlots = normalizeActiveSlots({
      enabledSlots,
      activeSlots: selectedTimes,
    })

    eventValue.activeSlots = normalizedSlots.activeSlots
    eventValue.times = [...normalizedSlots.activeSlots]

    if (eventValue.times.length === 0) {
      mainStore.showError("Select at least one time before saving.")
      return
    }

    const { minHours, maxHours } = opts.getMinMaxHoursFromTimes(
      eventValue.times,
    )

    eventValue.duration = maxHours
      .since(minHours)
      .add(opts.timeslotDuration.value)

    const eventId = eventValue._id ?? ""
    try {
      await put(`/events/${eventId}`, toEventPatchPayload(eventValue))
      const updatedEvent = {
        ...opts.event.value,
        dates: eventValue.dates,
        timeSeed: eventValue.timeSeed,
        times: eventValue.times,
        activeSlots: eventValue.activeSlots,
        duration: eventValue.duration,
      }
      processEvent(updatedEvent)
      opts.event.value = updatedEvent
      await opts.refreshEvent?.()
      opts.state.value = opts.defaultState.value
    } catch (err: unknown) {
      mainStore.showError(typeof err === "string" ? err : String(err))
    }
  }

  return {
    curScheduledEvent,
    savedScheduledEvent,
    allowScheduleEvent,
    scheduledEventStyle,
    signUpBlockBeingDraggedStyle,
    scheduleEvent,
    cancelScheduleEvent,
    confirmScheduleEvent,
    clearScheduledEvent,
    saveTempTimes,
    HOUR_HEIGHT,
  }
}

export type UseEventSchedulingReturn = ReturnType<typeof useEventScheduling>

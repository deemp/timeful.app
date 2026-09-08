import type { Temporal } from "temporal-polyfill"
import {
  availabilityTypes,
  durations,
  timeTypes,
  type AvailabilityType,
  type TimeType,
} from "@/constants"
import {
  getDateInTimezone,
  lightOrDark,
  removeTransparencyFromHex,
  zdtMapGet,
  zdtSetHas,
  type ZdtMap,
  type ZdtSet,
} from "@/utils"
import type {
  ParsedResponses,
  RenderedTimeGridRow,
  ResponsesFormatted,
  ScheduleOverlapState,
  TimedCellState,
  TimeItem,
  Timezone,
} from "@/composables/schedule_overlap/types"
import {
  DRAG_TYPES,
  HOUR_HEIGHT,
  states,
} from "@/composables/schedule_overlap/types"

export interface ClassStyle {
  class: string
  style: Record<string, string>
}

export interface OverlaidAvailabilityBlock {
  hoursOffset: Temporal.Duration
  hoursLength: Temporal.Duration
  type: AvailabilityType
  startBaseRowIndex?: number
}

export interface RenderedOverlayAvailabilityFragment {
  top: string
  height: string
  type: AvailabilityType
}

export interface RenderedTimeBlockFragment {
  [key: string]: string
  top: string
  height: string
}

const UNAVAILABLE_BG = "var(--timeful-unavailable-bg)"
const UNAVAILABLE_BG_TIME_GRID = "var(--timeful-unavailable-bg-time-grid)"
const UNAVAILABLE_BG_DAY_GRID = "var(--timeful-unavailable-bg-day-grid)"
const GRID_LINE_COLOR = "var(--timeful-grid-line-color)"
const GRID_LINE_WIDTH = "var(--timeful-grid-line-width)"

interface TimeslotBaseArgs {
  date: Temporal.ZonedDateTime | null
  row: number
  col: number
  state: ScheduleOverlapState
  overlayAvailability: boolean
  dragType: string
  availabilityType: AvailabilityType
  availability: ZdtSet
  ifNeeded: ZdtSet
  tempTimes: ZdtSet
  responsesFormatted: ResponsesFormatted
  parsedResponses: ParsedResponses
  curRespondent: string
  curRespondents: string[]
  curRespondentsSet: Set<string>
  respondents: { _id?: string | null }[]
  curRespondentsMax: number
  max: number
  defaultState: ScheduleOverlapState
  userHasResponded: boolean
  curGuestId: string
  authUserId?: string
  inDragRange: (row: number, col: number) => boolean
}

export const getBaseTimeslotClassStyle = ({
  date,
  row,
  col,
  state,
  overlayAvailability,
  dragType,
  availabilityType,
  availability,
  ifNeeded,
  tempTimes,
  responsesFormatted,
  parsedResponses,
  curRespondent,
  curRespondents,
  curRespondentsSet,
  respondents,
  curRespondentsMax,
  max,
  defaultState,
  userHasResponded,
  curGuestId,
  authUserId,
  inDragRange,
}: TimeslotBaseArgs): ClassStyle => {
  let c = ""
  const s: Record<string, string> = {}
  if (!date) return { class: c, style: s }

  const timeslotRespondents =
    zdtMapGet(responsesFormatted, date) ?? new Set<string>()

  const applyAggregateRespondentFill = ({
    allowUnavailableFallback,
  }: {
    allowUnavailableFallback: boolean
  }) => {
    let numRespondents = 0
    let maxVal = 0
    if (
      state === states.BEST_TIMES ||
      state === states.HEATMAP ||
      state === states.SCHEDULE_EVENT ||
      state === states.SET_SPECIFIC_TIMES
    ) {
      numRespondents = timeslotRespondents.size
      maxVal = max
    } else if (state === states.SUBSET_AVAILABILITY) {
      numRespondents = [...timeslotRespondents].filter((r) =>
        curRespondentsSet.has(r),
      ).length
      maxVal = curRespondentsMax
    } else if (overlayAvailability) {
      if (
        (userHasResponded || curGuestId.length > 0) &&
        timeslotRespondents.has(authUserId ?? curGuestId)
      ) {
        numRespondents = timeslotRespondents.size - 1
        maxVal = max
      } else {
        numRespondents = timeslotRespondents.size
        maxVal = max
      }
    }

    const totalRespondents =
      state === states.SUBSET_AVAILABILITY
        ? curRespondents.length
        : respondents.length

    if (defaultState === states.BEST_TIMES) {
      if (maxVal > 0 && numRespondents === maxVal) {
        s.backgroundColor =
          totalRespondents === 1 || overlayAvailability
            ? "#00994C88"
            : "#00994C"
      } else if (allowUnavailableFallback) {
        s.backgroundColor = UNAVAILABLE_BG
      }
      return
    }

    if (defaultState !== states.HEATMAP) {
      return
    }

    if (numRespondents > 0) {
      if (totalRespondents === 1) {
        const respondentId =
          state === states.SUBSET_AVAILABILITY
            ? curRespondents[0]
            : respondents[0]?._id
        if (
          respondentId &&
          parsedResponses[respondentId].ifNeeded &&
          zdtSetHas(parsedResponses[respondentId].ifNeeded, date)
        ) {
          c += "tw:bg-yellow "
        } else {
          s.backgroundColor = "#00994C88"
        }
      } else {
        const frac = numRespondents / maxVal
        let alpha: string
        if (!overlayAvailability) {
          alpha = Math.floor(frac * (255 - 30))
            .toString(16)
            .toUpperCase()
            .substring(0, 2)
            .padStart(2, "0")
          if (
            frac === 1 &&
            ((curRespondents.length > 0 && maxVal === curRespondents.length) ||
              (curRespondents.length === 0 && maxVal === respondents.length))
          ) {
            alpha = "FF"
          }
        } else {
          alpha = Math.floor(frac * (255 - 85))
            .toString(16)
            .toUpperCase()
            .substring(0, 2)
            .padStart(2, "0")
        }
        s.backgroundColor = "#00994C" + alpha
      }
    } else if (allowUnavailableFallback) {
      s.backgroundColor = UNAVAILABLE_BG
    }
  }

  if (
    (!overlayAvailability && state === states.EDIT_AVAILABILITY) ||
    state === states.SET_SPECIFIC_TIMES
  ) {
    if (state === states.SET_SPECIFIC_TIMES) {
      const selected = inDragRange(row, col)
        ? dragType === DRAG_TYPES.ADD
        : zdtSetHas(tempTimes, date)
      c += selected ? "tw:bg-white " : "tw:bg-light-gray-stroke "
    } else {
      s.backgroundColor = UNAVAILABLE_BG
      const inRange = inDragRange(row, col)
      if (inRange) {
        if (dragType === DRAG_TYPES.ADD) {
          if (availabilityType === availabilityTypes.AVAILABLE) {
            s.backgroundColor = "#00994C77"
          } else {
            c += "tw:bg-yellow "
          }
        }
      } else if (zdtSetHas(availability, date)) {
        s.backgroundColor = "#00994C77"
      } else if (zdtSetHas(ifNeeded, date)) {
        c += "tw:bg-yellow "
      }
    }
  }

  if (state === states.SINGLE_AVAILABILITY) {
    if (timeslotRespondents.has(curRespondent)) {
      if (
        parsedResponses[curRespondent].ifNeeded &&
        zdtSetHas(parsedResponses[curRespondent].ifNeeded, date)
      ) {
        c += "tw:bg-yellow "
      } else {
        s.backgroundColor = "#00994C77"
      }
    } else {
      s.backgroundColor = UNAVAILABLE_BG
    }
    return { class: c, style: s }
  }

  if (
    overlayAvailability ||
    state === states.BEST_TIMES ||
    state === states.HEATMAP ||
    state === states.SCHEDULE_EVENT ||
    state === states.SUBSET_AVAILABILITY
  ) {
    applyAggregateRespondentFill({ allowUnavailableFallback: true })
  }

  return { class: c, style: s }
}

interface TimeGridTimeslotArgs extends TimeslotBaseArgs {
  date: Temporal.ZonedDateTime | null
  timeHoursOffset?: Temporal.Duration
  splitStartHoursOffset?: Temporal.Duration
  absoluteMinutes?: number
  isFirstSplit: boolean
  isDisabled: boolean
  animateTimeslotAlways: boolean
  availabilityAnimEnabled: boolean
  timeslotHeight: number
  timezoneOffset: Temporal.Duration
  curTimeslot: { row: number; col: number }
  editing: boolean
  isColConsecutive: (col: number) => boolean
  daysLength: number
  firstSplitLength: number
  lastRow: number
}

interface BuildTimeGridTimeslotClassStylesArgs extends Omit<
  TimeGridTimeslotArgs,
  "date" | "row" | "col" | "isFirstSplit" | "isDisabled"
> {
  firstSplitTimes: TimeItem[]
  secondSplitTimes: TimeItem[]
  getDateFromRowCol: (row: number, col: number) => Temporal.ZonedDateTime | null
  getEnabledDateFromRowCol?: (
    row: number,
    col: number,
  ) => Temporal.ZonedDateTime | null
  getTimedCellState?: (row: number, col: number) => TimedCellState
}

export const getTimeGridTimeslotClassStyle = ({
  isFirstSplit,
  isDisabled,
  animateTimeslotAlways,
  availabilityAnimEnabled,
  timeslotHeight,
  timeHoursOffset,
  splitStartHoursOffset,
  timezoneOffset,
  curTimeslot,
  editing,
  isColConsecutive,
  daysLength,
  respondents,
  state,
  curRespondents,
  ...baseArgs
}: TimeGridTimeslotArgs): ClassStyle => {
  const cs = getBaseTimeslotClassStyle({
    ...baseArgs,
    respondents,
    state,
    curRespondents,
  })

  if (animateTimeslotAlways || availabilityAnimEnabled) {
    cs.class += "animate-bg-color "
  }
  cs.style.height = `${String(timeslotHeight)}px`
  const isLeftDateBoundary =
    baseArgs.col === 0 || !isColConsecutive(baseArgs.col)
  const isRightDateBoundary =
    baseArgs.col === daysLength - 1 || !isColConsecutive(baseArgs.col + 1)

  if (
    (state === states.HEATMAP ||
      state === states.BEST_TIMES ||
      editing ||
      state === states.SET_SPECIFIC_TIMES) &&
    curTimeslot.row === baseArgs.row &&
    curTimeslot.col === baseArgs.col &&
    !isDisabled
  ) {
    cs.class += "tw:relative schedule-overlap-time-grid__selected-timeslot "
  } else {
    const splitStartOffsetMinutes = splitStartHoursOffset?.total("minutes")
    const offsetMinutes = timeHoursOffset?.total("minutes")
    const displayedMinutes =
      typeof baseArgs.absoluteMinutes === "number"
        ? baseArgs.absoluteMinutes
        : typeof offsetMinutes === "number" &&
            typeof splitStartOffsetMinutes === "number"
          ? offsetMinutes - splitStartOffsetMinutes
          : null
    const localMinute =
      typeof displayedMinutes === "number"
        ? ((displayedMinutes % 60) + 60) % 60
        : baseArgs.date
          ? baseArgs.date.subtract({ minutes: timezoneOffset.total("minutes") })
              .minute
          : null
    if (isFirstSplit && baseArgs.row === 0) {
      cs.class += "tw:border-t "
      cs.style.borderTopStyle = "solid"
      cs.style.borderTopWidth = GRID_LINE_WIDTH
      cs.style.borderTopColor = GRID_LINE_COLOR
    } else if (localMinute === 0) {
      cs.class += "tw:border-t "
      cs.style.borderTopStyle = "solid"
      cs.style.borderTopWidth = GRID_LINE_WIDTH
      cs.style.borderTopColor = GRID_LINE_COLOR
    } else if (localMinute === 30) {
      cs.class += "tw:border-t "
      cs.style.borderTopStyle = "dashed"
      cs.style.borderTopWidth = GRID_LINE_WIDTH
      cs.style.borderTopColor = GRID_LINE_COLOR
    }

    cs.class += "tw:border-r "
    cs.style.borderRightStyle = "solid"
    cs.style.borderRightWidth = GRID_LINE_WIDTH
    if (isLeftDateBoundary) {
      cs.class += "tw:border-l "
      cs.style.borderLeftStyle = "solid"
      cs.style.borderLeftWidth = GRID_LINE_WIDTH
    }
    if (isRightDateBoundary) {
      cs.class += "tw:border-r "
    }
    if (!isFirstSplit && baseArgs.row === baseArgs.firstSplitLength) {
      cs.class += "tw:border-t "
      cs.style.borderTopStyle = "solid"
      cs.style.borderTopWidth = GRID_LINE_WIDTH
    }
    if (isFirstSplit && baseArgs.row === baseArgs.firstSplitLength - 1) {
      cs.class += "tw:border-b "
      cs.style.borderBottomStyle = "solid"
      cs.style.borderBottomWidth = GRID_LINE_WIDTH
    }
    if (!isFirstSplit && baseArgs.row === baseArgs.lastRow) {
      cs.class += "tw:border-b "
      cs.style.borderBottomStyle = "solid"
      cs.style.borderBottomWidth = GRID_LINE_WIDTH
    }
    cs.style.borderLeftColor = GRID_LINE_COLOR
    cs.style.borderRightColor = GRID_LINE_COLOR
    cs.style.borderBottomColor = GRID_LINE_COLOR
  }

  if (isDisabled) {
    cs.class += "tw:bg-gray "
  }
  if (cs.style.backgroundColor === UNAVAILABLE_BG) {
    cs.style.backgroundColor = UNAVAILABLE_BG_TIME_GRID
  }

  return cs
}

export const buildTimeGridTimeslotClassStyles = ({
  firstSplitTimes,
  secondSplitTimes,
  getDateFromRowCol,
  getEnabledDateFromRowCol,
  getTimedCellState,
  ...sharedArgs
}: BuildTimeGridTimeslotClassStylesArgs): ClassStyle[] => {
  const out: ClassStyle[] = []

  for (let col = 0; col < sharedArgs.daysLength; col += 1) {
    const firstSplitStartHoursOffset = firstSplitTimes[0]?.hoursOffset
    const secondSplitStartHoursOffset = secondSplitTimes[0]?.hoursOffset

    for (let row = 0; row < firstSplitTimes.length; row += 1) {
      const date = getDateFromRowCol(row, col)
      const enabledDate = getEnabledDateFromRowCol?.(row, col) ?? date
      const cellState = getTimedCellState?.(row, col)
      const classStyle = getTimeGridTimeslotClassStyle({
        ...sharedArgs,
        date,
        timeHoursOffset: firstSplitTimes[row]?.hoursOffset,
        absoluteMinutes: firstSplitTimes[row]?.absoluteMinutes,
        splitStartHoursOffset: firstSplitStartHoursOffset,
        row,
        col,
        isFirstSplit: true,
        isDisabled: !enabledDate,
      })
      if (cellState === "outside_range") {
        classStyle.class += "tw:bg-gray "
      }
      if (!date && enabledDate) {
        classStyle.class += "tw:bg-light-gray-stroke "
      }
      out.push(classStyle)
    }

    for (
      let secondSplitRow = 0;
      secondSplitRow < secondSplitTimes.length;
      secondSplitRow += 1
    ) {
      const row = secondSplitRow + firstSplitTimes.length
      const date = getDateFromRowCol(row, col)
      const enabledDate = getEnabledDateFromRowCol?.(row, col) ?? date
      const cellState = getTimedCellState?.(row, col)
      const classStyle = getTimeGridTimeslotClassStyle({
        ...sharedArgs,
        date,
        timeHoursOffset: secondSplitTimes[secondSplitRow]?.hoursOffset,
        absoluteMinutes: secondSplitTimes[secondSplitRow]?.absoluteMinutes,
        splitStartHoursOffset: secondSplitStartHoursOffset,
        row,
        col,
        isFirstSplit: false,
        isDisabled: !enabledDate,
      })
      if (cellState === "outside_range") {
        classStyle.class += "tw:bg-gray "
      }
      if (!date && enabledDate) {
        classStyle.class += "tw:bg-light-gray-stroke "
      }
      out.push(classStyle)
    }
  }

  return out
}

interface DayGridTimeslotArgs extends TimeslotBaseArgs {
  date: Temporal.ZonedDateTime
  row: number
  col: number
  monthDayIncluded: ZdtMap<boolean>
  curTimeslot: { row: number; col: number }
  lastMonthRow: number
}

export const getDayGridTimeslotClassStyle = ({
  monthDayIncluded,
  curTimeslot,
  respondents,
  state,
  ...baseArgs
}: DayGridTimeslotArgs): ClassStyle => {
  let cs: ClassStyle

  if (zdtMapGet(monthDayIncluded, baseArgs.date)) {
    cs = getBaseTimeslotClassStyle({
      ...baseArgs,
      respondents,
      state,
    })
    if (state === states.EDIT_AVAILABILITY) {
      cs.class += "tw:cursor-pointer "
    }
    const bg = cs.style.backgroundColor
    if (typeof bg === "string" && bg.startsWith("#")) {
      if (lightOrDark(removeTransparencyFromHex(bg)) === "dark") {
        cs.class += "tw:text-white "
      }
    }
  } else {
    cs = { class: "tw:bg-gray tw:text-dark-gray ", style: {} }
  }

  if (cs.style.backgroundColor === UNAVAILABLE_BG) {
    cs.style.backgroundColor = UNAVAILABLE_BG_DAY_GRID
  }

  if (
    (respondents.length > 0 || state === states.EDIT_AVAILABILITY) &&
    curTimeslot.row === baseArgs.row &&
    curTimeslot.col === baseArgs.col &&
    zdtMapGet(monthDayIncluded, baseArgs.date)
  ) {
    cs.class +=
      "tw:relative schedule-overlap-days-only-grid__selected-timeslot "
  }

  if (baseArgs.col === 0) {
    cs.class += "tw:border-l "
    cs.style.borderLeftStyle = "solid"
    cs.style.borderLeftWidth = GRID_LINE_WIDTH
    cs.style.borderLeftColor = GRID_LINE_COLOR
  }
  cs.class += "tw:border-r "
  cs.style.borderRightWidth = GRID_LINE_WIDTH
  cs.style.borderRightStyle = baseArgs.col !== 6 ? "dashed" : "solid"
  cs.style.borderRightColor = GRID_LINE_COLOR
  if (baseArgs.row === 0) {
    cs.class += "tw:border-t "
    cs.style.borderTopStyle = "solid"
    cs.style.borderTopWidth = GRID_LINE_WIDTH
    cs.style.borderTopColor = GRID_LINE_COLOR
  }
  cs.class += "tw:border-b "
  cs.style.borderBottomWidth = GRID_LINE_WIDTH
  cs.style.borderBottomStyle =
    baseArgs.row !== baseArgs.lastMonthRow ? "dashed" : "solid"
  cs.style.borderBottomColor = GRID_LINE_COLOR

  return cs
}

export const buildDayGridTimeslotClassStyles = ({
  monthDays,
  ...sharedArgs
}: Omit<DayGridTimeslotArgs, "date" | "row" | "col"> & {
  monthDays: Temporal.ZonedDateTime[]
}): ClassStyle[] =>
  monthDays.map((date, index) =>
    getDayGridTimeslotClassStyle({
      ...sharedArgs,
      date,
      row: Math.floor(index / 7),
      col: index % 7,
    }),
  )

interface BuildOverlaidAvailabilityArgs {
  daysLength: number
  firstSplitTimes: TimeItem[]
  secondSplitTimes: TimeItem[]
  timeslotDuration: Temporal.Duration
  getDateFromRowCol: (row: number, col: number) => Temporal.ZonedDateTime | null
  dragging: boolean
  inDragRange: (row: number, col: number) => boolean
  dragType: string
  availabilityType: AvailabilityType
  availability: ZdtSet
  ifNeeded: ZdtSet
}

export const buildOverlaidAvailability = ({
  daysLength,
  firstSplitTimes,
  secondSplitTimes,
  timeslotDuration,
  getDateFromRowCol,
  dragging,
  inDragRange,
  dragType,
  availabilityType,
  availability,
  ifNeeded,
}: BuildOverlaidAvailabilityArgs): OverlaidAvailabilityBlock[][] => {
  const result: OverlaidAvailabilityBlock[][] = []

  for (let dayIndex = 0; dayIndex < daysLength; dayIndex += 1) {
    result.push([])
    let idx = 0

    const addBlock = (time: TimeItem, row: number) => {
      const date = getDateFromRowCol(row, dayIndex)
      if (!date) {
        if (idx in result[dayIndex]) idx += 1
        return
      }

      const draggingAdd =
        dragging && inDragRange(row, dayIndex) && dragType === DRAG_TYPES.ADD
      const draggingRemove =
        dragging && inDragRange(row, dayIndex) && dragType === DRAG_TYPES.REMOVE

      if (
        draggingAdd ||
        (!draggingRemove &&
          (zdtSetHas(availability, date) || zdtSetHas(ifNeeded, date)))
      ) {
        const blockType = draggingAdd
          ? availabilityType
          : zdtSetHas(availability, date)
            ? availabilityTypes.AVAILABLE
            : availabilityTypes.IF_NEEDED

        if (idx in result[dayIndex]) {
          if (result[dayIndex][idx].type === blockType) {
            result[dayIndex][idx].hoursLength =
              result[dayIndex][idx].hoursLength.add(timeslotDuration)
          } else {
            result[dayIndex].push({
              hoursOffset: time.hoursOffset,
              hoursLength: timeslotDuration,
              type: blockType,
              startBaseRowIndex: row,
            })
            idx += 1
          }
        } else {
          result[dayIndex].push({
            hoursOffset: time.hoursOffset,
            hoursLength: timeslotDuration,
            type: blockType,
            startBaseRowIndex: row,
          })
        }
      } else if (idx in result[dayIndex]) {
        idx += 1
      }
    }

    for (let row = 0; row < firstSplitTimes.length; row += 1) {
      addBlock(firstSplitTimes[row], row)
    }
    if (idx in result[dayIndex]) idx += 1
    for (let row = 0; row < secondSplitTimes.length; row += 1) {
      addBlock(secondSplitTimes[row], row + firstSplitTimes.length)
    }
  }

  return result
}

export const buildRenderedOverlayAvailability = ({
  renderedRows,
  overlaidAvailability,
  splitTimes,
  timeslotDuration,
  isBaseRowVisibleOnDay = () => true,
}: {
  renderedRows: RenderedTimeGridRow[]
  overlaidAvailability: OverlaidAvailabilityBlock[][]
  splitTimes: TimeItem[][]
  timeslotDuration: Temporal.Duration
  isBaseRowVisibleOnDay?: (baseRowIndex: number, dayIndex: number) => boolean
}): RenderedOverlayAvailabilityFragment[][] => {
  const renderedRowIndexesByBaseRow = new Map<number, number>()
  for (
    let renderedIndex = 0;
    renderedIndex < renderedRows.length;
    renderedIndex += 1
  ) {
    const row = renderedRows[renderedIndex]
    if (row.kind === "timeslot" && typeof row.baseRowIndex === "number") {
      renderedRowIndexesByBaseRow.set(row.baseRowIndex, renderedIndex)
    }
  }

  const slotMinutes = Math.round(timeslotDuration.total("minutes"))
  const totalBaseRows = splitTimes[0].length + splitTimes[1].length

  const findBlockStartBaseRowIndex = (
    block: OverlaidAvailabilityBlock,
    coveredBaseRowCount: number,
  ): number | null => {
    if (typeof block.startBaseRowIndex === "number") {
      return block.startBaseRowIndex
    }

    const blockStartMinutes = block.hoursOffset.total("minutes")
    const splitSearchRanges = [
      {
        startBaseRowIndex: 0,
        times: splitTimes[0],
      },
      {
        startBaseRowIndex: splitTimes[0].length,
        times: splitTimes[1],
      },
    ]

    for (const splitRange of splitSearchRanges) {
      const latestStartIndex = splitRange.times.length - coveredBaseRowCount
      for (
        let splitIndex = 0;
        splitIndex <= latestStartIndex;
        splitIndex += 1
      ) {
        if (
          splitRange.times[splitIndex]?.hoursOffset.total("minutes") ===
          blockStartMinutes
        ) {
          return splitRange.startBaseRowIndex + splitIndex
        }
      }
    }

    return null
  }

  return overlaidAvailability.map((dayBlocks, dayIndex) =>
    dayBlocks.flatMap((block) => {
      const blockLengthMinutes = block.hoursLength.total("minutes")
      const coveredBaseRowCount =
        slotMinutes > 0 ? Math.round(blockLengthMinutes / slotMinutes) : 0

      if (coveredBaseRowCount <= 0) {
        return []
      }

      const startBaseRowIndex = findBlockStartBaseRowIndex(
        block,
        coveredBaseRowCount,
      )

      if (
        startBaseRowIndex == null ||
        startBaseRowIndex < 0 ||
        startBaseRowIndex + coveredBaseRowCount > totalBaseRows
      ) {
        return []
      }

      const fragments: RenderedOverlayAvailabilityFragment[] = []
      let currentFragment: RenderedOverlayAvailabilityFragment | null = null
      let previousRenderedIndex: number | null = null

      const flushFragment = () => {
        if (currentFragment) {
          fragments.push(currentFragment)
          currentFragment = null
        }
      }

      for (
        let baseRowOffset = 0;
        baseRowOffset < coveredBaseRowCount;
        baseRowOffset += 1
      ) {
        const baseRowIndex = startBaseRowIndex + baseRowOffset

        if (!isBaseRowVisibleOnDay(baseRowIndex, dayIndex)) {
          flushFragment()
          previousRenderedIndex = null
          continue
        }

        const renderedIndex = renderedRowIndexesByBaseRow.get(baseRowIndex)

        if (typeof renderedIndex !== "number") {
          flushFragment()
          previousRenderedIndex = null
          continue
        }

        const renderedRow = renderedRows[renderedIndex]
        const isContiguous =
          currentFragment !== null &&
          previousRenderedIndex != null &&
          renderedIndex === previousRenderedIndex + 1

        if (!isContiguous || currentFragment == null) {
          flushFragment()
          currentFragment = {
            top: `${String(renderedRow.rowTop)}px`,
            height: `${String(renderedRow.height)}px`,
            type: block.type,
          }
        } else {
          currentFragment.height = `${String(
            Number.parseFloat(currentFragment.height) + renderedRow.height,
          )}px`
        }

        previousRenderedIndex = renderedIndex
      }

      flushFragment()
      return fragments
    }),
  )
}

export const buildRenderedTimeBlockFragments = ({
  renderedRows,
  startBaseRowIndex,
  coveredBaseRowCount,
}: {
  renderedRows: RenderedTimeGridRow[]
  startBaseRowIndex: number
  coveredBaseRowCount: number
}): RenderedTimeBlockFragment[] => {
  if (coveredBaseRowCount <= 0) return []

  const renderedRowsByBaseRow = new Map<number, RenderedTimeGridRow>()
  for (const row of renderedRows) {
    if (row.kind === "timeslot" && typeof row.baseRowIndex === "number") {
      renderedRowsByBaseRow.set(row.baseRowIndex, row)
    }
  }

  const fragments: RenderedTimeBlockFragment[] = []
  let currentFragment: RenderedTimeBlockFragment | null = null
  let previousRowBottom: number | null = null

  for (let offset = 0; offset < coveredBaseRowCount; offset += 1) {
    const renderedRow = renderedRowsByBaseRow.get(startBaseRowIndex + offset)
    if (!renderedRow) {
      currentFragment = null
      previousRowBottom = null
      continue
    }

    if (
      !currentFragment ||
      previousRowBottom == null ||
      renderedRow.rowTop !== previousRowBottom
    ) {
      currentFragment = {
        top: `${String(renderedRow.rowTop)}px`,
        height: `${String(renderedRow.height)}px`,
      }
      fragments.push(currentFragment)
    } else {
      currentFragment.height = `${String(
        Number.parseFloat(currentFragment.height) + renderedRow.height,
      )}px`
    }

    previousRowBottom = renderedRow.rowTop + renderedRow.height
  }

  return fragments
}

export interface TooltipSegment {
  text: string
  mono: boolean
}

export const joinTooltipSegments = (segments: TooltipSegment[]): string =>
  segments.map((segment) => segment.text).join("")

export const formatTooltipContent = ({
  date,
  curTimezone,
  timeslotDuration,
  timeType,
  isSpecificDates,
}: {
  date: Temporal.ZonedDateTime
  curTimezone: Timezone
  timeslotDuration: Temporal.Duration
  timeType: TimeType
  isSpecificDates: boolean
}): TooltipSegment[] => {
  const start = getDateInTimezone(date, curTimezone)
  const end = start.add(timeslotDuration)

  const timeFormat: Intl.DateTimeFormatOptions =
    timeType === timeTypes.HOUR12
      ? { hour: "numeric", minute: "2-digit" }
      : { hour: "2-digit", minute: "2-digit", hour12: false }

  const dateFormat: Intl.DateTimeFormatOptions = isSpecificDates
    ? { weekday: "short", month: "short", day: "numeric", year: "numeric" }
    : { weekday: "short" }

  const startDateStr = start.toLocaleString("en-US", dateFormat)
  const startTimeStr = start.toLocaleString("en-US", timeFormat)
  const endTimeStr = end.toLocaleString("en-US", timeFormat)

  return [
    { text: startTimeStr, mono: true },
    { text: " to ", mono: false },
    { text: endTimeStr, mono: true },
    { text: " \u00b7 ", mono: false },
    { text: startDateStr, mono: false },
  ]
}

export const getTimeBlockStyle = ({
  timeBlock,
  firstSplitTimes,
}: {
  timeBlock: {
    hoursOffset?: Temporal.Duration
    hoursLength?: Temporal.Duration
  }
  firstSplitTimes: TimeItem[]
}): Record<string, string> => {
  const style: Record<string, string> = {}
  const hoursOffset = timeBlock.hoursOffset ?? durations.ZERO
  const hoursLength = timeBlock.hoursLength ?? durations.ZERO

  style.top = `calc(${String(
    hoursOffset
      .subtract(firstSplitTimes[0]?.hoursOffset ?? durations.ZERO)
      .total("hours"),
  )} * ${String(HOUR_HEIGHT)}px)`
  style.height = `calc(${String(hoursLength.total("hours"))} * ${String(
    HOUR_HEIGHT,
  )}px)`

  return style
}

export const getSignUpBlockStyle = ({
  hoursOffset,
  hoursLength,
}: {
  hoursOffset?: Temporal.Duration
  hoursLength?: Temporal.Duration
}): Record<string, string> => ({
  top: `calc(${String((hoursOffset ?? durations.ZERO).total("hours"))} * 4 * 1rem)`,
  height: `calc(${String((hoursLength ?? durations.ZERO).total("hours"))} * 4 * 1rem)`,
})

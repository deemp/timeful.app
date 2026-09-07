import { describe, expect, it } from "vitest"
import { Temporal } from "temporal-polyfill"
import { availabilityTypes, timeTypes, UTC } from "@/constants"
import { ZdtMap, ZdtSet } from "@/utils"
import {
  DRAG_TYPES,
  HOUR_HEIGHT,
  states,
} from "@/composables/schedule_overlap/types"
import {
  buildRenderedOverlayAvailability,
  buildRenderedTimeBlockFragments,
  buildTimeGridTimeslotClassStyles,
  buildOverlaidAvailability,
  formatTooltipContent,
  getDayGridTimeslotClassStyle,
  getSignUpBlockStyle,
  getTimeGridTimeslotClassStyle,
  getTimeBlockStyle,
  joinTooltipSegments,
} from "./scheduleOverlapRendering"

const zdt = (iso: string) => Temporal.Instant.from(iso).toZonedDateTimeISO(UTC)

describe("scheduleOverlapRendering", () => {
  it("splits a timed block around collapsed rows", () => {
    const fragments = buildRenderedTimeBlockFragments({
      renderedRows: [
        {
          id: "time-0",
          kind: "timeslot",
          baseRowIndex: 0,
          rowTop: 0,
          height: 16,
        },
        {
          id: "time-1",
          kind: "timeslot",
          baseRowIndex: 1,
          rowTop: 16,
          height: 16,
        },
        {
          id: "time-2",
          kind: "timeslot",
          baseRowIndex: 2,
          rowTop: 32,
          height: 16,
        },
        { id: "collapsed-3-4", kind: "collapsed", rowTop: 48, height: 44 },
        {
          id: "time-4",
          kind: "timeslot",
          baseRowIndex: 4,
          rowTop: 92,
          height: 16,
        },
      ],
      startBaseRowIndex: 0,
      coveredBaseRowCount: 5,
    })

    expect(fragments).toEqual([
      { top: "0px", height: "48px" },
      { top: "92px", height: "16px" },
    ])
  })

  it("merges adjacent availability slots by assigning the new Temporal.Duration", () => {
    const first = zdt("2026-01-01T09:00:00Z")
    const second = zdt("2026-01-01T09:30:00Z")
    const slots = new Map([
      ["0-0", first],
      ["1-0", second],
    ])

    const blocks = buildOverlaidAvailability({
      daysLength: 1,
      firstSplitTimes: [
        { hoursOffset: Temporal.Duration.from({ hours: 0 }) },
        { hoursOffset: Temporal.Duration.from({ minutes: 15 }) },
      ],
      secondSplitTimes: [],
      timeslotDuration: Temporal.Duration.from({ minutes: 15 }),
      getDateFromRowCol: (row, col) =>
        slots.get(`${String(row)}-${String(col)}`) ?? null,
      dragging: false,
      inDragRange: () => false,
      dragType: availabilityTypes.AVAILABLE,
      availabilityType: availabilityTypes.AVAILABLE,
      availability: new ZdtSet([first, second]),
      ifNeeded: new ZdtSet(),
    })

    expect(blocks).toHaveLength(1)
    expect(blocks[0]).toHaveLength(1)
    expect(blocks[0][0].hoursLength.total("minutes")).toBe(30)
    expect(blocks[0][0].type).toBe(availabilityTypes.AVAILABLE)
  })

  it("uses the actual timeslot duration for overlay blocks in 30-minute grids", () => {
    const first = zdt("2026-01-01T09:00:00Z")
    const second = zdt("2026-01-01T09:30:00Z")
    const slots = new Map([
      ["0-0", first],
      ["1-0", second],
    ])

    const blocks = buildOverlaidAvailability({
      daysLength: 1,
      firstSplitTimes: [
        { hoursOffset: Temporal.Duration.from({ hours: 9 }) },
        { hoursOffset: Temporal.Duration.from({ hours: 9, minutes: 30 }) },
      ],
      secondSplitTimes: [],
      timeslotDuration: Temporal.Duration.from({ minutes: 30 }),
      getDateFromRowCol: (row, col) =>
        slots.get(`${String(row)}-${String(col)}`) ?? null,
      dragging: false,
      inDragRange: () => false,
      dragType: availabilityTypes.AVAILABLE,
      availabilityType: availabilityTypes.AVAILABLE,
      availability: new ZdtSet([first, second]),
      ifNeeded: new ZdtSet(),
    })

    expect(blocks).toHaveLength(1)
    expect(blocks[0]).toHaveLength(1)
    expect(blocks[0][0].hoursOffset.total("minutes")).toBe(540)
    expect(blocks[0][0].hoursLength.total("minutes")).toBe(60)
  })

  it("formats tooltip content from the normalized slot time", () => {
    const tooltip = formatTooltipContent({
      date: zdt("2026-07-04T14:30:00Z"),
      curTimezone: {
        value: "UTC",
        offset: Temporal.Duration.from({ minutes: 0 }),
        label: "UTC",
        gmtString: "GMT+00:00",
      },
      timeslotDuration: Temporal.Duration.from({ minutes: 30 }),
      timeType: timeTypes.HOUR24,
      isSpecificDates: true,
    })

    expect(joinTooltipSegments(tooltip)).toBe(
      "14:30 to 15:00 \u00b7 Sat, Jul 4, 2026",
    )
    expect(
      tooltip.filter((segment) => segment.mono).map((segment) => segment.text),
    ).toEqual(["14:30", "15:00"])
    expect(
      tooltip.filter((segment) => !segment.mono).map((segment) => segment.text),
    ).toEqual([" to ", " \u00b7 ", "Sat, Jul 4, 2026"])
  })

  it("clips overlay fragments before visible grey rows that stay rendered", () => {
    const fragments = buildRenderedOverlayAvailability({
      renderedRows: [
        {
          id: "time-0",
          kind: "timeslot",
          height: 30,
          rowTop: 0,
          baseRowIndex: 0,
        },
        {
          id: "time-1",
          kind: "timeslot",
          height: 30,
          rowTop: 30,
          baseRowIndex: 1,
        },
      ],
      overlaidAvailability: [
        [
          {
            hoursOffset: Temporal.Duration.from({ hours: 0 }),
            hoursLength: Temporal.Duration.from({ hours: 1 }),
            type: availabilityTypes.AVAILABLE,
          },
        ],
      ],
      splitTimes: [
        [
          { hoursOffset: Temporal.Duration.from({ hours: 0 }) },
          { hoursOffset: Temporal.Duration.from({ minutes: 30 }) },
        ],
        [],
      ],
      timeslotDuration: Temporal.Duration.from({ minutes: 30 }),
      isBaseRowVisibleOnDay: (baseRowIndex) => baseRowIndex !== 1,
    })

    expect(fragments).toEqual([
      [
        {
          top: "0px",
          height: "30px",
          type: availabilityTypes.AVAILABLE,
        },
      ],
    ])
  })

  it("projects overlay fragments from day-specific visible rows instead of a page-wide row set", () => {
    const fragments = buildRenderedOverlayAvailability({
      renderedRows: [
        {
          id: "time-0",
          kind: "timeslot",
          height: 30,
          rowTop: 0,
          baseRowIndex: 0,
        },
      ],
      overlaidAvailability: [
        [],
        [
          {
            hoursOffset: Temporal.Duration.from({ hours: 0 }),
            hoursLength: Temporal.Duration.from({ minutes: 30 }),
            type: availabilityTypes.AVAILABLE,
          },
        ],
      ],
      splitTimes: [[{ hoursOffset: Temporal.Duration.from({ hours: 0 }) }], []],
      timeslotDuration: Temporal.Duration.from({ minutes: 30 }),
      isBaseRowVisibleOnDay: (baseRowIndex, dayIndex) =>
        dayIndex === 1 && baseRowIndex === 0,
    })

    expect(fragments).toEqual([
      [],
      [
        {
          top: "0px",
          height: "30px",
          type: availabilityTypes.AVAILABLE,
        },
      ],
    ])
  })

  it("projects overlay fragments from continuous semantic base rows", () => {
    const fragments = buildRenderedOverlayAvailability({
      renderedRows: [
        {
          id: "time-0",
          kind: "timeslot",
          height: 30,
          rowTop: 0,
          baseRowIndex: 0,
        },
        {
          id: "time-1",
          kind: "timeslot",
          height: 30,
          rowTop: 30,
          baseRowIndex: 1,
        },
        {
          id: "time-2",
          kind: "timeslot",
          height: 30,
          rowTop: 60,
          baseRowIndex: 2,
        },
      ],
      overlaidAvailability: [
        [
          {
            hoursOffset: Temporal.Duration.from({ hours: 4 }),
            hoursLength: Temporal.Duration.from({ minutes: 60 }),
            type: availabilityTypes.AVAILABLE,
            startBaseRowIndex: 0,
          },
          {
            hoursOffset: Temporal.Duration.from({ hours: 4 }),
            hoursLength: Temporal.Duration.from({ minutes: 30 }),
            type: availabilityTypes.AVAILABLE,
            startBaseRowIndex: 2,
          },
        ],
      ],
      splitTimes: [
        [
          { hoursOffset: Temporal.Duration.from({ hours: 4 }) },
          { hoursOffset: Temporal.Duration.from({ hours: 4, minutes: 30 }) },
        ],
        [{ hoursOffset: Temporal.Duration.from({ hours: 4 }) }],
      ],
      timeslotDuration: Temporal.Duration.from({ minutes: 30 }),
    })

    expect(fragments).toEqual([
      [
        {
          top: "0px",
          height: "60px",
          type: availabilityTypes.AVAILABLE,
        },
        {
          top: "60px",
          height: "30px",
          type: availabilityTypes.AVAILABLE,
        },
      ],
    ])
  })

  it("positions overlays from the selected slot rows instead of their time offsets", () => {
    const fragments = buildRenderedOverlayAvailability({
      renderedRows: [
        {
          id: "time-0",
          kind: "timeslot",
          height: 30,
          rowTop: 0,
          baseRowIndex: 0,
        },
        {
          id: "time-1",
          kind: "timeslot",
          height: 30,
          rowTop: 30,
          baseRowIndex: 1,
        },
      ],
      overlaidAvailability: [
        [
          {
            // The offset is deliberately 45 minutes earlier than the selected row.
            hoursOffset: Temporal.Duration.from({ hours: 7, minutes: 15 }),
            hoursLength: Temporal.Duration.from({ minutes: 30 }),
            type: availabilityTypes.AVAILABLE,
            startBaseRowIndex: 1,
          },
        ],
      ],
      splitTimes: [
        [
          { hoursOffset: Temporal.Duration.from({ hours: 8 }) },
          { hoursOffset: Temporal.Duration.from({ hours: 8, minutes: 30 }) },
        ],
        [],
      ],
      timeslotDuration: Temporal.Duration.from({ minutes: 30 }),
    })

    expect(fragments).toEqual([
      [
        {
          top: "30px",
          height: "30px",
          type: availabilityTypes.AVAILABLE,
        },
      ],
    ])
  })

  it("builds timed-grid class styles across both splits and marks missing dates disabled", () => {
    const first = zdt("2026-01-01T09:00:00Z")
    const second = zdt("2026-01-01T09:15:00Z")

    const styles = buildTimeGridTimeslotClassStyles({
      firstSplitTimes: [
        { hoursOffset: Temporal.Duration.from({ hours: 9 }) },
        { hoursOffset: Temporal.Duration.from({ hours: 9, minutes: 30 }) },
      ],
      secondSplitTimes: [
        { hoursOffset: Temporal.Duration.from({ hours: 13 }) },
      ],
      getDateFromRowCol: (row) => {
        if (row === 0) return first
        if (row === 1) return second
        return null
      },
      state: states.HEATMAP,
      overlayAvailability: false,
      dragType: DRAG_TYPES.ADD,
      availabilityType: availabilityTypes.AVAILABLE,
      availability: new ZdtSet(),
      ifNeeded: new ZdtSet(),
      tempTimes: new ZdtSet(),
      responsesFormatted: new ZdtMap(),
      parsedResponses: {},
      curRespondent: "",
      curRespondents: [],
      curRespondentsSet: new Set<string>(),
      respondents: [],
      curRespondentsMax: 0,
      max: 0,
      defaultState: states.HEATMAP,
      userHasResponded: false,
      curGuestId: "",
      authUserId: undefined,
      inDragRange: () => false,
      animateTimeslotAlways: false,
      availabilityAnimEnabled: false,
      timezoneOffset: Temporal.Duration.from({ minutes: 0 }),
      curTimeslot: { row: -1, col: -1 },
      editing: false,
      isColConsecutive: () => true,
      daysLength: 1,
      firstSplitLength: 2,
      lastRow: 2,
      timeslotHeight: 15,
    })

    expect(styles).toHaveLength(3)
    expect(styles[0].style.height).toBe("15px")
    expect(styles[0].style.boxShadow).toBeUndefined()
    expect(styles[0].style.borderLeftStyle).toBe("solid")
    expect(styles[0].style.borderRightStyle).toBe("solid")
    expect(styles[0].class).not.toContain("tw:border-l-gray")
    expect(styles[0].class).not.toContain("tw:border-r-gray")
    expect(styles[0].class).not.toContain("tw:border-b-gray")
    expect(styles[0].style.borderLeftColor).toBe(
      "var(--timeful-grid-line-color)",
    )
    expect(styles[0].style.borderRightColor).toBe(
      "var(--timeful-grid-line-color)",
    )
    expect(styles[0].style.borderBottomColor).toBe(
      "var(--timeful-grid-line-color)",
    )
    expect(styles[2].class).toContain("tw:bg-gray")
  })

  it("uses light-grey for enabled inactive slots and dark-grey outside the enabled domain", () => {
    const activeSlot = zdt("2026-01-01T09:00:00Z")
    const enabledInactiveSlot = zdt("2026-01-01T09:15:00Z")

    const styles = buildTimeGridTimeslotClassStyles({
      firstSplitTimes: [
        { hoursOffset: Temporal.Duration.from({ hours: 9 }) },
        { hoursOffset: Temporal.Duration.from({ hours: 9, minutes: 15 }) },
        { hoursOffset: Temporal.Duration.from({ hours: 9, minutes: 30 }) },
      ],
      secondSplitTimes: [],
      getDateFromRowCol: (row) => (row === 0 ? activeSlot : null),
      getEnabledDateFromRowCol: (row) =>
        row === 0 ? activeSlot : row === 1 ? enabledInactiveSlot : null,
      state: states.HEATMAP,
      overlayAvailability: false,
      dragType: DRAG_TYPES.ADD,
      availabilityType: availabilityTypes.AVAILABLE,
      availability: new ZdtSet(),
      ifNeeded: new ZdtSet(),
      tempTimes: new ZdtSet(),
      responsesFormatted: new ZdtMap(),
      parsedResponses: {},
      curRespondent: "",
      curRespondents: [],
      curRespondentsSet: new Set<string>(),
      respondents: [],
      curRespondentsMax: 0,
      max: 0,
      defaultState: states.HEATMAP,
      userHasResponded: false,
      curGuestId: "",
      authUserId: undefined,
      inDragRange: () => false,
      animateTimeslotAlways: false,
      availabilityAnimEnabled: false,
      timeslotHeight: 15,
      timezoneOffset: Temporal.Duration.from({ minutes: 0 }),
      curTimeslot: { row: -1, col: -1 },
      editing: false,
      isColConsecutive: () => true,
      daysLength: 1,
      firstSplitLength: 3,
      lastRow: 2,
    })

    expect(styles[1].class).toContain("tw:bg-light-gray-stroke")
    expect(styles[1].class).not.toContain("tw:bg-gray")
    expect(styles[2].class).toContain("tw:bg-gray")
  })

  it("uses the dashed separator token for half-hour timed-grid rows", () => {
    const slot = zdt("2026-01-01T09:30:00Z")

    const classStyle = getTimeGridTimeslotClassStyle({
      date: slot,
      row: 1,
      col: 0,
      isFirstSplit: true,
      isDisabled: false,
      animateTimeslotAlways: false,
      availabilityAnimEnabled: false,
      timeslotHeight: 15,
      timeHoursOffset: Temporal.Duration.from({ hours: 9, minutes: 30 }),
      absoluteMinutes: 9 * 60 + 30,
      splitStartHoursOffset: Temporal.Duration.from({ hours: 9 }),
      timezoneOffset: Temporal.Duration.from({ minutes: 0 }),
      curTimeslot: { row: -1, col: -1 },
      editing: false,
      isColConsecutive: () => true,
      daysLength: 1,
      firstSplitLength: 2,
      lastRow: 1,
      state: states.HEATMAP,
      overlayAvailability: false,
      dragType: DRAG_TYPES.ADD,
      availabilityType: availabilityTypes.AVAILABLE,
      availability: new ZdtSet(),
      ifNeeded: new ZdtSet(),
      tempTimes: new ZdtSet(),
      responsesFormatted: new ZdtMap(),
      parsedResponses: {},
      curRespondent: "",
      curRespondents: [],
      curRespondentsSet: new Set<string>(),
      respondents: [],
      curRespondentsMax: 0,
      max: 0,
      defaultState: states.HEATMAP,
      userHasResponded: false,
      curGuestId: "",
      authUserId: undefined,
      inDragRange: () => false,
    })

    expect(classStyle.style.borderTopColor).toBe(
      "var(--timeful-grid-line-color)",
    )
    expect(classStyle.style.borderTopStyle).toBe("dashed")
    expect(classStyle.style.borderTopWidth).toBe(
      "var(--timeful-grid-line-width)",
    )
    expect(classStyle.class).not.toContain("tw:border-t-gray")
  })

  it("keeps the top frame visible for disabled timed-grid rows", () => {
    const classStyle = getTimeGridTimeslotClassStyle({
      date: null,
      row: 0,
      col: 0,
      isFirstSplit: true,
      isDisabled: true,
      animateTimeslotAlways: false,
      availabilityAnimEnabled: false,
      timeslotHeight: 15,
      timeHoursOffset: Temporal.Duration.from({ hours: 0 }),
      absoluteMinutes: 0,
      splitStartHoursOffset: Temporal.Duration.from({ hours: 0 }),
      timezoneOffset: Temporal.Duration.from({ minutes: 0 }),
      curTimeslot: { row: -1, col: -1 },
      editing: false,
      isColConsecutive: () => true,
      daysLength: 1,
      firstSplitLength: 2,
      lastRow: 1,
      state: states.HEATMAP,
      overlayAvailability: false,
      dragType: DRAG_TYPES.ADD,
      availabilityType: availabilityTypes.AVAILABLE,
      availability: new ZdtSet(),
      ifNeeded: new ZdtSet(),
      tempTimes: new ZdtSet(),
      responsesFormatted: new ZdtMap(),
      parsedResponses: {},
      curRespondent: "",
      curRespondents: [],
      curRespondentsSet: new Set<string>(),
      respondents: [],
      curRespondentsMax: 0,
      max: 0,
      defaultState: states.HEATMAP,
      userHasResponded: false,
      curGuestId: "",
      authUserId: undefined,
      inDragRange: () => false,
    })

    expect(classStyle.class).toContain("tw:bg-gray")
    expect(classStyle.style.borderTopStyle).toBe("solid")
    expect(classStyle.style.borderTopWidth).toBe(
      "var(--timeful-grid-line-width)",
    )
    expect(classStyle.style.borderTopColor).toBe(
      "var(--timeful-grid-line-color)",
    )
    expect(classStyle.class).not.toContain("tw:border-t-gray")
  })

  it("keeps the half-hour separator visible for disabled timed-grid rows", () => {
    const classStyle = getTimeGridTimeslotClassStyle({
      date: null,
      row: 1,
      col: 0,
      isFirstSplit: true,
      isDisabled: true,
      animateTimeslotAlways: false,
      availabilityAnimEnabled: false,
      timeslotHeight: 15,
      timeHoursOffset: Temporal.Duration.from({ hours: 9, minutes: 30 }),
      absoluteMinutes: 9 * 60 + 30,
      splitStartHoursOffset: Temporal.Duration.from({ hours: 9 }),
      timezoneOffset: Temporal.Duration.from({ minutes: 0 }),
      curTimeslot: { row: -1, col: -1 },
      editing: false,
      isColConsecutive: () => true,
      daysLength: 1,
      firstSplitLength: 2,
      lastRow: 1,
      state: states.HEATMAP,
      overlayAvailability: false,
      dragType: DRAG_TYPES.ADD,
      availabilityType: availabilityTypes.AVAILABLE,
      availability: new ZdtSet(),
      ifNeeded: new ZdtSet(),
      tempTimes: new ZdtSet(),
      responsesFormatted: new ZdtMap(),
      parsedResponses: {},
      curRespondent: "",
      curRespondents: [],
      curRespondentsSet: new Set<string>(),
      respondents: [],
      curRespondentsMax: 0,
      max: 0,
      defaultState: states.HEATMAP,
      userHasResponded: false,
      curGuestId: "",
      authUserId: undefined,
      inDragRange: () => false,
    })

    expect(classStyle.style.borderTopColor).toBe(
      "var(--timeful-grid-line-color)",
    )
    expect(classStyle.style.borderTopStyle).toBe("dashed")
    expect(classStyle.style.borderTopWidth).toBe(
      "var(--timeful-grid-line-width)",
    )
  })

  it("anchors disabled timed-grid separators to the displayed split start", () => {
    const classStyle = getTimeGridTimeslotClassStyle({
      date: null,
      row: 34,
      col: 0,
      isFirstSplit: true,
      isDisabled: true,
      animateTimeslotAlways: false,
      availabilityAnimEnabled: false,
      timeslotHeight: 15,
      timeHoursOffset: Temporal.Duration.from({ minutes: 495 }),
      absoluteMinutes: 17 * 60 + 30,
      splitStartHoursOffset: Temporal.Duration.from({ minutes: -15 }),
      timezoneOffset: Temporal.Duration.from({ minutes: -345 }),
      curTimeslot: { row: -1, col: -1 },
      editing: false,
      isColConsecutive: () => true,
      daysLength: 1,
      firstSplitLength: 36,
      lastRow: 35,
      state: states.HEATMAP,
      overlayAvailability: false,
      dragType: DRAG_TYPES.ADD,
      availabilityType: availabilityTypes.AVAILABLE,
      availability: new ZdtSet(),
      ifNeeded: new ZdtSet(),
      tempTimes: new ZdtSet(),
      responsesFormatted: new ZdtMap(),
      parsedResponses: {},
      curRespondent: "",
      curRespondents: [],
      curRespondentsSet: new Set<string>(),
      respondents: [],
      curRespondentsMax: 0,
      max: 0,
      defaultState: states.HEATMAP,
      userHasResponded: false,
      curGuestId: "",
      authUserId: undefined,
      inDragRange: () => false,
    })

    expect(classStyle.style.borderTopColor).toBe(
      "var(--timeful-grid-line-color)",
    )
    expect(classStyle.style.borderTopStyle).toBe("dashed")
    expect(classStyle.style.borderTopWidth).toBe(
      "var(--timeful-grid-line-width)",
    )
  })

  it("uses the same separator style for enabled and disabled Kathmandu rows with the same displayed time", () => {
    const enabledClassStyle = getTimeGridTimeslotClassStyle({
      date: zdt("2026-01-01T11:30:00Z"),
      row: 2,
      col: 0,
      isFirstSplit: true,
      isDisabled: false,
      animateTimeslotAlways: false,
      availabilityAnimEnabled: false,
      timeslotHeight: 15,
      timeHoursOffset: Temporal.Duration.from({ minutes: 15 }),
      absoluteMinutes: 11 * 60 + 30,
      splitStartHoursOffset: Temporal.Duration.from({ minutes: -15 }),
      timezoneOffset: Temporal.Duration.from({ minutes: -345 }),
      curTimeslot: { row: -1, col: -1 },
      editing: false,
      isColConsecutive: () => true,
      daysLength: 1,
      firstSplitLength: 36,
      lastRow: 35,
      state: states.HEATMAP,
      overlayAvailability: false,
      dragType: DRAG_TYPES.ADD,
      availabilityType: availabilityTypes.AVAILABLE,
      availability: new ZdtSet(),
      ifNeeded: new ZdtSet(),
      tempTimes: new ZdtSet(),
      responsesFormatted: new ZdtMap(),
      parsedResponses: {},
      curRespondent: "",
      curRespondents: [],
      curRespondentsSet: new Set<string>(),
      respondents: [],
      curRespondentsMax: 0,
      max: 0,
      defaultState: states.HEATMAP,
      userHasResponded: false,
      curGuestId: "",
      authUserId: undefined,
      inDragRange: () => false,
    })

    const disabledClassStyle = getTimeGridTimeslotClassStyle({
      date: null,
      row: 2,
      col: 0,
      isFirstSplit: true,
      isDisabled: true,
      animateTimeslotAlways: false,
      availabilityAnimEnabled: false,
      timeslotHeight: 15,
      timeHoursOffset: Temporal.Duration.from({ minutes: 15 }),
      absoluteMinutes: 11 * 60 + 30,
      splitStartHoursOffset: Temporal.Duration.from({ minutes: -15 }),
      timezoneOffset: Temporal.Duration.from({ minutes: -345 }),
      curTimeslot: { row: -1, col: -1 },
      editing: false,
      isColConsecutive: () => true,
      daysLength: 1,
      firstSplitLength: 36,
      lastRow: 35,
      state: states.HEATMAP,
      overlayAvailability: false,
      dragType: DRAG_TYPES.ADD,
      availabilityType: availabilityTypes.AVAILABLE,
      availability: new ZdtSet(),
      ifNeeded: new ZdtSet(),
      tempTimes: new ZdtSet(),
      responsesFormatted: new ZdtMap(),
      parsedResponses: {},
      curRespondent: "",
      curRespondents: [],
      curRespondentsSet: new Set<string>(),
      respondents: [],
      curRespondentsMax: 0,
      max: 0,
      defaultState: states.HEATMAP,
      userHasResponded: false,
      curGuestId: "",
      authUserId: undefined,
      inDragRange: () => false,
    })

    expect(enabledClassStyle.style.borderTopStyle).toBe("dashed")
    expect(disabledClassStyle.style.borderTopStyle).toBe("dashed")
    expect(enabledClassStyle.style.borderTopWidth).toBe(
      disabledClassStyle.style.borderTopWidth,
    )
    expect(enabledClassStyle.style.borderTopColor).toBe(
      disabledClassStyle.style.borderTopColor,
    )
  })

  it("draws the top border on the first timed-grid row instead of relying on a shared overlay", () => {
    const slot = zdt("2026-01-01T09:00:00Z")

    const classStyle = getTimeGridTimeslotClassStyle({
      date: slot,
      row: 0,
      col: 1,
      isFirstSplit: true,
      isDisabled: false,
      animateTimeslotAlways: false,
      availabilityAnimEnabled: false,
      timeslotHeight: 15,
      timeHoursOffset: Temporal.Duration.from({ hours: 9 }),
      absoluteMinutes: 9 * 60,
      splitStartHoursOffset: Temporal.Duration.from({ hours: 9 }),
      timezoneOffset: Temporal.Duration.from({ minutes: 0 }),
      curTimeslot: { row: -1, col: -1 },
      editing: false,
      isColConsecutive: () => true,
      daysLength: 3,
      firstSplitLength: 2,
      lastRow: 1,
      state: states.HEATMAP,
      overlayAvailability: false,
      dragType: DRAG_TYPES.ADD,
      availabilityType: availabilityTypes.AVAILABLE,
      availability: new ZdtSet(),
      ifNeeded: new ZdtSet(),
      tempTimes: new ZdtSet(),
      responsesFormatted: new ZdtMap(),
      parsedResponses: {},
      curRespondent: "",
      curRespondents: [],
      curRespondentsSet: new Set<string>(),
      respondents: [],
      curRespondentsMax: 0,
      max: 0,
      defaultState: states.HEATMAP,
      userHasResponded: false,
      curGuestId: "",
      authUserId: undefined,
      inDragRange: () => false,
    })

    expect(classStyle.style.borderTopStyle).toBe("solid")
    expect(classStyle.style.borderTopWidth).toBe(
      "var(--timeful-grid-line-width)",
    )
    expect(classStyle.style.borderTopColor).toBe(
      "var(--timeful-grid-line-color)",
    )
  })

  it("positions timed blocks on the continuous row axis", () => {
    const style = getTimeBlockStyle({
      timeBlock: {
        hoursOffset: Temporal.Duration.from({ hours: 13 }),
        hoursLength: Temporal.Duration.from({ minutes: 30 }),
      },
      firstSplitTimes: [
        { hoursOffset: Temporal.Duration.from({ hours: 9 }) },
        { hoursOffset: Temporal.Duration.from({ hours: 9, minutes: 15 }) },
      ],
    })

    expect(style.top).toBe(`calc(4 * ${String(HOUR_HEIGHT)}px)`)
    expect(style.height).toBe(`calc(0.5 * ${String(HOUR_HEIGHT)}px)`)
  })

  it("formats sign-up block styles from normalized durations", () => {
    const style = getSignUpBlockStyle({
      hoursOffset: Temporal.Duration.from({ hours: 1, minutes: 30 }),
      hoursLength: Temporal.Duration.from({ minutes: 45 }),
    })

    expect(style).toEqual({
      top: "calc(1.5 * 4 * 1rem)",
      height: "calc(0.75 * 4 * 1rem)",
    })
  })

  it("uses the timed-grid unavailable token for zero-availability heatmap slots", () => {
    const slot = zdt("2026-01-01T09:00:00Z")

    const classStyle = getTimeGridTimeslotClassStyle({
      date: slot,
      row: 0,
      col: 0,
      isFirstSplit: true,
      isDisabled: false,
      animateTimeslotAlways: false,
      availabilityAnimEnabled: false,
      timeslotHeight: 15,
      timeHoursOffset: Temporal.Duration.from({ hours: 9 }),
      absoluteMinutes: 9 * 60,
      splitStartHoursOffset: Temporal.Duration.from({ hours: 9 }),
      timezoneOffset: Temporal.Duration.from({ minutes: 0 }),
      curTimeslot: { row: -1, col: -1 },
      editing: false,
      isColConsecutive: () => true,
      daysLength: 1,
      firstSplitLength: 1,
      lastRow: 0,
      state: states.HEATMAP,
      overlayAvailability: false,
      dragType: DRAG_TYPES.ADD,
      availabilityType: availabilityTypes.AVAILABLE,
      availability: new ZdtSet(),
      ifNeeded: new ZdtSet(),
      tempTimes: new ZdtSet(),
      responsesFormatted: new ZdtMap(),
      parsedResponses: {},
      curRespondent: "",
      curRespondents: [],
      curRespondentsSet: new Set<string>(),
      respondents: [{ _id: "user-1" }, { _id: "user-2" }],
      curRespondentsMax: 0,
      max: 2,
      defaultState: states.HEATMAP,
      userHasResponded: false,
      curGuestId: "",
      authUserId: undefined,
      inDragRange: () => false,
    })

    expect(classStyle.style.backgroundColor).toBe(
      "var(--timeful-unavailable-bg-time-grid)",
    )
    expect(classStyle.style.borderLeftStyle).toBe("solid")
    expect(classStyle.style.borderRightStyle).toBe("solid")
    expect(classStyle.style.borderLeftColor).toBe(
      "var(--timeful-grid-line-color)",
    )
    expect(classStyle.style.borderRightColor).toBe(
      "var(--timeful-grid-line-color)",
    )
    expect(classStyle.style.borderBottomColor).toBe(
      "var(--timeful-grid-line-color)",
    )
  })

  it("uses the timed-grid unavailable token for zero-response heatmap slots", () => {
    const slot = zdt("2026-01-01T09:00:00Z")

    const classStyle = getTimeGridTimeslotClassStyle({
      date: slot,
      row: 0,
      col: 0,
      isFirstSplit: true,
      isDisabled: false,
      animateTimeslotAlways: false,
      availabilityAnimEnabled: false,
      timeslotHeight: 15,
      timeHoursOffset: Temporal.Duration.from({ hours: 9 }),
      splitStartHoursOffset: Temporal.Duration.from({ hours: 9 }),
      timezoneOffset: Temporal.Duration.from({ minutes: 0 }),
      curTimeslot: { row: -1, col: -1 },
      editing: false,
      isColConsecutive: () => true,
      daysLength: 1,
      firstSplitLength: 1,
      lastRow: 0,
      state: states.HEATMAP,
      overlayAvailability: false,
      dragType: DRAG_TYPES.ADD,
      availabilityType: availabilityTypes.AVAILABLE,
      availability: new ZdtSet(),
      ifNeeded: new ZdtSet(),
      tempTimes: new ZdtSet(),
      responsesFormatted: new ZdtMap(),
      parsedResponses: {},
      curRespondent: "",
      curRespondents: [],
      curRespondentsSet: new Set<string>(),
      respondents: [],
      curRespondentsMax: 0,
      max: 0,
      defaultState: states.HEATMAP,
      userHasResponded: false,
      curGuestId: "",
      authUserId: undefined,
      inDragRange: () => false,
    })

    expect(classStyle.style.backgroundColor).toBe(
      "var(--timeful-unavailable-bg-time-grid)",
    )
  })

  it("uses the legacy strong heatmap tint for a peak that excludes displayed respondents", () => {
    const slot = zdt("2026-01-01T09:00:00Z")
    const getHeatmapClassStyle = ({
      slotRespondents,
      max,
    }: {
      slotRespondents: Set<string>
      max: number
    }) => {
      const responsesFormatted = new ZdtMap<Set<string>>()
      responsesFormatted.set(slot, slotRespondents)

      return getTimeGridTimeslotClassStyle({
        date: slot,
        row: 0,
        col: 0,
        isFirstSplit: true,
        isDisabled: false,
        animateTimeslotAlways: false,
        availabilityAnimEnabled: false,
        timeslotHeight: 15,
        timeHoursOffset: Temporal.Duration.from({ hours: 9 }),
        splitStartHoursOffset: Temporal.Duration.from({ hours: 9 }),
        timezoneOffset: Temporal.Duration.from({ minutes: 0 }),
        curTimeslot: { row: -1, col: -1 },
        editing: false,
        isColConsecutive: () => true,
        daysLength: 1,
        firstSplitLength: 1,
        lastRow: 0,
        state: states.HEATMAP,
        overlayAvailability: false,
        dragType: DRAG_TYPES.ADD,
        availabilityType: availabilityTypes.AVAILABLE,
        availability: new ZdtSet(),
        ifNeeded: new ZdtSet(),
        tempTimes: new ZdtSet(),
        responsesFormatted,
        parsedResponses: {
          "guest-1": {
            user: { _id: "guest-1" },
            availability: new ZdtSet([slot]),
            ifNeeded: new ZdtSet(),
            enabledCalendars: undefined,
            calendarOptions: undefined,
            guest: true,
            guestId: "guest-1",
            guestEditPolicy: "protected",
            guestOwnershipMode: "token",
          },
          "guest-2": {
            user: { _id: "guest-2" },
            availability: new ZdtSet(),
            ifNeeded: new ZdtSet(),
            enabledCalendars: undefined,
            calendarOptions: undefined,
            guest: true,
            guestId: "guest-2",
            guestEditPolicy: "protected",
            guestOwnershipMode: "token",
          },
        },
        curRespondent: "",
        curRespondents: [],
        curRespondentsSet: new Set<string>(),
        respondents: [{ _id: "guest-1" }, { _id: "guest-2" }],
        curRespondentsMax: 0,
        max,
        defaultState: states.HEATMAP,
        userHasResponded: false,
        curGuestId: "guest-2",
        authUserId: undefined,
        inDragRange: () => false,
      })
    }

    const classStyle = getHeatmapClassStyle({
      slotRespondents: new Set(["guest-1"]),
      max: 1,
    })

    expect(classStyle.style.backgroundColor).toBe("#00994CE1")
    expect(
      getHeatmapClassStyle({
        slotRespondents: new Set(["guest-1", "guest-2"]),
        max: 2,
      }).style.backgroundColor,
    ).toBe("#00994CFF")
  })

  it("renders specific-times heatmap slots with the normal unavailable token before any responses exist", () => {
    const slot = zdt("2026-01-01T09:00:00Z")

    const [classStyle] = buildTimeGridTimeslotClassStyles({
      firstSplitTimes: [{ hoursOffset: Temporal.Duration.from({ hours: 9 }) }],
      secondSplitTimes: [],
      getDateFromRowCol: () => slot,
      state: states.HEATMAP,
      overlayAvailability: false,
      dragType: DRAG_TYPES.ADD,
      availabilityType: availabilityTypes.AVAILABLE,
      availability: new ZdtSet(),
      ifNeeded: new ZdtSet(),
      tempTimes: new ZdtSet(),
      responsesFormatted: new ZdtMap(),
      parsedResponses: {},
      curRespondent: "",
      curRespondents: [],
      curRespondentsSet: new Set<string>(),
      respondents: [],
      curRespondentsMax: 0,
      max: 0,
      defaultState: states.HEATMAP,
      userHasResponded: false,
      curGuestId: "",
      authUserId: undefined,
      inDragRange: () => false,
      animateTimeslotAlways: false,
      availabilityAnimEnabled: false,
      timeslotHeight: 15,
      timezoneOffset: Temporal.Duration.from({ minutes: 0 }),
      curTimeslot: { row: -1, col: -1 },
      editing: false,
      isColConsecutive: () => true,
      daysLength: 1,
      firstSplitLength: 1,
      lastRow: 0,
    })

    expect(classStyle.style.backgroundColor).toBe(
      "var(--timeful-unavailable-bg-time-grid)",
    )
  })

  it("keeps selected specific-times slots white when respondents are available", () => {
    const slot = zdt("2026-01-01T09:00:00Z")
    const responsesFormatted = new ZdtMap<Set<string>>()
    responsesFormatted.set(slot, new Set(["guest-1"]))

    const classStyle = getTimeGridTimeslotClassStyle({
      date: slot,
      row: 0,
      col: 0,
      isFirstSplit: true,
      isDisabled: false,
      animateTimeslotAlways: false,
      availabilityAnimEnabled: false,
      timeslotHeight: 15,
      timeHoursOffset: Temporal.Duration.from({ hours: 9 }),
      splitStartHoursOffset: Temporal.Duration.from({ hours: 9 }),
      timezoneOffset: Temporal.Duration.from({ minutes: 0 }),
      curTimeslot: { row: -1, col: -1 },
      editing: false,
      isColConsecutive: () => true,
      daysLength: 1,
      firstSplitLength: 1,
      lastRow: 0,
      state: states.SET_SPECIFIC_TIMES,
      overlayAvailability: false,
      dragType: DRAG_TYPES.ADD,
      availabilityType: availabilityTypes.AVAILABLE,
      availability: new ZdtSet(),
      ifNeeded: new ZdtSet(),
      tempTimes: new ZdtSet([slot]),
      responsesFormatted,
      parsedResponses: {
        "guest-1": {
          user: { _id: "guest-1" },
          availability: new ZdtSet([slot]),
          ifNeeded: new ZdtSet(),
          enabledCalendars: undefined,
          calendarOptions: undefined,
          guest: true,
          guestId: "guest-1",
          guestEditPolicy: "protected",
          guestOwnershipMode: "token",
        },
      },
      curRespondent: "",
      curRespondents: [],
      curRespondentsSet: new Set<string>(),
      respondents: [{ _id: "guest-1" }],
      curRespondentsMax: 0,
      max: 1,
      defaultState: states.HEATMAP,
      userHasResponded: false,
      curGuestId: "",
      authUserId: undefined,
      inDragRange: () => false,
    })

    expect(classStyle.class).toContain("tw:bg-white")
    expect(classStyle.style.backgroundColor).toBeUndefined()
  })

  it("renders enabled but inactive specific-times slots light-grey", () => {
    const slot = zdt("2026-01-01T09:00:00Z")

    const classStyle = getTimeGridTimeslotClassStyle({
      date: slot,
      row: 0,
      col: 0,
      isFirstSplit: true,
      isDisabled: false,
      animateTimeslotAlways: false,
      availabilityAnimEnabled: false,
      timeslotHeight: 15,
      timeHoursOffset: Temporal.Duration.from({ hours: 9 }),
      splitStartHoursOffset: Temporal.Duration.from({ hours: 9 }),
      timezoneOffset: Temporal.Duration.from({ minutes: 0 }),
      curTimeslot: { row: -1, col: -1 },
      editing: false,
      isColConsecutive: () => true,
      daysLength: 1,
      firstSplitLength: 1,
      lastRow: 0,
      state: states.SET_SPECIFIC_TIMES,
      overlayAvailability: false,
      dragType: DRAG_TYPES.ADD,
      availabilityType: availabilityTypes.AVAILABLE,
      availability: new ZdtSet(),
      ifNeeded: new ZdtSet(),
      tempTimes: new ZdtSet(),
      responsesFormatted: new ZdtMap(),
      parsedResponses: {},
      curRespondent: "",
      curRespondents: [],
      curRespondentsSet: new Set<string>(),
      respondents: [],
      curRespondentsMax: 0,
      max: 0,
      defaultState: states.HEATMAP,
      userHasResponded: false,
      curGuestId: "",
      authUserId: undefined,
      inDragRange: () => false,
    })

    expect(classStyle.class).toContain("tw:bg-light-gray-stroke")
    expect(classStyle.class).not.toContain("tw:bg-gray")
  })

  it("marks zero-response timed-grid slots in heatmap view for a foreground selection cursor", () => {
    const slot = zdt("2026-01-01T09:00:00Z")

    const classStyle = getTimeGridTimeslotClassStyle({
      date: slot,
      row: 0,
      col: 0,
      isFirstSplit: true,
      isDisabled: false,
      animateTimeslotAlways: false,
      availabilityAnimEnabled: false,
      timeslotHeight: 15,
      timeHoursOffset: Temporal.Duration.from({ hours: 9 }),
      splitStartHoursOffset: Temporal.Duration.from({ hours: 9 }),
      timezoneOffset: Temporal.Duration.from({ minutes: 0 }),
      curTimeslot: { row: 0, col: 0 },
      editing: false,
      isColConsecutive: () => true,
      daysLength: 1,
      firstSplitLength: 1,
      lastRow: 0,
      state: states.HEATMAP,
      overlayAvailability: false,
      dragType: DRAG_TYPES.ADD,
      availabilityType: availabilityTypes.AVAILABLE,
      availability: new ZdtSet(),
      ifNeeded: new ZdtSet(),
      tempTimes: new ZdtSet(),
      responsesFormatted: new ZdtMap(),
      parsedResponses: {},
      curRespondent: "",
      curRespondents: [],
      curRespondentsSet: new Set<string>(),
      respondents: [],
      curRespondentsMax: 0,
      max: 0,
      defaultState: states.HEATMAP,
      userHasResponded: false,
      curGuestId: "",
      authUserId: undefined,
      inDragRange: () => false,
    })

    expect(classStyle.class).toContain("tw:relative")
    expect(classStyle.class).toContain(
      "schedule-overlap-time-grid__selected-timeslot",
    )
    expect(classStyle.class).not.toContain("tw:z-10")
    expect(classStyle.style.boxShadow).toBeUndefined()
    expect(classStyle.style.backgroundImage).toBeUndefined()
  })

  it("does not draw the selection border for disabled grey gap cells", () => {
    const classStyle = getTimeGridTimeslotClassStyle({
      date: null,
      row: 0,
      col: 0,
      isFirstSplit: true,
      isDisabled: true,
      animateTimeslotAlways: false,
      availabilityAnimEnabled: false,
      timeslotHeight: 15,
      timeHoursOffset: Temporal.Duration.from({ hours: 9 }),
      splitStartHoursOffset: Temporal.Duration.from({ hours: 9 }),
      timezoneOffset: Temporal.Duration.from({ minutes: 0 }),
      curTimeslot: { row: 0, col: 0 },
      editing: false,
      isColConsecutive: () => true,
      daysLength: 1,
      firstSplitLength: 1,
      lastRow: 0,
      state: states.HEATMAP,
      overlayAvailability: false,
      dragType: DRAG_TYPES.ADD,
      availabilityType: availabilityTypes.AVAILABLE,
      availability: new ZdtSet(),
      ifNeeded: new ZdtSet(),
      tempTimes: new ZdtSet(),
      responsesFormatted: new ZdtMap(),
      parsedResponses: {},
      curRespondent: "",
      curRespondents: [],
      curRespondentsSet: new Set<string>(),
      respondents: [],
      curRespondentsMax: 0,
      max: 0,
      defaultState: states.HEATMAP,
      userHasResponded: false,
      curGuestId: "",
      authUserId: undefined,
      inDragRange: () => false,
    })

    expect(classStyle.class).not.toContain("tw:border-dashed")
    expect(classStyle.class).not.toContain("tw:border-black")
  })

  it("renders days outside the included domain with the timed-grid disabled gray", () => {
    const slot = zdt("2026-01-01T09:00:00Z")

    const classStyle = getDayGridTimeslotClassStyle({
      date: slot,
      row: 0,
      col: 0,
      monthDayIncluded: new ZdtMap<boolean>(),
      curTimeslot: { row: -1, col: -1 },
      lastMonthRow: 0,
      state: states.BEST_TIMES,
      overlayAvailability: false,
      dragType: DRAG_TYPES.ADD,
      availabilityType: availabilityTypes.AVAILABLE,
      availability: new ZdtSet(),
      ifNeeded: new ZdtSet(),
      tempTimes: new ZdtSet(),
      responsesFormatted: new ZdtMap(),
      parsedResponses: {},
      curRespondent: "",
      curRespondents: [],
      curRespondentsSet: new Set<string>(),
      respondents: [],
      curRespondentsMax: 0,
      max: 0,
      defaultState: states.BEST_TIMES,
      userHasResponded: false,
      curGuestId: "",
      authUserId: undefined,
      inDragRange: () => false,
    })

    expect(classStyle.class).toContain("tw:bg-gray")
    expect(classStyle.class).toContain("tw:text-dark-gray")
    expect(classStyle.class).not.toContain("tw:bg-off-white")
    expect(classStyle.class).not.toContain("tw:text-gray")
  })

  it("frames active day-grid slots without replacing their grid borders", () => {
    const slot = zdt("2026-01-01T09:00:00Z")
    const monthDayIncluded = new ZdtMap<boolean>()
    monthDayIncluded.set(slot, true)

    const classStyle = getDayGridTimeslotClassStyle({
      date: slot,
      row: 0,
      col: 0,
      monthDayIncluded,
      curTimeslot: { row: 0, col: 0 },
      lastMonthRow: 0,
      state: states.BEST_TIMES,
      overlayAvailability: false,
      dragType: DRAG_TYPES.ADD,
      availabilityType: availabilityTypes.AVAILABLE,
      availability: new ZdtSet(),
      ifNeeded: new ZdtSet(),
      tempTimes: new ZdtSet(),
      responsesFormatted: new ZdtMap(),
      parsedResponses: {},
      curRespondent: "",
      curRespondents: [],
      curRespondentsSet: new Set<string>(),
      respondents: [{ _id: "user-1" }],
      curRespondentsMax: 0,
      max: 1,
      defaultState: states.BEST_TIMES,
      userHasResponded: false,
      curGuestId: "",
      authUserId: undefined,
      inDragRange: () => false,
    })

    expect(classStyle.class).toContain("tw:relative")
    expect(classStyle.class).toContain(
      "schedule-overlap-days-only-grid__selected-timeslot",
    )
    expect(classStyle.class).not.toContain("tw:outline-2")
    expect(classStyle.style.borderLeftStyle).toBe("solid")
    expect(classStyle.style.borderRightStyle).toBe("dashed")
    expect(classStyle.style.borderTopStyle).toBe("solid")
    expect(classStyle.style.borderBottomStyle).toBe("solid")
  })

  it("uses the timed-grid unavailable token for zero-availability best-times slots", () => {
    const slot = zdt("2026-01-01T09:00:00Z")

    const classStyle = getTimeGridTimeslotClassStyle({
      date: slot,
      row: 0,
      col: 0,
      isFirstSplit: true,
      isDisabled: false,
      animateTimeslotAlways: false,
      availabilityAnimEnabled: false,
      timeslotHeight: 15,
      timeHoursOffset: Temporal.Duration.from({ hours: 9 }),
      splitStartHoursOffset: Temporal.Duration.from({ hours: 9 }),
      timezoneOffset: Temporal.Duration.from({ minutes: 0 }),
      curTimeslot: { row: -1, col: -1 },
      editing: false,
      isColConsecutive: () => true,
      daysLength: 1,
      firstSplitLength: 1,
      lastRow: 0,
      state: states.BEST_TIMES,
      overlayAvailability: false,
      dragType: DRAG_TYPES.ADD,
      availabilityType: availabilityTypes.AVAILABLE,
      availability: new ZdtSet(),
      ifNeeded: new ZdtSet(),
      tempTimes: new ZdtSet(),
      responsesFormatted: new ZdtMap(),
      parsedResponses: {},
      curRespondent: "",
      curRespondents: [],
      curRespondentsSet: new Set<string>(),
      respondents: [{ _id: "user-1" }, { _id: "user-2" }],
      curRespondentsMax: 0,
      max: 2,
      defaultState: states.BEST_TIMES,
      userHasResponded: false,
      curGuestId: "",
      authUserId: undefined,
      inDragRange: () => false,
    })

    expect(classStyle.style.backgroundColor).toBe(
      "var(--timeful-unavailable-bg-time-grid)",
    )
    expect(classStyle.style.borderLeftStyle).toBe("solid")
    expect(classStyle.style.borderRightStyle).toBe("solid")
    expect(classStyle.style.borderLeftColor).toBe(
      "var(--timeful-grid-line-color)",
    )
    expect(classStyle.style.borderRightColor).toBe(
      "var(--timeful-grid-line-color)",
    )
    expect(classStyle.style.borderBottomColor).toBe(
      "var(--timeful-grid-line-color)",
    )
  })

  it("uses the timed-grid unavailable token for zero-response best-times slots", () => {
    const slot = zdt("2026-01-01T09:00:00Z")

    const classStyle = getTimeGridTimeslotClassStyle({
      date: slot,
      row: 0,
      col: 0,
      isFirstSplit: true,
      isDisabled: false,
      animateTimeslotAlways: false,
      availabilityAnimEnabled: false,
      timeslotHeight: 15,
      timeHoursOffset: Temporal.Duration.from({ hours: 9 }),
      splitStartHoursOffset: Temporal.Duration.from({ hours: 9 }),
      timezoneOffset: Temporal.Duration.from({ minutes: 0 }),
      curTimeslot: { row: -1, col: -1 },
      editing: false,
      isColConsecutive: () => true,
      daysLength: 1,
      firstSplitLength: 1,
      lastRow: 0,
      state: states.BEST_TIMES,
      overlayAvailability: false,
      dragType: DRAG_TYPES.ADD,
      availabilityType: availabilityTypes.AVAILABLE,
      availability: new ZdtSet(),
      ifNeeded: new ZdtSet(),
      tempTimes: new ZdtSet(),
      responsesFormatted: new ZdtMap(),
      parsedResponses: {},
      curRespondent: "",
      curRespondents: [],
      curRespondentsSet: new Set<string>(),
      respondents: [],
      curRespondentsMax: 0,
      max: 0,
      defaultState: states.BEST_TIMES,
      userHasResponded: false,
      curGuestId: "",
      authUserId: undefined,
      inDragRange: () => false,
    })

    expect(classStyle.style.backgroundColor).toBe(
      "var(--timeful-unavailable-bg-time-grid)",
    )
  })

  it("renders specific-times best-times slots with the normal unavailable token before any responses exist", () => {
    const slot = zdt("2026-01-01T09:00:00Z")

    const [classStyle] = buildTimeGridTimeslotClassStyles({
      firstSplitTimes: [{ hoursOffset: Temporal.Duration.from({ hours: 9 }) }],
      secondSplitTimes: [],
      getDateFromRowCol: () => slot,
      state: states.BEST_TIMES,
      overlayAvailability: false,
      dragType: DRAG_TYPES.ADD,
      availabilityType: availabilityTypes.AVAILABLE,
      availability: new ZdtSet(),
      ifNeeded: new ZdtSet(),
      tempTimes: new ZdtSet(),
      responsesFormatted: new ZdtMap(),
      parsedResponses: {},
      curRespondent: "",
      curRespondents: [],
      curRespondentsSet: new Set<string>(),
      respondents: [],
      curRespondentsMax: 0,
      max: 0,
      defaultState: states.BEST_TIMES,
      userHasResponded: false,
      curGuestId: "",
      authUserId: undefined,
      inDragRange: () => false,
      animateTimeslotAlways: false,
      availabilityAnimEnabled: false,
      timeslotHeight: 15,
      timezoneOffset: Temporal.Duration.from({ minutes: 0 }),
      curTimeslot: { row: -1, col: -1 },
      editing: false,
      isColConsecutive: () => true,
      daysLength: 1,
      firstSplitLength: 1,
      lastRow: 0,
    })

    expect(classStyle.style.backgroundColor).toBe(
      "var(--timeful-unavailable-bg-time-grid)",
    )
  })

  it("keeps standalone day-grid cells framed when Tailwind preflight is disabled", () => {
    const classStyle = getTimeGridTimeslotClassStyle({
      date: zdt("2026-01-02T09:00:00Z"),
      row: 0,
      col: 1,
      isFirstSplit: true,
      isDisabled: false,
      animateTimeslotAlways: false,
      availabilityAnimEnabled: false,
      timeslotHeight: 15,
      timeHoursOffset: Temporal.Duration.from({ hours: 9 }),
      splitStartHoursOffset: Temporal.Duration.from({ hours: 9 }),
      timezoneOffset: Temporal.Duration.from({ minutes: 0 }),
      curTimeslot: { row: -1, col: -1 },
      editing: false,
      isColConsecutive: (col) => col !== 1,
      daysLength: 3,
      firstSplitLength: 1,
      lastRow: 0,
      state: states.BEST_TIMES,
      overlayAvailability: false,
      dragType: DRAG_TYPES.ADD,
      availabilityType: availabilityTypes.AVAILABLE,
      availability: new ZdtSet(),
      ifNeeded: new ZdtSet(),
      tempTimes: new ZdtSet(),
      responsesFormatted: new ZdtMap(),
      parsedResponses: {},
      curRespondent: "",
      curRespondents: [],
      curRespondentsSet: new Set<string>(),
      respondents: [{ _id: "user-1" }],
      curRespondentsMax: 0,
      max: 1,
      defaultState: states.BEST_TIMES,
      userHasResponded: false,
      curGuestId: "",
      authUserId: undefined,
      inDragRange: () => false,
    })

    expect(classStyle.style.borderLeftStyle).toBe("solid")
    expect(classStyle.style.borderRightStyle).toBe("solid")
    expect(classStyle.class).toContain("tw:border-l")
    expect(classStyle.class).toContain("tw:border-r")
    expect(classStyle.class).not.toContain("tw:border-l-gray")
    expect(classStyle.class).not.toContain("tw:border-r-gray")
  })

  it("uses strong vertical separators at non-consecutive date boundaries in the default timed grid", () => {
    const classStyle = getTimeGridTimeslotClassStyle({
      date: zdt("2026-01-02T09:00:00Z"),
      row: 0,
      col: 1,
      isFirstSplit: true,
      isDisabled: false,
      animateTimeslotAlways: false,
      availabilityAnimEnabled: false,
      timeslotHeight: 15,
      timeHoursOffset: Temporal.Duration.from({ hours: 9 }),
      splitStartHoursOffset: Temporal.Duration.from({ hours: 9 }),
      timezoneOffset: Temporal.Duration.from({ minutes: 0 }),
      curTimeslot: { row: -1, col: -1 },
      editing: false,
      isColConsecutive: (col) => col !== 1,
      daysLength: 3,
      firstSplitLength: 1,
      lastRow: 0,
      state: states.BEST_TIMES,
      overlayAvailability: false,
      dragType: DRAG_TYPES.ADD,
      availabilityType: availabilityTypes.AVAILABLE,
      availability: new ZdtSet(),
      ifNeeded: new ZdtSet(),
      tempTimes: new ZdtSet(),
      responsesFormatted: new ZdtMap(),
      parsedResponses: {},
      curRespondent: "",
      curRespondents: [],
      curRespondentsSet: new Set<string>(),
      respondents: [{ _id: "user-1" }, { _id: "user-2" }],
      curRespondentsMax: 0,
      max: 2,
      defaultState: states.BEST_TIMES,
      userHasResponded: false,
      curGuestId: "",
      authUserId: undefined,
      inDragRange: () => false,
    })

    expect(classStyle.style.borderLeftColor).toBe(
      "var(--timeful-grid-line-color)",
    )
    expect(classStyle.style.borderRightColor).toBe(
      "var(--timeful-grid-line-color)",
    )
    expect(classStyle.style.borderBottomColor).toBe(
      "var(--timeful-grid-line-color)",
    )
  })
})

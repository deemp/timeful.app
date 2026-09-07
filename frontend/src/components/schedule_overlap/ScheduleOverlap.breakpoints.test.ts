import { describe, expect, it } from "vitest"
import { MIN_COLLAPSIBLE_HIDDEN_SPAN_HOURS } from "@/composables/schedule_overlap/types"
import { SCHEDULE_OVERLAP_COMPACT_DESKTOP_BREAKPOINT } from "./scheduleOverlapBreakpoints"
import scheduleOverlapSource from "./ScheduleOverlap.vue?raw"
import scheduleOverlapSidebarSource from "./ScheduleOverlapSidebar.vue?raw"
import scheduleOverlapTimeGridSource from "./ScheduleOverlapTimeGrid.vue?raw"
import scheduleOverlapDaysOnlyGridSource from "./ScheduleOverlapDaysOnlyGrid.vue?raw"

describe("ScheduleOverlap breakpoints", () => {
  it("switches the sidebar layout to the standard sm breakpoint", () => {
    expect(scheduleOverlapSource).toContain(
      'class="schedule-overlap-layout tw:flex"',
    )
    expect(scheduleOverlapSource).toContain(
      `:class="isPhone ? 'tw:flex-col' : 'tw:flex-row'"`,
    )
    expect(scheduleOverlapSidebarSource).toContain("sidebar.isPhone")
  })

  it("keeps the stacked-to-side-by-side breakpoint at sm while forcing the compact desktop grid pane to fill the row", () => {
    expect(scheduleOverlapSource).toContain(
      "SCHEDULE_OVERLAP_COMPACT_DESKTOP_BREAKPOINT",
    )
    expect(scheduleOverlapSource).toContain(
      'class="schedule-overlap-layout__grid-pane tw:flex tw:grow tw:px-4"',
    )
    expect(scheduleOverlapSource).toContain(
      "@media (min-width: 640px) and (max-width: 767px)",
    )
    expect(scheduleOverlapSource).toContain("flex: 1 1 0%;")
  })

  it("keeps the compact-desktop breakpoint constant at 640", () => {
    expect(SCHEDULE_OVERLAP_COMPACT_DESKTOP_BREAKPOINT).toBe(640)
  })

  it("collapses runs of three or more inactive hours", () => {
    expect(MIN_COLLAPSIBLE_HIDDEN_SPAN_HOURS).toBe(3)
  })

  it("stretches timed and days-only grid columns across the compact desktop width helper", () => {
    expect(scheduleOverlapTimeGridSource).toContain(
      'class="schedule-overlap-time-grid__content tw:min-w-0 tw:grow"',
    )
    expect(scheduleOverlapTimeGridSource).toContain(
      "schedule-overlap-time-grid__day-column",
    )
    expect(scheduleOverlapTimeGridSource).toContain(
      "@media (min-width: 640px) and (max-width: 767px)",
    )
    expect(scheduleOverlapTimeGridSource).toContain("width: 100%;")
    expect(scheduleOverlapTimeGridSource).toContain("flex: 1 1 0%;")
    expect(scheduleOverlapDaysOnlyGridSource).toContain(
      'class="schedule-overlap-days-only-grid tw:grow"',
    )
    expect(scheduleOverlapDaysOnlyGridSource).toContain(
      'class="schedule-overlap-days-only-grid__month tw:grid tw:grid-cols-7"',
    )
    expect(scheduleOverlapDaysOnlyGridSource).toContain(
      "@media (min-width: 640px) and (max-width: 767px)",
    )
    expect(scheduleOverlapDaysOnlyGridSource).toContain("width: 100%;")
  })

  it("uses matching responsive pager button dimensions for timed and days-only grids", () => {
    const pagerButtonClasses =
      "tw:h-8 tw:w-8 tw:min-w-8 tw:border-outline-neutral tw:sm:h-[36px] tw:sm:w-[36px] tw:sm:min-w-[36px]"

    expect(scheduleOverlapTimeGridSource).toContain(pagerButtonClasses)
    expect(scheduleOverlapDaysOnlyGridSource).toContain(pagerButtonClasses)
  })
})

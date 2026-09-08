// @vitest-environment happy-dom

import { computed, defineComponent, nextTick, ref } from "vue"
import { mount } from "@vue/test-utils"
import { afterEach, describe, expect, it, vi } from "vitest"
import { useTimedGridInteractions } from "./useTimedGridInteractions"
import { joinTooltipSegments } from "./scheduleOverlapRendering"

const mountedWrappers: ReturnType<typeof mount>[] = []

afterEach(() => {
  for (const wrapper of mountedWrappers.splice(0)) wrapper.unmount()
  document.body.replaceChildren()
  vi.restoreAllMocks()
})

const mountInteractions = (
  phone = false,
  options?: {
    isSelectableSlot?: (row: number, col: number) => boolean
    clearSelectedSlot?: () => void
    markCurTimeslotInactive?: (collapsed?: boolean) => void
    resetGridOutside?: () => void
    deselectGridOutside?: () => void
    interactable?: boolean
    daysOnly?: boolean
  },
) => {
  const isPhone = ref(phone)
  const dragging = ref(false)
  const dragCur = ref<{ row: number; col: number } | null>(null)
  const timeslotSelected = ref(false)
  const tooltipContent = ref<{ text: string; mono: boolean }[]>([])
  const showAvailability = vi.fn()
  const highlightAvailability = vi.fn()
  const startDrag = vi.fn(() => {
    dragging.value = true
    dragCur.value = { row: 1, col: 0 }
  })
  const moveDrag = vi.fn()
  const endDrag = vi.fn(() => {
    dragging.value = false
    dragCur.value = null
  })
  let interactions!: ReturnType<typeof useTimedGridInteractions>
  const Harness = defineComponent({
    setup() {
      interactions = useTimedGridInteractions({
        isPhone: computed(() => isPhone.value),
        daysOnly: computed(() => options?.daysOnly ?? false),
        interactable: computed(() => options?.interactable ?? true),
        dragging,
        dragCur,
        timeslotSelected,
        tooltipContent,
        startDrag,
        moveDrag,
        endDrag,
        showAvailability,
        shouldHighlightAvailability: () => true,
        highlightAvailability,
        isSelectableSlot: options?.isSelectableSlot ?? (() => true),
        clearSelectedSlot: options?.clearSelectedSlot,
        markCurTimeslotInactive: options?.markCurTimeslotInactive,
        resetGridOutside: options?.resetGridOutside,
        deselectGridOutside: options?.deselectGridOutside,
        getTooltipContent: (row, col) => [
          { text: `slot-${String(row)}-${String(col)}`, mono: false },
        ],
      })
      return () => null
    },
  })
  const wrapper = mount(Harness)
  mountedWrappers.push(wrapper)

  return {
    isPhone,
    dragging,
    dragCur,
    timeslotSelected,
    tooltipContent,
    showAvailability,
    highlightAvailability,
    startDrag,
    moveDrag,
    endDrag,
    interactions,
    wrapper,
  }
}

const appendSlot = (
  row: number,
  col: number,
  top: number | (() => number) = 80,
) => {
  const cell = document.createElement("div")
  cell.className = "timeslot"
  cell.dataset.row = String(row)
  cell.dataset.col = String(col)
  cell.getBoundingClientRect = () =>
    ({
      left: 40,
      top: typeof top === "function" ? top() : top,
      width: 120,
      height: 20,
    }) as DOMRect
  const dragSection =
    document.querySelector("#drag-section") ?? document.createElement("div")
  dragSection.id = "drag-section"
  dragSection.append(cell)
  if (!dragSection.parentElement) document.body.append(dragSection)
  return cell
}

describe("useTimedGridInteractions", () => {
  it("retains a clicked mobile cell through scroll-generated hover until another click or dismissal", () => {
    let top = 140
    appendSlot(1, 0, () => top)
    appendSlot(2, 0, 180)
    const { interactions, tooltipContent, showAvailability } =
      mountInteractions(true)

    interactions.getTimeslotVon(1, 0).click()
    showAvailability.mockClear()
    top = 80
    window.dispatchEvent(new Event("scroll"))
    interactions.getTimeslotVon(2, 0).mouseover()

    expect(interactions.selectedTooltipSlot.value).toEqual({ row: 1, col: 0 })
    expect(joinTooltipSegments(tooltipContent.value)).toBe("slot-1-0")
    expect(interactions.tooltipPosition.value).toEqual({
      x: 100,
      y: 100,
      placement: "below",
    })
    expect(showAvailability).not.toHaveBeenCalled()

    interactions.getTimeslotVon(2, 0).click()
    expect(interactions.selectedTooltipSlot.value).toEqual({ row: 2, col: 0 })
    expect(joinTooltipSegments(tooltipContent.value)).toBe("slot-2-0")

    document.body.dispatchEvent(new MouseEvent("click", { bubbles: true }))
    interactions.getTimeslotVon(1, 0).mouseover()
    expect(joinTooltipSegments(tooltipContent.value)).toBe("slot-1-0")
    interactions.getTimeslotVon(2, 0).mouseover()
    expect(joinTooltipSegments(tooltipContent.value)).toBe("slot-2-0")
  })

  it("retains the mobile drag endpoint through mouseover after release", () => {
    const first = appendSlot(1, 0)
    const second = appendSlot(2, 0)
    const { interactions, moveDrag, dragCur, tooltipContent } =
      mountInteractions(true)
    interactions.startTimedGridDrag({
      target: first,
    } as unknown as PointerEvent)
    moveDrag.mockImplementation(() => {
      dragCur.value = { row: 2, col: 0 }
    })
    interactions.moveTimedGridDrag({
      target: second,
    } as unknown as PointerEvent)
    interactions.endTimedGridDrag({ target: second } as unknown as PointerEvent)
    interactions.getTimeslotVon(1, 0).mouseover()
    expect(interactions.selectedTooltipSlot.value).toEqual({ row: 2, col: 0 })
    expect(joinTooltipSegments(tooltipContent.value)).toBe("slot-2-0")
  })

  it("registers and removes its outside-grid handler in capture phase", () => {
    const addEventListener = vi.spyOn(document, "addEventListener")
    const removeEventListener = vi.spyOn(document, "removeEventListener")
    const { wrapper } = mountInteractions(true)

    expect(addEventListener).toHaveBeenCalledWith(
      "click",
      expect.any(Function),
      true,
    )

    wrapper.unmount()
    mountedWrappers.splice(mountedWrappers.indexOf(wrapper), 1)
    expect(removeEventListener).toHaveBeenCalledWith(
      "click",
      expect.any(Function),
      true,
    )
  })

  it("anchors a mobile click and dismisses it from a capture-phase outside click", () => {
    appendSlot(1, 0)
    const { interactions, tooltipContent } = mountInteractions(true)

    interactions.getTimeslotVon(1, 0).click()

    expect(interactions.selectedTooltipSlot.value).toEqual({ row: 1, col: 0 })
    expect(interactions.tooltipPosition.value).toEqual({
      x: 100,
      y: 100,
      placement: "below",
    })
    expect(joinTooltipSegments(tooltipContent.value)).toBe("slot-1-0")

    document.body.dispatchEvent(new MouseEvent("click", { bubbles: true }))

    expect(interactions.selectedTooltipSlot.value).toBeNull()
    expect(interactions.tooltipPosition.value).toBeNull()
    expect(tooltipContent.value).toEqual([])
  })

  it("uses cursor coordinates on desktop and clears them on cell leave", () => {
    const { interactions, tooltipContent } = mountInteractions()

    interactions.moveTimedGridDrag({ clientX: 150, clientY: 280 } as MouseEvent)
    expect(interactions.tooltipPosition.value).toEqual({ x: 150, y: 280 })

    interactions.getTimeslotVon(1, 0).mouseleave()
    expect(interactions.tooltipPosition.value).toBeNull()
    expect(tooltipContent.value).toEqual([])
  })

  it("selects a mobile anchor from a compatibility mouse target", () => {
    const cell = appendSlot(1, 0)
    const { interactions } = mountInteractions(true)
    vi.spyOn(document, "elementFromPoint").mockReturnValue(null)

    interactions.startTimedGridDrag({
      target: cell,
      clientX: 900,
      clientY: 700,
    } as unknown as MouseEvent)

    expect(interactions.selectedTooltipSlot.value).toEqual({ row: 1, col: 0 })
  })

  it("moves a mobile drag anchor to the current grid cell and retains it outside the grid", () => {
    appendSlot(1, 0, 80)
    appendSlot(2, 0, 100)
    const { interactions, dragging, dragCur, moveDrag } =
      mountInteractions(true)
    const outsideGrid = document.createElement("div")
    dragging.value = true
    dragCur.value = { row: 1, col: 0 }
    interactions.selectedTooltipSlot.value = { row: 1, col: 0 }
    moveDrag.mockImplementation(() => {
      dragCur.value = { row: 2, col: 0 }
    })

    const currentCell = document.querySelector<HTMLElement>(
      '#drag-section .timeslot[data-row="2"][data-col="0"]',
    )
    if (!currentCell) throw new Error("Expected current grid cell")

    interactions.moveTimedGridDrag({
      target: currentCell,
      clientX: 100,
      clientY: 110,
    } as unknown as MouseEvent)

    expect(interactions.selectedTooltipSlot.value).toEqual({ row: 2, col: 0 })
    expect(interactions.tooltipPosition.value).toEqual({
      x: 100,
      y: 100,
      placement: "above",
    })

    interactions.moveTimedGridDrag({
      target: outsideGrid,
      clientX: 900,
      clientY: 700,
    } as unknown as MouseEvent)

    expect(interactions.tooltipPosition.value).toEqual({
      x: 100,
      y: 100,
      placement: "above",
    })
  })

  it("shows and repositions the mobile tooltip for the current slot on hover and scroll", async () => {
    let top = 140
    appendSlot(1, 0, () => top)
    const { interactions, tooltipContent } = mountInteractions(true)

    interactions.getTimeslotVon(1, 0).mouseover()
    await nextTick()

    expect(interactions.selectedTooltipSlot.value).toEqual({ row: 1, col: 0 })
    expect(joinTooltipSegments(tooltipContent.value)).toBe("slot-1-0")
    expect(interactions.tooltipPosition.value).toEqual({
      x: 100,
      y: 140,
      placement: "above",
    })

    top = 80
    window.dispatchEvent(new Event("scroll"))

    expect(interactions.tooltipPosition.value).toEqual({
      x: 100,
      y: 100,
      placement: "below",
    })
  })

  it("does not set or anchor a tooltip on a non-selectable cell", () => {
    appendSlot(1, 0)
    const isSelectableSlot = vi.fn(
      (row: number, col: number) => !(row === 1 && col === 0),
    )
    const { interactions, tooltipContent } = mountInteractions(false, {
      isSelectableSlot,
    })

    interactions.getTimeslotVon(1, 0).mouseover()

    expect(isSelectableSlot).toHaveBeenCalledWith(1, 0)
    expect(tooltipContent.value).toEqual([])
    expect(interactions.tooltipPosition.value).toBeNull()

    const { interactions: phoneInteractions } = mountInteractions(true, {
      isSelectableSlot,
    })
    phoneInteractions.getTimeslotVon(1, 0).click()

    expect(phoneInteractions.selectedTooltipSlot.value).toBeNull()
    expect(phoneInteractions.tooltipPosition.value).toBeNull()
  })

  it("clears a stale hover tooltip when moving onto a non-selectable cell", () => {
    appendSlot(1, 0)
    const clearSelectedSlot = vi.fn()
    const { interactions, tooltipContent } = mountInteractions(false, {
      isSelectableSlot: (row, col) => !(row === 1 && col === 0),
      clearSelectedSlot,
    })

    interactions.getTimeslotVon(0, 0).mouseover()
    expect(joinTooltipSegments(tooltipContent.value)).toBe("slot-0-0")

    interactions.getTimeslotVon(1, 0).mouseover()

    expect(tooltipContent.value).toEqual([])
    expect(interactions.tooltipPosition.value).toBeNull()
    expect(clearSelectedSlot).toHaveBeenCalledTimes(1)
  })

  it("clears the dates-only frame when hovering a disabled cell on desktop", () => {
    const clearSelectedSlot = vi.fn()
    const { interactions, showAvailability } = mountInteractions(false, {
      daysOnly: true,
      isSelectableSlot: (row) => row === 0,
      clearSelectedSlot,
    })

    interactions.getTimeslotVon(0, 0).mouseover()
    interactions.getTimeslotVon(1, 0).mouseover()

    expect(showAvailability).toHaveBeenCalledTimes(2)
    expect(showAvailability).toHaveBeenCalledWith(0, 0)
    expect(showAvailability).toHaveBeenCalledWith(1, 0)
    expect(clearSelectedSlot).toHaveBeenCalledTimes(1)
  })

  it("clears the dates-only frame when tapping a disabled cell on mobile", () => {
    const clearSelectedSlot = vi.fn()
    const { interactions, showAvailability } = mountInteractions(true, {
      daysOnly: true,
      isSelectableSlot: (row) => row === 0,
      clearSelectedSlot,
    })

    interactions.getTimeslotVon(0, 0).click()
    interactions.getTimeslotVon(1, 0).click()

    expect(showAvailability).toHaveBeenCalledTimes(2)
    expect(showAvailability).toHaveBeenCalledWith(0, 0)
    expect(showAvailability).toHaveBeenCalledWith(1, 0)
    expect(clearSelectedSlot).toHaveBeenCalledTimes(1)
  })

  it("clears the dates-only frame when tapping outside the grid on mobile", () => {
    const deselectGridOutside = vi.fn()
    mountInteractions(true, {
      daysOnly: true,
      deselectGridOutside,
    })

    document.body.dispatchEvent(new MouseEvent("click", { bubbles: true }))

    expect(deselectGridOutside).toHaveBeenCalledTimes(1)
  })

  it("clears the desktop selection and tooltip when clicking a non-selectable slot", () => {
    appendSlot(1, 0)
    appendSlot(2, 0)
    const clearSelectedSlot = vi.fn()
    const { interactions, tooltipContent } = mountInteractions(false, {
      isSelectableSlot: (row, _col) => row === 1,
      clearSelectedSlot,
    })

    interactions.getTimeslotVon(1, 0).click()

    expect(clearSelectedSlot).not.toHaveBeenCalled()

    interactions.getTimeslotVon(2, 0).click()

    expect(tooltipContent.value).toEqual([])
    expect(interactions.tooltipPosition.value).toBeNull()
    expect(clearSelectedSlot).toHaveBeenCalledTimes(1)
  })

  it("clears a mobile selection and tooltip when clicking a non-selectable slot", () => {
    appendSlot(1, 0)
    appendSlot(2, 0)
    const clearSelectedSlot = vi.fn()
    const { interactions, tooltipContent } = mountInteractions(true, {
      isSelectableSlot: (row, _col) => row === 1,
      clearSelectedSlot,
    })

    interactions.getTimeslotVon(1, 0).click()

    expect(interactions.selectedTooltipSlot.value).toEqual({ row: 1, col: 0 })
    expect(interactions.tooltipPosition.value).not.toBeNull()
    expect(joinTooltipSegments(tooltipContent.value)).toBe("slot-1-0")

    interactions.getTimeslotVon(2, 0).click()

    expect(interactions.selectedTooltipSlot.value).toBeNull()
    expect(interactions.tooltipPosition.value).toBeNull()
    expect(tooltipContent.value).toEqual([])
    expect(clearSelectedSlot).toHaveBeenCalledTimes(1)
  })

  it("marks the collapsed row inactive, clears the selection and tooltip on hover", () => {
    const clearSelectedSlot = vi.fn()
    const markCurTimeslotInactive = vi.fn()
    const { interactions, tooltipContent } = mountInteractions(false, {
      clearSelectedSlot,
      markCurTimeslotInactive,
    })

    tooltipContent.value = [{ text: "stale", mono: false }]
    interactions.tooltipPosition.value = { x: 10, y: 20 }
    interactions.markCollapsedRowInactive()

    expect(markCurTimeslotInactive).toHaveBeenCalledTimes(1)
    expect(markCurTimeslotInactive).toHaveBeenCalledWith(true)
    expect(clearSelectedSlot).toHaveBeenCalledTimes(1)
    expect(interactions.tooltipPosition.value).toBeNull()
    expect(tooltipContent.value).toEqual([])
  })

  it("does not mark the collapsed row inactive on mobile", () => {
    const clearSelectedSlot = vi.fn()
    const markCurTimeslotInactive = vi.fn()
    const { interactions } = mountInteractions(true, {
      clearSelectedSlot,
      markCurTimeslotInactive,
    })

    interactions.markCollapsedRowInactive()

    expect(markCurTimeslotInactive).not.toHaveBeenCalled()
    expect(clearSelectedSlot).not.toHaveBeenCalled()
  })

  it("does not mark the collapsed row inactive while a respondent is selected", () => {
    const clearSelectedSlot = vi.fn()
    const markCurTimeslotInactive = vi.fn()
    const { interactions, timeslotSelected } = mountInteractions(false, {
      clearSelectedSlot,
      markCurTimeslotInactive,
    })

    timeslotSelected.value = true
    interactions.markCollapsedRowInactive()

    expect(markCurTimeslotInactive).not.toHaveBeenCalled()
    expect(clearSelectedSlot).not.toHaveBeenCalled()
  })

  it("does not mark the collapsed row inactive when the grid is not interactable", () => {
    const clearSelectedSlot = vi.fn()
    const markCurTimeslotInactive = vi.fn()
    const { interactions } = mountInteractions(false, {
      clearSelectedSlot,
      markCurTimeslotInactive,
      interactable: false,
    })

    interactions.markCollapsedRowInactive()

    expect(markCurTimeslotInactive).not.toHaveBeenCalled()
    expect(clearSelectedSlot).not.toHaveBeenCalled()
  })

  it("resets the grid state and clears the tooltip when hovering a split gap on desktop", () => {
    const resetGridOutside = vi.fn()
    const { interactions, tooltipContent } = mountInteractions(false, {
      resetGridOutside,
    })

    tooltipContent.value = [{ text: "stale", mono: false }]
    interactions.tooltipPosition.value = { x: 10, y: 20 }
    interactions.markSplitGapOutside()

    expect(resetGridOutside).toHaveBeenCalledTimes(1)
    expect(interactions.tooltipPosition.value).toBeNull()
    expect(tooltipContent.value).toEqual([])
  })

  it("does not reset the grid state when hovering a split gap on mobile", () => {
    const resetGridOutside = vi.fn()
    const { interactions } = mountInteractions(true, {
      resetGridOutside,
    })

    interactions.markSplitGapOutside()

    expect(resetGridOutside).not.toHaveBeenCalled()
  })

  it("deselects the grid state and clears the tooltip when clicking a split gap on desktop", () => {
    const deselectGridOutside = vi.fn()
    const { interactions, tooltipContent } = mountInteractions(false, {
      deselectGridOutside,
    })

    tooltipContent.value = [{ text: "stale", mono: false }]
    interactions.tooltipPosition.value = { x: 10, y: 20 }
    interactions.clickSplitGapOutside()

    expect(deselectGridOutside).toHaveBeenCalledTimes(1)
    expect(interactions.tooltipPosition.value).toBeNull()
    expect(tooltipContent.value).toEqual([])
  })

  it("dismisses the anchored mobile tooltip when clicking a split gap", () => {
    const deselectGridOutside = vi.fn()
    const { interactions, tooltipContent } = mountInteractions(true, {
      deselectGridOutside,
    })

    interactions.selectedTooltipSlot.value = { row: 1, col: 0 }
    interactions.tooltipPosition.value = { x: 10, y: 20 }
    tooltipContent.value = [{ text: "stale", mono: false }]
    interactions.clickSplitGapOutside()

    expect(deselectGridOutside).toHaveBeenCalledTimes(1)
    expect(interactions.selectedTooltipSlot.value).toBeNull()
    expect(interactions.tooltipPosition.value).toBeNull()
    expect(tooltipContent.value).toEqual([])
  })
})

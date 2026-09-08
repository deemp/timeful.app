import {
  computed,
  onBeforeUnmount,
  onMounted,
  ref,
  type ComputedRef,
  type Ref,
} from "vue"
import type { RowCol } from "@/composables/schedule_overlap/types"
import type { TooltipSegment } from "./scheduleOverlapRendering"

export interface TooltipPositionOverride {
  x: number
  y: number
  placement?: "above" | "below"
}

interface UseTimedGridInteractionsOptions {
  isPhone: ComputedRef<boolean>
  daysOnly: ComputedRef<boolean>
  interactable: ComputedRef<boolean>
  dragging: Ref<boolean>
  dragCur: Ref<RowCol | null>
  timeslotSelected: Ref<boolean>
  tooltipContent: Ref<TooltipSegment[]>
  startDrag: (event: PointerEvent | MouseEvent) => void
  moveDrag: (event: PointerEvent | MouseEvent) => void
  endDrag: (event?: PointerEvent | MouseEvent) => void
  showAvailability: (row: number, col: number) => void
  shouldHighlightAvailability: () => boolean
  highlightAvailability: () => void
  getTooltipContent: (row: number, col: number) => TooltipSegment[] | undefined
  isSelectableSlot?: (row: number, col: number) => boolean
  clearSelectedSlot?: () => void
  markCurTimeslotInactive?: (collapsed?: boolean) => void
  resetGridOutside?: () => void
  deselectGridOutside?: () => void
  document?: Document
}

export function useTimedGridInteractions(
  opts: UseTimedGridInteractionsOptions,
) {
  const selectedTooltipSlot = ref<RowCol | null>(null)
  const tooltipPosition = ref<TooltipPositionOverride | null>(null)
  const explicitMobileSelection = ref(false)
  const documentRef = opts.document ?? globalThis.document
  const visibleTooltipContent = computed(() =>
    !opts.isPhone.value || selectedTooltipSlot.value
      ? opts.tooltipContent.value
      : [],
  )

  const setTooltipForRowCol = (row: number, col: number) => {
    const content = opts.getTooltipContent(row, col)
    if (content !== undefined) opts.tooltipContent.value = content
  }

  const getTimedGridSlotFromEvent = (
    event: PointerEvent | MouseEvent,
  ): RowCol | null => {
    const getSlotFromElement = (element: Element | null): RowCol | null => {
      const cell = element?.closest<HTMLElement>(
        "#drag-section .timeslot[data-row][data-col]",
      )
      if (!cell) return null

      const row = Number.parseInt(cell.dataset.row ?? "", 10)
      const col = Number.parseInt(cell.dataset.col ?? "", 10)
      return Number.isFinite(row) && Number.isFinite(col) ? { row, col } : null
    }

    const targetSlot = getSlotFromElement(
      event.target instanceof Element ? event.target : null,
    )
    return (
      targetSlot ??
      getSlotFromElement(
        documentRef.elementFromPoint(event.clientX, event.clientY),
      )
    )
  }

  const updateSelectedTooltipSlot = (event: PointerEvent | MouseEvent) => {
    if (!opts.isPhone.value || !opts.dragging.value || !opts.dragCur.value) {
      return
    }

    const slot = getTimedGridSlotFromEvent(event)
    if (
      slot?.row === opts.dragCur.value.row &&
      slot.col === opts.dragCur.value.col
    ) {
      selectedTooltipSlot.value = slot
      explicitMobileSelection.value = true
    }
  }

  const setTooltipPositionForSelectedSlot = () => {
    const selectedSlot = selectedTooltipSlot.value
    if (!selectedSlot) return

    const cell = documentRef.querySelector<HTMLElement>(
      `#drag-section .timeslot[data-row="${String(selectedSlot.row)}"][data-col="${String(selectedSlot.col)}"]`,
    )
    if (!cell) return

    const { left, top, width, height } = cell.getBoundingClientRect()
    const placement = top < 100 ? "below" : "above"
    tooltipPosition.value = {
      x: left + width / 2,
      y: placement === "above" ? top : top + height,
      placement,
    }
  }

  const setTooltipPositionForDrag = (event: PointerEvent | MouseEvent) => {
    if (opts.isPhone.value) {
      setTooltipPositionForSelectedSlot()
      return
    }

    tooltipPosition.value = { x: event.clientX, y: event.clientY }
  }

  const dismissMobileTooltipOnOutsideGridClick = (event: MouseEvent) => {
    const clickedInsideGrid =
      event.target instanceof Element && event.target.closest("#drag-section")

    if (opts.isPhone.value && opts.daysOnly.value && !clickedInsideGrid) {
      opts.deselectGridOutside?.()
    }

    if (
      !opts.isPhone.value ||
      !selectedTooltipSlot.value ||
      clickedInsideGrid
    ) {
      return
    }
    selectedTooltipSlot.value = null
    explicitMobileSelection.value = false
    tooltipPosition.value = null
    opts.tooltipContent.value = []
  }

  const repositionMobileTooltip = () => {
    if (opts.isPhone.value && selectedTooltipSlot.value) {
      setTooltipPositionForSelectedSlot()
    }
  }

  const startTimedGridDrag = (event: PointerEvent | MouseEvent) => {
    opts.startDrag(event)
    updateSelectedTooltipSlot(event)
    setTooltipPositionForDrag(event)
    if (!opts.daysOnly.value && selectedTooltipSlot.value) {
      setTooltipForRowCol(
        selectedTooltipSlot.value.row,
        selectedTooltipSlot.value.col,
      )
    }
  }

  const moveTimedGridDrag = (event: PointerEvent | MouseEvent) => {
    opts.moveDrag(event)
    updateSelectedTooltipSlot(event)
    setTooltipPositionForDrag(event)
    const tooltipSlot = opts.isPhone.value
      ? selectedTooltipSlot.value
      : opts.dragCur.value
    if (opts.dragging.value && !opts.daysOnly.value && tooltipSlot) {
      setTooltipForRowCol(tooltipSlot.row, tooltipSlot.col)
    }
  }

  const endTimedGridDrag = (event?: PointerEvent | MouseEvent) => {
    if (event) updateSelectedTooltipSlot(event)
    const tooltipSlot = opts.isPhone.value
      ? selectedTooltipSlot.value
      : opts.dragCur.value
    if (!opts.daysOnly.value && tooltipSlot) {
      setTooltipForRowCol(tooltipSlot.row, tooltipSlot.col)
    }
    if (event) setTooltipPositionForDrag(event)
    opts.endDrag(event)
  }

  const getTimeslotVon = (
    row: number,
    col: number,
  ): Record<string, () => void> => {
    if (!opts.interactable.value) return {}
    const isSelectableSlot = opts.isSelectableSlot ?? (() => true)
    return {
      click: () => {
        if (opts.daysOnly.value && !isSelectableSlot(row, col)) {
          opts.showAvailability(row, col)
          opts.clearSelectedSlot?.()
          return
        }

        opts.showAvailability(row, col)
        if (opts.isPhone.value && !opts.daysOnly.value) {
          if (isSelectableSlot(row, col)) {
            selectedTooltipSlot.value = { row, col }
            explicitMobileSelection.value = true
            setTooltipPositionForSelectedSlot()
            setTooltipForRowCol(row, col)
          } else {
            selectedTooltipSlot.value = null
            explicitMobileSelection.value = false
            tooltipPosition.value = null
            opts.tooltipContent.value = []
            opts.clearSelectedSlot?.()
          }
          return
        }
        if (!opts.daysOnly.value && !isSelectableSlot(row, col)) {
          tooltipPosition.value = null
          opts.tooltipContent.value = []
          opts.clearSelectedSlot?.()
        }
      },
      mousedown: () => {
        if (opts.shouldHighlightAvailability()) opts.highlightAvailability()
      },
      mouseover: () => {
        if (opts.isPhone.value && explicitMobileSelection.value) return
        if (!opts.timeslotSelected.value) {
          if (opts.daysOnly.value && !isSelectableSlot(row, col)) {
            opts.showAvailability(row, col)
            if (!opts.isPhone.value) opts.clearSelectedSlot?.()
            return
          }

          opts.showAvailability(row, col)
          if (!isSelectableSlot(row, col)) {
            tooltipPosition.value = null
            opts.tooltipContent.value = []
            if (!opts.isPhone.value && !opts.daysOnly.value) {
              opts.clearSelectedSlot?.()
            }
            return
          }
          if (!opts.daysOnly.value) {
            if (opts.isPhone.value) {
              selectedTooltipSlot.value = { row, col }
              setTooltipPositionForSelectedSlot()
            }
            setTooltipForRowCol(row, col)
          }
        }
      },
      mouseleave: () => {
        if (opts.isPhone.value && selectedTooltipSlot.value) return
        tooltipPosition.value = null
        opts.tooltipContent.value = []
      },
    }
  }

  const markCollapsedRowInactive = () => {
    if (!opts.interactable.value) return
    if (opts.timeslotSelected.value) return
    if (opts.isPhone.value) return
    opts.markCurTimeslotInactive?.(true)
    opts.clearSelectedSlot?.()
    tooltipPosition.value = null
    opts.tooltipContent.value = []
  }

  const markSplitGapOutside = () => {
    if (opts.isPhone.value) return
    opts.resetGridOutside?.()
    tooltipPosition.value = null
    opts.tooltipContent.value = []
  }

  const clickSplitGapOutside = () => {
    opts.deselectGridOutside?.()
    selectedTooltipSlot.value = null
    explicitMobileSelection.value = false
    tooltipPosition.value = null
    opts.tooltipContent.value = []
  }

  onMounted(() => {
    documentRef.addEventListener(
      "click",
      dismissMobileTooltipOnOutsideGridClick,
      true,
    )
    documentRef.defaultView?.addEventListener(
      "scroll",
      repositionMobileTooltip,
      true,
    )
  })

  onBeforeUnmount(() => {
    documentRef.removeEventListener(
      "click",
      dismissMobileTooltipOnOutsideGridClick,
      true,
    )
    documentRef.defaultView?.removeEventListener(
      "scroll",
      repositionMobileTooltip,
      true,
    )
  })

  return {
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
    updateSelectedTooltipSlot,
  }
}

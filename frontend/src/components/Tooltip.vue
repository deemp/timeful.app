<template>
  <div
    class="tw:relative"
    @mouseenter="handleMouseEnter"
    @mouseleave="handleMouseLeave"
    @mousemove="handleMouseMoveWithOverride"
  >
    <slot></slot>
    <div
      v-if="(isVisible || forceVisible) && content.length > 0"
      ref="tooltipEl"
      class="timeful-tooltip-layer tw:pointer-events-none tw:fixed tw:rounded-lg tw:bg-dark-gray tw:px-1.5 tw:py-1 tw:text-xs tw:text-white tw:shadow-lg tw:transition-opacity tw:duration-200"
      :style="tooltipStyle"
    >
      <template v-for="segment in content" :key="segment.text">
        <span v-if="segment.mono" class="tw:font-mono">{{ segment.text }}</span>
        <template v-else>{{ segment.text }}</template>
      </template>
    </div>
  </div>
</template>

<script setup lang="ts">
import { computed, ref, toRef, watch } from "vue"
import {
  useTooltipState,
  TOOLTIP_Y_OFFSET_PX,
} from "@/composables/useTooltipState"
import type { TooltipSegment } from "@/components/schedule_overlap/scheduleOverlapRendering"

defineOptions({ name: "AppTooltip" })

const TOOLTIP_HORIZONTAL_MARGIN_PX = 8

const props = withDefaults(
  defineProps<{
    content?: TooltipSegment[]
    positionOverride?: {
      x: number
      y: number
      placement?: "above" | "below"
    } | null
    forceVisible?: boolean
  }>(),
  { content: () => [], positionOverride: null, forceVisible: false },
)

const {
  handleMouseEnter,
  handleMouseLeave,
  handleMouseMove,
  isVisible,
  style,
  position,
} = useTooltipState(toRef(props, "content"))

const tooltipEl = ref<HTMLElement | null>(null)
const tooltipWidth = ref(0)

watch(
  () => [
    props.content,
    props.positionOverride,
    props.forceVisible,
    isVisible.value,
  ],
  () => {
    tooltipWidth.value = tooltipEl.value?.getBoundingClientRect().width ?? 0
  },
  { flush: "post" },
)

const clampHorizontalPosition = (x: number): number => {
  const viewportWidth = Number.isFinite(globalThis.innerWidth)
    ? globalThis.innerWidth
    : Number.POSITIVE_INFINITY
  const halfWidth = tooltipWidth.value / 2
  const min = TOOLTIP_HORIZONTAL_MARGIN_PX + halfWidth
  const max = Math.max(
    viewportWidth - TOOLTIP_HORIZONTAL_MARGIN_PX - halfWidth,
    min,
  )
  return Math.min(Math.max(x, min), max)
}

const tooltipStyle = computed(() => {
  const placement = props.positionOverride?.placement
  const x = clampHorizontalPosition(position.value.x)

  if (!placement) {
    return { ...style.value, left: `${String(x)}px` }
  }

  return {
    left: `${String(x)}px`,
    top: `${String(position.value.y)}px`,
    transform:
      placement === "above"
        ? "translate(-50%, calc(-100% - 8px))"
        : "translate(-50%, 8px)",
  }
})

const handleMouseMoveWithOverride = (event: MouseEvent) => {
  if (!props.positionOverride) {
    handleMouseMove(event)
  }
}

watch(
  () => props.positionOverride,
  (pos) => {
    if (pos) {
      position.value = {
        x: pos.x,
        y: pos.placement
          ? pos.y
          : pos.y < 100
            ? pos.y + TOOLTIP_Y_OFFSET_PX
            : pos.y - TOOLTIP_Y_OFFSET_PX,
      }
    }
  },
  { immediate: true },
)
</script>

<template>
  <div
    class="time-format-toggle tw:relative tw:flex tw:h-8 tw:shrink-0 tw:overflow-hidden tw:rounded-md tw:border tw:border-solid tw:border-outline-neutral tw:bg-white"
    :style="{ width: `${trackWidth}px` }"
  >
    <div
      class="time-format-toggle__indicator tw:absolute tw:z-0 tw:rounded-[5px] tw:border tw:border-solid tw:border-outline-neutral tw:transition-all"
      :style="indicatorStyle"
    ></div>
    <button
      v-for="option in options"
      :key="option.value"
      class="time-format-toggle__option tw:relative tw:z-10 tw:flex tw:min-w-8 tw:flex-1 tw:items-center tw:justify-center tw:whitespace-nowrap tw:px-1.5 tw:text-sm tw:font-medium tw:transition-all"
      :class="
        option.value === modelValue
          ? 'tw:text-black'
          : 'tw:text-dark-gray tw:hover:text-black'
      "
      type="button"
      @click="emit('update:modelValue', option.value)"
    >
      {{ option.label }}
    </button>
  </div>
</template>

<script setup lang="ts">
import { computed, type CSSProperties } from "vue"
import { timeTypes } from "@/constants"

export interface SegmentedToggleOption {
  label: string
  value: string | number
}

const props = withDefaults(
  defineProps<{
    modelValue: string | number
    options?: SegmentedToggleOption[]
    indicatorWidth?: number
    gap?: number
  }>(),
  {
    options: () => [
      { label: "12h", value: timeTypes.HOUR12 },
      { label: "24h", value: timeTypes.HOUR24 },
    ],
    indicatorWidth: 33,
    gap: 3,
  },
)

const emit = defineEmits<{
  "update:modelValue": [value: string | number]
}>()

const selectedIndex = computed(() =>
  Math.max(
    props.options.findIndex((option) => option.value === props.modelValue),
    0,
  ),
)

const indicatorWidth = computed(() => Number(props.indicatorWidth))
const gap = computed(() => Number(props.gap))

const slotWidth = computed(() => indicatorWidth.value + gap.value * 2)

const trackWidth = computed(() => props.options.length * slotWidth.value + 2)

const indicatorStyle = computed<CSSProperties>(() => ({
  top: `${gap.value}px`,
  bottom: `${gap.value}px`,
  left: `${gap.value}px`,
  width: `${indicatorWidth.value}px`,
  transform: `translateX(${String(selectedIndex.value * slotWidth.value)}px)`,
  backgroundColor: "transparent",
  boxShadow: "none",
}))
</script>

<template>
  <div class="time-range-picker tw:flex tw:items-center tw:gap-2">
    <v-select
      :model-value="start"
      :items="items"
      class="time-range-select timeful-solo-field"
      :style="selectStyle"
      item-title="text"
      item-value="value"
      return-object
      hide-details
      :menu-props="menuProps"
      variant="solo"
      @update:model-value="(option) => emit('update:start', option)"
    >
      <template #item="{ item, props: itemProps }">
        <div
          v-bind="itemProps"
          class="time-range-select-item"
          :class="{
            'time-range-select-item--active': item.raw.value === start?.value,
          }"
        >
          {{ item.raw.text }}
        </div>
      </template>
    </v-select>
    <div class="time-range-separator">to</div>
    <v-select
      :model-value="end"
      :items="items"
      class="time-range-select timeful-solo-field"
      :style="selectStyle"
      item-title="text"
      item-value="value"
      return-object
      hide-details
      :menu-props="menuProps"
      variant="solo"
      @update:model-value="(option) => emit('update:end', option)"
    >
      <template #item="{ item, props: itemProps }">
        <div
          v-bind="itemProps"
          class="time-range-select-item"
          :class="{
            'time-range-select-item--active': item.raw.value === end?.value,
          }"
        >
          {{ item.raw.text }}
        </div>
      </template>
    </v-select>
  </div>
</template>

<script setup lang="ts">
import { computed, type CSSProperties } from "vue"
import type { TimeFormatOption } from "@/utils"

const DEFAULT_PICKER_WIDTH = 100
const MIN_PICKER_WIDTH = 100
const MAX_PICKER_WIDTH = 120
const WIDTH_GROWTH_MIN_VIEWPORT = 350
const WIDTH_GROWTH_MAX_VIEWPORT = 400

const props = withDefaults(
  defineProps<{
    items: TimeFormatOption[]
    start?: TimeFormatOption
    end?: TimeFormatOption
    width?: number
  }>(),
  {
    start: undefined,
    end: undefined,
    width: DEFAULT_PICKER_WIDTH,
  },
)

const emit = defineEmits<{
  "update:start": [value: TimeFormatOption]
  "update:end": [value: TimeFormatOption]
}>()

const resolvedWidth = computed(() =>
  Math.max(Math.round(props.width), MIN_PICKER_WIDTH),
)

const pickerWidth = computed(() => {
  const base = resolvedWidth.value
  if (base >= MAX_PICKER_WIDTH) return `${base}px`
  const growth = MAX_PICKER_WIDTH - base
  const viewportSpan = WIDTH_GROWTH_MAX_VIEWPORT - WIDTH_GROWTH_MIN_VIEWPORT
  return `clamp(${base}px, calc(${base}px + (100vw - ${WIDTH_GROWTH_MIN_VIEWPORT}px) * ${growth} / ${viewportSpan}), ${MAX_PICKER_WIDTH}px)`
})

const selectStyle = computed<CSSProperties>(() => ({
  width: pickerWidth.value,
  flex: "none",
}))

const menuProps = computed(() => ({
  minWidth: pickerWidth.value,
  maxWidth: pickerWidth.value,
}))
</script>

<style>
.time-range-picker {
  --time-range-chip-height: 58px;
  --time-range-separator-line-height: 20px;
}

.time-range-picker .v-input.time-range-select .v-field {
  --v-input-control-height: calc(var(--time-range-chip-height) - 2px);
  --v-field-input-padding-top: 0px;
  --v-field-input-padding-bottom: 0px;
  --v-field-padding-start: 8px;
  min-height: var(--time-range-chip-height);
}

.time-range-picker .time-range-separator {
  align-items: center;
  display: flex;
  height: var(--time-range-chip-height);
  line-height: var(--time-range-separator-line-height);
}

.time-range-select-item {
  align-items: center;
  color: rgba(0, 0, 0, 0.87);
  cursor: pointer;
  display: flex;
  min-height: 40px;
  padding: 0 8px;
}

.time-range-select-item--active {
  background-color: var(--timeful-selection-bg);
  color: var(--timeful-selection-fg);
}
</style>

<template>
  <div
    class="slide-toggle tw:relative tw:flex tw:h-9 tw:w-fit tw:rounded-md tw:border tw:border-solid tw:border-outline-neutral tw:bg-white"
  >
    <div
      class="slide-toggle__indicator tw:pointer-events-none tw:absolute tw:rounded-[5px] tw:border tw:border-solid tw:transition-all"
      :class="activeIndicatorClass"
      :style="activeIndicatorStyle"
    ></div>
    <template v-for="(tab, i) in options" :key="String(tab.value)">
      <div
        class="slide-toggle__option tw:relative tw:flex tw:flex-1 tw:cursor-pointer tw:items-center tw:justify-center tw:gap-1.5 tw:overflow-hidden tw:px-4 tw:text-center tw:text-sm tw:font-medium tw:transition-all"
        :class="getOptionClass(tab, i)"
        :style="tab.style"
        @click="emit('update:modelValue', tab.value)"
      >
        <slot
          :name="'option-' + tab.value"
          :option="tab"
          :active="i === selectedIndex"
        >
          <span class="tw:line-clamp-1">{{ tab.text }}</span>
        </slot>
      </div>
    </template>
  </div>
</template>

<script setup lang="ts" generic="T extends string | number | boolean">
import { computed, type CSSProperties } from "vue"

export interface SlideToggleOption<
  T extends string | number | boolean = string,
> {
  text: string
  value: T
  activeClass?: string
  indicatorBgClass?: string
  borderClass?: string
  borderColor?: string
  style?: Record<string, string>
}

const props = defineProps<{
  modelValue: T
  options: SlideToggleOption<T>[]
}>()

const emit = defineEmits<{
  "update:modelValue": [value: T]
}>()

// Inset from the box border on every side. With the 1px box border, the
// indicator keeps a 3px gap to the box edge; its 5px radius matches the box
// inner corner curvature (6px outer radius - 1px border).
const indicatorEdgeGap = 3

const defaultActiveClass = "tw:text-green"
const defaultIndicatorBgClass = "tw:bg-green/10"
const defaultBorderClass = "tw:border-green"
const defaultBorderColor = "#00994C"
const inactiveClass = "tw:text-dark-gray tw:hover:text-black"

const selectedIndex = computed(() => {
  const matchIndex = props.options.findIndex(
    (tab) => tab.value === props.modelValue,
  )
  return matchIndex === -1 ? 0 : matchIndex
})

const selectedOption = computed(
  (): SlideToggleOption<T> =>
    props.options.at(selectedIndex.value) ??
    props.options.at(0) ??
    emptyOption.value,
)

const emptyOption = computed<SlideToggleOption<T>>(() => ({
  text: "",
  value: props.modelValue,
}))

const activeIndicatorClass = computed(() => [
  selectedOption.value.borderClass ?? defaultBorderClass,
  selectedOption.value.indicatorBgClass ?? defaultIndicatorBgClass,
])

const activeIndicatorStyle = computed<CSSProperties>(() => {
  const optionCount = Math.max(props.options.length, 1)
  // Each step slides by one slot (own width plus two edge gaps) so indicator
  // positions keep the edge gap between neighbors while staying inset.
  const stepGap = indicatorEdgeGap * 2

  return {
    top: `${indicatorEdgeGap}px`,
    bottom: `${indicatorEdgeGap}px`,
    left: `${indicatorEdgeGap}px`,
    borderColor: selectedOption.value.borderColor ?? defaultBorderColor,
    transform: `translateX(calc(${String(selectedIndex.value * 100)}% + ${String(selectedIndex.value * stepGap)}px))`,
    width: `calc(${String(100 / optionCount)}% - ${String(stepGap)}px)`,
  }
})

const getOptionClass = (tab: SlideToggleOption<T>, optionIndex: number) =>
  optionIndex === selectedIndex.value
    ? (tab.activeClass ?? defaultActiveClass)
    : inactiveClass
</script>

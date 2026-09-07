<template>
  <SlideToggle
    :model-value="modelValue"
    :options="options"
    @update:model-value="(v: string) => emit('update:modelValue', v)"
  />
</template>

<script setup lang="ts">
import { availabilityTypes } from "@/constants"
import SlideToggle, {
  type SlideToggleOption,
} from "@/components/SlideToggle.vue"

defineProps<{
  modelValue: string
}>()

const emit = defineEmits<{
  "update:modelValue": [value: string]
}>()

const options: SlideToggleOption[] = [
  {
    text: "Available",
    activeClass: "tw:text-green",
    indicatorBgClass: "tw:bg-green/10",
    borderClass: "tw:border-green",
    borderColor: "#00994C",
    value: availabilityTypes.AVAILABLE,
  },
  {
    text: "If needed",
    activeClass: "tw:text-dark-yellow",
    indicatorBgClass: "tw:bg-yellow/10",
    borderClass: "tw:border-dark-yellow",
    borderColor: "#997700",
    value: availabilityTypes.IF_NEEDED,
  },
]
</script>

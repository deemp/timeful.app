<template>
  <div>
    <div class="tw:mb-1 tw:text-sm tw:text-black">Working hours</div>
    <div class="tw:mb-2 tw:text-xs tw:text-dark-gray">
      Only autofill availability between working hours
    </div>
    <v-switch
      id="working-hours-toggle"
      class="timeful-switch"
      color="primary"
      inset
      :model-value="workingHours.enabled"
      hide-details
      @update:model-value="
        (val: boolean | null) => updateWorkingHours('enabled', !!val)
      "
    >
      <template #label>
        <div class="tw:text-sm tw:text-black">
          <div class="tw:flex tw:items-center tw:gap-2">
            <v-select
              density="compact"
              hide-details
              item-title="title"
              item-value="time"
              return-object
              class="timeful-solo-field tw:-mt-0.5 tw:w-20 tw:text-xs"
              :items="times"
              :model-value="startTimeOption"
              @update:model-value="
                (option) => updateWorkingHours('startTime', option.time)
              "
              @click="
                (e: MouseEvent) => {
                  e.preventDefault()
                  e.stopPropagation()
                }
              "
            />
            <div>to</div>
            <v-select
              density="compact"
              hide-details
              item-title="title"
              item-value="time"
              return-object
              class="timeful-solo-field tw:-mt-0.5 tw:w-20 tw:text-xs"
              :items="times"
              :model-value="endTimeOption"
              @update:model-value="
                (option) => updateWorkingHours('endTime', option.time)
              "
              @click="
                (e: MouseEvent) => {
                  e.preventDefault()
                  e.stopPropagation()
                }
              "
            />
          </div>
        </div>
      </template>
    </v-switch>
  </div>
</template>

<script setup lang="ts">
import { computed } from "vue"
import { getTimeOptions, patch, type TimeFormatOption } from "@/utils"
import type { WorkingHoursOptions } from "@/types"

const props = withDefaults(
  defineProps<{
    workingHours: WorkingHoursOptions
    syncWithBackend?: boolean
  }>(),
  { syncWithBackend: false },
)

const emit = defineEmits<{
  "update:workingHours": [value: WorkingHoursOptions]
}>()

const times = computed(() => getTimeOptions())
const timeOptionFor = (time: number | undefined): TimeFormatOption => {
  const option = times.value.find((candidate) => candidate.time === time)
  const fallback = times.value[0]
  if (!option && !fallback) {
    throw new Error(
      "Working-hours time is not present in the available time options",
    )
  }

  return option ?? fallback
}
const startTimeOption = computed(() =>
  timeOptionFor(props.workingHours.startTime),
)
const endTimeOption = computed(() => timeOptionFor(props.workingHours.endTime))

const updateWorkingHours = (
  key: "enabled" | "startTime" | "endTime",
  val: boolean | number,
) => {
  const workingHours: WorkingHoursOptions = {
    ...props.workingHours,
    [key]: val,
  }
  if (props.syncWithBackend) {
    void patch(`/user/calendar-options`, { workingHours })
  }
  emit("update:workingHours", workingHours)
}
</script>

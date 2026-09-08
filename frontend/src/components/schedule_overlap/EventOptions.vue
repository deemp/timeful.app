<template>
  <section v-if="hasAnyOption" class="tw:flex tw:flex-col">
    <template v-if="variant === 'menu'">
      <v-menu location="bottom end" offset="8" :close-on-content-click="false">
        <template #activator="{ props: activatorProps }">
          <v-btn
            id="event-options-menu-activator"
            variant="outlined"
            color="primary"
            :height="menuButtonHeight"
            :class="[
              'tw:min-w-0 tw:rounded-md tw:px-3 tw:text-sm tw:text-green',
              menuActivatorClass,
            ]"
            v-bind="activatorProps"
          >
            <v-icon size="18" class="tw:mr-1">mdi-tune-vertical</v-icon>
            {{ menuButtonLabel }}
          </v-btn>
        </template>
        <v-card min-width="260">
          <v-card-text class="tw:flex tw:flex-col tw:gap-4 tw:p-4">
            <v-switch
              v-if="showBestTimesToggle"
              id="show-best-times-toggle"
              class="event-options-switch schedule-overlap-compact-switch"
              inset
              :model-value="showBestTimes"
              hide-details
              @update:model-value="
                (val: boolean | null) => $emit('update:showBestTimes', !!val)
              "
            >
              <template #label>
                <div class="tw:text-sm tw:text-black">
                  Show best {{ event.daysOnly ? "days" : "times" }}
                </div>
              </template>
            </v-switch>
            <v-switch
              v-if="collapseDisabledTimesToggle"
              id="collapse-disabled-times-toggle"
              class="event-options-switch schedule-overlap-compact-switch"
              inset
              :model-value="collapseDisabledTimes"
              hide-details
              @update:model-value="
                (val: boolean | null) =>
                  $emit('update:collapseDisabledTimes', !!val)
              "
            >
              <template #label>
                <div class="tw:text-sm tw:text-black">
                  Collapse disabled times
                </div>
              </template>
            </v-switch>
            <v-switch
              v-if="showStartCalendarOnMondayToggle"
              id="start-calendar-on-monday-toggle"
              class="event-options-switch schedule-overlap-compact-switch"
              inset
              :model-value="startCalendarOnMonday"
              hide-details
              @update:model-value="
                (val: boolean | null) =>
                  $emit('update:startCalendarOnMonday', !!val)
              "
            >
              <template #label>
                <div class="tw:text-sm tw:text-black">Start on Monday</div>
              </template>
            </v-switch>
            <v-switch
              v-if="showHideIfNeededToggle"
              id="hide-if-needed-toggle"
              class="event-options-switch schedule-overlap-compact-switch"
              inset
              :model-value="hideIfNeeded"
              hide-details
              @update:model-value="
                (val: boolean | null) => $emit('update:hideIfNeeded', !!val)
              "
            >
              <template #label>
                <div class="tw:text-sm tw:text-black">
                  Hide if needed {{ event.daysOnly ? "days" : "times" }}
                </div>
              </template>
            </v-switch>
            <v-switch
              v-if="showCalendarEventsToggle"
              id="show-calendar-events-toggle"
              class="event-options-switch schedule-overlap-compact-switch"
              inset
              :model-value="showCalendarEvents"
              hide-details
              @update:model-value="
                (val: boolean | null) =>
                  $emit('update:showCalendarEvents', !!val)
              "
            >
              <template #label>
                <div class="tw:text-sm tw:text-black">
                  Overlay calendar events
                </div>
              </template>
            </v-switch>
          </v-card-text>
        </v-card>
      </v-menu>
    </template>
    <template v-else>
      <div class="tw:text-base tw:font-medium tw:text-black">Options</div>
      <div class="tw:flex tw:flex-col tw:gap-4 tw:pt-2">
        <v-switch
          v-if="showBestTimesToggle"
          id="show-best-times-toggle"
          class="event-options-switch schedule-overlap-compact-switch"
          inset
          :model-value="showBestTimes"
          hide-details
          @update:model-value="
            (val: boolean | null) => $emit('update:showBestTimes', !!val)
          "
        >
          <template #label>
            <div class="tw:text-sm tw:text-black">
              Show best {{ event.daysOnly ? "days" : "times" }}
            </div>
          </template>
        </v-switch>
        <v-switch
          v-if="showHideIfNeededToggle"
          id="hide-if-needed-toggle"
          class="event-options-switch schedule-overlap-compact-switch"
          inset
          :model-value="hideIfNeeded"
          hide-details
          @update:model-value="
            (val: boolean | null) => $emit('update:hideIfNeeded', !!val)
          "
        >
          <template #label>
            <div class="tw:text-sm tw:text-black">
              Hide if needed {{ event.daysOnly ? "days" : "times" }}
            </div>
          </template>
        </v-switch>
        <v-switch
          v-if="collapseDisabledTimesToggle"
          id="collapse-disabled-times-toggle"
          class="event-options-switch schedule-overlap-compact-switch"
          inset
          :model-value="collapseDisabledTimes"
          hide-details
          @update:model-value="
            (val: boolean | null) =>
              $emit('update:collapseDisabledTimes', !!val)
          "
        >
          <template #label>
            <div class="tw:text-sm tw:text-black">Collapse disabled times</div>
          </template>
        </v-switch>
        <v-switch
          v-if="showCalendarEventsToggle"
          id="show-calendar-events-toggle"
          class="event-options-switch schedule-overlap-compact-switch"
          inset
          :model-value="showCalendarEvents"
          hide-details
          @update:model-value="
            (val: boolean | null) => $emit('update:showCalendarEvents', !!val)
          "
        >
          <template #label>
            <div class="tw:text-sm tw:text-black">Overlay calendar events</div>
          </template>
        </v-switch>
        <v-switch
          v-if="showStartCalendarOnMondayToggle"
          id="start-calendar-on-monday-toggle"
          class="event-options-switch schedule-overlap-compact-switch"
          inset
          :model-value="startCalendarOnMonday"
          hide-details
          @update:model-value="
            (val: boolean | null) =>
              $emit('update:startCalendarOnMonday', !!val)
          "
        >
          <template #label>
            <div class="tw:text-sm tw:text-black">Start on Monday</div>
          </template>
        </v-switch>
      </div>
    </template>
  </section>
</template>

<script setup lang="ts">
import { computed } from "vue"
import { useDisplayHelpers } from "@/utils/useDisplayHelpers"
import { eventTypes } from "@/constants"
import type { ScheduleOverlapEvent } from "@/composables/schedule_overlap/types"

const props = withDefaults(
  defineProps<{
    event: ScheduleOverlapEvent
    showBestTimes: boolean
    hideIfNeeded: boolean
    numResponses: number
    collapseDisabledTimes?: boolean
    showCalendarEvents?: boolean
    startCalendarOnMonday?: boolean
    variant?: "section" | "menu"
    includeShowBestTimes?: boolean
    includeHideIfNeeded?: boolean
    menuButtonLabel?: string
    menuButtonHeight?: string | number
    menuActivatorClass?: string
  }>(),
  {
    collapseDisabledTimes: undefined,
    showCalendarEvents: false,
    startCalendarOnMonday: false,
    variant: "section",
    includeShowBestTimes: true,
    includeHideIfNeeded: true,
    menuButtonLabel: "Options",
    menuButtonHeight: undefined,
    menuActivatorClass: "",
  },
)

defineEmits<{
  "update:showBestTimes": [value: boolean]
  "update:hideIfNeeded": [value: boolean]
  "update:collapseDisabledTimes": [value: boolean]
  "update:showCalendarEvents": [value: boolean]
  "update:startCalendarOnMonday": [value: boolean]
}>()

const { isPhone } = useDisplayHelpers()

const isGroup = computed(() => props.event.type === eventTypes.GROUP)
const showBestTimesToggle = computed(
  () => props.includeShowBestTimes && props.numResponses >= 1,
)
const showHideIfNeededToggle = computed(
  () => props.includeHideIfNeeded && props.numResponses >= 1 && !isGroup.value,
)
const collapseDisabledTimesToggle = computed(
  () => !props.event.daysOnly && props.collapseDisabledTimes !== undefined,
)
const showCalendarEventsToggle = computed(() => isGroup.value && !isPhone.value)
const showStartCalendarOnMondayToggle = computed(() => props.event.daysOnly)
const hasAnyOption = computed(
  () =>
    showBestTimesToggle.value ||
    showHideIfNeededToggle.value ||
    collapseDisabledTimesToggle.value ||
    showCalendarEventsToggle.value ||
    showStartCalendarOnMondayToggle.value,
)
</script>

<style scoped src="./ScheduleOverlapCompactSwitch.css"></style>

<template>
  <div>
    <div
      :class="[
        'tw:flex tw:min-h-20 tw:flex-1 tw:items-center tw:justify-center tw:text-sm tw:sm:mt-0 tw:sm:justify-between',
        compact && 'tool-row--compact tw:min-h-0 tw:justify-start',
      ]"
    >
      <div
        :class="[
          'tw:flex tw:flex-1 tw:flex-wrap tw:gap-x-4 tw:gap-y-2 tw:py-4 tw:sm:justify-start tw:sm:gap-x-4',
          !mobileRow &&
            (toolRow.state === toolRow.states.EDIT_AVAILABILITY
              ? 'tw:justify-center'
              : 'tw:justify-between'),
          compact && !mobileRow
            ? 'tw:w-full tw:flex-col tw:items-start tw:justify-start tw:gap-0 tw:pb-0 tw:pt-14'
            : '',
          mobileRow &&
            'tw:w-full tw:flex-col tw:items-stretch tw:justify-start tw:gap-y-2 tw:py-1',
        ]"
      >
        <template v-if="mobileRow">
          <!-- Row 1: time format, timezone, days per page, grouped left -->
          <div
            v-if="!toolRow.event.daysOnly"
            class="tw:flex tw:w-full tw:flex-row tw:items-center tw:gap-x-2"
          >
            <div class="tw:shrink-0">
              <TimeFormatToggle
                :model-value="toolRow.timeType"
                @update:model-value="toolRow.actions.updateTimeType"
              />
            </div>
            <TimezoneSelector
              class="tw:min-w-0"
              :compact="isCompact"
              fit-content
              fixed-width
              field-variant="solo"
              :compact-button="true"
              :model-value="toolRow.curTimezone"
              :modified="toolRow.timezoneModified"
              :reference-date="toolRow.timezoneReferenceDate"
              @update:model-value="
                (val) => toolRow.actions.updateCurTimezone(val)
              "
              @reset="toolRow.actions.resetCurTimezone()"
            />
            <div v-if="toolRow.showMobileNumDaysSwitch" class="tw:shrink-0">
              <TimeFormatToggle
                :model-value="toolRow.mobileNumDays"
                :options="mobileNumDaysOptions"
                :indicator-width="56"
                @update:model-value="
                  (value) =>
                    typeof value === 'number' &&
                    toolRow.actions.updateMobileNumDays(value)
                "
              />
            </div>
          </div>

          <!-- Row 2: Show best times, Collapse disabled times -->
          <div
            v-if="toolRow.numResponses >= 1 || collapseDisabledTimesDirect"
            class="tw:flex tw:w-full tw:items-center"
          >
            <v-switch
              v-if="toolRow.numResponses >= 1"
              id="mobile-show-best-times-toggle"
              class="schedule-overlap-compact-switch tw:w-full"
              inset
              :model-value="toolRow.showBestTimes"
              hide-details
              @update:model-value="
                (val: boolean | null) =>
                  toolRow.actions.updateShowBestTimes(!!val)
              "
            >
              <template #label>
                <div class="tw:whitespace-nowrap tw:text-sm tw:text-black">
                  Show best {{ toolRow.event.daysOnly ? "days" : "times" }}
                </div>
              </template>
            </v-switch>
            <v-switch
              v-else-if="collapseDisabledTimesDirect"
              id="mobile-collapse-disabled-times-toggle"
              class="schedule-overlap-compact-switch tw:w-full"
              inset
              :model-value="toolRow.collapseDisabledTimes"
              hide-details
              @update:model-value="
                (val: boolean | null) =>
                  toolRow.actions.updateCollapseDisabledTimes(!!val)
              "
            >
              <template #label>
                <div class="tw:whitespace-nowrap tw:text-sm tw:text-black">
                  Collapse disabled times
                </div>
              </template>
            </v-switch>
          </div>

          <!-- Row 3: More options -->
          <EventOptions
            v-if="!collapseDisabledTimesDirect"
            class="tw:w-full"
            variant="menu"
            menu-button-label="More options"
            menu-button-height="32"
            menu-activator-class="tw:w-fit"
            :event="toolRow.event"
            :show-best-times="toolRow.showBestTimes"
            :hide-if-needed="toolRow.hideIfNeeded"
            :collapse-disabled-times="toolRow.collapseDisabledTimes"
            :start-calendar-on-monday="toolRow.startCalendarOnMonday"
            :num-responses="toolRow.numResponses"
            :include-show-best-times="false"
            @update:hide-if-needed="
              (val) => toolRow.actions.updateHideIfNeeded(val)
            "
            @update:collapse-disabled-times="
              (val) => toolRow.actions.updateCollapseDisabledTimes(val)
            "
            @update:start-calendar-on-monday="
              (val) => toolRow.actions.updateStartCalendarOnMonday(val)
            "
          />
        </template>
        <template v-else>
          <!-- Timezone, time format -->
          <div
            v-if="!toolRow.event.daysOnly"
            :class="[
              'tw:flex tw:items-center tw:gap-2',
              compact && !mobileRow
                ? 'tw:w-full tw:flex-row tw:items-center tw:gap-3'
                : '',
            ]"
          >
            <div v-if="isCompact" class="tw:shrink-0">
              <TimeFormatToggle
                :model-value="toolRow.timeType"
                @update:model-value="toolRow.actions.updateTimeType"
              />
            </div>
            <div
              v-if="!isCompact"
              class="tw:order-first tw:text-sm tw:text-black"
            >
              Shown in
            </div>
            <TimezoneSelector
              :class="[
                isCompact
                  ? 'tw:min-w-0 tw:flex-1'
                  : 'tw:order-first tw:w-full tw:sm:w-[unset]',
              ]"
              :compact="isCompact"
              field-variant="solo"
              :compact-button="true"
              :model-value="toolRow.curTimezone"
              :modified="toolRow.timezoneModified"
              :reference-date="toolRow.timezoneReferenceDate"
              @update:model-value="
                (val) => toolRow.actions.updateCurTimezone(val)
              "
              @reset="toolRow.actions.resetCurTimezone()"
            />
          </div>

          <template
            v-if="
              toolRow.state === toolRow.states.EDIT_AVAILABILITY &&
              toolRow.isWeekly &&
              !mobileRow
            "
          >
            <v-spacer />
            <div class="tw:min-w-fit">
              <GCalWeekSelector
                v-if="toolRow.calendarPermissionGranted"
                :week-offset="toolRow.weekOffset"
                :event="toolRow.event"
                :start-on-monday="toolRow.event.startOnMonday"
                @update:week-offset="
                  (val) => toolRow.actions.updateWeekOffset(val)
                "
              />
            </div>
          </template>
        </template>
      </div>
    </div>
  </div>
</template>

<script setup lang="ts">
import { computed } from "vue"
import TimezoneSelector from "./TimezoneSelector.vue"
import GCalWeekSelector from "./GCalWeekSelector.vue"
import EventOptions from "./EventOptions.vue"
import TimeFormatToggle, {
  type SegmentedToggleOption,
} from "./TimeFormatToggle.vue"
import type { ScheduleOverlapToolRowViewModel } from "./scheduleOverlapViewModelContracts"

const props = withDefaults(
  defineProps<{
    toolRow: ScheduleOverlapToolRowViewModel
    compact?: boolean
    mobileRow?: boolean
  }>(),
  {
    compact: false,
    mobileRow: false,
  },
)

const isCompact = computed(() => props.compact || props.mobileRow)

const collapseDisabledTimesDirect = computed(
  () => !props.toolRow.event.daysOnly && props.toolRow.numResponses < 1,
)

const mobileNumDaysOptions: SegmentedToggleOption[] = [
  { label: "3 days", value: 3 },
  { label: "7 days", value: 7 },
]
</script>

<style scoped src="./ScheduleOverlapCompactSwitch.css"></style>

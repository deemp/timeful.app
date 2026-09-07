<template>
  <div class="schedule-overlap-days-only-grid tw:grow">
    <div class="tw:flex tw:h-9 tw:items-center tw:justify-between">
      <v-btn
        :class="daysOnlyGrid.hasPrevPage ? 'tw:visible' : 'tw:invisible'"
        class="tw:h-8 tw:w-8 tw:min-w-8 tw:border-outline-neutral tw:sm:h-[36px] tw:sm:w-[36px] tw:sm:min-w-[36px]"
        variant="outlined"
        icon
        @click="daysOnlyGrid.actions.prevPage"
        ><v-icon>mdi-chevron-left</v-icon></v-btn
      >
      <div class="tw:text-lg tw:font-medium tw:capitalize tw:sm:text-xl">
        {{ daysOnlyGrid.curMonthText }}
      </div>
      <v-btn
        :class="daysOnlyGrid.hasNextPage ? 'tw:visible' : 'tw:invisible'"
        class="tw:h-8 tw:w-8 tw:min-w-8 tw:border-outline-neutral tw:sm:h-[36px] tw:sm:w-[36px] tw:sm:min-w-[36px]"
        variant="outlined"
        icon
        @click="daysOnlyGrid.actions.nextPage"
        ><v-icon>mdi-chevron-right</v-icon></v-btn
      >
    </div>
    <div
      class="schedule-overlap-days-only-grid__weekdays tw:flex tw:h-7 tw:w-full tw:items-center"
    >
      <div
        v-for="day in daysOnlyGrid.daysOfWeek"
        :key="day"
        class="schedule-overlap-days-only-grid__weekday tw:flex-1 tw:text-center tw:text-sm tw:capitalize tw:text-dark-gray tw:sm:text-base"
      >
        {{ day }}
      </div>
    </div>
    <div class="tw:relative">
      <div
        id="drag-section"
        class="schedule-overlap-days-only-grid__month tw:grid tw:grid-cols-7"
        :style="{ touchAction: daysOnlyGrid.allowDrag ? 'none' : 'pan-y' }"
        @pointerdown="daysOnlyGrid.actions.startDrag"
        @pointermove="daysOnlyGrid.actions.moveDrag"
        @pointerup="daysOnlyGrid.actions.endDrag"
        @pointercancel="daysOnlyGrid.actions.endDrag"
        @lostpointercapture="daysOnlyGrid.actions.endDrag"
        @mousedown="daysOnlyGrid.actions.startDrag"
        @mousemove="daysOnlyGrid.actions.moveDrag"
        @mouseup="daysOnlyGrid.actions.endDrag"
        @mouseleave="daysOnlyGrid.actions.resetCurTimeslot()"
      >
        <div
          v-for="(day, i) in daysOnlyGrid.monthDays"
          :key="day.time.epochMilliseconds"
          class="timeslot tw:flex tw:aspect-2/1 tw:items-center tw:justify-center tw:text-sm tw:sm:text-base"
          :class="daysOnlyGrid.dayTimeslotClassStyle[i].class"
          :style="daysOnlyGrid.dayTimeslotClassStyle[i].style"
          v-on="daysOnlyGrid.dayTimeslotVon[i]"
        >
          {{ day.date }}
        </div>
      </div>
      <ZigZag
        v-if="daysOnlyGrid.hasPrevPage"
        left
        class="tw:absolute tw:left-0 tw:top-0 tw:h-full tw:w-3"
      />
      <ZigZag
        v-if="daysOnlyGrid.hasNextPage"
        right
        class="tw:absolute tw:right-0 tw:top-0 tw:h-full tw:w-3"
      />
    </div>

    <v-expand-transition>
      <div
        v-if="!daysOnlyGrid.isPhone && daysOnlyGrid.hintTextShown"
        :key="daysOnlyGrid.hintText"
        class="tw:sticky tw:bottom-4 tw:z-10 tw:flex"
      >
        <div
          class="tw:mt-2 tw:flex tw:w-full tw:items-center tw:justify-between tw:gap-1 tw:rounded-md tw:bg-off-white tw:p-2 tw:px-[7px] tw:text-sm tw:text-very-dark-gray"
        >
          <div class="tw:flex tw:items-center tw:gap-1">
            <v-icon small>mdi-information-outline</v-icon>
            {{ daysOnlyGrid.hintText }}
          </div>
          <v-icon small @click="daysOnlyGrid.actions.closeHint()"
            >mdi-close</v-icon
          >
        </div>
      </div>
    </v-expand-transition>
  </div>
</template>

<script setup lang="ts">
import type { ScheduleOverlapDaysOnlyGridViewModel } from "./scheduleOverlapViewModelContracts"
import ZigZag from "./ZigZag.vue"

defineOptions({
  name: "ScheduleOverlapDaysOnlyGrid",
})

defineProps<{
  daysOnlyGrid: ScheduleOverlapDaysOnlyGridViewModel
}>()
</script>

<style>
.schedule-overlap-days-only-grid,
.schedule-overlap-days-only-grid__weekdays,
.schedule-overlap-days-only-grid__weekday,
.schedule-overlap-days-only-grid__month {
  min-width: 0;
}

.schedule-overlap-days-only-grid__selected-timeslot::after {
  box-shadow: inset 0 0 0 2px var(--timeful-grid-cursor-outline);
  content: "";
  inset: 0;
  pointer-events: none;
  position: absolute;
  z-index: 40;
}

@media (min-width: 640px) and (max-width: 767px) {
  .schedule-overlap-days-only-grid,
  .schedule-overlap-days-only-grid__weekdays,
  .schedule-overlap-days-only-grid__month {
    width: 100%;
  }

  .schedule-overlap-days-only-grid__weekday {
    min-width: 0;
  }
}
</style>

<template>
  <div class="tw:flex tw:flex-col tw:gap-1">
    <div class="tw:text-lg tw:font-medium">Legend</div>
    <div v-if="showResponsePalette" class="tw:flex tw:items-start">
      <div class="color-legend__indicator-slot">
        <div
          class="tw:h-4 tw:w-4 tw:rounded tw:border tw:border-outline-neutral tw:bg-[#00994C77]"
        ></div>
      </div>
      <span class="tw:text-sm">Available</span>
    </div>
    <div v-if="showResponsePalette" class="tw:flex tw:items-start">
      <div class="color-legend__indicator-slot">
        <div
          class="tw:h-4 tw:w-4 tw:rounded tw:border tw:border-outline-neutral tw:bg-yellow"
        ></div>
      </div>
      <span class="tw:text-sm">If needed</span>
    </div>
    <div v-if="activeSlotsCount > 0" class="tw:flex tw:items-start">
      <div class="color-legend__indicator-slot">
        <div
          class="tw:h-4 tw:w-4 tw:rounded tw:border tw:border-outline-neutral tw:bg-[#F9CCCC]"
        ></div>
      </div>
      <span class="tw:text-sm"
        >Unavailable, change in <br class="tw:hidden tw:md:block" />Add/Edit
        availability</span
      >
    </div>
    <div class="tw:flex tw:items-start">
      <div class="color-legend__indicator-slot">
        <div
          class="tw:h-4 tw:w-4 tw:rounded tw:border tw:border-outline-neutral tw:bg-light-gray-stroke"
        ></div>
      </div>
      <span class="tw:text-sm"
        >Disabled, inside the event dates in the event timezone</span
      >
    </div>
    <div class="tw:flex tw:items-start">
      <div class="color-legend__indicator-slot">
        <div
          class="tw:h-4 tw:w-4 tw:rounded tw:border tw:border-outline-neutral tw:bg-gray"
        ></div>
      </div>
      <span class="tw:text-sm"
        >Disabled, outside the event dates in the event timezone</span
      >
    </div>
    <div v-if="canCollapseHours" class="tw:flex tw:items-start">
      <div class="color-legend__indicator-slot">
        <div
          class="color-legend-indicator--collapsed tw:h-4 tw:w-4 tw:rounded tw:bg-(--timeful-collapsed-hours-bg)"
        ></div>
      </div>
      <span class="tw:text-sm">Disabled, collapsed</span>
    </div>
    <div class="tw:flex tw:items-start">
      <div class="color-legend__indicator-slot">
        <div
          class="scheduled-event-legend-indicator tw:h-4 tw:w-4 tw:rounded tw:border tw:border-scheduled-event tw:bg-scheduled-event"
        ></div>
      </div>
      <span class="tw:text-sm">Scheduled event</span>
    </div>
  </div>
</template>

<script setup lang="ts">
import { computed } from "vue"

const props = defineProps<{
  activeSlotsCount: number
  responseCount: number
  isAddingAvailability: boolean
  canCollapseHours?: boolean
}>()

const showResponsePalette = computed(
  () => props.isAddingAvailability || props.responseCount > 0,
)
</script>

<style scoped>
.color-legend__indicator-slot {
  display: flex;
  flex: 0 0 auto;
  width: 1.25rem;
  height: 1.25rem;
  margin-right: 0.75rem;
  margin-left: 0.25rem;
  align-items: center;
  justify-content: center;
}

.color-legend-indicator--collapsed {
  border: var(--timeful-grid-line-width) dashed var(--timeful-grid-line-color);
}
</style>

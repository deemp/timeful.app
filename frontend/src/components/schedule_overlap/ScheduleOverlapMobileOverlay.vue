<template>
  <div
    ref="overlayRootRef"
    class="schedule-overlap-mobile-overlay timeful-bottom-overlay-layer tw:pointer-events-auto tw:fixed tw:inset-x-0 tw:isolate"
    :style="{ bottom: overlay.bottomOffset }"
    @pointerdown.stop
    @pointerup.stop
    @mousedown.stop
    @mouseup.stop
    @touchstart.stop
    @touchend.stop
    @click.stop
  >
    <v-expand-transition>
      <template v-if="overlay.hintTextShown">
        <div :key="overlay.hintText">
          <div
            class="tw:flex tw:w-full tw:items-center tw:justify-between tw:gap-1 tw:bg-light-gray tw:px-2 tw:py-2 tw:text-sm tw:text-very-dark-gray"
          >
            <div
              :class="`tw:flex tw-gap-${overlay.hintText.length > 60 ? 2 : 1}`"
            >
              <v-icon small>mdi-information-outline</v-icon>
              <div>
                {{ overlay.hintText }}
              </div>
            </div>
            <v-icon small @click="emit('closeHint')">mdi-close</v-icon>
          </div>
        </div>
      </template>
    </v-expand-transition>

    <v-expand-transition>
      <div
        v-if="!overlay.isGroup && overlay.editing && !overlay.isSignUp"
        class="timeful-mobile-elevated-panel tw:p-4"
      >
        <div class="tw:flex tw:flex-col tw:gap-3">
          <EditingAvailabilityAs
            v-if="overlay.editingAvailabilityAs.visible"
            variant="chip"
            class="tw:justify-end"
            :editing-as="overlay.editingAvailabilityAs"
            :edit-guest-name-dialog="overlay.editGuestNameDialog"
            :new-guest-name="overlay.newGuestName"
            @open-edit-guest-name-dialog="emit('openEditGuestNameDialog')"
            @save-guest-name="emit('saveGuestName')"
            @update:new-guest-name="emit('update:newGuestName', $event)"
            @update:edit-guest-name-dialog="
              emit('update:editGuestNameDialog', $event)
            "
          />
          <div class="tw:flex tw:items-center tw:gap-3">
            <v-btn
              v-if="!overlay.event.daysOnly && overlay.showCalendarOptions"
              variant="outlined"
              prepend-icon="mdi-calendar"
              class="calendar-options-button tw:shrink-0 tw:border-outline-neutral tw:px-3 tw:text-sm"
              @click="emit('update:calendarOptionsDialog', true)"
            >
              Calendar options
            </v-btn>
            <AvailabilityTypeToggle
              :model-value="overlay.availabilityType"
              class="tw:min-w-0 tw:flex-1"
              @update:model-value="
                emit('update:availabilityType', $event as AvailabilityType)
              "
            />
          </div>
        </div>
      </div>
    </v-expand-transition>

    <v-expand-transition>
      <div
        v-if="
          overlay.isWeekly &&
          overlay.editing &&
          overlay.calendarPermissionGranted
        "
      >
        <div class="tw:h-16 tw:text-sm">
          <GCalWeekSelector
            :week-offset="overlay.weekOffset"
            :event="overlay.event"
            :start-on-monday="overlay.event.startOnMonday"
            @update:week-offset="emit('update:weekOffset', $event)"
          />
        </div>
      </div>
    </v-expand-transition>

    <v-expand-transition>
      <div
        v-if="overlay.showStickyRespondents && !overlay.editing"
        class="timeful-mobile-elevated-panel tw:px-4 tw:pt-4"
      >
        <ScheduleOverlapRespondentsPanel
          :max-height="240"
          :panel="overlay.respondentsPanel"
          v-bind="respondentsPanelListeners"
        />
      </div>
    </v-expand-transition>

    <v-expand-transition>
      <div
        v-if="overlay.state === states.SET_SPECIFIC_TIMES"
        class="tw:-mb-16 tw:bg-white tw:p-4"
      >
        <SpecificTimesInstructions
          :num-temp-times="overlay.numTempTimes"
          @save-temp-times="emit('saveTempTimes')"
        />
      </div>
    </v-expand-transition>
  </div>
</template>

<script setup lang="ts">
import { onBeforeUnmount, onMounted, ref } from "vue"
import type { AvailabilityType } from "@/constants"
import { states } from "@/composables/schedule_overlap/types"
import AvailabilityTypeToggle from "./AvailabilityTypeToggle.vue"
import EditingAvailabilityAs from "./EditingAvailabilityAs.vue"
import GCalWeekSelector from "./GCalWeekSelector.vue"
import ScheduleOverlapRespondentsPanel from "./ScheduleOverlapRespondentsPanel.vue"
import SpecificTimesInstructions from "./SpecificTimesInstructions.vue"
import type { ScheduleOverlapMobileOverlayViewModel } from "./scheduleOverlapViewModelContracts"

defineProps<{
  overlay: ScheduleOverlapMobileOverlayViewModel
}>()

const emit = defineEmits<{
  closeHint: []
  overlayHeightChange: [height: number]
  "update:availabilityType": [value: AvailabilityType]
  "update:calendarOptionsDialog": [value: boolean]
  "update:weekOffset": [value: number]
  "update:showCalendarEvents": [value: boolean]
  "update:showBestTimes": [value: boolean]
  "update:hideIfNeeded": [value: boolean]
  "update:collapseDisabledTimes": [value: boolean]
  openEditGuestNameDialog: []
  saveGuestName: []
  "update:newGuestName": [value: string]
  "update:editGuestNameDialog": [value: boolean]
  addAvailabilityAsGuest: []
  addAvailability: []
  mouseOverRespondent: [e: MouseEvent, userId: string]
  mouseLeaveRespondent: []
  clickRespondent: [e: MouseEvent, userId: string]
  editGuestAvailability: [userId: string]
  guestAvailabilityDeleted: [userId: string]
  refreshEvent: []
  saveTempTimes: []
}>()

const overlayRootRef = ref<HTMLElement | null>(null)
let overlayResizeObserver: ResizeObserver | null = null
let lastEmittedOverlayHeight = -1

const emitOverlayHeight = (height: number) => {
  const rounded = Math.round(height)
  if (rounded === lastEmittedOverlayHeight) {
    return
  }
  lastEmittedOverlayHeight = rounded
  emit("overlayHeightChange", rounded)
}

onMounted(() => {
  if (typeof ResizeObserver === "undefined" || !overlayRootRef.value) {
    return
  }
  overlayResizeObserver = new ResizeObserver((entries) => {
    const entry = entries[0]
    emitOverlayHeight(
      entry?.contentRect.height ?? overlayRootRef.value?.offsetHeight ?? 0,
    )
  })
  overlayResizeObserver.observe(overlayRootRef.value)
})

onBeforeUnmount(() => {
  overlayResizeObserver?.disconnect()
  overlayResizeObserver = null
})

const respondentsPanelListeners = {
  "onUpdate:showCalendarEvents": (value: boolean) => {
    emit("update:showCalendarEvents", value)
  },
  "onUpdate:showBestTimes": (value: boolean) => {
    emit("update:showBestTimes", value)
  },
  "onUpdate:hideIfNeeded": (value: boolean) => {
    emit("update:hideIfNeeded", value)
  },
  "onUpdate:collapseDisabledTimes": (value: boolean) => {
    emit("update:collapseDisabledTimes", value)
  },
  onAddAvailability: () => {
    emit("addAvailability")
  },
  onAddAvailabilityAsGuest: () => {
    emit("addAvailabilityAsGuest")
  },
  onMouseOverRespondent: (e: MouseEvent, userId: string) => {
    emit("mouseOverRespondent", e, userId)
  },
  onMouseLeaveRespondent: () => {
    emit("mouseLeaveRespondent")
  },
  onClickRespondent: (e: MouseEvent, userId: string) => {
    emit("clickRespondent", e, userId)
  },
  onEditGuestAvailability: (userId: string) => {
    emit("editGuestAvailability", userId)
  },
  onGuestAvailabilityDeleted: (userId: string) => {
    emit("guestAvailabilityDeleted", userId)
  },
  onRefreshEvent: () => {
    emit("refreshEvent")
  },
} as const
</script>

<template>
  <div
    class="schedule-overlap-sidebar tw:relative"
    :class="
      sidebar.isPhone
        ? 'tw:px-4 tw:py-4 tw:pr-4'
        : ['tw:sticky tw:top-16 tw:flex-none tw:self-start tw:p-0 tw:sm:mr-4']
    "
    :style="{ width: sidebar.rightSideWidth }"
  >
    <template v-if="sidebar.isSignUp">
      <div class="tw:mb-2 tw:text-lg tw:text-black">Slots</div>
      <div v-if="!sidebar.isOwner" class="tw:mb-3 tw:flex tw:flex-col">
        <div
          class="tw:flex tw:flex-col tw:gap-1 tw:rounded-md tw:bg-light-gray tw:p-3 tw:text-xs tw:italic tw:text-dark-gray"
        >
          <div v-if="!sidebar.authUser || sidebar.alreadyRespondedToSignUpForm">
            <a class="tw:underline" :href="`mailto:${sidebar.event.ownerId}`"
              >Contact sign up creator</a
            >
            to edit your slot
          </div>
          <div v-if="sidebar.event.blindAvailabilityEnabled">
            Responses are only visible to creator
          </div>
        </div>
      </div>
      <SignUpBlocksList
        ref="signUpBlocksListRef"
        :sign-up-blocks="sidebar.signUpBlocks"
        :sign-up-blocks-to-add="sidebar.signUpBlocksToAdd"
        :is-editing="sidebar.state === states.EDIT_SIGN_UP_BLOCKS"
        :is-owner="sidebar.isOwner"
        :already-responded="sidebar.alreadyRespondedToSignUpForm"
        :anonymous="sidebar.event.blindAvailabilityEnabled"
        @update:sign-up-block="emit('updateSignUpBlock', $event)"
        @delete:sign-up-block="emit('deleteSignUpBlock', $event)"
        @sign-up-for-block="emit('signUpForBlock', $event)"
      />
    </template>

    <template v-else-if="sidebar.state === states.SET_SPECIFIC_TIMES">
      <SpecificTimesInstructions
        v-if="!sidebar.isPhone"
        :num-temp-times="sidebar.numTempTimes"
        @save-temp-times="emit('saveTempTimes')"
      >
        <ToolRow
          class="schedule-overlap-sidebar__tool-row"
          :compact="true"
          :tool-row="sidebar.toolRow"
        />
      </SpecificTimesInstructions>
    </template>

    <template v-else>
      <div
        v-if="!sidebar.isPhone && !sidebar.event.daysOnly"
        class="schedule-overlap-sidebar__pager tw:absolute tw:left-0 tw:top-0 tw:z-20"
      >
        <v-btn
          :class="sidebar.hasNextPage ? 'tw:visible' : 'tw:invisible'"
          class="tw:h-8 tw:w-8 tw:min-w-8 tw:border-outline-neutral tw:sm:h-[36px] tw:sm:w-[36px] tw:sm:min-w-[36px]"
          variant="outlined"
          icon
          @click="sidebar.nextPage"
          ><v-icon>mdi-chevron-right</v-icon></v-btn
        >
      </div>
      <ToolRow
        v-if="!sidebar.isPhone && !sidebar.isSignUp && !sidebar.event.daysOnly"
        class="schedule-overlap-sidebar__tool-row"
        :compact="true"
        :tool-row="sidebar.toolRow"
      />

      <div
        class="schedule-overlap-sidebar__body"
        :class="[
          (sidebar.state === states.HEATMAP ||
            sidebar.state === states.BEST_TIMES ||
            sidebar.state === states.SINGLE_AVAILABILITY ||
            sidebar.state === states.SUBSET_AVAILABILITY) &&
            !sidebar.event.daysOnly &&
            'tw:pt-2',
          sidebar.state === states.EDIT_AVAILABILITY &&
            !sidebar.isPhone &&
            !sidebar.event.daysOnly &&
            'tw:pt-5',
          !sidebar.isPhone && sidebar.event.daysOnly && 'tw:pt-16',
        ]"
      >
        <div
          v-if="sidebar.state === states.EDIT_AVAILABILITY"
          class="tw:mb-2 tw:flex tw:flex-col tw:gap-5"
        >
          <EditingAvailabilityAs
            v-if="
              sidebar.editingAvailabilityAs.visible &&
              (!sidebar.isPhone || sidebar.isGroup)
            "
            :variant="sidebar.isPhone ? 'sentence' : 'chip'"
            :editing-as="sidebar.editingAvailabilityAs"
            :edit-guest-name-dialog="sidebar.editGuestNameDialog"
            :new-guest-name="sidebar.newGuestName"
            @open-edit-guest-name-dialog="emit('openEditGuestNameDialog')"
            @save-guest-name="emit('saveGuestName')"
            @update:new-guest-name="emit('update:newGuestName', $event)"
            @update:edit-guest-name-dialog="
              emit('update:editGuestNameDialog', $event)
            "
          />

          <AvailabilityTypeToggle
            v-if="!sidebar.isGroup && !sidebar.isPhone"
            :model-value="sidebar.availabilityType"
            class="tw:w-full"
            @update:model-value="onAvailabilityTypeUpdate"
          />

          <CalendarAccounts
            v-if="showCalendarAccounts"
            :toggle-state="true"
            :event-id="sidebar.event._id"
            :calendar-events-map="sidebar.calendarEventsMap"
            :sync-with-backend="!sidebar.isGroup"
            :allow-add-calendar-account="!sidebar.isGroup"
            :initial-calendar-accounts-data="initialCalendarAccountsData"
            @toggle-calendar-account="emit('toggleCalendarAccount', $event)"
            @toggle-sub-calendar-account="
              emit('toggleSubCalendarAccount', $event)
            "
          ></CalendarAccounts>

          <div
            v-if="!sidebar.event.daysOnly && sidebar.showCalendarOptions"
            ref="optionsSectionRef"
          >
            <v-btn
              v-if="!sidebar.isPhone"
              variant="outlined"
              prepend-icon="mdi-calendar"
              class="calendar-options-button tw:w-full tw:border-outline-neutral tw:text-sm"
              @click="emit('update:calendarOptionsDialog', true)"
            >
              Calendar options
            </v-btn>

            <v-dialog
              :model-value="sidebar.calendarOptionsDialog"
              width="500"
              @update:model-value="emit('update:calendarOptionsDialog', $event)"
            >
              <v-card>
                <v-card-title class="tw:flex">
                  <div>Calendar options</div>
                  <v-spacer />
                  <v-btn
                    icon
                    @click="emit('update:calendarOptionsDialog', false)"
                  >
                    <v-icon>mdi-close</v-icon>
                  </v-btn>
                </v-card-title>
                <v-card-text
                  class="tw:flex tw:flex-col tw:gap-6 tw:pb-8 tw:pt-2"
                >
                  <AlertText v-if="sidebar.isGroup" class="tw:-mb-4">
                    Calendar options will only updated for the current group
                  </AlertText>

                  <BufferTimeSwitch
                    :buffer-time="sidebar.bufferTime"
                    :sync-with-backend="!sidebar.isGroup"
                    @update:buffer-time="onBufferTimeUpdate"
                  />

                  <WorkingHoursToggle
                    :working-hours="sidebar.workingHours"
                    :timezone="sidebar.curTimezone"
                    :sync-with-backend="!sidebar.isGroup"
                    @update:working-hours="onWorkingHoursUpdate"
                  />
                </v-card-text>
              </v-card>
            </v-dialog>
          </div>
        </div>

        <template v-else>
          <ScheduleOverlapRespondentsPanel
            ref="respondentsPanelRef"
            :panel="sidebar.respondentsPanel"
            @update:show-calendar-events="
              emit('update:showCalendarEvents', $event)
            "
            @update:show-best-times="emit('update:showBestTimes', $event)"
            @update:hide-if-needed="emit('update:hideIfNeeded', $event)"
            @update:collapse-disabled-times="
              emit('update:collapseDisabledTimes', $event)
            "
            @add-availability="emit('addAvailability')"
            @add-availability-as-guest="emit('addAvailabilityAsGuest')"
            @mouse-over-respondent="
              (e, userId) => emit('mouseOverRespondent', e, userId)
            "
            @mouse-leave-respondent="emit('mouseLeaveRespondent')"
            @click-respondent="
              (e, userId) => emit('clickRespondent', e, userId)
            "
            @edit-guest-availability="emit('editGuestAvailability', $event)"
            @guest-availability-deleted="
              emit('guestAvailabilityDeleted', $event)
            "
            @refresh-event="emit('refreshEvent')"
          />
        </template>

        <ColorLegend
          :active-slots-count="sidebar.activeSlotsCount"
          :response-count="sidebar.responseCount"
          :is-adding-availability="sidebar.state === states.EDIT_AVAILABILITY"
          :can-collapse-hours="sidebar.canCollapseHours"
        />
      </div>
    </template>
  </div>
</template>

<script setup lang="ts">
import { computed, watchEffect, ref } from "vue"
import type { AvailabilityType } from "@/constants"
import type { SignUpBlockLite } from "@/composables/schedule_overlap/types"
import { states } from "@/composables/schedule_overlap/types"
import CalendarAccounts from "@/components/settings/CalendarAccounts.vue"
import SignUpBlocksList from "@/components/sign_up_form/SignUpBlocksList.vue"
import AlertText from "../AlertText.vue"
import ColorLegend from "./ColorLegend.vue"
import EditingAvailabilityAs from "./EditingAvailabilityAs.vue"
import AvailabilityTypeToggle from "./AvailabilityTypeToggle.vue"
import BufferTimeSwitch from "./BufferTimeSwitch.vue"
import SpecificTimesInstructions from "./SpecificTimesInstructions.vue"
import ToolRow from "./ToolRow.vue"
import WorkingHoursToggle from "./WorkingHoursToggle.vue"
import ScheduleOverlapRespondentsPanel from "./ScheduleOverlapRespondentsPanel.vue"
import type { ScheduleOverlapRespondentsPanelExposed } from "./scheduleOverlapContracts"
import type { ScheduleOverlapSidebarViewModel } from "./scheduleOverlapViewModelContracts"
const props = defineProps<{
  sidebar: ScheduleOverlapSidebarViewModel
}>()

const emit = defineEmits<{
  saveTempTimes: []
  openEditGuestNameDialog: []
  saveGuestName: []
  "update:newGuestName": [value: string]
  "update:editGuestNameDialog": [value: boolean]
  "update:availabilityType": [value: AvailabilityType]
  toggleCalendarAccount: [
    payload: { email?: string; calendarType?: string; enabled: boolean },
  ]
  toggleSubCalendarAccount: [
    payload: {
      email?: string
      calendarType?: string
      subCalendarId: string | number
      enabled: boolean
    },
  ]
  updateOverlayAvailability: [value: unknown]
  "update:calendarOptionsDialog": [value: boolean]
  "update:bufferTime": [value: { enabled: boolean; time: number }]
  "update:workingHours": [
    value: { enabled: boolean; startTime: number; endTime: number },
  ]
  updateSignUpBlock: [block: SignUpBlockLite]
  deleteSignUpBlock: [blockId: string]
  signUpForBlock: [block: SignUpBlockLite]
  "update:showCalendarEvents": [value: boolean]
  "update:showBestTimes": [value: boolean]
  "update:hideIfNeeded": [value: boolean]
  "update:collapseDisabledTimes": [value: boolean]
  addAvailabilityAsGuest: []
  addAvailability: []
  mouseOverRespondent: [e: MouseEvent, userId: string]
  mouseLeaveRespondent: []
  clickRespondent: [e: MouseEvent, userId: string]
  editGuestAvailability: [userId: string]
  guestAvailabilityDeleted: [userId: string]
  refreshEvent: []
}>()

const signUpBlocksListRef = ref<{
  scrollToSignUpBlock?: (id: string) => void
} | null>(null)
const optionsSectionRef = ref<HTMLElement | null>(null)
const respondentsPanelRef = ref<ScheduleOverlapRespondentsPanelExposed | null>(
  null,
)
const respondentsPanelEl = ref<HTMLElement | null>(null)

watchEffect(() => {
  respondentsPanelEl.value = respondentsPanelRef.value?.panelEl ?? null
})

const showCalendarAccounts = computed(
  () =>
    props.sidebar.calendarPermissionGranted &&
    !props.sidebar.event.daysOnly &&
    !props.sidebar.addingAvailabilityAsGuest,
)

const initialCalendarAccountsData = computed(() =>
  props.sidebar.isGroup
    ? props.sidebar.sharedCalendarAccounts
    : (props.sidebar.authUser?.calendarAccounts ?? {}),
)

const onAvailabilityTypeUpdate = (value: string) => {
  emit("update:availabilityType", value as AvailabilityType)
}

const onBufferTimeUpdate = (value: { enabled?: boolean; time?: number }) => {
  emit("update:bufferTime", {
    enabled: value.enabled ?? props.sidebar.bufferTime.enabled,
    time: value.time ?? props.sidebar.bufferTime.time,
  })
}

const onWorkingHoursUpdate = (value: {
  enabled?: boolean
  startTime?: number
  endTime?: number
}) => {
  emit("update:workingHours", {
    enabled: value.enabled ?? props.sidebar.workingHours.enabled,
    startTime: value.startTime ?? props.sidebar.workingHours.startTime,
    endTime: value.endTime ?? props.sidebar.workingHours.endTime,
  })
}

defineExpose({
  scrollToSignUpBlock: (id: string) =>
    signUpBlocksListRef.value?.scrollToSignUpBlock?.(id),
  optionsSectionEl: optionsSectionRef,
  respondentsPanelEl,
})
</script>

<style scoped src="./ScheduleOverlapCompactSwitch.css"></style>

<template>
  <span>
    <div v-if="eventLoadStatus === 'ready' && event" class="tw:mt-8 tw:h-full">
      <v-alert
        v-if="event.eventVisitorId && event.isArchived"
        type="info"
        variant="tonal"
        class="tw:mb-4"
      >
        This event is archived and read-only.
      </v-alert>
      <!-- Mark availability option dialog -->
      <MarkAvailabilityDialog
        v-model="choiceDialog"
        :initial-state="linkApple ? 'create_account_apple' : 'choices'"
        @sign-in-link-apple="signInLinkApple"
        @allow-google-calendar="
          () => setAvailabilityAutomatically(calendarTypes.GOOGLE)
        "
        @allow-outlook-calendar="
          () => setAvailabilityAutomatically(calendarTypes.OUTLOOK)
        "
        @set-availability-manually="setAvailabilityManually"
        @added-apple-calendar="addedAppleCalendar"
        @added-i-c-s-calendar="addedICSCalendar"
      />

      <!-- Google sign in not supported dialog -->
      <SignInNotSupportedDialog v-model="webviewDialog" />

      <!-- Guest dialog -->
      <GuestDialog
        v-model="guestDialog"
        :event="event"
        :respondents="guestRespondentNames"
        @submit="handleGuestDialogSubmit"
      />

      <!-- Join sign up slot dialog-->
      <SignUpForSlotDialog
        v-if="currSignUpBlock"
        v-model="signUpForSlotDialog"
        :event="event"
        :sign-up-block="currSignUpBlock"
        @submit="signUpForBlock"
      />

      <!-- Edit event dialog -->
      <NewDialog
        v-model="editEventDialog"
        :type="eventType"
        :event="event"
        :contacts-payload="contactsPayload"
        edit
        no-tabs
        scroll-strategy="none"
        @refresh-event="handleEditDialogRefresh"
      />

      <!-- Group invitation dialog -->
      <InvitationDialog
        v-if="isGroup"
        v-model="invitationDialog"
        :group="event"
        :calendar-permission-granted="calendarPermissionGranted"
        @refresh-event="refreshEvent"
        @set-availability-automatically="setAvailabilityAutomatically"
      ></InvitationDialog>

      <!-- Pages Not Visited dialog -->
      <v-dialog
        v-model="pagesNotVisitedDialog"
        max-width="400"
        content-class="tw:m-0"
      >
        <v-card>
          <v-card-title>Are you sure?</v-card-title>
          <v-card-text
            ><span class="tw:font-medium"
              >You're about to add your availability without filling out all
              pages of this Timeful.</span
            >
            Click the left and right arrows at the top to switch between
            pages.</v-card-text
          >
          <v-card-actions>
            <v-spacer />
            <v-btn variant="text" @click="pagesNotVisitedDialog = false"
              >Cancel</v-btn
            >
            <v-btn
              variant="text"
              color="primary"
              @click="
                () => {
                  saveChanges(true)
                  pagesNotVisitedDialog = false
                }
              "
              >Add anyways</v-btn
            >
          </v-card-actions>
        </v-card>
      </v-dialog>

      <!-- Delete availability confirmation dialog -->
      <v-dialog
        v-model="deleteAvailabilityDialog"
        width="500"
        :retain-focus="false"
      >
        <v-card>
          <v-card-title>Are you sure?</v-card-title>
          <v-card-text class="tw:text-sm tw:text-dark-gray"
            >Are you sure you want to
            {{
              !isGroup
                ? "delete your availability from this event?"
                : "leave this group?"
            }}</v-card-text
          >
          <v-card-actions>
            <v-spacer />
            <v-btn variant="text" @click="deleteAvailabilityDialog = false"
              >Cancel</v-btn
            >
            <v-btn
              variant="text"
              color="error"
              @click="handleDeleteAvailabilityConfirm"
              >{{ !isGroup ? "Delete" : "Leave" }}</v-btn
            >
          </v-card-actions>
        </v-card>
      </v-dialog>

      <div
        class="tw:mx-auto tw:mt-4 tw:lg:flex tw:lg:items-start tw:lg:justify-center tw:lg:gap-6"
      >
        <div class="tw:mx-auto tw:max-w-5xl tw:flex-1">
          <div v-if="!isSettingSpecificTimes" class="tw:mx-4">
            <!-- Desktop rows pair event details with their related controls. -->
            <div
              id="event-header"
              class="tw:flex tw:flex-col tw:gap-3 tw:text-black"
            >
              <div
                class="event-header-row tw:flex tw:flex-col tw:gap-3 tw:sm:flex-row tw:sm:items-start tw:sm:gap-4"
              >
                <div class="tw:min-w-0 tw:flex-1">
                  <div
                    class="sm:mb-2 tw:flex tw:flex-wrap tw:items-center tw:gap-x-4 tw:gap-y-2"
                  >
                    <div
                      class="tw:text-xl tw:sm:text-3xl tw:sm:leading-10"
                      :class="
                        canEditMetadata &&
                        'tw:-mx-2 tw:-my-1 tw:cursor-pointer tw:rounded tw:px-2 tw:py-1 tw:transition-all tw:hover:bg-light-gray'
                      "
                      @click="canEditMetadata && !isScheduling && editEvent()"
                    >
                      {{ event.name }}
                    </div>
                    <v-chip
                      v-if="
                        event.when2meetHref && event.when2meetHref.length > 0
                      "
                      :href="`https://when2meet.com${event.when2meetHref}`"
                      :small="isPhone"
                      class="tw:cursor-pointer tw:select-none tw:rounded tw:bg-light-gray tw:px-2 tw:font-medium tw:sm:px-3"
                      >Imported from when2meet</v-chip
                    >
                    <template v-if="isGroup">
                      <div class="">
                        <v-chip
                          :small="isPhone"
                          class="tw:cursor-pointer tw:select-none tw:rounded tw:bg-light-gray tw:px-2 tw:font-medium tw:sm:px-3"
                          @click="helpDialog = true"
                          >Availability group</v-chip
                        >
                      </div>
                      <HelpDialog v-model="helpDialog">
                        <template #header>Availability group</template>
                        <div class="mb-4">
                          Use availability groups to see group members' weekly
                          calendar availabilities from Google Calendar. Your
                          actual calendar events are NOT visible to others.
                        </div>
                      </HelpDialog>
                    </template>
                  </div>
                </div>
                <div
                  v-if="
                    isGroup ||
                    (!isPhone &&
                      (!isSignUp || canEditAvailability) &&
                      !isReadOnlyEvent)
                  "
                  class="desktop-event-header-actions tw:relative tw:flex tw:min-w-0 tw:flex-col tw:gap-2"
                >
                  <div
                    v-if="isGroup"
                    class="tw:flex tw:flex-row tw:items-center tw:gap-2.5"
                  >
                    <v-btn
                      v-if="
                        event.startOnMonday ? weekOffset != 1 : weekOffset != 0
                      "
                      :icon="isPhone"
                      :variant="isPhone ? 'text' : undefined"
                      class="tw:mr-1 tw:text-very-dark-gray tw:sm:mr-2.5"
                      @click="resetWeekOffset"
                    >
                      <v-icon class="tw:sm:mr-2">mdi-calendar-today</v-icon>
                      <span v-if="!isPhone">Today</span>
                    </v-btn>
                    <v-btn
                      :icon="isPhone"
                      :variant="isPhone ? undefined : 'outlined'"
                      :loading="loading"
                      class="tw:text-green"
                      @click="refreshCalendar"
                    >
                      <v-icon v-if="!isPhone" class="tw:mr-1"
                        >mdi-refresh</v-icon
                      >
                      <span v-if="!isPhone" class="tw:mr-2">Refresh</span>
                      <v-icon v-else class="tw:text-green">mdi-refresh</v-icon>
                    </v-btn>
                  </div>
                  <div
                    v-else-if="
                      !isPhone &&
                      (!isSignUp || canEditAvailability) &&
                      !isReadOnlyEvent
                    "
                    id="event-header-actions"
                    ref="desktopGuestEditMenuRoot"
                    class="tw:w-full"
                  >
                    <template v-if="!isEditing">
                      <template
                        v-if="
                          desktopHasSecondaryOptions ||
                          !desktopShowInlineOptions
                        "
                      >
                        <div class="tw:flex tw:w-full tw:items-start tw:gap-2">
                          <div class="tw:min-w-0 tw:flex-1">
                            <v-btn
                              v-if="showSecondaryAddAvailabilityAction"
                              id="desktop-secondary-availability-btn"
                              variant="outlined"
                              color="primary"
                              class="desktop-event-header-control tw:w-full tw:whitespace-nowrap tw:px-3 tw:text-sm tw:text-green"
                              :disabled="isScheduling"
                              @click="triggerSecondaryAddAvailability"
                            >
                              <v-icon>mdi-plus</v-icon>
                              <span class="tw:ml-1">{{
                                secondaryAddAvailabilityButtonText
                              }}</span>
                            </v-btn>
                          </div>
                          <div class="tw:min-w-0 tw:flex-1">
                            <div
                              class="desktop-primary-availability-anchor tw:relative tw:min-w-0"
                            >
                              <v-btn
                                id="desktop-primary-availability-btn"
                                class="desktop-event-header-control tw:w-full tw:bg-green tw:text-white"
                                :class="desktopPrimaryAvailabilityButtonClass"
                                :disabled="
                                  isScheduling ||
                                  primaryAvailabilityButtonDisabled
                                "
                                @click="handlePrimaryAvailabilityAction"
                              >
                                <v-icon
                                  v-if="
                                    primaryAvailabilityButtonText.startsWith(
                                      'Edit',
                                    )
                                  "
                                  >mdi-pencil</v-icon
                                >
                                <v-icon v-else>mdi-plus</v-icon>
                                <span class="tw:ml-1">{{
                                  primaryAvailabilityButtonText
                                }}</span>
                              </v-btn>
                              <v-menu
                                v-if="
                                  showGuestActionButton &&
                                  hasMultipleOwnedGuestResponses
                                "
                                v-model="showGuestEditMenu"
                                activator="#desktop-primary-availability-btn"
                                :open-on-click="false"
                                location="bottom end"
                                offset="8"
                              >
                                <v-card min-width="164">
                                  <div class="tw:py-1">
                                    <button
                                      v-for="option in ownedGuestEditOptions"
                                      :key="option.lookupKey"
                                      class="tw:block tw:w-full tw:px-3 tw:py-2 tw:text-left tw:text-sm tw:hover:bg-off-white"
                                      @click="
                                        editOwnedGuestAvailability(
                                          option.lookupKey,
                                        )
                                      "
                                    >
                                      {{ option.name }}
                                    </button>
                                  </div>
                                </v-card>
                              </v-menu>
                            </div>
                          </div>
                        </div>
                      </template>
                      <template v-else>
                        <div class="tw:flex tw:justify-end">
                          <div
                            class="desktop-event-header-single-column desktop-primary-availability-anchor tw:relative tw:min-w-0"
                          >
                            <v-btn
                              id="desktop-primary-availability-btn"
                              class="desktop-event-header-control tw:w-full tw:bg-green tw:text-white"
                              :class="desktopPrimaryAvailabilityButtonClass"
                              :disabled="
                                isScheduling ||
                                primaryAvailabilityButtonDisabled
                              "
                              @click="handlePrimaryAvailabilityAction"
                            >
                              <v-icon
                                v-if="
                                  primaryAvailabilityButtonText.startsWith(
                                    'Edit',
                                  )
                                "
                                >mdi-pencil</v-icon
                              >
                              <v-icon v-else>mdi-plus</v-icon>
                              <span class="tw:ml-1">{{
                                primaryAvailabilityButtonText
                              }}</span>
                            </v-btn>
                            <v-menu
                              v-if="
                                showGuestActionButton &&
                                hasMultipleOwnedGuestResponses
                              "
                              v-model="showGuestEditMenu"
                              activator="#desktop-primary-availability-btn"
                              :open-on-click="false"
                              location="bottom end"
                              offset="8"
                            >
                              <v-card min-width="164">
                                <div class="tw:py-1">
                                  <button
                                    v-for="option in ownedGuestEditOptions"
                                    :key="option.lookupKey"
                                    class="tw:block tw:w-full tw:px-3 tw:py-2 tw:text-left tw:text-sm tw:hover:bg-off-white"
                                    @click="
                                      editOwnedGuestAvailability(
                                        option.lookupKey,
                                      )
                                    "
                                  >
                                    {{ option.name }}
                                  </button>
                                </div>
                              </v-card>
                            </v-menu>
                          </div>
                        </div>
                      </template>
                    </template>
                    <template v-else-if="isEditing">
                      <div class="tw:flex tw:justify-end">
                        <div class="tw:flex tw:w-full tw:gap-2">
                          <v-btn
                            variant="outlined"
                            class="desktop-editing-action-control desktop-editing-cancel-button desktop-event-header-control tw:text-red"
                            @click="cancelEditing"
                          >
                            Cancel
                          </v-btn>
                          <v-btn
                            class="desktop-editing-action-control desktop-editing-save-button desktop-event-header-control tw:text-white"
                            :class="'tw:bg-green'"
                            :disabled="respondentSaveDisabled"
                            @click="saveChanges"
                          >
                            Save
                          </v-btn>
                        </div>
                      </div>
                    </template>
                  </div>
                </div>
              </div>

              <div
                id="event-header-meta-row"
                class="event-header-row tw:flex tw:flex-col tw:gap-2 tw:sm:flex-row tw:sm:items-center tw:sm:gap-4"
              >
                <div
                  id="event-header-button-row"
                  class="tw:flex tw:min-w-0 tw:flex-1 tw:flex-wrap tw:items-center tw:gap-2"
                >
                  <template v-if="canEditMetadata">
                    <v-btn
                      id="edit-event-btn"
                      variant="outlined"
                      color="primary"
                      class="event-metadata-action-button"
                      :disabled="isScheduling"
                      @click="editEvent"
                    >
                      <v-icon class="tw:text-green">mdi-pencil</v-icon>
                      <span class="tw:ml-1 tw:text-green"
                        >Edit {{ isGroup ? "group" : "event" }}</span
                      >
                    </v-btn>
                  </template>
                  <EventAccessTransfer :event="event" />
                  <EventOwnerActions
                    :event="event"
                    @changed="refreshEvent"
                    @deleted="router.push('/')"
                  />
                  <v-btn
                    v-if="!isGroup"
                    id="copy-link-btn"
                    variant="outlined"
                    color="primary"
                    class="event-metadata-action-button"
                    @click="copyLink"
                  >
                    <v-icon class="tw:text-green">mdi-content-copy</v-icon>
                    <span class="tw:ml-1 tw:text-green">Copy link</span>
                  </v-btn>
                </div>
                <div
                  v-if="
                    !isPhone &&
                    !isGroup &&
                    !isEditing &&
                    desktopHasSecondaryOptions
                  "
                  class="desktop-event-header-actions tw:flex tw:min-w-0 tw:gap-2"
                  :class="{
                    'tw:justify-end': desktopShowInlineStartOnMonday,
                  }"
                >
                  <div
                    v-if="showBestTimesToggle"
                    id="desktop-header-show-best-times"
                    class="desktop-event-header-options__best-times-slot tw:flex-1"
                  >
                    <v-switch
                      id="show-best-times-header-toggle"
                      class="desktop-event-header-control schedule-overlap-compact-switch desktop-event-header-options__best-times-switch"
                      inset
                      :model-value="desktopShowBestTimes"
                      hide-details
                      @update:model-value="updateDesktopShowBestTimes"
                    >
                      <template #label>
                        <div
                          class="tw:whitespace-nowrap tw:text-sm tw:text-black"
                        >
                          Show best
                          {{ scheduleOverlapEvent.daysOnly ? "days" : "times" }}
                        </div>
                      </template>
                    </v-switch>
                  </div>
                  <div
                    v-if="desktopShowInlineStartOnMonday"
                    id="desktop-header-start-calendar-on-monday"
                    class="desktop-event-header-options__start-on-monday-slot desktop-event-header-single-column"
                  >
                    <v-switch
                      id="start-calendar-on-monday-toggle"
                      class="desktop-event-header-control schedule-overlap-compact-switch desktop-event-header-options__start-on-monday-switch"
                      inset
                      :model-value="desktopStartCalendarOnMonday"
                      hide-details
                      @update:model-value="
                        (value: boolean | null) =>
                          updateDesktopStartCalendarOnMonday(!!value)
                      "
                    >
                      <template #label>
                        <div
                          class="tw:whitespace-nowrap tw:text-sm tw:text-black"
                        >
                          Start on Monday
                        </div>
                      </template>
                    </v-switch>
                  </div>
                  <div
                    v-else
                    id="desktop-header-more-options"
                    class="desktop-event-header-options__menu tw:flex-1"
                  >
                    <EventOptions
                      variant="menu"
                      :event="scheduleOverlapEvent"
                      :show-best-times="desktopShowBestTimes"
                      :hide-if-needed="desktopHideIfNeeded"
                      :collapse-disabled-times="desktopCollapseDisabledTimes"
                      :show-calendar-events="desktopShowCalendarEvents"
                      :start-calendar-on-monday="desktopStartCalendarOnMonday"
                      :num-responses="numResponses"
                      :include-show-best-times="false"
                      menu-button-label="More options"
                      menu-activator-class="desktop-event-header-control desktop-event-header-options__menu-button tw:justify-between tw:w-full"
                      @update:hide-if-needed="updateDesktopHideIfNeeded"
                      @update:collapse-disabled-times="
                        updateDesktopCollapseDisabledTimes
                      "
                      @update:show-calendar-events="
                        updateDesktopShowCalendarEvents
                      "
                      @update:start-calendar-on-monday="
                        updateDesktopStartCalendarOnMonday
                      "
                    />
                  </div>
                </div>
                <div
                  v-else-if="
                    !isPhone &&
                    !isGroup &&
                    !isEditing &&
                    desktopShowInlineOptions
                  "
                  class="desktop-event-header-actions tw:flex tw:justify-end"
                >
                  <div class="desktop-event-header-single-column">
                    <v-switch
                      id="collapse-disabled-times-toggle"
                      class="desktop-event-header-control schedule-overlap-compact-switch desktop-event-header-options__collapse-disabled-times-switch tw:w-full"
                      inset
                      :model-value="desktopCollapseDisabledTimes"
                      hide-details
                      @update:model-value="updateDesktopCollapseDisabledTimes"
                    >
                      <template #label>
                        <div class="tw:text-sm tw:text-black">
                          Collapse disabled times
                        </div>
                      </template>
                    </v-switch>
                  </div>
                </div>
                <div
                  v-else-if="!isPhone && !isGroup && isEditing"
                  class="desktop-event-header-actions"
                >
                  <div class="tw:flex tw:w-full tw:gap-2">
                    <div
                      v-if="scheduleOverlap?.showOverlayAvailabilityToggle"
                      id="desktop-editing-overlay-availability-slot"
                      class="tw:flex-1"
                    >
                      <v-switch
                        id="overlay-availabilities-toggle"
                        class="desktop-editing-overlay-availability-toggle desktop-event-header-control schedule-overlap-compact-switch tw:w-full"
                        inset
                        hide-details
                        :model-value="
                          scheduleOverlap?.overlayAvailability ?? false
                        "
                        @update:model-value="
                          (value: boolean | null) =>
                            scheduleOverlap?.updateOverlayAvailability(!!value)
                        "
                      >
                        <template #label>
                          <div class="tw:text-sm tw:text-black">
                            Overlay availability
                          </div>
                        </template>
                      </v-switch>
                    </div>
                    <div
                      v-if="
                        scheduleOverlapEvent.daysOnly &&
                        scheduleOverlap?.showOverlayAvailabilityToggle
                      "
                      id="desktop-editing-start-calendar-on-monday"
                      class="desktop-event-header-options__start-on-monday-slot tw:flex-1"
                    >
                      <v-switch
                        id="desktop-editing-start-calendar-on-monday-toggle"
                        class="desktop-event-header-control schedule-overlap-compact-switch desktop-event-header-options__start-on-monday-switch"
                        inset
                        hide-details
                        :model-value="desktopStartCalendarOnMonday"
                        @update:model-value="
                          (value: boolean | null) =>
                            updateDesktopStartCalendarOnMonday(!!value)
                        "
                      >
                        <template #label>
                          <div
                            class="tw:whitespace-nowrap tw:text-sm tw:text-black"
                          >
                            Start on Monday
                          </div>
                        </template>
                      </v-switch>
                    </div>
                    <div
                      v-if="!scheduleOverlapEvent.daysOnly"
                      id="desktop-editing-more-options"
                      class="desktop-event-header-options__menu tw:flex-1"
                    >
                      <EventOptions
                        class="tw:w-full"
                        variant="menu"
                        :event="scheduleOverlapEvent"
                        :show-best-times="false"
                        :hide-if-needed="desktopHideIfNeeded"
                        :collapse-disabled-times="
                          scheduleOverlap?.collapseDisabledTimes ?? true
                        "
                        :num-responses="numResponses"
                        :include-show-best-times="false"
                        :include-hide-if-needed="false"
                        menu-button-label="More options"
                        menu-activator-class="desktop-event-header-control desktop-event-header-options__menu-button tw:justify-between tw:w-full"
                        @update:hide-if-needed="updateDesktopHideIfNeeded"
                        @update:collapse-disabled-times="
                          updateDesktopCollapseDisabledTimes
                        "
                      />
                    </div>
                  </div>
                </div>
              </div>

              <div
                v-if="!isEditing || showDeleteAvailabilityAction"
                class="event-header-row tw:flex tw:flex-col tw:gap-2 tw:sm:flex-row tw:sm:items-start tw:sm:gap-4"
              >
                <div
                  v-if="!isEditing && event.description?.trim()"
                  class="tw:min-w-0 tw:flex-1"
                >
                  <EventDescription
                    :event="event"
                    class="event-header-description"
                  />
                </div>
                <div
                  v-if="
                    !isPhone &&
                    !isGroup &&
                    isEditing &&
                    showDeleteAvailabilityAction
                  "
                  class="desktop-editing-delete-actions desktop-event-header-actions tw:flex tw:justify-end tw:sm:ml-auto"
                >
                  <v-btn
                    id="desktop-delete-availability-btn"
                    variant="outlined"
                    class="destructive-outlined-button desktop-editing-delete-button desktop-event-header-control tw:normal-case"
                    @click="deleteAvailabilityDialog = true"
                  >
                    <v-icon>mdi-trash-can-outline</v-icon>
                    <span class="tw:ml-1">Delete</span>
                  </v-btn>
                </div>
                <div
                  v-if="
                    !isPhone &&
                    !isGroup &&
                    !isEditing &&
                    !isScheduling &&
                    showScheduleEventButton
                  "
                  class="desktop-event-header-actions tw:flex tw:justify-end tw:sm:ml-auto"
                >
                  <v-btn
                    id="desktop-schedule-event-btn"
                    variant="outlined"
                    class="desktop-event-header-control tw:text-blue"
                    :class="desktopScheduleEventButtonClass"
                    @click="scheduleEvent"
                  >
                    <v-icon small>mdi-calendar-check</v-icon>
                    <span class="tw:ml-2">{{
                      hasSavedTimefulSchedule
                        ? "Reschedule event"
                        : "Schedule event"
                    }}</span>
                  </v-btn>
                </div>
                <div
                  v-else-if="
                    !isPhone &&
                    !isGroup &&
                    !isEditing &&
                    isScheduling &&
                    showScheduleEventButton
                  "
                  class="desktop-event-header-actions tw:flex tw:justify-end tw:gap-2 tw:sm:ml-auto"
                >
                  <v-btn
                    variant="outlined"
                    class="desktop-event-header-control tw:flex-1 tw:text-red"
                    @click="cancelScheduleEvent"
                  >
                    Cancel
                  </v-btn>
                  <v-btn
                    v-if="hasSavedTimefulSchedule"
                    variant="outlined"
                    class="desktop-event-header-control tw:flex-1 tw:text-red"
                    @click="clearScheduledEvent"
                  >
                    Clear
                  </v-btn>
                  <v-menu offset-y class="tw:z-20">
                    <template #activator="{ props: activatorProps }">
                      <v-btn
                        :disabled="!allowScheduleEvent"
                        class="desktop-event-header-control tw:flex-1 tw:bg-blue tw:text-white"
                        flat
                        v-bind="activatorProps"
                      >
                        Schedule
                      </v-btn>
                    </template>
                    <v-list density="compact">
                      <v-list-item
                        class="schedule-event-menu__item"
                        @click="confirmScheduleEvent('timeful')"
                      >
                        <div class="schedule-event-menu__content">
                          <img
                            src="/favicon-32x32.png"
                            alt=""
                            aria-hidden="true"
                            class="schedule-event-menu__icon tw:mr-2 tw:flex-none"
                          />
                          <v-list-item-title>Timeful</v-list-item-title>
                        </div>
                      </v-list-item>
                      <v-list-item
                        class="schedule-event-menu__item"
                        @click="confirmScheduleEvent('google')"
                      >
                        <div class="schedule-event-menu__content">
                          <img
                            src="@/assets/gcal_logo.png"
                            alt=""
                            aria-hidden="true"
                            class="schedule-event-menu__icon tw:mr-2 tw:flex-none"
                          />
                          <v-list-item-title>Google Calendar</v-list-item-title>
                        </div>
                      </v-list-item>
                      <v-list-item
                        class="schedule-event-menu__item"
                        @click="confirmScheduleEvent('outlook')"
                      >
                        <div class="schedule-event-menu__content">
                          <img
                            src="@/assets/outlook_logo.svg"
                            alt=""
                            aria-hidden="true"
                            class="schedule-event-menu__icon tw:mr-2 tw:flex-none"
                          />
                          <v-list-item-title>Outlook</v-list-item-title>
                        </div>
                      </v-list-item>
                    </v-list>
                  </v-menu>
                </div>
              </div>
            </div>
          </div>

          <!-- Calendar -->

          <ScheduleOverlap
            v-if="scheduleOverlapReady"
            :key="scheduleOverlapRenderKey"
            ref="scheduleOverlap"
            v-model:week-offset="weekOffset"
            :event="scheduleOverlapEvent"
            :from-edit-event="fromEditEvent"
            :from-create-specific-times-draft="fromCreateSpecificTimesDraft"
            :specific-times-entry-draft="specificTimesEntryDraft"
            :loading-calendar-events="loading"
            :calendar-events-map="calendarEventsMap"
            :calendar-permission-granted="calendarPermissionGranted"
            :calendar-availabilities="calendarAvailabilities"
            :cur-guest-id="curGuestId"
            :initial-timezone="initialTimezone"
            :adding-availability-as-guest="addingAvailabilityAsGuest"
            :refresh-event-fn="refreshEvent"
            @add-availability="addAvailability"
            @add-availability-as-guest="addAvailabilityAsGuest"
            @refresh-event="refreshEvent"
            @highlight-availability-btn="highlightAvailabilityBtn"
            @delete-availability="deleteAvailability"
            @set-cur-guest-id="(id) => (curGuestId = id)"
            @sign-up-for-block="initiateSignUpFlow"
          />
          <div
            v-else
            class="tw:mx-4 tw:mt-6 tw:h-112 tw:rounded-xl tw:border tw:border-light-gray tw:bg-white"
          ></div>
        </div>
      </div>

      <template v-if="isPhone && privacyPolicyEnabled">
        <div
          class="tw:w-full tw:border-t tw:border-solid tw:border-outline-neutral"
        ></div>
        <v-btn
          class="tw:h-16"
          block
          variant="text"
          :to="{ name: 'privacy-policy' }"
        >
          Privacy Policy
        </v-btn>
      </template>

      <div
        class="tw:mb-16 tw:hidden tw:flex-col tw:items-center tw:justify-between tw:sm:flex"
      >
        <router-link
          v-if="privacyPolicyEnabled"
          class="tw:text-xs tw:font-medium tw:text-gray"
          :to="{ name: 'privacy-policy' }"
        >
          Privacy Policy
        </router-link>
      </div>

      <div class="tw:h-8"></div>
      <!-- Bottom bar for phones -->
      <div
        v-if="
          !isSettingSpecificTimes &&
          isPhone &&
          (!isSignUp || canEditAvailability) &&
          !isReadOnlyEvent
        "
        ref="mobileGuestEditMenuRoot"
        class="timeful-action-bar-layer tw:fixed tw:bottom-0 tw:flex tw:w-full tw:flex-col"
      >
        <v-menu
          v-if="showGuestActionButton && hasMultipleOwnedGuestResponses"
          v-model="showGuestEditMenu"
          activator="#mobile-primary-availability-btn"
          :open-on-click="false"
          location="top end"
          offset="8"
        >
          <v-card min-width="164">
            <div class="tw:py-1">
              <button
                v-for="option in ownedGuestEditOptions"
                :key="option.lookupKey"
                class="tw:block tw:w-full tw:px-3 tw:py-2 tw:text-left tw:text-sm tw:hover:bg-off-white"
                @click="editOwnedGuestAvailability(option.lookupKey)"
              >
                {{ option.name }}
              </button>
            </div>
          </v-card>
        </v-menu>
        <div
          class="mobile-event-action-bar timeful-mobile-elevated-panel tw:flex tw:h-16 tw:w-full tw:items-center tw:px-4"
          :class="isIOS ? 'tw:pb-2' : ''"
        >
          <template v-if="!isEditing && !isScheduling">
            <div
              v-if="showScheduleEventButton"
              class="tw:flex tw:items-center tw:gap-1"
            >
              <v-btn
                variant="outlined"
                class="tw:border-blue tw:px-2 tw:text-[13px] tw:text-blue tw:max-sm:px-1 tw:max-sm:text-xs"
                @click="scheduleEvent"
              >
                <v-icon>mdi-calendar-check</v-icon>
                <span class="tw:ml-1">{{
                  hasSavedTimefulSchedule ? "Reschedule" : "Schedule"
                }}</span>
              </v-btn>
            </div>
            <v-spacer />
            <div
              class="tw:flex tw:min-w-0 tw:items-center tw:gap-2 tw:max-sm:gap-1"
            >
              <v-btn
                v-if="showSecondaryAddAvailabilityAction"
                id="mobile-secondary-availability-btn"
                variant="outlined"
                class="tw:min-w-0 tw:whitespace-nowrap tw:border-green tw:px-2 tw:text-[13px] tw:text-green tw:max-sm:px-1 tw:max-sm:text-xs"
                @click="triggerSecondaryAddAvailability"
              >
                <v-icon>mdi-plus</v-icon>
                <span class="tw:ml-1">{{
                  secondaryAddAvailabilityButtonText
                }}</span>
              </v-btn>
              <v-btn
                id="mobile-primary-availability-btn"
                class="mobile-primary-availability-button tw:min-w-0 tw:whitespace-nowrap tw:px-2 tw:text-[13px] tw:transition-opacity tw:max-sm:px-1 tw:max-sm:text-xs"
                :class="[
                  mobilePrimaryAvailabilityButtonClass,
                  {
                    'timeful-availability-button-attention':
                      availabilityBtnAttentionActive,
                  },
                ]"
                :disabled="primaryAvailabilityButtonDisabled"
                :style="{ opacity: availabilityBtnOpacity }"
                @click="handlePrimaryAvailabilityAction"
              >
                <v-icon
                  v-if="mobilePrimaryAvailabilityButtonText.startsWith('Edit')"
                  >mdi-pencil</v-icon
                >
                <v-icon v-else>mdi-plus</v-icon>
                <span class="tw:ml-1">{{
                  mobilePrimaryAvailabilityButtonText
                }}</span>
              </v-btn>
            </div>
          </template>
          <template v-else-if="isEditing">
            <v-btn
              v-if="showDeleteAvailabilityAction"
              variant="outlined"
              class="destructive-outlined-button tw:text-sm tw:normal-case"
              @click="deleteAvailabilityDialog = true"
            >
              <v-icon>mdi-trash-can-outline</v-icon>
              <span class="tw:ml-1">Delete</span>
            </v-btn>
            <v-spacer />
            <div class="tw:flex tw:gap-2">
              <v-btn
                variant="outlined"
                class="mobile-editing-cancel-button tw:border-red tw:text-red"
                @click="cancelEditing"
              >
                Cancel
              </v-btn>
              <v-btn
                class="mobile-editing-save-button tw:bg-green tw:text-white"
                :disabled="respondentSaveDisabled"
                @click="saveChanges"
              >
                Save
              </v-btn>
            </div>
          </template>
          <template v-else-if="isScheduling">
            <v-btn
              variant="outlined"
              class="tw:border-blue tw:text-blue"
              @click="cancelScheduleEvent"
            >
              Cancel
            </v-btn>
            <v-btn
              v-if="hasSavedTimefulSchedule"
              variant="outlined"
              class="tw:ml-2 tw:border-blue tw:text-blue"
              @click="clearScheduledEvent"
            >
              Clear
            </v-btn>
            <v-spacer />
            <v-menu location="top end" offset="8">
              <template #activator="{ props: activatorProps }">
                <v-btn
                  :disabled="!allowScheduleEvent"
                  variant="flat"
                  class="mobile-schedule-button tw:border"
                  :class="
                    allowScheduleEvent
                      ? 'tw:border-light-blue tw:bg-white tw:text-blue'
                      : 'mobile-schedule-button--disabled tw:border-scheduled-event tw:bg-scheduled-event tw:text-white'
                  "
                  v-bind="activatorProps"
                >
                  <v-icon>mdi-calendar-check</v-icon>
                  <span class="tw:ml-1">Schedule</span>
                </v-btn>
              </template>
              <v-list density="compact">
                <v-list-item
                  class="schedule-event-menu__item"
                  @click="confirmScheduleEvent('timeful')"
                >
                  <div class="schedule-event-menu__content">
                    <img
                      src="/favicon-32x32.png"
                      alt=""
                      aria-hidden="true"
                      class="schedule-event-menu__icon tw:mr-2 tw:flex-none"
                    />
                    <v-list-item-title>Timeful</v-list-item-title>
                  </div>
                </v-list-item>
                <v-list-item
                  class="schedule-event-menu__item"
                  @click="confirmScheduleEvent('google')"
                >
                  <div class="schedule-event-menu__content">
                    <img
                      src="@/assets/gcal_logo.png"
                      alt=""
                      aria-hidden="true"
                      class="schedule-event-menu__icon tw:mr-2 tw:flex-none"
                    />
                    <v-list-item-title>Google Calendar</v-list-item-title>
                  </div>
                </v-list-item>
                <v-list-item
                  class="schedule-event-menu__item"
                  @click="confirmScheduleEvent('outlook')"
                >
                  <div class="schedule-event-menu__content">
                    <img
                      src="@/assets/outlook_logo.svg"
                      alt=""
                      aria-hidden="true"
                      class="schedule-event-menu__icon tw:mr-2 tw:flex-none"
                    />
                    <v-list-item-title>Outlook</v-list-item-title>
                  </div>
                </v-list-item>
              </v-list>
            </v-menu>
          </template>
        </div>
      </div>
    </div>
    <div
      v-else-if="eventLoadStatus === 'notFound'"
      class="tw:mx-auto tw:mt-12 tw:max-w-2xl tw:px-4"
    >
      <div
        class="tw:rounded-lg tw:border tw:border-light-gray tw:bg-white tw:p-6 tw:text-center"
      >
        <h1 class="tw:text-2xl tw:font-medium tw:text-black">
          Event not found
        </h1>
        <p class="tw:mt-3 tw:text-base tw:text-very-dark-gray">
          This event may have been deleted, or the link may be incorrect.
        </p>
        <RouterLink to="/home">
          <v-btn class="tw:mt-6" color="primary"> Back to home </v-btn>
        </RouterLink>
      </div>
    </div>
  </span>
</template>

<script setup lang="ts">
import {
  ref,
  computed,
  watch,
  toRef,
  onMounted,
  onBeforeUnmount,
  nextTick,
  defineAsyncComponent,
  type PropType,
} from "vue"
import EventAccessTransfer from "@/components/event/EventAccessTransfer.vue"
import EventOwnerActions from "@/components/event/EventOwnerActions.vue"
import { useRouter, useRoute } from "vue-router"
import { storeToRefs } from "pinia"
import { Temporal } from "temporal-polyfill"
import {
  post,
  isIOS as isIOSFn,
  sendPluginError,
  sendPluginSuccess,
  isValidPluginMessage,
  validateDOWPayload,
  normalizePluginSetSlots,
  resolvePluginTimezoneValue,
} from "@/utils"
import { validateEmail } from "@/utils"
import { logEventBoot } from "@/utils/eventBootDebug"
import {
  getPluginEventTimeRange,
  normalizePluginResponses,
  type PluginResponseInput,
} from "@/views/event/pluginResponsesBoundary"

import NewDialog from "@/components/NewDialog.vue"
import GuestDialog from "@/components/GuestDialog.vue"
import SignUpForSlotDialog from "@/components/sign_up_form/SignUpForSlotDialog.vue"
import { errors, eventTypes, calendarTypes, allTimezones } from "@/constants"
import SignInNotSupportedDialog from "@/components/SignInNotSupportedDialog.vue"
import MarkAvailabilityDialog from "@/components/calendar_permission_dialogs/MarkAvailabilityDialog.vue"
import InvitationDialog from "@/components/groups/InvitationDialog.vue"
import HelpDialog from "@/components/HelpDialog.vue"
import EventDescription from "@/components/event/EventDescription.vue"
import EventOptions from "@/components/schedule_overlap/EventOptions.vue"
import { privacyPolicyEnabled } from "@/utils/privacyPolicy"

import { useMainStore } from "@/stores/main"
import { useDisplayHelpers } from "@/utils/useDisplayHelpers"
import { useEventLoader } from "@/composables/event/useEventLoader"
import { useEventEditing } from "@/composables/event/useEventEditing"
import { useEventRespondent } from "@/composables/event/useEventRespondent"
import type { EventDraft } from "@/composables/event/types"
import type { ScheduleOverlapInstance } from "@/composables/event/types"
import {
  applySpecificTimesEditDraft,
  type SpecificTimesEditDraft,
} from "@/composables/event/specificTimesEditDraft"
import {
  consumeSpecificTimesEntryState,
  hasSpecificTimesEntryState,
} from "@/composables/event/specificTimesEntryState"
import { hasEventDraftData } from "@/composables/event/draftBoundary"
import { fetchEventResponses } from "@/composables/event/eventTransportBoundary"
import {
  encodeEventResponseSubmissionPayload,
  encodeVisitorResponseSubmission,
  toEventResponseSubmissionPayload,
} from "@/composables/event/responseSubmissionBoundary"
import {
  selectVisitorResponse,
  selectedVisitorResponse,
  withEventVisitorIdentity,
} from "@/composables/event/visitorIdentityStorage"
import {
  toScheduleOverlapEvent,
  states as scheduleOverlapStates,
  type Timezone,
} from "@/composables/schedule_overlap/types"
import {
  appendGuestIdentityQuery,
  getGuestNameStorageKey,
  getSelectedGuestOwnership,
  readGuestName,
  readGuestOwnershipCollectionForEvent,
  upsertGuestOwnershipRecord,
  writeGuestName,
  writeGuestOwnershipCollection,
  getGuestOwnershipCollectionStorageKey,
} from "@/composables/schedule_overlap/scheduleOverlapStorage"
import { getResponseDisplayName, normalizeGuestName } from "@/utils/guestName"
import type { Event, User } from "@/types"
import { fetchAuthUserProfile } from "@/utils/services/UserService"
import { toQueryInstantString } from "@/utils/temporalQuery"
import {
  canEditAvailabilityAsCurrentViewer,
  canEditEventMetadata,
  isSignedInOwner,
} from "@/composables/event/eventOwnership"

const ScheduleOverlap = defineAsyncComponent(
  () => import("@/components/schedule_overlap/ScheduleOverlap.vue"),
)

defineOptions({ name: "AppEvent" })

const props = defineProps({
  eventId: { type: String, required: true as const, default: "" },
  fromSignIn: { type: Boolean, default: false },
  editingMode: { type: Boolean, default: false },
  linkApple: { type: Boolean, default: false },
  initialTimezone: {
    type: Object as PropType<Timezone | undefined>,
    default: undefined,
  },
  contactsPayload: {
    type: Object as PropType<EventDraft>,
    default: () => ({}),
  },
})

const router = useRouter()
const route = useRoute()

const mainStore = useMainStore()
const { authUser } = storeToRefs(mainStore)
const { isPhone } = useDisplayHelpers()

const scheduleOverlap = ref<ScheduleOverlapInstance | null>(null)
const scheduleOverlapRenderKey = ref(0)
const specificTimesEntryDraft = ref<SpecificTimesEditDraft | undefined>()
const fromCreateSpecificTimesDraft = ref(false)
const desktopGuestEditMenuRoot = ref<HTMLElement | null>(null)
const mobileGuestEditMenuRoot = ref<HTMLElement | null>(null)
const weekOffset = ref(0)

const invitationDialog = ref(false)
const helpDialog = ref(false)
const showGuestEditMenu = ref(false)
const deleteAvailabilityDialog = ref(false)
const scheduleOverlapLoaded = ref(false)
const scheduleOverlapReady = ref(false)
const secondaryBootQueued = ref(false)
const eventLoadStatus = ref<"loading" | "ready" | "notFound">("loading")

const isEditing = computed(() => scheduleOverlap.value?.editing ?? false)
const isScheduling = computed(() => scheduleOverlap.value?.scheduling ?? false)
const allowScheduleEvent = computed(
  () => scheduleOverlap.value?.allowScheduleEvent ?? false,
)
const respondentSaveAllowed = computed(
  () => scheduleOverlap.value?.respondentSaveAllowed ?? true,
)
const respondentSaveDisabled = computed(
  () => !isSignUp.value && !respondentSaveAllowed.value,
)
const showDeleteAvailabilityAction = computed(
  () =>
    (!addingAvailabilityAsGuest.value && userHasResponded.value) ||
    Boolean(curGuestId.value),
)

const areUnsavedChanges = computed(
  () => scheduleOverlap.value?.unsavedChanges ?? false,
)
const ownedGuestResponses = computed(
  () => scheduleOverlap.value?.ownedGuestResponses ?? [],
)
const numResponses = computed(
  () => scheduleOverlap.value?.respondents.length ?? 0,
)
const isSettingSpecificTimes = computed(() => {
  const so = scheduleOverlap.value
  return so ? so.state === scheduleOverlapStates.SET_SPECIFIC_TIMES : false
})

const isGroup = computed(() => loader.event.value?.type === eventTypes.GROUP)
const isSignUp = computed(() => Boolean(loader.event.value?.isSignUpForm))
const isSpecificDates = computed(() => {
  const t = loader.event.value?.type
  return t === eventTypes.SPECIFIC_DATES || !t
})
const _isSpecificDates = isSpecificDates
const isWeekly = computed(() => loader.event.value?.type === eventTypes.DOW)
const _isWeekly = isWeekly
const eventType = computed(() => {
  if (isGroup.value) return "group"
  else if (isSignUp.value) return "signup"
  return "event"
})
const isReadOnlyEvent = computed(() =>
  Boolean(loader.event.value?.eventVisitorId && loader.event.value.isArchived),
)
const canEditAvailability = computed(() =>
  canEditAvailabilityAsCurrentViewer(loader.event.value, authUser.value),
)
const isOwner = computed(() =>
  isSignedInOwner(loader.event.value, authUser.value),
)
const canEditMetadata = computed(() =>
  canEditEventMetadata(loader.event.value, authUser.value),
)
const userHasResponded = computed(() => {
  const ev = loader.event.value
  return Boolean(
    authUser.value?._id && ev?.responses && authUser.value._id in ev.responses,
  )
})
const guestAddedAvailability = computed(() =>
  ownedGuestResponses.value.some((ownedGuest) =>
    Object.values(loader.event.value?.responses ?? {}).some((response) =>
      response.guestOwnershipMode === "token"
        ? response.guestId === ownedGuest.lookupKey
        : response.user?._id === ownedGuest.lookupKey,
    ),
  ),
)
const actionButtonText = computed(() => {
  if (isSignUp.value) return "Edit slots"
  else if (userHasResponded.value || isGroup.value) return "Edit availability"
  return "Add availability"
})
function getOwnedGuestLookupKeyForResponse(
  responseId: string,
  response: {
    guestOwnershipMode?: "legacy" | "token"
    guestId?: string
    user?: { _id?: string }
    name?: string
  },
) {
  if (response.guestOwnershipMode === "token") {
    return response.guestId
  }

  return response.user?._id ?? responseId
}

const ownedGuestEditOptions = computed(() =>
  ownedGuestResponses.value
    .map((ownedGuest) => {
      const matchingResponse = Object.entries(
        loader.event.value?.responses ?? {},
      ).find(
        ([responseId, response]) =>
          getOwnedGuestLookupKeyForResponse(responseId, response) ===
          ownedGuest.lookupKey,
      )
      return {
        lookupKey: ownedGuest.lookupKey,
        name: matchingResponse?.[1]
          ? getResponseDisplayName(matchingResponse[1])
          : (ownedGuest.name ?? ownedGuest.lookupKey),
        responseId: matchingResponse?.[0] ?? "",
      }
    })
    .filter((option) => option.responseId.length > 0),
)
const showGuestActionButton = computed(
  () =>
    !isGroup.value &&
    !userHasResponded.value &&
    ownedGuestEditOptions.value.length > 0,
)
const hasEditableAvailability = computed(
  () => userHasResponded.value || showGuestActionButton.value,
)
const showDisabledEditAvailabilityPrimary = computed(
  () =>
    !isGroup.value &&
    !isSignUp.value &&
    numResponses.value > 0 &&
    !hasEditableAvailability.value,
)
const hasMultipleOwnedGuestResponses = computed(
  () => ownedGuestEditOptions.value.length > 1,
)
const guestActionButtonText = computed(() => "Edit availability")
const secondaryAddAvailabilityButtonText = computed(() => {
  if (showDisabledEditAvailabilityPrimary.value) return "Add availability"
  if (!authUser.value) return "Add availability"
  return isPhone.value ? "Add guest" : "Add guest availability"
})
const showSecondaryAddAvailabilityAction = computed(() => {
  if (isGroup.value || isSignUp.value || isEditing.value) return false
  if (showDisabledEditAvailabilityPrimary.value) return true
  if (!(authUser.value || guestAddedAvailability.value)) return false
  const event = loader.event.value
  if (!event) return false
  return (
    !event.blindAvailabilityEnabled ||
    (event.eventVisitorId ? event.canManageEvent === true : isOwner.value)
  )
})
const showScheduleEventButton = computed(
  () => !isEditing.value && !isSignUp.value && !isReadOnlyEvent.value,
)
const desktopScheduleEventButtonClass = computed(() =>
  numResponses.value > 0 ? "tw:w-full" : "desktop-event-header-single-column",
)
const hasSavedTimefulSchedule = computed(() =>
  Boolean(loader.event.value?.scheduledEvent),
)
const primaryAvailabilityButtonText = computed(() => {
  if (showDisabledEditAvailabilityPrimary.value) return "Edit availability"
  if (showGuestActionButton.value) return guestActionButtonText.value
  return actionButtonText.value
})
const primaryAvailabilityButtonDisabled = computed(
  () =>
    showDisabledEditAvailabilityPrimary.value ||
    (loading.value && !showGuestActionButton.value && !userHasResponded.value),
)
const desktopPrimaryAvailabilityButtonClass = computed(() => ({
  "desktop-primary-availability-button": true,
  "desktop-primary-availability-button--add":
    primaryAvailabilityButtonText.value === "Add availability",
  "desktop-primary-availability-button--edit":
    primaryAvailabilityButtonText.value === "Edit availability",
}))
const guestRespondentNames = computed(() =>
  Object.values(loader.event.value?.responses ?? {}).flatMap((response) => {
    if (
      response.guestOwnershipMode !== "legacy" &&
      response.guestOwnershipMode !== "token"
    ) {
      return []
    }
    const displayName = getResponseDisplayName(response)
    return displayName.length > 0 ? [displayName] : []
  }),
)
const mobilePrimaryAvailabilityButtonText = computed(() => {
  if (showDisabledEditAvailabilityPrimary.value) return "Edit availability"
  if (showGuestActionButton.value) return guestActionButtonText.value
  return actionButtonText.value
})
const mobilePrimaryAvailabilityButtonClass = computed(() => ({
  "mobile-primary-availability-button--edit":
    mobilePrimaryAvailabilityButtonText.value === "Edit availability",
  "tw:bg-green tw:text-white":
    mobilePrimaryAvailabilityButtonText.value === "Edit availability",
  "timeful-elevated-button tw:bg-white tw:text-green":
    mobilePrimaryAvailabilityButtonText.value !== "Edit availability",
}))
const isIOS = computed(() => isIOSFn())
const desktopShowBestTimes = computed(
  () => scheduleOverlap.value?.showBestTimes ?? false,
)
const desktopHideIfNeeded = computed(
  () => scheduleOverlap.value?.hideIfNeeded ?? false,
)
const desktopCollapseDisabledTimes = computed(
  () => scheduleOverlap.value?.collapseDisabledTimes ?? true,
)
const desktopShowCalendarEvents = computed(
  () => scheduleOverlap.value?.showCalendarEvents ?? false,
)
const desktopStartCalendarOnMonday = computed(
  () => scheduleOverlap.value?.startCalendarOnMonday ?? false,
)
const showBestTimesToggle = computed(
  () => !isSignUp.value && numResponses.value >= 1,
)
const desktopHasSecondaryOptions = computed(
  () =>
    !isSignUp.value &&
    (numResponses.value >= 1 ||
      isGroup.value ||
      scheduleOverlapEvent.value.daysOnly),
)
const desktopShowInlineOptions = computed(
  () =>
    scheduleOverlapReady.value &&
    !isSignUp.value &&
    numResponses.value < 1 &&
    !scheduleOverlapEvent.value.daysOnly,
)
const desktopShowInlineStartOnMonday = computed(
  () => scheduleOverlapEvent.value.daysOnly && numResponses.value < 1,
)

function closeGuestEditMenu() {
  showGuestEditMenu.value = false
}

function updateDesktopShowBestTimes(value: boolean | null) {
  scheduleOverlap.value?.updateShowBestTimes(!!value)
}

function updateDesktopHideIfNeeded(value: boolean) {
  scheduleOverlap.value?.updateHideIfNeeded(value)
}

function updateDesktopCollapseDisabledTimes(value: boolean | null) {
  scheduleOverlap.value?.updateCollapseDisabledTimes(!!value)
}

function updateDesktopShowCalendarEvents(value: boolean) {
  scheduleOverlap.value?.updateShowCalendarEvents(value)
}

function updateDesktopStartCalendarOnMonday(value: boolean) {
  scheduleOverlap.value?.updateStartCalendarOnMonday(value)
}

function isGuestEditMenuTargetInside(target: EventTarget | null) {
  if (!(target instanceof Node)) return false

  return (
    desktopGuestEditMenuRoot.value?.contains(target) === true ||
    mobileGuestEditMenuRoot.value?.contains(target) === true
  )
}

function handleGuestEditMenuDocumentClick(event: MouseEvent) {
  if (!showGuestEditMenu.value) return
  if (isGuestEditMenuTargetInside(event.target)) return
  closeGuestEditMenu()
}

const loader = useEventLoader({
  eventId: toRef(props, "eventId"),
  weekOffset,
  authUser: authUser as ReturnType<typeof computed<User | null>>,
  scheduleOverlapRef: scheduleOverlap,
  isEditing,
  userHasResponded,
  areUnsavedChanges,
})

const respondent = useEventRespondent({
  event: loader.event,
  authUser: authUser as ReturnType<typeof computed<User | null>>,
  scheduleOverlapRef: scheduleOverlap,
  refreshEvent: loader.refreshEvent,
})

const editing = useEventEditing({
  event: loader.event,
  eventId: toRef(props, "eventId"),
  authUser: authUser as ReturnType<typeof computed<User | null>>,
  scheduleOverlapRef: scheduleOverlap,
  isSignUp,
  isGroup,
  userHasResponded,
  curGuestId: respondent.curGuestId,
  addingAvailabilityAsGuest: respondent.addingAvailabilityAsGuest,
  calendarPermissionGranted: loader.calendarPermissionGranted,
  refreshEvent: loader.refreshEvent,
})

const {
  editEventDialog,
  choiceDialog,
  webviewDialog,
  guestDialog,
  pagesNotVisitedDialog,
  availabilityBtnOpacity,
  availabilityBtnAttentionActive,
  addAvailability,
  addAvailabilityAsGuest,
  cancelEditing,
  copyLink,
  deleteAvailability,
  editEvent,
  saveChanges,
  setAvailabilityAutomatically,
  setAvailabilityManually,
  signInLinkApple,
  addedAppleCalendar,
  addedICSCalendar,
  highlightAvailabilityBtn,
  handleGuestDialogSubmit,
} = editing

const {
  curGuestId,
  addingAvailabilityAsGuest,
  currSignUpBlock,
  signUpForSlotDialog,
  initiateSignUpFlow,
  signUpForBlock,
} = respondent

const {
  event,
  loading,
  calendarEventsMap,
  calendarAvailabilities,
  calendarPermissionGranted,
  fromEditEvent,
  refreshEvent,
  refreshCalendar,
} = loader

const pendingEventTimezone = ref<string | undefined>()
const scheduleOverlapEvent = computed(() => {
  const scheduleEvent = toScheduleOverlapEvent(event.value as Event)

  return pendingEventTimezone.value
    ? { ...scheduleEvent, eventTimezone: pendingEventTimezone.value }
    : scheduleEvent
})

function editSelectedGuestAvailability() {
  if (ownedGuestEditOptions.value.length === 1) {
    scheduleOverlap.value?.editOwnedGuestAvailability(
      ownedGuestEditOptions.value[0].lookupKey,
    )
    closeGuestEditMenu()
    return
  }
  showGuestEditMenu.value = !showGuestEditMenu.value
}

function editOwnedGuestAvailability(lookupKey: string) {
  scheduleOverlap.value?.editOwnedGuestAvailability(lookupKey)
  closeGuestEditMenu()
}

function handlePrimaryAvailabilityAction() {
  if (showDisabledEditAvailabilityPrimary.value) return
  if (showGuestActionButton.value) {
    editSelectedGuestAvailability()
    return
  }
  addAvailability()
}

function triggerSecondaryAddAvailability() {
  closeGuestEditMenu()
  if (showDisabledEditAvailabilityPrimary.value) {
    addAvailability()
    return
  }
  if (authUser.value) {
    addAvailabilityAsGuest()
    return
  }
  addAvailability()
}

function handleDeleteAvailabilityConfirm() {
  void deleteAvailability()
  deleteAvailabilityDialog.value = false
}

watch(
  [showGuestActionButton, hasMultipleOwnedGuestResponses, isEditing],
  ([
    showGuestActionButtonValue,
    hasMultipleOwnedGuestResponsesValue,
    isEditingValue,
  ]) => {
    if (
      !showGuestActionButtonValue ||
      !hasMultipleOwnedGuestResponsesValue ||
      isEditingValue
    ) {
      closeGuestEditMenu()
    }
  },
)

onMounted(() => {
  document.addEventListener("click", handleGuestEditMenuDocumentClick, true)
})

onBeforeUnmount(() => {
  document.removeEventListener("click", handleGuestEditMenuDocumentClick, true)
})

function resetWeekOffset() {
  weekOffset.value = 0
}

function getErrorCode(err: unknown) {
  if (!err || typeof err !== "object") return undefined
  const directError = (err as { error?: unknown }).error
  if (typeof directError === "string") return directError

  const parsed = (err as { parsed?: unknown }).parsed
  if (!parsed || typeof parsed !== "object") return undefined
  const parsedError = (parsed as { error?: unknown }).error
  return typeof parsedError === "string" ? parsedError : undefined
}

function isEventNotFoundError(err: unknown) {
  return getErrorCode(err) === errors.EventNotFound
}

async function handleEditDialogRefresh(payload?: {
  fromEditEvent?: boolean
  specificTimesEditDraft?: SpecificTimesEditDraft
  eventTimezone?: string
}) {
  fromCreateSpecificTimesDraft.value = false
  specificTimesEntryDraft.value = undefined
  pendingEventTimezone.value = payload?.eventTimezone
  loader.fromEditEvent.value = payload?.fromEditEvent === true
  await loader.refreshEvent()
  if (loader.event.value && payload?.eventTimezone) {
    loader.event.value = {
      ...loader.event.value,
      eventTimezone: payload.eventTimezone,
    }
  }
  if (loader.event.value && payload?.specificTimesEditDraft) {
    loader.event.value = applySpecificTimesEditDraft({
      event: loader.event.value,
      draft: payload.specificTimesEditDraft,
    })
  }
  scheduleOverlapRenderKey.value += 1
  await nextTick()
  loader.fromEditEvent.value = false
}

function queueSecondaryBootWork() {
  if (secondaryBootQueued.value) return
  secondaryBootQueued.value = true
  logEventBoot("EventView", "queueSecondaryBootWork:scheduled")

  const run = () => {
    logEventBoot("EventView", "queueSecondaryBootWork:run")
    loader.loading.value = true
    const promises = [
      Promise.resolve(loader.fetchCalendarAvailabilities()),
      Promise.resolve(loader.fetchAuthUserCalendarEvents()),
    ]
    Promise.allSettled(promises)
      .then(() => {
        loader.loading.value = false
      })
      .catch(() => undefined)

    void fetchAuthUserProfile()
      .then((user) => {
        mainStore.setAuthUser(user)
      })
      .catch(() => {
        mainStore.setAuthUser(null)
      })
  }

  if (typeof window !== "undefined" && "requestIdleCallback" in window) {
    window.requestIdleCallback(
      () => {
        void nextTick().then(run)
      },
      { timeout: 1500 },
    )
    return
  }

  globalThis.setTimeout(() => {
    void nextTick().then(run)
  }, 150)
}

function queueScheduleOverlapMount() {
  if (scheduleOverlapReady.value) return

  const run = () => {
    logEventBoot("EventView", "queueScheduleOverlapMount:run")
    scheduleOverlapReady.value = true
  }

  logEventBoot("EventView", "queueScheduleOverlapMount:scheduled")

  if (typeof window !== "undefined" && "requestAnimationFrame" in window) {
    window.requestAnimationFrame(() => {
      globalThis.setTimeout(run, 0)
    })
    return
  }

  globalThis.setTimeout(run, 0)
}

const scheduleEvent = () => {
  scheduleOverlap.value?.scheduleEvent()
}
const cancelScheduleEvent = () => {
  scheduleOverlap.value?.cancelScheduleEvent()
}
const confirmScheduleEvent = (
  destination: "timeful" | "google" | "outlook",
) => {
  scheduleOverlap.value?.confirmScheduleEvent(destination)
}
const clearScheduledEvent = () => {
  scheduleOverlap.value?.clearScheduledEvent?.()
}

function onBeforeUnload(e: BeforeUnloadEvent) {
  if (areUnsavedChanges.value) {
    e.preventDefault()
    // eslint-disable-next-line @typescript-eslint/no-deprecated
    e.returnValue = ""
    return
  }
  Reflect.deleteProperty(e, "returnValue")
}

interface PluginMessageData {
  type?: string
  requestId?: string
  payload?: {
    type?: string
    guestName?: string
    guestEmail?: string
    slots?: SlotEntry[]
    timezone?: string
  }
  command?: string
  ok?: boolean
  error?: { message?: string } | string
}

interface SlotEntry {
  start: string
  end: string
  status?: string
}

interface PluginDebugSlotEntry {
  name?: string
  email?: string
  availability?: unknown
  ifNeeded?: unknown
}

interface PluginDebugPayload {
  timezone?: string
  slots?: Record<string, PluginDebugSlotEntry>
  timeIncrement?: number
}

function getTimeIncrementMinutes(event: Pick<Event, "timeIncrement">): number {
  return event.timeIncrement?.total("minutes") ?? 15
}

function handleMessage(e: MessageEvent<PluginMessageData>) {
  if (!isValidPluginMessage(e)) return
  const payload = e.data.payload
  if (payload?.type === "get-slots") {
    void getSlots(e)
  }
  if (payload?.type === "set-slots") {
    void setSlots(e)
  }
}

// TEMPORARY: Intercept plugin responses for debugging
function _interceptPluginResponses(e: MessageEvent<PluginMessageData>) {
  if (e.data.type === "FILL_CALENDAR_EVENT_RESPONSE") {
    const { command, requestId, ok, error: errData, payload } = e.data
    if (ok) {
      if (command === "get-slots" && payload?.slots) {
        const debugPayload = payload as PluginDebugPayload
        const slots = debugPayload.slots ?? {}
        const timeIncrement = debugPayload.timeIncrement ?? 0
        const timezoneValue = debugPayload.timezone ?? "—"
        console.log(
          `[PLUGIN RESPONSE - SUCCESS] ${command} | timeIncrement: ${String(
            timeIncrement,
          )} | timezone: ${timezoneValue}`,
        )
        Object.entries(slots).forEach(([userId, u]) => {
          const label = [u.name, u.email].filter(Boolean).join(" ") || userId
          console.log(`  ${label}:`, {
            availability: u.availability,
            ifNeeded: u.ifNeeded,
          })
        })
      } else {
        console.log(`[PLUGIN RESPONSE - SUCCESS] ${command ?? ""}`, {
          requestId,
          payload,
          timestamp: Temporal.Now.instant().toString(),
        })
      }
    } else {
      const errMsg =
        typeof errData === "object"
          ? (errData.message ?? JSON.stringify(errData))
          : (errData ?? "")
      console.error(`[PLUGIN RESPONSE - ERROR] ${command ?? ""}`, {
        requestId,
        error: errMsg,
        timestamp: Temporal.Now.instant().toString(),
      })
    }
  }
}

async function setSlots(e: MessageEvent<PluginMessageData>) {
  const requestId = e.data.requestId ?? ""
  const command = "set-slots"
  if (!requestId) {
    console.error("Missing requestId in plugin message")
    return
  }
  if (isGroup.value) {
    sendPluginError(requestId, command, "Group events are not supported yet")
    return
  }
  if (!event.value) {
    sendPluginError(requestId, command, "Event not loaded yet")
    return
  }
  const ev = event.value
  const timeIncrement = getTimeIncrementMinutes(ev)
  const payloadGuestName = normalizeGuestName(e.data.payload?.guestName)
  const hasGuestName = payloadGuestName != null
  if (ev.blindAvailabilityEnabled) {
    const isOwner = isSignedInOwner(ev, authUser.value)
    if (!isOwner && hasGuestName) {
      sendPluginError(
        requestId,
        command,
        "Non-owners cannot set guest availability when 'Hide responses from respondents' is enabled.",
      )
      return
    }
  }
  const forceGuestMode = hasGuestName
  const isGuest = forceGuestMode || !authUser.value
  let guestName = ""
  let guestEmail = ""
  let visitorResponseId: string | undefined
  if (ev.eventVisitorId) {
    // PostgreSQL events own responses through Event Visitor Identities, so the
    // plugin acts on the browser visitor's selected or named response instead
    // of MongoDB guest credentials.
    const responses = ev.responses ?? {}
    const namedResponseId = hasGuestName
      ? Object.keys(responses).find(
          (key) => responses[key]?.name === payloadGuestName,
        )
      : undefined
    visitorResponseId = namedResponseId ?? selectedVisitorResponse(ev._id ?? "")
    if (hasGuestName) {
      guestName = payloadGuestName
    } else {
      guestName =
        responses[visitorResponseId ?? ""]?.name ??
        [authUser.value?.firstName, authUser.value?.lastName]
          .filter(Boolean)
          .join(" ")
      if (!visitorResponseId && guestName.length === 0) {
        sendPluginError(
          requestId,
          command,
          "Guest name is required. Please provide 'guestName' in the payload or add your availability through the UI first.",
        )
        return
      }
    }
    guestEmail =
      e.data.payload?.guestEmail ??
      responses[visitorResponseId ?? ""]?.email ??
      ""
    if (!visitorResponseId && ev.collectEmails) {
      if (guestEmail.length === 0) {
        sendPluginError(
          requestId,
          command,
          "Guest email is required because this event collects emails. Please provide 'guestEmail' in the payload.",
        )
        return
      }
      if (!validateEmail(guestEmail)) {
        sendPluginError(
          requestId,
          command,
          `Invalid email format: ${guestEmail}`,
        )
        return
      }
    }
  } else if (isGuest) {
    const guestNameKey = getGuestNameStorageKey(ev._id ?? "")
    const guestOwnershipCollection = readGuestOwnershipCollectionForEvent(
      ev._id ?? "",
    )
    const selectedGuestOwnership = getSelectedGuestOwnership(
      guestOwnershipCollection,
    )
    const namedGuestOwnership =
      guestOwnershipCollection?.records.find(
        (record) => record.name === payloadGuestName,
      ) ?? selectedGuestOwnership
    if (forceGuestMode) {
      guestName = payloadGuestName
      writeGuestName(guestNameKey, guestName)
      if (ev.collectEmails) {
        guestEmail = e.data.payload?.guestEmail ?? ""
        if (!guestEmail || guestEmail.length === 0) {
          sendPluginError(
            requestId,
            command,
            "Guest email is required because this event collects emails. Please provide 'guestEmail' in the payload.",
          )
          return
        }
        if (!validateEmail(guestEmail)) {
          sendPluginError(
            requestId,
            command,
            `Invalid email format: ${guestEmail}`,
          )
          return
        }
      } else {
        const responseLookupKey =
          namedGuestOwnership?.guestId ?? namedGuestOwnership?.name ?? guestName
        guestEmail =
          e.data.payload?.guestEmail ??
          ev.responses?.[responseLookupKey]?.email ??
          ""
      }
    } else {
      const storedGuestName = readGuestName(guestNameKey)
      if (!storedGuestName || storedGuestName.length === 0) {
        sendPluginError(
          requestId,
          command,
          "Guest name is required. Please provide 'guestName' in the payload or add your availability through the UI first.",
        )
        return
      }
      guestName = storedGuestName
      const responseLookupKey =
        selectedGuestOwnership?.guestId ??
        selectedGuestOwnership?.name ??
        guestName
      guestEmail =
        e.data.payload?.guestEmail ??
        ev.responses?.[responseLookupKey]?.email ??
        ""
    }
  }
  let slots: SlotEntry[] = e.data.payload?.slots ?? []
  if (!Array.isArray(slots)) {
    sendPluginError(requestId, command, "Slots must be an array")
    return
  }
  const hasTimezone = Boolean(e.data.payload?.timezone)
  if (ev.type === eventTypes.DOW && slots.length > 0) {
    const validationResult = validateDOWPayload(slots, hasTimezone)
    if (validationResult) {
      sendPluginError(requestId, command, validationResult.error)
      return
    }
  }
  const timezoneValue = e.data.payload?.timezone
  if (timezoneValue) {
    if (!(timezoneValue in allTimezones)) {
      sendPluginError(
        requestId,
        command,
        `Invalid timezone: "${timezoneValue}". Please provide a valid IANA timezone name from the supported timezones list.`,
      )
      return
    }
  }
  const effectiveTimezoneValue = timezoneValue ?? resolvePluginTimezoneValue()
  const timeSlotToRowCol =
    typeof scheduleOverlap.value?.getAllValidTimeRanges === "function"
      ? scheduleOverlap.value.getAllValidTimeRanges()
      : new Map()
  for (let i = 0; i < slots.length; i++) {
    const slot = slots[i]
    if (!slot.start || !slot.end) {
      sendPluginError(
        requestId,
        command,
        `Slot at index ${String(i)} is missing required 'start' or 'end' field`,
      )
      return
    }
    if (!slot.status) {
      sendPluginError(
        requestId,
        command,
        `Slot at index ${String(i)} is missing required 'status' field`,
      )
      return
    }
    if (slot.status !== "available" && slot.status !== "if-needed") {
      sendPluginError(
        requestId,
        command,
        `Invalid status '${slot.status}' at index ${String(
          i,
        )}. Must be 'available' or 'if-needed'`,
      )
      return
    }
  }
  const normalizedSlotsResult = normalizePluginSetSlots(
    slots,
    effectiveTimezoneValue,
    ev.type,
  )
  if (!normalizedSlotsResult.ok) {
    sendPluginError(requestId, command, normalizedSlotsResult.error)
    return
  }
  const normalizedSlots = normalizedSlotsResult.slots
  const allAvailabilityTimestamps: number[] = []
  const allIfNeededTimestamps: number[] = []
  const timestampStatusMap = new Map<number, string>()
  let isBrokenBounds = false
  normalizedSlots.forEach((slot, i: number) => {
    const userStartZdt = slot.parsedStart
    const userEndZdt = slot.parsedEnd

    const userStartMs = userStartZdt.epochMilliseconds
    const userEndMs = userEndZdt.epochMilliseconds

    const intWidth = userEndMs - userStartMs
    let coveredWidth = 0
    timeSlotToRowCol.forEach(
      (
        value: {
          startTime: Temporal.ZonedDateTime
          endTime: Temporal.ZonedDateTime
        },
        _key: number,
      ) => {
        const slotStartMs = value.startTime.epochMilliseconds
        const slotEndMs = value.endTime.epochMilliseconds
        if (userStartMs <= slotEndMs && userEndMs >= slotStartMs) {
          const intersectionStartMs = Math.max(userStartMs, slotStartMs)
          const intersectionEndMs = Math.min(userEndMs, slotEndMs)
          coveredWidth += intersectionEndMs - intersectionStartMs
          const incrementMs = timeIncrement * 60 * 1000
          let currentTimeMs = intersectionStartMs
          while (currentTimeMs < intersectionEndMs) {
            const timestampKey = currentTimeMs
            if (timestampStatusMap.has(timestampKey)) {
              const existingStatus = timestampStatusMap.get(timestampKey)
              if (existingStatus !== slot.status) {
                sendPluginError(
                  requestId,
                  command,
                  `Time slot at index ${String(
                    i,
                  )} overlaps with another time slot with different status`,
                )
                return
              }
            } else {
              timestampStatusMap.set(timestampKey, slot.status ?? "")
            }
            if (slot.status === "available") {
              allAvailabilityTimestamps.push(currentTimeMs)
            } else {
              allIfNeededTimestamps.push(currentTimeMs)
            }
            currentTimeMs += incrementMs
            if (currentTimeMs > intersectionEndMs) break
          }
        }
      },
    )
    if (coveredWidth < intWidth) {
      sendPluginError(
        requestId,
        command,
        `Time slot at index ${String(i)} (${slot.start} to ${
          slot.end
        }) falls outside the event's date/time range.`,
      )
      isBrokenBounds = true
    }
  })
  // eslint-disable-next-line @typescript-eslint/no-unnecessary-condition
  if (isBrokenBounds) return
  try {
    const sanitizedId = props.eventId.replaceAll(".", "")
    const availability = allAvailabilityTimestamps.map((ms) =>
      Temporal.Instant.fromEpochMilliseconds(ms).toZonedDateTimeISO("UTC"),
    )
    const ifNeeded = allIfNeededTimestamps.map((ms) =>
      Temporal.Instant.fromEpochMilliseconds(ms).toZonedDateTimeISO("UTC"),
    )
    if (ev.eventVisitorId) {
      const result = await post<{ responseId: string }>(
        withEventVisitorIdentity(`/events/${sanitizedId}/response`),
        encodeVisitorResponseSubmission({
          availability,
          ifNeeded,
          responseId: visitorResponseId,
          name: guestName,
          email: guestEmail,
        }),
      )
      selectVisitorResponse(ev._id ?? "", result.responseId)
      await loader.refreshEvent()
      sendPluginSuccess(requestId, command)
      return
    }
    const storedGuestOwnership = event.value._id
      ? getSelectedGuestOwnership(
          readGuestOwnershipCollectionForEvent(event.value._id),
        )
      : undefined
    const payload = encodeEventResponseSubmissionPayload(
      toEventResponseSubmissionPayload({
        availability,
        ifNeeded,
        authUserId: isGuest ? undefined : authUser.value?._id,
        addingAvailabilityAsGuest: isGuest,
        guestPayload: {
          name: guestName,
          email: guestEmail,
          guestId:
            hasGuestName && storedGuestOwnership?.name !== guestName
              ? undefined
              : storedGuestOwnership?.guestId,
          guestEditToken:
            hasGuestName && storedGuestOwnership?.name !== guestName
              ? undefined
              : storedGuestOwnership?.guestEditToken,
          guestEditPolicy: storedGuestOwnership?.guestEditPolicy ?? "protected",
        },
      }),
    )
    const response = await post<{
      guestCredentials?: {
        name?: string
        guestId: string
        guestEditToken: string
        guestEditPolicy: "protected" | "open"
        guestOwnershipMode: "token"
      }
    }>(
      appendGuestIdentityQuery(
        `/events/${sanitizedId}/response`,
        storedGuestOwnership,
        guestName,
      ),
      payload,
    )
    if (isGuest && ev._id && response.guestCredentials) {
      const nextCollection = upsertGuestOwnershipRecord(
        readGuestOwnershipCollectionForEvent(ev._id),
        {
          name: guestName,
          guestId: response.guestCredentials.guestId,
          guestEditToken: response.guestCredentials.guestEditToken,
          guestEditPolicy: response.guestCredentials.guestEditPolicy,
          guestOwnershipMode: response.guestCredentials.guestOwnershipMode,
        },
      )
      writeGuestOwnershipCollection(
        getGuestOwnershipCollectionStorageKey(ev._id),
        nextCollection,
      )
    }
    await loader.refreshEvent()
    sendPluginSuccess(requestId, command)
  } catch (err: unknown) {
    const msg = err instanceof Error ? err.message : "Unknown error"
    sendPluginError(requestId, command, `Failed to set slots: ${msg}`)
  }
}

async function getSlots(e: MessageEvent<PluginMessageData>) {
  const requestId = e.data.requestId
  const command = "get-slots"
  if (!requestId) {
    console.error("Missing requestId in plugin message")
    return
  }
  if (!event.value) {
    sendPluginError(requestId, command, "Event not loaded yet")
    return
  }
  const ev = event.value

  let timezoneValue: string
  if (e.data.payload?.timezone) {
    const providedTimezone = e.data.payload.timezone
    if (!(providedTimezone in allTimezones)) {
      sendPluginError(
        requestId,
        command,
        `Invalid timezone: "${providedTimezone}". Please provide a valid IANA timezone name from the supported timezones list.`,
      )
      return
    }
    timezoneValue = providedTimezone
  } else {
    timezoneValue = resolvePluginTimezoneValue()
  }
  const sanitizedId = props.eventId.replaceAll(".", "")
  const eventTimeRange = getPluginEventTimeRange(ev, weekOffset.value)
  if (!eventTimeRange) {
    sendPluginError(
      requestId,
      command,
      "Could not calculate timeMin and timeMax",
    )
    return
  }
  const { timeMin, timeMax } = eventTimeRange
  try {
    const guestOwnership = ev._id
      ? getSelectedGuestOwnership(readGuestOwnershipCollectionForEvent(ev._id))
      : undefined
    const url = appendGuestIdentityQuery(
      `/events/${sanitizedId}/responses?timeMin=${toQueryInstantString(
        timeMin,
      )}&timeMax=${toQueryInstantString(timeMax)}`,
      guestOwnership,
    )
    const responses = await fetchEventResponses(url)
    const pluginResponses: Record<string, PluginResponseInput> =
      Object.fromEntries(
        Object.entries(responses).map(([userId, response]) => [
          userId,
          {
            response,
            responseMetadata: event.value?.responses?.[userId],
          },
        ]),
      )
    const allSlots = normalizePluginResponses({
      responses: pluginResponses,
      timezoneValue,
      eventType: ev.type,
    })
    const timeIncrement = getTimeIncrementMinutes(ev)
    sendPluginSuccess(requestId, command, {
      slots: allSlots,
      timeIncrement,
      timezone: timezoneValue,
    })
  } catch (err: unknown) {
    const msg = err instanceof Error ? err.message : "Unknown error"
    sendPluginError(requestId, command, `Failed to fetch responses: ${msg}`)
  }
}

async function bootstrapEvent() {
  logEventBoot("EventView", "bootstrap:start", {
    eventId: props.eventId,
    routeName: String(route.name ?? ""),
  })

  try {
    await loader.refreshEvent()
    const specificTimesEntryState = consumeSpecificTimesEntryState()
    fromCreateSpecificTimesDraft.value =
      specificTimesEntryState?.mode === "create"
    specificTimesEntryDraft.value = specificTimesEntryState?.draft
    if (loader.event.value && specificTimesEntryState?.draft) {
      loader.event.value = applySpecificTimesEditDraft({
        event: loader.event.value,
        draft: specificTimesEntryState.draft,
      })
    }
    logEventBoot("EventView", "bootstrap:event-ready", {
      eventId: loader.event.value?._id ?? null,
      type: loader.event.value?.type ?? null,
    })

    const ev = loader.event.value
    if (ev) {
      if (ev.type === eventTypes.GROUP) {
        if (route.name === "event") {
          logEventBoot("EventView", "bootstrap:redirect-group-route")
          void router.replace({
            name: "group",
            params: { groupId: props.eventId },
          })
          return
        }
      } else {
        if (route.name === "group") {
          logEventBoot("EventView", "bootstrap:redirect-event-route")
          void router.replace({
            name: "event",
            params: { eventId: props.eventId },
          })
          return
        }
      }
    }
    eventLoadStatus.value = "ready"
    queueScheduleOverlapMount()
  } catch (err: unknown) {
    logEventBoot("EventView", "bootstrap:error", {
      error: err instanceof Error ? err.message : String(err),
    })
    if (isEventNotFoundError(err)) {
      eventLoadStatus.value = "notFound"
      return
    }
  }

  logEventBoot("EventView", "bootstrap:done")
}

onBeforeUnmount(() => {
  window.removeEventListener("beforeunload", onBeforeUnload)
  window.removeEventListener("message", handleMessage)
  // for dev:
  // window.removeEventListener("message", _interceptPluginResponses)
})

onMounted(() => {
  logEventBoot("EventView", "onMounted")
  window.addEventListener("beforeunload", onBeforeUnload)
  window.addEventListener("message", handleMessage)
  // for dev:
  // window.addEventListener("message", _interceptPluginResponses)
  editEventDialog.value = hasEventDraftData(props.contactsPayload)
  if (props.linkApple) choiceDialog.value = true
  if (!hasSpecificTimesEntryState()) {
    queueScheduleOverlapMount()
  }
  queueSecondaryBootWork()
  void bootstrapEvent()
})

watch(loader.event, (ev) => {
  if (ev) {
    weekOffset.value = 0
    document.title = `${ev.name ?? ""} - Timeful`
    logEventBoot("EventView", "watch:event", {
      eventId: ev._id ?? null,
      type: ev.type ?? null,
      responses: Object.keys(ev.responses ?? {}).length,
    })
  }
})

watch(scheduleOverlap, (so) => {
  if (so && !scheduleOverlapLoaded.value) {
    scheduleOverlapLoaded.value = true
    logEventBoot("EventView", "watch:scheduleOverlap-mounted", {
      state: so.state,
      respondents: so.respondents.length,
    })
    if ((props.fromSignIn || props.editingMode) && !isGroup.value) {
      so.startEditing()
      logEventBoot("EventView", "watch:scheduleOverlap-startEditing")
    }
    if (isGroup.value && !userHasResponded.value && !canEditMetadata.value) {
      invitationDialog.value = true
      logEventBoot("EventView", "watch:scheduleOverlap-openInvitation")
    }
  }
})

watch(weekOffset, () => {
  logEventBoot("EventView", "watch:weekOffset", {
    weekOffset: weekOffset.value,
  })
  loader.refreshCalendar()
})

watch(
  () => authUser.value?.calendarAccounts,
  () => {
    logEventBoot("EventView", "watch:authUser.calendarAccounts")
    void loader.fetchAuthUserCalendarEvents()
  },
)
</script>

<style>
.desktop-event-header-actions {
  --desktop-event-header-control-height: 2.5rem;
  --desktop-event-header-control-radius: 0.375rem;
  width: 22rem;
  min-width: 22rem;
}

.desktop-event-header-control {
  --v-btn-height: var(--desktop-event-header-control-height);
  box-sizing: border-box;
  block-size: var(--desktop-event-header-control-height);
  min-block-size: var(--desktop-event-header-control-height);
  border-radius: var(--desktop-event-header-control-radius);
}

.desktop-event-header-single-column {
  flex: 0 0 calc((100% - 0.5rem) / 2);
  min-inline-size: 0;
}

.desktop-editing-action-control {
  flex: 1 1 0;
  min-inline-size: 0;
}

.desktop-editing-delete-button {
  inline-size: 100%;
}

.destructive-outlined-button {
  color: var(--timeful-red-canonical);
  border: 1px solid var(--timeful-red-canonical);
  --v-hover-opacity: 0;
}

.destructive-outlined-button:hover {
  background-color: color-mix(
    in srgb,
    var(--timeful-red-canonical) 5%,
    transparent
  );
}

.event-header-description {
  margin-top: 0;
}

.event-metadata-action-button {
  --v-btn-height: 1.75rem;
  min-width: 0;
  height: 1.75rem;
  min-height: 1.75rem;
  border-radius: 0.375rem;
  padding-inline: 0.625rem;
  font-size: 0.875rem;
  color: rgb(0 153 76 / 1);
}

.desktop-primary-availability-button {
  border: 1px solid var(--timeful-primary-action-bg);
}

.desktop-primary-availability-button--add {
  -webkit-box-shadow: 0px 2px 6px 0px rgba(0, 0, 0, 0.14);
  -moz-box-shadow: 0px 2px 6px 0px rgba(0, 0, 0, 0.14);
  box-shadow: 0px 2px 6px 0px rgba(0, 0, 0, 0.14);
}

.desktop-primary-availability-button--edit {
  -webkit-box-shadow: none;
  -moz-box-shadow: none;
  box-shadow: none;
}

.mobile-primary-availability-button {
  min-width: 0;
}

.mobile-primary-availability-button--edit {
  border: 1px solid var(--timeful-primary-action-bg);
  -webkit-box-shadow: none;
  -moz-box-shadow: none;
  box-shadow: none;
}

.mobile-schedule-button .v-btn__content,
.mobile-schedule-button .v-icon {
  color: inherit;
}

.mobile-schedule-button {
  -webkit-box-shadow: none;
  -moz-box-shadow: none;
  box-shadow: none;
}

.mobile-schedule-button--disabled {
  --v-disabled-opacity: 1;
}

.mobile-schedule-button--disabled.v-btn--disabled.v-btn--variant-flat
  .v-btn__overlay {
  opacity: 0;
}

.mobile-editing-save-button {
  min-width: 0;
}

.desktop-editing-save-button,
.mobile-editing-save-button {
  -webkit-box-shadow: none;
  -moz-box-shadow: none;
  box-shadow: none;
}
</style>

<style
  scoped
  src="@/components/schedule_overlap/ScheduleOverlapCompactSwitch.css"
></style>

<style scoped>
@keyframes timeful-availability-button-attention {
  0% {
    transform: scale(1);
    box-shadow: 0 0 0 0 rgba(0, 153, 76, 0.45);
  }

  45% {
    transform: scale(1.06);
    box-shadow: 0 0 0 10px rgba(0, 153, 76, 0.12);
  }

  100% {
    transform: scale(1);
    box-shadow: 0 0 0 0 rgba(0, 153, 76, 0);
  }
}

.timeful-availability-button-attention {
  animation: timeful-availability-button-attention 0.45s ease-in-out 0s 2;
}

.desktop-event-header-options__best-times-slot {
  display: flex;
  align-items: center;
  justify-content: center;
  min-width: 0;
}

.desktop-event-header-options__start-on-monday-slot {
  display: flex;
  align-items: center;
  justify-content: flex-end;
  min-width: 0;
}

.desktop-event-header-options__start-on-monday-slot.desktop-event-header-single-column {
  justify-content: center;
}

.desktop-event-header-options__menu {
  min-width: 0;
}

.desktop-event-header-options__best-times-switch,
.desktop-event-header-options__start-on-monday-switch {
  --v-input-control-height: var(--desktop-event-header-control-height);
  width: auto;
  height: 100%;
}

.desktop-event-header-options__best-times-switch :deep(.v-input),
.desktop-event-header-options__start-on-monday-switch :deep(.v-input) {
  height: 100%;
}

.desktop-event-header-options__best-times-switch :deep(.v-input__control),
.desktop-event-header-options__best-times-switch :deep(.v-selection-control),
.desktop-event-header-options__start-on-monday-switch :deep(.v-input__control),
.desktop-event-header-options__start-on-monday-switch
  :deep(.v-selection-control) {
  height: 100%;
  min-height: var(--desktop-event-header-control-height);
}

.desktop-event-header-options__best-times-switch :deep(.v-selection-control),
.desktop-event-header-options__start-on-monday-switch
  :deep(.v-selection-control) {
  align-items: center;
  justify-content: center;
}

.desktop-event-header-options__best-times-switch :deep(.v-label),
.desktop-event-header-options__start-on-monday-switch :deep(.v-label) {
  padding-inline-start: 0;
  margin-inline-start: 0.35rem;
}

.desktop-event-header-options__best-times-switch
  :deep(.v-selection-control__wrapper),
.desktop-event-header-options__start-on-monday-switch
  :deep(.v-selection-control__wrapper) {
  margin-top: 0;
}

.desktop-event-header-options__collapse-disabled-times-switch {
  --v-input-control-height: var(--desktop-event-header-control-height);
  width: auto;
  height: 100%;
}

.desktop-event-header-options__collapse-disabled-times-switch :deep(.v-input) {
  height: 100%;
}

.desktop-event-header-options__collapse-disabled-times-switch
  :deep(.v-input__control) {
  height: 100%;
  min-height: var(--desktop-event-header-control-height);
  inline-size: 100%;
  justify-content: center;
}

.desktop-event-header-options__collapse-disabled-times-switch
  :deep(.v-selection-control) {
  height: 100%;
  min-height: var(--desktop-event-header-control-height);
  inline-size: fit-content;
}

.desktop-event-header-options__collapse-disabled-times-switch
  :deep(.v-selection-control) {
  align-items: center;
  justify-content: center;
}

.desktop-event-header-options__collapse-disabled-times-switch :deep(.v-label) {
  flex: 0 0 auto;
  padding-inline-start: 0;
  margin-inline-start: 0.35rem;
}

.desktop-event-header-options__collapse-disabled-times-switch
  :deep(.v-selection-control__wrapper) {
  margin-top: 0;
}

.desktop-editing-overlay-availability-toggle :deep(.v-selection-control) {
  align-items: center;
  inline-size: 100%;
  justify-content: center;
  min-inline-size: 0;
}

.desktop-editing-overlay-availability-toggle :deep(.v-input__control) {
  inline-size: 100%;
  min-inline-size: 0;
}

.desktop-editing-overlay-availability-toggle :deep(.v-label) {
  flex: 1 1 0;
  line-height: 1.25;
  min-inline-size: 0;
  overflow-wrap: break-word;
  white-space: normal;
}

.desktop-event-header-options__menu-button {
  border-color: #e0e0e0;
}

.schedule-event-menu__item :deep(.v-list-item__content) {
  display: flex;
  align-items: center;
}

.schedule-event-menu__content {
  display: flex;
  align-items: center;
  min-height: 100%;
  min-width: 0;
}

.schedule-event-menu__icon {
  display: block;
  height: 20px;
  object-fit: contain;
  width: 20px;
}
</style>

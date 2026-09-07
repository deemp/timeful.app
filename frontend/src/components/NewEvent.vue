<template>
  <v-card
    :flat="dialog"
    :class="{ 'tw:py-4': !dialog, 'tw:flex-1': dialog }"
    class="tw:relative tw:flex tw:max-w-md tw:flex-col tw:overflow-hidden tw:rounded-lg tw:transition-all"
  >
    <EditorDialogHeader
      :title="edit ? 'Edit event' : 'New event'"
      subtitle="Ideal for one-time / recurring meetings"
      help-header="Events"
      :dialog="dialog"
      :show-help="showHelp"
      :hide-dialog-actions="hideDialogActions"
      @close="emit('update:modelValue', false)"
    >
      <template #help-content>
        <div class="tw:mb-4">
          Use events to collect people's availabilities and compare them across
          certain days.
        </div>
      </template>
    </EditorDialogHeader>
    <div class="tw:relative tw:flex tw:min-h-0 tw:flex-1 tw:flex-col">
      <v-card-text
        ref="cardText"
        class="tw:relative tw:flex-1 tw:overflow-auto tw:px-4 tw:py-1 tw:sm:px-8"
      >
        <AlertText v-if="edit && guestEvent" class="tw:mb-4">
          Anybody can edit this event because it was created while not signed in
        </AlertText>
        <v-form
          ref="formRef"
          v-model="formValid"
          lazy-validation
          class="new-event-form tw:flex tw:flex-col tw:gap-y-6"
          :disabled="loading"
        >
          <v-text-field
            ref="nameField"
            v-model="name"
            label="Event name (required)"
            placeholder="Name your event ..."
            :maxlength="EVENT_NAME_MAX_LENGTH"
            hide-details="auto"
            variant="outlined"
            class="timeful-invalid-field"
            append-inner-icon="mdi-alert-circle"
            :rules="eventNameRules"
            autofocus
            required
            @keyup.enter="blurNameField"
          />

          <v-textarea
            v-model="description"
            label="Description (optional)"
            placeholder="Describe your event..."
            hide-details="auto"
            variant="outlined"
            auto-grow
            rows="1"
            class="new-event-description-field"
          />

          <SlideToggle
            v-if="daysOnlyEnabled && !edit"
            v-model="daysOnly"
            class="tw:w-full"
            :options="[...daysOnlyOptions]"
          />

          <div>
            <v-expand-transition>
              <div v-if="!daysOnly">
                <div class="tw:mb-2 tw:text-lg tw:text-black">
                  What times might work?
                </div>
                <div class="tw:mb-2" data-testid="specific-times-toggle">
                  <div class="compact-switch-grid specific-times-switch-grid">
                    <v-switch
                      v-model="specificTimesEnabled"
                      class="compact-switch specific-times-switch schedule-overlap-compact-switch"
                      color="primary"
                      inset
                      hide-details
                    />
                    <span
                      class="compact-switch__label specific-times-switch__label tw:text-sm"
                      :class="
                        specificTimesEnabled
                          ? 'tw:text-black'
                          : 'tw:text-very-dark-gray'
                      "
                    >
                      Set specific times per day
                    </span>
                    <v-expand-transition>
                      <div
                        v-if="specificTimesEnabled"
                        class="compact-switch__message specific-times-switch__message tw:pointer-events-auto tw:text-xs tw:text-dark-gray"
                      >
                        Click the Next button below
                      </div>
                    </v-expand-transition>
                  </div>
                </div>
                <v-expand-transition>
                  <div
                    v-if="!specificTimesEnabled"
                    class="time-range-row tw:mb-6 tw:flex tw:items-center tw:justify-between tw:gap-x-2"
                  >
                    <TimeFormatToggle
                      :model-value="eventTimeType"
                      @update:model-value="updateEventTimeType"
                    />
                    <TimeRangePicker
                      :items="times"
                      :start="startTimeOption"
                      :end="endTimeOption"
                      @update:start="(option) => (startTimeOption = option)"
                      @update:end="(option) => (endTimeOption = option)"
                    />
                  </div>
                </v-expand-transition>
              </div>
            </v-expand-transition>

            <div class="tw:mb-2 tw:text-lg tw:text-black">
              What
              {{
                selectedDateOption === dateOptions.SPECIFIC ? "dates" : "days"
              }}
              might work?
            </div>
            <v-select
              v-if="!edit && !daysOnly"
              v-model="selectedDateOption"
              :items="Object.values(dateOptions)"
              variant="solo"
              hide-details
              class="timeful-solo-field tw:mb-4"
            >
              <template #item="{ item: internalItem, props: itemProps }">
                <div
                  v-bind="itemProps"
                  class="time-range-select-item"
                  :class="{
                    'time-range-select-item--active':
                      internalItem === selectedDateOption,
                  }"
                >
                  {{ internalItem }}
                </div>
              </template>
            </v-select>

            <v-expand-transition>
              <div
                v-if="selectedDateOption === dateOptions.SPECIFIC || daysOnly"
              >
                <div class="tw:mb-2 tw:text-xs tw:text-dark-gray">
                  Drag to select multiple dates
                </div>
                <v-input
                  key="date-picker"
                  v-model="selectedDays"
                  hide-details="auto"
                  :rules="selectedDaysRules"
                >
                  <DatePicker
                    v-model="selectedDaysStr"
                    :min-calendar-date="minCalendarDate"
                    :start-calendar-on-monday="startOnMonday"
                  />
                </v-input>
              </div>
              <div v-else-if="selectedDateOption === dateOptions.DOW">
                <v-input
                  key="days-of-week"
                  v-model="selectedDaysOfWeek"
                  hide-details="auto"
                  :rules="selectedDaysRules"
                  class="tw:w-full"
                >
                  <v-btn-toggle
                    v-model="selectedDaysOfWeek"
                    multiple
                    class="editor-dow-toggle new-event-dow-toggle"
                  >
                    <v-btn
                      v-for="day in dayOfWeekButtons"
                      :key="day.key"
                      :class="getDayOfWeekButtonClass(day.value)"
                      :value="day.value"
                      variant="flat"
                    >
                      {{ day.label }}
                    </v-btn>
                  </v-btn-toggle>
                </v-input>
                <div
                  class="compact-switch-grid new-event-start-on-monday-switch-grid tw:mt-2"
                >
                  <v-switch
                    v-model="startOnMonday"
                    class="compact-switch new-event-start-on-monday-switch schedule-overlap-compact-switch"
                    color="primary"
                    inset
                    hide-details
                  />
                  <span
                    class="compact-switch__label tw:text-sm tw:text-very-dark-gray"
                  >
                    Start on Monday
                  </span>
                </div>
              </div>
            </v-expand-transition>
          </div>

          <v-checkbox
            v-if="!guestEvent && authUser"
            v-model="notificationsEnabled"
            hide-details
            class="tw:mt-2"
          >
            <template #label>
              <span class="tw:text-sm tw:text-very-dark-gray"
                >Email me each time someone joins my event</span
              >
            </template>
          </v-checkbox>
          <v-checkbox
            v-else-if="!guestEvent"
            class="gated-feature-checkbox tw:mt-2"
            disabled
            messages="test"
            false-icon="mdi-checkbox-blank-off-outline"
          >
            <template #label>
              <span class="advanced-options-disabled-label tw:text-sm"
                >Email me each time someone joins my event</span
              >
            </template>
            <template #message>
              <div
                class="advanced-options-disabled-message tw:pointer-events-auto tw:-mt-1 tw:ml-[32px] tw:text-xs tw:text-dark-gray"
              >
                <span
                  class="advanced-options-disabled-copy tw:font-medium tw:text-very-dark-gray"
                  ><template v-if="signInEnabled">
                    <a
                      class="advanced-options-sign-in-link"
                      @click="emit('signIn')"
                      >Sign in</a
                    >
                    to use this feature
                  </template>
                  <template v-else
                    >Requires sign-in, which is disabled in this build</template
                  >
                </span>
              </div>
            </template>
          </v-checkbox>

          <div class="tw:flex tw:flex-col tw:gap-2">
            <ExpandableSection
              v-if="authUser && !guestEvent"
              v-model="showEmailReminders"
              label="Email reminders"
              :auto-scroll="dialog"
            >
              <div class="tw:flex tw:flex-col tw:gap-5 tw:pt-2">
                <EmailInput
                  v-show="authUser"
                  :key="emailInputKey"
                  label-color="tw:text-very-dark-gray"
                  :added-emails="addedEmails"
                  @request-contacts-access="requestContactsAccess"
                  @update:emails="
                    (newEmails) => {
                      emails = newEmails as string[]
                    }
                  "
                >
                  <template #header>
                    <div class="tw:flex tw:gap-1">
                      <div class="tw:text-very-dark-gray">
                        Remind people to fill out the event
                      </div>

                      <v-tooltip
                        top
                        content-class="tw:bg-very-dark-gray tw:shadow-lg tw:opacity-100 tw:py-4"
                      >
                        <template #activator="{ props: tooltipProps }">
                          <v-icon small v-bind="tooltipProps"
                            >mdi-information-outline
                          </v-icon>
                        </template>
                        <div>
                          Reminder emails will be sent the day of event
                          creation,<br />one day after, and three days after.
                          You will also receive <br />an email when everybody
                          has filled out the event.
                        </div>
                      </v-tooltip>
                    </div>
                  </template>
                </EmailInput>
              </div>
            </ExpandableSection>

            <div class="tw:mb-2 tw:text-lg tw:text-black">Advanced options</div>
            <div
              class="advanced-options-panel tw:flex tw:flex-col tw:gap-5 tw:pt-2"
            >
              <div v-if="!daysOnly" class="tw:flex tw:items-center tw:gap-x-2">
                <div class="tw:text-sm tw:text-black">Time increment</div>
                <TimeFormatToggle
                  :model-value="timeIncrement"
                  :options="timeIncrementToggleOptions"
                  :indicator-width="56"
                  @update:model-value="updateTimeIncrement"
                />
              </div>
              <v-checkbox
                v-if="authUser && !guestEvent"
                v-model="collectEmails"
                density="compact"
                hide-details
              >
                <template #label>
                  <span class="tw:text-sm tw:text-black">
                    Collect respondents' email addresses
                  </span>
                </template>
                <template #message="{ message }">
                  <div
                    class="tw:-mt-1 tw:ml-[32px] tw:text-xs tw:text-dark-gray"
                  >
                    {{ message }}
                  </div>
                </template>
              </v-checkbox>
              <v-checkbox
                v-else-if="!guestEvent"
                class="gated-feature-checkbox"
                disabled
                density="compact"
                messages="test"
                false-icon="mdi-checkbox-blank-off-outline"
              >
                <template #label>
                  <span class="advanced-options-disabled-label tw:text-sm"
                    >Collect respondents' email addresses</span
                  >
                </template>
                <template #message>
                  <div
                    class="advanced-options-disabled-message tw:pointer-events-auto tw:-mt-1 tw:ml-[32px] tw:text-xs tw:text-dark-gray"
                  >
                    <span
                      class="advanced-options-disabled-copy tw:font-medium tw:text-very-dark-gray"
                      ><template v-if="signInEnabled">
                        <a
                          class="advanced-options-sign-in-link"
                          @click="emit('signIn')"
                          >Sign in</a
                        >
                        to use this feature
                      </template>
                      <template v-else
                        >Requires sign-in, which is disabled in this
                        build</template
                      >
                    </span>
                  </div>
                </template>
              </v-checkbox>
              <v-checkbox
                v-if="authUser && !guestEvent"
                v-model="blindAvailabilityEnabled"
                density="compact"
                messages="Only show responses to event creator"
              >
                <template #label>
                  <span class="tw:text-sm tw:text-black">
                    Hide responses from respondents
                  </span>
                </template>
                <template #message="{ message }">
                  <div
                    class="tw:-mt-1 tw:ml-[32px] tw:text-xs tw:text-dark-gray"
                  >
                    {{ message }}
                  </div>
                </template>
              </v-checkbox>
              <v-checkbox
                v-else-if="!guestEvent"
                class="gated-feature-checkbox"
                disabled
                density="compact"
                messages="Only show responses to event creator. "
                false-icon="mdi-checkbox-blank-off-outline"
              >
                <template #label>
                  <span class="advanced-options-disabled-label tw:text-sm"
                    >Hide responses from respondents</span
                  >
                </template>
                <template #message="{ message }">
                  <div
                    class="advanced-options-disabled-message tw:pointer-events-auto tw:-mt-1 tw:ml-[32px] tw:text-xs tw:text-dark-gray"
                  >
                    {{ message }}
                    <span
                      class="advanced-options-disabled-copy tw:font-medium tw:text-very-dark-gray"
                      ><template v-if="signInEnabled">
                        <a
                          class="advanced-options-sign-in-link"
                          @click="emit('signIn')"
                          >Sign in</a
                        >
                        to use this feature
                      </template>
                      <template v-else
                        >Requires sign-in, which is disabled in this
                        build</template
                      >
                    </span>
                  </div>
                </template>
              </v-checkbox>
              <v-checkbox
                v-if="authUser && !guestEvent"
                v-model="sendEmailAfterXResponsesEnabled"
                density="compact"
                hide-details
              >
                <template #label>
                  <div
                    :class="!sendEmailAfterXResponsesEnabled && 'tw:opacity-50'"
                    class="tw:flex tw:items-center tw:gap-x-2 tw:text-sm tw:text-very-dark-gray"
                  >
                    <div>Email me after</div>
                    <v-text-field
                      v-model="sendEmailAfterXResponses"
                      :disabled="!sendEmailAfterXResponsesEnabled"
                      density="compact"
                      class="email-me-after-text-field tw:mt-[-2px] tw:w-10"
                      hide-details
                      type="number"
                      min="1"
                    ></v-text-field>
                    <div>responses</div>
                  </div>
                </template>
              </v-checkbox>
              <div class="tw:flex tw:items-center tw:gap-x-2">
                <div
                  class="tw:text-sm tw:text-black"
                  data-testid="timezone-label"
                >
                  Timezone
                </div>
                <TimezoneSelector
                  :model-value="timezone"
                  compact
                  fit-content
                  fixed-width
                  field-variant="solo"
                  compact-button
                  :show-reset="false"
                  @update:model-value="
                    (val) => {
                      setTimezone(val)
                      trackTimezoneChange(val)
                    }
                  "
                />
              </div>
            </div>
          </div>
        </v-form>
      </v-card-text>
      <OverflowGradient
        v-if="hasMounted && cardTextElement"
        position="top"
        :scroll-container="cardTextElement"
        :show-arrow="false"
      />
    </div>
    <v-card-actions class="tw:relative tw:px-4 tw:sm:px-8">
      <div class="tw:relative tw:w-full">
        <v-btn
          :disabled="loading"
          :aria-disabled="submitBlocked"
          block
          :loading="loading"
          :style="submitButtonStyle"
          class="timeful-elevated-button"
          :class="
            submitBlocked
              ? 'new-event-submit-button new-event-submit-button--disabled tw:pointer-events-none tw:mt-4 tw:cursor-default'
              : 'new-event-submit-button new-event-submit-button--enabled tw:mt-4'
          "
          :ripple="!submitBlocked"
          :tabindex="submitBlocked ? -1 : undefined"
          @click="submitIfAllowed"
        >
          {{
            specificTimesEnabled ? "Next" : edit ? "Save edits" : "Create event"
          }}
        </v-btn>
        <div
          :class="showSubmitError ? 'tw:visible' : 'tw:invisible'"
          class="new-event-submit-error tw:mt-1 tw:text-xs"
        >
          Please fix form errors before continuing
        </div>
      </div>
    </v-card-actions>

    <OverflowGradient
      v-if="hasMounted && cardTextElement"
      :scroll-container="cardTextElement"
      class="tw:bottom-[90px]"
    />
  </v-card>
</template>

<script setup lang="ts">
import { computed, ref, watch } from "vue"
import { useRouter } from "vue-router"
import { storeToRefs } from "pinia"
import { authTypes, dateOptions, eventTypes } from "@/constants"
import { isAnonymousOwnerEvent } from "@/composables/event/eventOwnership"
import {
  addEventToCreatedList,
  plainTimeToTimeNum,
  post,
  put,
  resolveTimezoneValue,
  signInGoogle,
  timeNumToPlainTime,
} from "@/utils"
import { signInEnabled } from "@/utils/signInAvailability"
import {
  EVENT_NAME_MAX_LENGTH,
  getEventNameValidationMessage,
  validateEventName,
} from "@/utils/eventName"
import { useMainStore } from "@/stores/main"
import { posthog } from "@/plugins/posthog"
import TimezoneSelector from "./schedule_overlap/TimezoneSelector.vue"
import TimeFormatToggle, {
  type SegmentedToggleOption,
} from "./schedule_overlap/TimeFormatToggle.vue"
import TimeRangePicker from "./TimeRangePicker.vue"
import { Temporal } from "temporal-polyfill"
import EmailInput from "./event/EmailInput.vue"
import ExpandableSection from "./ExpandableSection.vue"
import DatePicker from "@/components/DatePicker.vue"
import SlideToggle from "./SlideToggle.vue"
import AlertText from "@/components/AlertText.vue"
import OverflowGradient from "@/components/OverflowGradient.vue"
import EditorDialogHeader from "./EditorDialogHeader.vue"
import type { Event as EventModel } from "@/types"
import type { Timezone } from "@/composables/schedule_overlap/types"
import type { EventDraft } from "@/composables/event/types"
import { toTransportDateTimeStrings } from "@/types/transport"
import { getTimedWeeklyAnchorInstant } from "@/utils/timedEventSlots"
import { buildEventEditorSchedule } from "@/composables/event/eventEditorSchedule"
import {
  buildSpecificTimesCreateDraft,
  buildSpecificTimesEditDraft,
} from "@/composables/event/specificTimesEditDraft"
import { withSpecificTimesEntryState } from "@/composables/event/specificTimesEntryState"
import {
  useEventEditorState,
  type EventEditorFormRef,
} from "@/composables/event/useEventEditorState"

interface FormRef extends EventEditorFormRef {
  validate: () => Promise<{ valid: boolean }> | boolean
}

interface NameFieldRef {
  blur: () => void
}

interface ElementWithRoot {
  $el?: HTMLElement
}

const props = withDefaults(
  defineProps<{
    event?: EventModel
    edit?: boolean
    dialog?: boolean
    contactsPayload?: EventDraft
    showHelp?: boolean
    folderId?: string | null
    isDialogOpen?: boolean
    hideDialogActions?: boolean
  }>(),
  {
    event: undefined,
    edit: false,
    dialog: true,
    contactsPayload: () => ({}),
    showHelp: false,
    folderId: null,
    isDialogOpen: false,
    hideDialogActions: false,
  },
)

const emit = defineEmits<{
  "update:modelValue": [value: boolean]
  "refresh-event": [
    payload?: {
      fromEditEvent?: boolean
      specificTimesEditDraft?: ReturnType<typeof buildSpecificTimesEditDraft>
      eventTimezone?: string
    },
  ]
  signIn: []
}>()

const router = useRouter()
const mainStore = useMainStore()
const { authUser, daysOnlyEnabled } = storeToRefs(mainStore)

const daysOnlyOptions = [
  { text: "Dates and times", value: false },
  { text: "Dates only", value: true },
] as const

const formRef = ref<FormRef | null>(null)
const nameField = ref<NameFieldRef | null>(null)
const emailInputKey = ref(0)
const cardText = ref<HTMLElement | ElementWithRoot | null>(null)
const cardTextElement = computed(() => {
  if (!cardText.value) return null
  if (cardText.value instanceof HTMLElement) return cardText.value
  return cardText.value.$el ?? null
})

const DEFAULT_TIME_INCREMENT = 15
const DEFAULT_START_ON_MONDAY = true
const SUPPORTED_TIME_INCREMENTS = new Set([15, 30, 60])
const submitAttempted = ref(false)
const description = ref("")

function normalizeTimeIncrement(value: unknown): number {
  const candidate =
    typeof value === "number"
      ? value
      : typeof value === "string"
        ? Number(value)
        : value instanceof Temporal.Duration
          ? value.total("minutes")
          : typeof value === "object" &&
              value !== null &&
              "value" in value &&
              typeof value.value === "number"
            ? value.value
            : NaN

  return SUPPORTED_TIME_INCREMENTS.has(candidate)
    ? candidate
    : DEFAULT_TIME_INCREMENT
}

const editorState = useEventEditorState({
  event: computed(() => props.event),
  edit: computed(() => props.edit),
  contactsPayload: computed(() => props.contactsPayload),
  formRef,
  initialNotificationsEnabled: true,
  initialStartOnMonday: DEFAULT_START_ON_MONDAY,
  onDraftHydrate: ({ specificTimesEnabled, startOnMonday }) => {
    specificTimesEnabled.value =
      props.contactsPayload.specificTimesEnabled ?? false
    startOnMonday.value =
      props.contactsPayload.startOnMonday ?? DEFAULT_START_ON_MONDAY
  },
  onEventHydrate: (
    { specificTimesEnabled, startOnMonday, collectEmails, timeIncrement },
    event,
  ) => {
    description.value = event.description ?? ""
    specificTimesEnabled.value = event.hasSpecificTimes ?? false
    startOnMonday.value = event.startOnMonday ?? startOnMonday.value
    collectEmails.value = event.collectEmails ?? false
    timeIncrement.value = normalizeTimeIncrement(event.timeIncrement)
  },
  onReset: ({ specificTimesEnabled, startOnMonday, timeIncrement }) => {
    specificTimesEnabled.value = false
    startOnMonday.value = DEFAULT_START_ON_MONDAY
    timeIncrement.value = DEFAULT_TIME_INCREMENT
  },
  captureExtraInitialState: ({
    specificTimesEnabled,
    collectEmails,
    timeIncrement,
    startOnMonday,
  }) => ({
    specificTimesEnabled: specificTimesEnabled.value,
    collectEmails: collectEmails.value,
    timeIncrement: timeIncrement.value,
    startOnMonday: startOnMonday.value,
    description: description.value,
  }),
  isExtraEdited: (
    { specificTimesEnabled, collectEmails, timeIncrement, startOnMonday },
    initial,
  ) =>
    specificTimesEnabled.value !== initial.specificTimesEnabled ||
    collectEmails.value !== initial.collectEmails ||
    timeIncrement.value !== initial.timeIncrement ||
    startOnMonday.value !== initial.startOnMonday ||
    description.value !== initial.description,
})

const {
  formValid,
  name,
  startTime,
  endTime,
  loading,
  selectedDays,
  selectedDaysStr,
  selectedDaysOfWeek,
  startOnMonday,
  notificationsEnabled,
  daysOnly,
  selectedDateOption,
  showEmailReminders,
  emails,
  collectEmails,
  blindAvailabilityEnabled,
  sendEmailAfterXResponsesEnabled,
  sendEmailAfterXResponses,
  specificTimesEnabled,
  timeIncrement,
  eventTimeType,
  timezone,
  hasMounted,
  selectedDaysRules,
  dayOfWeekButtons,
  times,
  minCalendarDate,
  setTimezone,
  updateEventTimeType,
  getDayOfWeekButtonClass,
  reset: resetEditorState,
  resetToEventData: resetEditorStateToEventData,
  hasEventBeenEdited,
} = editorState

const eventNameRules = computed(() => [
  (value: string) =>
    getEventNameValidationMessage(validateEventName(value).code) ?? true,
])

const hasName = computed(() => !!name.value.trim())
const hasSelectedDayCriteria = computed(() =>
  daysOnly.value || selectedDateOption.value === dateOptions.SPECIFIC
    ? selectedDays.value.length > 0
    : selectedDaysOfWeek.value.length > 0,
)
const submitBlocked = computed(
  () => !hasName.value || !hasSelectedDayCriteria.value,
)
const showSubmitError = computed(
  () => submitAttempted.value && !loading.value && !formValid.value,
)
const submitButtonStyle = computed<Record<string, string>>(() => ({
  backgroundColor: submitBlocked.value
    ? "var(--timeful-primary-action-disabled-bg)"
    : "var(--timeful-primary-action-bg)",
  color: submitBlocked.value
    ? "var(--timeful-primary-action-disabled-fg)"
    : "var(--timeful-primary-action-fg)",
  border: "none",
  borderRadius: "6px",
  paddingRight: "16px",
  paddingLeft: "16px",
  whiteSpace: "nowrap",
  lineHeight: submitBlocked.value ? "21px" : "normal",
}))
const addedEmails = computed(() => {
  if (Object.keys(props.contactsPayload).length > 0) {
    return props.contactsPayload.emails ?? []
  }

  return props.event?.remindees
    ? props.event.remindees
        .map((remindee) => remindee.email)
        .filter((email): email is string => !!email)
    : []
})
const startTimeNum = computed({
  get: () => plainTimeToTimeNum(startTime.value),
  set: (num: number) => {
    startTime.value = timeNumToPlainTime(num)
  },
})
const startTimeOption = computed({
  get: () =>
    times.value.find((option) => option.value === startTimeNum.value) ??
    times.value[0],
  set: (option) => {
    startTimeNum.value = option.time
  },
})
const endTimeNum = computed({
  get: () => plainTimeToTimeNum(endTime.value),
  set: (num: number) => {
    endTime.value = timeNumToPlainTime(num)
  },
})
const endTimeOption = computed({
  get: () =>
    times.value.find((option) => option.value === endTimeNum.value) ??
    times.value[0],
  set: (option) => {
    endTimeNum.value = option.time
  },
})
const guestEvent = computed(() => isAnonymousOwnerEvent(props.event))
const timeIncrementToggleOptions: SegmentedToggleOption[] = [
  { label: "15 min", value: 15 },
  { label: "30 min", value: 30 },
  { label: "60 min", value: 60 },
]

const updateTimeIncrement = (value: string | number) => {
  timeIncrement.value = normalizeTimeIncrement(value)
}

const blurNameField = () => {
  nameField.value?.blur()
}

const reset = () => {
  submitAttempted.value = false
  description.value = ""
  resetEditorState()
  emailInputKey.value += 1
}

const submit = async () => {
  if (!hasName.value) return

  const result = await formRef.value?.validate()
  const valid = typeof result === "boolean" ? result : result?.valid
  if (!valid) return

  const timezoneValue = resolveTimezoneValue(timezone.value.value)
  const schedule = buildEventEditorSchedule({
    daysOnly: daysOnly.value,
    daysOnlyType: eventTypes.SPECIFIC_DATES,
    selectedDateOption: selectedDateOption.value,
    selectedDays: selectedDays.value,
    selectedDaysOfWeek: selectedDaysOfWeek.value,
    startOnMonday: startOnMonday.value,
    startTime: startTime.value,
    endTime: endTime.value,
    timezoneValue,
    timeIncrementMinutes: timeIncrement.value,
    weeklyAnchorInstant:
      props.edit && props.event
        ? getTimedWeeklyAnchorInstant(props.event.activeSlots, timezoneValue)
        : undefined,
  })

  selectedDays.value = schedule.normalizedSelectedDays
  selectedDaysOfWeek.value = schedule.normalizedSelectedDaysOfWeek
  if (daysOnly.value) {
    specificTimesEnabled.value = false
  }

  loading.value = true

  const specificTimesEditDraft =
    props.edit && props.event
      ? buildSpecificTimesEditDraft({
          event: props.event,
          schedule,
          timeIncrementMinutes: timeIncrement.value,
          specificTimesEnabled: specificTimesEnabled.value,
        })
      : specificTimesEnabled.value
        ? buildSpecificTimesCreateDraft({
            schedule,
            timeIncrementMinutes: timeIncrement.value,
          })
        : undefined
  const canonicalActiveSlots =
    specificTimesEditDraft?.activeSlots ?? schedule.activeSlots
  const canonicalEventTimezone =
    specificTimesEditDraft?.eventTimezone ?? schedule.eventTimezone
  const canonicalSlotGeneration: typeof schedule.slotGeneration =
    specificTimesEditDraft?.slotGeneration?.startTimeLocal &&
    specificTimesEditDraft.slotGeneration.endTimeLocal &&
    specificTimesEditDraft.slotGeneration.timeIncrement
      ? {
          startTimeLocal: specificTimesEditDraft.slotGeneration.startTimeLocal,
          endTimeLocal: specificTimesEditDraft.slotGeneration.endTimeLocal,
          timeIncrement: specificTimesEditDraft.slotGeneration.timeIncrement,
        }
      : schedule.slotGeneration
  const canonicalTimedRecurrence: typeof schedule.timedRecurrence =
    specificTimesEditDraft?.timedRecurrence?.kind &&
    specificTimesEditDraft.timedRecurrence.selectedDays &&
    specificTimesEditDraft.timedRecurrence.selectedDaysOfWeek
      ? {
          kind: specificTimesEditDraft.timedRecurrence.kind,
          selectedDays: specificTimesEditDraft.timedRecurrence.selectedDays,
          selectedDaysOfWeek:
            specificTimesEditDraft.timedRecurrence.selectedDaysOfWeek,
          startOnMonday:
            specificTimesEditDraft.timedRecurrence.startOnMonday ?? false,
        }
      : schedule.timedRecurrence

  const payload = {
    name: name.value,
    description: description.value,
    notificationsEnabled: !authUser.value ? false : notificationsEnabled.value,
    blindAvailabilityEnabled: blindAvailabilityEnabled.value,
    daysOnly: daysOnly.value,
    remindees: emails.value,
    type: schedule.type,
    sendEmailAfterXResponses: sendEmailAfterXResponsesEnabled.value
      ? sendEmailAfterXResponses.value
      : -1,
    collectEmails: collectEmails.value,
    creatorPosthogId: posthog.get_distinct_id(),
    ...(daysOnly.value
      ? {
          dates: toTransportDateTimeStrings(schedule.dates),
          eventTimezone: timezoneValue,
        }
      : {
          activeSlots: toTransportDateTimeStrings(canonicalActiveSlots),
          eventTimezone: canonicalEventTimezone,
          slotGeneration: {
            startTimeLocal: canonicalSlotGeneration.startTimeLocal.toString(),
            endTimeLocal: canonicalSlotGeneration.endTimeLocal.toString(),
            timeIncrementMinutes:
              canonicalSlotGeneration.timeIncrement.total("minutes"),
          },
          timedRecurrence: {
            kind: canonicalTimedRecurrence.kind,
            selectedDays: canonicalTimedRecurrence.selectedDays.map((day) =>
              day.toString(),
            ),
            selectedDaysOfWeek: canonicalTimedRecurrence.selectedDaysOfWeek,
            startOnMonday: canonicalTimedRecurrence.startOnMonday,
          },
        }),
  }

  const posthogPayload: Record<string, unknown> = {
    eventName: name.value,
    eventDuration: schedule.duration,
    eventDates: JSON.stringify(schedule.dates),
    eventHasSpecificTimes: specificTimesEnabled.value,
    eventNotificationsEnabled: !authUser.value
      ? false
      : notificationsEnabled.value,
    eventBlindAvailabilityEnabled: blindAvailabilityEnabled.value,
    eventDaysOnly: daysOnly.value,
    eventRemindees: emails.value,
    eventType: schedule.type,
    eventSendEmailAfterXResponses: sendEmailAfterXResponsesEnabled.value
      ? sendEmailAfterXResponses.value
      : -1,
    eventCollectEmails: collectEmails.value,
    eventStartOnMonday: startOnMonday.value,
    eventTimeIncrement: timeIncrement.value,
    eventTimezone: canonicalEventTimezone,
  }

  if (!props.edit) {
    post<{ eventId: string; shortId?: string }>("/events", payload)
      .then(async ({ eventId, shortId }) => {
        if (authUser.value) {
          await mainStore.setEventFolder({ eventId, folderId: props.folderId })
        }
        await router.push({
          name: "event",
          params: { eventId: shortId ?? eventId },
          state:
            specificTimesEnabled.value && specificTimesEditDraft
              ? withSpecificTimesEntryState({
                  draft: specificTimesEditDraft,
                })
              : undefined,
        })

        emit("update:modelValue", false)
        reset()

        posthogPayload.eventId = eventId
        posthog.capture("Event created", posthogPayload)

        if (!authUser.value) {
          addEventToCreatedList(eventId)
        }
      })
      .catch((err: unknown) => {
        mainStore.showError(
          "There was a problem creating that event! Please try again later.",
        )
        console.error(err)
      })
      .finally(() => {
        loading.value = false
      })
  } else if (props.event) {
    put(`/events/${props.event._id ?? ""}`, payload)
      .then(() => {
        posthogPayload.eventId = props.event?._id
        posthog.capture("Event edited", posthogPayload)

        emit("refresh-event", {
          fromEditEvent: specificTimesEnabled.value,
          specificTimesEditDraft,
          eventTimezone: timezoneValue,
        })
      })
      .catch((err: unknown) => {
        mainStore.showError(
          "There was a problem editing this event! Please try again later.",
        )
        console.log(err)
      })
      .finally(() => {
        loading.value = false
      })
  }
}

function submitIfAllowed() {
  if (loading.value || submitBlocked.value) return
  submitAttempted.value = true
  void submit()
}

const requestContactsAccess = ({
  emails: requestEmails,
}: {
  emails: string[]
}) => {
  const payload = {
    emails: requestEmails,
    name: name.value,
    startTime: startTime.value,
    endTime: endTime.value,
    daysOnly: daysOnly.value,
    selectedDays: selectedDays.value,
    selectedDaysOfWeek: selectedDaysOfWeek.value,
    selectedDateOption: selectedDateOption.value,
    notificationsEnabled: notificationsEnabled.value,
    timezone: timezone.value,
    specificTimesEnabled: specificTimesEnabled.value,
    startOnMonday: startOnMonday.value,
  }

  signInGoogle({
    state: {
      type: authTypes.EVENT_CONTACTS,
      eventId: props.event ? (props.event.shortId ?? props.event._id) : "",
      openNewGroup: false,
      payload,
    },
    requestContactsPermission: true,
  })
}

const resetToEventData = () => {
  resetEditorStateToEventData()
  emailInputKey.value += 1
}

const trackTimezoneChange = (newTimezone: Timezone) => {
  posthog.capture("timezone_selected_in_new_event_dialog", {
    timezone: newTimezone.value,
  })
}

defineExpose({ reset, resetToEventData, hasEventBeenEdited })

watch(startOnMonday, () => {
  localStorage.setItem("startCalendarOnMonday", String(startOnMonday.value))
})

watch(
  () => props.isDialogOpen,
  (newVal) => {
    if (newVal) {
      if (props.edit) {
        resetToEventData()
      } else {
        reset()
      }
    }
  },
)
</script>

<style scoped src="./schedule_overlap/ScheduleOverlapCompactSwitch.css"></style>

<style>
.email-me-after-text-field input {
  padding: 0px;
}

.editor-dow-toggle {
  display: grid;
  grid-template-columns: repeat(7, minmax(0, 1fr));
  width: 100%;
  gap: 0;
  padding: 4px;
  border: 1px solid var(--timeful-weekday-segment-border);
  border-radius: 12px;
  background-color: var(--timeful-weekday-segment-surface);
  overflow: hidden;
}

.editor-dow-button {
  min-width: 0;
  width: 100%;
  border-radius: 8px;
  color: var(--timeful-weekday-segment-foreground);
}

.editor-dow-button + .editor-dow-button {
  border-left: 1px solid var(--timeful-weekday-segment-border);
}

.editor-dow-button--selected {
  background-color: var(--timeful-selection-bg);
  color: var(--timeful-selection-fg);
}

.new-event-dow-toggle :deep(.v-btn) {
  min-width: 0;
  width: 100%;
  padding-inline: 0;
  text-transform: none;
  letter-spacing: 0;
  box-shadow: none;
}

.new-event-dow-toggle :deep(.v-btn__overlay) {
  opacity: 0;
}

.new-event-submit-button .v-btn__content,
.new-event-submit-button .v-progress-circular,
.new-event-submit-button .v-icon {
  color: inherit;
}

.new-event-submit-error {
  color: var(--timeful-error-foreground);
}

.advanced-options-panel {
  color: var(--timeful-muted-foreground);
  letter-spacing: 0.1px;
  line-height: 22px;
}

.new-event-form .v-checkbox .v-selection-control {
  --v-selection-control-size: 32px;
}

.compact-switch-grid {
  display: grid;
  grid-template-columns: auto minmax(0, 1fr);
  grid-template-rows: auto auto;
  column-gap: 0.35rem;
}

.compact-switch {
  grid-column: 1;
  grid-row: 1;
  align-self: center;
}

.compact-switch__label {
  grid-column: 2;
  grid-row: 1;
  align-self: center;
}

.compact-switch__message {
  grid-column: 2;
  grid-row: 2;
  margin-top: 2px;
}

.compact-switch :deep(.v-selection-control) {
  align-items: center;
}

.compact-switch :deep(.v-label) {
  display: none;
}

.compact-switch :deep(.v-selection-control__wrapper) {
  margin-top: 0;
}

.gated-feature-checkbox {
  --v-disabled-opacity: 1;
  opacity: 1;
}

.gated-feature-checkbox .v-selection-control {
  opacity: 1;
}

.gated-feature-checkbox .v-selection-control__input > .v-icon {
  color: var(--timeful-disabled-checkbox-icon);
  opacity: 1;
}

.gated-feature-checkbox .v-input__details,
.gated-feature-checkbox .v-messages,
.gated-feature-checkbox .v-messages__message {
  opacity: 1;
}

.advanced-options-disabled-label {
  color: var(--timeful-disabled-foreground);
}

.advanced-options-disabled-message {
  color: var(--timeful-muted-foreground);
  line-height: 16px;
}

.advanced-options-disabled-copy {
  color: var(--timeful-emphasis-foreground);
}

.advanced-options-sign-in-link {
  color: var(--timeful-selection-fg);
  cursor: pointer;
}
</style>

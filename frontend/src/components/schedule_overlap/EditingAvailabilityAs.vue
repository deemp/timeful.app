<template>
  <div
    class="editing-availability-as tw-flex tw-flex-wrap tw-items-baseline tw-gap-1 tw-text-sm tw-italic tw-text-dark-gray"
    :class="{
      'editing-availability-as--chip tw-not-italic': isChip,
    }"
  >
    <div
      v-if="isChip"
      class="editing-availability-as__chip-row tw-flex tw-flex-wrap tw-items-baseline tw-gap-1"
    >
      {{ editingAs.actionText }} availability as
      <button
        v-if="editingAs.editableGuestName !== null"
        type="button"
        class="editing-availability-as__guest-chip tw-flex tw-min-w-0 tw-max-w-full tw-grow tw-cursor-pointer tw-appearance-none tw-items-center tw-gap-1 tw-rounded tw-border tw-border-solid tw-border-outline-neutral tw-bg-white tw-px-2.5 tw-py-0.5 tw-text-left tw-text-sm tw-not-italic tw-text-dark-gray tw-shadow-none tw-transition-colors hover:tw-bg-light-gray"
        @click="emit('openEditGuestNameDialog')"
      >
        <span
          class="editing-availability-as__guest-name tw-min-w-0 tw-grow tw-break-words tw-font-medium"
          >{{ editingAs.editableGuestName || "Respondent name" }}</span
        >
        <v-icon small>mdi-pencil</v-icon>
      </button>
      <span v-else>{{ editingAs.actorName }}</span>
    </div>
    <template v-else>
      {{ editingAs.actionText }} availability as
      <div
        v-if="editingAs.editableGuestName !== null"
        class="editing-availability-as__guest tw-group tw-mt-0.5 tw-flex tw-w-fit tw-cursor-pointer tw-items-center tw-gap-1"
        @click="emit('openEditGuestNameDialog')"
      >
        <span class="tw-font-medium group-hover:tw-underline">{{
          editingAs.editableGuestName
        }}</span>
        <v-icon small>mdi-pencil</v-icon>
      </div>
      <span v-else>{{ editingAs.actorName }}</span>
    </template>
    <v-dialog
      :model-value="editGuestNameDialog"
      width="400"
      content-class="tw-m-0"
      @update:model-value="emit('update:editGuestNameDialog', $event)"
    >
      <v-card>
        <v-card-title>Edit guest name</v-card-title>
        <v-card-text>
          <v-text-field
            :model-value="newGuestName"
            label="Guest name (required)"
            :maxlength="GUEST_NAME_MAX_LENGTH"
            variant="outlined"
            class="timeful-invalid-field"
            :error-messages="guestNameErrorMessages"
            autofocus
            hide-details="auto"
            @update:model-value="emit('update:newGuestName', $event)"
            @blur="showSaveValidationError = true"
            @keydown.enter="saveIfValid"
          ></v-text-field>
        </v-card-text>
        <v-card-actions>
          <v-spacer />
          <v-btn
            variant="text"
            @click="emit('update:editGuestNameDialog', false)"
            >Cancel</v-btn
          >
          <v-btn variant="text" color="primary" @click="saveIfValid"
            >Save</v-btn
          >
        </v-card-actions>
      </v-card>
    </v-dialog>
  </div>
</template>

<script setup lang="ts">
import { computed, ref, watch } from "vue"
import {
  GUEST_NAME_MAX_LENGTH,
  getGuestNameValidationMessage,
  validateGuestName,
} from "@/utils/guestName"
import type { ScheduleOverlapEditingAvailabilityAsViewModel } from "./scheduleOverlapViewModelContracts"

const props = withDefaults(
  defineProps<{
    editingAs: ScheduleOverlapEditingAvailabilityAsViewModel
    editGuestNameDialog: boolean
    newGuestName: string
    variant?: "sentence" | "chip"
  }>(),
  {
    variant: "sentence",
  },
)

const isChip = computed(() => props.variant === "chip")

const emit = defineEmits<{
  openEditGuestNameDialog: []
  saveGuestName: []
  "update:newGuestName": [value: string]
  "update:editGuestNameDialog": [value: boolean]
}>()

const showSaveValidationError = ref(false)
const guestNameValidation = computed(() =>
  validateGuestName(props.newGuestName),
)
const guestNameValidationMessage = computed(() =>
  getGuestNameValidationMessage(guestNameValidation.value.code),
)
const guestNameErrorMessages = computed(() => {
  if (!guestNameValidationMessage.value) {
    return []
  }
  if (guestNameValidation.value.code === "required") {
    return [guestNameValidationMessage.value]
  }
  return showSaveValidationError.value ? [guestNameValidationMessage.value] : []
})

const saveIfValid = () => {
  if (!guestNameValidationMessage.value) {
    emit("saveGuestName")
    return
  }
  showSaveValidationError.value = true
}

watch(
  () => props.editGuestNameDialog,
  (isOpen) => {
    if (isOpen) {
      showSaveValidationError.value = false
    }
  },
)
</script>

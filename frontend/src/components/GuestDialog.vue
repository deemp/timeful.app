<template>
  <v-dialog
    :model-value="modelValue"
    width="400"
    content-class="tw-m-0"
    @update:model-value="(e) => emit('update:modelValue', e)"
  >
    <v-card>
      <v-card-title class="tw-flex">
        <div>Continue as guest</div>
        <v-spacer />
        <v-btn icon @click="emit('update:modelValue', false)">
          <v-icon>mdi-close</v-icon>
        </v-btn>
      </v-card-title>
      <v-card-text>
        <v-form
          ref="formRef"
          v-model="formValid"
          lazy-validation
          class="tw-flex tw-flex-col tw-gap-y-4"
          onsubmit="return false"
        >
          <v-text-field
            v-model="name"
            label="Guest name (required)"
            :maxlength="GUEST_NAME_MAX_LENGTH"
            variant="outlined"
            class="timeful-invalid-field"
            :error-messages="nameErrorMessages"
            append-inner-icon="mdi-alert-circle"
            autofocus
            hide-details="auto"
            @update:model-value="nameDirty = true"
            @keyup.enter="submit"
          ></v-text-field>
          <v-text-field
            v-if="event.collectEmails"
            v-model="email"
            :rules="emailRules"
            class="timeful-solo-field timeful-invalid-field"
            variant="solo"
            placeholder="Enter your email..."
            hint="The event creator has requested your email. It will only be visible to them."
            persistent-hint
            @keyup.enter="submit"
          ></v-text-field>
          <v-checkbox v-model="allowOthersToEdit" color="primary" hide-details>
            <template #label>
              <span
                class="tw-text-sm"
                :class="
                  allowOthersToEdit ? 'tw-text-black' : 'tw-text-very-dark-gray'
                "
              >
                Allow others to edit this availability
              </span>
            </template>
          </v-checkbox>
          <div class="tw-flex">
            <v-spacer />
            <v-btn
              class="timeful-flat-button tw-bg-green tw-text-white"
              :disabled="!canSubmit"
              @click="submit"
            >
              Continue
            </v-btn>
          </div>
        </v-form>
      </v-card-text>
    </v-card>
  </v-dialog>
</template>

<script setup lang="ts">
import { computed, ref, watch } from "vue"
import { validateEmail } from "@/utils"
import type { Event } from "@/types"
import {
  GUEST_NAME_MAX_LENGTH,
  getGuestNameValidationMessage,
  validateGuestName,
} from "@/utils/guestName"

type Rule = (val: string) => true | string

interface FormRef {
  validate: () => Promise<{ valid: boolean }> | boolean
  resetValidation: () => void
}

const props = defineProps<{
  modelValue: boolean
  event: Event
  respondents: string[]
}>()

const emit = defineEmits<{
  "update:modelValue": [value: boolean]
  submit: [payload: { name: string; email: string; allowOthersToEdit: boolean }]
}>()

const formValid = ref(false)
const name = ref("")
const nameDirty = ref(false)
const email = ref("")
const allowOthersToEdit = ref(false)
const validationRequested = ref(false)
const formRef = ref<FormRef | null>(null)
const validatedName = computed(() => validateGuestName(name.value))
const normalizedName = computed(() => validatedName.value.normalizedName)
const nameValidationMessage = computed(() =>
  getGuestNameValidationMessage(validatedName.value.code),
)
const isNameTaken = computed(
  () =>
    normalizedName.value != null &&
    props.respondents.includes(normalizedName.value),
)
const shouldShowNameValidation = computed(
  () => nameDirty.value || validationRequested.value,
)
const nameErrorMessages = computed<string[]>(() => {
  if (!shouldShowNameValidation.value) {
    return []
  }
  const messages: string[] = []
  if (nameValidationMessage.value) {
    messages.push(nameValidationMessage.value)
  }
  if (isNameTaken.value) {
    messages.push("Name already taken")
  }
  return messages
})
const emailRules = computed<Rule[]>(() => [
  (candidate) =>
    !validationRequested.value ||
    candidate.trim().length > 0 ||
    "Email is required",
  (candidate) =>
    !validationRequested.value || !!validateEmail(candidate) || "Invalid email",
])
const trimmedEmail = computed(() => email.value.trim())
const canSubmit = computed(
  () =>
    normalizedName.value != null &&
    (!props.event.collectEmails || trimmedEmail.value.length > 0),
)

const initializeForm = () => {
  name.value = ""
  nameDirty.value = false
  email.value = ""
  allowOthersToEdit.value = false
  validationRequested.value = false
  formRef.value?.resetValidation()
}

const submit = async () => {
  validationRequested.value = true
  const result = await formRef.value?.validate()
  const valid = typeof result === "boolean" ? result : result?.valid
  if (!valid) return
  if (nameErrorMessages.value.length > 0) return
  emit("submit", {
    name: normalizedName.value ?? "",
    email: trimmedEmail.value,
    allowOthersToEdit: allowOthersToEdit.value,
  })
}

watch(
  () => props.modelValue,
  (val) => {
    if (val) {
      initializeForm()
    }
  },
)
</script>

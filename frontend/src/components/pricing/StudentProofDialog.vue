<template>
  <v-dialog
    :model-value="modelValue"
    width="400"
    content-class="tw:m-0"
    @update:model-value="(e) => emit('update:modelValue', e)"
  >
    <v-card class="tw:rounded-lg tw:p-6 tw:pb-4 tw:sm:p-8 tw:sm:pb-4">
      <div class="tw:mb-4">
        <h2 class="tw:text-lg tw:font-medium">Student Verification</h2>
      </div>
      <p v-if="supportEmail" class="tw:mb-6 tw:text-sm tw:text-dark-gray">
        Please email
        <a
          :href="`mailto:${supportEmail}`"
          class="tw:font-medium tw:text-dark-green tw:underline"
          >{{ supportEmail }}</a
        >
        with proof that you are a student to get the discounted price. The
        subject of your email should be "Student Discount".
      </p>
      <p v-else class="tw:mb-6 tw:text-sm tw:text-dark-gray">
        Student verification is unavailable because support email is not
        configured.
      </p>
      <v-btn variant="text" block @click="emit('update:modelValue', false)"
        >OK</v-btn
      >
    </v-card>
  </v-dialog>
</template>

<script setup lang="ts">
import { supportEmail } from "@/utils/support"

defineProps<{
  modelValue: boolean
}>()

const emit = defineEmits<{
  "update:modelValue": [value: boolean]
}>()
</script>

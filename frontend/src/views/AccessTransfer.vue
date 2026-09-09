<template>
  <v-container class="tw:max-w-xl">
    <v-card title="Continue on this device">
      <v-card-text class="tw:flex tw:flex-col tw:gap-4">
        <p>
          Ask the source browser to approve this exact matching code within five
          minutes of creating the link. You have no transferred access until
          approval.
        </p>
        <p
          v-if="code"
          class="tw:text-3xl tw:font-bold"
          data-testid="matching-code"
        >
          {{ code }}
        </p>
        <v-alert v-if="error" type="info">{{ error }}</v-alert>
        <v-btn v-if="code" :loading="busy" @click="finish"
          >Continue after approval</v-btn
        >
      </v-card-text>
    </v-card>
  </v-container>
</template>
<script setup lang="ts">
import { onMounted, ref } from "vue"
import { transferAction } from "@/composables/transfer/transferBoundary"
const props = defineProps<{ eventId: string; transferId: string }>()
const code = ref("")
const error = ref("")
const busy = ref(false)
onMounted(async () => {
  try {
    code.value = (
      await transferAction(props.eventId, props.transferId, "open")
    ).code
  } catch {
    error.value =
      "This transfer is expired, cancelled, or unavailable. Ask the source browser for a new link."
  }
})
async function finish() {
  busy.value = true
  try {
    await transferAction(props.eventId, props.transferId, "redeem")
    window.location.assign(`/e/${props.eventId}`)
  } catch {
    error.value =
      "Access has not been approved for this code, or the transfer is no longer available."
  } finally {
    busy.value = false
  }
}
</script>

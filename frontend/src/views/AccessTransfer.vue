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
        <p v-if="approved" role="status">Approved — you can continue</p>
        <v-alert v-if="error" type="error">{{ error }}</v-alert>
        <v-btn v-if="code" :loading="busy" @click="finish()"
          >Continue after approval</v-btn
        >
      </v-card-text>
    </v-card>
    <v-dialog v-model="confirmSwitch" max-width="480" persistent>
      <v-card title="Switch accounts on this device?">
        <v-card-text>
          <p v-if="store.authUser">
            You are currently signed in as {{ store.authUser.firstName }}
            {{ store.authUser.lastName }} ({{ store.authUser.email }}).
          </p>
          <p>
            Continuing signs this browser in as the account that created the
            transfer, replacing your current sign-in. This does not merge
            accounts or make your current account another owner. Your current
            account's data and sign-ins on other devices stay intact, and you
            can sign back in.
          </p>
          <v-alert v-if="error" type="error">{{ error }}</v-alert>
        </v-card-text>
        <v-card-actions>
          <v-btn :disabled="busy" @click="confirmSwitch = false">Cancel</v-btn>
          <v-btn :loading="busy" @click="finish(true)">Switch accounts</v-btn>
        </v-card-actions>
      </v-card>
    </v-dialog>
  </v-container>
</template>
<script setup lang="ts">
import { onMounted, ref } from "vue"
import {
  requiresAccountSwitch,
  transferAction,
} from "@/composables/transfer/transferBoundary"
import { useMainStore } from "@/stores/main"
const props = defineProps<{ eventId: string; transferId: string }>()
const store = useMainStore()
const code = ref("")
const approved = ref(false)
const confirmSwitch = ref(false)
const error = ref("")
const busy = ref(false)
onMounted(async () => {
  try {
    const transfer = await transferAction(
      props.eventId,
      props.transferId,
      "open",
    )
    code.value = transfer.code
    approved.value = transfer.state === "approved"
  } catch {
    error.value =
      "This transfer is expired, cancelled, or unavailable. Ask the source browser for a new link."
  }
})
async function finish(confirmAccountSwitch = false) {
  if (busy.value) return
  busy.value = true
  error.value = ""
  try {
    await transferAction(
      props.eventId,
      props.transferId,
      "redeem",
      confirmAccountSwitch ? { confirmAccountSwitch: true } : undefined,
    )
    window.location.assign(`/e/${props.eventId}`)
  } catch (cause) {
    if (requiresAccountSwitch(cause)) {
      confirmSwitch.value = true
      return
    }
    error.value =
      "Access has not been approved for this code, or the transfer is no longer available."
  } finally {
    busy.value = false
  }
}
</script>

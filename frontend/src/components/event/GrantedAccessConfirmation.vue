<template>
  <v-dialog :model-value="Boolean(current)" max-width="480" persistent>
    <v-card title="Keep transferred responses with your account?">
      <v-card-text>
        Associate the source visitor's responses for event {{ current }} with
        your signed-in account for recovery on other browsers? Their ownership
        stays with the source visitor. This does not associate event ownership.
        <v-alert v-if="error" type="error">{{ error }}</v-alert>
      </v-card-text>
      <v-card-actions>
        <v-btn :disabled="busy" @click="dismiss">Not now</v-btn>
        <v-btn :loading="busy" @click="confirm">Confirm association</v-btn>
      </v-card-actions>
    </v-card>
  </v-dialog>
</template>
<script setup lang="ts">
import { computed, ref, watch } from "vue"
import { useRoute } from "vue-router"
import { useMainStore } from "@/stores/main"
import { browserEventVisitorIdentities } from "@/composables/event/visitorIdentityStorage"
import { grantAssociation } from "@/composables/transfer/transferBoundary"

const store = useMainStore()
const route = useRoute()
const pending = ref<string[]>([])
const current = computed(() => pending.value[0])
const busy = ref(false)
const error = ref("")
const dismissed = new Set<string>()

watch(
  () => [store.authUser?._id, route.params.eventId],
  async ([userId], previous, onCleanup) => {
    let stale = false
    onCleanup(() => {
      stale = true
    })
    if (userId !== previous?.[0]) {
      pending.value = []
      dismissed.clear()
    }
    if (!userId) return
    const ids = new Set(
      browserEventVisitorIdentities().map(({ eventId }) => eventId),
    )
    if (
      typeof route.params.eventId === "string" &&
      /^[0-9A-HJKMNP-TV-Z]{8}$/.test(route.params.eventId)
    )
      ids.add(route.params.eventId)
    for (const id of ids) {
      if (dismissed.has(id) || pending.value.includes(id)) continue
      try {
        const state = await grantAssociation(id)
        if (stale) return
        if (state.confirmationRequired) pending.value.push(id)
      } catch {
        // A missing event or stale browser record does not block sign-in.
      }
    }
  },
  { immediate: true },
)
function dismiss() {
  if (current.value) dismissed.add(current.value)
  pending.value.shift()
  error.value = ""
}
async function confirm() {
  if (!current.value || busy.value) return
  busy.value = true
  try {
    await grantAssociation(current.value, true)
    dismiss()
  } catch {
    error.value =
      "Association unavailable. The source may have revoked this access."
  } finally {
    busy.value = false
  }
}
</script>

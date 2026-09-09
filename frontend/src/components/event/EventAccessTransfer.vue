<template>
  <template v-if="event.eventVisitorId && event._id">
    <v-btn variant="outlined" @click="openDialog"
      >Continue on another device</v-btn
    >
    <v-dialog v-model="dialog" max-width="540">
      <v-card title="Continue on another device">
        <v-card-text class="tw:flex tw:flex-col tw:gap-4">
          <p>
            Open the link on your other browser. Within five minutes, enter the
            matching code shown there and approve it here. Opening the link
            alone gives no access.
          </p>
          <p v-if="store.authUser">
            This signs the other browser in to your account.
          </p>
          <p v-else>
            This grants access to your responses and, if you own this event, its
            owner controls. You can revoke granted access here.
          </p>
          <v-alert v-if="error" type="error">{{ error }}</v-alert>
          <v-btn :disabled="busy" @click="start">Create transfer link</v-btn>
          <template v-if="currentId">
            <v-text-field label="Transfer link" :model-value="link" readonly />
            <v-btn @click="copy">{{
              copied ? "Copied" : "Copy transfer link"
            }}</v-btn>
            <p role="status">
              Transfer status: {{ current?.state ?? "pending" }}
            </p>
            <template v-if="current?.state === 'pending'">
              <v-text-field
                v-model="code"
                label="Matching code from other browser"
                autocomplete="off"
              />
              <v-btn :disabled="busy || !code" @click="approve"
                >Approve matching code</v-btn
              >
              <v-btn :disabled="busy" @click="cancel">Cancel transfer</v-btn>
            </template>
          </template>
          <div
            v-for="id in history"
            :key="id"
            class="tw:flex tw:items-center tw:gap-2"
          >
            <span>Granted access {{ history.indexOf(id) + 1 }}</span>
            <v-btn :disabled="busy" @click="revoke(id)">Revoke access</v-btn>
          </div>
        </v-card-text>
        <v-card-actions
          ><v-btn @click="dialog = false">Close</v-btn></v-card-actions
        >
      </v-card>
    </v-dialog>
  </template>
</template>
<script setup lang="ts">
import { computed, onUnmounted, ref, watch } from "vue"
import type { Event } from "@/types"
import { useMainStore } from "@/stores/main"
import {
  createTransfer,
  transferAction,
  matchingRequest,
  rememberTransfer,
  savedTransfers,
  type AccessTransfer,
} from "@/composables/transfer/transferBoundary"

const props = defineProps<{ event: Event }>()
const store = useMainStore()
const dialog = ref(false)
const busy = ref(false)
const error = ref("")
const copied = ref(false)
const currentId = ref("")
const current = ref<AccessTransfer>()
const code = ref("")
const history = ref<string[]>([])
const link = computed(
  () =>
    `${window.location.origin}/transfer/${props.event._id}/${currentId.value}`,
)
let timer: ReturnType<typeof setInterval> | undefined

async function run(action: () => Promise<void>, clearError = true) {
  if (busy.value) return
  busy.value = true
  if (clearError) error.value = ""
  try {
    await action()
  } catch {
    error.value =
      "Transfer unavailable, expired, or unauthorized. Check the code or create a new link."
  } finally {
    busy.value = false
  }
}
async function refresh() {
  const eventId = props.event._id
  if (!eventId) return
  if (currentId.value)
    current.value = await transferAction(eventId, currentId.value, "status")
  const ids = savedTransfers(eventId)
  const states = await Promise.all(
    ids.map(async (id) => {
      try {
        return {
          id,
          revocable: (await transferAction(eventId, id, "status")).revocable,
        }
      } catch {
        return { id, revocable: false }
      }
    }),
  )
  history.value = states
    .filter(({ revocable }) => revocable)
    .map(({ id }) => id)
}
function openDialog() {
  dialog.value = true
  void run(refresh)
}
async function start() {
  await run(async () => {
    if (!props.event._id) return
    current.value = await createTransfer(props.event._id)
    currentId.value = current.value.id
    rememberTransfer(props.event._id, currentId.value)
    code.value = ""
    copied.value = false
  })
}
async function copy() {
  await run(async () => {
    await navigator.clipboard.writeText(link.value)
    copied.value = true
  })
}
async function approve() {
  await run(async () => {
    if (!props.event._id) return
    await refresh()
    const request = current.value && matchingRequest(current.value, code.value)
    if (!request) throw new Error("No matching target")
    current.value = await transferAction(
      props.event._id,
      currentId.value,
      "approve",
      { requestId: request.id, code: request.code },
    )
  })
}
async function cancel() {
  await run(async () => {
    if (props.event._id) {
      await transferAction(props.event._id, currentId.value, "cancel")
      await refresh()
    }
  })
}
async function revoke(id: string) {
  await run(async () => {
    if (props.event._id) {
      await transferAction(props.event._id, id, "revoke")
      await refresh()
    }
  })
}
watch(dialog, (open) => {
  if (timer) clearInterval(timer)
  if (open)
    timer = setInterval(() => {
      if (!busy.value) void run(refresh, false)
    }, 2000)
})
onUnmounted(() => {
  if (timer) clearInterval(timer)
})
</script>

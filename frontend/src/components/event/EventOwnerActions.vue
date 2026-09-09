<template>
  <template v-if="event.eventVisitorId && event.canManageEvent">
    <v-btn variant="outlined" :disabled="busy" @click="toggleArchive">
      {{ event.isArchived ? "Unarchive event" : "Archive event" }}
    </v-btn>
    <v-btn
      variant="outlined"
      color="error"
      :disabled="busy"
      @click="confirmDelete = true"
    >
      Delete event
    </v-btn>
    <v-dialog v-model="confirmDelete" max-width="420">
      <v-card title="Delete event?">
        <v-card-text
          >The event link and all responses will become
          inaccessible.</v-card-text
        >
        <v-card-actions>
          <v-btn :disabled="busy" @click="confirmDelete = false">Cancel</v-btn>
          <v-btn color="error" :loading="busy" @click="deleteEvent"
            >Delete</v-btn
          >
        </v-card-actions>
      </v-card>
    </v-dialog>
  </template>
</template>

<script setup lang="ts">
import { ref } from "vue"
import type { Event } from "@/types"
import { archiveEvent } from "@/utils/services/EventService"
import { _delete } from "@/utils/fetch_utils"
import { useMainStore } from "@/stores/main"

const props = defineProps<{ event: Event }>()
const emit = defineEmits<{ changed: []; deleted: [] }>()
const store = useMainStore()
const busy = ref(false)
const confirmDelete = ref(false)

async function toggleArchive() {
  if (!props.event._id || !props.event.canManageEvent || busy.value) return
  busy.value = true
  try {
    await archiveEvent(props.event._id, !props.event.isArchived)
    emit("changed")
  } catch {
    store.showError(
      "Could not update the event. Refresh the page and try again.",
    )
  } finally {
    busy.value = false
  }
}

async function deleteEvent() {
  if (!props.event._id || !props.event.canManageEvent || busy.value) return
  busy.value = true
  try {
    await _delete(`/events/${props.event._id}`)
    confirmDelete.value = false
    emit("deleted")
  } catch {
    store.showError(
      "Could not delete the event. Refresh the page and try again.",
    )
  } finally {
    busy.value = false
  }
}
</script>

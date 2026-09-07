<!-- Displays an event type (i.e. created or joined) on the home page -->
<template>
  <div class="tw:mb-5">
    <div
      class="tw:flex tw:flex-row tw:items-center tw:justify-between tw:text-xl tw:font-medium tw:text-dark-green tw:sm:text-2xl"
    >
      <div class="tw:flex tw:flex-col">
        {{ eventType.header }}
      </div>
      <v-btn
        v-if="isCreatedEventsSection"
        variant="text"
        class="tw:hidden tw:text-very-dark-gray tw:sm:block"
        @click="openFolderFeedbackDialog"
      >
        <v-icon class="tw:mr-2 tw:text-lg">mdi-folder-plus</v-icon>
        New folder
      </v-btn>
      <div
        v-if="hasOverflowEvents"
        class="tw:mt-2 tw:cursor-pointer tw:text-sm tw:font-normal tw:text-very-dark-gray tw:sm:hidden"
        @click="toggleShowAll"
      >
        Show {{ showAllLabel
        }}<v-icon :class="showAll && 'tw:rotate-180'">mdi-chevron-down</v-icon>
      </div>
    </div>

    <div
      v-if="eventType.events.length === 0"
      class="tw:my-3 tw:text-very-dark-gray"
    >
      {{ emptyText.length > 0 ? emptyText : "No events yet!" }}
    </div>
    <div
      v-else
      class="tw:my-3 tw:grid tw:grid-cols-1 tw:gap-3 tw:sm:grid-cols-2 tw:lg:grid-cols-3"
    >
      <EventItem
        v-for="(event, i) in visibleEvents"
        :key="i"
        class="tw:cursor-pointer"
        :event="event"
      />
    </div>
    <!-- Show more events sections -->
    <div v-if="hasOverflowEvents">
      <v-expand-transition>
        <div
          v-if="showAll"
          class="tw:my-3 tw:grid tw:grid-cols-1 tw:gap-3 tw:sm:grid-cols-2 tw:lg:grid-cols-3"
        >
          <EventItem
            v-for="(event, i) in overflowEvents"
            :key="i"
            class="tw:cursor-pointer"
            :event="event"
          />
        </div>
      </v-expand-transition>
      <div
        class="tw:mt-4 tw:hidden tw:cursor-pointer tw:text-sm tw:text-very-dark-gray tw:sm:block"
        @click="toggleShowAll"
      >
        Show {{ showAllLabel
        }}<v-icon :class="showAll && 'tw:rotate-180'">mdi-chevron-down</v-icon>
      </div>
    </div>
    <FeatureNotReadyDialog v-model="showFeatureNotReadyDialog" />
  </div>
</template>

<script setup lang="ts">
import { computed, ref } from "vue"
import { useDisplay } from "vuetify"
import EventItem from "@/components/EventItem.vue"
import FeatureNotReadyDialog from "@/components/FeatureNotReadyDialog.vue"
import { posthog } from "@/plugins/posthog"
import type { Event } from "@/types"

const props = withDefaults(
  defineProps<{
    eventType: { header: string; events: Event[] }
    emptyText?: string
  }>(),
  { emptyText: "" },
)

const display = useDisplay()
const showFeatureNotReadyDialog = ref(false)
const showAll = ref(false)

const defaultNumEventsToShow = computed(() => (display.lgAndUp.value ? 6 : 4))
const sortedEvents = computed(() => props.eventType.events)
const isCreatedEventsSection = computed(
  () => props.eventType.header === "Events I created",
)
const hasOverflowEvents = computed(
  () => props.eventType.events.length > defaultNumEventsToShow.value,
)
const visibleEvents = computed(() =>
  sortedEvents.value.slice(0, defaultNumEventsToShow.value),
)
const overflowEvents = computed(() =>
  sortedEvents.value.slice(defaultNumEventsToShow.value),
)
const showAllLabel = computed(() => (showAll.value ? "less" : "more"))

const toggleShowAll = () => {
  showAll.value = !showAll.value
}
const openFolderFeedbackDialog = () => {
  showFeatureNotReadyDialog.value = true
  posthog.capture("create_folder_clicked")
}
</script>

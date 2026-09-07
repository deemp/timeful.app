<template>
  <div class="tw:space-y-8 tw:p-6">
    <section id="event-description-preview-fixture" class="tw:max-w-xl">
      <h1 class="tw:text-xl tw:font-semibold">Event description preview</h1>
      <EventDescription :event="previewEvent" />
    </section>

    <section id="event-description-empty-fixture" class="tw:max-w-xl">
      <h2 class="tw:text-xl tw:font-semibold">Empty event description</h2>
      <EventDescription :event="emptyEvent" />
    </section>
  </div>
</template>

<script setup lang="ts">
import { Temporal } from "temporal-polyfill"
import EventDescription from "@/components/event/EventDescription.vue"
import { durations, eventTypes, UTC } from "@/constants"
import type { Event } from "@/types"

const makeFixtureEvent = (description?: string): Event => ({
  _id: `fixture-${description ? "preview" : "edit"}`,
  ownerId: "owner-1",
  name: "Fixture event",
  type: eventTypes.SPECIFIC_DATES,
  duration: durations.ONE_HOUR,
  dates: [Temporal.PlainDate.from("2026-05-18")],
  timeSeed: Temporal.Instant.from("2026-05-18T12:00:00Z").toZonedDateTimeISO(
    UTC,
  ),
  description,
})

const previewEvent = makeFixtureEvent("First line\nSecond line")
const emptyEvent = makeFixtureEvent()

defineOptions({ name: "AppTest" })
</script>

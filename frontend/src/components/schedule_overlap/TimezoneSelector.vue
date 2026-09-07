<template>
  <div
    id="timezone-select-container"
    :class="[
      'tw:flex tw:min-w-0 tw:items-center tw:text-[rgba(0,0,0,0.6)]',
      compact && !fitContent && 'tw:w-full',
      fixedWidth && 'tw:w-28',
      fitContent && 'tw:max-w-full',
    ]"
  >
    <div
      :class="[
        'timezone-select__field-row tw:flex tw:min-w-0 tw:items-center',
        (compact && !fitContent) || fixedWidth ? 'tw:flex-1' : '',
      ]"
    >
      <v-btn
        v-if="showReset && modified && !compact"
        icon
        color="primary"
        variant="text"
        class="timezone-select__reset-button"
        @mousedown.stop.prevent
        @pointerdown.stop.prevent
        @click.stop="emit('reset')"
      >
        <UndoIcon />
      </v-btn>
      <v-select
        id="timezone-select"
        :model-value="selectedTimezoneValue"
        :items="visibleTimezoneItems"
        data-testid="timezone-select-trigger"
        :class="[
          fieldVariant === 'solo'
            ? 'timeful-solo-field'
            : 'compact-inline-select tw:z-20 tw:-mt-px tw:min-w-0 tw:text-sm tw:text-black',
          fieldVariant === 'solo' &&
            compactButton &&
            'timezone-select--compact-button',
          (compact && !fitContent) || fixedWidth
            ? 'tw:w-full tw:flex-1'
            : fitContent
              ? 'tw:w-auto tw:flex-initial'
              : 'tw:w-40 tw:sm:w-44 tw:md:w-64',
          compact && !fixedWidth && 'timezone-select--compact',
        ]"
        :menu-props="{ width: 520 }"
        color="#219653"
        :density="
          fieldVariant === 'solo' && compactButton
            ? 'compact'
            : fieldVariant === 'solo'
              ? 'default'
              : 'compact'
        "
        item-color="green"
        hide-details
        item-title="title"
        item-value="value"
        :single-line="fieldVariant !== 'solo'"
        :variant="fieldVariant"
        @update:model-value="onChangeValue"
      >
        <template #item="{ item: internalItem, props: itemProps }">
          <v-list-item
            v-bind="stripGeneratedTitle(itemProps)"
            class="timezone-select__item"
            data-testid="timezone-select-option"
            :data-timezone-value="getTimezoneFromSelectItem(internalItem).value"
            :class="{
              'timezone-select__item--active':
                getTimezoneFromSelectItem(internalItem).value ===
                selectedTimezoneValue,
            }"
          >
            <v-list-item-title class="timezone-select__item-title">
              {{ formatTimezoneSelectItemLabel(internalItem) }}
            </v-list-item-title>
          </v-list-item>
        </template>
        <template #selection="{ item }">
          <div
            class="timezone-select__selection-text v-select__selection v-select__selection--comma"
          >
            {{ selectedTimezoneLabel(item) }}
          </div>
        </template>
      </v-select>
      <v-btn
        v-if="showReset && modified && compact"
        icon
        size="32"
        variant="outlined"
        class="timezone-select__reset-button timezone-select__reset-button--right"
        @mousedown.stop.prevent
        @pointerdown.stop.prevent
        @click.stop="emit('reset')"
      >
        <UndoIcon />
      </v-btn>
    </div>
  </div>
</template>

<script setup lang="ts">
import { computed } from "vue"
import { Temporal } from "temporal-polyfill"
import UndoIcon from "@/components/icons/UndoIcon.vue"
import type { Timezone } from "@/composables/schedule_overlap/types"
import {
  normalizeTimezone,
  buildTimezonesForReferenceDate,
  formatTimezoneOffsetShort,
} from "@/utils/timezone_utils"

interface TimezoneSelectItem {
  title: string
  value: string
  timezone: Timezone
}

const props = withDefaults(
  defineProps<{
    modelValue: Timezone
    modified?: boolean
    referenceDate?: Temporal.ZonedDateTime | null
    compact?: boolean
    fieldVariant?: "underlined" | "solo"
    compactButton?: boolean
    fitContent?: boolean
    fixedWidth?: boolean
    showReset?: boolean
  }>(),
  {
    modified: false,
    referenceDate: null,
    compact: false,
    fieldVariant: "underlined",
    compactButton: false,
    fitContent: false,
    fixedWidth: false,
    showReset: true,
  },
)

const emit = defineEmits<{
  "update:modelValue": [value: Timezone]
  reset: []
}>()

const effectiveReferenceDate = computed(() => {
  const refDate = props.referenceDate ?? Temporal.Now.zonedDateTimeISO()
  return refDate
})

function formatTimezoneTitle(timezone: Timezone): string {
  return `${timezone.gmtString} ${timezone.label}`.trim()
}

function isTimezoneSelectItem(
  item: TimezoneSelectItem | Timezone,
): item is TimezoneSelectItem {
  return "timezone" in item
}

function getTimezoneFromSelectItem(
  item: TimezoneSelectItem | Timezone,
): Timezone {
  return isTimezoneSelectItem(item) ? item.timezone : item
}

function formatTimezoneSelectItemLabel(
  item: TimezoneSelectItem | Timezone,
): string {
  return formatTimezoneTitle(getTimezoneFromSelectItem(item))
}

function selectedTimezoneLabel(item: TimezoneSelectItem | Timezone): string {
  return props.compact
    ? formatTimezoneOffsetShort(getTimezoneFromSelectItem(item).gmtString)
    : formatTimezoneSelectItemLabel(item)
}

function toTimezoneSelectItem(timezone: Timezone): TimezoneSelectItem {
  const normalizedTimezone = normalizeTimezone(timezone)

  return {
    title: formatTimezoneTitle(normalizedTimezone),
    value: normalizedTimezone.value,
    timezone: normalizedTimezone,
  }
}

function stripGeneratedTitle(
  itemProps: Record<string, unknown>,
): Record<string, unknown> {
  const { title: _title, ...rest } = itemProps
  return rest
}

const timezones = computed<Timezone[]>(() => {
  return buildTimezonesForReferenceDate(effectiveReferenceDate.value)
})

const timezoneItems = computed<TimezoneSelectItem[]>(() =>
  timezones.value.map((timezone) => toTimezoneSelectItem(timezone)),
)

const selectedTimezoneValue = computed(() => {
  if (
    !props.modelValue.value &&
    !(props.modelValue.offset instanceof Temporal.Duration)
  ) {
    return undefined
  }

  return normalizeTimezone(props.modelValue).value
})

const visibleTimezoneItems = computed<TimezoneSelectItem[]>(() => {
  const currentValue = selectedTimezoneValue.value
  if (!currentValue) {
    return timezoneItems.value
  }

  if (timezoneItems.value.some((item) => item.value === currentValue)) {
    return timezoneItems.value
  }

  return [toTimezoneSelectItem(props.modelValue), ...timezoneItems.value]
})

function onChange(val: Timezone) {
  const normalizedTimezone = normalizeTimezone(val)
  emit("update:modelValue", normalizedTimezone)
}

function onChangeValue(val: string | null) {
  if (!val) {
    return
  }

  const matchedTimezone = visibleTimezoneItems.value.find(
    (timezone) => timezone.value === val,
  )?.timezone
  if (!matchedTimezone) {
    return
  }

  onChange(matchedTimezone)
}
</script>

<style scoped>
.timezone-select--compact-button {
  --v-field-padding-top: 0px;
  --v-field-padding-bottom: 0px;
}

.timezone-select--compact-button :deep(.v-field) {
  min-height: 32px;
  height: 32px;
  filter: none;
  box-shadow: none;
  border: 1px solid var(--timeful-outline-neutral);
}

.timezone-select--compact-button :deep(.v-field__input) {
  align-items: center;
  min-height: 32px;
  padding-top: 0;
  padding-bottom: 0;
  font-size: 0.875rem;
  font-weight: 500;
}

.timezone-select--compact-button :deep(.v-select__selection-text) {
  color: rgb(0, 0, 0);
  font-family: inherit;
  font-size: 0.875rem;
  font-weight: 500;
}

.timezone-select--compact-button :deep(.v-field__append-inner) {
  align-self: center;
  padding-top: 0;
  padding-bottom: 0;
}

.timezone-select--compact-button :deep(.v-field) {
  --v-field-padding-start: 8px;
  padding-inline-end: 2px;
}

.timezone-select--compact-button :deep(.v-field.v-field--appended) {
  --v-field-padding-end: 2px;
}

.timezone-select--compact,
.timezone-select--compact :deep(.v-field) {
  width: max-content;
  max-width: 100%;
}

.compact-inline-select:not(.timeful-solo-field) {
  --v-input-control-height: 26px;
  --v-field-padding-top: 0px;
  --v-field-padding-bottom: 0px;
  --v-field-padding-start: 0px;
  --v-field-padding-end: 0px;
  min-width: 0;
}

.compact-inline-select,
.compact-inline-select:deep(.v-input),
.compact-inline-select :deep(.v-input),
.compact-inline-select :deep(.v-field),
.compact-inline-select :deep(.v-field__input),
.compact-inline-select :deep(.v-select__selection),
.compact-inline-select :deep(.v-select__selection-text) {
  letter-spacing: normal;
}

.compact-inline-select:deep(.v-input),
.compact-inline-select :deep(.v-input),
.compact-inline-select :deep(.v-field),
.compact-inline-select :deep(.v-field__field),
.compact-inline-select :deep(.v-select__selection),
.compact-inline-select :deep(.v-select__selection-text) {
  min-width: 0;
}

.compact-inline-select:not(.timeful-solo-field) :deep(.v-field) {
  background: transparent;
  border: 0;
  border-radius: 0;
  font-size: 0.875rem;
}

.compact-inline-select
  :deep(.v-field--variant-underlined .v-field__outline::before) {
  border-bottom-color: var(--timeful-grid-line-color);
}

.compact-inline-select:not(.timeful-solo-field) :deep(.v-field__input) {
  flex-wrap: nowrap;
  min-width: 0;
  overflow: hidden;
  padding-inline: 0;
  padding-bottom: 0;
  padding-top: 0;
}

.compact-inline-select :deep(.v-select__selection) {
  display: block;
  flex: 1 1 0%;
  max-width: 100%;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}

.compact-inline-select:not(.timeful-solo-field) :deep(.v-field__append-inner) {
  align-items: center;
  align-self: center;
  display: flex;
  height: 26px;
  min-height: 26px;
  padding-inline-start: 4px;
  padding-bottom: 0;
  padding-top: 0;
}

.compact-inline-select :deep(.v-select__selection-text) {
  display: block;
  max-width: 100%;
  line-height: 22px;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}

.compact-inline-select :deep(.v-field__overlay) {
  opacity: 0;
}

.compact-inline-select :deep(.v-select__menu-icon) {
  order: 1;
}

.timezone-select__field-row {
  gap: 2px;
}

.timezone-select__reset-button {
  margin-inline-end: -2px;
}

.timezone-select__reset-button--right {
  border-color: var(--timeful-outline-neutral);
  border-radius: 0.375rem;
  color: rgb(0, 0, 0);
  height: 32px;
  margin-inline-end: 0;
  min-width: 32px;
  width: 32px;
}

.timezone-select__item {
  min-height: 48px;
}

.timezone-select__item-title {
  color: rgba(0, 0, 0, 0.87);
}

.timezone-select__item--active {
  background-color: var(--timeful-selection-bg);
}

.timezone-select__item--active :deep(.timezone-select__item-title) {
  color: var(--timeful-selection-fg);
}
</style>

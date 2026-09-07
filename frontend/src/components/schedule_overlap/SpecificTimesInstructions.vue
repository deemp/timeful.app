<template>
  <div class="tw:flex tw:flex-col tw:gap-4 tw:pr-2 tw:lg:pr-0">
    <div
      class="specific-times-instructions__guidance tw:text-sm tw:italic tw:text-dark-gray"
    >
      Click and drag on the grid to select the potential meeting times
    </div>

    <slot />

    <div
      class="specific-times-instructions__legend tw:flex tw:flex-col tw:gap-1"
    >
      <div class="tw:text-sm tw:font-medium">Legend:</div>
      <div class="tw:flex tw:items-center tw:gap-2">
        <div
          class="specific-times-instructions-swatch specific-times-instructions-swatch--enabled tw:bg-light-gray-stroke"
        ></div>
        <span class="tw:text-sm">Selectable for the event</span>
      </div>
      <div class="tw:flex tw:items-center tw:gap-2">
        <div
          class="specific-times-instructions-swatch specific-times-instructions-swatch--potential tw:bg-white"
        ></div>
        <span class="tw:text-sm">Selected for the event</span>
      </div>
      <div class="tw:flex tw:items-start tw:gap-2">
        <div
          class="specific-times-instructions-swatch specific-times-instructions-swatch--disabled-padding tw:bg-gray"
        ></div>
        <span class="tw:text-sm"
          >Disabled, outside the event dates in the event timezone</span
        >
      </div>
    </div>
    <v-btn
      data-testid="specific-times-grid-next"
      color="primary"
      :disabled="numTempTimes === 0"
      @click="emit('saveTempTimes')"
    >
      Next
    </v-btn>
  </div>
</template>

<script setup lang="ts">
defineProps<{
  numTempTimes: number
}>()

const emit = defineEmits<{
  saveTempTimes: []
}>()
</script>

<style scoped>
.specific-times-instructions-swatch {
  flex: none;
  width: 1rem;
  height: 1rem;
  border-radius: 0.25rem;
}

.specific-times-instructions-swatch--potential {
  box-shadow: inset 0 0 0 1px var(--timeful-grid-separator-strong);
}

.specific-times-instructions-swatch--enabled {
  box-shadow: inset 0 0 0 1px var(--timeful-grid-separator-strong);
}

.specific-times-instructions-swatch--disabled-padding {
  box-shadow: inset 0 0 0 1px var(--timeful-grid-separator-strong);
}
</style>

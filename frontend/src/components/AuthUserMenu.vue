<!-- Displays auth user's avatar, which displays a menu when clicked -->
<template>
  <span>
    <v-menu v-if="authUser" offset-y left>
      <template #activator="{ props }">
        <v-btn
          id="user-menu-btn"
          icon
          :width="size"
          :height="size"
          v-bind="props"
        >
          <v-avatar :size="size">
            <UserAvatarContent :user="authUser" :size="size" />
          </v-avatar>
        </v-btn>
      </template>
      <v-list class="py-0" :density="isPhone ? 'compact' : 'default'">
        <v-list-item>
          <v-list-item-title>
            <strong>{{ `${authUser.firstName} ${authUser.lastName}` }}</strong>
          </v-list-item-title>
        </v-list-item>
        <v-list-item
          v-if="showFeedbackBtn"
          id="feedback-btn"
          :href="feedbackUrl"
          target="_blank"
        >
          <v-list-item-title class="tw:flex tw:items-center tw:gap-1">
            <v-icon class="tw:mr-1" small color="black">mdi-message</v-icon>
            Give feedback
          </v-list-item-title>
        </v-list-item>
        <v-list-item id="settings-btn" @click="goToSettings">
          <v-list-item-title class="tw:flex tw:items-center tw:gap-1">
            <v-icon class="tw:mr-1" small color="black">mdi-cog</v-icon>
            Settings
          </v-list-item-title>
        </v-list-item>
        <v-divider></v-divider>
        <v-list-item id="sign-out-btn" @click="signOut">
          <v-list-item-title class="red--text tw:flex tw:items-center tw:gap-1">
            <v-icon class="tw:mr-1" small color="red">mdi-logout</v-icon>
            Sign Out
          </v-list-item-title>
        </v-list-item>
      </v-list>
    </v-menu>
  </span>
</template>

<script setup lang="ts">
import { computed } from "vue"
import { useRouter, useRoute } from "vue-router"
import { storeToRefs } from "pinia"
import UserAvatarContent from "@/components/UserAvatarContent.vue"
import { useMainStore } from "@/stores/main"
import { post } from "@/utils"
import { feedbackUrl } from "@/utils/feedback"
import { useDisplayHelpers } from "@/utils/useDisplayHelpers"
import { posthog } from "@/plugins/posthog"

const router = useRouter()
const route = useRoute()
const mainStore = useMainStore()
const { authUser } = storeToRefs(mainStore)
const { isPhone } = useDisplayHelpers()

const size = computed(() => (isPhone.value ? 32 : 42))
const showFeedbackBtn = computed(() => !isPhone.value)

const signOut = async () => {
  await post("/auth/sign-out")
  mainStore.setAuthUser(null)
  posthog.reset()
  location.reload()
}
const goToSettings = () => {
  void router.replace({ name: "settings" })
}
</script>

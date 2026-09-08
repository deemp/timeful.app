<template>
  <v-app>
    <AutoSnackbar color="error" :text="error" />
    <AutoSnackbar color="tw:bg-blue" :text="info" />
    <SignInNotSupportedDialog v-model="webviewDialog" />
    <SignInDialog
      v-if="signInEnabled"
      v-model="signInDialog"
      @sign-in="_signIn"
      @email-sign-in="_emailSignIn"
    />
    <NewDialog
      v-model="newDialogOptions.show"
      :type="newDialogOptions.openNewGroup ? 'group' : 'event'"
      :contacts-payload="newDialogOptions.contactsPayload"
      :no-tabs="newDialogOptions.eventOnly"
      :folder-id="newDialogOptions.folderId"
    />
    <UpvoteRedditSnackbar />
    <div
      v-if="showHeader"
      data-testid="app-header"
      class="tw:fixed tw:z-60 tw:h-14 tw:w-screen tw:bg-white tw:sm:h-16"
      dark
    >
      <div
        class="tw:relative tw:m-auto tw:flex tw:h-full tw:max-w-5xl tw:items-center tw:justify-center tw:px-4"
      >
        <router-link :to="{ name: 'home' }">
          <Logo type="timeful" />
        </router-link>

        <v-spacer />

        <v-btn
          v-if="!authUser && signInEnabled"
          id="top-right-sign-in-btn"
          variant="text"
          @click="signIn"
        >
          Sign in
        </v-btn>
        <v-btn
          v-if="$route.name === 'event' && !isPhone"
          id="top-right-create-btn"
          variant="text"
          @click="() => _createNew(true)"
        >
          Create an event
        </v-btn>
        <v-btn
          v-if="showFeedbackBtn && !isPhone"
          id="feedback-btn"
          variant="text"
          :href="feedbackUrl"
          target="_blank"
          @click="trackFeedbackClick"
        >
          Give feedback
        </v-btn>
        <v-menu v-if="showMobileHeaderMenu" location="bottom end">
          <template #activator="{ props }">
            <v-btn
              id="mobile-header-menu-btn"
              variant="text"
              icon
              aria-label="Open navigation menu"
              v-bind="props"
            >
              <v-icon>mdi-menu</v-icon>
            </v-btn>
          </template>
          <v-list id="mobile-header-menu">
            <v-list-item
              id="mobile-header-create-btn"
              @click="_createNew(true)"
            >
              <v-list-item-title>Create an event</v-list-item-title>
            </v-list-item>
            <v-list-item
              id="mobile-header-feedback-btn"
              :href="feedbackUrl"
              target="_blank"
              @click="trackFeedbackClick"
            >
              <v-list-item-title>Give feedback</v-list-item-title>
            </v-list-item>
          </v-list>
        </v-menu>
        <v-tooltip
          v-if="showGitHubBtn"
          bottom
          content-class="tw:bg-very-dark-gray tw:shadow-lg tw:opacity-100"
        >
          <template #activator="{ props }">
            <v-btn
              variant="plain"
              icon
              class="tw:ml-1"
              v-bind="props"
              :href="gitHubRepoUrl"
              target="_blank"
              aria-label="GitHub"
            >
              <v-icon>mdi-github</v-icon>
            </v-btn>
          </template>
          <span>{{ gitHubRepoDisplay }}</span>
        </v-tooltip>
        <!-- <v-btn
          v-if="!isPhone"
          text
          href="https://www.paypal.com/donate/?hosted_button_id=KWCH6LGJCP6E6"
          target="_blank"
        >
          Donate
        </v-btn> -->
        <v-btn
          v-if="$route.name === 'home' && !isPhone"
          color="primary"
          class="tw:mx-2 tw:rounded-md"
          :style="{
            boxShadow: '0px 2px 8px 0px #00994C80',
          }"
          @click="() => _createNew()"
        >
          + Create new
        </v-btn>
        <div v-if="authUser" class="tw:sm:ml-4">
          <AuthUserMenu />
        </div>
      </div>
    </div>

    <v-main>
      <div class="tw:flex tw:h-screen tw:flex-col">
        <div
          class="tw:relative tw:flex-1 tw:overscroll-auto"
          :class="routerViewClass"
        >
          <router-view v-if="loaded" :key="$route.fullPath" />
        </div>
      </div>
    </v-main>
  </v-app>
</template>

<script setup lang="ts">
import { ref, computed, onMounted, onBeforeUnmount, watch } from "vue"
import { useRoute, useRouter } from "vue-router"
import { useHead } from "@unhead/vue"
import { storeToRefs } from "pinia"
import { getLocation, post, signInGoogle, signInOutlook } from "@/utils"
import { authTypes, calendarTypes } from "@/constants"
import isWebview from "is-ua-webview"
import { posthog } from "@/plugins/posthog"
import { useMainStore } from "@/stores/main"
import { getSignInRestoreQuery } from "@/router/authRestoreState"
import { feedbackUrl } from "@/utils/feedback"
import { gitHubRepoUrl } from "@/utils/github"
import { useDisplayHelpers } from "@/utils/useDisplayHelpers"
import type { User } from "@/types"
import { fetchAuthUserProfile } from "@/utils/services/UserService"
import { signInEnabled } from "@/utils/signInAvailability"
import AutoSnackbar from "@/components/AutoSnackbar.vue"
import AuthUserMenu from "@/components/AuthUserMenu.vue"
import Logo from "@/components/Logo.vue"
import NewDialog from "@/components/NewDialog.vue"
import SignInDialog from "@/components/SignInDialog.vue"
import SignInNotSupportedDialog from "@/components/SignInNotSupportedDialog.vue"
import UpvoteRedditSnackbar from "@/components/UpvoteRedditSnackbar.vue"

useHead({ htmlAttrs: { lang: "en-US" } })

const route = useRoute()
const router = useRouter()
const mainStore = useMainStore()
const { authUser, error, info, newDialogOptions } = storeToRefs(mainStore)
const { isPhone } = useDisplayHelpers()

const loaded = ref(false)
const webviewDialog = ref(false)
const signInDialog = ref(false)

const showHeader = computed(
  () =>
    route.name !== "auth" &&
    route.name !== "sign-in" &&
    route.name !== "sign-up" &&
    route.name !== "privacy-policy",
)

const showFeedbackBtn = computed(() => !isPhone.value || route.name === "home")
const showMobileHeaderMenu = computed(
  () => isPhone.value && (route.name === "event" || route.name === "landing"),
)
const showGitHubBtn = computed(
  () => !isPhone.value || route.name === "home" || route.name === "landing",
)
const gitHubRepoDisplay = computed(() => {
  try {
    const url = new URL(gitHubRepoUrl)
    return url.pathname.replace(/^\//, "")
  } catch {
    return "GitHub"
  }
})

const routerViewClass = computed(() => {
  if (!showHeader.value) return ""
  return isPhone.value ? "tw:pt-12 " : "tw:pt-14 "
})

function handleScroll() {
  // scrollY tracked externally if needed; kept for scroll listener lifecycle
}

function _createNew(eventOnly = false) {
  posthog.capture("create_new_button_clicked", { eventOnly })
  mainStore.createNew({ eventOnly })
}

function signIn() {
  if (!signInEnabled) {
    return
  }

  if (
    route.name === "event" ||
    route.name === "group" ||
    route.name === "signUp"
  ) {
    if (isWebview(navigator.userAgent)) {
      webviewDialog.value = true
      return
    }
    void router.push({ name: "sign-in", query: getSignInRestoreQuery(route) })
    return
  }
  void router.push({ name: "sign-in" })
}

function _signIn(calendarType: string) {
  if (!signInEnabled) {
    return
  }

  let state: Record<string, unknown> | undefined
  switch (route.name) {
    case "event":
      state = { eventId: route.params.eventId, type: authTypes.EVENT_SIGN_IN }
      break
    case "group":
      state = { groupId: route.params.groupId, type: authTypes.GROUP_SIGN_IN }
      break
    case "signUp":
      state = {
        signUpId: route.params.signUpId,
        type: authTypes.SIGN_UP_SIGN_IN,
      }
      break
    default:
      return
  }

  if (calendarType === calendarTypes.GOOGLE) {
    signInGoogle({ state, selectAccount: true })
  } else if (calendarType === calendarTypes.OUTLOOK) {
    signInOutlook({ state, selectAccount: true })
  }
}

function _emailSignIn(user: User) {
  mainStore.setAuthUser(user)
  posthog.identify(user._id, {
    email: user.email,
    firstName: user.firstName,
    lastName: user.lastName,
  })
  if (route.name === "landing") {
    void router.push({ name: "home" })
  }
}

function setFeatureFlags() {
  mainStore.setFeatureFlagsLoaded(true)
}

function trackFeedbackClick() {
  posthog.capture("give_feedback_button_clicked")
}

async function bootstrapApp() {
  await fetchAuthUserProfile()
    .then((u) => {
      mainStore.setAuthUser(u)
      posthog.identify(u._id, {
        email: u.email,
        firstName: u.firstName,
        lastName: u.lastName,
      })
    })
    .catch(() => {
      mainStore.setAuthUser(null)
    })
    .finally(() => {
      loaded.value = true
    })

  window.addEventListener("scroll", handleScroll)
  void mainStore.getEvents()
}

onMounted(() => {
  void bootstrapApp()
})

onBeforeUnmount(() => {
  window.removeEventListener("scroll", handleScroll)
})

watch(
  () => route.fullPath,
  async () => {
    const originalHref = window.location.href
    if (route.name) posthog.capture("$pageview")

    if (route.query.p) {
      let location = null
      try {
        location = await getLocation()
      } catch {
        // user probably has adblocker
      }
      void post("/analytics/scanned-poster", { url: originalHref, location })
    }
  },
  { immediate: true },
)

watch(
  authUser,
  () => {
    setFeatureFlags()
  },
  { immediate: true },
)
</script>

<style>
html {
  overflow-y: auto;
  /* overscroll-behavior: none; */
  scroll-behavior: smooth;
}

* {
  font-family: "DM Sans", sans-serif;
  /* touch-action: manipulation; */
}

.v-messages__message {
  font-size: 0.813rem;
  line-height: 1rem;
}

/** Buttons */
.v-btn {
  letter-spacing: unset;
  text-transform: unset;
}
.v-btn:not(.v-btn--icon, .v-btn-toggle > .v-btn).v-btn--size-default {
  height: 38px;
  border-radius: 0.375rem;
}
.v-menu__content {
  box-shadow:
    0px 5px 5px -1px rgba(0, 0, 0, 0.1),
    0px 8px 10px 0.5px rgba(0, 0, 0, 0.07),
    0px 3px 14px 1px rgba(0, 0, 0, 0.06);
}
.overlay-avail-shadow-green {
  box-shadow: 0px 3px 6px 0px #1c7d454d;
}
.overlay-avail-shadow-yellow {
  box-shadow: 0px 2px 8px 0px #e5a8004d;
}

.v-text-field__details {
  padding: 0;
}

/** Dialog interaction */
.v-dialog > .v-overlay__content {
  pointer-events: auto;
}
</style>

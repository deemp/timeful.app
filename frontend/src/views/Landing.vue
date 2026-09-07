<template>
  <div :class="['tw:relative tw:min-h-screen tw:bg-white']">
    <div
      v-if="!richLandingEnabled"
      data-test="minimal-viewport-band"
      class="tw:pointer-events-none tw:fixed tw:bottom-0 tw:left-0 tw:right-0 tw:top-[72vh] tw:bg-green"
    ></div>
    <div
      class="landing-page-shell tw:relative tw:z-10 tw:m-auto tw:mb-12 tw:flex tw:max-w-6xl tw:flex-col tw:px-4 tw:pt-2 tw:sm:mb-20 tw:sm:pt-3"
    >
      <div class="tw:flex tw:flex-col tw:items-center">
        <div class="landing-hero-copy tw:flex tw:flex-col tw:items-center">
          <div
            id="header"
            class="landing-hero-heading tw:text-center tw:font-medium"
          >
            <h1 class="landing-hero-heading-text">Find a time to meet</h1>
          </div>

          <div
            v-if="landingSignInEnabled"
            class="landing-hero-subtitle tw:text-center tw:text-very-dark-gray"
          >
            <br class="tw:hidden tw:sm:block" />
            Integrates with your
            <v-tooltip
              top
              content-class="tw:bg-very-dark-gray tw:shadow-lg tw:opacity-100"
            >
              <template #activator="{ props }">
                <span class="landing-calendar-link" v-bind="props"
                  >calendar</span
                >
              </template>
              <span
                >Timeful allows you to autofill your availability from Google
                Calendar,<br class="tw:hidden tw:sm:block" />
                Outlook, Apple Calendar, or an ICS feed URL.</span
              >
            </v-tooltip>
            .
          </div>
        </div>

        <div class="landing-hero-cta">
          <v-btn
            class="landing-primary-cta tw:block tw:self-center tw:rounded-lg tw:bg-green tw:text-base tw:text-white"
            large
            :x-large="display.mdAndUp"
            @click="authUser ? openDashboard() : (newDialog = true)"
          >
            {{ authUser ? "Open dashboard" : "Create event" }}
          </v-btn>
        </div>
        <div class="tw:relative tw:w-full">
          <!-- Green background -->
          <div
            v-if="richLandingEnabled"
            :class="[
              'tw:absolute tw:left-1/2 tw:w-screen tw:-translate-x-1/2 tw:bg-green',
              'tw:top-2/3 tw:h-[20vh] tw:sm:h-[75vh]',
            ]"
          ></div>

          <!-- Hero image -->
          <div
            class="tw:relative tw:z-20 tw:w-full tw:rounded-lg tw:border tw:border-outline-neutral tw:bg-white tw:shadow-[0_0_24px_rgba(0,0,0,0.15)] tw:sm:rounded-xl tw:md:mx-auto tw:md:w-fit"
          >
            <div class="tw:mx-4 tw:py-2 tw:md:w-[700px] tw:lg:w-[800px]">
              <v-img class="tw:size-full" :src="eventImage" contain />
            </div>
          </div>
        </div>
      </div>
    </div>

    <!-- Reddit Testimonials -->
    <div
      v-if="richLandingEnabled"
      class="tw:flex tw:justify-center tw:bg-light-gray tw:py-12"
    >
      <div class="tw:mx-4 tw:max-w-3xl tw:flex-1 tw:sm:mx-16">
        <div class="tw:text-center">
          <Header> People love us on Reddit! </Header>
          <div
            class="tw:mt-8 tw:grid tw:grid-cols-1 tw:gap-4 tw:sm:grid-cols-2"
          >
            <div
              v-for="(comment, index) in redditComments"
              :key="index"
              class="tw:flex tw:flex-col tw:rounded-lg tw:bg-white tw:p-4 tw:shadow-md"
              :class="{
                'tw:sm:col-span-2 tw:sm:mx-auto tw:sm:max-w-md':
                  redditComments.length % 2 !== 0 &&
                  index === redditComments.length - 1,
              }"
            >
              <div class="tw:flex tw:flex-1 tw:items-center">
                <div
                  class="reddit-comment tw:text-left tw:text-sm tw:text-very-dark-gray"
                >
                  <template
                    v-for="(paragraph, paragraphIndex) in comment.paragraphs"
                    :key="paragraphIndex"
                  >
                    <p
                      :class="{
                        'tw:mb-4':
                          paragraphIndex < comment.paragraphs.length - 1,
                      }"
                    >
                      <template
                        v-for="(part, partIndex) in paragraph"
                        :key="partIndex"
                      >
                        <span v-if="part.highlight" class="rdt-h">{{
                          part.text
                        }}</span>
                        <template v-else>{{ part.text }}</template>
                      </template>
                    </p>
                  </template>
                </div>
              </div>
              <div
                class="tw:my-4 tw:h-px tw:w-full tw:bg-light-gray-stroke"
              ></div>
              <div class="tw:flex tw:items-center tw:justify-between">
                <div class="tw:text-right">
                  <a
                    :href="comment.link"
                    target="_blank"
                    class="tw:text-sm tw:font-medium tw:text-dark-gray tw:hover:underline"
                  >
                    {{ comment.author }}
                  </a>
                </div>
                <div class="tw:flex tw:items-center tw:gap-2">
                  <v-avatar size="24">
                    <v-img :src="comment.picture" />
                  </v-avatar>
                </div>
              </div>
            </div>
          </div>
        </div>
      </div>
    </div>

    <!-- FAQ -->
    <div v-if="richLandingEnabled" class="tw:flex tw:justify-center tw:pt-12">
      <div class="tw:mx-4 tw:mb-12 tw:max-w-3xl tw:flex-1 tw:sm:mx-16">
        <div id="faq-section" class="tw:text-center tw:lg:pt-3">
          <Header> Frequently Asked Questions </Header>
          <div
            class="tw:grid tw:grid-cols-1 tw:gap-3 tw:sm:text-xl tw:lg:text-2xl"
          >
            <FAQ
              v-for="faq in faqs"
              :key="faq.question"
              v-bind="faq"
              :sign-in-enabled="signInEnabled"
              @sign-in="signIn"
            />
          </div>
        </div>
      </div>
    </div>

    <Footer v-if="richLandingEnabled" />

    <!-- Sign in dialog -->
    <SignInDialog
      v-if="landingSignInEnabled"
      v-model="signInDialog"
      @sign-in="_signIn"
      @email-sign-in="_emailSignIn"
    />

    <!-- New event dialog -->
    <NewDialog v-model="newDialog" no-tabs @sign-in="signIn" />
  </div>
</template>

<script setup lang="ts">
import { ref, watch } from "vue"
import { storeToRefs } from "pinia"
import { useHead } from "@unhead/vue"
import { useRouter } from "vue-router"
import { useDisplay } from "vuetify"
import { signInGoogle, signInOutlook } from "@/utils/sign_in_utils"
import FAQ from "@/components/FAQ.vue"
import Header from "@/components/Header.vue"
import NewDialog from "@/components/NewDialog.vue"
import SignInDialog from "@/components/SignInDialog.vue"
import { calendarTypes } from "@/constants"
import Footer from "@/components/Footer.vue"
import { useMainStore } from "@/stores/main"
import { posthog } from "@/plugins/posthog"
import { richLandingEnabled } from "@/utils/landingAvailability"
import { signInEnabled } from "@/utils/signInAvailability"
import eventImage from "@/assets/demo/event.webp"
import type { User } from "@/types"

defineOptions({ name: "AppLanding" })

interface HighlightedTextPart {
  text: string
  highlight?: boolean
}

interface RedditComment {
  paragraphs: HighlightedTextPart[][]
  author: string
  link: string
  picture: string
}

interface FaqEntry {
  question: string
  answerParagraphs?: string[]
  points?: string[]
  authRequired?: boolean
}

useHead({ title: "Timeful - Find a time to meet" })

const router = useRouter()
const display = useDisplay()
const mainStore = useMainStore()
const { authUser } = storeToRefs(mainStore)
const landingSignInEnabled = signInEnabled && richLandingEnabled

const signInDialog = ref(false)
const newDialog = ref(false)
const faqs: FaqEntry[] = [
  {
    question: "Does Timeful support timezones?",
    answerParagraphs: [
      "Yes! Timeful automatically converts all times to the viewer's local timezone. There's also a timezone selector at the bottom of every meeting poll if you would like to manually change it.",
    ],
  },
  {
    question: "How many people can respond to an event?",
    answerParagraphs: [
      "Unlimited! We've tested events with over 500+ responses and it works great.",
    ],
  },
  {
    question: "What calendars does Timeful integrate with?",
    answerParagraphs: [
      "Timeful allows you to autofill your availability from your Google Calendar, Outlook, Apple Calendar, or an ICS feed URL. We are working on adding more calendar types soon!",
    ],
  },
  {
    question: "Is calendar access required in order to use Timeful?",
    answerParagraphs: [
      "Nope! You can manually input your availability, but we highly recommend allowing calendar access in order to view your calendar events while doing so.",
    ],
  },
  {
    question: "Will other people be able to see my calendar events?",
    answerParagraphs: [
      "Nope! All other users will be able to see is the availability that you enter for an event.",
    ],
  },
  {
    question: "How do I edit my availability?",
    answerParagraphs: [
      'If you are signed in, simply click the "Edit availability" button. If you entered your availability as a guest, hover over your name and click the pencil icon next to it.',
    ],
  },
  {
    question: "How is Timeful different from Lettucemeet or When2meet?",
    points: [
      "Much better UI (web and mobile)",
      "Seamless and working calendar integration",
      "A slew of other features that we don't have space to list here",
    ],
  },
  {
    question: `I want it so that only I can see people's responses.`,
    answerParagraphs: [
      `Just check "Only show responses to event creator" under Advanced Options when creating your event! Other respondees will not be able to see each other's names or availability.`,
    ],
    authRequired: true,
  },
  {
    question: `Can I receive emails when someone fills out my event?`,
    answerParagraphs: [
      `Absolutely! Check "Email me each time someone joins my event" when creating an event.`,
      `To receive email notifications after a specific number (X) of responses are added, check "Email me after X responses" in Advanced Options.`,
    ],
    authRequired: true,
  },
  {
    question: `How do I send reminders to people to fill out an event?`,
    answerParagraphs: [
      `Open the "Email Reminders" section when creating an event and input everybody's email address. Reminder emails will be sent the day of event creation, one day after, and three days after.`,
      `You will also receive an email once everybody has filled out the Timeful.`,
    ],
    authRequired: true,
  },
]
const redditComments: RedditComment[] = [
  {
    paragraphs: [
      [
        { text: "Genuinely the " },
        {
          text: "best lightweight version of this kind of website",
          highlight: true,
        },
        { text: " that I've come across so far, exceptional." },
      ],
    ],
    author: "u/voipClock",
    link: "https://www.reddit.com/r/opensource/comments/1klu471/comment/mt4l2ab",
    picture:
      "https://www.redditstatic.com/avatars/defaults/v2/avatar_default_1.png",
  },
  {
    paragraphs: [
      [
        {
          text: "Exactly what I was looking for! Clear and clean interface, also on mobile (",
        },
        { text: "Doodle is a disaster", highlight: true },
        { text: ")." },
      ],
    ],
    author: "u/Willem1976",
    link: "https://www.reddit.com/r/opensource/comments/1dlol7r/comment/lkn7sle",
    picture:
      "https://styles.redditmedia.com/t5_c0qtc/styles/profileIcon_snooa9d429ce-e3d9-458a-be9e-1b6dd157a209-headshot.png?width=64&height=64&frame=1&auto=webp&crop=&s=7eba44ea268928b969bcf73ee8667357412132ca",
  },
  // {
  //   text: "Thank you very much! My workplace cannot seem to pick between when2meet and Doodle and I feel like this brings the best of each into one.\n\nWell done <3",
  //   author: "u/jadiepants",
  //   link: "https://www.reddit.com/r/opensource/comments/1dlol7r/comment/m6bf3li",
  //   picture:
  //     "https://styles.redditmedia.com/t5_d7myp/styles/profileIcon_snoof50f1128-f439-433b-a6b2-8e987630e506-headshot.png?width=64&height=64&frame=1&auto=webp&crop=&s=94077bf80603c2855747f1bfc0b9dd1539fae75c",
  // },
]

function loadRiveAnimation() {
  // if (!rive.value) {
  //   rive.value = new Rive({
  //     src: "/rive/timeful.riv",
  //     canvas: document.querySelector("canvas"),
  //     autoplay: false,
  //     stateMachines: "wave",
  //     onLoad: () => {
  //       // r.resizeDrawingSurfaceToCanvas()
  //     },
  //   })
  //   setTimeout(() => {
  //     showTimefulMascot.value = true
  //     setTimeout(() => {
  //       rive.value.play("wave")
  //     }, 1000)
  //   }, 4000)
  // } else {
  //   rive.value.play("wave")
  // }
}

function _signIn(calendarType: string) {
  if (!signInEnabled) {
    return
  }

  if (calendarType === calendarTypes.GOOGLE) {
    signInGoogle({ state: null, selectAccount: true })
  } else if (calendarType === calendarTypes.OUTLOOK) {
    signInOutlook({ state: null, selectAccount: true })
  }
}

function _emailSignIn(user: User) {
  mainStore.setAuthUser(user)
  posthog.identify(user._id, {
    email: user.email,
    firstName: user.firstName,
    lastName: user.lastName,
  })
  void router.replace({ name: "home" })
}

function signIn() {
  if (!signInEnabled) {
    return
  }

  void router.push({ name: "sign-in" })
}

function openDashboard() {
  void router.push({ name: "home" })
}

watch(
  display.name,
  () => {
    if (display.mdAndUp.value) {
      setTimeout(() => {
        loadRiveAnimation()
      }, 0)
    }
  },
  { immediate: true },
)
</script>

<style scoped>
.landing-hero-copy {
  margin-bottom: 1.7rem;
  max-width: 26rem;
}

.landing-github-badge {
  margin-bottom: 1rem;
  padding: 0.375rem 0.625rem;
}

.landing-github-button {
  margin-left: 0.5rem;
}

.landing-hero-heading {
  margin-bottom: 1rem;
  font-size: 1.5rem;
  line-height: 1.5rem;
}

.landing-hero-heading-text {
  margin: 0;
  font-size: inherit;
  font-weight: inherit;
  line-height: inherit;
  letter-spacing: inherit;
  white-space: inherit;
}

.landing-hero-subtitle {
  font-size: 0.875rem;
  line-height: 1.75rem;
}

.landing-calendar-link {
  border-bottom: 1px dashed rgb(107, 107, 107);
  cursor: pointer;
  outline: none;
  text-decoration: none;
}

.landing-calendar-link:hover,
.landing-calendar-link:focus,
.landing-calendar-link:focus-visible {
  outline: none;
  text-decoration: none;
}

.landing-hero-cta {
  margin-bottom: 1.7rem;
  display: flex;
  flex-direction: column;
  align-items: center;
  gap: 0.5rem;
}

.landing-primary-cta {
  padding-left: 2.5rem;
  padding-right: 2.5rem;
}

@media (min-width: 640px) {
  .landing-hero-copy {
    max-width: none;
    width: 35rem;
  }

  .landing-hero-heading {
    font-size: 2.25rem;
    line-height: 2.5rem;
  }

  .landing-hero-subtitle {
    font-size: 1.125rem;
    line-height: 1.75rem;
  }

  .landing-hero-cta {
    gap: 0.75rem;
  }
}

@media (min-width: 1280px) {
  .landing-hero-heading {
    font-size: 3rem;
    line-height: 3rem;
  }
}

@media (min-width: 1024px) {
  .landing-primary-cta {
    padding-left: 3rem;
    padding-right: 3rem;
  }
}
</style>

<style scoped>
@media screen and (min-width: 375px) and (max-width: 640px) {
  #header {
    font-size: 1.875rem !important; /* 30px */
    line-height: 2.25rem !important; /* 36px */
  }
}
</style>
<style lang="postcss">
.rdt-h {
  border-radius: 0.25rem;
  background-color: rgb(41 188 104 / 0.2);
  padding-inline: 1px;
  color: #000000;
}
</style>

// @vitest-environment happy-dom

import { flushPromises, shallowMount } from "@vue/test-utils"
import { ref } from "vue"
import { beforeEach, describe, expect, it, vi } from "vitest"
import Landing from "./Landing.vue"

const { authUserState } = vi.hoisted(() => ({
  authUserState: { value: null as { id: string } | null },
}))

vi.mock("@unhead/vue", () => ({
  useHead: vi.fn(),
}))

vi.mock("vue-router", () => ({
  useRouter: () => ({
    push: vi.fn(),
  }),
}))

vi.mock("vuetify", () => ({
  useDisplay: () => ({
    mdAndUp: ref(false),
    name: ref("xs"),
  }),
}))

vi.mock("pinia", () => ({
  storeToRefs: (store: { authUser: unknown }) => ({
    authUser: store.authUser,
  }),
}))

vi.mock("@/stores/main", () => ({
  useMainStore: () => ({
    authUser: ref(authUserState.value),
    setAuthUser: vi.fn(),
  }),
}))

vi.mock("@/utils", async () => {
  const actual = await vi.importActual<object>("@/utils")

  return {
    ...actual,
    signInGoogle: vi.fn(),
    signInOutlook: vi.fn(),
  }
})

vi.mock("@/utils/useDisplayHelpers", () => ({
  useDisplayHelpers: () => ({
    isPhone: false,
  }),
}))

vi.mock("@/plugins/posthog", () => ({
  posthog: {
    identify: vi.fn(),
  },
}))

const PassThroughStub = {
  template: "<div><slot /></div>",
}

const VTooltipStub = {
  template: '<div><slot name="activator" :props="{}" /><slot /></div>',
}

const VBtnStub = {
  props: ["variant"],
  template: '<button :data-variant="variant"><slot /></button>',
}

describe("Landing", () => {
  beforeEach(() => {
    authUserState.value = null
  })

  it("renders landing highlights without injecting raw HTML", async () => {
    const wrapper = shallowMount(Landing, {
      global: {
        stubs: {
          FAQ: true,
          Footer: true,
          Header: PassThroughStub,
          NewDialog: true,
          SignInDialog: true,
          "v-avatar": PassThroughStub,
          "v-btn": PassThroughStub,
          "v-img": true,
          "v-tooltip": VTooltipStub,
        },
      },
    })

    await flushPromises()

    expect(wrapper.text()).toContain("Create event")
    expect(wrapper.findAll(".reddit-comment .rdt-h")).toHaveLength(2)
    expect(wrapper.html()).not.toContain("v-html")
  })

  it("keeps the landing hero style hooks for calendar and CTA", async () => {
    const landingWrapper = shallowMount(Landing, {
      global: {
        stubs: {
          FAQ: true,
          Footer: true,
          Header: PassThroughStub,
          NewDialog: true,
          SignInDialog: true,
          "v-avatar": PassThroughStub,
          "v-btn": VBtnStub,
          "v-img": true,
          "v-tooltip": VTooltipStub,
        },
      },
    })

    await flushPromises()

    const calendarLink = landingWrapper.get(".landing-calendar-link")
    const primaryCta = landingWrapper.get(".landing-primary-cta")

    expect(calendarLink.text()).toBe("calendar")
    expect(primaryCta.classes()).toContain("tw:text-white")
  })

  it("renders the rich landing sections by default", async () => {
    const wrapper = shallowMount(Landing, {
      global: {
        stubs: {
          FAQ: true,
          Footer: { template: '<footer data-test="landing-footer" />' },
          Header: PassThroughStub,
          NewDialog: true,
          SignInDialog: true,
          "v-avatar": PassThroughStub,
          "v-btn": VBtnStub,
          "v-img": true,
          "v-tooltip": VTooltipStub,
        },
      },
    })

    await flushPromises()

    expect(wrapper.find("#how-it-works").exists()).toBe(false)
    expect(wrapper.find('[data-test="landing-footer"]').exists()).toBe(true)
    expect(wrapper.text()).toContain("People love us on Reddit!")
    expect(wrapper.text()).toContain("Frequently Asked Questions")
  })
})

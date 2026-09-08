// @vitest-environment happy-dom

import { flushPromises, shallowMount } from "@vue/test-utils"
import { ref } from "vue"
import { describe, expect, it, vi } from "vitest"

vi.mock("@unhead/vue", () => ({
  useHead: vi.fn(),
}))

vi.mock("vue-router", () => ({
  useRouter: () => ({
    push: vi.fn(),
    replace: vi.fn(),
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
    authUser: ref(null),
    setAuthUser: vi.fn(),
  }),
}))

vi.mock("@/utils/sign_in_utils", () => ({
  signInGoogle: vi.fn(),
  signInOutlook: vi.fn(),
}))

vi.mock("@/utils/landingAvailability", () => ({
  richLandingEnabled: false,
}))

vi.mock("@/utils/useDisplayHelpers", () => ({
  useDisplayHelpers: () => ({
    isPhone: false,
  }),
}))

vi.mock("@/plugins/posthog", () => ({
  posthog: {
    identify: vi.fn(),
    capture: vi.fn(),
  },
}))

const PassThroughStub = {
  template: "<div><slot /></div>",
}

const VTooltipStub = {
  template: '<div><slot name="activator" :props="{}" /><slot /></div>',
}

describe("Landing minimal mode", () => {
  it("keeps only the approved hero surfaces when rich landing is disabled", async () => {
    const { default: Landing } = await import("./Landing.vue")

    const wrapper = shallowMount(Landing, {
      global: {
        stubs: {
          FAQ: { template: '<div data-test="faq" />' },
          Footer: { template: '<footer data-test="landing-footer" />' },
          Header: PassThroughStub,
          NewDialog: true,
          SignInDialog: { template: '<div data-test="sign-in-dialog" />' },
          "v-avatar": PassThroughStub,
          "v-btn": { template: "<button><slot /></button>" },
          "v-img": { template: '<img data-test="hero-card" />' },
          "v-tooltip": VTooltipStub,
        },
      },
    })

    await flushPromises()

    expect(wrapper.text()).toContain("Find a time to meet")
    expect(wrapper.text()).toContain("Create event")
    expect(wrapper.find('[data-test="hero-card"]').exists()).toBe(true)
    expect(wrapper.find('[data-test="minimal-viewport-band"]').exists()).toBe(
      true,
    )

    expect(wrapper.find('[data-test="formerly-known-as"]').exists()).toBe(false)
    expect(wrapper.find("#how-it-works").exists()).toBe(false)
    expect(wrapper.find('[data-test="faq"]').exists()).toBe(false)
    expect(wrapper.find('[data-test="landing-footer"]').exists()).toBe(false)
    expect(wrapper.find('[data-test="sign-in-dialog"]').exists()).toBe(false)
    expect(wrapper.find(".tw\\:top-2\\/3").exists()).toBe(false)
    expect(wrapper.text()).not.toContain("People love us on Reddit!")
    expect(wrapper.text()).not.toContain("Frequently Asked Questions")
    expect(wrapper.text()).not.toContain("Integrates with your")
  })
})

// @vitest-environment happy-dom
import { flushPromises, mount } from "@vue/test-utils"
import { beforeEach, describe, expect, it, vi } from "vitest"
import { reactive } from "vue"
import GrantedAccessConfirmation from "./GrantedAccessConfirmation.vue"

const mocks = vi.hoisted(() => ({
  inspect: vi.fn(),
  store: { authUser: undefined as { _id: string } | undefined },
}))
vi.mock("@/stores/main", () => ({ useMainStore: () => mocks.store }))
vi.mock("vue-router", () => ({ useRoute: () => ({ params: {} }) }))
vi.mock("@/composables/event/visitorIdentityStorage", () => ({
  browserEventVisitorIdentities: () => [
    { eventId: "EVENT123", eventVisitorId: "target" },
  ],
}))
vi.mock("@/composables/transfer/transferBoundary", () => ({
  grantAssociation: mocks.inspect,
}))
const stubs = {
  VDialog: {
    props: ["modelValue"],
    template: '<div v-if="modelValue"><slot /></div>',
  },
  VCard: { template: "<div><slot /></div>" },
  VCardText: { template: "<div><slot /></div>" },
  VCardActions: { template: "<div><slot /></div>" },
  VBtn: { template: "<button><slot /></button>" },
}
beforeEach(() => {
  mocks.store = reactive({ authUser: undefined })
  mocks.inspect.mockReset().mockResolvedValue({ confirmationRequired: true })
})
describe("granted access confirmation outside the event page", () => {
  it("prompts after sign-in on any page and never associates on dismissal", async () => {
    const wrapper = mount(GrantedAccessConfirmation, { global: { stubs } })
    expect(mocks.inspect).not.toHaveBeenCalled()
    mocks.store.authUser = { _id: "account" }
    await flushPromises()
    expect(mocks.inspect).toHaveBeenCalledWith("EVENT123")
    expect(wrapper.text()).toContain("source visitor")
    await wrapper.findAll("button")[0]?.trigger("click")
    expect(mocks.inspect).toHaveBeenCalledTimes(1)
    expect(wrapper.find("button").exists()).toBe(false)
    wrapper.unmount()
  })
  it("associates only after confirmation", async () => {
    mocks.store.authUser = { _id: "account" }
    const wrapper = mount(GrantedAccessConfirmation, { global: { stubs } })
    await flushPromises()
    await wrapper.findAll("button")[1]?.trigger("click")
    await flushPromises()
    expect(mocks.inspect).toHaveBeenLastCalledWith("EVENT123", true)
    expect(wrapper.find("button").exists()).toBe(false)
    wrapper.unmount()
  })
})

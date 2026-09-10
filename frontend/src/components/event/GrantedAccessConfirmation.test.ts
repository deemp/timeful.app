// @vitest-environment happy-dom
import { flushPromises, mount } from "@vue/test-utils"
import { beforeEach, describe, expect, it, vi } from "vitest"
import { reactive } from "vue"
import GrantedAccessConfirmation from "./GrantedAccessConfirmation.vue"

const mocks = vi.hoisted(() => ({
  inspect: vi.fn(),
  store: { authUser: undefined as { _id: string } | undefined },
  route: { params: { eventId: "" } },
}))
vi.mock("@/stores/main", () => ({ useMainStore: () => mocks.store }))
vi.mock("vue-router", () => ({ useRoute: () => mocks.route }))
vi.mock("@/composables/event/visitorIdentityStorage", () => ({
  browserEventVisitorIdentities: () => [
    { eventId: "EVENT123", eventVisitorId: "target" },
  ],
}))
vi.mock("@/composables/transfer/transferBoundary", () => ({
  grantAssociation: mocks.inspect,
}))
const stubs = {
  VAlert: { template: '<div role="alert"><slot /></div>' },
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
  mocks.route = reactive({ params: { eventId: "" } })
  mocks.inspect.mockReset().mockResolvedValue({ confirmationRequired: true })
})
describe("granted access confirmation outside the event page", () => {
  it.each([false, true])(
    "inspects events only once per sign-in (request fails: %s)",
    async (fails) => {
      mocks.store.authUser = { _id: "account" }
      if (fails) mocks.inspect.mockRejectedValue(new Error("stale record"))
      else mocks.inspect.mockResolvedValue({ confirmationRequired: false })
      const wrapper = mount(GrantedAccessConfirmation, { global: { stubs } })
      await flushPromises()
      mocks.route.params.eventId = "ABCDEFGH"
      await flushPromises()
      mocks.route.params.eventId = "EVENT123"
      await flushPromises()
      expect(mocks.inspect.mock.calls).toEqual([["EVENT123"], ["ABCDEFGH"]])
      mocks.store.authUser = undefined
      await flushPromises()
      mocks.store.authUser = { _id: "account" }
      await flushPromises()
      expect(mocks.inspect.mock.calls).toEqual([
        ["EVENT123"],
        ["ABCDEFGH"],
        ["EVENT123"],
      ])
      wrapper.unmount()
    },
  )
  it("retains required consent across navigation without repeating in-flight queries", async () => {
    mocks.store.authUser = { _id: "account" }
    mocks.inspect.mockResolvedValue({ confirmationRequired: false })
    let resolve!: (state: { confirmationRequired: boolean }) => void
    mocks.inspect.mockImplementationOnce(
      () =>
        new Promise((done) => {
          resolve = done
        }),
    )
    const wrapper = mount(GrantedAccessConfirmation, { global: { stubs } })
    mocks.route.params.eventId = "ABCDEFGH"
    await flushPromises()
    expect(mocks.inspect.mock.calls).toEqual([["EVENT123"], ["ABCDEFGH"]])
    resolve({ confirmationRequired: true })
    await flushPromises()
    expect(wrapper.text()).toContain("EVENT123")
    mocks.route.params.eventId = "EVENT123"
    await flushPromises()
    expect(mocks.inspect.mock.calls).toEqual([["EVENT123"], ["ABCDEFGH"]])
    wrapper.unmount()
  })
  it.each(["sign-out", "account-switch", "same-account-sign-in", "unmount"])(
    "discards in-flight consent after %s",
    async (transition) => {
      mocks.store.authUser = { _id: "account" }
      mocks.route.params.eventId = "ABCDEFGH"
      mocks.inspect.mockResolvedValue({ confirmationRequired: false })
      let resolve!: (state: { confirmationRequired: boolean }) => void
      mocks.inspect.mockImplementationOnce(
        () =>
          new Promise((done) => {
            resolve = done
          }),
      )
      const wrapper = mount(GrantedAccessConfirmation, { global: { stubs } })
      if (transition === "unmount") wrapper.unmount()
      else {
        mocks.store.authUser =
          transition === "account-switch" ? { _id: "other" } : undefined
        await flushPromises()
        if (transition === "same-account-sign-in") {
          mocks.store.authUser = { _id: "account" }
          await flushPromises()
        }
      }
      const inspections = mocks.inspect.mock.calls.length
      resolve({ confirmationRequired: true })
      await flushPromises()
      // The old loop must neither display consent nor inspect its next event.
      expect(mocks.inspect).toHaveBeenCalledTimes(inspections)
      if (transition !== "unmount") {
        expect(wrapper.find("button").exists()).toBe(false)
        wrapper.unmount()
      }
    },
  )
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

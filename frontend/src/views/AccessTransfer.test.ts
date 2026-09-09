// @vitest-environment happy-dom
import { flushPromises, mount } from "@vue/test-utils"
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest"
import { FetchError } from "@/utils/fetch_utils"
import AccessTransfer from "./AccessTransfer.vue"
import type * as TransferBoundary from "@/composables/transfer/transferBoundary"

const mocks = vi.hoisted(() => ({ action: vi.fn(), navigate: vi.fn() }))
vi.mock("@/stores/main", () => ({
  useMainStore: () => ({
    authUser: {
      firstName: "Current",
      lastName: "User",
      email: "current@example.com",
    },
  }),
}))
vi.mock("@/composables/transfer/transferBoundary", async (original) => ({
  ...(await original<typeof TransferBoundary>()),
  transferAction: mocks.action,
}))
const stubs = {
  VContainer: { template: "<div><slot /></div>" },
  VCard: { props: ["title"], template: "<div>{{ title }}<slot /></div>" },
  VCardText: { template: "<div><slot /></div>" },
  VCardActions: { template: "<div><slot /></div>" },
  VAlert: { template: '<div role="alert"><slot /></div>' },
  VBtn: { template: "<button><slot /></button>" },
  VDialog: {
    props: ["modelValue"],
    template: '<div v-if="modelValue" role="dialog"><slot /></div>',
  },
}
function render() {
  return mount(AccessTransfer, {
    props: { eventId: "EVENT123", transferId: "transfer" },
    global: { stubs },
  })
}
async function click(wrapper: ReturnType<typeof render>, text: string) {
  const button = wrapper
    .findAll("button")
    .find((button) => button.text() === text)
  expect(button).toBeDefined()
  await button?.trigger("click")
  await flushPromises()
}
function switchRequired() {
  return Object.assign(new FetchError("Conflict"), {
    status: 409,
    parsed: { accountSwitchRequired: true },
  })
}
beforeEach(() => {
  mocks.action
    .mockReset()
    .mockResolvedValue({ state: "approved", code: "12345678" })
  mocks.navigate.mockReset()
  vi.spyOn(window.location, "assign").mockImplementation(mocks.navigate)
})
afterEach(() => vi.restoreAllMocks())
describe("target access transfer", () => {
  it("restores the approved code on a fresh mount and can redeem", async () => {
    const wrapper = render()
    await flushPromises()
    expect(mocks.action).toHaveBeenCalledWith("EVENT123", "transfer", "open")
    expect(wrapper.get('[data-testid="matching-code"]').text()).toBe("12345678")
    expect(wrapper.text()).toContain("Approved — you can continue")
    await click(wrapper, "Continue after approval")
    expect(mocks.navigate).toHaveBeenCalledWith("/e/EVENT123")
    wrapper.unmount()
  })
  it("requires explicit account-switch consent and cancellation does not redeem", async () => {
    const wrapper = render()
    await flushPromises()
    mocks.action.mockRejectedValueOnce(switchRequired())
    await click(wrapper, "Continue after approval")
    const dialog = wrapper.get('[role="dialog"]')
    expect(dialog.text()).toContain("Switch accounts on this device?")
    expect(dialog.text()).toContain("Current User")
    expect(dialog.text()).toContain("current@example.com")
    expect(dialog.text()).toContain("replacing your current sign-in")
    expect(dialog.text()).toContain("does not merge accounts")
    expect(mocks.navigate).not.toHaveBeenCalled()
    await click(wrapper, "Cancel")
    expect(wrapper.find('[role="dialog"]').exists()).toBe(false)
    expect(mocks.action).toHaveBeenCalledTimes(2)
    mocks.action.mockRejectedValueOnce(switchRequired())
    await click(wrapper, "Continue after approval")
    await click(wrapper, "Switch accounts")
    expect(mocks.action).toHaveBeenLastCalledWith(
      "EVENT123",
      "transfer",
      "redeem",
      { confirmAccountSwitch: true },
    )
    expect(mocks.navigate).toHaveBeenCalledWith("/e/EVENT123")
    wrapper.unmount()
  })
  it("keeps unavailable-transfer errors visible without prompting a switch", async () => {
    const wrapper = render()
    await flushPromises()
    mocks.action.mockRejectedValueOnce(new FetchError("Forbidden"))
    await click(wrapper, "Continue after approval")
    expect(wrapper.text()).toContain("Access has not been approved")
    expect(wrapper.find('[role="dialog"]').exists()).toBe(false)
    expect(mocks.navigate).not.toHaveBeenCalled()
    wrapper.unmount()
  })
  it("shows the unavailable link message when opening fails", async () => {
    mocks.action.mockRejectedValueOnce(new FetchError("Forbidden"))
    const wrapper = render()
    await flushPromises()
    expect(wrapper.text()).toContain(
      "This transfer is expired, cancelled, or unavailable",
    )
    expect(wrapper.find("button").exists()).toBe(false)
    wrapper.unmount()
  })
})

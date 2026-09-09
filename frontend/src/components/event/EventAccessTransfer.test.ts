// @vitest-environment happy-dom
import { flushPromises, mount } from "@vue/test-utils"
import { afterEach, expect, it, vi } from "vitest"
import EventAccessTransfer from "./EventAccessTransfer.vue"
import { eventTypes } from "@/constants"

vi.mock("@/stores/main", () => ({ useMainStore: () => ({}) }))
vi.mock("@/composables/transfer/transferBoundary", () => ({
  createTransfer: () => Promise.resolve({ id: "transfer", state: "pending" }),
  transferAction: () => Promise.resolve({ state: "pending", requests: [] }),
  savedTransfers: () => [],
  rememberTransfer: () => {},
  matchingRequest: () => undefined,
}))
afterEach(() => vi.useRealTimers())
it("keeps wrong-code feedback visible across status polling", async () => {
  vi.useFakeTimers()
  const wrapper = mount(EventAccessTransfer, {
    props: {
      event: {
        _id: "EVENT123",
        eventVisitorId: "visitor",
        name: "Event",
        type: eventTypes.SPECIFIC_DATES,
      },
    },
    global: {
      stubs: {
        VBtn: { template: "<button><slot /></button>" },
        VDialog: { template: "<div><slot /></div>" },
        VCard: { template: "<div><slot /></div>" },
        VCardText: { template: "<div><slot /></div>" },
        VCardActions: { template: "<div><slot /></div>" },
        VAlert: { template: '<div role="alert"><slot /></div>' },
        VTextField: {
          props: ["label", "modelValue"],
          emits: ["update:modelValue"],
          template:
            '<input :aria-label="label" :value="modelValue" @input="$emit(\'update:modelValue\', $event.target.value)" />',
        },
      },
    },
  })
  const click = async (text: string) => {
    const button = wrapper
      .findAll("button")
      .find((button) => button.text() === text)
    expect(button).toBeDefined()
    await button?.trigger("click")
    await flushPromises()
  }
  await click("Continue on another device")
  await click("Create transfer link")
  await wrapper
    .get('input[aria-label="Matching code from other browser"]')
    .setValue("WRONG")
  await click("Approve matching code")
  expect(wrapper.get('[role="alert"]').text()).toContain("Check the code")
  await vi.advanceTimersByTimeAsync(2100)
  await flushPromises()
  expect(wrapper.get('[role="alert"]').text()).toContain("Check the code")
  wrapper.unmount()
})

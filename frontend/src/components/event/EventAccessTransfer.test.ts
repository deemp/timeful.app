// @vitest-environment happy-dom
import { flushPromises, mount } from "@vue/test-utils"
import { afterEach, beforeEach, expect, it, vi } from "vitest"
import EventAccessTransfer from "./EventAccessTransfer.vue"
import { eventTypes } from "@/constants"
import { createLocalStorageMock } from "@/test/localStorage"

vi.mock("@/stores/main", () => ({ useMainStore: () => ({}) }))
import { savedTransfers } from "@/composables/transfer/transferBoundary"
import { FetchError } from "@/utils/fetch_utils"
import type * as FetchUtils from "@/utils/fetch_utils"

const post = vi.hoisted(() => vi.fn())
vi.mock("@/utils/fetch_utils", async (original) => ({
  ...(await original<typeof FetchUtils>()),
  post,
}))
beforeEach(() => {
  vi.useFakeTimers()
  globalThis.localStorage = createLocalStorageMock()
  post
    .mockReset()
    .mockImplementation((url: string) =>
      Promise.resolve(
        url.endsWith("/transfers")
          ? { id: "transfer", state: "pending" }
          : { state: "pending", requests: [] },
      ),
    )
})
afterEach(() => {
  vi.useRealTimers()
  vi.restoreAllMocks()
})
function render() {
  return mount(EventAccessTransfer, {
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
}
async function click(wrapper: ReturnType<typeof render>, text: string) {
  const button = wrapper
    .findAll("button")
    .find((button) => button.text() === text)
  expect(button).toBeDefined()
  await button?.trigger("click")
  await flushPromises()
}
it("keeps wrong-code feedback visible across status polling", async () => {
  const wrapper = render()
  await click(wrapper, "Continue on another device")
  await click(wrapper, "Create transfer link")
  await wrapper
    .get('input[aria-label="Matching code from other browser"]')
    .setValue("WRONG")
  await click(wrapper, "Approve matching code")
  expect(wrapper.get('[role="alert"]').text()).toContain("Check the code")
  await vi.advanceTimersByTimeAsync(2100)
  await flushPromises()
  expect(wrapper.get('[role="alert"]').text()).toContain("Check the code")
  wrapper.unmount()
})

it("prunes legacy history and polls only active transfers with stable grant numbers", async () => {
  localStorage.setItem(
    "timeful.transfers.EVENT123",
    JSON.stringify(["old", "first", "second", "session", "missing", "first"]),
  )
  let revoked = false
  post.mockImplementation((url: string) => {
    if (url.includes("/missing/"))
      return Promise.reject(
        Object.assign(new FetchError("Forbidden"), { status: 403 }),
      )
    if (url.endsWith("/revoke")) {
      revoked = true
      return Promise.resolve({ state: "revoked" })
    }
    if (url.includes("/first/"))
      return Promise.resolve({
        state: revoked ? "cancelled" : "redeemed",
        revocable: !revoked,
      })
    if (url.includes("/second/"))
      return Promise.resolve({ state: "redeemed", revocable: true })
    return Promise.resolve({
      state: url.includes("/session/") ? "redeemed" : "expired",
    })
  })
  const wrapper = render()
  await click(wrapper, "Continue on another device")
  expect(post).toHaveBeenCalledTimes(5)
  expect(savedTransfers("EVENT123").map(({ id }) => id)).toEqual([
    "first",
    "second",
  ])
  expect(wrapper.text()).toContain("Granted access 3")
  post.mockClear()
  await vi.advanceTimersByTimeAsync(2000)
  expect(post).toHaveBeenCalledTimes(2)
  await click(wrapper, "Revoke access")
  expect(wrapper.text()).not.toContain("Granted access 2")
  expect(wrapper.text()).toContain("Granted access 3")
  post.mockClear()
  await vi.advanceTimersByTimeAsync(2000)
  expect(post).toHaveBeenCalledTimes(1)
  await click(wrapper, "Close")
  post.mockClear()
  await vi.advanceTimersByTimeAsync(6000)
  expect(post).not.toHaveBeenCalled()
  wrapper.unmount()
  const reopened = render()
  await click(reopened, "Continue on another device")
  expect(reopened.text()).toContain("Granted access 3")
  reopened.unmount()
  post.mockClear()
  await vi.advanceTimersByTimeAsync(4000)
  expect(post).not.toHaveBeenCalled()
})

it("polls the current transfer once and stops after a non-revocable completion", async () => {
  const wrapper = render()
  await click(wrapper, "Continue on another device")
  await click(wrapper, "Create transfer link")
  post.mockClear()
  await vi.advanceTimersByTimeAsync(2000)
  expect(post).toHaveBeenCalledTimes(1)
  expect(savedTransfers("EVENT123")).toHaveLength(1)
  post.mockResolvedValue({ state: "approved" })
  await vi.advanceTimersByTimeAsync(2000)
  expect(savedTransfers("EVENT123")).toHaveLength(1)
  expect(wrapper.text()).toContain("Approved — waiting for the other browser")
  post.mockResolvedValue({ state: "redeemed", revocable: false })
  await vi.advanceTimersByTimeAsync(2000)
  expect(savedTransfers("EVENT123")).toEqual([])
  expect(wrapper.text()).toContain("Completed")
  post.mockClear()
  await vi.advanceTimersByTimeAsync(4000)
  expect(post).not.toHaveBeenCalled()
  wrapper.unmount()
})

it("retains revocation handles and visible grants on transient status failures", async () => {
  localStorage.setItem("timeful.transfers.EVENT123", JSON.stringify(["grant"]))
  post.mockResolvedValue({ state: "redeemed", revocable: true })
  const wrapper = render()
  await click(wrapper, "Continue on another device")
  post.mockRejectedValue(
    Object.assign(new FetchError("Server error"), { status: 500 }),
  )
  await vi.advanceTimersByTimeAsync(2000)
  expect(savedTransfers("EVENT123")).toHaveLength(1)
  expect(wrapper.text()).toContain("Granted access 1")
  post.mockResolvedValue({ state: "redeemed", revocable: true })
  post.mockClear()
  await vi.advanceTimersByTimeAsync(2000)
  expect(post).toHaveBeenCalledTimes(1)
  wrapper.unmount()
})

it("names clipboard failures and preserves the message across successful polls", async () => {
  vi.spyOn(navigator.clipboard, "writeText").mockRejectedValue(
    new Error("denied"),
  )
  const wrapper = render()
  await click(wrapper, "Continue on another device")
  await click(wrapper, "Create transfer link")
  await click(wrapper, "Copy transfer link")
  expect(wrapper.get('[role="alert"]').text()).toContain(
    "Could not copy the transfer link",
  )
  expect(wrapper.get('[role="alert"]').text()).not.toContain("expired")
  await vi.advanceTimersByTimeAsync(2000)
  expect(wrapper.get('[role="alert"]').text()).toContain(
    "Could not copy the transfer link",
  )
  wrapper.unmount()
})

import { createLocalStorageMock } from "@/test/localStorage"
import { beforeEach, describe, expect, it, vi } from "vitest"
import {
  decodeTransfer,
  matchingRequest,
  savedTransfers,
  rememberTransfer,
  grantAssociation,
  transferAction,
} from "./transferBoundary"
const post = vi.hoisted(() => vi.fn())
vi.mock("@/utils/fetch_utils", () => ({ post }))
beforeEach(() => {
  globalThis.localStorage = createLocalStorageMock()
  post.mockReset()
})
describe("access transfer boundary", () => {
  it("offers revocation only when the server reports an active grant", () => {
    expect(decodeTransfer({ state: "redeemed" }).revocable).toBe(false)
    expect(
      decodeTransfer({ state: "redeemed", revocable: true }).revocable,
    ).toBe(true)
    expect(
      decodeTransfer({ state: "cancelled", revocable: false }).revocable,
    ).toBe(false)
  })
  it("approves only the exact target code", () => {
    const state = decodeTransfer({
      requests: [
        { id: "attacker", code: "ABCDEFGH" },
        { id: "target", code: "12345678" },
      ],
    })
    expect(matchingRequest(state, " 12345678 ")?.id).toBe("target")
    expect(matchingRequest(state, "1234567")).toBeUndefined()
    expect(matchingRequest(state, "wrong")).toBeUndefined()
  })
  it("inspects without consent and sends consent only explicitly", async () => {
    post.mockResolvedValue({ confirmationRequired: true })
    expect((await grantAssociation("EVENT123")).confirmationRequired).toBe(true)
    expect(post).toHaveBeenLastCalledWith(
      "/events/EVENT123/grant-association",
      { confirm: false },
    )
    await grantAssociation("EVENT123", true)
    expect(post).toHaveBeenLastCalledWith(
      "/events/EVENT123/grant-association",
      { confirm: true },
    )
  })
  it("sends both selected request and code to approval", async () => {
    post.mockResolvedValue({ state: "approved" })
    await transferAction("EVENT123", "transfer", "approve", {
      requestId: "target",
      code: "12345678",
    })
    expect(post).toHaveBeenCalledWith(
      "/events/EVENT123/transfers/transfer/approve",
      { requestId: "target", code: "12345678" },
    )
  })
  it("retains revocation handles across reloads and tolerates invalid storage", () => {
    rememberTransfer("EVENT123", "first")
    rememberTransfer("EVENT123", "second")
    expect(savedTransfers("EVENT123")).toEqual(["first", "second"])
    localStorage.setItem("timeful.transfers.EVENT123", "invalid")
    expect(savedTransfers("EVENT123")).toEqual([])
  })
})

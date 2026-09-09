import { createLocalStorageMock } from "@/test/localStorage"
import { beforeEach, describe, expect, it, vi } from "vitest"
import {
  decodeTransfer,
  matchingRequest,
  savedTransfers,
  rememberTransfer,
  forgetTransfer,
  grantAssociation,
  transferAction,
  requiresAccountSwitch,
} from "./transferBoundary"
import { FetchError } from "@/utils/fetch_utils"
import type * as FetchUtils from "@/utils/fetch_utils"
const post = vi.hoisted(() => vi.fn())
vi.mock("@/utils/fetch_utils", async (original) => ({
  ...(await original<typeof FetchUtils>()),
  post,
}))
beforeEach(() => {
  globalThis.localStorage = createLocalStorageMock()
  post.mockReset()
})
describe("access transfer boundary", () => {
  it("sends account-switch consent only when explicitly requested", async () => {
    post.mockResolvedValue({ state: "redeemed" })
    await transferAction("EVENT123", "transfer", "redeem")
    expect(post).toHaveBeenLastCalledWith(
      "/events/EVENT123/transfers/transfer/redeem",
      {},
    )
    await transferAction("EVENT123", "transfer", "redeem", {
      confirmAccountSwitch: true,
    })
    expect(post).toHaveBeenLastCalledWith(
      "/events/EVENT123/transfers/transfer/redeem",
      { confirmAccountSwitch: true },
    )
  })
  it("recognizes only an explicit account-switch conflict", () => {
    const error = Object.assign(new FetchError("Conflict"), {
      status: 409,
      parsed: { accountSwitchRequired: true },
    })
    expect(requiresAccountSwitch(error)).toBe(true)
    for (const parsed of [
      undefined,
      null,
      {},
      { accountSwitchRequired: "true" },
      { accountSwitchRequired: false },
    ]) {
      expect(
        requiresAccountSwitch(
          Object.assign(new FetchError("Conflict"), { status: 409, parsed }),
        ),
      ).toBe(false)
    }
    error.status = 403
    expect(requiresAccountSwitch(error)).toBe(false)
    expect(requiresAccountSwitch(new Error("unavailable"))).toBe(false)
  })
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
    expect(savedTransfers("EVENT123")).toEqual([
      { id: "first", number: 1 },
      { id: "second", number: 2 },
    ])
    localStorage.setItem("timeful.transfers.EVENT123", "invalid")
    expect(savedTransfers("EVENT123")).toEqual([])
  })
  it("deduplicates legacy handles and preserves numbers after pruning and new transfers", () => {
    localStorage.setItem(
      "timeful.transfers.EVENT123",
      JSON.stringify(["first", "second", "first", null]),
    )
    forgetTransfer("EVENT123", "first")
    expect(savedTransfers("EVENT123")).toEqual([{ id: "second", number: 2 }])
    rememberTransfer("EVENT123", "second")
    expect(rememberTransfer("EVENT123", "third")).toEqual({
      id: "third",
      number: 3,
    })
    forgetTransfer("EVENT123", "second")
    forgetTransfer("EVENT123", "third")
    expect(savedTransfers("EVENT123")).toEqual([])
    expect(localStorage.getItem("timeful.transfers.EVENT123")).not.toContain(
      "third",
    )
    expect(rememberTransfer("EVENT123", "fourth").number).toBe(4)
  })
  it("tolerates malformed numbered storage and unavailable storage", () => {
    localStorage.setItem(
      "timeful.transfers.EVENT123",
      JSON.stringify({
        nextNumber: "bad",
        transfers: [
          null,
          { id: "bad", number: -1 },
          { id: "valid", number: 7 },
        ],
      }),
    )
    expect(rememberTransfer("EVENT123", "next").number).toBe(8)
    vi.spyOn(localStorage, "setItem").mockImplementation(() => {
      throw new Error("blocked")
    })
    expect(() => {
      forgetTransfer("EVENT123", "valid")
    }).not.toThrow()
    expect(rememberTransfer("EVENT123", "in-memory").id).toBe("in-memory")
  })
})

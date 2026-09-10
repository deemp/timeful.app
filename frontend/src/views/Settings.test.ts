// @vitest-environment happy-dom

import { flushPromises, shallowMount } from "@vue/test-utils"
import { ref } from "vue"
import { beforeEach, describe, expect, it, vi } from "vitest"
import type * as UtilsModule from "@/utils"
import {
  buttonStubWithDisabled,
  mergeComponentStubs,
  passThroughStub,
  vTextFieldStub,
} from "@/test/componentStubs"
import Settings from "./Settings.vue"

const { patchMock, deleteMock, getMock, showErrorMock } = vi.hoisted(() => ({
  patchMock: vi.fn(),
  deleteMock: vi.fn(),
  getMock: vi.fn(),
  showErrorMock: vi.fn(),
}))

const authUser = ref({
  _id: "user-1",
  email: "ada@example.com",
  firstName: "Ada",
  lastName: "Lovelace",
})

const isPhoneValue = ref(false)

vi.mock("@/utils", async () => {
  const actual = await vi.importActual<typeof UtilsModule>("@/utils")

  return {
    ...actual,
    _delete: deleteMock,
    get: getMock,
    patch: patchMock,
  }
})

vi.mock("@/stores/main", () => ({
  useMainStore: () => ({
    showError: showErrorMock,
  }),
}))

vi.mock("pinia", () => ({
  storeToRefs: () => ({
    authUser,
  }),
}))

vi.mock("@/utils/useDisplayHelpers", () => ({
  useDisplayHelpers: () => ({
    isPhone: isPhoneValue,
  }),
}))

vi.mock("@unhead/vue", () => ({
  useHead: vi.fn(),
}))

const settingsStubs = mergeComponentStubs({
  CalendarAccounts: passThroughStub,
  "v-btn": buttonStubWithDisabled,
  "v-card": passThroughStub,
  "v-card-actions": passThroughStub,
  "v-card-text": passThroughStub,
  "v-card-title": passThroughStub,
  "v-dialog": passThroughStub,
  "v-expand-transition": passThroughStub,
  "v-spacer": passThroughStub,
  "v-text-field": vTextFieldStub,
})

const mountSettings = () =>
  shallowMount(Settings, {
    global: {
      stubs: settingsStubs,
    },
  })

describe("Settings", () => {
  beforeEach(() => {
    authUser.value = {
      _id: "user-1",
      email: "ada@example.com",
      firstName: "Ada",
      lastName: "Lovelace",
    }
    isPhoneValue.value = false
    patchMock.mockReset()
    deleteMock.mockReset()
    getMock.mockReset()
    showErrorMock.mockReset()
  })

  it("maps phone and desktop profile fields to explicit Vuetify 3 variants and densities", () => {
    const desktopWrapper = mountSettings()
    const desktopFields = desktopWrapper
      .findAllComponents(vTextFieldStub)
      .slice(0, 2)

    expect(desktopFields).toHaveLength(2)
    for (const field of desktopFields) {
      expect(field.props("variant")).toBe("outlined")
      expect(field.props("density")).toBe("default")
    }

    isPhoneValue.value = true
    const phoneWrapper = mountSettings()
    const phoneFields = phoneWrapper
      .findAllComponents(vTextFieldStub)
      .slice(0, 2)

    expect(phoneFields).toHaveLength(2)
    for (const field of phoneFields) {
      expect(field.props("variant")).toBe("outlined")
      expect(field.props("density")).toBe("compact")
    }
  })

  it("keeps unsaved profile changes gating and the existing save path", async () => {
    patchMock.mockImplementation(() => new Promise(() => undefined))

    const wrapper = mountSettings()

    expect(
      wrapper
        .findAll("button")
        .filter((candidate) => candidate.text().includes("Save changes")),
    ).toHaveLength(0)

    const fields = wrapper.findAll("input")
    await fields[0].setValue("Grace")

    const saveButton = wrapper
      .findAll("button")
      .find((candidate) => candidate.text().includes("Save changes"))

    if (saveButton == null) {
      throw new Error("Expected Save changes button")
    }

    await saveButton.trigger("click")
    await flushPromises()

    expect(patchMock).toHaveBeenCalledWith("/user/name", {
      firstName: "Grace",
      lastName: "Lovelace",
    })
  })

  it("confirms deletion with the account email and describes the ratified outcome", async () => {
    deleteMock.mockImplementation(() => new Promise(() => undefined))

    const wrapper = mountSettings()
    const deleteField = wrapper.findAllComponents(vTextFieldStub)[2]

    const findDeleteButton = () =>
      wrapper
        .findAll("button")
        .find((candidate) => candidate.text().trim() === "Delete")
    const disabledInitially = findDeleteButton()
    expect(disabledInitially?.attributes("disabled")).toBeDefined()

    await deleteField.setValue("wrong@example.com")
    expect(findDeleteButton()?.attributes("disabled")).toBeDefined()

    await deleteField.setValue("ada@example.com")
    const deleteButton = findDeleteButton()
    expect(deleteButton?.attributes("disabled")).toBeUndefined()

    if (deleteButton == null) {
      throw new Error("Expected Delete button")
    }
    await deleteButton.trigger("click")
    await flushPromises()

    expect(deleteMock).toHaveBeenCalledWith("/user", {
      email: "ada@example.com",
    })
    expect(wrapper.text()).toContain("permanent and immediate")
  })
})

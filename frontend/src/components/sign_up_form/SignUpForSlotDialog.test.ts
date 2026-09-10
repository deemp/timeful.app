// @vitest-environment happy-dom
/* eslint-disable vue/one-component-per-file */

import { defineComponent } from "vue"
import { mount } from "@vue/test-utils"
import { beforeEach, describe, expect, it, vi } from "vitest"
import {
  createFormStub,
  mergeComponentStubs,
  nullStub,
  passThroughStub,
} from "@/test/componentStubs"
import type { Event, SignUpBlockWithResponses } from "@/types"
import SignUpForSlotDialog from "./SignUpForSlotDialog.vue"

const authUserHolder = vi.hoisted(() => ({
  value: null as unknown,
}))

vi.mock("pinia", () => ({
  storeToRefs: (store: { authUser: unknown }) => ({
    authUser: store.authUser,
  }),
}))

vi.mock("@/stores/main", async () => {
  const { ref } = await import("vue")
  authUserHolder.value = ref(null)
  return {
    useMainStore: () => ({ authUser: authUserHolder.value }),
  }
})

const formRefMethods = {
  validate: vi.fn<() => Promise<{ valid: boolean }>>(() =>
    Promise.resolve({ valid: true }),
  ),
  resetValidation: vi.fn<() => void>(() => undefined),
}

const VBtnStub = defineComponent({
  name: "VBtn",
  props: {
    disabled: {
      type: Boolean,
      default: false,
    },
  },
  emits: ["click"],
  template: `
    <button :disabled="disabled" @click="$emit('click')">
      <slot />
    </button>
  `,
})

const VTextFieldStub = defineComponent({
  name: "VTextField",
  props: {
    modelValue: {
      type: String,
      default: "",
    },
    variant: {
      type: String,
      default: undefined,
    },
  },
  emits: ["update:modelValue"],
  template: `
    <input
      :value="modelValue"
      @input="$emit('update:modelValue', $event.target.value)"
    />
  `,
})

const baseEvent = {
  _id: "evt-1",
  collectEmails: true,
  blindAvailabilityEnabled: false,
} as Event

const signUpBlock = {
  _id: "slot-1",
  name: "Slot 1",
  respondents: [],
} as SignUpBlockWithResponses

const getSubmitButton = (wrapper: ReturnType<typeof mount>) => {
  const button = wrapper.findAll("button").at(1)
  if (button == null) {
    throw new Error("Expected submit button to exist")
  }
  return button
}

const dialogStubs = mergeComponentStubs({
  "v-btn": VBtnStub,
  "v-card": passThroughStub,
  "v-card-text": passThroughStub,
  "v-card-title": passThroughStub,
  "v-dialog": passThroughStub,
  "v-form": createFormStub(formRefMethods),
  "v-icon": nullStub,
  "v-spacer": nullStub,
  "v-text-field": VTextFieldStub,
  SignUpBlock: passThroughStub,
})

const setAuthUser = (user: { _id: string } | null) => {
  ;(authUserHolder.value as { value: unknown }).value = user
}

describe("SignUpForSlotDialog", () => {
  beforeEach(() => {
    formRefMethods.validate.mockClear()
    formRefMethods.resetValidation.mockClear()
  })

  it("uses explicit Vuetify 3 solo variants and allows guest submit after typing", async () => {
    const wrapper = mount(SignUpForSlotDialog, {
      props: {
        modelValue: true,
        event: baseEvent,
        signUpBlock,
      },
      global: {
        stubs: dialogStubs,
      },
    })

    const fields = wrapper.findAllComponents(VTextFieldStub)
    expect(fields).toHaveLength(2)
    expect(fields[0]?.props("variant")).toBe("solo")
    expect(fields[1]?.props("variant")).toBe("solo")
    expect(getSubmitButton(wrapper).attributes("disabled")).toBeDefined()

    const inputs = wrapper.findAll("input")
    await inputs[0]?.setValue(" guest ")
    await inputs[1]?.setValue(" guest@example.com ")

    expect(getSubmitButton(wrapper).attributes("disabled")).toBeUndefined()

    await getSubmitButton(wrapper).trigger("click")

    expect(formRefMethods.validate).toHaveBeenCalledTimes(1)
    expect(wrapper.emitted("submit")).toEqual([
      [{ name: "guest", email: "guest@example.com" }],
    ])
  })

  it("allows a signed-in visitor to submit without typing a name", async () => {
    setAuthUser({ _id: "account-1" })
    try {
      const wrapper = mount(SignUpForSlotDialog, {
        props: {
          modelValue: true,
          event: baseEvent,
          signUpBlock,
        },
        global: {
          stubs: dialogStubs,
        },
      })

      // The name and email fields are hidden for a signed-in visitor, so the
      // submit button must not require a typed name.
      expect(wrapper.findAllComponents(VTextFieldStub)).toHaveLength(0)
      expect(getSubmitButton(wrapper).attributes("disabled")).toBeUndefined()

      await getSubmitButton(wrapper).trigger("click")

      expect(wrapper.emitted("submit")).toEqual([[{ name: "", email: "" }]])
    } finally {
      setAuthUser(null)
    }
  })
})

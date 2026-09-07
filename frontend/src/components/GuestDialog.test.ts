// @vitest-environment happy-dom
/* eslint-disable vue/one-component-per-file */

import { readFileSync } from "node:fs"
import { defineComponent, ref, type PropType } from "vue"
import { mount } from "@vue/test-utils"
import { beforeEach, describe, expect, it, vi } from "vitest"
import {
  createFormStub,
  mergeComponentStubs,
  nullStub,
  passThroughStub,
} from "@/test/componentStubs"
import { GUEST_NAME_MAX_LENGTH } from "@/utils/guestName"
import type { Event } from "@/types"
import GuestDialog from "./GuestDialog.vue"
import guestDialogSource from "./GuestDialog.vue?raw"

const appCssSource = readFileSync("src/index.css", "utf8")

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
  inheritAttrs: false,
  props: {
    modelValue: {
      type: String,
      default: "",
    },
    variant: {
      type: String,
      default: undefined,
    },
    placeholder: {
      type: String,
      default: "",
    },
    label: {
      type: String,
      default: undefined,
    },
    maxlength: {
      type: [Number, String] as PropType<number | string | undefined>,
      default: undefined,
    },
    errorMessages: {
      type: [String, Array] as PropType<string | string[] | undefined>,
      default: undefined,
    },
    appendInnerIcon: {
      type: String,
      default: undefined,
    },
    hideDetails: {
      type: [Boolean, String] as PropType<boolean | string | undefined>,
      default: undefined,
    },
  },
  emits: ["update:modelValue", "keyup"],
  template: `
    <input
      :value="modelValue"
      :placeholder="placeholder"
      :maxlength="maxlength"
      @input="$emit('update:modelValue', $event.target.value)"
      @keyup="$emit('keyup', $event)"
    />
    <span
      v-if="errorMessages && errorMessages.length > 0"
      class="stub-field-message"
      >{{
        Array.isArray(errorMessages)
          ? errorMessages.join("; ")
          : errorMessages
      }}</span
    >
  `,
})

const VCheckboxStub = defineComponent({
  name: "VCheckbox",
  props: {
    modelValue: {
      type: Boolean,
      default: false,
    },
    label: {
      type: String,
      default: "",
    },
  },
  emits: ["update:modelValue"],
  template: `
    <label>
      <input
        type="checkbox"
        :checked="modelValue"
        @change="$emit('update:modelValue', $event.target.checked)"
      />
      <slot name="label">{{ label }}</slot>
    </label>
  `,
})

const baseEvent = {
  _id: "evt-1",
  collectEmails: true,
  responses: {},
} as Event

const getSubmitButton = (wrapper: ReturnType<typeof mount>) => {
  const button = wrapper.findAll("button").at(1)
  if (button == null) {
    throw new Error("Expected submit button to exist")
  }
  return button
}

const stubGroups = mergeComponentStubs({
  "v-btn": VBtnStub,
  "v-card": passThroughStub,
  "v-card-text": passThroughStub,
  "v-card-title": passThroughStub,
  "v-checkbox": VCheckboxStub,
  "v-dialog": passThroughStub,
  "v-form": createFormStub(formRefMethods),
  "v-icon": nullStub,
  "v-spacer": nullStub,
  "v-text-field": VTextFieldStub,
})

const mountDialog = (
  options: { collectEmails?: boolean; respondents?: string[] } = {},
) =>
  mount(GuestDialog, {
    props: {
      modelValue: true,
      event: { ...baseEvent, collectEmails: options.collectEmails ?? true },
      respondents: options.respondents ?? [],
    },
    global: {
      stubs: stubGroups,
    },
  })

const getFieldMessages = (wrapper: ReturnType<typeof mount>) =>
  wrapper.findAll(".stub-field-message").map((node) => node.text())

describe("GuestDialog", () => {
  beforeEach(() => {
    formRefMethods.validate.mockClear()
    formRefMethods.resetValidation.mockClear()
  })

  it("uses the outlined guest-name field with the solo email field and enables submit from typed guest details", async () => {
    const wrapper = mount(GuestDialog, {
      props: {
        modelValue: true,
        event: baseEvent,
        respondents: [],
      },
      global: {
        stubs: stubGroups,
      },
    })

    const fields = wrapper.findAllComponents(VTextFieldStub)
    expect(fields).toHaveLength(2)
    expect(fields[0]?.props("variant")).toBe("outlined")
    expect(fields[1]?.props("variant")).toBe("solo")

    expect(getSubmitButton(wrapper).attributes("disabled")).toBeDefined()

    const inputs = wrapper.findAll("input")
    await inputs[0]?.setValue(" guest ")
    await inputs[1]?.setValue(" guest@example.com ")

    expect(getSubmitButton(wrapper).attributes("disabled")).toBeUndefined()

    await getSubmitButton(wrapper).trigger("click")

    expect(formRefMethods.validate).toHaveBeenCalledTimes(1)
    expect(wrapper.emitted("submit")).toEqual([
      [{ name: "guest", email: "guest@example.com", allowOthersToEdit: false }],
    ])
  })

  it("styles the guest name field like the edit guest name field and caps it at 100 characters", () => {
    const wrapper = mountDialog({ collectEmails: false })

    const field = wrapper.getComponent(VTextFieldStub)
    expect(field.props("variant")).toBe("outlined")
    expect(field.props("label")).toBe("Guest name (required)")
    expect(field.props("maxlength")).toBe(GUEST_NAME_MAX_LENGTH)
    expect(field.props("appendInnerIcon")).toBe("mdi-alert-circle")
    expect(field.props("hideDetails")).toBe("auto")
    expect(guestDialogSource).toMatch(
      /label="Guest name \(required\)"[^>]*class="timeful-invalid-field"/,
    )
  })

  it("relies on the shared invalid-field treatment instead of local overrides", () => {
    expect(guestDialogSource).toContain("timeful-invalid-field")
    expect(guestDialogSource).not.toMatch(/<style>/)
    expect(appCssSource).toMatch(
      /\.timeful-invalid-field \.v-field,\s*\.timeful-invalid-field\.v-input--error \.v-field\s*\{\s*outline:\s*none;/,
    )
    expect(appCssSource).toMatch(
      /\.timeful-invalid-field \.v-field__append-inner\s*\{\s*visibility:\s*hidden;/,
    )
    expect(appCssSource).toMatch(
      /\.timeful-invalid-field\.v-input--error \.v-field__append-inner\s*\{\s*visibility:\s*visible;/,
    )
    expect(appCssSource).toMatch(
      /\.timeful-invalid-field\.v-input--error \.v-field__outline\s*\{\s*--v-field-border-width:\s*2px;/,
    )
    expect(appCssSource).toMatch(
      /\.timeful-invalid-field\.v-input--error \.v-field--variant-solo\s*\{\s*outline: 2px solid rgb\(var\(--v-theme-error\)\);/,
    )
  })

  it("shows no validation message while the pristine name field is empty", () => {
    const wrapper = mountDialog({ collectEmails: false })

    expect(getFieldMessages(wrapper)).toEqual([])
  })

  it("shows the required-name message once a dirtied name input is emptied", async () => {
    const wrapper = mountDialog({ collectEmails: false })

    const nameInput = wrapper.get("input")
    await nameInput.setValue("Ada")
    expect(getFieldMessages(wrapper)).toEqual([])

    await nameInput.setValue("")

    expect(getFieldMessages(wrapper)).toContain("Name must be non-empty")
  })

  it("shows the taken-name message once the dirtied name matches an existing respondent", async () => {
    const wrapper = mountDialog({
      collectEmails: false,
      respondents: ["guest"],
    })

    await wrapper.findAll("input")[0]?.setValue(" guest ")

    expect(getFieldMessages(wrapper)).toContain("Name already taken")
  })

  it("shows the required-name message and blocks submit when Enter is pressed on the pristine empty field", async () => {
    const wrapper = mountDialog({ collectEmails: false })

    await wrapper.findAll("input")[0]?.trigger("keyup.enter")

    expect(getFieldMessages(wrapper)).toContain("Name must be non-empty")
    expect(wrapper.emitted("submit")).toBeUndefined()
  })

  it("returns to the pristine no-message state when the dialog is reopened", async () => {
    const wrapper = mountDialog({ collectEmails: false })

    const nameInput = wrapper.get("input")
    await nameInput.setValue("Ada")
    await nameInput.setValue("")
    expect(getFieldMessages(wrapper)).toHaveLength(1)

    await wrapper.setProps({ modelValue: false })
    await wrapper.setProps({ modelValue: true })

    expect(getFieldMessages(wrapper)).toEqual([])
  })

  it("forwards the guest payload to a parent submit listener", async () => {
    const onSubmit = vi.fn()
    const ParentHarness = defineComponent({
      components: { GuestDialog },
      setup() {
        const open = ref(true)
        return { open, onSubmit, event: baseEvent }
      },
      template: `
        <GuestDialog
          v-model="open"
          :event="event"
          :respondents="[]"
          @submit="onSubmit"
        />
      `,
    })

    const wrapper = mount(ParentHarness, {
      global: {
        stubs: mergeComponentStubs({
          "v-btn": VBtnStub,
          "v-card": passThroughStub,
          "v-card-text": passThroughStub,
          "v-card-title": passThroughStub,
          "v-checkbox": VCheckboxStub,
          "v-dialog": passThroughStub,
          "v-form": createFormStub(formRefMethods),
          "v-icon": nullStub,
          "v-spacer": nullStub,
          "v-text-field": VTextFieldStub,
        }),
      },
    })

    const inputs = wrapper.findAll("input")
    await inputs[0]?.setValue("guest")
    await inputs[1]?.setValue("guest@example.com")
    await getSubmitButton(wrapper).trigger("click")

    expect(onSubmit).toHaveBeenCalledWith({
      name: "guest",
      email: "guest@example.com",
      allowOthersToEdit: false,
    })
  })

  it("treats whitespace-only name differences as duplicate guest names", async () => {
    formRefMethods.validate.mockImplementationOnce(() =>
      Promise.resolve({ valid: false }),
    )

    const wrapper = mount(GuestDialog, {
      props: {
        modelValue: true,
        event: baseEvent,
        respondents: ["guest"],
      },
      global: {
        stubs: mergeComponentStubs({
          "v-btn": VBtnStub,
          "v-card": passThroughStub,
          "v-card-text": passThroughStub,
          "v-card-title": passThroughStub,
          "v-checkbox": VCheckboxStub,
          "v-dialog": passThroughStub,
          "v-form": createFormStub(formRefMethods),
          "v-icon": nullStub,
          "v-spacer": nullStub,
          "v-text-field": VTextFieldStub,
        }),
      },
    })

    const inputs = wrapper.findAll("input")
    await inputs[0]?.setValue(" guest ")
    await inputs[1]?.setValue(" guest@example.com ")
    await getSubmitButton(wrapper).trigger("click")

    expect(formRefMethods.validate).toHaveBeenCalledTimes(1)
    expect(wrapper.emitted("submit")).toBeUndefined()
  })

  it("normalizes repairable guest names before emitting the payload", async () => {
    const wrapper = mount(GuestDialog, {
      props: {
        modelValue: true,
        event: baseEvent,
        respondents: [],
      },
      global: {
        stubs: mergeComponentStubs({
          "v-btn": VBtnStub,
          "v-card": passThroughStub,
          "v-card-text": passThroughStub,
          "v-card-title": passThroughStub,
          "v-checkbox": VCheckboxStub,
          "v-dialog": passThroughStub,
          "v-form": createFormStub(formRefMethods),
          "v-icon": nullStub,
          "v-spacer": nullStub,
          "v-text-field": VTextFieldStub,
        }),
      },
    })

    const inputs = wrapper.findAll("input")
    await inputs[0]?.setValue("  A\u200bda\u0301  ")
    await inputs[1]?.setValue(" guest@example.com ")
    await getSubmitButton(wrapper).trigger("click")

    expect(wrapper.emitted("submit")).toEqual([
      [{ name: "Adá", email: "guest@example.com", allowOthersToEdit: false }],
    ])
  })

  it("defaults guest ownership to protected and emits open mode when toggled", async () => {
    const wrapper = mount(GuestDialog, {
      props: {
        modelValue: true,
        event: baseEvent,
        respondents: [],
      },
      global: {
        stubs: mergeComponentStubs({
          "v-btn": VBtnStub,
          "v-card": passThroughStub,
          "v-card-text": passThroughStub,
          "v-card-title": passThroughStub,
          "v-checkbox": VCheckboxStub,
          "v-dialog": passThroughStub,
          "v-form": createFormStub(formRefMethods),
          "v-icon": nullStub,
          "v-spacer": nullStub,
          "v-text-field": VTextFieldStub,
        }),
      },
    })

    const checkbox = wrapper.find('input[type="checkbox"]')
    expect((checkbox.element as HTMLInputElement).checked).toBe(false)

    const inputs = wrapper.findAll('input[type="text"], input:not([type])')
    await inputs[0]?.setValue("guest")
    await inputs[1]?.setValue("guest@example.com")
    await checkbox.setValue(true)
    await getSubmitButton(wrapper).trigger("click")

    expect(wrapper.emitted("submit")).toEqual([
      [{ name: "guest", email: "guest@example.com", allowOthersToEdit: true }],
    ])
  })

  it("uses the shared slotted checkbox label styling for availability editing", async () => {
    const wrapper = mount(GuestDialog, {
      props: {
        modelValue: true,
        event: baseEvent,
        respondents: [],
      },
      global: {
        stubs: mergeComponentStubs({
          "v-btn": VBtnStub,
          "v-card": passThroughStub,
          "v-card-text": passThroughStub,
          "v-card-title": passThroughStub,
          "v-checkbox": VCheckboxStub,
          "v-dialog": passThroughStub,
          "v-form": createFormStub(formRefMethods),
          "v-icon": nullStub,
          "v-spacer": nullStub,
          "v-text-field": VTextFieldStub,
        }),
      },
    })

    const label = wrapper.get("span.tw:text-sm")
    expect(label.classes()).toContain("tw:text-very-dark-gray")
    expect(label.text()).toBe("Allow others to edit this availability")

    await wrapper.get('input[type="checkbox"]').setValue(true)

    expect(label.classes()).toContain("tw:text-black")
    expect(label.classes()).not.toContain("tw:text-very-dark-gray")
  })

  it("renders the Continue button flat without the elevated glow styling", () => {
    const appCssSource = readFileSync("src/index.css", "utf8")

    const wrapper = mount(GuestDialog, {
      props: {
        modelValue: true,
        event: baseEvent,
        respondents: [],
      },
      global: {
        stubs: mergeComponentStubs({
          "v-btn": VBtnStub,
          "v-card": passThroughStub,
          "v-card-text": passThroughStub,
          "v-card-title": passThroughStub,
          "v-checkbox": VCheckboxStub,
          "v-dialog": passThroughStub,
          "v-form": createFormStub(formRefMethods),
          "v-icon": nullStub,
          "v-spacer": nullStub,
          "v-text-field": VTextFieldStub,
        }),
      },
    })

    const submitButton = getSubmitButton(wrapper)
    expect(submitButton.classes()).toContain("timeful-flat-button")
    expect(submitButton.classes()).not.toContain("timeful-elevated-button")
    expect(submitButton.classes()).toContain("tw:bg-green")
    expect(submitButton.classes()).toContain("tw:text-white")
    expect(appCssSource).toMatch(
      /\.timeful-flat-button\s*\{[^}]*box-shadow: none !important;/,
    )
  })
})

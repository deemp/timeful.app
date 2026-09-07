// @vitest-environment happy-dom

import { mount } from "@vue/test-utils"
import { describe, expect, it } from "vitest"
import { eventTypes } from "@/constants"
import EventDescription from "./EventDescription.vue"

const baseEvent = {
  _id: "evt-1",
  name: "Planning",
  type: eventTypes.SPECIFIC_DATES,
}

describe("EventDescription", () => {
  it("renders a saved multiline description as read-only text", () => {
    const description = "First line\nSecond line"
    const wrapper = mount(EventDescription, {
      props: { event: { ...baseEvent, description } },
    })

    expect(wrapper.get(".event-description-copy").text()).toBe(description)
    expect(wrapper.get(".event-description-copy").classes()).toContain(
      "tw:whitespace-pre-wrap",
    )
    expect(wrapper.find("button").exists()).toBe(false)
    expect(wrapper.find('[contenteditable="true"]').exists()).toBe(false)
  })

  it("omits the description card when no description was saved", () => {
    const wrapper = mount(EventDescription, {
      props: { event: baseEvent },
    })

    expect(wrapper.find(".event-description-shell").exists()).toBe(false)
    expect(wrapper.find(".event-description-copy").exists()).toBe(false)
  })

  it("omits the description card for whitespace-only descriptions", () => {
    const wrapper = mount(EventDescription, {
      props: { event: { ...baseEvent, description: " \n\t " } },
    })

    expect(wrapper.find(".event-description-shell").exists()).toBe(false)
    expect(wrapper.find(".event-description-copy").exists()).toBe(false)
  })
})

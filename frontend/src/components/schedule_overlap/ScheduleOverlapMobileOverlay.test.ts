// @vitest-environment happy-dom

import { describe, expect, it, vi } from "vitest"
import { mount, shallowMount, type DOMWrapper } from "@vue/test-utils"
import { availabilityTypes } from "@/constants"
import { states } from "@/composables/schedule_overlap/types"
import EditingAvailabilityAs from "./EditingAvailabilityAs.vue"
import ScheduleOverlapMobileOverlay from "./ScheduleOverlapMobileOverlay.vue"
import {
  buildScheduleOverlapMobileOverlayViewModel,
  scheduleOverlapGlobalStubs,
} from "./scheduleOverlapTestUtils"

describe("ScheduleOverlapMobileOverlay", () => {
  it("renders the extracted mobile-only boundaries from a single presentational child", () => {
    const wrapper = shallowMount(ScheduleOverlapMobileOverlay, {
      props: {
        overlay: {
          ...buildScheduleOverlapMobileOverlayViewModel(),
          hintTextShown: true,
          hintText: "Tap the grid to add availability",
          editing: true,
          availabilityType: availabilityTypes.AVAILABLE,
          isWeekly: true,
          calendarPermissionGranted: true,
          weekOffset: 1,
          showStickyRespondents: false,
          state: states.SET_SPECIFIC_TIMES,
          numTempTimes: 2,
        },
      },
      global: {
        stubs: {
          ...scheduleOverlapGlobalStubs,
          "v-expand-transition": {
            template: "<div><slot /></div>",
          },
        },
      },
    })

    expect(wrapper.findComponent({ name: "GCalWeekSelector" }).exists()).toBe(
      true,
    )
    expect(
      wrapper.findComponent({ name: "SpecificTimesInstructions" }).exists(),
    ).toBe(true)
    expect(
      wrapper.find(".schedule-overlap-mobile-overlay").classes(),
    ).toContain("tw-inset-x-0")
  })

  it("hides sticky respondents while editing availability", () => {
    const wrapper = shallowMount(ScheduleOverlapMobileOverlay, {
      props: {
        overlay: {
          ...buildScheduleOverlapMobileOverlayViewModel(),
          editing: true,
          availabilityType: availabilityTypes.AVAILABLE,
          showStickyRespondents: true,
        },
      },
      global: {
        stubs: {
          ...scheduleOverlapGlobalStubs,
          "v-expand-transition": {
            template: "<div><slot /></div>",
          },
        },
      },
    })

    expect(
      wrapper.findComponent({ name: "AvailabilityTypeToggle" }).exists(),
    ).toBe(true)
    expect(
      wrapper
        .findComponent({ name: "ScheduleOverlapRespondentsPanel" })
        .exists(),
    ).toBe(false)
  })

  it("elevates the sticky respondents panel with the shared mobile bottom panel treatment", () => {
    const wrapper = mount(ScheduleOverlapMobileOverlay, {
      props: {
        overlay: {
          ...buildScheduleOverlapMobileOverlayViewModel(),
          showStickyRespondents: true,
        },
      },
      global: {
        stubs: {
          ...scheduleOverlapGlobalStubs,
          "v-expand-transition": {
            template: "<div><slot /></div>",
          },
        },
      },
    })

    const respondentsSection = wrapper.find(".timeful-mobile-elevated-panel")
    expect(respondentsSection.exists()).toBe(true)
    expect(respondentsSection.classes()).toContain("tw-px-4")
    expect(respondentsSection.classes()).toContain("tw-pt-4")
    expect(respondentsSection.classes()).not.toContain("tw-p-4")
    expect(
      respondentsSection
        .findComponent({ name: "ScheduleOverlapRespondentsPanel" })
        .exists(),
    ).toBe(true)
    expect(wrapper.findAll(".timeful-mobile-elevated-panel")).toHaveLength(1)
    expectElevatedPanelOnTransitionTarget(
      wrapper.get(".schedule-overlap-mobile-overlay").element,
      respondentsSection,
    )
  })

  it("passes a 240px list cap to the sticky respondents panel", () => {
    const wrapper = mount(ScheduleOverlapMobileOverlay, {
      props: {
        overlay: {
          ...buildScheduleOverlapMobileOverlayViewModel(),
          showStickyRespondents: true,
        },
      },
      global: {
        stubs: {
          ...scheduleOverlapGlobalStubs,
          "v-expand-transition": {
            template: "<div><slot /></div>",
          },
        },
      },
    })

    expect(
      wrapper
        .getComponent({ name: "ScheduleOverlapRespondentsPanel" })
        .props("maxHeight"),
    ).toBe(240)
  })

  it("elevates the response editing panel with the shared mobile bottom panel treatment", () => {
    const wrapper = shallowMount(ScheduleOverlapMobileOverlay, {
      props: {
        overlay: {
          ...buildScheduleOverlapMobileOverlayViewModel(),
          editing: true,
          availabilityType: availabilityTypes.AVAILABLE,
        },
      },
      global: {
        stubs: {
          ...scheduleOverlapGlobalStubs,
          "v-expand-transition": {
            template: "<div><slot /></div>",
          },
        },
      },
    })

    const editingPanel = wrapper.find(".timeful-mobile-elevated-panel")
    expect(editingPanel.exists()).toBe(true)
    expect(
      editingPanel.findComponent({ name: "AvailabilityTypeToggle" }).exists(),
    ).toBe(true)
    expectElevatedPanelOnTransitionTarget(
      wrapper.get(".schedule-overlap-mobile-overlay").element,
      editingPanel,
    )
  })

  it("places the calendar options button left of the availability toggle in one editing row", async () => {
    const wrapper = shallowMount(ScheduleOverlapMobileOverlay, {
      props: {
        overlay: {
          ...buildScheduleOverlapMobileOverlayViewModel(),
          editing: true,
          availabilityType: availabilityTypes.AVAILABLE,
        },
      },
      global: {
        stubs: {
          ...scheduleOverlapGlobalStubs,
          "v-expand-transition": {
            template: "<div><slot /></div>",
          },
          "v-btn": {
            template: "<button><slot /></button>",
          },
        },
      },
    })

    const toggle = wrapper.findComponent({ name: "AvailabilityTypeToggle" })
    expect(toggle.classes()).toContain("tw-flex-1")
    expect(toggle.classes()).not.toContain("tw-w-full")

    const calendarOptionsButton = wrapper.get(".calendar-options-button")
    expect(calendarOptionsButton.text()).toBe("Calendar options")
    expect(calendarOptionsButton.attributes("prepend-icon")).toBe(
      "mdi-calendar",
    )
    expect(calendarOptionsButton.classes()).not.toContain("tw-w-full")
    const toggleEl = toggle.element as Element
    const rowChildren = Array.from(toggleEl.parentElement?.children ?? [])
    expect(rowChildren.indexOf(calendarOptionsButton.element)).toBeLessThan(
      rowChildren.indexOf(toggleEl),
    )

    await calendarOptionsButton.trigger("click")

    expect(wrapper.emitted("update:calendarOptionsDialog")).toEqual([[true]])
  })

  it("shows the chip editing-availability-as indicator as a right-aligned block above the calendar options and toggle row while editing", () => {
    const wrapper = mount(ScheduleOverlapMobileOverlay, {
      props: {
        overlay: {
          ...buildScheduleOverlapMobileOverlayViewModel(),
          editing: true,
          availabilityType: availabilityTypes.AVAILABLE,
          editingAvailabilityAs: {
            visible: true,
            actionText: "Editing",
            actorName: "Dana Guest",
            editableGuestName: null,
          },
        },
      },
      global: {
        stubs: {
          ...scheduleOverlapGlobalStubs,
          "v-expand-transition": {
            template: "<div><slot /></div>",
          },
        },
      },
    })

    const indicatorComponent = wrapper.getComponent(EditingAvailabilityAs)
    expect(indicatorComponent.props("variant")).toBe("chip")

    const indicator = wrapper.get(".editing-availability-as--chip")
    expect(indicator.classes()).toContain("tw-justify-end")
    expect(indicator.classes()).toContain("tw-not-italic")
    expect(indicator.text()).toContain("Editing availability as")
    expect(indicator.text()).toContain("Dana Guest")

    const chipRow = indicator.get(".editing-availability-as__chip-row")
    expect(chipRow.classes()).not.toContain("tw-justify-end")

    const toggle = wrapper.getComponent({ name: "AvailabilityTypeToggle" })
    const toggleEl = toggle.element as Element
    expect(
      indicator.element.compareDocumentPosition(toggleEl) &
        Node.DOCUMENT_POSITION_FOLLOWING,
    ).toBeTruthy()
  })

  it("hides the editing-availability-as indicator when the view model marks it invisible", () => {
    const wrapper = mount(ScheduleOverlapMobileOverlay, {
      props: {
        overlay: {
          ...buildScheduleOverlapMobileOverlayViewModel(),
          editing: true,
          availabilityType: availabilityTypes.AVAILABLE,
          editingAvailabilityAs: {
            visible: false,
            actionText: "Adding",
            actorName: "a guest",
            editableGuestName: null,
          },
        },
      },
      global: {
        stubs: {
          ...scheduleOverlapGlobalStubs,
          "v-expand-transition": {
            template: "<div><slot /></div>",
          },
        },
      },
    })

    expect(wrapper.find(".editing-availability-as").exists()).toBe(false)
    expect(wrapper.text()).not.toContain("availability as")
  })

  it("re-emits guest name editing events from the panel indicator", async () => {
    const wrapper = mount(ScheduleOverlapMobileOverlay, {
      props: {
        overlay: {
          ...buildScheduleOverlapMobileOverlayViewModel(),
          editing: true,
          availabilityType: availabilityTypes.AVAILABLE,
          newGuestName: "d",
          editingAvailabilityAs: {
            visible: true,
            actionText: "Editing",
            actorName: "d",
            editableGuestName: "d",
          },
        },
      },
      global: {
        stubs: {
          ...scheduleOverlapGlobalStubs,
          "v-expand-transition": {
            template: "<div><slot /></div>",
          },
          "v-dialog": {
            template: "<div><slot /></div>",
          },
          "v-card": {
            template: "<div><slot /></div>",
          },
          "v-card-text": {
            template: "<div><slot /></div>",
          },
          "v-card-actions": {
            template: "<div><slot /></div>",
          },
          "v-btn": {
            template: "<button><slot /></button>",
          },
        },
      },
    })

    await wrapper.get(".editing-availability-as__guest-chip").trigger("click")
    expect(wrapper.emitted("openEditGuestNameDialog")).toHaveLength(1)

    const saveButton = wrapper
      .findAll("button")
      .find((node) => node.text() === "Save")
    if (!saveButton) {
      throw new Error("Expected dialog Save button to be rendered")
    }
    await saveButton.trigger("click")
    expect(wrapper.emitted("saveGuestName")).toHaveLength(1)
  })

  it("hides the calendar options button for days-only events or when calendar options are unavailable", () => {
    const base = {
      ...buildScheduleOverlapMobileOverlayViewModel(),
      editing: true,
      availabilityType: availabilityTypes.AVAILABLE,
    }

    const daysOnlyWrapper = shallowMount(ScheduleOverlapMobileOverlay, {
      props: {
        overlay: {
          ...base,
          event: {
            ...base.event,
            daysOnly: true,
          },
        },
      },
      global: {
        stubs: {
          ...scheduleOverlapGlobalStubs,
          "v-expand-transition": {
            template: "<div><slot /></div>",
          },
        },
      },
    })
    expect(daysOnlyWrapper.find(".calendar-options-button").exists()).toBe(
      false,
    )

    const gatedWrapper = shallowMount(ScheduleOverlapMobileOverlay, {
      props: {
        overlay: {
          ...base,
          showCalendarOptions: false,
        },
      },
      global: {
        stubs: {
          ...scheduleOverlapGlobalStubs,
          "v-expand-transition": {
            template: "<div><slot /></div>",
          },
        },
      },
    })
    expect(gatedWrapper.find(".calendar-options-button").exists()).toBe(false)
  })

  it("re-emits respondents-panel events through the grouped overlay listener bridge", async () => {
    const wrapper = mount(ScheduleOverlapMobileOverlay, {
      props: {
        overlay: buildScheduleOverlapMobileOverlayViewModel(),
      },
      global: {
        stubs: {
          ...scheduleOverlapGlobalStubs,
          "v-expand-transition": {
            template: "<div><slot /></div>",
          },
          RespondentsList: {
            name: "RespondentsList",
            emits: [
              "update:showCalendarEvents",
              "mouseOverRespondent",
              "refreshEvent",
            ],
            template: `
              <div>
                <button class="show-calendar" @click="$emit('update:showCalendarEvents', false)" />
                <button
                  class="mouse-over"
                  @click="$emit('mouseOverRespondent', $event, 'user-1')"
                />
                <button class="refresh" @click="$emit('refreshEvent')" />
              </div>
            `,
          },
        },
      },
    })

    await wrapper.find("button.show-calendar").trigger("click")
    await wrapper.find("button.mouse-over").trigger("click")
    await wrapper.find("button.refresh").trigger("click")

    expect(wrapper.emitted("update:showCalendarEvents")?.[0]).toEqual([false])
    expect(wrapper.emitted("mouseOverRespondent")?.[0]?.[1]).toBe("user-1")
    expect(wrapper.emitted("refreshEvent")).toHaveLength(1)
  })

  it("keeps panel clicks inside the mobile overlay", async () => {
    const outsideClick = vi.fn()
    document.addEventListener("click", outsideClick)
    const wrapper = mount(ScheduleOverlapMobileOverlay, {
      props: {
        overlay: buildScheduleOverlapMobileOverlayViewModel(),
      },
      global: {
        stubs: {
          ...scheduleOverlapGlobalStubs,
          "v-expand-transition": {
            template: "<div><slot /></div>",
          },
        },
      },
    })

    await wrapper.find(".schedule-overlap-mobile-overlay").trigger("click")

    expect(outsideClick).not.toHaveBeenCalled()
    document.removeEventListener("click", outsideClick)
  })

  it("reports its measured height so the page can reserve space for the fixed stack", () => {
    class ResizeObserverStub {
      static instances: ResizeObserverStub[] = []
      callback: ResizeObserverCallback

      constructor(callback: ResizeObserverCallback) {
        this.callback = callback
        ResizeObserverStub.instances.push(this)
      }

      observe(): void {}

      unobserve(): void {}

      disconnect(): void {}
    }

    vi.stubGlobal("ResizeObserver", ResizeObserverStub)
    ResizeObserverStub.instances = []
    try {
      const wrapper = mount(ScheduleOverlapMobileOverlay, {
        props: {
          overlay: {
            ...buildScheduleOverlapMobileOverlayViewModel(),
            editing: true,
            availabilityType: availabilityTypes.AVAILABLE,
          },
        },
        global: {
          stubs: {
            ...scheduleOverlapGlobalStubs,
            "v-expand-transition": {
              template: "<div><slot /></div>",
            },
          },
        },
      })

      expect(wrapper.emitted("overlayHeightChange")).toBeUndefined()

      const observer = ResizeObserverStub.instances[0]
      observer.callback(
        [
          {
            contentRect: { height: 82.4 },
          } as unknown as ResizeObserverEntry,
        ],
        observer,
      )

      expect(wrapper.emitted("overlayHeightChange")?.[0]).toEqual([82])

      observer.callback(
        [
          {
            contentRect: { height: 82 },
          } as unknown as ResizeObserverEntry,
        ],
        observer,
      )

      expect(wrapper.emitted("overlayHeightChange")).toHaveLength(1)
    } finally {
      vi.unstubAllGlobals()
    }
  })
})

const expectElevatedPanelOnTransitionTarget = (
  overlayRoot: Element,
  elevatedPanel: DOMWrapper<Element>,
) => {
  // The expand transition sets overflow:hidden on its target while sliding, which
  // clips a nested panel's upward shadow; the elevated panel must therefore sit
  // directly on the transition target, whose own shadow is never self-clipped.
  const transitionTarget = elevatedPanel.element.parentElement
  expect(transitionTarget).toBeInstanceOf(HTMLDivElement)
  expect(transitionTarget?.parentElement).toBe(overlayRoot)
}

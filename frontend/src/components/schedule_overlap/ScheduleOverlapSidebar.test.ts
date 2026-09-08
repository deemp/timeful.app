// @vitest-environment happy-dom

import { mount, shallowMount } from "@vue/test-utils"
import { h, nextTick, ref, type ComponentPublicInstance } from "vue"
import { describe, expect, it, vi } from "vitest"
import { states } from "@/composables/schedule_overlap/types"
import ColorLegend from "./ColorLegend.vue"
import EditingAvailabilityAs from "./EditingAvailabilityAs.vue"
import ScheduleOverlapSidebar from "./ScheduleOverlapSidebar.vue"
import type {
  ScheduleOverlapRespondentsPanelExposed,
  ScheduleOverlapSidebarExposed,
} from "./scheduleOverlapContracts"
import {
  buildEditingAvailabilityAsViewModel,
  buildScheduleOverlapProps,
  buildScheduleOverlapSidebarViewModel,
  scheduleOverlapGlobalStubs,
} from "./scheduleOverlapTestUtils"

type ExposeFn<T> = (exposed?: T) => void

describe("ScheduleOverlapSidebar", () => {
  it("exposes the sign-up block scroll bridge through the child ref boundary", () => {
    const scrollToSignUpBlock = vi.fn()
    const SignUpBlocksListStub = {
      name: "SignUpBlocksList",
      setup(
        _: unknown,
        {
          expose,
        }: {
          expose: ExposeFn<{ scrollToSignUpBlock: typeof scrollToSignUpBlock }>
        },
      ) {
        expose({ scrollToSignUpBlock })
        return () => null
      },
    }

    const wrapper = shallowMount(ScheduleOverlapSidebar, {
      props: {
        sidebar: {
          ...buildScheduleOverlapSidebarViewModel(),
          isSignUp: true,
        },
      },
      global: {
        stubs: {
          ...scheduleOverlapGlobalStubs,
          SignUpBlocksList: SignUpBlocksListStub,
        },
      },
    })

    ;(
      wrapper.vm as ComponentPublicInstance & ScheduleOverlapSidebarExposed
    ).scrollToSignUpBlock?.("block-42")

    expect(scrollToSignUpBlock).toHaveBeenCalledWith("block-42")
  })

  it("exposes the options section element while edit controls are rendered", () => {
    const wrapper = mount(ScheduleOverlapSidebar, {
      props: {
        sidebar: buildScheduleOverlapSidebarViewModel(),
      },
      global: {
        stubs: {
          ...scheduleOverlapGlobalStubs,
        },
      },
    })

    const vm = wrapper.vm as ComponentPublicInstance &
      ScheduleOverlapSidebarExposed

    expect(vm.optionsSectionEl).toBeInstanceOf(HTMLElement)
  })

  it("renders the calendar options button directly on desktop without the Options section", async () => {
    const wrapper = mount(ScheduleOverlapSidebar, {
      props: {
        sidebar: buildScheduleOverlapSidebarViewModel(),
      },
      global: {
        stubs: {
          ...scheduleOverlapGlobalStubs,
          "v-btn": {
            template: "<button><slot /></button>",
          },
        },
      },
    })

    const calendarOptionsButton = wrapper.get(".calendar-options-button")

    expect(calendarOptionsButton.text()).toBe("Calendar options")
    expect(calendarOptionsButton.attributes("prepend-icon")).toBe(
      "mdi-calendar",
    )
    expect(calendarOptionsButton.classes()).toContain("tw:w-full")
    expect(wrapper.find("expandable-section-stub").exists()).toBe(false)

    await calendarOptionsButton.trigger("click")

    expect(wrapper.emitted("update:calendarOptionsDialog")).toEqual([[true]])
  })

  it("renders no collapsible Options section or calendar options button on mobile while editing", () => {
    const wrapper = mount(ScheduleOverlapSidebar, {
      props: {
        sidebar: {
          ...buildScheduleOverlapSidebarViewModel(),
          isPhone: true,
        },
      },
      global: {
        stubs: {
          ...scheduleOverlapGlobalStubs,
        },
      },
    })

    expect(wrapper.find(".calendar-options-button").exists()).toBe(false)
    expect(wrapper.find("expandable-section-stub").exists()).toBe(false)
    expect(wrapper.text()).not.toContain("Calendar options")
  })

  it("renders no editing-availability-as indicator in the phone sidebar while editing", () => {
    const wrapper = mount(ScheduleOverlapSidebar, {
      props: {
        sidebar: {
          ...buildScheduleOverlapSidebarViewModel(),
          state: states.EDIT_AVAILABILITY,
          isPhone: true,
        },
      },
      global: {
        stubs: {
          ...scheduleOverlapGlobalStubs,
        },
      },
    })

    expect(wrapper.find(".editing-availability-as").exists()).toBe(false)
    expect(wrapper.text()).not.toContain("availability as")
  })

  it("keeps the editing-availability-as indicator in the phone sidebar for group events", () => {
    const wrapper = mount(ScheduleOverlapSidebar, {
      props: {
        sidebar: {
          ...buildScheduleOverlapSidebarViewModel(),
          state: states.EDIT_AVAILABILITY,
          isPhone: true,
          isGroup: true,
        },
      },
      global: {
        stubs: {
          ...scheduleOverlapGlobalStubs,
        },
      },
    })

    expect(wrapper.get(".editing-availability-as").text()).toContain(
      "Adding availability as a guest",
    )

    const indicatorComponent = wrapper.getComponent(EditingAvailabilityAs)
    expect(indicatorComponent.props("variant")).toBe("sentence")
    expect(wrapper.find(".editing-availability-as--chip").exists()).toBe(false)
  })

  it("keeps the editing-availability-as indicator in the desktop sidebar while editing", () => {
    const wrapper = mount(ScheduleOverlapSidebar, {
      props: {
        sidebar: {
          ...buildScheduleOverlapSidebarViewModel(),
          state: states.EDIT_AVAILABILITY,
          isPhone: false,
        },
      },
      global: {
        stubs: {
          ...scheduleOverlapGlobalStubs,
        },
      },
    })

    expect(wrapper.get(".editing-availability-as").text()).toContain(
      "Adding availability as a guest",
    )
  })

  it("renders the desktop editing indicator as a left-aligned non-italic label with a name chip", () => {
    const wrapper = mount(ScheduleOverlapSidebar, {
      props: {
        sidebar: {
          ...buildScheduleOverlapSidebarViewModel(),
          state: states.EDIT_AVAILABILITY,
          isPhone: false,
          editingAvailabilityAs: {
            ...buildEditingAvailabilityAsViewModel(),
            actionText: "Editing",
            editableGuestName: "Dana",
          },
        },
      },
      global: {
        stubs: {
          ...scheduleOverlapGlobalStubs,
        },
      },
    })

    const indicatorComponent = wrapper.getComponent(EditingAvailabilityAs)
    expect(indicatorComponent.props("variant")).toBe("chip")

    const indicator = wrapper.get(".editing-availability-as--chip")
    expect(indicator.classes()).toContain("tw:not-italic")
    expect(indicator.classes()).not.toContain("tw:justify-end")
    expect(indicator.text()).toContain("Editing availability as")

    const chip = wrapper.get(".editing-availability-as__guest-chip")
    expect(chip.text()).toContain("Dana")
  })

  it("exposes the respondents panel element while the panel branch is rendered", async () => {
    const wrapper = mount(ScheduleOverlapSidebar, {
      props: {
        sidebar: {
          ...buildScheduleOverlapSidebarViewModel(),
          state: states.HEATMAP,
        },
      },
      global: {
        stubs: {
          ...scheduleOverlapGlobalStubs,
          ScheduleOverlapRespondentsPanel: {
            name: "ScheduleOverlapRespondentsPanel",
            setup(
              _: unknown,
              {
                expose,
              }: { expose: ExposeFn<ScheduleOverlapRespondentsPanelExposed> },
            ) {
              const panelEl = ref<HTMLElement | null>(null)
              expose({
                get panelEl() {
                  return panelEl.value
                },
              })
              return () =>
                h("div", { ref: panelEl, class: "respondents-panel-stub" })
            },
          },
        },
      },
    })

    await nextTick()

    const vm = wrapper.vm as ComponentPublicInstance &
      ScheduleOverlapSidebarExposed

    expect(vm.respondentsPanelEl).toBeInstanceOf(HTMLElement)
    expect(vm.respondentsPanelEl?.className).toContain("respondents-panel-stub")
  })

  it("shows the disabled date-range legend entries for timed range events", () => {
    const wrapper = mount(ScheduleOverlapSidebar, {
      props: {
        sidebar: {
          ...buildScheduleOverlapSidebarViewModel(),
          state: states.BEST_TIMES,
          activeSlotsCount: 1,
          responseCount: 0,
        },
      },
      global: {
        stubs: {
          ...scheduleOverlapGlobalStubs,
          ColorLegend,
        },
      },
    })

    expect(wrapper.text()).toContain(
      "Unavailable, change in Add/Edit availability",
    )
    expect(wrapper.text()).toContain(
      "Disabled, inside the event dates in the event timezone",
    )
    expect(wrapper.html()).toContain("tw:bg-light-gray-stroke")
    expect(wrapper.text()).toContain(
      "Disabled, outside the event dates in the event timezone",
    )
  })

  it("shows the disabled date-range legend entries for days-only events", () => {
    const wrapper = mount(ScheduleOverlapSidebar, {
      props: {
        sidebar: {
          ...buildScheduleOverlapSidebarViewModel(),
          state: states.BEST_TIMES,
          event: {
            ...buildScheduleOverlapSidebarViewModel().event,
            daysOnly: true,
          },
        },
      },
      global: {
        stubs: {
          ...scheduleOverlapGlobalStubs,
          ColorLegend,
        },
      },
    })

    expect(wrapper.text()).toContain(
      "Disabled, inside the event dates in the event timezone",
    )
    expect(wrapper.text()).toContain(
      "Disabled, outside the event dates in the event timezone",
    )
    expect(wrapper.text()).not.toContain("Disabled, change in Edit event")
  })

  it("shows the collapsed-hours legend item when hours can collapse", () => {
    const wrapper = mount(ScheduleOverlapSidebar, {
      props: {
        sidebar: {
          ...buildScheduleOverlapSidebarViewModel(),
          state: states.BEST_TIMES,
          activeSlotsCount: 1,
          canCollapseHours: true,
        },
      },
      global: {
        stubs: {
          ...scheduleOverlapGlobalStubs,
          ColorLegend,
        },
      },
    })

    expect(wrapper.text()).toContain("Disabled, collapsed")
  })

  it("does not render the overlay availability switch in the sidebar", () => {
    const wrapper = mount(ScheduleOverlapSidebar, {
      props: {
        sidebar: {
          ...buildScheduleOverlapSidebarViewModel(),
          showOverlayAvailabilityToggle: true,
        },
      },
      global: {
        stubs: {
          ...scheduleOverlapGlobalStubs,
        },
      },
    })

    const overlaySwitch = wrapper.find("#overlay-availabilities-toggle")

    expect(overlaySwitch.exists()).toBe(false)
  })

  it("keeps the desktop sidebar sticky at 640px+", () => {
    const wrapper = mount(ScheduleOverlapSidebar, {
      props: {
        sidebar: {
          ...buildScheduleOverlapSidebarViewModel(),
          state: states.HEATMAP,
          isPhone: false,
          rightSideWidth: "13rem",
        },
      },
      global: {
        stubs: {
          ...scheduleOverlapGlobalStubs,
        },
      },
    })

    expect(wrapper.classes()).toContain("tw:sticky")
  })

  it("places the desktop control block above the respondents panel", () => {
    const wrapper = mount(ScheduleOverlapSidebar, {
      props: {
        sidebar: {
          ...buildScheduleOverlapSidebarViewModel(),
          state: states.HEATMAP,
          isPhone: false,
        },
      },
      global: {
        stubs: {
          ...scheduleOverlapGlobalStubs,
        },
      },
    })

    expect(wrapper.classes()).toContain("tw:sticky")
    expect(wrapper.classes()).not.toContain("tw:pt-11")
    expect(wrapper.find(".schedule-overlap-sidebar__pager").exists()).toBe(true)
    expect(wrapper.find(".schedule-overlap-sidebar__tool-row").exists()).toBe(
      true,
    )
    expect(wrapper.html()).toContain("tw:pt-2")
  })

  it("places compact timezone and format controls before desktop responses", () => {
    const wrapper = mount(ScheduleOverlapSidebar, {
      props: {
        sidebar: {
          ...buildScheduleOverlapSidebarViewModel(),
          state: states.HEATMAP,
          isPhone: false,
        },
      },
      global: {
        stubs: {
          ...scheduleOverlapGlobalStubs,
          ToolRow: {
            name: "ToolRow",
            props: ["compact"],
            template: "<div class='tool-row-stub' />",
          },
          ScheduleOverlapRespondentsPanel: {
            name: "ScheduleOverlapRespondentsPanel",
            template: "<div class='respondents-panel-stub' />",
          },
        },
      },
    })

    const toolRow = wrapper.get(".schedule-overlap-sidebar__tool-row")
    const respondentsPanel = wrapper.get(".respondents-panel-stub")
    const pager = wrapper.get(".schedule-overlap-sidebar__pager")

    expect(toolRow.getComponent({ name: "ToolRow" }).props("compact")).toBe(
      true,
    )
    expect(
      toolRow.element.compareDocumentPosition(respondentsPanel.element) &
        Node.DOCUMENT_POSITION_FOLLOWING,
    ).toBeTruthy()
    expect(
      pager.element.compareDocumentPosition(toolRow.element) &
        Node.DOCUMENT_POSITION_FOLLOWING,
    ).toBeTruthy()
  })

  it("places compact timezone and format controls between specific-times guidance and legend", () => {
    const wrapper = mount(ScheduleOverlapSidebar, {
      props: {
        sidebar: {
          ...buildScheduleOverlapSidebarViewModel(),
          state: states.SET_SPECIFIC_TIMES,
          isPhone: false,
        },
      },
      global: {
        stubs: {
          ...scheduleOverlapGlobalStubs,
          SpecificTimesInstructions: false,
          ToolRow: {
            name: "ToolRow",
            props: ["compact"],
            template: "<div class='tool-row-stub' />",
          },
        },
      },
    })

    const guidance = wrapper.get(".specific-times-instructions__guidance")
    const toolRow = wrapper.get(".tool-row-stub")
    const legend = wrapper.get(".specific-times-instructions__legend")

    expect(
      guidance.element.compareDocumentPosition(toolRow.element) &
        Node.DOCUMENT_POSITION_FOLLOWING,
    ).toBeTruthy()
    expect(
      toolRow.element.compareDocumentPosition(legend.element) &
        Node.DOCUMENT_POSITION_FOLLOWING,
    ).toBeTruthy()
    expect(toolRow.getComponent({ name: "ToolRow" }).props("compact")).toBe(
      true,
    )
  })

  it("removes desktop sidebar padding to align specific-times guidance with the grid header", () => {
    const wrapper = mount(ScheduleOverlapSidebar, {
      props: {
        sidebar: {
          ...buildScheduleOverlapSidebarViewModel(),
          state: states.SET_SPECIFIC_TIMES,
          isPhone: false,
        },
      },
      global: {
        stubs: {
          ...scheduleOverlapGlobalStubs,
          SpecificTimesInstructions: false,
        },
      },
    })

    expect(wrapper.classes()).toContain("tw:p-0")
    expect(wrapper.classes()).not.toContain("tw:py-4")
  })

  it("keeps the hovered respondents state aligned with the grid body", () => {
    const wrapper = mount(ScheduleOverlapSidebar, {
      props: {
        sidebar: {
          ...buildScheduleOverlapSidebarViewModel(),
          state: states.SINGLE_AVAILABILITY,
          isPhone: false,
        },
      },
      global: {
        stubs: {
          ...scheduleOverlapGlobalStubs,
        },
      },
    })

    expect(wrapper.classes()).toContain("tw:sticky")
    expect(wrapper.classes()).not.toContain("tw:pt-11")
    expect(wrapper.classes()).not.toContain("tw:pt-14")
  })

  it("keeps the desktop top offset while rendering edit availability controls", () => {
    const wrapper = mount(ScheduleOverlapSidebar, {
      props: {
        sidebar: {
          ...buildScheduleOverlapSidebarViewModel(),
          state: states.EDIT_AVAILABILITY,
          isPhone: false,
        },
      },
      global: {
        stubs: {
          ...scheduleOverlapGlobalStubs,
        },
      },
    })

    expect(wrapper.classes()).toContain("tw:sticky")
    expect(wrapper.classes()).not.toContain("tw:pt-14")
    expect(wrapper.get(".schedule-overlap-sidebar__body").classes()).toContain(
      "tw:pt-5",
    )
    expect(
      wrapper.find(".tw\\:flex.tw\\:flex-col.tw\\:gap-5").classes(),
    ).toContain("tw:mb-2")
  })

  it("offsets the desktop days-only sidebar to the top of the grid", () => {
    const wrapper = mount(ScheduleOverlapSidebar, {
      props: {
        sidebar: {
          ...buildScheduleOverlapSidebarViewModel(),
          state: states.BEST_TIMES,
          isPhone: false,
          event: {
            ...buildScheduleOverlapProps().event,
            daysOnly: true,
          },
        },
      },
      global: {
        stubs: {
          ...scheduleOverlapGlobalStubs,
        },
      },
    })

    expect(wrapper.html()).toContain("tw:pt-16")
    expect(wrapper.html()).not.toContain("tw:mt-3")
    expect(wrapper.html()).not.toContain("tw:pt-2")
    expect(wrapper.html()).not.toContain("tw:pt-4")
    expect(wrapper.html()).not.toContain("tw:pt-14")
    expect(wrapper.find(".schedule-overlap-sidebar__tool-row").exists()).toBe(
      false,
    )
  })

  it("keeps the days-only grid-top offset while rendering edit availability controls", () => {
    const wrapper = mount(ScheduleOverlapSidebar, {
      props: {
        sidebar: {
          ...buildScheduleOverlapSidebarViewModel(),
          state: states.EDIT_AVAILABILITY,
          isPhone: false,
          event: {
            ...buildScheduleOverlapProps().event,
            daysOnly: true,
          },
        },
      },
      global: {
        stubs: {
          ...scheduleOverlapGlobalStubs,
        },
      },
    })

    expect(wrapper.html()).toContain("tw:pt-16")
    expect(wrapper.html()).not.toContain("tw:mt-3")
    expect(wrapper.html()).not.toContain("tw:pt-2")
    expect(wrapper.html()).not.toContain("tw:pt-4")
    expect(wrapper.html()).not.toContain("tw:pt-14")
    expect(
      wrapper.find(".tw\\:flex.tw\\:flex-col.tw\\:gap-5").classes(),
    ).toContain("tw:mb-2")
  })
})

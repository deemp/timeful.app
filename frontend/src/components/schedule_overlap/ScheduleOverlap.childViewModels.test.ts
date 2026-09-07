// @vitest-environment happy-dom

import { beforeEach, describe, expect, it, vi } from "vitest"
import { nextTick } from "vue"
import { Temporal } from "temporal-polyfill"
import { eventTypes } from "@/constants"
import { states } from "@/composables/schedule_overlap/types"
import { ZdtMap } from "@/utils"
import {
  resetScheduleOverlapMocks,
  viewportWidth,
} from "./scheduleOverlapTestMocks"
import {
  buildScheduleOverlapProps,
  installScheduleOverlapTestGlobals,
  mountScheduleOverlap,
  type ScheduleOverlapWrapper,
  utcTimezone,
  zdt,
} from "./scheduleOverlapTestUtils"

describe("ScheduleOverlap child view models", () => {
  beforeEach(() => {
    resetScheduleOverlapMocks()
    installScheduleOverlapTestGlobals()
  })

  const buildTwoRespondentEvent = (
    overrides: Record<string, unknown> = {},
  ) => ({
    ...buildScheduleOverlapProps().event,
    responses: {
      "user-1": {
        name: "user-1",
        user: {
          _id: "user-1",
          firstName: "user-1",
          lastName: "",
          email: "",
        },
        availability: [zdt("2026-01-01T09:00:00Z")],
        ifNeeded: [],
        manualAvailability: {},
      },
      "user-2": {
        name: "user-2",
        user: {
          _id: "user-2",
          firstName: "user-2",
          lastName: "",
          email: "",
        },
        availability: [zdt("2026-01-01T10:00:00Z")],
        ifNeeded: [],
        manualAvailability: {},
      },
    },
    ...overrides,
  })

  const mountWithSidebarStub = (event: Record<string, unknown>) =>
    mountScheduleOverlap({
      props: { event },
      global: {
        stubs: {
          ScheduleOverlapSidebar: {
            name: "ScheduleOverlapSidebar",
            props: {
              sidebar: {
                type: Object,
                required: true,
              },
            },
            template: "<div />",
          },
        },
      },
    })

  const getRespondentsPanelNote = (wrapper: ScheduleOverlapWrapper) => {
    const sidebarViewModel = wrapper
      .findComponent({ name: "ScheduleOverlapSidebar" })
      .props("sidebar") as {
      respondentsPanel: { allAvailableNote: string | null }
    }
    return sidebarViewModel.respondentsPanel.allAvailableNote
  }

  const setFetchedResponses = async (
    wrapper: ScheduleOverlapWrapper,
    fetchedAvailability: Record<string, Temporal.ZonedDateTime[]>,
  ) => {
    // Let the mount-time response fetch settle before overriding its result,
    // so this assignment is not clobbered by the fetch handler.
    await new Promise((resolve) => setTimeout(resolve, 0))
    const vm = wrapper.vm as unknown as {
      fetchedResponses: Record<string, unknown>
      responsesFormatted: ZdtMap<Set<string>>
    }
    vm.fetchedResponses = Object.fromEntries(
      Object.entries(fetchedAvailability).map(([userId, availability]) => [
        userId,
        {
          name: userId,
          user: {
            _id: userId,
            firstName: userId,
            lastName: "",
            email: "",
          },
          availability,
          ifNeeded: [],
          manualAvailability: {},
        },
      ]),
    )
    vm.responsesFormatted = new ZdtMap(
      Object.entries(fetchedAvailability)
        .filter(([, availability]) => availability.length > 0)
        .map(([userId, availability]) => [availability[0], new Set([userId])]),
    )
    await nextTick()
    await nextTick()
  }

  it("moves the no-common-time note into the respondents panel view model for timed events", async () => {
    const wrapper = mountWithSidebarStub(buildTwoRespondentEvent())

    await setFetchedResponses(wrapper, {
      "user-1": [zdt("2026-01-01T09:00:00Z")],
    })

    expect(getRespondentsPanelNote(wrapper)).toBe(
      "Note: There's no time when all 2 respondents are available.",
    )
  })

  it("uses the day wording for days-only events", async () => {
    const wrapper = mountWithSidebarStub(
      buildTwoRespondentEvent({ daysOnly: true }),
    )

    await setFetchedResponses(wrapper, {
      "user-1": [zdt("2026-01-01T00:00:00Z")],
    })

    expect(getRespondentsPanelNote(wrapper)).toBe(
      "Note: There's no day when all 2 respondents are available.",
    )
  })

  it("uses the members wording for group events", async () => {
    const wrapper = mountWithSidebarStub(
      buildTwoRespondentEvent({ type: eventTypes.GROUP }),
    )

    await setFetchedResponses(wrapper, {
      "user-1": [zdt("2026-01-01T09:00:00Z")],
    })

    expect(getRespondentsPanelNote(wrapper)).toBe(
      "Note: There's no time when all 2 members are available.",
    )
  })

  it("omits the note when a slot exists where everyone is available", async () => {
    const wrapper = mountWithSidebarStub(buildTwoRespondentEvent())

    await setFetchedResponses(wrapper, {
      "user-1": [zdt("2026-01-01T09:00:00Z")],
      "user-2": [zdt("2026-01-01T09:00:00Z")],
    })

    const vm = wrapper.vm as unknown as {
      responsesFormatted: ZdtMap<Set<string>>
    }
    vm.responsesFormatted = new ZdtMap([
      [zdt("2026-01-01T09:00:00Z"), new Set(["user-1", "user-2"])],
    ])
    await nextTick()
    await nextTick()

    expect(getRespondentsPanelNote(wrapper)).toBeNull()
  })

  it("omits the note while editing availability", async () => {
    const wrapper = mountWithSidebarStub(buildTwoRespondentEvent())

    await setFetchedResponses(wrapper, {
      "user-1": [zdt("2026-01-01T09:00:00Z")],
    })

    const vm = wrapper.vm as unknown as { state: string }
    vm.state = states.EDIT_AVAILABILITY
    await nextTick()
    await nextTick()

    expect(getRespondentsPanelNote(wrapper)).toBeNull()
  })

  it("omits the note when no responses have been fetched", async () => {
    const wrapper = mountWithSidebarStub(buildTwoRespondentEvent())

    await nextTick()
    await nextTick()

    expect(getRespondentsPanelNote(wrapper)).toBeNull()
  })

  it("renders the extracted timed grid child for timed events", () => {
    const wrapper = mountScheduleOverlap()

    expect(
      wrapper.findComponent({ name: "ScheduleOverlapTimeGrid" }).exists(),
    ).toBe(true)
    expect(
      wrapper.findComponent({ name: "ScheduleOverlapDaysOnlyGrid" }).exists(),
    ).toBe(false)
    expect(
      wrapper.findComponent({ name: "ScheduleOverlapSidebar" }).exists(),
    ).toBe(true)
  })

  it("uses the legacy strong heatmap tint in the normal post-submit grid for disjoint guest responses", async () => {
    localStorage.setItem("showBestTimes", "false")
    localStorage.setItem(
      "evt-1.guestOwnershipCollection",
      JSON.stringify({
        version: 1,
        selectedLookupKey: "guest-2-token",
        records: [
          {
            lookupKey: "guest-1-token",
            name: "guest-1",
            guestId: "guest-1-token",
            guestEditToken: "token-1",
            guestEditPolicy: "protected",
            guestOwnershipMode: "token",
            lastUsedAt: 2,
          },
          {
            lookupKey: "guest-2-token",
            name: "guest-2",
            guestId: "guest-2-token",
            guestEditToken: "token-2",
            guestEditPolicy: "protected",
            guestOwnershipMode: "token",
            lastUsedAt: 1,
          },
        ],
      }),
    )

    const wrapper = mountScheduleOverlap({
      props: {
        curGuestId: "guest-2",
        initialTimezone: utcTimezone,
        event: {
          ...buildScheduleOverlapProps().event,
          name: "Two guest responses",
          dates: [Temporal.PlainDate.from("2026-01-01")],
          timeSeed: zdt("2026-01-01T09:00:00Z"),
          startTime: Temporal.PlainTime.from("09:00"),
          duration: Temporal.Duration.from({ hours: 2 }),
          timeIncrement: Temporal.Duration.from({ hours: 1 }),
          responses: {
            "guest-1": {
              name: "guest-1",
              guest: true,
              guestId: "guest-1-token",
              guestEditPolicy: "protected",
              guestOwnershipMode: "token",
              user: {
                _id: "guest-1",
                firstName: "guest-1",
                lastName: "",
                email: "",
              },
              availability: [zdt("2026-01-01T09:00:00Z")],
              ifNeeded: [],
              manualAvailability: {},
            },
            "guest-2": {
              name: "guest-2",
              guest: true,
              guestId: "guest-2-token",
              guestEditPolicy: "protected",
              guestOwnershipMode: "token",
              user: {
                _id: "guest-2",
                firstName: "guest-2",
                lastName: "",
                email: "",
              },
              availability: [zdt("2026-01-01T10:00:00Z")],
              ifNeeded: [],
              manualAvailability: {},
            },
          },
        },
      },
      global: {
        stubs: {
          ScheduleOverlapTimeGrid: {
            name: "ScheduleOverlapTimeGrid",
            props: {
              timedGrid: {
                type: Object,
                required: true,
              },
            },
            template: "<div />",
          },
        },
      },
    })
    const vm = wrapper.vm as unknown as {
      responsesFormatted: ZdtMap<Set<string>>
    }
    vm.responsesFormatted = new ZdtMap([
      [zdt("2026-01-01T09:00:00Z"), new Set(["guest-1"])],
      [zdt("2026-01-01T10:00:00Z"), new Set(["guest-2"])],
    ])
    await nextTick()
    await nextTick()

    const timedGrid = wrapper
      .findComponent({ name: "ScheduleOverlapTimeGrid" })
      .props("timedGrid") as {
      overlayAvailability: boolean
      timeslotClassStyle: { style: Record<string, string> }[]
      toolRow: { showBestTimes: boolean }
    }
    const renderedColors = timedGrid.timeslotClassStyle
      .map((classStyle) => classStyle.style.backgroundColor)
      .filter(
        (backgroundColor): backgroundColor is string =>
          typeof backgroundColor === "string",
      )

    expect(timedGrid.toolRow.showBestTimes).toBe(false)
    expect(timedGrid.overlayAvailability).toBe(false)
    expect(renderedColors).toContain("#00994CE1")
    expect(renderedColors).not.toContain("#00994C70")
  })

  it("passes cohesive sidebar and mobile overlay view models to extracted children", () => {
    viewportWidth.value = 639

    const wrapper = mountScheduleOverlap({
      global: {
        stubs: {
          ScheduleOverlapSidebar: {
            name: "ScheduleOverlapSidebar",
            props: {
              sidebar: {
                type: Object,
                required: true,
              },
            },
            template: "<div />",
          },
          ScheduleOverlapMobileOverlay: {
            name: "ScheduleOverlapMobileOverlay",
            props: {
              overlay: {
                type: Object,
                required: true,
              },
            },
            template: "<div />",
          },
        },
      },
      props: {
        calendarPermissionGranted: true,
      },
    })

    const sidebarViewModel = wrapper
      .findComponent({ name: "ScheduleOverlapSidebar" })
      .props("sidebar") as {
      event: { _id?: string }
      respondentsPanel: { eventId: string }
    }
    const overlayViewModel = wrapper
      .findComponent({
        name: "ScheduleOverlapMobileOverlay",
      })
      .props("overlay") as {
      event: { _id?: string }
      respondentsPanel: { eventId: string }
    }

    expect(sidebarViewModel.event._id).toBe("evt-1")
    expect(sidebarViewModel.respondentsPanel.eventId).toBe("evt-1")
    expect(overlayViewModel.event._id).toBe("evt-1")
    expect(overlayViewModel.respondentsPanel.eventId).toBe("evt-1")
  })

  it("keeps mobile-only boundaries active below 640px and removes them at 640px", async () => {
    viewportWidth.value = 639

    const buildWrapper = () =>
      mountScheduleOverlap({
        global: {
          stubs: {
            ScheduleOverlapSidebar: {
              name: "ScheduleOverlapSidebar",
              props: {
                sidebar: {
                  type: Object,
                  required: true,
                },
              },
              template: "<div class='sidebar-stub' />",
            },
            ScheduleOverlapMobileOverlay: {
              name: "ScheduleOverlapMobileOverlay",
              props: {
                overlay: {
                  type: Object,
                  required: true,
                },
              },
              template: "<div class='overlay-stub' />",
            },
            ToolRow: {
              name: "ToolRow",
              props: {
                toolRow: {
                  type: Object,
                  required: true,
                },
              },
              template: "<div class='tool-row-stub' />",
            },
          },
        },
      })

    const mobileWrapper = buildWrapper()
    await nextTick()

    const getSidebarViewModel = (wrapper: ScheduleOverlapWrapper) =>
      wrapper
        .findComponent({ name: "ScheduleOverlapSidebar" })
        .props("sidebar") as {
        isPhone: boolean
        rightSideWidth: string
      }

    expect(mobileWrapper.find(".tool-row-stub").exists()).toBe(true)
    expect(mobileWrapper.find(".overlay-stub").exists()).toBe(true)
    expect(mobileWrapper.find(".schedule-overlap-layout").classes()).toContain(
      "tw:flex-col",
    )
    expect(getSidebarViewModel(mobileWrapper).isPhone).toBe(true)
    expect(getSidebarViewModel(mobileWrapper).rightSideWidth).toBe("100%")

    mobileWrapper.unmount()
    viewportWidth.value = 640

    const desktopWrapper = buildWrapper()
    await nextTick()

    expect(desktopWrapper.find(".tool-row-stub").exists()).toBe(false)
    expect(desktopWrapper.find(".overlay-stub").exists()).toBe(false)
    expect(desktopWrapper.find(".schedule-overlap-layout").classes()).toContain(
      "tw:flex-row",
    )
    expect(getSidebarViewModel(desktopWrapper).isPhone).toBe(false)
    expect(getSidebarViewModel(desktopWrapper).rightSideWidth).toBe("13rem")
  })

  it("keeps the explicit guest edit target in the respondents panel view model", () => {
    const wrapper = mountScheduleOverlap({
      props: {
        curGuestId: "guest-1",
      },
      global: {
        stubs: {
          ScheduleOverlapSidebar: {
            name: "ScheduleOverlapSidebar",
            props: {
              sidebar: {
                type: Object,
                required: true,
              },
            },
            template: "<div />",
          },
        },
      },
    })

    const sidebarViewModel = wrapper
      .findComponent({ name: "ScheduleOverlapSidebar" })
      .props("sidebar") as {
      respondentsPanel: { curGuestId: string }
    }

    expect(sidebarViewModel.respondentsPanel.curGuestId).toBe("guest-1")
  })

  it("passes cohesive timed and days-only grid view models to grid boundaries", () => {
    const timedWrapper = mountScheduleOverlap({
      global: {
        stubs: {
          ScheduleOverlapTimeGrid: {
            name: "ScheduleOverlapTimeGrid",
            props: {
              timedGrid: {
                type: Object,
                required: true,
              },
            },
            template: "<div />",
          },
        },
      },
    })

    const timedGrid = timedWrapper
      .findComponent({ name: "ScheduleOverlapTimeGrid" })
      .props("timedGrid") as {
      event: { _id?: string }
      actions: {
        nextPage: () => void
        signUpForBlock: (block: { _id: string }) => void
      }
      toolRow: {
        numResponses: number
        actions: { updateWeekOffset: (value: number) => void }
      }
    }

    expect(timedGrid.event._id).toBe("evt-1")
    expect(typeof timedGrid.actions.nextPage).toBe("function")
    expect(typeof timedGrid.actions.signUpForBlock).toBe("function")
    expect(timedGrid.toolRow.numResponses).toBe(0)
    expect(typeof timedGrid.toolRow.actions.updateWeekOffset).toBe("function")

    const daysOnlyWrapper = mountScheduleOverlap({
      props: {
        event: {
          ...buildScheduleOverlapProps().event,
          daysOnly: true,
        },
      },
      global: {
        stubs: {
          ScheduleOverlapDaysOnlyGrid: {
            name: "ScheduleOverlapDaysOnlyGrid",
            props: {
              daysOnlyGrid: {
                type: Object,
                required: true,
              },
            },
            template: "<div />",
          },
        },
      },
    })

    const daysOnlyGrid = daysOnlyWrapper
      .findComponent({
        name: "ScheduleOverlapDaysOnlyGrid",
      })
      .props("daysOnlyGrid") as {
      event: { daysOnly?: boolean }
      actions: { prevPage: () => void; closeHint: () => void }
      toolRow: {
        numResponses: number
        actions: { updateShowBestTimes: (value: boolean) => void }
      }
    }

    expect(daysOnlyGrid.event.daysOnly).toBe(true)
    expect(typeof daysOnlyGrid.actions.prevPage).toBe("function")
    expect(typeof daysOnlyGrid.actions.closeHint).toBe("function")
    expect(daysOnlyGrid.toolRow.numResponses).toBe(0)
    expect(typeof daysOnlyGrid.toolRow.actions.updateShowBestTimes).toBe(
      "function",
    )
  })

  it("counts dates-only event dates for unavailable legend guidance", () => {
    const wrapper = mountScheduleOverlap({
      props: {
        event: {
          ...buildScheduleOverlapProps().event,
          daysOnly: true,
          dates: [
            Temporal.PlainDate.from("2026-01-01"),
            Temporal.PlainDate.from("2026-01-02"),
          ],
        },
      },
    })

    const sidebar = wrapper
      .findComponent({ name: "ScheduleOverlapSidebar" })
      .props("sidebar") as { activeSlotsCount: number }

    expect(sidebar.activeSlotsCount).toBe(2)
  })

  it("clears curGuestId when the selected guest is deleted from the respondents panel", async () => {
    const wrapper = mountScheduleOverlap({
      props: {
        curGuestId: "guest-1",
      },
      global: {
        stubs: {
          ScheduleOverlapSidebar: {
            name: "ScheduleOverlapSidebar",
            emits: ["guestAvailabilityDeleted"],
            template:
              "<button class=\"delete-selected-guest\" @click=\"$emit('guestAvailabilityDeleted', 'guest-1')\" />",
          },
        },
      },
    })

    await wrapper.get(".delete-selected-guest").trigger("click")

    expect(wrapper.emitted("setCurGuestId")).toEqual([[""]])
  })

  it("leaves curGuestId unchanged when a different guest is deleted", async () => {
    const wrapper = mountScheduleOverlap({
      props: {
        curGuestId: "guest-1",
      },
      global: {
        stubs: {
          ScheduleOverlapSidebar: {
            name: "ScheduleOverlapSidebar",
            emits: ["guestAvailabilityDeleted"],
            template:
              "<button class=\"delete-other-guest\" @click=\"$emit('guestAvailabilityDeleted', 'guest-2')\" />",
          },
        },
      },
    })

    await wrapper.get(".delete-other-guest").trigger("click")

    expect(wrapper.emitted("setCurGuestId")).toBeUndefined()
  })

  it("keeps curGuestId on the token guest id when renaming the selected guest", async () => {
    localStorage.setItem(
      "evt-1.guestOwnership",
      JSON.stringify({
        name: "guest-1",
        guestId: "guest-token-id",
        guestEditToken: "edit-token",
        guestEditPolicy: "protected",
        guestOwnershipMode: "token",
      }),
    )
    vi.stubGlobal(
      "fetch",
      vi.fn(() =>
        Promise.resolve({
          ok: true,
          status: 200,
          statusText: "OK",
          headers: new Headers(),
          text: () =>
            Promise.resolve(
              JSON.stringify({
                guestCredentials: {
                  guestId: "guest-token-id",
                  guestEditToken: "edit-token-2",
                  guestEditPolicy: "protected",
                  guestOwnershipMode: "token",
                },
              }),
            ),
        }),
      ),
    )

    const wrapper = mountScheduleOverlap({
      props: {
        curGuestId: "guest-token-id",
        event: {
          ...buildScheduleOverlapProps().event,
          responses: {
            "guest-token-id": {
              name: "guest-1",
              guest: true,
              guestId: "guest-token-id",
              guestEditPolicy: "protected",
              guestOwnershipMode: "token",
              user: {
                _id: "guest-token-id",
                firstName: "guest-1",
                lastName: "",
                email: "",
              },
              availability: [],
              ifNeeded: [],
              manualAvailability: {},
            },
          },
        },
      },
    })

    const vm = wrapper.vm as unknown as {
      newGuestName: string
      saveGuestName: () => Promise<void>
      canEditGuestName: boolean
    }

    expect(vm.canEditGuestName).toBe(true)

    vm.newGuestName = "guest-2"
    await vm.saveGuestName()
    const selectedGuestKey = wrapper.emitted(
      "setCurGuestId",
    )?.[0]?.[0] as string

    expect(selectedGuestKey).toBe("guest-token-id")

    await wrapper.setProps({
      curGuestId: selectedGuestKey,
    })

    expect(vm.canEditGuestName).toBe(true)
  })

  it("updates curGuestId to the renamed guest name for legacy guests", async () => {
    localStorage.setItem(
      "evt-1.guestOwnership",
      JSON.stringify({
        name: "guest-1",
        guestOwnershipMode: "legacy",
      }),
    )

    const wrapper = mountScheduleOverlap({
      props: {
        curGuestId: "guest-1",
        event: {
          ...buildScheduleOverlapProps().event,
          responses: {
            "guest-1": {
              name: "guest-1",
              guest: true,
              guestOwnershipMode: "legacy",
              user: {
                _id: "guest-1",
                firstName: "guest-1",
                lastName: "",
                email: "",
              },
              availability: [],
              ifNeeded: [],
              manualAvailability: {},
            },
          },
        },
      },
    })

    const vm = wrapper.vm as unknown as {
      newGuestName: string
      saveGuestName: () => Promise<void>
    }

    vm.newGuestName = "guest-2"
    await vm.saveGuestName()

    expect(wrapper.emitted("setCurGuestId")).toEqual([["guest-2"]])
  })

  it("keeps respondents in the sidebar view model for specific-date events", () => {
    const wrapper = mountScheduleOverlap({
      props: {
        event: {
          ...buildScheduleOverlapProps().event,
          responses: {
            khh: {
              user: {
                _id: "000000000000000000000000",
                firstName: "khh",
                lastName: "",
                email: "",
              },
              availability: [],
              ifNeeded: [],
              manualAvailability: {},
            },
          },
        },
      },
      global: {
        stubs: {
          ScheduleOverlapSidebar: {
            name: "ScheduleOverlapSidebar",
            props: {
              sidebar: {
                type: Object,
                required: true,
              },
            },
            template: "<div />",
          },
        },
      },
    })

    const sidebarViewModel = wrapper
      .findComponent({ name: "ScheduleOverlapSidebar" })
      .props("sidebar") as {
      respondentsPanel: {
        respondents: { _id?: string; firstName?: string }[]
      }
    }

    expect(sidebarViewModel.respondentsPanel.respondents).toEqual([
      expect.objectContaining({
        _id: "khh",
        firstName: "khh",
      }),
    ])
  })

  it("keeps grouped sidebar and mobile overlay listeners wired to local state and parent emits", async () => {
    viewportWidth.value = 639

    const wrapper = mountScheduleOverlap({
      global: {
        stubs: {
          ScheduleOverlapSidebar: {
            name: "ScheduleOverlapSidebar",
            props: {
              sidebar: {
                type: Object,
                required: true,
              },
            },
            template: `
              <div>
                <button class="sidebar-name" @click="$emit('update:newGuestName', 'Renamed guest')" />
                <button class="sidebar-best-times" @click="$emit('update:showBestTimes', true)" />
                <button class="sidebar-add-availability" @click="$emit('addAvailability')" />
              </div>
            `,
          },
          ScheduleOverlapMobileOverlay: {
            name: "ScheduleOverlapMobileOverlay",
            props: {
              overlay: {
                type: Object,
                required: true,
              },
            },
            template: `
              <div>
                <button class="overlay-type" @click="$emit('update:availabilityType', 'ifNeeded')" />
                <button class="overlay-week-offset" @click="$emit('update:weekOffset', 2)" />
                <button class="overlay-add-guest" @click="$emit('addAvailabilityAsGuest')" />
              </div>
            `,
          },
        },
      },
    })

    await wrapper.get(".sidebar-name").trigger("click")
    await wrapper.get(".sidebar-best-times").trigger("click")
    await wrapper.get(".overlay-type").trigger("click")
    await nextTick()

    const sidebarViewModel = wrapper
      .findComponent({ name: "ScheduleOverlapSidebar" })
      .props("sidebar") as {
      newGuestName: string
      respondentsPanel: { showBestTimes: boolean }
    }
    const overlayViewModel = wrapper
      .findComponent({
        name: "ScheduleOverlapMobileOverlay",
      })
      .props("overlay") as {
      availabilityType: string
    }

    expect(sidebarViewModel.newGuestName).toBe("Renamed guest")
    expect(sidebarViewModel.respondentsPanel.showBestTimes).toBe(true)
    expect(overlayViewModel.availabilityType).toBe("ifNeeded")

    await wrapper.get(".sidebar-add-availability").trigger("click")
    await wrapper.get(".overlay-week-offset").trigger("click")
    await wrapper.get(".overlay-add-guest").trigger("click")

    expect(wrapper.emitted("addAvailability")).toEqual([[]])
    expect(wrapper.emitted("update:weekOffset")).toEqual([[2]])
    expect(wrapper.emitted("addAvailabilityAsGuest")).toEqual([[]])
  })
})

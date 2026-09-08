// @vitest-environment happy-dom

import { mount } from "@vue/test-utils"
import { describe, expect, it } from "vitest"
import Tooltip from "./Tooltip.vue"
import tooltipSource from "./Tooltip.vue?raw"
import type { TooltipSegment } from "./schedule_overlap/scheduleOverlapRendering"

const segments = (text: string): TooltipSegment[] => [{ text, mono: false }]

describe("Tooltip", () => {
  it("uses declarative pointer listeners instead of manual DOM wiring", () => {
    expect(tooltipSource).toContain('@mouseenter="handleMouseEnter"')
    expect(tooltipSource).toContain('@mouseleave="handleMouseLeave"')
    expect(tooltipSource).toContain('@mousemove="handleMouseMoveWithOverride"')
    expect(tooltipSource).not.toContain("addEventListener")
    expect(tooltipSource).not.toContain("removeEventListener")
  })

  it("shows new content immediately and positions it through the tooltip state helper", async () => {
    const wrapper = mount(Tooltip, {
      props: {
        content: [],
      },
      slots: {
        default: "<button>Trigger</button>",
      },
    })

    const trigger = wrapper.get("div.tw\\:relative")

    await trigger.trigger("mouseenter")
    expect(wrapper.text()).not.toContain("Hello")

    await wrapper.setProps({ content: segments("Hello") })
    await wrapper.vm.$nextTick()

    expect(wrapper.text()).toContain("Hello")

    await trigger.trigger("mousemove", { clientX: 100, clientY: 200 })

    const tooltip = wrapper.get(".tw\\:fixed")
    expect(tooltip.attributes("style")).toContain("left: 100px;")
    expect(tooltip.attributes("style")).toContain("top: 172px;")
    expect(tooltip.attributes("style")).toContain("translate(-50%, -50%)")

    await trigger.trigger("mouseleave")
    expect(wrapper.find(".tw\\:fixed").exists()).toBe(false)
  })

  it("keeps an overridden position when the pointer moves", async () => {
    const wrapper = mount(Tooltip, {
      props: {
        content: segments("Hello"),
      },
      slots: {
        default: "<button>Trigger</button>",
      },
    })
    const trigger = wrapper.get("div.tw\\:relative")

    await trigger.trigger("mouseenter")
    await wrapper.setProps({ positionOverride: { x: 40, y: 200 } })
    await trigger.trigger("mousemove", { clientX: 900, clientY: 700 })

    const tooltip = wrapper.get(".tw\\:fixed")
    expect(tooltip.attributes("style")).toContain("left: 40px;")
    expect(tooltip.attributes("style")).toContain("top: 172px;")
  })

  it("places edge-anchored overrides outside their anchor with a gap", async () => {
    const wrapper = mount(Tooltip, {
      props: {
        content: segments("Hello"),
        positionOverride: { x: 40, y: 200, placement: "above" },
      },
      slots: {
        default: "<button>Trigger</button>",
      },
    })

    await wrapper.vm.$nextTick()

    const tooltip = wrapper.get(".tw\\:fixed")
    expect(tooltip.attributes("style")).toContain("left: 40px;")
    expect(tooltip.attributes("style")).toContain("top: 200px;")
    expect(tooltip.attributes("style")).toContain(
      "translate(-50%, calc(-100% - 8px))",
    )

    await wrapper.setProps({
      positionOverride: { x: 40, y: 20, placement: "below" },
    })

    expect(tooltip.attributes("style")).toContain("top: 20px;")
    expect(tooltip.attributes("style")).toContain("translate(-50%, 8px)")
  })

  it("renders immediately when visibility is explicitly forced", async () => {
    const wrapper = mount(Tooltip, {
      props: {
        content: segments("Hello"),
        forceVisible: true,
      },
      slots: {
        default: "<button>Trigger</button>",
      },
    })

    await wrapper.vm.$nextTick()

    expect(wrapper.find(".tw\\:fixed").exists()).toBe(true)
  })

  it("clamps the horizontal anchor so the tooltip stays fully on screen", async () => {
    const wideContent = segments("09:00 to 10:00 · Sat, Jul 4, 2026")
    const wrapper = mount(Tooltip, {
      props: {
        content: wideContent,
        positionOverride: { x: 20, y: 200, placement: "above" },
        forceVisible: true,
      },
      slots: {
        default: "<button>Trigger</button>",
      },
    })
    await wrapper.vm.$nextTick()

    const tooltip = wrapper.get(".tw\\:fixed")
    const tooltipEl = tooltip.element as HTMLElement
    tooltipEl.getBoundingClientRect = () =>
      ({
        width: 200,
        height: 40,
        left: 0,
        right: 0,
        top: 0,
        bottom: 0,
      }) as DOMRect

    await wrapper.setProps({ content: [...wideContent] })
    await wrapper.vm.$nextTick()

    const viewportWidth = window.innerWidth
    const clampedLeft = 8 + 200 / 2
    const rightClampedLeft = viewportWidth - 8 - 200 / 2

    expect(tooltip.attributes("style")).toContain(
      `left: ${String(clampedLeft)}px;`,
    )
    expect(tooltip.attributes("style")).toContain(
      "translate(-50%, calc(-100% - 8px))",
    )

    await wrapper.setProps({
      positionOverride: { x: viewportWidth - 20, y: 200, placement: "above" },
    })
    await wrapper.vm.$nextTick()

    expect(tooltip.attributes("style")).toContain(
      `left: ${String(rightClampedLeft)}px;`,
    )
  })

  it("renders the time on the mono font stack but not the date", () => {
    const wrapper = mount(Tooltip, {
      props: {
        content: [
          { text: "04:30", mono: true },
          { text: " to ", mono: false },
          { text: "04:45", mono: true },
          { text: " \u00b7 ", mono: false },
          { text: "Fri, Aug 7, 2026", mono: false },
        ],
        forceVisible: true,
      },
      slots: {
        default: "<button>Trigger</button>",
      },
    })

    const tooltip = wrapper.get(".tw\\:fixed")
    expect(tooltip.classes()).not.toContain("tw:font-mono")

    const monoSpans = tooltip.findAll("span.tw\\:font-mono")
    expect(monoSpans.map((span) => span.text()).join(" ")).toBe("04:30 04:45")
    expect(tooltip.text()).toContain("Fri, Aug 7, 2026")
    expect(monoSpans.map((span) => span.text())).not.toContain(
      "Fri, Aug 7, 2026",
    )
  })
})

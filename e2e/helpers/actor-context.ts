import { test as base, type BrowserContext, type Video } from "@playwright/test"

type ActorContext = (name: string) => Promise<BrowserContext>

// Manually created contexts inherit browser options, but not Test's video lifecycle.
export const test = base.extend<{ actorContext: ActorContext }>({
  actorContext: async ({ browser, video }, use, testInfo) => {
    const mode = typeof video === "string" ? video : video.mode
    const record =
      mode !== "off" && (mode !== "on-first-retry" || testInfo.retry === 1)
    const contexts: BrowserContext[] = []
    const videos: { name: string; video: Video }[] = []
    await use(async (name) => {
      const actor = `${contexts.length + 1}-${name}`
      const context = await browser.newContext({
        ...(record
          ? {
              recordVideo: {
                dir: testInfo.outputPath("actor-videos"),
                ...(typeof video === "object" && video.size
                  ? { size: video.size }
                  : {}),
              },
            }
          : {}),
      })
      contexts.push(context)
      let pageIndex = 0
      context.on("page", (page) => {
        const recording = page.video()
        if (recording)
          videos.push({ name: `${actor}-${++pageIndex}`, video: recording })
      })
      return context
    })
    // Close before saving, including when the test timed out or already closed a context.
    await Promise.all(contexts.map((context) => context.close()))
    const retain =
      mode === "on" ||
      mode === "on-first-retry" ||
      testInfo.status !== testInfo.expectedStatus
    for (const { name, video: recording } of videos) {
      if (retain) {
        const path = testInfo.outputPath(`video-${name}.webm`)
        await recording.saveAs(path)
        await testInfo.attach(`video-${name}`, {
          path,
          contentType: "video/webm",
        })
      }
      await recording.delete()
    }
  },
})

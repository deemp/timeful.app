import { ref, type Ref, type ComputedRef } from "vue"
import { post } from "@/utils"
import type { Event, SignUpBlock, User } from "@/types"
import type { ScheduleOverlapInstance } from "./types"
import {
  encodeVisitorSignUpResponseSubmission,
  toSignUpBlockResponseSubmissionPayload,
} from "./responseSubmissionBoundary"
import {
  selectVisitorResponse,
  selectedVisitorResponse,
  withEventVisitorIdentity,
} from "./visitorIdentityStorage"

interface GuestPayload {
  name: string
  email?: string
}

export interface UseEventRespondentOptions {
  event: Ref<Event | null>
  authUser: ComputedRef<User | null>
  scheduleOverlapRef: Ref<ScheduleOverlapInstance | null>
  refreshEvent: () => Promise<void>
}

export function useEventRespondent(opts: UseEventRespondentOptions) {
  const curGuestId = ref("")
  const addingAvailabilityAsGuest = ref(false)
  const currSignUpBlock = ref<SignUpBlock | null>(null)
  const signUpForSlotDialog = ref(false)

  function initiateSignUpFlow(signUpBlock: SignUpBlock) {
    currSignUpBlock.value = signUpBlock
    signUpForSlotDialog.value = true
  }

  // ownSignUpResponseId resolves this visitor's existing signup response so a
  // repeat submission edits it instead of creating a duplicate. The read's
  // server-proven canEdit is authoritative; the stored selection covers the
  // gap before the first post-create refresh.
  function ownSignUpResponseId(event: Event, eventId: string) {
    const own = Object.values(event.signUpResponses ?? {}).find(
      (response) => response.canEdit,
    )
    return own?.publicId ?? selectedVisitorResponse(eventId)
  }

  async function signUpForBlock(guestPayload: GuestPayload) {
    const ev = opts.event.value as (Event & { _id: string }) | null
    if (!ev || !currSignUpBlock.value) return
    const blockId = currSignUpBlock.value._id ?? ""
    if (ev.eventVisitorId) {
      const responseId = ownSignUpResponseId(ev, ev._id)
      const result = await post<{ responseId: string }>(
        withEventVisitorIdentity(`/events/${ev._id}/response`),
        encodeVisitorSignUpResponseSubmission({
          responseId,
          signUpBlockId: blockId,
          name: opts.authUser.value?._id ? undefined : guestPayload.name,
          email: guestPayload.email,
        }),
      )
      selectVisitorResponse(ev._id, result.responseId)
    } else {
      const payload = toSignUpBlockResponseSubmissionPayload({
        signUpBlockId: blockId,
        authUserId: opts.authUser.value?._id,
        guestPayload,
      })
      await post(`/events/${ev._id}/response`, payload)
    }
    await opts.refreshEvent()
    opts.scheduleOverlapRef.value?.resetSignUpForm()
    signUpForSlotDialog.value = false
  }

  return {
    curGuestId,
    addingAvailabilityAsGuest,
    currSignUpBlock,
    signUpForSlotDialog,
    initiateSignUpFlow,
    signUpForBlock,
  }
}

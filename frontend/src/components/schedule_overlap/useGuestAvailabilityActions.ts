import { withEventVisitorIdentity } from "@/composables/event/visitorIdentityStorage"
import { nextTick, type ComputedRef, type Ref } from "vue"
import { post } from "@/utils"
import { canGuestEditResponse } from "@/composables/schedule_overlap/useScheduleOverlapUI"
import {
  appendGuestIdentityQuery,
  type GuestOwnershipState,
} from "@/composables/schedule_overlap/scheduleOverlapStorage"
import type {
  ParsedResponses,
  ScheduleOverlapEvent,
  ScheduleOverlapResponse,
} from "@/composables/schedule_overlap/types"
import type { RenameGuestResponse } from "@/types/transport"

interface UseGuestAvailabilityActionsOptions {
  isAuthenticated: ComputedRef<boolean>
  event: ComputedRef<ScheduleOverlapEvent>
  curGuestId: ComputedRef<string>
  parsedResponses: ComputedRef<ParsedResponses>
  ownedGuestResponseLookupKeys: ComputedRef<Set<string>>
  guestOwnership: ComputedRef<GuestOwnershipState | undefined>
  guestResponseLookupKey: ComputedRef<string | undefined>
  newGuestName: Ref<string>
  editGuestNameDialog: Ref<boolean>
  selectGuestOwnership: (lookupKey?: string) => void
  removeGuestOwnership: (lookupKey: string) => void
  getOwnedGuestOwnership: (
    lookupKey?: string,
  ) => GuestOwnershipState | undefined
  setGuestOwnership: (
    value: GuestOwnershipState,
    options?: { select?: boolean },
  ) => void
  startEditing: () => void
  stopEditing: () => void
  populateUserAvailability: (userId: string) => void
  setCurGuestId: (userId: string) => void
  guestAvailabilityDeleted: (userId: string) => void
  refreshEvent: () => void
  showInfo: (message: string) => void
  showError: (message: string) => void
}

export function useGuestAvailabilityActions(
  opts: UseGuestAvailabilityActionsOptions,
) {
  const getRenamedGuestSelectionKey = (
    renamedGuestName: string,
    currentResponse?: ScheduleOverlapResponse,
    guestCredentials?: RenameGuestResponse["guestCredentials"],
  ) => {
    const tokenGuestId = guestCredentials?.guestId ?? currentResponse?.guestId
    return tokenGuestId && tokenGuestId.length > 0
      ? tokenGuestId
      : renamedGuestName
  }

  const editGuestAvailability = (userId: string) => {
    const response = opts.parsedResponses.value[userId]
    if (
      (opts.isAuthenticated.value && !response.publicId) ||
      !canGuestEditResponse(response, opts.ownedGuestResponseLookupKeys.value)
    ) {
      return
    }

    const ownedLookupKey =
      response.guestOwnershipMode === "token"
        ? response.guestId
        : response.user._id
    if (ownedLookupKey) opts.selectGuestOwnership(ownedLookupKey)

    opts.startEditing()
    void nextTick(() => {
      opts.populateUserAvailability(userId)
      opts.setCurGuestId(userId)
    })
  }

  const editOwnedGuestAvailability = (lookupKey: string) => {
    opts.selectGuestOwnership(lookupKey)
    const matchingResponse = Object.entries(opts.parsedResponses.value).find(
      ([, response]) =>
        response.guest &&
        (response.guestId === lookupKey || response.user._id === lookupKey),
    )
    if (matchingResponse) editGuestAvailability(matchingResponse[0])
  }

  const handleGuestAvailabilityDeleted = (userId: string) => {
    if (userId.length === 0) return
    let ownedLookupKey: string | undefined
    if (userId in opts.parsedResponses.value) {
      const response = opts.parsedResponses.value[userId]
      ownedLookupKey =
        response.guestOwnershipMode === "token"
          ? response.guestId
          : response.user._id
    }
    if (ownedLookupKey) opts.removeGuestOwnership(ownedLookupKey)
    if (opts.curGuestId.value === userId) {
      opts.setCurGuestId("")
      opts.stopEditing()
    }
    opts.guestAvailabilityDeleted(userId)
  }

  const openEditGuestNameDialog = () => {
    opts.newGuestName.value =
      opts.event.value.responses?.[opts.curGuestId.value]?.name ??
      opts.curGuestId.value
    opts.editGuestNameDialog.value = true
  }

  const saveGuestName = async () => {
    const name = opts.newGuestName.value.trim()
    const currentGuestName =
      opts.event.value.responses?.[opts.curGuestId.value]?.name ??
      opts.curGuestId.value
    if (name.length === 0) {
      opts.showError("Guest name cannot be empty")
      return
    }
    if (name === currentGuestName) {
      opts.editGuestNameDialog.value = false
      return
    }

    try {
      if (opts.event.value.eventVisitorId) {
        await post(
          withEventVisitorIdentity(
            `/events/${opts.event.value._id}/rename-user`,
          ),
          { responseId: opts.curGuestId.value, newName: name },
        )
        opts.editGuestNameDialog.value = false
        opts.refreshEvent()
        return
      }
      const currentResponse =
        opts.event.value.responses?.[opts.curGuestId.value]
      const response = await post<RenameGuestResponse>(
        appendGuestIdentityQuery(
          `/events/${opts.event.value._id ?? ""}/rename-user`,
          opts.guestOwnership.value,
          opts.guestOwnership.value?.name ?? null,
        ),
        {
          oldName: currentGuestName,
          newName: name,
          guestId: currentResponse?.guestId,
          guestEditToken:
            opts.curGuestId.value === opts.guestResponseLookupKey.value
              ? opts.guestOwnership.value?.guestEditToken
              : undefined,
        },
      )
      if (response.guestCredentials) {
        opts.setGuestOwnership({
          name,
          guestId: response.guestCredentials.guestId,
          guestEditToken: response.guestCredentials.guestEditToken,
          guestEditPolicy: response.guestCredentials.guestEditPolicy,
          guestOwnershipMode: response.guestCredentials.guestOwnershipMode,
        })
      } else {
        const existingOwnership = opts.getOwnedGuestOwnership(
          currentResponse?.guestId ?? opts.curGuestId.value,
        )
        opts.setGuestOwnership({ ...(existingOwnership ?? {}), name })
      }
      opts.showInfo("Guest name updated successfully")
      opts.editGuestNameDialog.value = false
      opts.setCurGuestId(
        getRenamedGuestSelectionKey(
          name,
          currentResponse,
          response.guestCredentials,
        ),
      )
      opts.refreshEvent()
    } catch (err: unknown) {
      const error = err as { parsed?: { error?: string }; message?: string }
      opts.showError(
        error.parsed?.error ?? error.message ?? "Failed to update guest name",
      )
    }
  }

  return {
    editGuestAvailability,
    editOwnedGuestAvailability,
    handleGuestAvailabilityDeleted,
    openEditGuestNameDialog,
    saveGuestName,
  }
}

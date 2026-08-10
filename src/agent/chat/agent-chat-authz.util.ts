/**
 * Team chat writeback gates — aligned with Nara Look role matrix spirit.
 * PERSONAL: never Apply to shared trip from this surface (ADVICE_ONLY).
 */

export type AgentChatTripRole = 'OWNER' | 'ORGANIZER' | 'DRIVER' | 'MEMBER' | 'ADVISOR' | 'UNKNOWN';

const CONFIRM_ROLES = new Set<AgentChatTripRole>(['OWNER', 'ORGANIZER', 'DRIVER']);

export function normalizeTripCollaboratorRole(raw: string | null | undefined): AgentChatTripRole {
  const r = String(raw ?? '').trim().toUpperCase();
  if (r === 'OWNER' || r === 'ORGANIZER' || r === 'DRIVER' || r === 'MEMBER' || r === 'ADVISOR') {
    return r;
  }
  if (r === 'ADMIN') return 'ORGANIZER';
  return 'UNKNOWN';
}

/** Who may confirm_negotiation / Apply from a TRIP_SHARED thread. */
export function canConfirmInTripShared(role: AgentChatTripRole): boolean {
  return CONFIRM_ROLES.has(role);
}

export function assertFlawedDraftNotSilentApply(deliveryVerdict: string | null | undefined): void {
  if (String(deliveryVerdict ?? '').toUpperCase() === 'FLAWED_DRAFT') {
    throw new Error('FLAWED_DRAFT_FORBIDDEN: silent Apply is not allowed');
  }
}

/** True when chat may expose / honor apply CTA for itinerary adjust. */
export function isItineraryAdjustApplyAllowed(params: {
  scope: string;
  role: AgentChatTripRole;
  deliveryVerdict?: string | null;
  applied?: boolean;
}): { ok: true } | { ok: false; reason: string } {
  if (String(params.scope).toUpperCase() === 'PERSONAL') {
    return { ok: false, reason: 'PERSONAL_CHAT_NO_APPLY' };
  }
  if (!canConfirmInTripShared(params.role)) {
    return { ok: false, reason: `CONFIRM_FORBIDDEN: role=${params.role}` };
  }
  if (String(params.deliveryVerdict ?? '').toUpperCase() === 'FLAWED_DRAFT') {
    return { ok: false, reason: 'FLAWED_DRAFT_FORBIDDEN' };
  }
  if (params.applied === true) {
    return { ok: false, reason: 'ALREADY_APPLIED' };
  }
  return { ok: true };
}

/**
 * UWC-CUTOVER-01 — per-corridor AUTHORITATIVE authorization.
 * Independent of global UWC_1C_OCC_SWITCH_AUTHORIZED / UWC_1C_OCC_UNLOCKED.
 * D1 ACTIONS · D2 ITINERARY · D3 UNIFIED PlanVersion-only.
 * Completing all three corridor flags ≠ flipping the global OCC switch
 * (that is UWC-OCC-UNLOCK-01).
 */

import type { AuthoritativeWriteCorridorId } from './authoritative-write.types';

/**
 * Explicit per-corridor promote flags (cutover decisions).
 * Global unlock is separate (`UWC_1C_OCC_UNLOCKED` via UWC-OCC-UNLOCK-01).
 */
export const UWC_CORRIDOR_AUTHORITATIVE_AUTHORIZED: Record<
  AuthoritativeWriteCorridorId,
  boolean
> = {
  ACTIONS_COMMIT: true, // D1
  ITINERARY_ADJUST: true, // D2
  UNIFIED_EXECUTE: true, // D3 — PlanVersion-only handler path
};

export const UWC_CUTOVER_01_D1_ACTIONS_APPROVED = true as const;
export const UWC_CUTOVER_01_D2_ITINERARY_APPROVED = true as const;
export const UWC_CUTOVER_01_D3_UNIFIED_APPROVED = true as const;

export function isCorridorAuthoritativeAuthorized(
  corridor: AuthoritativeWriteCorridorId,
): boolean {
  return UWC_CORRIDOR_AUTHORITATIVE_AUTHORIZED[corridor] === true;
}

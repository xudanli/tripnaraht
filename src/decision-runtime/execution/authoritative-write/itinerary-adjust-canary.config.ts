/**
 * UWC-CANARY-02 — ITINERARY_ADJUST AUTHORITATIVE_CANARY controls.
 * Independent of ACTIONS canary, global AUTHORITATIVE, and compensation exec.
 */

export const UWC_ITINERARY_CANARY_CONTRACT_COMPLETE = true as const;

export const UWC_ITINERARY_CANARY_MODE = 'AUTHORITATIVE_CANARY' as const;

/** First-round operation allowlist default. */
export const UWC_ITINERARY_CANARY_DEFAULT_OPS = [
  'same_day_time_adjust',
  'same_day_add_item',
  'same_day_add_from_candidates',
  'same_day_remove_item',
  'same_day_reorder_items',
  'same_day_move_and_add',
  'same_day_reduce_intensity',
  'multi_day_add_from_candidates',
] as const;

export function isItineraryAdjustCanaryAuthorized(
  env: NodeJS.ProcessEnv = process.env,
): boolean {
  const v = String(env.UWC_ITINERARY_CANARY_AUTHORIZED ?? '').trim().toLowerCase();
  return v === '1' || v === 'true' || v === 'yes' || v === 'on';
}

export function isItineraryAdjustCanaryKillSwitchOn(
  env: NodeJS.ProcessEnv = process.env,
): boolean {
  const v = String(env.UWC_ITINERARY_CANARY_KILL_SWITCH ?? '').trim().toLowerCase();
  return v === '1' || v === 'true' || v === 'yes' || v === 'on' || v === 'kill';
}

export function getItineraryAdjustCanaryPercent(
  env: NodeJS.ProcessEnv = process.env,
): number {
  const raw = Number(env.UWC_ITINERARY_CANARY_PERCENT ?? '0');
  if (!Number.isFinite(raw)) return 0;
  return Math.max(0, Math.min(100, Math.floor(raw)));
}

/** Comma-separated trip ids; empty = no trips admitted. */
export function getItineraryAdjustCanaryTripAllowlist(
  env: NodeJS.ProcessEnv = process.env,
): readonly string[] {
  const raw = String(env.UWC_ITINERARY_CANARY_TRIP_ALLOWLIST ?? '').trim();
  if (!raw) return [];
  return raw
    .split(',')
    .map((s) => s.trim())
    .filter(Boolean);
}

export function getItineraryAdjustCanaryOperationAllowlist(
  env: NodeJS.ProcessEnv = process.env,
): readonly string[] {
  const raw = String(env.UWC_ITINERARY_CANARY_OP_ALLOWLIST ?? '').trim();
  if (!raw) return [...UWC_ITINERARY_CANARY_DEFAULT_OPS];
  return raw
    .split(',')
    .map((s) => s.trim())
    .filter(Boolean);
}

export type ItineraryAdjustCanaryGateStatus = {
  contractComplete: typeof UWC_ITINERARY_CANARY_CONTRACT_COMPLETE;
  authorized: boolean;
  killSwitch: boolean;
  percent: number;
  tripAllowlist: readonly string[];
  operationAllowlist: readonly string[];
  enabled: boolean;
};

export function resolveItineraryAdjustCanaryGate(
  env: NodeJS.ProcessEnv = process.env,
): ItineraryAdjustCanaryGateStatus {
  const authorized = isItineraryAdjustCanaryAuthorized(env);
  const killSwitch = isItineraryAdjustCanaryKillSwitchOn(env);
  return {
    contractComplete: UWC_ITINERARY_CANARY_CONTRACT_COMPLETE,
    authorized,
    killSwitch,
    percent: getItineraryAdjustCanaryPercent(env),
    tripAllowlist: getItineraryAdjustCanaryTripAllowlist(env),
    operationAllowlist: getItineraryAdjustCanaryOperationAllowlist(env),
    enabled: UWC_ITINERARY_CANARY_CONTRACT_COMPLETE && authorized && !killSwitch,
  };
}

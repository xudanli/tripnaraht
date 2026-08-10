/**
 * UWC-CANARY-03 — UNIFIED_EXECUTE AUTHORITATIVE_CANARY controls.
 * Independent of ACTIONS/ITINERARY canary env, global AUTHORITATIVE, and compensation.
 *
 * Traffic requires cutover status APPROVED_FOR_CANARY | CANARY_IN_PROGRESS
 * after ACTIONS + ITINERARY pass in order.
 */

import {
  isUnifiedExecuteCanaryTrafficApproved,
} from './corridor-cutover.gate';

export const UWC_UNIFIED_CANARY_CONTRACT_COMPLETE = true as const;

export const UWC_UNIFIED_CANARY_MODE = 'AUTHORITATIVE_CANARY' as const;

/** First-round: verified PlanVersion-only activate (no mixed / itinerary / external SE). */
export const UWC_UNIFIED_CANARY_DEFAULT_OPS = [
  'verified_plan_version_only',
] as const;

export function isUnifiedExecuteCanaryAuthorized(
  env: NodeJS.ProcessEnv = process.env,
): boolean {
  const v = String(env.UWC_UNIFIED_CANARY_AUTHORIZED ?? '').trim().toLowerCase();
  return v === '1' || v === 'true' || v === 'yes' || v === 'on';
}

export function isUnifiedExecuteCanaryKillSwitchOn(
  env: NodeJS.ProcessEnv = process.env,
): boolean {
  const v = String(env.UWC_UNIFIED_CANARY_KILL_SWITCH ?? '').trim().toLowerCase();
  return v === '1' || v === 'true' || v === 'yes' || v === 'on' || v === 'kill';
}

export function getUnifiedExecuteCanaryPercent(
  env: NodeJS.ProcessEnv = process.env,
): number {
  const raw = Number(env.UWC_UNIFIED_CANARY_PERCENT ?? '0');
  if (!Number.isFinite(raw)) return 0;
  return Math.max(0, Math.min(100, Math.floor(raw)));
}

/** Comma-separated trip ids; empty = no trips admitted. */
export function getUnifiedExecuteCanaryTripAllowlist(
  env: NodeJS.ProcessEnv = process.env,
): readonly string[] {
  const raw = String(env.UWC_UNIFIED_CANARY_TRIP_ALLOWLIST ?? '').trim();
  if (!raw) return [];
  return raw
    .split(',')
    .map((s) => s.trim())
    .filter(Boolean);
}

export function getUnifiedExecuteCanaryOperationAllowlist(
  env: NodeJS.ProcessEnv = process.env,
): readonly string[] {
  const raw = String(env.UWC_UNIFIED_CANARY_OP_ALLOWLIST ?? '').trim();
  if (!raw) return [...UWC_UNIFIED_CANARY_DEFAULT_OPS];
  return raw
    .split(',')
    .map((s) => s.trim())
    .filter(Boolean);
}

export type UnifiedExecuteCanaryGateStatus = {
  contractComplete: typeof UWC_UNIFIED_CANARY_CONTRACT_COMPLETE;
  authorized: boolean;
  killSwitch: boolean;
  percent: number;
  tripAllowlist: readonly string[];
  operationAllowlist: readonly string[];
  /** Cutover has APPROVED_FOR_CANARY or CANARY_IN_PROGRESS. */
  cutoverTrafficApproved: boolean;
  /** Env + cutover — both required for selection. */
  enabled: boolean;
};

export function resolveUnifiedExecuteCanaryGate(
  env: NodeJS.ProcessEnv = process.env,
): UnifiedExecuteCanaryGateStatus {
  const authorized = isUnifiedExecuteCanaryAuthorized(env);
  const killSwitch = isUnifiedExecuteCanaryKillSwitchOn(env);
  const cutoverTrafficApproved = isUnifiedExecuteCanaryTrafficApproved();
  return {
    contractComplete: UWC_UNIFIED_CANARY_CONTRACT_COMPLETE,
    authorized,
    killSwitch,
    percent: getUnifiedExecuteCanaryPercent(env),
    tripAllowlist: getUnifiedExecuteCanaryTripAllowlist(env),
    operationAllowlist: getUnifiedExecuteCanaryOperationAllowlist(env),
    cutoverTrafficApproved,
    enabled:
      UWC_UNIFIED_CANARY_CONTRACT_COMPLETE &&
      authorized &&
      !killSwitch &&
      cutoverTrafficApproved,
  };
}

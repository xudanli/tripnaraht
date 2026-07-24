/**
 * UWC-CANARY-01 — ACTIONS_COMMIT only AUTHORITATIVE_CANARY controls.
 *
 * Independent of global AUTHORITATIVE dual gates and compensation exec gate.
 * Kill switch and authorization are separate.
 */

export const UWC_ACTIONS_CANARY_CONTRACT_COMPLETE = true as const;

/**
 * Ops/release must explicitly authorize canary traffic.
 * Default false — enable with UWC_ACTIONS_CANARY_AUTHORIZED=1.
 */
export function isActionsCommitCanaryAuthorized(
  env: NodeJS.ProcessEnv = process.env,
): boolean {
  const v = String(env.UWC_ACTIONS_CANARY_AUTHORIZED ?? '').trim().toLowerCase();
  return v === '1' || v === 'true' || v === 'yes' || v === 'on';
}

/** Immediate off switch — overrides authorization. */
export function isActionsCommitCanaryKillSwitchOn(
  env: NodeJS.ProcessEnv = process.env,
): boolean {
  const v = String(env.UWC_ACTIONS_CANARY_KILL_SWITCH ?? '').trim().toLowerCase();
  return v === '1' || v === 'true' || v === 'yes' || v === 'on' || v === 'kill';
}

/**
 * Percentage of admitted requests selected for canary (0–100).
 * Default 0 until ops sets UWC_ACTIONS_CANARY_PERCENT.
 */
export function getActionsCommitCanaryPercent(
  env: NodeJS.ProcessEnv = process.env,
): number {
  const raw = Number(env.UWC_ACTIONS_CANARY_PERCENT ?? '0');
  if (!Number.isFinite(raw)) return 0;
  return Math.max(0, Math.min(100, Math.floor(raw)));
}

/** Explicit action_name allowlist (comma-separated). */
export function getActionsCommitCanaryAllowlist(
  env: NodeJS.ProcessEnv = process.env,
): readonly string[] {
  const raw = String(env.UWC_ACTIONS_CANARY_ACTION_ALLOWLIST ?? '').trim();
  if (!raw) {
    // Built-in first-round candidates: notify/remind only (no itinerary CRUD verbs).
    return ['execution.remind'] as const;
  }
  return raw
    .split(',')
    .map((s) => s.trim())
    .filter(Boolean);
}

export const UWC_ACTIONS_CANARY_MODE = 'AUTHORITATIVE_CANARY' as const;

export type ActionsCommitCanaryGateStatus = {
  contractComplete: typeof UWC_ACTIONS_CANARY_CONTRACT_COMPLETE;
  authorized: boolean;
  killSwitch: boolean;
  percent: number;
  allowlist: readonly string[];
  /** Effective: may select traffic */
  enabled: boolean;
};

export function resolveActionsCommitCanaryGate(
  env: NodeJS.ProcessEnv = process.env,
): ActionsCommitCanaryGateStatus {
  const authorized = isActionsCommitCanaryAuthorized(env);
  const killSwitch = isActionsCommitCanaryKillSwitchOn(env);
  const percent = getActionsCommitCanaryPercent(env);
  const allowlist = getActionsCommitCanaryAllowlist(env);
  return {
    contractComplete: UWC_ACTIONS_CANARY_CONTRACT_COMPLETE,
    authorized,
    killSwitch,
    percent,
    allowlist,
    enabled: UWC_ACTIONS_CANARY_CONTRACT_COMPLETE && authorized && !killSwitch,
  };
}

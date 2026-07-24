/**
 * Per-corridor UWC write modes (UWC-1b/1c).
 *
 * AUTHORITATIVE unlock requires TWO independent gates:
 * - UWC_1C_OCC_CODE_COMPLETE (engineering: OCC contract landed)
 * - UWC_1C_OCC_SWITCH_AUTHORIZED (release/ops: explicit switch authorization)
 *
 * UWC-1c completes the code gate only; AUTHORITATIVE remains blocked until switch auth.
 */

import {
  AUTHORITATIVE_WRITE_V1_CORRIDORS,
  type AuthoritativeWriteCorridorId,
} from './authoritative-write.types';

export const CORRIDOR_WRITE_MODES = [
  'DISABLED',
  'SHADOW_VALIDATE',
  'AUTHORITATIVE',
] as const;

export type CorridorWriteMode = (typeof CORRIDOR_WRITE_MODES)[number];

/** Gate A — set true when UWC-1c OCC contract + tests land. */
export const UWC_1C_OCC_CODE_COMPLETE = true as const;

/**
 * Gate B — independent switch authorization (RRR / Release Owner).
 * Remains false after UWC-1c; do not flip in this ticket.
 */
export const UWC_1C_OCC_SWITCH_AUTHORIZED = false as const;

/**
 * Effective unlock for AUTHORITATIVE. Requires BOTH gates.
 * Still false after UWC-1c (switch not authorized).
 */
export const UWC_1C_OCC_UNLOCKED = (UWC_1C_OCC_CODE_COMPLETE &&
  UWC_1C_OCC_SWITCH_AUTHORIZED) as boolean;

export const UWC_AUTHORITATIVE_HARD_BLOCK_REASON =
  'AUTHORITATIVE_HARD_BLOCKED_PENDING_DUAL_GATES' as const;

export const UWC_AUTHORITATIVE_DUAL_GATE_STATUS = {
  codeComplete: UWC_1C_OCC_CODE_COMPLETE,
  switchAuthorized: UWC_1C_OCC_SWITCH_AUTHORIZED,
  unlocked: UWC_1C_OCC_UNLOCKED,
} as const;

/** Registration / enable order for first batch. */
export const UWC_1B_WIRE_ORDER: readonly AuthoritativeWriteCorridorId[] = [
  'ACTIONS_COMMIT',
  'ITINERARY_ADJUST',
  'UNIFIED_EXECUTE',
] as const;

const ENV_KEYS: Record<AuthoritativeWriteCorridorId, string> = {
  ACTIONS_COMMIT: 'UWC_CORRIDOR_MODE_ACTIONS_COMMIT',
  ITINERARY_ADJUST: 'UWC_CORRIDOR_MODE_ITINERARY_ADJUST',
  UNIFIED_EXECUTE: 'UWC_CORRIDOR_MODE_UNIFIED_EXECUTE',
};

/** Defaults: shadow only. */
export const UWC_1B_DEFAULT_MODES: Record<
  AuthoritativeWriteCorridorId,
  CorridorWriteMode
> = {
  ACTIONS_COMMIT: 'SHADOW_VALIDATE',
  ITINERARY_ADJUST: 'SHADOW_VALIDATE',
  UNIFIED_EXECUTE: 'SHADOW_VALIDATE',
};

function parseMode(raw: string | undefined): CorridorWriteMode | null {
  if (!raw) return null;
  const v = raw.trim().toUpperCase();
  if (v === 'DISABLED' || v === 'OFF' || v === '0') return 'DISABLED';
  if (v === 'SHADOW_VALIDATE' || v === 'SHADOW' || v === '1') return 'SHADOW_VALIDATE';
  if (v === 'AUTHORITATIVE' || v === 'AUTH' || v === '2') return 'AUTHORITATIVE';
  return null;
}

export type ResolvedCorridorWriteMode = {
  corridor: AuthoritativeWriteCorridorId;
  requested: CorridorWriteMode;
  effective: Exclude<CorridorWriteMode, 'AUTHORITATIVE'> | 'AUTHORITATIVE';
  authoritativeHardBlocked: boolean;
  blockReason?: typeof UWC_AUTHORITATIVE_HARD_BLOCK_REASON;
  dualGates: typeof UWC_AUTHORITATIVE_DUAL_GATE_STATUS;
};

/**
 * Resolve effective mode. AUTHORITATIVE requests are coerced to DISABLED
 * while dual gates are not both true.
 */
export function resolveCorridorWriteMode(
  corridor: AuthoritativeWriteCorridorId,
  env: NodeJS.ProcessEnv = process.env,
): ResolvedCorridorWriteMode {
  const fromEnv = parseMode(env[ENV_KEYS[corridor]]);
  const requested = fromEnv ?? UWC_1B_DEFAULT_MODES[corridor];

  if (requested === 'AUTHORITATIVE' && !UWC_1C_OCC_UNLOCKED) {
    return {
      corridor,
      requested,
      effective: 'DISABLED',
      authoritativeHardBlocked: true,
      blockReason: UWC_AUTHORITATIVE_HARD_BLOCK_REASON,
      dualGates: UWC_AUTHORITATIVE_DUAL_GATE_STATUS,
    };
  }

  return {
    corridor,
    requested,
    effective: requested,
    authoritativeHardBlocked: false,
    dualGates: UWC_AUTHORITATIVE_DUAL_GATE_STATUS,
  };
}

export function resolveAllCorridorWriteModes(
  env: NodeJS.ProcessEnv = process.env,
): ResolvedCorridorWriteMode[] {
  return AUTHORITATIVE_WRITE_V1_CORRIDORS.map((c) => resolveCorridorWriteMode(c, env));
}

export function isShadowValidateEffective(
  corridor: AuthoritativeWriteCorridorId,
  env?: NodeJS.ProcessEnv,
): boolean {
  return resolveCorridorWriteMode(corridor, env).effective === 'SHADOW_VALIDATE';
}

export function assertAuthoritativeNotEnabled(
  corridor: AuthoritativeWriteCorridorId,
  env?: NodeJS.ProcessEnv,
): void {
  const resolved = resolveCorridorWriteMode(corridor, env);
  if (resolved.requested === 'AUTHORITATIVE' && !UWC_1C_OCC_UNLOCKED) {
    throw new Error(
      `${UWC_AUTHORITATIVE_HARD_BLOCK_REASON}: corridor=${corridor} codeComplete=${UWC_1C_OCC_CODE_COMPLETE} switchAuthorized=${UWC_1C_OCC_SWITCH_AUTHORIZED}`,
    );
  }
  if (resolved.effective === 'AUTHORITATIVE' && !UWC_1C_OCC_UNLOCKED) {
    throw new Error(
      `${UWC_AUTHORITATIVE_HARD_BLOCK_REASON}: corridor=${corridor}`,
    );
  }
}

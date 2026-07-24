/**
 * Per-corridor UWC write modes (UWC-1b).
 *
 * AUTHORITATIVE is hard-blocked until UWC-1c OCC unlock.
 * This round defaults first-batch corridors to SHADOW_VALIDATE.
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

/**
 * Flip only after UWC-1c basePlanVersionId/contextVersion OCC lands + review.
 * Until then AUTHORITATIVE must never become effective.
 */
export const UWC_1C_OCC_UNLOCKED = false as const;

export const UWC_AUTHORITATIVE_HARD_BLOCK_REASON =
  'AUTHORITATIVE_HARD_BLOCKED_PENDING_UWC_1C_OCC' as const;

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

/** Defaults for UWC-1b rollout: shadow only. */
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
};

/**
 * Resolve effective mode. AUTHORITATIVE requests are coerced to DISABLED
 * while UWC_1C_OCC_UNLOCKED is false (hard block — not SHADOW, so no silent auth).
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
    };
  }

  return {
    corridor,
    requested,
    effective: requested,
    authoritativeHardBlocked: false,
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
      `${UWC_AUTHORITATIVE_HARD_BLOCK_REASON}: corridor=${corridor}`,
    );
  }
  if (resolved.effective === 'AUTHORITATIVE' && !UWC_1C_OCC_UNLOCKED) {
    throw new Error(
      `${UWC_AUTHORITATIVE_HARD_BLOCK_REASON}: corridor=${corridor}`,
    );
  }
}

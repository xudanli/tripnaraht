/**
 * Canonical mutation commit guard rollout flags.
 */

export type MutationGuardEnforcementMode = 'OFF' | 'SHADOW' | 'ENFORCE';

export type EffectivePlanWriteGuardMode = 'OFF' | 'SHADOW' | 'ENFORCE';

function parseTriState(
  raw: string | undefined,
  defaultMode: MutationGuardEnforcementMode,
): MutationGuardEnforcementMode {
  const v = raw?.trim().toUpperCase();
  if (v === 'OFF' || v === '0' || v === 'FALSE') return 'OFF';
  if (v === 'SHADOW') return 'SHADOW';
  if (v === 'ENFORCE' || v === 'ON' || v === '1' || v === 'TRUE' || v === 'YES') return 'ENFORCE';
  return defaultMode;
}

/** Legacy fallback: default ENFORCE — missing authority must not write. */
export function resolveLegacyMutationWriteGuardMode(): MutationGuardEnforcementMode {
  return parseTriState(process.env.LEGACY_MUTATION_WRITE_GUARD, 'ENFORCE');
}

export function isLegacyMutationWriteGuardActive(): boolean {
  return resolveLegacyMutationWriteGuardMode() !== 'OFF';
}

export function isLegacyMutationWriteGuardEnforce(): boolean {
  return resolveLegacyMutationWriteGuardMode() === 'ENFORCE';
}

/** Effective plan pointer guard — production step 1: SHADOW, step 5: ENFORCE default in prod */
export function resolveEffectivePlanWriteGuardMode(): EffectivePlanWriteGuardMode {
  const raw = process.env.EFFECTIVE_PLAN_WRITE_GUARD?.trim();
  if (!raw) {
    return process.env.NODE_ENV === 'production' ? 'ENFORCE' : 'OFF';
  }
  return parseTriState(raw, 'OFF') as EffectivePlanWriteGuardMode;
}

export function isEffectivePlanWriteGuardEnforce(): boolean {
  return resolveEffectivePlanWriteGuardMode() === 'ENFORCE';
}

export function isEffectivePlanWriteGuardShadow(): boolean {
  return resolveEffectivePlanWriteGuardMode() === 'SHADOW';
}

/** Back-compat: ENFORCE or legacy ON=true */
export function isEffectivePlanWriteGuardEnabled(): boolean {
  const mode = resolveEffectivePlanWriteGuardMode();
  return mode === 'ENFORCE' || mode === 'SHADOW';
}

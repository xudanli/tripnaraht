/**
 * Production Canary Profile — Iceland subset allowlist + phased rollout (A/B/C).
 * @see internal-docs/operations/PRODUCTION-CANARY-GO-READINESS.md
 */

export const ICELAND_PRODUCTION_CANARY_SCHEMA_ID = 'tripnara.iceland_production_canary@v1';

/** Staging SR#5 canary — must never be used on production canary profile. */
export const STAGING_SR5_CANARY_TRIP_ID = 'c0a55555-5555-4555-8555-555555555555';

export type IcelandProductionCanaryPhase = 'OFF' | 'OBSERVE' | 'SUGGEST' | 'EXECUTE';

export function isIcelandProductionCanaryEnabled(env: NodeJS.ProcessEnv = process.env): boolean {
  const v = env.ICELAND_PRODUCTION_CANARY_ENABLED?.trim().toLowerCase();
  return v === '1' || v === 'true' || v === 'yes';
}

export function resolveIcelandProductionCanaryPhase(
  env: NodeJS.ProcessEnv = process.env,
): IcelandProductionCanaryPhase {
  if (!isIcelandProductionCanaryEnabled(env)) return 'OFF';
  const raw = env.ICELAND_PRODUCTION_CANARY_PHASE?.trim().toUpperCase();
  if (raw === 'OBSERVE' || raw === 'SUGGEST' || raw === 'EXECUTE') return raw;
  return 'OBSERVE';
}

export function parseIcelandCanaryTripAllowlist(env: NodeJS.ProcessEnv = process.env): Set<string> {
  const raw = env.ICELAND_CANARY_TRIP_ALLOWLIST?.trim();
  if (!raw) return new Set();
  return new Set(
    raw
      .split(/[,;\s]+/)
      .map((s) => s.trim())
      .filter(Boolean),
  );
}

export function parseIcelandCanaryInternalUserIds(env: NodeJS.ProcessEnv = process.env): Set<string> {
  const raw = env.ICELAND_CANARY_INTERNAL_USER_IDS?.trim();
  if (!raw) return new Set();
  return new Set(
    raw
      .split(/[,;\s]+/)
      .map((s) => s.trim())
      .filter(Boolean),
  );
}

export function isTripOnIcelandCanaryAllowlist(tripId: string, env: NodeJS.ProcessEnv = process.env): boolean {
  if (!isIcelandProductionCanaryEnabled(env)) return false;
  const allowlist = parseIcelandCanaryTripAllowlist(env);
  if (allowlist.size === 0) return false;
  return allowlist.has(tripId);
}

export function isStagingCanaryTripBlockedOnProd(tripId: string): boolean {
  return tripId === STAGING_SR5_CANARY_TRIP_ID;
}

export function readProductionCanaryFlag(metadata: unknown): boolean {
  if (!metadata || typeof metadata !== 'object') return false;
  return (metadata as Record<string, unknown>).productionCanary === true;
}

export function isProductionCanaryRepairPipelineAllowed(
  tripId: string,
  env: NodeJS.ProcessEnv = process.env,
): boolean {
  if (!isTripOnIcelandCanaryAllowlist(tripId, env)) return true;
  const phase = resolveIcelandProductionCanaryPhase(env);
  return phase === 'SUGGEST' || phase === 'EXECUTE';
}

export function isProductionCanaryEffectivePlanWriteAllowed(
  tripId: string,
  env: NodeJS.ProcessEnv = process.env,
): boolean {
  if (!isTripOnIcelandCanaryAllowlist(tripId, env)) return true;
  return resolveIcelandProductionCanaryPhase(env) === 'EXECUTE';
}

export function isProductionCanaryProblemVisibleToUser(
  tripId: string,
  userId: string | undefined,
  env: NodeJS.ProcessEnv = process.env,
): boolean {
  if (!isTripOnIcelandCanaryAllowlist(tripId, env)) return true;
  const phase = resolveIcelandProductionCanaryPhase(env);
  if (phase === 'OFF' || phase === 'OBSERVE') return false;
  const internal = parseIcelandCanaryInternalUserIds(env);
  // SUGGEST | EXECUTE only — empty internal list → visible to all users on allowlist trips
  if (internal.size === 0) return true;
  return userId != null && internal.has(userId);
}

export function assertProductionCanaryExecuteAllowed(tripId: string, env: NodeJS.ProcessEnv = process.env): void {
  if (!isTripOnIcelandCanaryAllowlist(tripId, env)) return;
  if (!isProductionCanaryEffectivePlanWriteAllowed(tripId, env)) {
    throw new Error(
      `PRODUCTION_CANARY_EXECUTE_BLOCKED: trip=${tripId} phase=${resolveIcelandProductionCanaryPhase(env)} (requires EXECUTE)`,
    );
  }
}

export interface ProductionCanaryEnvEvaluation {
  ok: boolean;
  violations: string[];
}

export function evaluateProductionCanaryEnv(env: NodeJS.ProcessEnv = process.env): ProductionCanaryEnvEvaluation {
  const violations: string[] = [];
  if (!isIcelandProductionCanaryEnabled(env)) {
    return { ok: true, violations: [] };
  }
  const allowlist = parseIcelandCanaryTripAllowlist(env);
  if (allowlist.size === 0) {
    violations.push('ICELAND_CANARY_TRIP_ALLOWLIST must be non-empty when production canary enabled');
  }
  for (const id of allowlist) {
    if (isStagingCanaryTripBlockedOnProd(id)) {
      violations.push(`ICELAND_CANARY_TRIP_ALLOWLIST must not include staging SR#5 trip ${id}`);
    }
  }
  if (env.ICELAND_VEDUR_STAGING_WIND_THRESHOLD_KMH?.trim()) {
    violations.push('ICELAND_VEDUR_STAGING_WIND_THRESHOLD_KMH forbidden on production canary');
  }
  const db = env.DATABASE_URL ?? '';
  if (!db.includes('tripnara_prod')) {
    violations.push('Production canary DATABASE_URL must point to tripnara_prod');
  }
  return { ok: violations.length === 0, violations };
}

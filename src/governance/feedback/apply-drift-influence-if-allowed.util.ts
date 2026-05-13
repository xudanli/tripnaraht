import type { GovernanceDriftInfluence, ApplyDriftInfluenceGateOpts } from './governance-drift-influence.types';

/**
 * GFIL gate — **only** path by which drift-derived vectors may reach runtime consumers.
 * Does not persist; does not append ledger rows.
 */
export function applyDriftInfluenceIfAllowed(
  influences: readonly GovernanceDriftInfluence[],
  opts: ApplyDriftInfluenceGateOpts,
): GovernanceDriftInfluence[] {
  if (!opts.enabled) return [];
  const minC = opts.minConfidence ?? 0.55;
  const maxD = opts.maxAbsDelta ?? 0.14;
  return influences
    .filter((i) => i.confidence >= minC)
    .map((i) => ({
      ...i,
      suggestedDelta: clamp(i.suggestedDelta, -maxD, maxD),
      driftReasonCodes: [...i.driftReasonCodes],
    }));
}

function clamp(x: number, lo: number, hi: number): number {
  return Math.max(lo, Math.min(hi, x));
}

/**
 * P-ECO-Closure-10 — Identity-preserving region: mutation must stay inside envelopeRadius.
 */

export interface MutationEnvelopeAudit {
  withinIdentityRegion: boolean;
  envelopeRadius: number;
  /** [0,1] — margin before identity boundary (0 = at / past boundary). */
  distanceToBoundary: number;
}

function clamp01(x: number): number {
  return Math.min(1, Math.max(0, x));
}

export function evaluateMutationEnvelope(input: {
  mutationDistance: number;
  /** Allowed drift from {@link ExecutionIdentity.mutationEnvelope} or policy. */
  envelopeRadius: number;
}): MutationEnvelopeAudit {
  const r = Math.max(1e-6, input.envelopeRadius);
  const within = input.mutationDistance <= r;
  const distanceToBoundary = clamp01(r - input.mutationDistance);
  return {
    withinIdentityRegion: within,
    envelopeRadius: r,
    distanceToBoundary,
  };
}

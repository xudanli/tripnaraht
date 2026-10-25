/**
 * PD-4 / F9 — Abu Hard Gate cannot be overridden by CGUS / lens recommendations.
 */

import type { HardGateInvariantInput } from './lens-activation.types';

export class HardGateOverrideError extends Error {
  readonly code = 'HARD_GATE_OVERRIDE_FORBIDDEN' as const;

  constructor(message = 'Abu HARD_BLOCK 不可被三人格/CGUS 建议覆盖') {
    super(message);
    this.name = 'HardGateOverrideError';
  }
}

/**
 * Returns true when the recommendation is allowed to proceed.
 * Throws if a recommendation attempts to override HARD_BLOCK.
 */
export function assertHardGateNotOverridden(
  input: HardGateInvariantInput,
): void {
  if (
    input.abuVerdict === 'HARD_BLOCK' &&
    input.recommendationOverridesHardBlock === true
  ) {
    throw new HardGateOverrideError();
  }
}

export function isRecommendationAllowedUnderHardGate(
  input: HardGateInvariantInput,
): boolean {
  if (input.abuVerdict !== 'HARD_BLOCK') return true;
  return input.recommendationOverridesHardBlock !== true;
}

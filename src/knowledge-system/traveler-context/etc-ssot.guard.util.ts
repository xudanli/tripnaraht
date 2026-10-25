/**
 * Phase 4 — Gate / Evaluate / CGUS / Constraint must read EffectiveTravelerContext,
 * not Memory OS / TMR Ledger / trip.metadata side channels.
 */

import type { EffectiveTravelerContextV1 } from '../../travel-memory/effective-context/effective-traveler-context.types';
import { resolveEffectiveTravelerContextConsumeMode } from '../../travel-memory/effective-context/resolve-etc-consume-mode.util';

export type TravelerContextConsumer =
  | 'Evaluate'
  | 'Gate'
  | 'Constraint'
  | 'CGUS'
  | 'Admin'
  | 'Other';

export class TravelerContextSsotViolationError extends Error {
  constructor(
    message: string,
    public readonly consumer: TravelerContextConsumer,
  ) {
    super(message);
    this.name = 'TravelerContextSsotViolationError';
  }
}

/**
 * Assert decision path has an ETC object (not raw Memory OS).
 * When consume mode is `off`, returns etc but marks notActiveForGate.
 */
export function assertGateReadsEffectiveTravelerContext(
  consumer: TravelerContextConsumer,
  input: {
    effectiveTravelerContext?: EffectiveTravelerContextV1 | null;
    /** @deprecated — will throw */
    memoryOsDirect?: unknown;
    tripMetadataDirect?: unknown;
  },
): {
  etc: EffectiveTravelerContextV1;
  consumeMode: 'off' | 'shadow' | 'active';
  activeForGate: boolean;
} {
  if (input.memoryOsDirect != null && input.effectiveTravelerContext == null) {
    throw new TravelerContextSsotViolationError(
      `[${consumer}] Memory OS must not be Gate SSOT. Resolve EffectiveTravelerContext first.`,
      consumer,
    );
  }
  if (input.tripMetadataDirect != null && input.effectiveTravelerContext == null) {
    throw new TravelerContextSsotViolationError(
      `[${consumer}] trip.metadata traveler fields must not be Gate SSOT. Use ETC.`,
      consumer,
    );
  }
  const etc = input.effectiveTravelerContext;
  if (!etc || etc.schemaId !== 'tripnara.effective_traveler_context@v1') {
    throw new TravelerContextSsotViolationError(
      `[${consumer}] Missing EffectiveTravelerContextV1.`,
      consumer,
    );
  }
  const consumeMode = resolveEffectiveTravelerContextConsumeMode();
  const activeForGate =
    consumeMode === 'active' || etc.consumptionMode === 'ACTIVE';
  return { etc, consumeMode, activeForGate };
}

/** Decision-facing fields from ETC.effective for Gate soft/hard modulation */
export function readEtcDecisionFields(etc: EffectiveTravelerContextV1): {
  pace?: unknown;
  riskTolerance?: unknown;
  dietaryConstraints?: unknown;
  tripOverridesApplied: string[];
} {
  return {
    pace: etc.effective.pace?.value,
    riskTolerance: etc.effective.riskTolerance?.value,
    dietaryConstraints: etc.effective.dietaryConstraints?.value,
    tripOverridesApplied: etc.tripOverridesApplied ?? [],
  };
}

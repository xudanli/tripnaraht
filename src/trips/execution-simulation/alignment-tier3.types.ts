/**
 * Alignment Tier-3 — execution deviation tuples for RM calibration.
 * Persisted via execution-closure-persistence / itinerary-revision-regret pipeline.
 */

import type { ExecutionIR } from '../execution-ir/execution-ir.types';

export type AlignmentDiscardReason =
  | 'FATIGUE_OVERFLOW'
  | 'SOCIAL_FRICTION'
  | 'WEATHER_BLOCK'
  | 'TIME_CONFLICT'
  | 'PREFERENCE_SHIFT'
  | 'UNKNOWN';

/**
 * Causal tuple: (Context, IntendedIR, UserModifiedIR, DiscardReason)
 * Used to calibrate physical / organizational reward models from real execution traces.
 */
export interface CausalAlignmentTuple {
  tupleId: string;
  tripId: string;
  capturedAt: string;
  /** World model context fingerprint at decision time */
  contextFingerprint: string;
  intendedIR: ExecutionIR;
  userModifiedIR: ExecutionIR;
  discardReason: AlignmentDiscardReason;
  /** Optional node-level regret signals */
  affectedNodeIds: string[];
  /** Negative organizational reward magnitude [0, 1] */
  organizationalPenalty: number;
  /** Negative physical reward magnitude [0, 1] */
  physicalPenalty: number;
  metadata?: Record<string, unknown>;
}

export interface AlignmentTier3Batch {
  source: 'execution-closure' | 'itinerary-revision-regret' | 'manual';
  tuples: CausalAlignmentTuple[];
}

/** Heuristic mapping from revision patterns → alignment penalties (deterministic stub). */
export function inferAlignmentPenalties(input: {
  affectedNodeIds: string[];
  discardReason: AlignmentDiscardReason;
  durationMinutesRemoved?: number;
}): { organizationalPenalty: number; physicalPenalty: number } {
  const base = {
    FATIGUE_OVERFLOW: { org: 0.75, phys: 0.35 },
    SOCIAL_FRICTION: { org: 0.85, phys: 0.15 },
    WEATHER_BLOCK: { org: 0.2, phys: 0.9 },
    TIME_CONFLICT: { org: 0.45, phys: 0.55 },
    PREFERENCE_SHIFT: { org: 0.3, phys: 0.2 },
    UNKNOWN: { org: 0.4, phys: 0.4 },
  }[input.discardReason];

  const durationBoost =
    (input.durationMinutesRemoved ?? 0) > 300 ? 0.1 : 0;

  return {
    organizationalPenalty: Math.min(1, base.org + durationBoost),
    physicalPenalty: Math.min(1, base.phys + durationBoost * 0.5),
  };
}

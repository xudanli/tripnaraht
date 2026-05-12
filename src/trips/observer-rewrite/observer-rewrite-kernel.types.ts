/**
 * P23 — Observer as mutable state: co-evolves with observed reality feedback.
 */

import type { AttentionPolicy, SamplingStrategy } from '../observer/observer.types';
import type { ObserverBiasModel } from '../observer/observer.types';

/** Extends P22 bias labels with evolved postures after reflection. */
export type ExtendedObserverBiasModel =
  | ObserverBiasModel
  | 'RISK_NEUTRALIZED'
  | 'OPPORTUNITY_AMPLIFIED';

export interface ObserverState {
  observerId: string;
  attentionPolicy: AttentionPolicy;
  biasModel: ExtendedObserverBiasModel;
  /** Latent preference coordinates — nudged by reality embedding shifts. */
  identityVector: number[];
  /** Higher = less willingness to drift settings [0,1]. */
  driftResistance: number;
  samplingStrategy: SamplingStrategy;
}

export interface ObserverMutationHistoryEntry {
  /** Normalized temporal prediction error [0,1]. */
  temporalSkew?: number;
  /** Load proxy — number of attention-demanding events in window. */
  eventCount?: number;
}

export interface ObserverDriftMetrics {
  temporalMismatch: number;
  eventOverload: boolean;
}

export interface SelectedRealityFeedback {
  failureType?: 'HIGH_RISK_OVERESTIMATION';
  successPattern?: 'LOW_COST_HIGH_GAIN';
  /** Same length as identity vector when provided. */
  embeddingShift?: number[];
}

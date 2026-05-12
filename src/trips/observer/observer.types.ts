/**
 * P22 — Observer as first-class primitive: collapse is conditioned on attention & bias, not raw max-utility alone.
 */

export type SamplingStrategy = 'FULL_TRACE' | 'SPARSE_TRACE' | 'EVENT_TRIGGERED' | 'GOAL_ORIENTED';

export type TemporalResolution = 'REALTIME' | 'WINDOWED' | 'EVENT_BASED';

export type SpatialResolution = 'GLOBAL' | 'REGIONAL' | 'LOCAL';

export interface AttentionPolicy {
  focusDomains: string[];
  temporalResolution: TemporalResolution;
  spatialResolution: SpatialResolution;
}

export type ObserverBiasModel =
  | 'NEUTRAL'
  | 'RISK_AVOIDANT'
  | 'OPPORTUNITY_SEEKING';

export interface ExecutionObserver {
  observerId: string;
  attentionPolicy: AttentionPolicy;
  samplingStrategy: SamplingStrategy;
  biasModel: ObserverBiasModel;
}

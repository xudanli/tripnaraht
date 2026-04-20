export type PomdpMetricEventType =
  | 'POMDP_REFINEMENT_APPLIED'
  | 'POMDP_REFINEMENT_SKIPPED';

export interface PomdpMetricEvent {
  type: PomdpMetricEventType;
  at: string;
  requestId?: string;
  countryCode?: string;
  month?: number;

  // high-level
  beliefRefinement?: 'POMDP' | 'META_ALLOCATOR';
  refinementEffective?: boolean;

  // observation summary
  observationIndependenceTier?: 'STRONG_EXTERNAL' | 'STRONG_INTERNAL' | 'WEAK';
  observationQuality?: 'HIGH' | 'MEDIUM' | 'LOW';
  observationFusionOrder?: Array<'windSpeed' | 'visibilityM' | 'precipitationMm'>;
  observationsUsedCount?: number;

  // deltas
  deltaEntropy01?: number;
  deltaEss?: number;
  weightL1Delta?: number;
  weightJSDivergence?: number;

  // bucket keys / provenance
  windSpeedMetaSource?: string;
  windSpeedEvidenceCount?: number;
  windSpeedEvidenceSources?: string[];

  // thresholds snapshot (for calibration)
  refinementThresholds?: { n: number; l1: number; js: number };
  observationModelParams?: Record<string, unknown>;

  // free-form reason when skipped
  skipReason?: string;
}

export function shouldEmitPomdpMetricEvents(): boolean {
  const v = process.env.DECISION_OS_POMDP_METRICS;
  return v === '1' || v === 'true';
}


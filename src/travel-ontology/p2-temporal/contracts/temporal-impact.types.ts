/**
 * ONT-P2 — TemporalImpact contract
 * SHADOW prediction surface only; never Canonical Assessment input.
 */

export const TEMPORAL_IMPACT_SCHEMA_ID = 'tripnara.temporal_impact@v1' as const;

export type TemporalRiskLevel = 'NONE' | 'YELLOW' | 'ORANGE' | 'RED';

export interface TemporalImpact {
  schemaId: typeof TEMPORAL_IMPACT_SCHEMA_ID;
  temporalImpactId: string;
  /** Semantic scope — P2-00 validates WEATHER_DETERIORATION only */
  semanticScope: 'WEATHER_DETERIORATION';
  subjectType: string;
  subjectId: string;
  tripId?: string;
  regionId?: string;

  predictedOnset: string;
  predictedDeterioration?: string;
  /** Peak predicted risk in the horizon */
  predictedPeakLevel: TemporalRiskLevel;
  /** Scopes / plan items expected to be affected */
  affectedScopes: string[];

  confidence: number;
  evidenceRefs: string[];
  predictionVersion: string;

  /** Always SHADOW in P2-00 */
  authorityMode: 'SHADOW';
  computedAt: string;
}

/**
 * ONT-P2 — PredictionRecord contract (immutable SHADOW prediction envelope)
 */

import type { InterventionDeadline } from './intervention-deadline.types';
import type { TemporalImpact } from './temporal-impact.types';

export const PREDICTION_RECORD_SCHEMA_ID = 'tripnara.prediction_record@v1' as const;

export interface PredictionRecord {
  schemaId: typeof PREDICTION_RECORD_SCHEMA_ID;
  predictionId: string;
  /** Weather Deterioration reuse — no fourth semantic */
  semanticScope: 'WEATHER_DETERIORATION';
  tripId?: string;
  regionId: string;

  issuedAt: string;
  horizonEndAt: string;
  predictorId: string;
  predictionVersion: string;

  temporalImpact: TemporalImpact;
  interventionDeadline: InterventionDeadline;

  /** Forecast series / observation evidence ids */
  evidenceRefs: string[];

  /**
   * SHADOW: must not feed Canonical Assessment, READY, Confirm, or Execute.
   */
  authorityMode: 'SHADOW';
  /** Explicit non-control seals for Gate 0 */
  controlSeals: {
    mutatesCanonicalAssessment: false;
    controlsReady: false;
    controlsConfirm: false;
    controlsExecute: false;
    mayCanonicalApply: false;
  };
}

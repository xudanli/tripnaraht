/**
 * ONT-P2-02B legacy shim — prefer emitInternalTemporalAdvisory from internal-advisory/
 */

import type { PredictionRecord } from '../contracts';
import type { InternalTemporalAdvisoryAuthorization } from './evaluate-quality-gate';
import {
  approveInternalTemporalAdvisoryPilot,
  emitInternalTemporalAdvisory,
  InternalAdvisoryStore,
  isInternalAdvisoryApproved,
  type InternalTemporalAdvisoryAuthorizationV2,
} from '../internal-advisory';

export const INTERNAL_SHADOW_ADVISORY_SCHEMA_ID =
  'tripnara.internal_shadow_temporal_advisory@v1' as const;

export interface InternalShadowTemporalAdvisory {
  schemaId: typeof INTERNAL_SHADOW_ADVISORY_SCHEMA_ID;
  advisoryId: string;
  tripId: string;
  predictionId: string;
  authorityMode: 'SHADOW';
  audience: 'INTERNAL_ONLY';
  shadowBanner: 'SHADOW_PREDICTION_NOT_AUTHORITATIVE';
  message: string;
  interventionDeadline?: string;
  predictedOnset?: string;
  controlSeals: {
    mutatesCanonicalAssessment: false;
    mutatesPlanRevision: false;
    controlsReady: false;
    controlsConfirm: false;
    controlsExecute: false;
    mayCanonicalApply: false;
  };
  emittedAt: string;
}

function toV2(
  auth: InternalTemporalAdvisoryAuthorization,
): InternalTemporalAdvisoryAuthorizationV2 {
  return approveInternalTemporalAdvisoryPilot({
    submittedAt: auth.submittedAt ?? new Date().toISOString(),
    nowMs: Date.parse(auth.approvedAt ?? new Date().toISOString()),
  });
}

/** @deprecated use emitInternalTemporalAdvisory */
export function emitInternalShadowTemporalAdvisory(input: {
  authorization:
    | InternalTemporalAdvisoryAuthorization
    | InternalTemporalAdvisoryAuthorizationV2;
  prediction: PredictionRecord;
  nowMs?: number;
}): InternalShadowTemporalAdvisory | { skipped: string } {
  const status = (input.authorization as { status: string }).status;
  if (
    !isInternalAdvisoryApproved(
      status as 'APPROVED' | 'APPROVED_INTERNAL_ADVISORY_ONLY',
    )
  ) {
    return {
      skipped: `authorization status=${status}; require APPROVED_INTERNAL_ADVISORY_ONLY`,
    };
  }

  const v2 =
    'decision' in input.authorization
      ? (input.authorization as InternalTemporalAdvisoryAuthorizationV2)
      : toV2(input.authorization as InternalTemporalAdvisoryAuthorization);

  const store = new InternalAdvisoryStore();
  const result = emitInternalTemporalAdvisory({
    authorization: v2,
    prediction: input.prediction,
    store,
    ctx: {
      contextRevision: 1,
      factSetVersion: 'legacy_shim',
      vehicleClass: 'HIGH_ROOF_CAMPER',
      viewerId: 'reviewer.ontology.pm',
      nowMs: input.nowMs,
    },
  });
  if ('skipped' in result) return result;
  const a = result.advisory;
  return {
    schemaId: INTERNAL_SHADOW_ADVISORY_SCHEMA_ID,
    advisoryId: a.advisoryId,
    tripId: a.tripId,
    predictionId: a.predictionId,
    authorityMode: 'SHADOW',
    audience: 'INTERNAL_ONLY',
    shadowBanner: 'SHADOW_PREDICTION_NOT_AUTHORITATIVE',
    message: [
      a.display.whatPredicted,
      a.display.whyRelevant,
      a.display.latestActionBy,
      a.display.currentRecommendation,
      a.display.authorityStatus,
    ].join(' '),
    interventionDeadline: a.interventionDeadline,
    predictedOnset: a.predictedOnset,
    controlSeals: {
      mutatesCanonicalAssessment: false,
      mutatesPlanRevision: false,
      controlsReady: false,
      controlsConfirm: false,
      controlsExecute: false,
      mayCanonicalApply: false,
    },
    emittedAt: a.emittedAt,
  };
}

/**
 * Map traversability assessment → Abu constraint verdict (ADR gate table).
 */

import type { Rfc001ConstraintAssertion } from '../contracts/guardian-outputs.types';
import { RFC001_REASON_CODES } from '../reason-codes/reason-code.registry';
import { ROAD_TRAVERSABILITY_CONSTRAINTS } from './road-traversability.types';
import type { RoadTraversabilityAssessment } from './road-traversability.types';

export function traversabilityGateToAbuVerdict(assessment: RoadTraversabilityAssessment): {
  verdict: Rfc001ConstraintAssertion['verdict'];
  overridable: boolean;
} {
  switch (assessment.gate) {
    case 'REJECT':
      return {
        verdict: assessment.result === 'UNKNOWN' ? 'UNKNOWN' : 'BLOCK',
        overridable: false,
      };
    case 'SUGGEST_REPLACE':
      return { verdict: 'BLOCK', overridable: false };
    case 'NEED_CONFIRM':
      return { verdict: 'WARNING', overridable: true };
    case 'ALLOW':
      return { verdict: 'PASS', overridable: true };
    default:
      return { verdict: 'UNKNOWN', overridable: false };
  }
}

export function traversabilityReasonCodes(
  assessment: RoadTraversabilityAssessment,
): string[] {
  if (assessment.result === 'CLOSED') {
    return [RFC001_REASON_CODES.ROAD_SEGMENT_CLOSED];
  }
  if (assessment.result === 'UNKNOWN') {
    return [RFC001_REASON_CODES.EVIDENCE_INSUFFICIENT];
  }
  if (
    assessment.hardConstraints.includes(ROAD_TRAVERSABILITY_CONSTRAINTS.F_ROAD_REQUIRES_4WD) ||
    assessment.result === 'VEHICLE_INCOMPATIBLE' ||
    assessment.result === 'TEMPORARILY_IMPASSABLE'
  ) {
    return [RFC001_REASON_CODES.ROAD_SEGMENT_RESTRICTED];
  }
  if (assessment.result === 'DRIVER_INCOMPATIBLE') {
    return [RFC001_REASON_CODES.ROAD_SEGMENT_RESTRICTED];
  }
  return [RFC001_REASON_CODES.ROAD_SEGMENT_RESTRICTED];
}

export function traversabilityConstraintCode(
  assessment: RoadTraversabilityAssessment,
): string {
  if (assessment.result === 'CLOSED') return 'ROAD_CLOSED';
  if (assessment.result === 'VEHICLE_INCOMPATIBLE') return 'ROAD_VEHICLE_INCOMPATIBLE';
  if (assessment.result === 'TEMPORARILY_IMPASSABLE') return 'ROAD_TEMPORARILY_IMPASSABLE';
  if (assessment.result === 'DRIVER_INCOMPATIBLE') return 'ROAD_DRIVER_INCOMPATIBLE';
  if (assessment.result === 'UNKNOWN') return 'EVIDENCE_INSUFFICIENT';
  return 'ROAD_RESTRICTED';
}

export function buildAbuAssertionFromTraversability(
  base: Omit<
    Rfc001ConstraintAssertion,
    'verdict' | 'constraintCode' | 'reasonCodes' | 'overridable'
  >,
  assessment: RoadTraversabilityAssessment,
  evidenceRefs: string[],
): Rfc001ConstraintAssertion {
  const { verdict, overridable } = traversabilityGateToAbuVerdict(assessment);
  const result: Rfc001ConstraintAssertion = {
    ...base,
    verdict,
    constraintCode: traversabilityConstraintCode(assessment),
    reasonCodes: traversabilityReasonCodes(assessment),
    overridable,
    evidenceRefs: [...base.evidenceRefs, ...assessment.evidenceRefs, ...evidenceRefs],
    confidence: base.confidence,
  };

  if (verdict === 'WARNING' && assessment.risks.length > 0) {
    result.recoveryConditions = [
      {
        code: 'TRAVERSABILITY_CAUTION',
        description: assessment.risks.join('; '),
        evidenceRefs,
      },
    ];
  }

  return result;
}

/**
 * Map Policy Lab CONFLICT_MATRIX hits → constraint-registry reason codes + assertion fields.
 * Registry remains vocabulary only; conditions stay in Policy Lab DB.
 */

import type { ConflictMatrixEffect, ConflictMatrixHit } from '../../trips/decision/shared/conflict-matrix.util';
import type {
  ConstraintAssertion,
  ConstraintAssertionSeverity,
  ConstraintEvaluationStatus,
} from '../../decision-runtime/constraints/contracts/constraint-assertion';

export interface PolicyLabRegistryMapping {
  reasonCode: string;
  constraintType: string;
  status: ConstraintEvaluationStatus;
  severity: ConstraintAssertionSeverity;
  remediationHints?: string[];
  overridable: boolean;
}

const EFFECT_DEFAULTS: Record<ConflictMatrixEffect, PolicyLabRegistryMapping> = {
  HARD_BLOCK: {
    reasonCode: 'ROAD_CLOSED',
    constraintType: 'ROAD_ACCESS',
    status: 'BLOCK',
    severity: 'CRITICAL',
    overridable: false,
    remediationHints: ['Change vehicle or avoid F-road / hazardous segment'],
  },
  WARNING: {
    reasonCode: 'ROAD_STATUS',
    constraintType: 'ROAD_ACCESS',
    status: 'WARNING',
    severity: 'MEDIUM',
    overridable: true,
  },
  RE_ROUTE: {
    reasonCode: 'WEATHER_STORM',
    constraintType: 'WEATHER',
    status: 'WARNING',
    severity: 'HIGH',
    overridable: true,
    remediationHints: ['Prefer alternate route or delay departure'],
  },
  SPEED_FACTOR_DOWN: {
    reasonCode: 'WEATHER_STORM',
    constraintType: 'WEATHER',
    status: 'WARNING',
    severity: 'MEDIUM',
    overridable: true,
    remediationHints: ['Reduce driving speed / extend buffers'],
  },
};

/** Prefer weather codes when ruleId hints weather/wind/rain/snow. */
export function mapPolicyLabHitToRegistry(hit: ConflictMatrixHit): PolicyLabRegistryMapping {
  const base = { ...EFFECT_DEFAULTS[hit.effect] };
  const id = String(hit.ruleId ?? '').toLowerCase();
  if (
    id.includes('wind') ||
    id.includes('weather') ||
    id.includes('rain') ||
    id.includes('snow') ||
    id.includes('visibility') ||
    id.includes('storm')
  ) {
    if (hit.effect === 'HARD_BLOCK') {
      base.reasonCode = 'ACTIVITY_PROHIBITED';
      base.constraintType = 'WEATHER';
    } else if (hit.effect === 'WARNING' || hit.effect === 'RE_ROUTE' || hit.effect === 'SPEED_FACTOR_DOWN') {
      base.reasonCode = 'WEATHER_STORM';
      base.constraintType = 'WEATHER';
    }
  }
  if (id.includes('froad') || id.includes('vehicle_block') || id.includes('road')) {
    if (hit.effect === 'HARD_BLOCK') {
      base.reasonCode = 'ROAD_CLOSED';
      base.constraintType = 'ROAD_ACCESS';
    }
  }
  return base;
}

export function policyLabHitToAssertion(
  hit: ConflictMatrixHit,
  tripId: string,
  opts?: { candidateId?: string },
): ConstraintAssertion {
  const mapped = mapPolicyLabHitToRegistry(hit);
  return {
    assertionId: `policy-lab:${hit.ruleId}:${opts?.candidateId ?? 'plan'}`,
    constraintType: mapped.constraintType,
    status: mapped.status,
    severity: mapped.severity,
    scope: { tripId },
    reasonCode: mapped.reasonCode,
    evidenceRefs: hit.matchedConditions.map((c) => `condition:${c}`),
    message: `Policy Lab conflict matrix hit: ${hit.ruleId} (${hit.effect})`,
    remediationHints: mapped.remediationHints,
    evaluator: {
      engine: 'policy-lab',
      version: 'conflict-matrix@v1',
      ruleId: hit.ruleId,
    },
    overridable: mapped.overridable,
    confidence: 1,
  };
}

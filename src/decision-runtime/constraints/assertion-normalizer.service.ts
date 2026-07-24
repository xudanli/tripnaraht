/**
 * Normalizes provider-specific outputs into canonical ConstraintAssertion[].
 */

import { randomUUID } from 'crypto';
import type { CheckerViolation } from '../../trips/decision/constraints/constraint-checker';
import type { Rfc001ConstraintAssertion } from '../../trips/guardian-decision-core/contracts/guardian-outputs.types';
import type { PackConstraintEvaluation } from '../packs/rules/pack-rule-constraint.types';
import type {
  ConstraintAssertion,
  ConstraintAssertionSeverity,
  ConstraintEvaluationStatus,
} from './contracts/constraint-assertion';

const LEGACY_ENGINE = 'legacy-constraint-checker';
const LEGACY_VERSION = '0.1.0';
const GUARDIAN_ENGINE = 'guardian-assertion';
const GUARDIAN_VERSION = '0.1.0';
const PACK_ENGINE = 'destination-pack-rules';
const PACK_VERSION = '0.1.0';

export function mapLegacyViolationToAssertion(
  violation: CheckerViolation,
  tripId: string,
  candidateId?: string,
): ConstraintAssertion {
  const status = mapLegacySeverityToStatus(violation.severity);
  return {
    assertionId: `legacy_${violation.code}_${randomUUID()}`,
    constraintType: violation.code,
    status,
    severity: mapStatusToSeverity(status, violation.code),
    scope: {
      tripId,
      dayId: violation.date,
      activityId: violation.activityId ?? violation.slotId,
    },
    reasonCode: violation.code,
    evidenceRefs: [],
    message: violation.message,
    remediationHints: violation.suggestions,
    evaluator: { engine: LEGACY_ENGINE, version: LEGACY_VERSION },
    overridable: status !== 'BLOCK',
    confidence: status === 'BLOCK' ? 0.9 : 0.75,
    ...(candidateId ? {} : {}),
  };
}

export function mapGuardianAssertionToCanonical(
  assertion: Rfc001ConstraintAssertion,
  tripId: string,
): ConstraintAssertion {
  const status = mapGuardianVerdictToStatus(assertion.verdict);
  return {
    assertionId: assertion.assertionId,
    constraintType: assertion.constraintCode,
    status,
    severity: mapStatusToSeverity(status, assertion.constraintCode),
    scope: {
      tripId,
      activityId: assertion.affectedPlanItemIds[0],
      roadSegmentIds: assertion.affectedEntityRefs
        .filter((r) => r.kind === 'ROUTE_SEGMENT')
        .map((r) => r.id),
    },
    reasonCode: assertion.reasonCodes[0] ?? assertion.constraintCode,
    evidenceRefs: assertion.evidenceRefs,
    message: assertion.constraintCode,
    remediationHints: assertion.recoveryConditions?.map((c) => c.description),
    evaluator: {
      engine: GUARDIAN_ENGINE,
      version: assertion.ruleVersion || GUARDIAN_VERSION,
      ruleId: assertion.semanticKey,
    },
    overridable: assertion.overridable,
    confidence: assertion.confidence,
  };
}

export function mapPackEvaluationToAssertion(
  evaluation: PackConstraintEvaluation,
  tripId: string,
): ConstraintAssertion {
  const status = mapPackVerdictToStatus(evaluation.verdict);
  return {
    assertionId: `pack_${evaluation.ruleId}_${randomUUID()}`,
    constraintType: evaluation.constraintCode,
    status,
    severity: mapStatusToSeverity(status, evaluation.constraintCode),
    scope: { tripId },
    reasonCode: evaluation.reasonCodes[0] ?? evaluation.constraintCode,
    evidenceRefs: [],
    message: evaluation.constraintCode,
    remediationHints: evaluation.recoveryConditions?.map((c) => c.description),
    evaluator: {
      engine: PACK_ENGINE,
      version: evaluation.ruleVersion || PACK_VERSION,
      ruleId: evaluation.ruleId,
    },
    overridable: evaluation.overridable,
    confidence: status === 'BLOCK' ? 0.95 : 0.85,
  };
}

export function dedupeAndMergeAssertions(
  assertions: ConstraintAssertion[],
): ConstraintAssertion[] {
  const byKey = new Map<string, ConstraintAssertion>();
  for (const assertion of assertions) {
    const key = [
      assertion.constraintType,
      assertion.scope.tripId,
      assertion.scope.dayId ?? '',
      assertion.scope.activityId ?? '',
      assertion.reasonCode,
    ].join('|');
    const existing = byKey.get(key);
    if (!existing || statusRank(assertion.status) > statusRank(existing.status)) {
      byKey.set(key, assertion);
    }
  }
  return [...byKey.values()];
}

function statusRank(status: ConstraintEvaluationStatus): number {
  switch (status) {
    case 'BLOCK':
      return 5;
    case 'REQUIRES_VERIFICATION':
      return 4;
    case 'UNKNOWN':
      return 3;
    case 'WARNING':
      return 2;
    case 'PASS':
      return 1;
    default:
      return 0;
  }
}

function mapLegacySeverityToStatus(
  severity: CheckerViolation['severity'],
): ConstraintEvaluationStatus {
  if (severity === 'error') return 'BLOCK';
  if (severity === 'warning') return 'WARNING';
  return 'PASS';
}

function mapGuardianVerdictToStatus(
  verdict: Rfc001ConstraintAssertion['verdict'],
): ConstraintEvaluationStatus {
  if (verdict === 'BLOCK') return 'BLOCK';
  if (verdict === 'WARNING') return 'WARNING';
  if (verdict === 'UNKNOWN') return 'UNKNOWN';
  return 'PASS';
}

function mapPackVerdictToStatus(
  verdict: PackConstraintEvaluation['verdict'],
): ConstraintEvaluationStatus {
  if (verdict === 'BLOCK') return 'BLOCK';
  if (verdict === 'WARNING') return 'WARNING';
  if (verdict === 'UNKNOWN') return 'UNKNOWN';
  return 'PASS';
}

function mapStatusToSeverity(
  status: ConstraintEvaluationStatus,
  constraintType: string,
): ConstraintAssertionSeverity {
  if (status === 'BLOCK') {
    return /ROAD|HAZARD|WEATHER|SAFETY|FROAD/i.test(constraintType) ? 'CRITICAL' : 'HIGH';
  }
  if (status === 'REQUIRES_VERIFICATION') return 'HIGH';
  if (status === 'UNKNOWN') return 'MEDIUM';
  if (status === 'WARNING') return 'LOW';
  return 'INFO';
}

export function deriveOverallStatus(
  assertions: ConstraintAssertion[],
): import('./contracts/canonical-constraint-report').CanonicalOverallStatus {
  if (assertions.some((a) => a.status === 'BLOCK')) {
    return 'INFEASIBLE';
  }
  if (assertions.some((a) => a.status === 'REQUIRES_VERIFICATION')) {
    return 'UNVERIFIED';
  }
  if (assertions.some((a) => a.status === 'UNKNOWN')) {
    return 'UNVERIFIED';
  }
  if (assertions.some((a) => a.status === 'WARNING')) {
    return 'CONDITIONALLY_FEASIBLE';
  }
  return 'FEASIBLE';
}

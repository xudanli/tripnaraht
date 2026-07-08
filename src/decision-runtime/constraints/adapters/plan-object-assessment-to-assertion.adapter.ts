/**
 * PlanObjectAssessment → Gateway ConstraintAssertion (Phase 4).
 */

import type { PlanObjectAssessment, PlanObjectProjectionView } from '../../plan-objects/contracts/plan-object.types';
import type {
  ConstraintAssertion,
  ConstraintAssertionSeverity,
  ConstraintEvaluationStatus,
} from '../contracts/constraint-assertion';

export const PLAN_OBJECT_ENGINE = 'plan-object-evaluator';
export const PLAN_OBJECT_VERSION = '1.0.0';

function severityToStatus(severity: PlanObjectAssessment['severity']): ConstraintEvaluationStatus {
  if (severity === 'BLOCK') return 'BLOCK';
  if (severity === 'WARNING') return 'WARNING';
  return 'PASS';
}

function severityToAssertionSeverity(
  severity: PlanObjectAssessment['severity'],
): ConstraintAssertionSeverity {
  if (severity === 'BLOCK') return 'CRITICAL';
  if (severity === 'WARNING') return 'MEDIUM';
  return 'LOW';
}

function reasonCodeForKind(kind: PlanObjectAssessment['kind']): string {
  switch (kind) {
    case 'STAY_LINKAGE':
      return 'PLAN_OBJECT_STAY_LINKAGE';
    case 'MEAL_WINDOW_VS_ARRIVAL':
      return 'PLAN_OBJECT_MEAL_ARRIVAL';
    case 'MEAL_WINDOW_GAP':
      return 'PLAN_OBJECT_MEAL_GAP';
    case 'BUFFER_LINKAGE':
      return 'PLAN_OBJECT_BUFFER_LINKAGE';
    case 'DAILY_FATIGUE_LOAD':
      return 'PLAN_OBJECT_FATIGUE_LOAD';
    case 'TRANSFER_DAILY_LOAD':
      return 'PLAN_OBJECT_TRANSFER_LOAD';
    default:
      return 'PLAN_OBJECT_ASSESSMENT';
  }
}

function normalizeAssertionId(semanticKey: string): string {
  const slug = semanticKey.replace(/[^a-zA-Z0-9_-]+/g, '_').slice(0, 80);
  return `feas_plan_object_${slug}`;
}

export function planObjectAssessmentToAssertion(
  tripId: string,
  assessment: PlanObjectAssessment,
  dayId?: string,
): ConstraintAssertion | null {
  const status = severityToStatus(assessment.severity);
  if (status === 'PASS') return null;

  const dayNumber = assessment.details?.dayNumber;
  const resolvedDayId =
    dayId ?? (typeof dayNumber === 'number' ? `day-${dayNumber}` : undefined);

  return {
    assertionId: normalizeAssertionId(assessment.semanticKey),
    constraintType: assessment.semanticKey,
    status,
    severity: severityToAssertionSeverity(assessment.severity),
    scope: {
      tripId,
      dayId: resolvedDayId,
      planObjectIds: assessment.planObjectId ? [assessment.planObjectId] : undefined,
    },
    reasonCode: reasonCodeForKind(assessment.kind),
    evidenceRefs: assessment.planObjectId ? [assessment.planObjectId] : [],
    message: assessment.message,
    evaluator: {
      engine: PLAN_OBJECT_ENGINE,
      version: PLAN_OBJECT_VERSION,
      ruleId: assessment.kind,
    },
    overridable: assessment.severity !== 'BLOCK',
  };
}

export function planObjectProjectionToAssertions(
  tripId: string,
  projection: PlanObjectProjectionView,
): ConstraintAssertion[] {
  const out: ConstraintAssertion[] = [];
  for (const day of projection.days) {
    for (const assessment of day.assessments) {
      const assertion = planObjectAssessmentToAssertion(tripId, assessment, day.dayId);
      if (assertion) out.push(assertion);
    }
  }
  return out;
}

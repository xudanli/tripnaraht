/**
 * Gateway ConstraintAssertion → FeasibilityIssueDto (PLAN_VERIFY projection).
 */

import type { FeasibilityIssueDto } from '../../../trips/trip-constraint-solver/types/trip-constraint-solver.types';
import type { ConstraintAssertion, ConstraintEvaluationStatus } from '../contracts/constraint-assertion';
import {
  buildPlanObjectGatewayProof,
  isPlanObjectGatewayAssertion,
} from '../utils/plan-object-evidence-display.util';
import { enrichPlanObjectFeasibilityIssue } from '../utils/plan-object-repair-options.util';
import { resolvePlanObjectShortTitle } from '../../gateway/utils/decision-problem-queue-display.util';

function statusToPriority(status: ConstraintEvaluationStatus): FeasibilityIssueDto['priority'] {
  switch (status) {
    case 'BLOCK':
    case 'REQUIRES_VERIFICATION':
      return 'must_handle';
    case 'UNKNOWN':
      return 'pending_confirm';
    case 'WARNING':
      return 'suggest_adjust';
    default:
      return 'pending_confirm';
  }
}

function statusToSeverity(status: ConstraintEvaluationStatus): FeasibilityIssueDto['severity'] {
  if (status === 'BLOCK') return 'high';
  if (status === 'REQUIRES_VERIFICATION' || status === 'UNKNOWN') return 'medium';
  return 'low';
}

function inferCategory(assertion: ConstraintAssertion): FeasibilityIssueDto['category'] {
  const t = assertion.constraintType.toLowerCase();
  if (t.includes('poi_access') || assertion.evaluator.engine.includes('poi-access')) {
    return 'access_capacity';
  }
  if (assertion.evaluator.engine === 'plan-object-evaluator') {
    if (t.includes('stay')) return 'accommodation';
    if (t.includes('meal')) return 'schedule';
    if (t.includes('buffer')) return 'schedule';
    if (t.includes('fatigue')) return 'pace';
    return 'transport';
  }
  if (t.includes('daily') || t.includes('load') || t.includes('drive')) return 'transport';
  if (t.includes('road')) return 'transport';
  if (t.includes('weather')) return 'environment';
  return 'transport';
}

function parseDayNumbers(assertion: ConstraintAssertion): number[] {
  const dayId = assertion.scope.dayId;
  if (!dayId) return [];
  const m = /day-(\d+)/.exec(dayId);
  if (m) return [Number(m[1])];
  return [];
}

export function gatewayAssertionToFeasibilityIssue(
  assertion: ConstraintAssertion,
  options?: { preserveIssue?: FeasibilityIssueDto },
): FeasibilityIssueDto {
  const preserve = options?.preserveIssue;
  const issueId =
    preserve?.id ??
    (assertion.assertionId.startsWith('feas_')
      ? assertion.assertionId.slice(5)
      : `gw-${assertion.assertionId}`);

  const planObject = isPlanObjectGatewayAssertion(assertion);
  const defaultProofs = planObject
    ? [buildPlanObjectGatewayProof(assertion)]
    : [
        {
          entity: assertion.constraintType,
          constraint: assertion.reasonCode,
          currentFact: assertion.message,
          evidenceSource: assertion.evaluator.engine,
          evidenceType: 'gateway_projection',
          conclusion: assertion.status,
          ruleId: assertion.evaluator.ruleId,
          confidence: assertion.confidence,
        },
      ];

  return enrichPlanObjectFeasibilityIssue(
    assertion,
    {
      id: issueId,
      semanticKey: assertion.constraintType,
      priority: statusToPriority(assertion.status),
      category: preserve?.category ?? inferCategory(assertion),
      title:
        preserve?.title ??
        (planObject
          ? resolvePlanObjectShortTitle({
              ruleId: assertion.evaluator.ruleId,
              semanticKey: assertion.constraintType,
            }) ?? assertion.constraintType
          : assertion.message.split('：')[0]?.slice(0, 80) ?? assertion.constraintType),
      message: assertion.message,
      affectedDays: preserve?.affectedDays ?? parseDayNumbers(assertion),
      tripDayId: assertion.scope.dayId,
      severity: preserve?.severity ?? statusToSeverity(assertion.status),
      issueKind: preserve?.issueKind ?? assertion.evaluator.ruleId ?? assertion.reasonCode,
      fromItemId: assertion.scope.activityId ?? preserve?.fromItemId,
      toItemId: preserve?.toItemId,
      anchors: preserve?.anchors,
      uiHints: preserve?.uiHints,
      actionRequired: preserve?.actionRequired,
      repairOptions: preserve?.repairOptions,
      proofs: preserve?.proofs ?? defaultProofs,
      visitorAccess: preserve?.visitorAccess,
    },
  );
}

export function gatewayReportToFeasibilityIssues(
  assertions: ConstraintAssertion[],
  preserveByAssertionId?: Map<string, FeasibilityIssueDto>,
): FeasibilityIssueDto[] {
  return assertions
    .filter((a) => a.status !== 'PASS')
    .map((a) =>
      gatewayAssertionToFeasibilityIssue(a, {
        preserveIssue: preserveByAssertionId?.get(a.assertionId),
      }),
    );
}

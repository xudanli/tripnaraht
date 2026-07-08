/**
 * User ConstraintFact → ConstraintAssertion evaluation (plan-aware, P1).
 */

import { randomUUID } from 'crypto';
import type { TripPlan } from '../../../trips/decision/plan-model';
import type { ConstraintAssertion } from '../contracts/constraint-assertion';
import type { ConstraintFact } from '../contracts/constraint-fact';

const EVALUATOR = { engine: 'user-constraint-provider', version: '0.2.0' };

export function evaluateUserConstraintFacts(input: {
  tripId: string;
  facts: ConstraintFact[];
  plan?: TripPlan;
  candidateId?: string;
}): ConstraintAssertion[] {
  const assertions: ConstraintAssertion[] = [];

  for (const fact of input.facts) {
    const hardType = readConstraintType(fact);
    if (hardType !== 'HARD' && hardType !== 'EXTERNAL') {
      continue;
    }

    const budgetAssertion = evaluateBudgetFact(fact, input);
    if (budgetAssertion) {
      assertions.push(budgetAssertion);
      continue;
    }

    if (fact.freshnessStatus === 'STALE') {
      assertions.push(
        makeAssertion({
          tripId: input.tripId,
          fact,
          status: 'REQUIRES_VERIFICATION',
          severity: 'MEDIUM',
          reasonCode: 'USER_CONSTRAINT_STALE',
          message: `用户约束「${readLabel(fact)}」已过期，需重新确认`,
        }),
      );
      continue;
    }

    assertions.push(
      makeAssertion({
        tripId: input.tripId,
        fact,
        status: hardType === 'HARD' ? 'REQUIRES_VERIFICATION' : 'WARNING',
        severity: hardType === 'HARD' ? 'HIGH' : 'MEDIUM',
        reasonCode: 'USER_HARD_CONSTRAINT_REGISTERED',
        message: `用户硬约束「${readLabel(fact)}」已登记；方案需人工或规则引擎确认满足`,
        remediationHints: ['打开约束控制台核对', '调整方案或申请约束放宽'],
      }),
    );
  }

  return assertions;
}

function evaluateBudgetFact(
  fact: ConstraintFact,
  input: { tripId: string; plan?: TripPlan },
): ConstraintAssertion | undefined {
  if (fact.type !== 'BUDGET') return undefined;
  const value = fact.value as { operator?: string; value?: unknown; type?: string };
  if (value.operator !== 'LTE' && value.operator !== 'GTE') return undefined;

  const limit = typeof value.value === 'number' ? value.value : Number(value.value);
  if (!Number.isFinite(limit)) return undefined;

  const planCost = input.plan?.metrics?.estTotalCost;
  if (planCost == null) {
    return makeAssertion({
      tripId: input.tripId,
      fact,
      status: 'UNKNOWN',
      severity: 'MEDIUM',
      reasonCode: 'USER_BUDGET_UNVERIFIED',
      message: `用户预算约束「${readLabel(fact)}」无法验证（方案缺少 estTotalCost）`,
    });
  }

  if (value.operator === 'LTE' && planCost > limit) {
    return makeAssertion({
      tripId: input.tripId,
      fact,
      status: 'BLOCK',
      severity: 'HIGH',
      reasonCode: 'USER_BUDGET_OVERRUN',
      message: `方案预估成本 ${planCost} 超过用户预算上限 ${limit}`,
      remediationHints: ['减少高成本活动', '调整预算约束或选择更保守候选'],
      overridable: readAllowRelaxation(fact),
    });
  }

  if (value.operator === 'GTE' && planCost < limit) {
    return makeAssertion({
      tripId: input.tripId,
      fact,
      status: 'WARNING',
      severity: 'LOW',
      reasonCode: 'USER_BUDGET_UNDER_TARGET',
      message: `方案预估成本 ${planCost} 低于用户预算下限 ${limit}`,
    });
  }

  return undefined;
}

function makeAssertion(params: {
  tripId: string;
  fact: ConstraintFact;
  status: ConstraintAssertion['status'];
  severity: ConstraintAssertion['severity'];
  reasonCode: string;
  message: string;
  remediationHints?: string[];
  overridable?: boolean;
}): ConstraintAssertion {
  return {
    assertionId: `user_${params.fact.factId}_${randomUUID()}`,
    constraintType: `USER_${params.fact.type}`,
    status: params.status,
    severity: params.severity,
    scope: { tripId: params.tripId },
    reasonCode: params.reasonCode,
    evidenceRefs: [params.fact.factId],
    message: params.message,
    remediationHints: params.remediationHints,
    evaluator: EVALUATOR,
    overridable: params.overridable ?? params.status !== 'BLOCK',
    confidence: params.fact.confidence,
  };
}

function readConstraintType(fact: ConstraintFact): string {
  const value = fact.value as { type?: string };
  return value.type ?? 'HARD';
}

function readLabel(fact: ConstraintFact): string {
  const value = fact.value as { label?: string };
  return value.label ?? fact.type;
}

function readAllowRelaxation(fact: ConstraintFact): boolean {
  const value = fact.value as { allowRelaxation?: boolean };
  return value.allowRelaxation !== false;
}

/**
 * Compare expected vs observed → DecisionOutcomeValidation verdict.
 */

import type {
  DecisionOutcomeValidation,
  DecisionRecord,
  ExpectedOutcome,
  ObservedOutcome,
  OutcomeFailureReason,
  OutcomeValidationVerdict,
} from '../types/decision-semantics.types';

export interface MetricMatchResult {
  metric: string;
  matched: boolean;
  partial?: boolean;
  reason?: OutcomeFailureReason;
}

function compareMetric(expected: ExpectedOutcome, observed: ObservedOutcome | undefined): MetricMatchResult {
  if (!observed) {
    return { metric: expected.metric, matched: false, reason: 'INSUFFICIENT_EVIDENCE' };
  }

  if (expected.metric === 'CONSTRAINT_VIOLATION') {
    const actual = observed.actualValue === true || observed.actualValue === 'true';
    const expectedResolved = expected.expectedValue === false;
    const matched = expectedResolved ? !actual : actual === expected.expectedValue;
    return {
      metric: expected.metric,
      matched,
      reason: matched ? undefined : 'PREDICTION_ERROR',
    };
  }

  if (expected.metric === 'DRIVING_DURATION') {
    const exp = Number(expected.expectedValue);
    const act = Number(observed.actualValue);
    const tol = expected.tolerance ?? 15;
    if (!Number.isFinite(exp) || !Number.isFinite(act)) {
      return { metric: expected.metric, matched: false, reason: 'INSUFFICIENT_EVIDENCE' };
    }
    const matched = act <= exp + tol;
    return {
      metric: expected.metric,
      matched,
      partial: !matched && act <= exp + tol * 2,
      reason: matched ? undefined : 'PREDICTION_ERROR',
    };
  }

  if (expected.metric === 'ACTIVITY_COMPLETION') {
    const matched = observed.actualValue === expected.expectedValue;
    return {
      metric: expected.metric,
      matched,
      reason: matched ? undefined : 'EXECUTION_DEVIATION',
    };
  }

  if (expected.metric === 'ARRIVAL_TIME') {
    if (!observed) {
      return { metric: expected.metric, matched: false, reason: 'INSUFFICIENT_EVIDENCE' };
    }
    const hasLightSource =
      observed.source === 'USER_ARRIVAL_CLICK' ||
      observed.source === 'NAVIGATION_EVENT' ||
      observed.source === 'POI_FEEDBACK';
    const matched = hasLightSource ? observed.confidence >= 0.55 : observed.confidence >= 0.5;
    return {
      metric: expected.metric,
      matched,
      partial: !matched && observed.confidence >= 0.35,
      reason: matched ? undefined : 'INSUFFICIENT_EVIDENCE',
    };
  }

  return {
    metric: expected.metric,
    matched: observed.actualValue === expected.expectedValue,
    reason: 'INSUFFICIENT_EVIDENCE',
  };
}

export function evaluateOutcomeValidation(input: {
  record: DecisionRecord;
  expectedOutcomes: ExpectedOutcome[];
  observedOutcomes: ObservedOutcome[];
  experienceOutcomes?: import('../types/decision-semantics.types').ExperienceOutcome[];
  ledgerStale?: boolean;
}): DecisionOutcomeValidation {
  const { record, expectedOutcomes, observedOutcomes, experienceOutcomes, ledgerStale } = input;
  const observedByMetric = new Map(observedOutcomes.map((o) => [o.metric, o]));

  if (record.status !== 'EXECUTED') {
    return {
      id: `val_${record.id}`,
      decisionId: record.id,
      tripId: record.tripId,
      expectedOutcomes,
      observedOutcomes,
      experienceOutcomes,
      verdict: 'PENDING',
      evaluatedAt: new Date().toISOString(),
      confidence: 0,
      explanation: '决策尚未执行到行程，无法验证预测结果。',
    };
  }

  if (expectedOutcomes.length === 0) {
    return {
      id: `val_${record.id}`,
      decisionId: record.id,
      tripId: record.tripId,
      expectedOutcomes,
      observedOutcomes,
      experienceOutcomes,
      verdict: 'INCONCLUSIVE',
      evaluatedAt: new Date().toISOString(),
      confidence: 0.2,
      explanation: '缺少可验证的预测指标。',
      failureReasons: ['INSUFFICIENT_EVIDENCE'],
    };
  }

  const results = expectedOutcomes.map((e) => compareMetric(e, observedByMetric.get(e.metric)));
  const matched = results.filter((r) => r.matched).length;
  const partial = results.filter((r) => r.partial && !r.matched).length;
  const total = results.length;

  let verdict: OutcomeValidationVerdict = 'INCONCLUSIVE';
  if (matched === total && total > 0) {
    verdict = 'CONFIRMED';
  } else if (matched > 0 || partial > 0) {
    verdict = 'PARTIALLY_CONFIRMED';
  } else if (observedOutcomes.length === 0) {
    verdict = 'PENDING';
  } else {
    verdict = 'REFUTED';
  }

  const failureReasons = [
    ...new Set([
      ...results.filter((r) => r.reason).map((r) => r.reason!),
      ...(ledgerStale ? (['DATA_STALE'] as OutcomeFailureReason[]) : []),
    ]),
  ] as OutcomeFailureReason[];

  const confidence = total > 0 ? matched / total : 0;

  let explanation =
    verdict === 'CONFIRMED'
      ? `预测与观测一致（${matched}/${total} 项指标确认）。`
      : verdict === 'PARTIALLY_CONFIRMED'
        ? `部分指标符合预测（${matched}/${total} 确认，${partial} 项接近）。`
        : verdict === 'REFUTED'
          ? `观测与预测不符（${matched}/${total} 确认）。`
          : verdict === 'PENDING'
            ? '观测数据尚未齐备，请行中反馈或重新验证可行性后再查看。'
            : '证据不足，无法得出明确结论。';

  if (ledgerStale) {
    if (verdict === 'CONFIRMED') {
      verdict = 'PARTIALLY_CONFIRMED';
    }
    explanation += ' Decision Ledger 在决策后发生重算，原预测可能已过期（DATA_STALE）。';
  }

  return {
    id: `val_${record.id}`,
    decisionId: record.id,
    tripId: record.tripId,
    expectedOutcomes,
    observedOutcomes,
    experienceOutcomes: experienceOutcomes?.length ? experienceOutcomes : undefined,
    verdict,
    evaluatedAt: new Date().toISOString(),
    confidence,
    explanation,
    failureReasons: failureReasons.length ? failureReasons : undefined,
  };
}

export function validationStatusFromVerdict(
  verdict: OutcomeValidationVerdict,
): DecisionRecord['validationStatus'] {
  switch (verdict) {
    case 'CONFIRMED':
      return 'CONFIRMED';
    case 'PARTIALLY_CONFIRMED':
      return 'PARTIALLY_VALIDATED';
    case 'REFUTED':
      return 'REFUTED';
    case 'PENDING':
      return 'PENDING';
    default:
      return 'NOT_APPLICABLE';
  }
}

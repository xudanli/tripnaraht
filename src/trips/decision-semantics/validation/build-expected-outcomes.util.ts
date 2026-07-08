/**
 * Derive ExpectedOutcome[] from decision record + optional problem context.
 */

import type {
  DecisionProblemDetail,
  DecisionRecord,
  ExpectedOutcome,
  TradeoffDimension,
} from '../types/decision-semantics.types';

function tradeoffsFromRecord(record: DecisionRecord): TradeoffDimension[] {
  const fromOps = record.actualMutation?.operations.flatMap((o) => o.semanticEffects ?? []) ?? [];
  if (fromOps.length) return fromOps;
  return [];
}

export function buildExpectedOutcomes(
  record: DecisionRecord,
  problem?: DecisionProblemDetail,
): ExpectedOutcome[] {
  const outcomes: ExpectedOutcome[] = [];
  const scope = problem?.affectedScope ?? [];
  const tradeoffs = tradeoffsFromRecord(record);

  outcomes.push({
    metric: 'CONSTRAINT_VIOLATION',
    expectedValue: false,
    tolerance: 0,
    validAt: record.decidedAt,
    affectedScope: scope.length ? scope : [{ scopeType: 'TRIP', scopeId: 'trip', impactType: 'BLOCKED', severity: 'HIGH' }],
  });

  for (const t of tradeoffs) {
    if (t.dimension === 'FATIGUE' && t.direction === 'IMPROVE' && typeof t.value === 'number') {
      outcomes.push({
        metric: 'DRIVING_DURATION',
        expectedValue: t.value,
        tolerance: Math.max(15, t.value * 0.2),
        validAt: record.decidedAt,
        affectedScope: scope,
      });
    }
    if (t.dimension === 'TIME' && t.unit === 'DAY' && t.direction === 'WORSEN') {
      outcomes.push({
        metric: 'ARRIVAL_TIME',
        expectedValue: `+${t.value ?? 1}d`,
        tolerance: 0,
        validAt: record.decidedAt,
        affectedScope: scope,
      });
    }
    if (t.dimension === 'POI_COVERAGE' && t.direction === 'IMPROVE') {
      outcomes.push({
        metric: 'ACTIVITY_COMPLETION',
        expectedValue: true,
        validAt: record.decidedAt,
        affectedScope: scope,
      });
    }
  }

  if (record.status === 'EXECUTED' && tradeoffs.length === 0) {
    // EXECUTED repair without structured tradeoffs — still expect problem resolution
  }

  return outcomes;
}

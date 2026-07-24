import { buildExpectedOutcomes } from '../validation/build-expected-outcomes.util';
import { evaluateOutcomeValidation } from '../validation/evaluate-outcome-validation.util';
import type { DecisionRecord } from '../types/decision-semantics.types';

describe('decision outcome validation', () => {
  const baseRecord: DecisionRecord = {
    id: 'dec_test',
    tripId: 'trip1',
    problemId: 'dp_1',
    selectedOptionId: 'opt_1',
    rejectedOptionIds: [],
    decidedBy: [{ role: 'TRIP_OWNER' }],
    authoritySnapshot: {
      decisionDomain: 'SCHEDULE',
      proposer: 'SYSTEM',
      requiredApprover: 'TRIP_OWNER',
      executionMode: 'EXPLICIT_CONFIRMATION',
      overridable: true,
    },
    reasons: [],
    decidedAt: '2026-06-30T10:00:00Z',
    tripVersionBefore: '1',
    tripVersionAfter: '2',
    status: 'EXECUTED',
    validationStatus: 'PENDING',
    actualMutation: {
      mutationId: 'mut_1',
      tripId: 'trip1',
      operations: [
        {
          operation: 'ADD',
          entityType: 'DAY',
          semanticEffects: [
            {
              dimension: 'FATIGUE',
              direction: 'IMPROVE',
              value: 90,
              unit: 'MINUTE',
              explanation: '缩短驾驶',
            },
          ],
        },
      ],
      createdAt: '2026-06-30T10:00:00Z',
      createdBy: 'u1',
      versionBefore: '1',
      versionAfter: '2',
    },
  };

  it('builds expected outcomes including constraint resolution', () => {
    const expected = buildExpectedOutcomes(baseRecord);
    expect(expected.some((e) => e.metric === 'CONSTRAINT_VIOLATION' && e.expectedValue === false)).toBe(
      true,
    );
    expect(expected.some((e) => e.metric === 'DRIVING_DURATION')).toBe(true);
  });

  it('CONFIRMED when problem resolved matches prediction', () => {
    const expected = buildExpectedOutcomes(baseRecord);
    const validation = evaluateOutcomeValidation({
      record: baseRecord,
      expectedOutcomes: expected,
      observedOutcomes: [
        {
          metric: 'CONSTRAINT_VIOLATION',
          actualValue: false,
          observedAt: '2026-06-30T12:00:00Z',
          source: 'SYSTEM_INFERENCE',
          confidence: 0.9,
        },
        {
          metric: 'DRIVING_DURATION',
          actualValue: 80,
          observedAt: '2026-06-30T12:00:00Z',
          source: 'SYSTEM_INFERENCE',
          confidence: 0.9,
        },
      ],
    });
    expect(validation.verdict).toBe('CONFIRMED');
    expect(validation.confidence).toBeGreaterThan(0.5);
  });

  it('REFUTED when constraint still violated', () => {
    const expected = buildExpectedOutcomes(baseRecord);
    const validation = evaluateOutcomeValidation({
      record: baseRecord,
      expectedOutcomes: expected,
      observedOutcomes: [
        {
          metric: 'CONSTRAINT_VIOLATION',
          actualValue: true,
          observedAt: '2026-06-30T12:00:00Z',
          source: 'SYSTEM_INFERENCE',
          confidence: 0.9,
        },
        {
          metric: 'DRIVING_DURATION',
          actualValue: 500,
          observedAt: '2026-06-30T12:00:00Z',
          source: 'SYSTEM_INFERENCE',
          confidence: 0.9,
        },
      ],
    });
    expect(validation.verdict).toBe('REFUTED');
    expect(validation.failureReasons).toContain('PREDICTION_ERROR');
  });

  it('PENDING when decision not executed', () => {
    const validation = evaluateOutcomeValidation({
      record: { ...baseRecord, status: 'PROPOSED' },
      expectedOutcomes: buildExpectedOutcomes(baseRecord),
      observedOutcomes: [],
    });
    expect(validation.verdict).toBe('PENDING');
  });

  it('marks DATA_STALE when ledger recompute happened after decision', () => {
    const expected = buildExpectedOutcomes(baseRecord);
    const validation = evaluateOutcomeValidation({
      record: {
        ...baseRecord,
        ledgerRefs: {
          sourceNodeIds: ['n1'],
          ledgerRunId: 'lr_dec_test',
          ledgerSnapshotVersion: 1,
        },
      },
      expectedOutcomes: expected,
      observedOutcomes: [
        {
          metric: 'CONSTRAINT_VIOLATION',
          actualValue: false,
          observedAt: '2026-06-30T12:00:00Z',
          source: 'SYSTEM_INFERENCE',
          confidence: 0.9,
        },
        {
          metric: 'DRIVING_DURATION',
          actualValue: 80,
          observedAt: '2026-06-30T12:00:00Z',
          source: 'SYSTEM_INFERENCE',
          confidence: 0.9,
        },
      ],
      ledgerStale: true,
    });
    expect(validation.failureReasons).toContain('DATA_STALE');
    expect(validation.verdict).toBe('PARTIALLY_CONFIRMED');
  });
});

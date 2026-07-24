import { tepRuleResultToAssessment } from './tep-rule-result-to-assessment.adapter';
import type { PlanningRuleResult } from '../../../trips/tep/contracts/tep-self-drive.types';

describe('tep-rule-result-to-assessment.adapter', () => {
  const baseInput = {
    tripId: 'trip_1',
    evaluationMode: 'PLAN_VERIFY' as const,
    contextVersion: {
      schemaId: 'tripnara.evaluation_context_version@v1' as const,
      tripId: 'trip_1',
      planVersionId: 'pv1',
      constraintsVersion: 1,
      worldSnapshotId: null,
    },
    evaluatedAt: '2026-07-13T00:00:00.000Z',
    index: 0,
  };

  it('maps SDR-101 to MAX_DAILY_DRIVE constraint assessment with TEP source', () => {
    const result: PlanningRuleResult = {
      ruleId: 'SDR-101',
      outcome: 'SUGGEST_REPAIR',
      severity: 'HIGH',
      affectedRefs: ['day_1', 'drive_leg_1_1'],
      explanation: '第 1 日等效驾驶负荷 340min（HIGH）',
      evidenceRefs: [],
    };

    const assessment = tepRuleResultToAssessment(result, baseInput);
    expect(assessment).not.toBeNull();
    expect(assessment?.semanticKey).toBe('MAX_DAILY_DRIVE');
    expect(assessment?.sourceRef.system).toBe('TEP');
    expect(assessment?.status).toBe('BLOCK');
    expect(assessment?.ruleRefs).toEqual(['SDR-101']);
  });

  it('maps SDR-202 to NO_NIGHT_DRIVE with structured daylight evidence', () => {
    const result: PlanningRuleResult = {
      ruleId: 'SDR-202',
      outcome: 'SUGGEST_REPAIR',
      severity: 'HIGH',
      affectedRefs: ['drive_leg_1_1', 'day_1'],
      explanation:
        '驾驶段预计 23:40 结束，超出安全截止 23:57（日落 23:27 + 30 分钟，+43min）',
      evidenceRefs: [
        {
          provider: 'TEP',
          sourceType: 'INTERNAL',
          observedAt: '2026-07-15T00:00:00.000Z',
          predicate: 'daylight.sunset:23:27',
        },
      ],
    };

    const assessment = tepRuleResultToAssessment(result, baseInput);
    expect(assessment?.semanticKey).toBe('NO_NIGHT_DRIVE');
    expect(assessment?.measuredValue).toMatchObject({
      dayIndex: 1,
      finishLocal: '23:40',
      cutoffLocal: '23:57',
      sunsetLocal: '23:27',
      maxMinutesAfterSunset: 30,
      equivalentMinutes: 43,
    });
  });

  it('returns null for unbound SDR rules', () => {
    const result: PlanningRuleResult = {
      ruleId: 'SDR-999',
      outcome: 'REJECT',
      severity: 'CRITICAL',
      affectedRefs: [],
      explanation: 'unknown',
      evidenceRefs: [],
    };
    expect(tepRuleResultToAssessment(result, baseInput)).toBeNull();
  });
});

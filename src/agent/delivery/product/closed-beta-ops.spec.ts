import {
  createBetaTripCohort,
  enrollBetaTrip,
  countCompleteTrips,
} from './beta-trip-cohort.util';
import { buildTripQualityScorecard } from './trip-quality-scorecard.util';
import {
  openNaraIncident,
  resolveNaraIncidentWithRegression,
} from './nara-incident-record.util';
import { markRegressionRun } from './real-world-regression-golden.util';
import {
  createRecoveryGolden,
  evaluateRecoveryGolden,
} from './recovery-golden.util';
import { checkReleaseGate } from './release-gate.util';
import {
  advanceRolloutStage,
  createInviteOnlyRollout,
  pauseOrRollbackRollout,
} from './rollout-stages.util';
import {
  assertTaskSourceAllowed,
  createEvidenceDrivenTask,
} from './evidence-driven-fix.util';

describe('Closed Beta Operations & Release Validation', () => {
  it('Architecture Freeze: only evidence-driven task sources', () => {
    expect(assertTaskSourceAllowed('BETA_INCIDENT')).toBe(true);
    expect(assertTaskSourceAllowed('NEW_HARNESS_ABSTRACTION')).toBe(false);
    expect(() =>
      createEvidenceDrivenTask({
        source: 'STABILITY',
        evidenceRef: '',
        summaryZh: 'x',
      }),
    ).toThrow(/evidenceRef_required/);
  });

  it('P0/P1 fix must precipitate Regression; cohort + scorecard + recovery', () => {
    let cohort = createBetaTripCohort({
      cohortId: 'c1',
      minCompleteTripsForReleaseEvidence: 3,
    });
    for (const id of ['t1', 't2', 't3']) {
      cohort = enrollBetaTrip(cohort, {
        tripId: id,
        completeTrip: true,
        journeysTouched: ['QUERY', 'DECIDE', 'ADJUST', 'LIVE'],
        userWillingToContinue: true,
      });
    }
    expect(countCompleteTrips(cohort)).toBe(3);

    const incident = openNaraIncident({
      tripId: 't1',
      severity: 'P1',
      category: 'STABILITY',
      journeyId: 'ADJUST',
      summaryZh: 'Confirm 后 Apply 超时',
    });
    const denied = resolveNaraIncidentWithRegression({
      incident,
      fixSummaryZh: '修复超时',
      skipRegression: true,
    });
    expect(denied.ok).toBe(false);

    const fixed = resolveNaraIncidentWithRegression({
      incident,
      fixSummaryZh: '修复 Apply 超时并加恢复路径',
    });
    expect(fixed.ok).toBe(true);
    if (!fixed.ok) return;
    expect(fixed.incident.status).toBe('REGRESSION_CAPTURED');
    expect(fixed.regression.mandatory).toBe(true);
    expect(fixed.fixTask.architectureFreeze).toBe(true);

    let reg = markRegressionRun(fixed.regression, 'PASS');
    let recovery = createRecoveryGolden({
      goldenId: 'rec_1',
      tripId: 't1',
      journeyId: 'ADJUST',
      failureModeZh: 'Apply 中断',
      recoveryPathZh: '重试 Confirm→Apply + Receipt',
    });
    recovery = evaluateRecoveryGolden({
      golden: recovery,
      recovered: true,
      dataLoss: false,
      unauthorizedMutationDuringRecovery: false,
    });
    expect(recovery.lastRunStatus).toBe('PASS');

    const scorecards = ['t1', 't2', 't3'].map((tripId) =>
      buildTripQualityScorecard({
        tripId,
        journeyOutcomes: [
          {
            journeyId: 'QUERY',
            attempts: 5,
            successes: 5,
            recoverableFailures: 0,
            unrecoverableFailures: 0,
          },
          {
            journeyId: 'ADJUST',
            attempts: 3,
            successes: 3,
            recoverableFailures: 0,
            unrecoverableFailures: 0,
          },
        ],
        safetyScore: 1,
        reliabilityScore: 0.9,
        taskSuccessScore: 0.85,
        experienceScore: 0.8,
        unauthorizedMutationCount: 0,
        harnessBypassCount: 0,
        hardConstraintRegressionCount: 0,
        userWillingToContinue: true,
      }),
    );
    expect(scorecards.every((s) => s.passed)).toBe(true);

    const gate = checkReleaseGate({
      cohort,
      scorecards,
      regressions: [reg],
      recoveries: [recovery],
    });
    expect(gate.passed).toBe(true);
    expect(gate.zeroToleranceOk).toBe(true);
    expect(gate.dodFocusZh).toMatch(/真实完整旅行|继续依赖/);

    let rollout = createInviteOnlyRollout();
    rollout = advanceRolloutStage({ plan: rollout, releaseGate: gate });
    expect(rollout.stage).toBe('PCT_5');
    rollout = advanceRolloutStage({ plan: rollout, releaseGate: gate });
    expect(rollout.stage).toBe('PCT_20');

    const paused = pauseOrRollbackRollout({
      plan: rollout,
      reason: 'TRUST_SAFETY',
      mode: 'PAUSE',
      noteZh: '模拟 Trust 回归',
    });
    expect(paused.stage).toBe('PAUSED');
    expect(paused.paused).toBe(true);

    const blocked = advanceRolloutStage({
      plan: paused,
      releaseGate: gate,
    });
    expect(blocked.historyZh.at(-1)).toMatch(/Pause\/Rollback/);
  });

  it('zero-tolerance fails Release Gate', () => {
    let cohort = createBetaTripCohort({ minCompleteTripsForReleaseEvidence: 1 });
    cohort = enrollBetaTrip(cohort, {
      tripId: 'bad',
      completeTrip: true,
      journeysTouched: ['QUERY'],
    });
    const card = buildTripQualityScorecard({
      tripId: 'bad',
      journeyOutcomes: [],
      safetyScore: 1,
      reliabilityScore: 1,
      taskSuccessScore: 1,
      experienceScore: 1,
      unauthorizedMutationCount: 1,
    });
    expect(card.passed).toBe(false);
    const gate = checkReleaseGate({
      cohort,
      scorecards: [card],
      regressions: [],
      recoveries: [
        evaluateRecoveryGolden({
          golden: createRecoveryGolden({
            goldenId: 'r',
            tripId: 'bad',
            journeyId: 'QUERY',
            failureModeZh: 'x',
            recoveryPathZh: 'y',
          }),
          recovered: true,
          dataLoss: false,
          unauthorizedMutationDuringRecovery: false,
        }),
      ],
    });
    expect(gate.passed).toBe(false);
    expect(gate.zeroToleranceOk).toBe(false);
  });
});

/**
 * Release Gate — Safety / Reliability / Task Success / Experience。
 * Unauthorized Mutation / Harness Bypass / Hard Constraint Regression = 0。
 */

import type { TripQualityScorecardV1 } from './trip-quality-scorecard.util';
import type { BetaTripCohortV1 } from './beta-trip-cohort.util';
import { countCompleteTrips } from './beta-trip-cohort.util';
import type { RealWorldRegressionGoldenV1 } from './real-world-regression-golden.util';
import type { RecoveryGoldenV1 } from './recovery-golden.util';

export const RELEASE_GATE_SCHEMA = 'nara.v1_release_gate@v1' as const;

export type ReleaseGateResultV1 = {
  schemaId: typeof RELEASE_GATE_SCHEMA;
  version: 1;
  passed: boolean;
  safetyOk: boolean;
  reliabilityOk: boolean;
  taskSuccessOk: boolean;
  experienceOk: boolean;
  zeroToleranceOk: boolean;
  cohortOk: boolean;
  regressionOk: boolean;
  recoveryOk: boolean;
  trustContinuedOk: boolean;
  reasonsZh: string[];
  architectureFreeze: true;
  dodFocusZh: string;
};

export function checkReleaseGate(input: {
  cohort: BetaTripCohortV1;
  scorecards: TripQualityScorecardV1[];
  regressions: RealWorldRegressionGoldenV1[];
  recoveries: RecoveryGoldenV1[];
}): ReleaseGateResultV1 {
  const reasonsZh: string[] = [];
  const completeN = countCompleteTrips(input.cohort);
  const cohortOk = completeN >= input.cohort.minCompleteTripsForReleaseEvidence;
  if (!cohortOk) {
    reasonsZh.push(
      `完整 Trip 不足 ${completeN} < ${input.cohort.minCompleteTripsForReleaseEvidence}`,
    );
  }

  const cards = input.scorecards;
  const avg = (pick: (c: TripQualityScorecardV1) => number) =>
    cards.length === 0
      ? 0
      : cards.reduce((s, c) => s + pick(c), 0) / cards.length;

  const safetyOk = avg((c) => c.safetyScore) >= 0.95;
  const reliabilityOk = avg((c) => c.reliabilityScore) >= 0.8;
  const taskSuccessOk = avg((c) => c.taskSuccessScore) >= 0.75;
  const experienceOk = avg((c) => c.experienceScore) >= 0.7;
  if (!safetyOk) reasonsZh.push('Release Gate Safety 未过');
  if (!reliabilityOk) reasonsZh.push('Release Gate Reliability 未过');
  if (!taskSuccessOk) reasonsZh.push('Release Gate Task Success 未过');
  if (!experienceOk) reasonsZh.push('Release Gate Experience 未过');

  const zeroToleranceOk = cards.every(
    (c) =>
      c.unauthorizedMutationCount === 0 &&
      c.harnessBypassCount === 0 &&
      c.hardConstraintRegressionCount === 0,
  );
  if (!zeroToleranceOk) {
    reasonsZh.push(
      'Unauthorized Mutation / Harness Bypass / Hard Constraint Regression 必须为 0',
    );
  }

  const mandatoryRegs = input.regressions.filter((r) => r.mandatory);
  const regressionOk =
    mandatoryRegs.length === 0 ||
    mandatoryRegs.every((r) => r.lastRunStatus === 'PASS');
  if (!regressionOk) {
    reasonsZh.push('存在未通过的强制 Real-world Regression Golden');
  }

  const recoveryOk =
    input.recoveries.length > 0 &&
    input.recoveries.every((r) => r.lastRunStatus === 'PASS');
  if (!recoveryOk) {
    reasonsZh.push('Recovery Golden 不足或未全部 PASS（失败须可恢复）');
  }

  const trustContinuedOk =
    cards.length > 0 && cards.every((c) => c.userWillingToContinue);
  if (!trustContinuedOk) {
    reasonsZh.push('存在用户不愿继续依赖的 Trip（DoD）');
  }

  const passed =
    cohortOk &&
    safetyOk &&
    reliabilityOk &&
    taskSuccessOk &&
    experienceOk &&
    zeroToleranceOk &&
    regressionOk &&
    recoveryOk &&
    trustContinuedOk;

  if (passed) {
    reasonsZh.push(
      'Release Gate 通过：多趟真实旅行连续稳定、可恢复、可解释、零越权、用户愿意继续依赖',
    );
  }

  return {
    schemaId: RELEASE_GATE_SCHEMA,
    version: 1,
    passed,
    safetyOk,
    reliabilityOk,
    taskSuccessOk,
    experienceOk,
    zeroToleranceOk,
    cohortOk,
    regressionOk,
    recoveryOk,
    trustContinuedOk,
    reasonsZh,
    architectureFreeze: true,
    dodFocusZh:
      'DoD：不是代码功能齐全，而是多趟真实完整旅行中连续稳定工作，失败可恢复、行为可解释、不会越权，用户愿意继续依赖',
  };
}

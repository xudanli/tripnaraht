/**
 * 交通准备度 — 车辆 / 保险 / 驾驶人
 */

import type {
  OverallReadinessFactInput,
  ReadinessCheck,
  ReadinessDimension,
  ReadinessIssue,
} from '../types/overall-trip-readiness.types';
import { computeDimensionScoreFromChecks, scoreForCheckResult } from './check-result-scores.util';
import { resolveDimensionState } from './overall-readiness-state.util';

function makeCheck(
  checkCode: string,
  title: string,
  weight: number,
  result: ReadinessCheck['result'],
  severity: ReadinessCheck['severity'],
  impact?: string,
): ReadinessCheck {
  const score = scoreForCheckResult(result) ?? 0;
  return {
    checkCode,
    title,
    result,
    score: result === 'NOT_APPLICABLE' ? 0 : score,
    weight,
    severity,
    evidenceRefs: [],
    affectedTripObjectRefs: [],
    impact,
  };
}

export function buildTransportDimension(input: {
  weight: number;
  isSelfDrive?: boolean;
  transport?: OverallReadinessFactInput['transport'];
}): { dimension: ReadinessDimension; issues: ReadinessIssue[] } {
  const t = input.transport;
  const issues: ReadinessIssue[] = [];
  const selfDrive = input.isSelfDrive !== false;

  if (!selfDrive) {
    const checks: ReadinessCheck[] = [
      makeCheck(
        'TRANSPORT_PRIMARY_MODE',
        '车辆或主要交通资源已落实',
        0.25,
        t?.hasVehicleOrPrimaryMode ? 'VERIFIED_READY' : 'PARTIAL',
        'MUST',
      ),
      makeCheck('TRANSPORT_DRIVER_QUAL', '驾驶资格与驾驶人安排', 0.2, 'NOT_APPLICABLE', 'OPTIONAL'),
      makeCheck('TRANSPORT_INSURANCE', '租车保险与风险覆盖', 0.2, 'NOT_APPLICABLE', 'OPTIONAL'),
      makeCheck('TRANSPORT_PICKUP_DROPOFF', '取车、还车及交通衔接', 0.15, 'READY_UNVERIFIED', 'SHOULD'),
      makeCheck('TRANSPORT_EN_ROUTE', '燃油、充电、渡轮与备用方案', 0.2, 'READY_UNVERIFIED', 'SHOULD'),
    ];
    const score = computeDimensionScoreFromChecks(checks);
    return {
      dimension: {
        code: 'TRANSPORT',
        score,
        weight: input.weight,
        state: resolveDimensionState(score, 0),
        checks,
        evidenceCount: t?.hasVehicleOrPrimaryMode ? 1 : 0,
        blockerCount: 0,
      },
      issues,
    };
  }

  const vehicleResult: ReadinessCheck['result'] = !t
    ? 'NOT_READY'
    : t.vehicleConfirmed
      ? 'VERIFIED_READY'
      : t.hasVehicleOrPrimaryMode
        ? 'PARTIAL'
        : 'FAILED';

  if (vehicleResult === 'FAILED') {
    issues.push({
      issueCode: 'TRANSPORT_NO_VEHICLE',
      title: '没有可用车辆或主要交通方式',
      dimension: 'TRANSPORT',
      severity: 'BLOCKER',
      recommendedAction: {
        actionCode: 'CONFIRM_VEHICLE',
        title: '完成车型决策',
        deepLink: 'decision-space',
      },
    });
  } else if (!t?.vehicleConfirmed) {
    issues.push({
      issueCode: 'TRANSPORT_VEHICLE_PENDING',
      title: '车型尚未确认',
      dimension: 'TRANSPORT',
      severity: 'MUST',
      recommendedAction: {
        actionCode: 'CONFIRM_VEHICLE',
        title: '完成车型决策',
        deepLink: 'decision-space',
      },
    });
  }

  const insuranceResult: ReadinessCheck['result'] = !t
    ? 'NOT_READY'
    : t.insuranceConfirmed
      ? 'VERIFIED_READY'
      : 'NOT_READY';

  if (insuranceResult === 'NOT_READY') {
    issues.push({
      issueCode: 'TRANSPORT_INSURANCE_PENDING',
      title: '租车保险方案尚未确认',
      dimension: 'TRANSPORT',
      severity: 'MUST',
      impact: '通常不阻塞取车，但是重要待确认项',
      recommendedAction: {
        actionCode: 'CONFIRM_RENTAL_INSURANCE',
        title: '完成租车保险决策',
        deepLink: 'decision-space',
      },
    });
  }

  const driverConfirmed = t?.driverArrangementConfirmed;
  const driverResult: ReadinessCheck['result'] =
    driverConfirmed === true
      ? 'VERIFIED_READY'
      : driverConfirmed === false
        ? 'FAILED'
        : 'PARTIAL';

  if (driverResult === 'FAILED') {
    issues.push({
      issueCode: 'TRANSPORT_DRIVER_BLOCKED',
      title: '驾驶人资格或安排不满足',
      dimension: 'TRANSPORT',
      severity: 'BLOCKER',
    });
  }

  for (const p of t?.openBlockingProblems ?? []) {
    issues.push({
      issueCode: `TRANSPORT_PROBLEM_${p.id}`,
      title: p.title,
      dimension: 'TRANSPORT',
      severity: 'BLOCKER',
      affectedTripObjectRefs: [p.id],
    });
  }

  const checks: ReadinessCheck[] = [
    makeCheck(
      'TRANSPORT_PRIMARY_MODE',
      '车辆或主要交通资源已落实',
      0.25,
      vehicleResult,
      vehicleResult === 'FAILED' ? 'BLOCKER' : 'MUST',
    ),
    makeCheck(
      'TRANSPORT_DRIVER_QUAL',
      '驾驶资格与驾驶人安排',
      0.2,
      driverResult,
      driverResult === 'FAILED' ? 'BLOCKER' : 'MUST',
    ),
    makeCheck(
      'TRANSPORT_INSURANCE',
      '租车保险与风险覆盖',
      0.2,
      insuranceResult,
      'MUST',
    ),
    makeCheck(
      'TRANSPORT_PICKUP_DROPOFF',
      '取车、还车及交通衔接',
      0.15,
      t?.vehicleConfirmed ? 'READY_UNVERIFIED' : 'NOT_READY',
      'SHOULD',
    ),
    makeCheck(
      'TRANSPORT_EN_ROUTE',
      '燃油、充电、渡轮与备用方案',
      0.2,
      t?.vehicleConfirmed ? 'READY_UNVERIFIED' : 'PARTIAL',
      'SHOULD',
    ),
  ];

  const score = computeDimensionScoreFromChecks(checks);
  const blockerCount = issues.filter((i) => i.severity === 'BLOCKER').length;

  return {
    dimension: {
      code: 'TRANSPORT',
      score,
      weight: input.weight,
      state: resolveDimensionState(score, blockerCount),
      checks,
      evidenceCount: (t?.vehicleConfirmed ? 1 : 0) + (t?.insuranceConfirmed ? 1 : 0),
      blockerCount,
      primaryIssue: issues[0]?.title,
    },
    issues,
  };
}

/**
 * 住宿准备度
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

export function buildAccommodationDimension(input: {
  weight: number;
  accommodation?: OverallReadinessFactInput['accommodation'];
}): { dimension: ReadinessDimension; issues: ReadinessIssue[] } {
  const a = input.accommodation;
  const issues: ReadinessIssue[] = [];

  if (!a || a.expectedNightCount <= 0) {
    const checks: ReadinessCheck[] = [
      makeCheck('ACCOM_NIGHT_COVERAGE', '所有夜晚均有住宿承接', 0.3, 'NOT_APPLICABLE', 'OPTIONAL'),
      makeCheck('ACCOM_BOOKING_CONFIRMED', '预订状态已确认', 0.3, 'NOT_APPLICABLE', 'OPTIONAL'),
      makeCheck('ACCOM_CHECKIN_ROUTE_FIT', '入住时间与路线匹配', 0.2, 'NOT_APPLICABLE', 'OPTIONAL'),
      makeCheck('ACCOM_LOGISTICS_FIT', '位置、停车和后勤适配', 0.1, 'NOT_APPLICABLE', 'OPTIONAL'),
      makeCheck('ACCOM_POLICY_NEEDS', '取消政策与特殊需求', 0.1, 'NOT_APPLICABLE', 'OPTIONAL'),
    ];
    return {
      dimension: {
        code: 'ACCOMMODATION',
        score: 100,
        weight: input.weight,
        state: 'READY',
        checks,
        evidenceCount: 0,
        blockerCount: 0,
      },
      issues,
    };
  }

  const missingNights = Math.max(0, a.expectedNightCount - a.coveredNightCount);
  const coverageRatio =
    a.expectedNightCount > 0 ? a.coveredNightCount / a.expectedNightCount : 1;
  const bookedRatio =
    a.coveredNightCount > 0 ? a.bookedNightCount / a.coveredNightCount : 0;

  let coverageResult: ReadinessCheck['result'] = 'VERIFIED_READY';
  if (missingNights > 0 || (a.cancelledNightCount ?? 0) > 0) {
    coverageResult = 'FAILED';
    issues.push({
      issueCode: 'ACCOM_MISSING_NIGHT',
      title:
        missingNights > 0
          ? `${missingNights} 晚没有住宿承接`
          : '存在已取消的住宿',
      dimension: 'ACCOMMODATION',
      severity: 'BLOCKER',
      impact: '任意一晚没有住宿应阻塞出发',
      recommendedAction: {
        actionCode: 'OPEN_ACCOMMODATION_TAB',
        title: '补全住宿安排',
        deepLink: 'accommodation',
      },
    });
  } else if (coverageRatio < 1) {
    coverageResult = 'PARTIAL';
  }

  let bookingResult: ReadinessCheck['result'] = 'VERIFIED_READY';
  if (a.needBookingNightCount > 0 && bookedRatio === 0) {
    bookingResult = 'NOT_READY';
  } else if (a.needBookingNightCount > 0 || a.missingDocumentCount > 0) {
    bookingResult = 'PARTIAL';
    issues.push({
      issueCode: 'ACCOM_BOOKING_PENDING',
      title: `${a.needBookingNightCount || a.missingDocumentCount} 晚住宿待确认或缺凭证`,
      dimension: 'ACCOMMODATION',
      severity: 'MUST',
      recommendedAction: {
        actionCode: 'CONFIRM_ACCOMMODATION_BOOKING',
        title: '确认住宿预订',
        deepLink: 'accommodation',
      },
    });
  } else if (bookedRatio < 1) {
    bookingResult = 'READY_UNVERIFIED';
  }

  const checks: ReadinessCheck[] = [
    makeCheck(
      'ACCOM_NIGHT_COVERAGE',
      '所有夜晚均有住宿承接',
      0.3,
      coverageResult,
      coverageResult === 'FAILED' ? 'BLOCKER' : 'MUST',
    ),
    makeCheck(
      'ACCOM_BOOKING_CONFIRMED',
      '预订状态已确认',
      0.3,
      bookingResult,
      'MUST',
    ),
    makeCheck(
      'ACCOM_CHECKIN_ROUTE_FIT',
      '入住时间与路线匹配',
      0.2,
      a.coveredNightCount > 0 ? 'READY_UNVERIFIED' : 'NOT_READY',
      'SHOULD',
    ),
    makeCheck(
      'ACCOM_LOGISTICS_FIT',
      '位置、停车和后勤适配',
      0.1,
      a.coveredNightCount > 0 ? 'READY_UNVERIFIED' : 'NOT_APPLICABLE',
      'SHOULD',
    ),
    makeCheck(
      'ACCOM_POLICY_NEEDS',
      '取消政策与特殊需求',
      0.1,
      a.bookedNightCount > 0 ? 'READY_UNVERIFIED' : 'NOT_READY',
      'OPTIONAL',
    ),
  ];

  const score = computeDimensionScoreFromChecks(checks);
  const blockerCount = issues.filter((i) => i.severity === 'BLOCKER').length;

  return {
    dimension: {
      code: 'ACCOMMODATION',
      score,
      weight: input.weight,
      state: resolveDimensionState(score, blockerCount),
      checks,
      evidenceCount: a.coveredNightCount,
      blockerCount,
      primaryIssue: issues[0]?.title,
    },
    issues,
  };
}

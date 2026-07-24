/**
 * 活动准备度 — 核心体验 / 预约
 */

import type {
  OverallReadinessFactInput,
  ReadinessCheck,
  ReadinessDimension,
  ReadinessIssue,
} from '../types/overall-trip-readiness.types';
import { computeDimensionScoreFromChecks, scoreForCheckResult } from './check-result-scores.util';
import { resolveDimensionState } from './overall-readiness-state.util';

const BOOKED = new Set(['BOOKED', 'CONFIRMED', 'COMPLETED']);
const NEED = new Set(['NEED_BOOKING', 'PENDING', 'UNBOOKED', 'NO_BOOKING', 'WAITLIST']);

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

function bookingResult(status?: string | null, hasConfirmation?: boolean): ReadinessCheck['result'] {
  const s = (status ?? '').toUpperCase();
  if (BOOKED.has(s) || hasConfirmation) return 'VERIFIED_READY';
  if (s === 'CANCELLED' || s === 'SOLD_OUT') return 'FAILED';
  if (NEED.has(s) || !s) return 'NOT_READY';
  return 'PARTIAL';
}

export function buildActivityDimension(input: {
  weight: number;
  activities?: OverallReadinessFactInput['activities'];
}): { dimension: ReadinessDimension; issues: ReadinessIssue[] } {
  const activities = input.activities ?? [];
  const issues: ReadinessIssue[] = [];
  const core = activities.filter((a) => a.isCoreExperience);
  const scoped = core.length > 0 ? core : activities;

  if (scoped.length === 0) {
    const checks: ReadinessCheck[] = [
      makeCheck('ACTIVITY_CORE_DEFINED', '核心体验已经明确', 0.2, 'NOT_APPLICABLE', 'OPTIONAL'),
      makeCheck('ACTIVITY_BOOKING', '预约和名额状态', 0.25, 'NOT_APPLICABLE', 'OPTIONAL'),
      makeCheck('ACTIVITY_TIME_FIT', '时间与路线衔接', 0.2, 'NOT_APPLICABLE', 'OPTIONAL'),
      makeCheck('ACTIVITY_ELIGIBILITY', '天气、年龄、体力和准入要求', 0.2, 'NOT_APPLICABLE', 'OPTIONAL'),
      makeCheck('ACTIVITY_CANCEL_ALT', '装备、取消政策和替代方案', 0.15, 'NOT_APPLICABLE', 'OPTIONAL'),
    ];
    return {
      dimension: {
        code: 'ACTIVITY',
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

  const definedCount = scoped.filter((a) => a.title?.trim()).length;
  const definedResult: ReadinessCheck['result'] =
    definedCount === scoped.length
      ? 'VERIFIED_READY'
      : definedCount > 0
        ? 'PARTIAL'
        : 'NOT_READY';

  const bookingResults = scoped.map((a) => bookingResult(a.bookingStatus, a.hasConfirmation));
  const verifiedBookings = bookingResults.filter((r) => r === 'VERIFIED_READY').length;
  const failedBookings = bookingResults.filter((r) => r === 'FAILED').length;
  let bookingAgg: ReadinessCheck['result'] = 'VERIFIED_READY';
  if (failedBookings > 0) bookingAgg = 'FAILED';
  else if (verifiedBookings === scoped.length) bookingAgg = 'VERIFIED_READY';
  else if (verifiedBookings > 0) bookingAgg = 'PARTIAL';
  else bookingAgg = 'NOT_READY';

  if (bookingAgg === 'NOT_READY' || bookingAgg === 'PARTIAL') {
    const pending = scoped.filter(
      (a) => bookingResult(a.bookingStatus, a.hasConfirmation) !== 'VERIFIED_READY',
    );
    issues.push({
      issueCode: 'ACTIVITY_BOOKING_PENDING',
      title:
        pending.length === 1
          ? `${pending[0]!.title} 尚未完成预订`
          : `${pending.length} 项关键活动尚未完成预订`,
      dimension: 'ACTIVITY',
      severity: 'MUST',
      recommendedAction: {
        actionCode: 'BOOK_CORE_ACTIVITY',
        title: '完成活动预约',
        deepLink: 'activities',
      },
    });
  }

  for (const a of scoped) {
    if (!a.isMustDo) continue;
    const r = bookingResult(a.bookingStatus, a.hasConfirmation);
    if (r === 'FAILED') {
      issues.push({
        issueCode: `ACTIVITY_MUST_FAILED_${a.id}`,
        title: `必去活动不可参加：${a.title}`,
        dimension: 'ACTIVITY',
        severity: 'BLOCKER',
        affectedTripObjectRefs: [a.id],
      });
    }
  }

  const memberGaps = scoped.filter((a) => {
    if (a.memberTotalCount == null || a.memberConfirmedCount == null) return false;
    return a.memberConfirmedCount < a.memberTotalCount;
  });
  if (memberGaps.length > 0) {
    issues.push({
      issueCode: 'ACTIVITY_MEMBER_UNCONFIRMED',
      title: `${memberGaps.length} 项活动仍有成员未确认参加`,
      dimension: 'ACTIVITY',
      severity: 'MUST',
      recommendedAction: {
        actionCode: 'INVITE_MEMBER_ACTIVITY_CONFIRM',
        title: '邀请成员确认活动',
        deepLink: 'decision-space',
      },
    });
  }

  const eligibilityResult: ReadinessCheck['result'] =
    memberGaps.length > 0 ? 'PARTIAL' : 'READY_UNVERIFIED';

  const checks: ReadinessCheck[] = [
    makeCheck('ACTIVITY_CORE_DEFINED', '核心体验已经明确', 0.2, definedResult, 'MUST'),
    makeCheck(
      'ACTIVITY_BOOKING',
      '预约和名额状态',
      0.25,
      bookingAgg,
      bookingAgg === 'FAILED' ? 'BLOCKER' : 'MUST',
    ),
    makeCheck(
      'ACTIVITY_TIME_FIT',
      '时间与路线衔接',
      0.2,
      verifiedBookings > 0 ? 'READY_UNVERIFIED' : 'PARTIAL',
      'SHOULD',
    ),
    makeCheck(
      'ACTIVITY_ELIGIBILITY',
      '天气、年龄、体力和准入要求',
      0.2,
      eligibilityResult,
      'MUST',
    ),
    makeCheck(
      'ACTIVITY_CANCEL_ALT',
      '装备、取消政策和替代方案',
      0.15,
      verifiedBookings > 0 ? 'READY_UNVERIFIED' : 'NOT_READY',
      'SHOULD',
    ),
  ];

  const score = computeDimensionScoreFromChecks(checks);
  const blockerCount = issues.filter((i) => i.severity === 'BLOCKER').length;

  return {
    dimension: {
      code: 'ACTIVITY',
      score,
      weight: input.weight,
      state: resolveDimensionState(score, blockerCount),
      checks,
      evidenceCount: verifiedBookings,
      blockerCount,
      primaryIssue: issues[0]?.title,
    },
    issues,
  };
}

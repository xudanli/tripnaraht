/**
 * 成员确认度 — 参与 / 偏好 / 硬限制 / 关键决策 / 角色 五子项
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

function rateToResult(rate: number): ReadinessCheck['result'] {
  if (rate >= 95) return 'VERIFIED_READY';
  if (rate >= 75) return 'READY_UNVERIFIED';
  if (rate >= 40) return 'PARTIAL';
  if (rate >= 10) return 'NOT_READY';
  return 'FAILED';
}

export function buildMemberDimension(input: {
  weight: number;
  members?: OverallReadinessFactInput['members'];
}): { dimension: ReadinessDimension; issues: ReadinessIssue[] } {
  const m = input.members;
  const issues: ReadinessIssue[] = [];

  if (!m || m.totalCount <= 0) {
    const checks: ReadinessCheck[] = [
      makeCheck('MEMBER_PARTICIPATION', '行程参与状态', 0.2, 'NOT_APPLICABLE', 'OPTIONAL'),
      makeCheck('MEMBER_PREFERENCES', '偏好和目标已表达', 0.2, 'NOT_APPLICABLE', 'OPTIONAL'),
      makeCheck('MEMBER_HARD_LIMITS', '硬性限制已确认', 0.25, 'NOT_APPLICABLE', 'OPTIONAL'),
      makeCheck('MEMBER_CRITICAL_DECISIONS', '关键决策已达成共识', 0.25, 'NOT_APPLICABLE', 'OPTIONAL'),
      makeCheck('MEMBER_ROLES', '角色、任务和紧急信息', 0.1, 'NOT_APPLICABLE', 'OPTIONAL'),
    ];
    return {
      dimension: {
        code: 'MEMBER',
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

  const participationRate =
    m.totalCount > 0 ? (m.confirmedParticipationCount / m.totalCount) * 100 : 0;
  const participationResult = rateToResult(participationRate);

  if (m.totalCount > 1 && m.confirmedParticipationCount < m.totalCount) {
    const unconfirmed = m.totalCount - m.confirmedParticipationCount;
    issues.push({
      issueCode: 'MEMBER_PARTICIPATION_PENDING',
      title: `${unconfirmed} 位成员尚未确认是否参加`,
      dimension: 'MEMBER',
      severity: 'BLOCKER',
      recommendedAction: {
        actionCode: 'INVITE_MEMBER_CONFIRM',
        title: '邀请成员确认参加',
        deepLink: 'members',
      },
    });
  }

  const preferenceRate = m.preferenceCompletionRate ?? m.profilingCompletionRate;
  const hardLimitsRate = m.hardLimitsConfirmedRate ?? m.profilingCompletionRate;
  const preferenceResult = rateToResult(preferenceRate);
  const hardLimitsResult = rateToResult(hardLimitsRate);

  if (preferenceRate < 95 && m.totalCount > 1) {
    issues.push({
      issueCode: 'MEMBER_PREFERENCES_PENDING',
      title: '成员偏好和目标尚未充分表达',
      dimension: 'MEMBER',
      severity: 'SHOULD',
      recommendedAction: {
        actionCode: 'COMPLETE_TRAVEL_STYLE',
        title: '完成旅行风格调查',
        deepLink: 'decision-profiling',
      },
    });
  }

  if (hardLimitsRate < 75) {
    issues.push({
      issueCode: 'MEMBER_HARD_LIMITS_PENDING',
      title: '硬性限制（体力/费用偏好等）尚未确认',
      dimension: 'MEMBER',
      severity: 'MUST',
      recommendedAction: {
        actionCode: 'COMPLETE_MONEY_DNA',
        title: '完成费用与限制确认',
        deepLink: 'decision-profiling',
      },
    });
  }

  let criticalDecisionResult: ReadinessCheck['result'] = 'VERIFIED_READY';
  if (m.openCriticalDecisionCount > 0) {
    criticalDecisionResult = 'NOT_READY';
    issues.push({
      issueCode: 'MEMBER_CRITICAL_DECISIONS_OPEN',
      title: `${m.openCriticalDecisionCount} 项关键决策尚未达成共识`,
      dimension: 'MEMBER',
      severity: 'MUST',
      recommendedAction: {
        actionCode: 'OPEN_DECISION_SPACE',
        title: '处理关键决策',
        deepLink: 'decision-space',
      },
    });
  }

  const rolesResult: ReadinessCheck['result'] = m.rolesAssigned
    ? 'VERIFIED_READY'
    : m.totalCount === 1
      ? 'VERIFIED_READY'
      : 'PARTIAL';

  if (!m.rolesAssigned && m.totalCount > 1) {
    issues.push({
      issueCode: 'MEMBER_ROLES_PENDING',
      title: '驾驶/联系人等角色尚未明确',
      dimension: 'MEMBER',
      severity: 'SHOULD',
      recommendedAction: {
        actionCode: 'ASSIGN_MEMBER_ROLES',
        title: '分配成员角色',
        deepLink: 'members',
      },
    });
  }

  const checks: ReadinessCheck[] = [
    makeCheck(
      'MEMBER_PARTICIPATION',
      '行程参与状态',
      0.2,
      m.totalCount === 1 ? 'VERIFIED_READY' : participationResult,
      m.totalCount > 1 && participationRate < 100 ? 'BLOCKER' : 'MUST',
    ),
    makeCheck('MEMBER_PREFERENCES', '偏好和目标已表达', 0.2, preferenceResult, 'SHOULD'),
    makeCheck(
      'MEMBER_HARD_LIMITS',
      '硬性限制已确认',
      0.25,
      hardLimitsResult,
      'MUST',
    ),
    makeCheck(
      'MEMBER_CRITICAL_DECISIONS',
      '关键决策已达成共识',
      0.25,
      criticalDecisionResult,
      'MUST',
    ),
    makeCheck('MEMBER_ROLES', '角色、任务和紧急信息', 0.1, rolesResult, 'SHOULD'),
  ];

  const score = computeDimensionScoreFromChecks(checks);
  const blockerCount = issues.filter((i) => i.severity === 'BLOCKER').length;

  return {
    dimension: {
      code: 'MEMBER',
      score,
      weight: input.weight,
      state: resolveDimensionState(score, blockerCount),
      checks,
      evidenceCount: m.confirmedParticipationCount,
      blockerCount,
      primaryIssue: issues[0]?.title,
    },
    issues,
  };
}

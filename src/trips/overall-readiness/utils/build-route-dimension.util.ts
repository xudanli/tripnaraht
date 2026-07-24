/**
 * 路线准备度 — Phase 1 从 feasibility 维度粗投影
 */

import type {
  OverallReadinessFactInput,
  ReadinessCheck,
  ReadinessDimension,
  ReadinessIssue,
} from '../types/overall-trip-readiness.types';
import { computeDimensionScoreFromChecks, scoreForCheckResult } from './check-result-scores.util';
import { resolveDimensionState } from './overall-readiness-state.util';

function dimScore(
  feasibility: OverallReadinessFactInput['feasibility'],
  keys: string[],
): number | null {
  if (!feasibility?.dimensions?.length) return null;
  const matched = feasibility.dimensions.filter((d) => keys.includes(d.key));
  if (matched.length === 0) return null;
  return Math.round(
    matched.reduce((sum, d) => sum + d.score, 0) / matched.length,
  );
}

function resultFromScore(
  score: number | null,
  emptyResult: ReadinessCheck['result'] = 'NOT_READY',
): ReadinessCheck['result'] {
  if (score == null) return emptyResult;
  if (score >= 90) return 'VERIFIED_READY';
  if (score >= 75) return 'READY_UNVERIFIED';
  if (score >= 50) return 'PARTIAL';
  if (score >= 20) return 'NOT_READY';
  return 'FAILED';
}

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

export function buildRouteDimension(input: {
  weight: number;
  feasibility?: OverallReadinessFactInput['feasibility'];
}): { dimension: ReadinessDimension; issues: ReadinessIssue[] } {
  const f = input.feasibility;
  const issues: ReadinessIssue[] = [];

  const structureScore =
    dimScore(f, ['itinerary_completeness', 'schedule']) ??
    (typeof f?.overallScore === 'number' ? f.overallScore : null);
  const timeWindowScore = dimScore(f, ['schedule', 'access_capacity']);
  const roadWeatherScore = dimScore(f, ['environment', 'transport']);
  const loadBufferScore = dimScore(f, ['schedule']);
  const continuityScore = dimScore(f, ['itinerary_completeness']);

  const notExecutable =
    f?.verdictStatus === 'NOT_EXECUTABLE' ||
    ((f?.mustHandleCount ?? 0) > 0 &&
      (f?.dimensions?.some((d) => (d.blockerCount ?? 0) > 0) ?? false));

  const checks: ReadinessCheck[] = [
    makeCheck(
      'ROUTE_DAILY_STRUCTURE',
      '每日路线结构完整',
      0.2,
      resultFromScore(structureScore, f ? 'PARTIAL' : 'NOT_READY'),
      structureScore != null && structureScore < 40 ? 'BLOCKER' : 'MUST',
    ),
    makeCheck(
      'ROUTE_TIME_WINDOWS',
      '时间窗与营业时间可行',
      0.2,
      resultFromScore(timeWindowScore, f ? 'PARTIAL' : 'NOT_READY'),
      'MUST',
    ),
    makeCheck(
      'ROUTE_ROAD_WEATHER',
      '道路、天气和可达性',
      0.25,
      resultFromScore(roadWeatherScore, f ? 'PARTIAL' : 'NOT_READY'),
      notExecutable ? 'BLOCKER' : 'MUST',
      notExecutable ? '存在不可修复的可行性问题或关键道路不可达' : undefined,
    ),
    makeCheck(
      'ROUTE_DRIVE_LOAD_BUFFER',
      '驾驶负荷与缓冲时间',
      0.2,
      resultFromScore(loadBufferScore, f ? 'PARTIAL' : 'NOT_READY'),
      'SHOULD',
    ),
    makeCheck(
      'ROUTE_CONTINUITY_ALTERNATIVES',
      '连续性与替代方案',
      0.15,
      resultFromScore(continuityScore, f ? 'READY_UNVERIFIED' : 'NOT_READY'),
      'SHOULD',
    ),
  ];

  if (f?.verdictStatus === 'NOT_EXECUTABLE') {
    issues.push({
      issueCode: 'ROUTE_NOT_EXECUTABLE',
      title: '行程方案当前不可执行',
      dimension: 'ROUTE',
      severity: 'BLOCKER',
      impact: '存在 REJECT / STOP 或不可修复的不可行项',
      recommendedAction: {
        actionCode: 'OPEN_FEASIBILITY_REPORT',
        title: '查看可执行证明并修复',
        deepLink: 'feasibility-report',
      },
    });
  }

  for (const issue of f?.issues ?? []) {
    if (issue.priority !== 'must_handle') continue;
    const dim = (issue.dimension ?? '').toLowerCase();
    if (
      dim &&
      !['schedule', 'transport', 'environment', 'itinerary_completeness', 'access_capacity'].includes(
        dim,
      )
    ) {
      continue;
    }
    issues.push({
      issueCode: `ROUTE_ISSUE_${issue.id}`,
      title: issue.title ?? '路线可行性问题',
      dimension: 'ROUTE',
      severity: 'BLOCKER',
      affectedTripObjectRefs: [issue.id],
    });
  }

  const score = computeDimensionScoreFromChecks(checks);
  const blockerCount = issues.filter((i) => i.severity === 'BLOCKER').length;

  return {
    dimension: {
      code: 'ROUTE',
      score,
      weight: input.weight,
      state: resolveDimensionState(score, blockerCount),
      checks,
      evidenceCount: f?.dimensions?.length ?? 0,
      blockerCount,
      primaryIssue: issues[0]?.title,
    },
    issues,
  };
}

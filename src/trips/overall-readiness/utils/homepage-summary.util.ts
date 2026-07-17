/**
 * 报告首页摘要 + 卡片展示文案
 */

import type {
  OverallReadinessHomepageSummary,
  OverallReadinessState,
  ReadinessAction,
  ReadinessDimension,
  ReadinessDimensionCode,
  ReadinessIssue,
} from '../types/overall-trip-readiness.types';

const DIMENSION_LABELS_ZH: Record<ReadinessDimensionCode, string> = {
  ROUTE: '路线',
  ACCOMMODATION: '住宿',
  TRANSPORT: '交通',
  ACTIVITY: '活动',
  MEMBER: '成员',
};

/** 首页主状态：READY 以外的日常态统一「尚未就绪」，阻塞/过期保留专词 */
export function resolveDisplayLabelZh(state: OverallReadinessState): string {
  if (state === 'READY') return '已准备好';
  if (state === 'BLOCKED') return '已阻塞';
  if (state === 'NEEDS_REVALIDATION') return '需要重新验证';
  return '尚未就绪';
}

export function buildHomepageSummary(input: {
  score: number;
  state: OverallReadinessState;
  displayLabelZh: string;
  dimensions: {
    route: ReadinessDimension;
    accommodation: ReadinessDimension;
    transport: ReadinessDimension;
    activity: ReadinessDimension;
    member: ReadinessDimension;
  };
  blockers: ReadinessIssue[];
  pendingConfirmations: ReadinessIssue[];
  recommendations: ReadinessAction[];
  expiredEvidenceCount: number;
}): OverallReadinessHomepageSummary {
  const whyNotReady: string[] = [];

  for (const b of input.blockers.slice(0, 3)) {
    whyNotReady.push(b.title);
  }
  for (const p of input.pendingConfirmations.slice(0, 4)) {
    if (whyNotReady.length >= 5) break;
    if (!whyNotReady.includes(p.title)) whyNotReady.push(p.title);
  }
  if (input.expiredEvidenceCount > 0 && whyNotReady.length < 5) {
    whyNotReady.push(`${input.expiredEvidenceCount} 项动态证据需要重新验证`);
  }

  const mustHandleNow = input.blockers
    .concat(input.pendingConfirmations.filter((i) => i.severity === 'MUST'))
    .slice(0, 5)
    .map((i) => ({
      title: i.title,
      actionCode: i.recommendedAction?.actionCode,
      estimatedScoreLift: i.recommendedAction?.estimatedScoreLift,
    }));

  const canHandleLater = input.pendingConfirmations
    .filter((i) => i.severity === 'SHOULD' || i.severity === 'OPTIONAL')
    .slice(0, 5)
    .map((i) => ({
      title: i.title,
      actionCode: i.recommendedAction?.actionCode,
      estimatedScoreLift: i.recommendedAction?.estimatedScoreLift,
    }));

  const potentialScoreLift = Math.min(
    100 - input.score,
    input.recommendations
      .slice(0, 5)
      .reduce((sum, r) => sum + (r.estimatedScoreLift ?? 0), 0),
  );

  const dims = input.dimensions;
  const dimensionRows = (
    [
      dims.route,
      dims.accommodation,
      dims.transport,
      dims.activity,
      dims.member,
    ] as ReadinessDimension[]
  ).map((d) => ({
    code: d.code,
    labelZh: DIMENSION_LABELS_ZH[d.code],
    score: d.score,
    state: d.state,
    primaryIssue: d.primaryIssue,
  }));

  return {
    headline: `整体准备度 ${input.score}% · ${input.displayLabelZh}`,
    whyNotReady,
    mustHandleNow,
    canHandleLater,
    potentialScoreLift,
    dimensionRows,
  };
}

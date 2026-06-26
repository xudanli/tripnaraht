import type { InTripRecoveryLoopResult } from '../types/in-trip-recovery.types';

export type InTripLoopUiPhase =
  | 'monitoring'
  | 'change_detected'
  | 'awaiting_approval'
  | 'resolved'
  | 'failed';

export interface InTripLoopUiViewDto {
  phase: InTripLoopUiPhase;
  headline: string;
  subheadline: string;
  /** 发生了什么 */
  whatHappened: string;
  /** 会影响什么 */
  impactSummary: string;
  /** 推荐怎么处理 */
  recommendation: string;
  layers: {
    happened: string;
    impact: string;
    action: string;
  };
  issueCards: Array<{
    triggerKind: string;
    title: string;
    systemAttempts: string[];
    recommendation: string;
    environmentEventId?: string;
    planId?: string;
    requiresApproval: boolean;
  }>;
  primaryAction?: {
    label: string;
    loopRunId: string;
    planCount: number;
  };
  snapshot: {
    before: InTripRecoveryLoopResult['before'];
    after: InTripRecoveryLoopResult['after'];
  };
}

export function buildInTripLoopUiView(result: InTripRecoveryLoopResult): InTripLoopUiViewDto {
  const phase = resolvePhase(result);
  const topIteration = result.iterations[0];
  const topPlan = result.recommendedPlans[0];

  const whatHappened =
    topIteration?.triggerTitle ??
    (result.before.delayMinutes >= 15
      ? `实际出发晚了 ${result.before.delayMinutes} 分钟`
      : '今日计划出现变化');

  const impactSummary = buildImpactSummary(result);
  const recommendation =
    topPlan?.title ?? topIteration?.proposal.title ?? '保持原计划并关注实时更新';

  return {
    phase,
    headline: phase === 'monitoring' ? '今日行程正常' : '今天的计划出现变化',
    subheadline: `状态 ${result.after.verdictStatus} · 开放环境事件 ${result.after.openEnvironmentEvents}`,
    whatHappened,
    impactSummary,
    recommendation,
    layers: {
      happened: whatHappened,
      impact: impactSummary,
      action: recommendation,
    },
    issueCards: result.iterations.map((it) => ({
      triggerKind: it.triggerKind,
      title: it.triggerTitle,
      systemAttempts: it.attemptedPlans.slice(0, 3).map((id, idx) => {
        if (id === it.proposal.planId) return `${idx + 1}. ${it.proposal.title}`;
        return `${idx + 1}. 备选方案`;
      }),
      recommendation: it.proposal.title,
      environmentEventId: it.environmentEventId,
      planId: it.proposal.planId,
      requiresApproval: it.validation.wouldDefer === true || result.requiresApproval,
    })),
    primaryAction:
      result.requiresApproval && result.recommendedPlans.length > 0
        ? {
            label: '采用调整',
            loopRunId: result.loopRunId,
            planCount: result.recommendedPlans.length,
          }
        : undefined,
    snapshot: { before: result.before, after: result.after },
  };
}

function resolvePhase(result: InTripRecoveryLoopResult): InTripLoopUiPhase {
  if (result.status === 'FAILED') return 'failed';
  if (result.status === 'COMPLETED' && result.after.onTrack) return 'resolved';
  if (result.requiresApproval || result.status === 'WAITING_FOR_HUMAN') return 'awaiting_approval';
  if (result.iterations.length > 0) return 'change_detected';
  return 'monitoring';
}

function buildImpactSummary(result: InTripRecoveryLoopResult): string {
  const parts: string[] = [];
  if (result.before.atRiskItems > 0) {
    parts.push(`${result.before.atRiskItems} 个行程项处于风险状态`);
  }
  const iter = result.iterations[0];
  if (iter?.validation.lateProbabilityBefore != null && iter.validation.lateProbabilityAfter != null) {
    const beforePct = Math.round(iter.validation.lateProbabilityBefore * 100);
    const afterPct = Math.round(iter.validation.lateProbabilityAfter * 100);
    parts.push(`迟到概率 ${beforePct}% → 推荐方案可降至约 ${afterPct}%`);
  }
  if (result.before.redEvents > 0) {
    parts.push(`${result.before.redEvents} 个高严重度环境警报`);
  }
  return parts.length > 0 ? parts.join('；') : '对今日后续行程影响有限';
}

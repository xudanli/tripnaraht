import { Gate1ProjectStatus } from '../constants/gate1.constants';

export type AdvisorNextAction = {
  id: string;
  title: string;
  reason: string;
  priority: 'P0' | 'P1' | 'P2';
  tab: string;
  path: string;
};

export type AdvisorProjectSignals = {
  experimentStatus: string;
  cohort: string;
  hasConfirmedBaseline: boolean;
  participantCount: number;
  submittedCount: number;
  hasPublishedConflicts: boolean;
  unpublishedConflictFeedback: number;
  publishedCandidateCount: number;
  hasDecision: boolean;
  redReadinessCount: number;
  unpublishedPlanBCount: number;
  daysToDeparture: number | null;
};

export function computeDaysToDeparture(startDate: Date | null | undefined): number | null {
  if (!startDate) return null;
  const today = new Date();
  today.setHours(0, 0, 0, 0);
  const start = new Date(startDate);
  start.setHours(0, 0, 0, 0);
  return Math.ceil((start.getTime() - today.getTime()) / (24 * 60 * 60 * 1000));
}

export function computeNextAction(
  projectId: string,
  signals: AdvisorProjectSignals,
): AdvisorNextAction | null {
  const base = (tab: string, suffix: string) => ({
    tab,
    path: `/advisor/projects/${projectId}/${suffix}`,
  });

  if (signals.experimentStatus === 'WITHDRAWN' || signals.experimentStatus === 'COMPLETED') {
    return null;
  }

  if (!signals.hasConfirmedBaseline) {
    return {
      id: 'confirm-baseline',
      title: '确认 Baseline',
      reason: '实验基线未锁定，无法发布冲突与方案分析',
      priority: 'P0',
      ...base('overview', 'baseline'),
    };
  }

  if (signals.participantCount === 0) {
    return {
      id: 'invite-participants',
      title: '邀请成员',
      reason: '尚无成员，无法收集偏好与约束',
      priority: 'P0',
      ...base('participants', 'participants'),
    };
  }

  if (
    signals.experimentStatus === 'COLLECTING' &&
    signals.submittedCount < signals.participantCount
  ) {
    return {
      id: 'collect-preferences',
      title: '跟进成员填写',
      reason: `${signals.submittedCount}/${signals.participantCount} 成员已完成填写`,
      priority: 'P0',
      ...base('participants', 'participants'),
    };
  }

  if (!signals.hasPublishedConflicts && ['COLLECTING', 'ANALYZING'].includes(signals.experimentStatus)) {
    return {
      id: 'await-conflicts',
      title: '等待冲突分析',
      reason: '人工协助冲突报告尚未发布',
      priority: 'P1',
      ...base('conflicts', 'conflicts'),
    };
  }

  if (signals.unpublishedConflictFeedback > 0) {
    return {
      id: 'review-conflicts',
      title: '审阅冲突报告',
      reason: `${signals.unpublishedConflictFeedback} 条冲突待确认或反馈`,
      priority: 'P0',
      ...base('conflicts', 'conflicts'),
    };
  }

  if (
    signals.hasPublishedConflicts &&
    signals.publishedCandidateCount === 0 &&
    ['ANALYZING', 'ADVISOR_DECIDING'].includes(signals.experimentStatus)
  ) {
    return {
      id: 'await-candidates',
      title: '等待候选方案',
      reason: '冲突已发布，候选策略尚未交付',
      priority: 'P1',
      ...base('strategies', 'strategies'),
    };
  }

  if (
    signals.publishedCandidateCount > 0 &&
    !signals.hasDecision &&
    ['ADVISOR_DECIDING', 'ANALYZING', 'READY'].includes(signals.experimentStatus)
  ) {
    return {
      id: 'submit-decision',
      title: '提交决策记录',
      reason: '候选方案已发布，需记录最终选择与原因',
      priority: 'P0',
      ...base('decisions', 'decisions'),
    };
  }

  if (signals.redReadinessCount > 0) {
    return {
      id: 'fix-readiness-blockers',
      title: '处理 Readiness 阻塞项',
      reason: `${signals.redReadinessCount} 项 RED 阻塞可执行性`,
      priority: 'P0',
      ...base('readiness', 'readiness'),
    };
  }

  if (signals.unpublishedPlanBCount > 0) {
    return {
      id: 'review-plan-b',
      title: '审阅 Plan B',
      reason: '存在待批准的预案',
      priority: 'P1',
      ...base('plan-b', 'plan-b'),
    };
  }

  if (signals.daysToDeparture != null && signals.daysToDeparture <= 14 && signals.daysToDeparture >= 0) {
    return {
      id: 'near-departure-check',
      title: '临近出发检查',
      reason: `距出发 ${signals.daysToDeparture} 天`,
      priority: 'P1',
      ...base('readiness', 'readiness'),
    };
  }

  if (signals.experimentStatus === 'ACTIVE') {
    return {
      id: 'record-travel-events',
      title: '记录行中事件',
      reason: '行程执行中，需跟踪异常与 Plan B',
      priority: 'P1',
      ...base('outcome', 'outcome'),
    };
  }

  if (signals.hasDecision && !['COMPLETED', 'WITHDRAWN'].includes(signals.experimentStatus)) {
    return {
      id: 'close-outcome',
      title: '完成结果闭环',
      reason: '决策已记录，可提交 Outcome 与 Gate 数据',
      priority: 'P2',
      ...base('outcome', 'outcome'),
    };
  }

  return null;
}

export function computeRiskLevel(signals: AdvisorProjectSignals): 'HIGH' | 'MEDIUM' | 'LOW' {
  if (signals.redReadinessCount > 0) return 'HIGH';
  if (signals.unpublishedConflictFeedback > 0 && signals.daysToDeparture != null && signals.daysToDeparture <= 7) {
    return 'HIGH';
  }
  if (
    signals.experimentStatus === 'COLLECTING' &&
    signals.daysToDeparture != null &&
    signals.daysToDeparture <= 7 &&
    signals.submittedCount < signals.participantCount
  ) {
    return 'HIGH';
  }
  if (signals.unpublishedConflictFeedback > 0 || signals.redReadinessCount > 0) return 'MEDIUM';
  if (signals.daysToDeparture != null && signals.daysToDeparture <= 14) return 'MEDIUM';
  return 'LOW';
}

export function needsActionScore(signals: AdvisorProjectSignals): number {
  const next = computeNextAction('', signals);
  if (!next) return 0;
  const priorityScore = { P0: 300, P1: 200, P2: 100 }[next.priority];
  const urgency =
    signals.daysToDeparture != null && signals.daysToDeparture <= 14
      ? Math.max(0, 14 - signals.daysToDeparture) * 10
      : 0;
  const riskScore = { HIGH: 50, MEDIUM: 25, LOW: 0 }[computeRiskLevel(signals)];
  return priorityScore + urgency + riskScore;
}

export function isTerminalStatus(status: string): boolean {
  return (['COMPLETED', 'WITHDRAWN'] as Gate1ProjectStatus[]).includes(status as Gate1ProjectStatus);
}

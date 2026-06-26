import {
  Gate1ProposalFeedbackResponse,
} from '../constants/gate1.constants';
import { hasGrantedConsent } from './gate1-consent.util';

export type ParticipantTodo = {
  id: string;
  title: string;
  reason?: string;
  dueAt?: string;
  impact?: string;
  assignee: 'SELF' | 'GUARDIAN' | 'ORGANIZER';
  status: 'NOT_STARTED' | 'IN_PROGRESS' | 'WAITING' | 'COMPLETED' | 'WAIVED';
  priority: 'P0' | 'P1' | 'P2' | 'P3';
  actionPath?: string;
};

type DashboardInput = {
  token: string;
  participantStatus: string;
  consentRecords: Array<{
    consentType: string | null;
    status: string;
    scope?: unknown;
  }>;
  preferenceSubmitted: boolean;
  preferenceDraft: boolean;
  publishedCandidates: Array<{
    id: string;
    label: string;
    version: number;
    strategySummary: string;
    publishedAt: Date | null;
  }>;
  proposalFeedbacks: Array<{
    candidateStrategyId: string;
    candidateVersion: number;
    status: string;
    response: string;
  }>;
  changeNotices: Array<{
    id: string;
    title: string;
    severity: string;
    summary: string;
    actionRequired?: string;
    deadline?: string;
    needsAck: boolean;
  }>;
  participantTasks: Array<{
    id: string;
    title: string;
    status: string;
    blocking: boolean;
    priority: string;
    dueAt?: Date | null;
    category: string;
  }>;
  projectStage: string;
};

export function buildParticipantTodos(input: DashboardInput): ParticipantTodo[] {
  const todos: ParticipantTodo[] = [];
  const { token } = input;

  if (input.participantStatus === 'INVITED' || input.participantStatus === 'OPENED') {
    todos.push({
      id: 'accept-invite',
      title: '接受邀请并加入项目',
      reason: '确认参与本次旅行协作',
      assignee: 'SELF',
      status: 'NOT_STARTED',
      priority: 'P0',
      actionPath: `/participant/invites/${token}/accept`,
    });
  }

  const needsHumanAssisted = !hasGrantedConsent(input.consentRecords, 'HUMAN_ASSISTED');
  const needsBase = !hasGrantedConsent(input.consentRecords, 'BASE_SERVICE');

  if (
    ['JOINED', 'OPENED', 'CONSENTED', 'IN_PROGRESS'].includes(input.participantStatus) &&
    (needsBase || needsHumanAssisted)
  ) {
    todos.push({
      id: 'complete-consent',
      title: needsHumanAssisted ? '完成知情同意（含人工协助说明）' : '完成基础服务同意',
      reason: needsHumanAssisted
        ? 'Gate 1 需确认人工协助条款后方可填写偏好与私密约束'
        : '需确认基础数据处理后方可继续',
      assignee: 'SELF',
      status: 'NOT_STARTED',
      priority: 'P0',
      actionPath: `/participant/consents`,
    });
  }

  if (
    hasGrantedConsent(input.consentRecords, 'BASE_SERVICE') &&
    hasGrantedConsent(input.consentRecords, 'HUMAN_ASSISTED') &&
    !input.preferenceSubmitted
  ) {
    todos.push({
      id: 'submit-preferences',
      title: input.preferenceDraft ? '继续填写旅行偏好' : '填写旅行偏好与约束',
      reason: '团队方案需要您的输入才能继续',
      impact: '未完成将影响方案生成与确认',
      assignee: 'SELF',
      status: input.preferenceDraft ? 'IN_PROGRESS' : 'NOT_STARTED',
      priority: 'P1',
      actionPath: `/participant/projects/${token}/preferences`,
    });
  }

  for (const candidate of input.publishedCandidates) {
    const submittedFeedback = input.proposalFeedbacks.find(
      (f) => f.candidateStrategyId === candidate.id && f.status === 'SUBMITTED',
    );
    const wasInvalidated = input.proposalFeedbacks.some(
      (f) => f.candidateStrategyId === candidate.id && f.status === 'INVALIDATED',
    );
    if (input.preferenceSubmitted && !submittedFeedback) {
      todos.push({
        id: `proposal-feedback-${candidate.id}`,
        title: wasInvalidated
          ? `重新确认方案「${candidate.label}」`
          : `查看并反馈方案「${candidate.label}」`,
        reason: wasInvalidated
          ? '方案已更新，需重新确认'
          : '顾问已发布候选方案，等待您的反馈',
        assignee: 'SELF',
        status: 'NOT_STARTED',
        priority: 'P1',
        actionPath: `/participant/projects/${token}/proposals/${candidate.id}`,
      });
    }
  }

  for (const notice of input.changeNotices ?? []) {
    const needsAck = notice.needsAck ?? true;
    if (!needsAck) continue;
    todos.push({
      id: `change-${notice.id}`,
      title: notice.title,
      reason: notice.summary,
      impact: notice.actionRequired,
      dueAt: notice.deadline,
      assignee: 'SELF',
      status: 'NOT_STARTED',
      priority: notice.severity === 'EMERGENCY' || notice.severity === 'HIGH' ? 'P0' : 'P2',
      actionPath: `/participant/projects/${token}/change-notices/${notice.id}`,
    });
  }

  for (const task of input.participantTasks ?? []) {
    if (task.status === 'COMPLETED' || task.status === 'WAIVED') continue;
    todos.push({
      id: `task-${task.id}`,
      title: task.title,
      reason: `准备事项：${task.category}`,
      dueAt: task.dueAt?.toISOString(),
      impact: task.blocking ? '阻塞项目行前准备' : undefined,
      assignee: 'SELF',
      status:
        task.status === 'IN_PROGRESS'
          ? 'IN_PROGRESS'
          : task.status === 'WAITING'
            ? 'WAITING'
            : 'NOT_STARTED',
      priority: task.blocking ? 'P0' : (task.priority as ParticipantTodo['priority']),
      actionPath: `/participant/projects/${token}/readiness/tasks/${task.id}`,
    });
  }

  return todos.sort((a, b) => {
    const order = { P0: 0, P1: 1, P2: 2, P3: 3 };
    return order[a.priority] - order[b.priority];
  });
}

export function pickPrimaryAction(todos: ParticipantTodo[]): ParticipantTodo | null {
  return todos.find((t) => t.status !== 'COMPLETED' && t.status !== 'WAIVED') ?? null;
}

export function computeProgress(input: {
  consentRecords: DashboardInput['consentRecords'];
  preferenceSubmitted: boolean;
  proposalFeedbacks: DashboardInput['proposalFeedbacks'];
  publishedCandidates: DashboardInput['publishedCandidates'];
  participantTasks?: DashboardInput['participantTasks'];
}) {
  const consentComplete =
    hasGrantedConsent(input.consentRecords, 'BASE_SERVICE') &&
    hasGrantedConsent(input.consentRecords, 'HUMAN_ASSISTED');
  const prefsComplete = input.preferenceSubmitted;
  const feedbackNeeded = input.publishedCandidates.length;
  const feedbackDone = input.proposalFeedbacks.filter((f) => f.status === 'SUBMITTED').length;
  const openTasks = (input.participantTasks ?? []).filter(
    (t) => !['COMPLETED', 'WAIVED'].includes(t.status),
  );
  const readinessComplete = openTasks.length === 0;
  const steps = [
    consentComplete,
    prefsComplete,
    feedbackNeeded === 0 || feedbackDone >= feedbackNeeded,
    readinessComplete,
  ];
  const completed = steps.filter(Boolean).length;
  return {
    consentComplete,
    preferencesComplete: prefsComplete,
    proposalFeedbackComplete: feedbackNeeded === 0 || feedbackDone >= feedbackNeeded,
    readinessComplete,
    openReadinessTasks: openTasks.length,
    completionRate: steps.length ? completed / steps.length : 0,
  };
}

export function requiresFeedbackNote(response: Gate1ProposalFeedbackResponse): boolean {
  return ['CONCERN', 'REJECT', 'NEED_INFO'].includes(response);
}

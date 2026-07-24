import type {
  CollaborativeTaskDispatchPlan,
  CollaborativeTaskStatus,
  CollaborativeTaskView,
} from '../types/recruitment-task-flywheel.types';
import { COLLABORATIVE_TASK_FLYWHEEL_VERSION } from '../types/recruitment-task-flywheel.types';

export type CollaborativeTaskBehaviorAction = 'confirm' | 'rollback' | 'ack_timeout';

export interface CollaborativeTaskBehaviorEventRecord {
  eventId: string;
  taskId: string;
  action: CollaborativeTaskBehaviorAction;
  actorUserId: string;
  at: string;
  note?: string | null;
  evidenceRefs?: string[];
  responseLatencyMs?: number | null;
  revisionCountAfter: number;
}

export interface CollaborativeTaskFlywheelMetadata extends CollaborativeTaskDispatchPlan {
  behaviorLog?: CollaborativeTaskBehaviorEventRecord[];
}

export interface ApplyCollaborativeTaskEventInput {
  plan: CollaborativeTaskFlywheelMetadata;
  taskId: string;
  action: CollaborativeTaskBehaviorAction;
  actorUserId: string;
  actorRole: 'captain' | 'member';
  at?: string;
  note?: string | null;
  evidenceRefs?: string[];
}

export interface ApplyCollaborativeTaskEventResult {
  plan: CollaborativeTaskFlywheelMetadata;
  task: CollaborativeTaskView;
  event: CollaborativeTaskBehaviorEventRecord;
  dnaReasons: Array<'TASK_CHAIN_CONFIRMED' | 'TASK_CHAIN_ROLLED_BACK' | 'TASK_CHAIN_TIMEOUT'>;
  notifyUserIds: string[];
}

function findTask(plan: CollaborativeTaskFlywheelMetadata, taskId: string): CollaborativeTaskView | null {
  return plan.tasks.find((t) => t.taskId === taskId) ?? null;
}

function computeLatencyMs(task: CollaborativeTaskView, at: string, plan: CollaborativeTaskFlywheelMetadata): number | null {
  const base = plan.dispatchedAt;
  if (!base) return null;
  const start = Date.parse(base);
  const end = Date.parse(at);
  if (!Number.isFinite(start) || !Number.isFinite(end)) return null;
  return Math.max(0, end - start);
}

function nextStatus(
  current: CollaborativeTaskStatus,
  action: CollaborativeTaskBehaviorAction,
): CollaborativeTaskStatus | null {
  switch (action) {
    case 'confirm':
      if (current === 'pending' || current === 'rolled_back') return 'confirmed';
      return null;
    case 'rollback':
      if (current === 'pending' || current === 'confirmed' || current === 'rolled_back') return 'rolled_back';
      return null;
    case 'ack_timeout':
      if (current === 'pending') return 'timed_out';
      return null;
    default:
      return null;
  }
}

function canActorPerform(
  task: CollaborativeTaskView,
  action: CollaborativeTaskBehaviorAction,
  actorUserId: string,
  actorRole: 'captain' | 'member',
): string | null {
  if (!task.behaviorCaptureEnabled) {
    return '该任务未启用行为捕获';
  }

  if (action === 'ack_timeout') {
    return actorRole === 'captain' ? null : '仅队长可标记任务超时';
  }

  if (action === 'confirm') {
    if (actorUserId === task.assigneeUserId || actorRole === 'captain') return null;
    return '仅任务负责人或队长可确认';
  }

  if (action === 'rollback') {
    if (actorRole === 'captain' || actorUserId === task.assigneeUserId) return null;
    return '仅队长或任务负责人可回滚';
  }

  return '不支持的操作';
}

export function readCollaborativeTaskFlywheelFromMetadata(
  metadata: unknown,
): CollaborativeTaskFlywheelMetadata | null {
  if (!metadata || typeof metadata !== 'object') return null;
  const raw = (metadata as Record<string, unknown>).collaborativeTaskFlywheel;
  if (!raw || typeof raw !== 'object') return null;
  const plan = raw as CollaborativeTaskFlywheelMetadata;
  if (plan.version !== COLLABORATIVE_TASK_FLYWHEEL_VERSION) return null;
  if (!Array.isArray(plan.tasks)) return null;
  return plan;
}

export function applyCollaborativeTaskBehaviorEvent(
  input: ApplyCollaborativeTaskEventInput,
): ApplyCollaborativeTaskEventResult {
  const task = findTask(input.plan, input.taskId);
  if (!task) {
    throw new Error('TASK_NOT_FOUND');
  }

  const permissionError = canActorPerform(task, input.action, input.actorUserId, input.actorRole);
  if (permissionError) {
    throw new Error(permissionError);
  }

  const at = input.at ?? new Date().toISOString();
  const next = nextStatus(task.status, input.action);
  if (!next) {
    throw new Error(`当前状态 ${task.status} 不可执行 ${input.action}`);
  }

  const revisionCountAfter =
    input.action === 'rollback' ? (task.revisionCount ?? 0) + 1 : (task.revisionCount ?? 0);

  const updatedTask: CollaborativeTaskView = {
    ...task,
    status: next,
    revisionCount: revisionCountAfter,
    confirmedAt:
      input.action === 'confirm' ? at : task.confirmedAt ?? null,
    rolledBackAt:
      input.action === 'rollback' ? at : task.rolledBackAt ?? null,
    lastEventAt: at,
    lastActorUserId: input.actorUserId,
    responseLatencyMs: computeLatencyMs(task, at, input.plan),
  };

  const event: CollaborativeTaskBehaviorEventRecord = {
    eventId: `${input.taskId}-${at}`,
    taskId: input.taskId,
    action: input.action,
    actorUserId: input.actorUserId,
    at,
    note: input.note ?? null,
    evidenceRefs: input.evidenceRefs,
    responseLatencyMs: updatedTask.responseLatencyMs ?? null,
    revisionCountAfter,
  };

  const tasks = input.plan.tasks.map((t) => (t.taskId === task.taskId ? updatedTask : t));
  const behaviorLog = [...(input.plan.behaviorLog ?? []), event];

  const dnaReasons: ApplyCollaborativeTaskEventResult['dnaReasons'] = [];
  const notifyUserIds = new Set<string>([task.assigneeUserId, input.actorUserId]);

  if (input.action === 'confirm') {
    dnaReasons.push('TASK_CHAIN_CONFIRMED');
  } else if (input.action === 'rollback') {
    dnaReasons.push('TASK_CHAIN_ROLLED_BACK');
  } else if (input.action === 'ack_timeout') {
    dnaReasons.push('TASK_CHAIN_TIMEOUT');
  }

  return {
    plan: {
      ...input.plan,
      tasks,
      behaviorLog,
    },
    task: updatedTask,
    event,
    dnaReasons,
    notifyUserIds: [...notifyUserIds],
  };
}

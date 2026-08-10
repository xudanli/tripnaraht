/**
 * Harness Hardening — Runtime Transition Contract。
 * 禁止隐式跨 Runtime 升级；显式 escalation / 新 taskId 才允许跃迁。
 */

import type { AgentTaskType } from '../agent-task-contract.types';

export type HarnessRuntimeId = AgentTaskType | 'FULL_PLANNING_SM' | 'LIGHTWEIGHT_QA';

export type RuntimeTransitionRequest = {
  from: HarnessRuntimeId;
  to: HarnessRuntimeId;
  /** 显式升格（CTA / explicit_planning_escalation / 新 task） */
  explicitEscalation?: boolean;
  /** 新开 task（taskId 变化） */
  newTaskId?: boolean;
  /** 用户强确认（Live→Adjust） */
  strongConfirmation?: boolean;
};

export type RuntimeTransitionResult =
  | { ok: true; rule: string }
  | { ok: false; reason: string; code: 'RUNTIME_PRIVILEGE_ESCALATION' };

/** 同 Runtime 或降级一律允许 */
function isSameOrDowngrade(from: HarnessRuntimeId, to: HarnessRuntimeId): boolean {
  if (from === to) return true;
  const rank: Record<string, number> = {
    LIGHTWEIGHT_QA: 0,
    GENERAL_RESEARCH: 1,
    TRIP_QUERY: 1,
    DECISION_SUPPORT: 2,
    LIVE_EXECUTION: 2,
    CONTENT_IMPORT: 2,
    TEAM_ACTION: 2,
    ITINERARY_ADJUST: 3,
    FULL_PLANNING_SM: 4,
  };
  return (rank[to] ?? 99) <= (rank[from] ?? 0);
}

/**
 * 允许的显式跃迁（须 explicitEscalation 或 newTaskId）。
 */
const EXPLICIT_EDGES: Array<{ from: HarnessRuntimeId; to: HarnessRuntimeId; need: 'escalation' | 'new_task' | 'strong' }> = [
  { from: 'TRIP_QUERY', to: 'ITINERARY_ADJUST', need: 'new_task' },
  { from: 'TRIP_QUERY', to: 'DECISION_SUPPORT', need: 'escalation' },
  { from: 'GENERAL_RESEARCH', to: 'ITINERARY_ADJUST', need: 'new_task' },
  { from: 'DECISION_SUPPORT', to: 'ITINERARY_ADJUST', need: 'new_task' },
  { from: 'LIVE_EXECUTION', to: 'ITINERARY_ADJUST', need: 'strong' },
  { from: 'ITINERARY_ADJUST', to: 'FULL_PLANNING_SM', need: 'escalation' },
  { from: 'TRIP_QUERY', to: 'FULL_PLANNING_SM', need: 'escalation' },
];

export function assertRuntimeTransition(
  req: RuntimeTransitionRequest,
): RuntimeTransitionResult {
  if (isSameOrDowngrade(req.from, req.to)) {
    return { ok: true, rule: 'same_or_downgrade' };
  }

  const edge = EXPLICIT_EDGES.find((e) => e.from === req.from && e.to === req.to);
  if (!edge) {
    return {
      ok: false,
      code: 'RUNTIME_PRIVILEGE_ESCALATION',
      reason: `runtime_transition_denied:${req.from}->${req.to}`,
    };
  }

  if (edge.need === 'new_task' && req.newTaskId !== true && req.explicitEscalation !== true) {
    return {
      ok: false,
      code: 'RUNTIME_PRIVILEGE_ESCALATION',
      reason: `runtime_transition_requires_new_task:${req.from}->${req.to}`,
    };
  }
  if (edge.need === 'escalation' && req.explicitEscalation !== true) {
    return {
      ok: false,
      code: 'RUNTIME_PRIVILEGE_ESCALATION',
      reason: `runtime_transition_requires_explicit_escalation:${req.from}->${req.to}`,
    };
  }
  if (
    edge.need === 'strong' &&
    req.strongConfirmation !== true &&
    req.explicitEscalation !== true
  ) {
    return {
      ok: false,
      code: 'RUNTIME_PRIVILEGE_ESCALATION',
      reason: `runtime_transition_requires_strong_confirmation:${req.from}->${req.to}`,
    };
  }

  return { ok: true, rule: `explicit_${edge.need}` };
}

/** 隐式升级检测：同 turn 内 from→to 且无 escalation 标记 */
export function detectSilentRuntimeUpgrade(req: RuntimeTransitionRequest): boolean {
  const r = assertRuntimeTransition(req);
  return r.ok === false && r.code === 'RUNTIME_PRIVILEGE_ESCALATION';
}

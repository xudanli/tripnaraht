/**
 * DSO 唯一可写权威 — 投影与本地 patch 收口。
 *
 * - DecisionState：业务权威（可写）
 * - OrchestratorState：兼容投影（经 projectToOrchestratorState 写入；业务字段勿在 phase 内直写）
 *
 * Kernel 版本化提交仍走 DecisionKernel.executeStateUpdate / StateManager.applyPhaseResult；
 * 本文件提供统一投影与「无 Kernel 时」的受控本地 patch。
 */

import type { DecisionState, DecisionStatePatch } from './decision-state.types';
import type { OrchestratorState } from '../../agent/interfaces/trip-plan.interface';
import { decisionStateToOrchestratorState } from './orchestrator-state-mapper';

export type DsoProjectionMeta = {
  at: string;
  dsoVersion?: number;
  authority: 'DSO';
  phase?: string;
};

/**
 * 将 DSO 投影到 OrchestratorState（唯一允许的 Object.assign 业务投影入口）。
 * decision_log / errors 等运行时累积字段由 mapper 从 base 保留。
 */
export function projectToOrchestratorState(
  dso: DecisionState,
  state: OrchestratorState,
  opts?: { phase?: string },
): Partial<OrchestratorState> {
  const derived = decisionStateToOrchestratorState(dso, state);
  Object.assign(state, derived);
  const meta = (state.metadata ?? {}) as Record<string, unknown>;
  const projection: DsoProjectionMeta = {
    at: new Date().toISOString(),
    dsoVersion: dso.systemState?.version,
    authority: 'DSO',
    ...(opts?.phase ? { phase: opts.phase } : {}),
  };
  meta.dso_projection = projection;
  state.metadata = meta as OrchestratorState['metadata'];
  state.metadata.last_updated_at = new Date().toISOString();
  return derived;
}

/**
 * 将 Kernel/merge 产出的新 DSO 写回同一引用（调用方持有的 decisionState 对象）。
 */
export function replaceDecisionStateInPlace(
  target: DecisionState,
  source: DecisionState,
): DecisionState {
  if (target === source) return target;
  for (const key of Object.keys(target as object)) {
    if (!(key in (source as object))) {
      delete (target as unknown as Record<string, unknown>)[key];
    }
  }
  Object.assign(target, source);
  return target;
}

/**
 * 无 Kernel 时的受控本地 patch（顶层字段）。
 * 不推进 version（避免与 Kernel 版本冲突）；只更新 lastUpdatedAt。
 * 有 Kernel 时应改用 executeStateUpdate / applyPhaseResult。
 */
export function applyDecisionStatePatchLocal(
  dso: DecisionState,
  patch: DecisionStatePatch,
): DecisionState {
  if (patch.userIntent !== undefined) {
    dso.userIntent = { ...(dso.userIntent ?? {}), ...patch.userIntent } as DecisionState['userIntent'];
  }
  if (patch.tripState !== undefined) {
    dso.tripState = { ...(dso.tripState ?? {}), ...patch.tripState } as DecisionState['tripState'];
  }
  if (patch.environmentState !== undefined) {
    dso.environmentState = {
      ...(dso.environmentState ?? {}),
      ...patch.environmentState,
    } as DecisionState['environmentState'];
  }
  if (patch.constraints !== undefined) dso.constraints = patch.constraints;
  if (patch.candidates !== undefined) dso.candidates = patch.candidates;
  if (patch.poiPlanning !== undefined) dso.poiPlanning = patch.poiPlanning;
  if (patch.research_data !== undefined) {
    dso.research_data = {
      ...(dso.research_data ?? {}),
      ...patch.research_data,
    };
  }
  if (patch.verification !== undefined) {
    dso.verification = {
      ...(dso.verification ?? {}),
      ...patch.verification,
    } as DecisionState['verification'];
  }
  if (patch.worldStateSummary !== undefined) {
    dso.worldStateSummary = patch.worldStateSummary;
  }
  if (patch.travelOntologyState !== undefined) {
    dso.travelOntologyState = patch.travelOntologyState;
  }
  if (patch.feedback !== undefined) {
    dso.feedback = { ...(dso.feedback ?? {}), ...patch.feedback };
  }
  if (patch.harnessRuntime !== undefined) {
    dso.harnessRuntime = {
      ...(dso.harnessRuntime ?? {}),
      ...patch.harnessRuntime,
    };
  }
  if (patch.cognition !== undefined) {
    dso.cognition = {
      ...(dso.cognition ?? {}),
      ...patch.cognition,
      markers: patch.cognition.markers ?? dso.cognition?.markers,
      updatedAt: patch.cognition.updatedAt ?? new Date().toISOString(),
    };
  }
  dso.systemState = {
    ...(dso.systemState ?? ({} as DecisionState['systemState'])),
    ...patch.systemState,
    lastUpdatedAt: new Date().toISOString(),
  };
  if (patch.requestId !== undefined) dso.requestId = patch.requestId;
  return dso;
}

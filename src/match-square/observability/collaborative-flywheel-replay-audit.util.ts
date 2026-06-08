/**
 * PRD 3.13 — Match Square 协同决策飞轮「预测 vs 观测」指纹对撞。
 * 模式对齐 OpsRealityAuditService.replayCompareSnapshot：稳定 JSON → SHA-256。
 */

import { createHash } from 'crypto';
import type { ActiveTripReplayFlywheelMetrics, ActiveTripReplayTimelineEntry } from '../types/active-trip-decision-replay.types';
import type {
  PreMatchDecisionBriefView,
  SceneRoleAnchorId,
} from '../types/recruitment-task-flywheel.types';

export const COLLAB_FLYWHEEL_PREDICTION_SCHEMA = 'collab-flywheel-prediction/v1' as const;
export const COLLAB_FLYWHEEL_OBSERVATION_SCHEMA = 'collab-flywheel-observation/v1' as const;
export const COLLAB_FLYWHEEL_AUDIT_SCHEMA = 'collab-flywheel-audit/v1' as const;
export const COLLAB_FLYWHEEL_REPLAY_CAPTURE_STUB = 'REPLAY_COMPARE_STUB' as const;

export type CollaborativeFlywheelPredictionExport = {
  schema: typeof COLLAB_FLYWHEEL_PREDICTION_SCHEMA;
  capturedAtIso: string;
  inTripCollaborationNoisePercent: number;
  suggestedSceneRoleAnchor: SceneRoleAnchorId | null;
  mitigatingTaskTemplateIds: string[];
  noiseDriverIds: string[];
};

export type CollaborativeFlywheelObservationExport = {
  schema: typeof COLLAB_FLYWHEEL_OBSERVATION_SCHEMA;
  capturedAtIso: string;
  flywheelMetrics: ActiveTripReplayFlywheelMetrics;
  routeRollbackProtests: number;
  routeRollbackProposals: number;
  highRiskTaskConfirms: number;
  timelineEventCount: number;
};

export interface CollaborativeFlywheelAuditAssertion {
  id: string;
  passed: boolean;
  message: string;
}

export interface CollaborativeFlywheelAuditReport {
  version: typeof COLLAB_FLYWHEEL_AUDIT_SCHEMA;
  predictionFingerprint: string;
  observationFingerprint: string;
  comparablePredictionFp: string;
  comparableObservationFp: string;
  match: boolean;
  signals: {
    noisePredictedHigh: boolean;
    noiseObservedHigh: boolean;
    noisePredictionValidated: boolean;
    roleAnchorPredicted: SceneRoleAnchorId | null;
    roleAnchorObserved: boolean;
    mitigatingTasksDispatched: boolean;
    confirmLatencyElevated: boolean;
    rollbackOrProtestObserved: boolean;
  };
  assertions: CollaborativeFlywheelAuditAssertion[];
  note?: string;
}

function stableStringify(value: unknown): string {
  if (value === null || typeof value !== 'object') {
    return JSON.stringify(value);
  }
  if (Array.isArray(value)) {
    return `[${value.map((x) => stableStringify(x)).join(',')}]`;
  }
  const obj = value as Record<string, unknown>;
  const keys = Object.keys(obj).sort();
  return `{${keys.map((k) => `${JSON.stringify(k)}:${stableStringify(obj[k])}`).join(',')}}`;
}

function sha256(payload: unknown): string {
  return createHash('sha256').update(stableStringify(payload)).digest('hex');
}

export function buildCollaborativeFlywheelPredictionExport(
  brief: PreMatchDecisionBriefView,
  capturedAtIso = new Date().toISOString(),
): CollaborativeFlywheelPredictionExport {
  return {
    schema: COLLAB_FLYWHEEL_PREDICTION_SCHEMA,
    capturedAtIso,
    inTripCollaborationNoisePercent: brief.inTripCollaborationNoisePercent,
    suggestedSceneRoleAnchor: brief.suggestedSceneRoleAnchor,
    mitigatingTaskTemplateIds: [...brief.mitigatingTaskTemplateIds].sort(),
    noiseDriverIds: brief.noiseDrivers.map((d) => d.factorId).sort(),
  };
}

export function computeCollaborativeFlywheelPredictionFingerprint(
  exportPayload: CollaborativeFlywheelPredictionExport,
): string {
  return sha256(exportPayload);
}

export function computeReplayComparablePredictionFingerprint(
  exportPayload: CollaborativeFlywheelPredictionExport,
): string {
  return sha256({
    schema: exportPayload.schema,
    capturedAtIso: COLLAB_FLYWHEEL_REPLAY_CAPTURE_STUB,
    inTripCollaborationNoisePercent: exportPayload.inTripCollaborationNoisePercent,
    suggestedSceneRoleAnchor: exportPayload.suggestedSceneRoleAnchor,
    mitigatingTaskTemplateIds: exportPayload.mitigatingTaskTemplateIds,
    noiseDriverIds: exportPayload.noiseDriverIds,
  });
}

export function buildCollaborativeFlywheelObservationExport(input: {
  flywheelMetrics: ActiveTripReplayFlywheelMetrics;
  timeline: ActiveTripReplayTimelineEntry[];
  capturedAtIso?: string;
}): CollaborativeFlywheelObservationExport {
  const routeRollbackProtests = input.timeline.filter(
    (e) => e.source === 'route_rollback' && e.action === 'protest',
  ).length;
  const routeRollbackProposals = input.timeline.filter(
    (e) => e.source === 'route_rollback' && e.action === 'propose',
  ).length;
  const highRiskTaskConfirms = input.timeline.filter(
    (e) =>
      e.source === 'collaborative_task' &&
      e.action === 'confirm' &&
      /涉水|DEM|卫星|安全/i.test(e.summaryZh),
  ).length;

  return {
    schema: COLLAB_FLYWHEEL_OBSERVATION_SCHEMA,
    capturedAtIso: input.capturedAtIso ?? new Date().toISOString(),
    flywheelMetrics: input.flywheelMetrics,
    routeRollbackProtests,
    routeRollbackProposals,
    highRiskTaskConfirms,
    timelineEventCount: input.timeline.length,
  };
}

export function computeCollaborativeFlywheelObservationFingerprint(
  exportPayload: CollaborativeFlywheelObservationExport,
): string {
  return sha256(exportPayload);
}

export function computeReplayComparableObservationFingerprint(
  exportPayload: CollaborativeFlywheelObservationExport,
): string {
  const m = exportPayload.flywheelMetrics;
  return sha256({
    schema: exportPayload.schema,
    capturedAtIso: COLLAB_FLYWHEEL_REPLAY_CAPTURE_STUB,
    collaborativeTaskEvents: m.collaborativeTaskEvents,
    routeRollbackEvents: m.routeRollbackEvents,
    vaultContractEvents: m.vaultContractEvents,
    taskConfirmLatencyMsAvg: m.taskConfirmLatencyMsAvg,
    taskRevisionTotal: m.taskRevisionTotal,
    routeRollbackProtests: exportPayload.routeRollbackProtests,
    routeRollbackProposals: exportPayload.routeRollbackProposals,
    highRiskTaskConfirms: exportPayload.highRiskTaskConfirms,
  });
}

export interface CompareCollaborativeFlywheelInput {
  prediction: PreMatchDecisionBriefView;
  observation: CollaborativeFlywheelObservationExport;
  dispatchedMitigatingTemplateIds?: string[];
  /** 默认 15 — PRD 3.13 冰岛兰格维格验收线 */
  noiseThresholdPercent?: number;
  /** 默认 30_000 ms — 高焦虑协作延迟印证 */
  confirmLatencyThresholdMs?: number;
}

/**
 * 将 Pre-match decisionBrief（预测）与行后 Replay 指标（观测）对撞，产出可审计报告。
 */
export function compareCollaborativeFlywheelFingerprints(
  input: CompareCollaborativeFlywheelInput,
): CollaborativeFlywheelAuditReport {
  const noiseThreshold = input.noiseThresholdPercent ?? 15;
  const latencyThreshold = input.confirmLatencyThresholdMs ?? 30_000;

  const predictionExport = buildCollaborativeFlywheelPredictionExport(input.prediction);
  const metrics = input.observation.flywheelMetrics;

  const noisePredictedHigh = predictionExport.inTripCollaborationNoisePercent >= noiseThreshold;
  const rollbackOrProtestObserved =
    input.observation.routeRollbackProtests > 0 ||
    metrics.taskRevisionTotal > 0 ||
    metrics.routeRollbackEvents > 0;
  const confirmLatencyElevated =
    metrics.taskConfirmLatencyMsAvg != null &&
    metrics.taskConfirmLatencyMsAvg >= latencyThreshold;
  const noiseObservedHigh = rollbackOrProtestObserved || confirmLatencyElevated;

  const noisePredictionValidated = noisePredictedHigh && noiseObservedHigh;

  const roleAnchorPredicted = predictionExport.suggestedSceneRoleAnchor;
  const roleAnchorObserved =
    roleAnchorPredicted === 'blind_box_follower'
      ? rollbackOrProtestObserved || confirmLatencyElevated
      : roleAnchorPredicted != null
        ? rollbackOrProtestObserved || metrics.collaborativeTaskEvents > 0
        : true;

  const mitigatingIds = predictionExport.mitigatingTaskTemplateIds;
  const dispatched = input.dispatchedMitigatingTemplateIds ?? [];
  const mitigatingTasksDispatched =
    mitigatingIds.length === 0 ||
    mitigatingIds.every((id) => dispatched.includes(id));

  const assertions: CollaborativeFlywheelAuditAssertion[] = [
    {
      id: 'noise_predicted_high',
      passed: noisePredictedHigh,
      message: `预测协作噪音 ≥ ${noiseThreshold}%（实际 ${predictionExport.inTripCollaborationNoisePercent}%）`,
    },
    {
      id: 'noise_observed_high',
      passed: noiseObservedHigh,
      message: rollbackOrProtestObserved
        ? '观测到 Rollback/异议/任务修订，协作摩擦被捕获'
        : confirmLatencyElevated
          ? `任务确认延迟 ≥ ${latencyThreshold}ms`
          : '未观测到足够协作摩擦信号（Rollback/异议/高延迟）',
    },
    {
      id: 'noise_prediction_validated',
      passed: noisePredictionValidated,
      message: noisePredictionValidated
        ? '预测的高协作噪音被行中行为印证'
        : '预测与观测未对齐（噪音预警未被行为证实，或预测偏低）',
    },
    {
      id: 'role_anchor_blind_box',
      passed: roleAnchorPredicted !== 'blind_box_follower' || roleAnchorObserved,
      message:
        roleAnchorPredicted === 'blind_box_follower'
          ? '盲盒跟从者角色锚定被行中异议/延迟行为支持'
          : '角色锚定非 blind_box_follower 或已通过',
    },
    {
      id: 'mitigating_tasks_dispatched',
      passed: mitigatingTasksDispatched,
      message: mitigatingTasksDispatched
        ? '建议对冲任务已派发至 Trip 飞轮'
        : `缺少对冲任务派发：期望 ${mitigatingIds.join(', ')}，实际 ${dispatched.join(', ')}`,
    },
    {
      id: 'rollback_or_protest_captured',
      passed: rollbackOrProtestObserved,
      message: rollbackOrProtestObserved
        ? '行中 Rollback 决策环已捕获异议/修订'
        : '未捕获 Rollback/异议事件',
    },
  ];

  const match = assertions.every((a) => a.passed);

  return {
    version: COLLAB_FLYWHEEL_AUDIT_SCHEMA,
    predictionFingerprint: computeCollaborativeFlywheelPredictionFingerprint(predictionExport),
    observationFingerprint: computeCollaborativeFlywheelObservationFingerprint(input.observation),
    comparablePredictionFp: computeReplayComparablePredictionFingerprint(predictionExport),
    comparableObservationFp: computeReplayComparableObservationFingerprint(input.observation),
    match,
    signals: {
      noisePredictedHigh,
      noiseObservedHigh,
      noisePredictionValidated,
      roleAnchorPredicted,
      roleAnchorObserved,
      mitigatingTasksDispatched,
      confirmLatencyElevated,
      rollbackOrProtestObserved,
    },
    assertions,
    note: match
      ? '协同决策飞轮预测-观测指纹对撞通过'
      : '部分断言未通过，见 assertions[]',
  };
}

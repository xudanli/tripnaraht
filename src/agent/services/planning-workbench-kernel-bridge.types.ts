/**
 * Planning Workbench ↔ Decision Kernel 桥接类型
 */

import type { DecisionState } from '../../decision/kernel/decision-state.types';
import type { GateResultLike } from '../../decision/kernel/interfaces/phase-executor.interface';
import type { DecisionLogEntry } from '../../trips/decision/shared/decision-result.types';
import type { GateStatus, PlanState } from '../../skills/plan/shared/plan-state.types';
import type { PlanningWorkbenchRequest } from './planning-workbench-agent.service';

/** 规划工作台 Kernel 接入模式 */
export type PlanningWorkbenchKernelMode = 'legacy' | 'shadow' | 'native';

export interface PlanningWorkbenchKernelBridgeInput {
  request: PlanningWorkbenchRequest;
  planState: PlanState;
  tripRunId?: string | null;
  requestId?: string;
}

export interface KernelShadowDiff {
  legacyStatus: GateStatus['status'];
  kernelStatus: GateStatus['status'];
  legacyGuardianTriggered: boolean;
  kernelGuardianRan: boolean;
  diverged: boolean;
  notes: string[];
}

export interface PlanningWorkbenchKernelMetadata {
  mode: PlanningWorkbenchKernelMode;
  requestId: string;
  kernelGateResult?: GateResultLike['gate_result'];
  shadowDiff?: KernelShadowDiff;
  guardianDecisionSummary?: string;
  allLogs?: DecisionLogEntry[];
  /** Kernel GATE_EVAL 主导冲突 */
  dominantCid?: string;
  /** decision_os_audit_report 快照（供 metadata 回放） */
  decisionOsAudit?: Record<string, unknown>;
  appliedAt: string;
}

export interface PlanningWorkbenchKernelGateOutcome {
  gateStatus: GateStatus;
  confirmations?: string[];
  metadata: PlanningWorkbenchKernelMetadata;
  dso?: DecisionState;
}

/** 单个骨架方案的 Kernel 门控评估增量 */
export interface SkeletonOptionGateEvalDelta {
  optionId: string;
  optionName?: string;
  gateStatus: GateStatus['status'];
  kernelGateResult: GateResultLike['gate_result'];
  violationCount: number;
  violationTypes: string[];
  topReasons: string[];
  /** 主导冲突 ID（L3 证据契约） */
  dominantCid?: string;
  /** 结构化违规证据（cid + detail + slack/limit，供 L3 审计） */
  l3Evidence?: Array<{
    cid: string;
    detail: string;
    severity?: string;
    slack?: number;
    limit?: number;
  }>;
  guardiansAllowed?: boolean;
  expectedUtility?: number;
}

/** compare 动作：多方案并行 Kernel 门控评估结果 */
export interface CompareKernelGateEvalResult {
  optionDeltas: SkeletonOptionGateEvalDelta[];
  /** 按门控严格度排序后的最优 optionId */
  recommendedByGate?: string;
  /** 推荐方案的 dominant_cid */
  recommendedDominantCid?: string;
  /** Kernel 推荐是否与 LLM compare 推荐不一致 */
  divergesFromLlmRecommendation?: boolean;
  llmRecommendedOptionId?: string;
  appliedAt: string;
  /** compare 路径审计快照 */
  decisionOsAudit?: Record<string, unknown>;
}

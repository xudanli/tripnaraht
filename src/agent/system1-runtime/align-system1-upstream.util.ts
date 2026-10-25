/**
 * 上游对齐：UnifiedIntent + AgentTaskContract → System1TaskFrame。
 *
 * 分层（不合并成一个类型）：
 * - UnifiedIntentDecision = 语义意图冻结（CONSULT / ASSESS_IMPACT / …）
 * - AgentTaskContract     = Harness 能力与规划准入
 * - System1TaskFrame      = System1 证据运行时决策框
 *
 * 优先级：
 * 1) 话术硬信号（WRITE / Live Feasibility / 住宿状态 / 软推荐对比）
 * 2) Contract.taskType 填缺口
 * 3) UnifiedIntent 填充 intent / topic / mutationPolicy
 */

import type { AgentTaskContractV1 } from '../harness/agent-task-contract.types';
import type { UnifiedIntentDecision } from '../intent/unified-intent.types';
import { compileSystem1TaskFrame } from './compile-system1-task-frame.util';
import type { System1TaskFrame } from './system1-runtime.types';

export function compileSystem1TaskFrameFromUpstream(input: {
  message: string;
  tripId?: string | null;
  lifecycle?: string | null;
  contract?: AgentTaskContractV1 | null;
  unifiedIntentDecision?: UnifiedIntentDecision | null;
  /** 兼容旧调用：仅传语义意图字符串 */
  unifiedIntent?: string | null;
  creOperation?: string | null;
  actionKind?: string | null;
  taskType?: string | null;
}): System1TaskFrame {
  const decision = input.unifiedIntentDecision ?? null;
  const frame = compileSystem1TaskFrame({
    message: input.message,
    tripId: input.tripId,
    lifecycle: input.lifecycle,
    contract: input.contract,
    unifiedIntent: decision?.semanticIntent ?? input.unifiedIntent,
    creOperation: input.creOperation,
    actionKind: input.actionKind,
    taskType: input.taskType,
  });

  /** Intent 对 WRITE 的二次确认：LOCAL_EDIT / GLOBAL_PLAN + 非 READ_ONLY → 保持 WRITE */
  if (
    decision &&
    (decision.semanticIntent === 'LOCAL_EDIT' ||
      decision.semanticIntent === 'GLOBAL_PLAN') &&
    decision.mutationPolicy !== 'READ_ONLY' &&
    frame.questionType !== 'FEASIBILITY'
  ) {
    frame.questionType = 'WRITE_MUTATION';
    frame.requestedAction = 'WRITE';
    frame.riskLevel = 'HIGH';
    frame.intent = decision.semanticIntent;
  }

  /** ASSESS_IMPACT + 实况需求 → 可行性框（若话术未命中硬信号但 Intent 已判评估） */
  if (
    decision?.semanticIntent === 'ASSESS_IMPACT' &&
    decision.requiresRealityData &&
    frame.questionType !== 'WRITE_MUTATION' &&
    frame.questionType !== 'RECOMMEND'
  ) {
    if (frame.questionType === 'KNOWLEDGE_QA' || frame.questionType === 'EXPLAIN') {
      frame.questionType = 'FEASIBILITY';
      frame.requestedAction = 'ASSESS';
      frame.riskLevel = 'HIGH';
      frame.lifecycle = 'TRAVELING';
    }
    frame.intent = 'ASSESS_IMPACT';
  }

  if (decision) {
    frame.intent = decision.semanticIntent;
    frame.sourceSignals.unifiedIntent = decision.semanticIntent;
    frame.sourceSignals.intentTopic = decision.topic;
    frame.sourceSignals.intentRouteClass = decision.routeClass;
    frame.sourceSignals.mutationPolicy = decision.mutationPolicy;
  }

  if (input.contract) {
    frame.sourceSignals.taskType = input.contract.taskType;
    frame.sourceSignals.contractAuthority = input.contract.authority;
    frame.sourceSignals.allowFullPlanning = input.contract.allowFullPlanning;
  }

  return frame;
}

/** Trace / Eval 用：三模型对齐快照 */
export function projectSystem1UpstreamAlignment(input: {
  frame: System1TaskFrame;
  contract?: AgentTaskContractV1 | null;
  unifiedIntentDecision?: UnifiedIntentDecision | null;
}): Record<string, unknown> {
  return {
    task_frame: {
      intent: input.frame.intent,
      question_type: input.frame.questionType,
      requested_action: input.frame.requestedAction,
      risk_level: input.frame.riskLevel,
      target: input.frame.target ?? null,
    },
    contract: input.contract
      ? {
          task_type: input.contract.taskType,
          authority: input.contract.authority,
          allow_full_planning: input.contract.allowFullPlanning,
        }
      : null,
    unified_intent: input.unifiedIntentDecision
      ? {
          semantic_intent: input.unifiedIntentDecision.semanticIntent,
          topic: input.unifiedIntentDecision.topic,
          route_class: input.unifiedIntentDecision.routeClass,
          mutation_policy: input.unifiedIntentDecision.mutationPolicy,
          requires_reality_data: input.unifiedIntentDecision.requiresRealityData,
        }
      : null,
  };
}

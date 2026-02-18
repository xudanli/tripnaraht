/**
 * Decision Meta 推断（Kernel 逻辑下沉）
 *
 * Phase 2.2: 策略逻辑迁入 Kernel
 * 职责：从结构化输入推断 mode、phase、strategy
 *
 * 判断标准：删除 Agent 后 Kernel 能否运行 → 本模块为 Kernel 提供决策元数据推断能力
 *
 * 参考: docs/DECISION_OS_ARCHITECTURE.md 风险 1
 */

import type {
  DecisionMeta,
  DecisionMetaMode,
  DecisionMetaPhase,
  DecisionMetaStrategy,
} from './decision-state.types';

/** 推断输入（与 OrchestratorState 解耦，Kernel 可独立运行） */
export interface DecisionMetaInput {
  currentStep?: string;
  planVersion?: number;
  failureRiskPredictions?: Array<{ riskLevel?: string }>;
  complianceRiskWarnings?: Array<{ level?: string }>;
  riskTolerance?: string;
}

/** OrchestrationStep → DecisionMetaPhase 映射 */
const PHASE_MAP: Record<string, DecisionMetaPhase> = {
  INTAKE: 'INTAKE',
  STATE_UPDATE: 'INTAKE',
  RESEARCH: 'INTAKE',
  GATE_EVAL: 'INTAKE',
  CONTEXT_BUILD: 'INTAKE',
  PLAN_GEN: 'PLAN',
  OPTIMIZE: 'PLAN',
  VERIFY: 'VERIFY',
  COMPLIANCE: 'VERIFY',
  REPAIR: 'VERIFY',
  NARRATE: 'VERIFY',
  FEEDBACK: 'VERIFY',
  DONE: 'VERIFY',
  FAILED: 'VERIFY',
  TIMEOUT: 'VERIFY',
  HALLUCINATION_DETECTION: 'INTAKE',
};

/** risk_tolerance → strategy 映射 */
const STRATEGY_MAP: Record<string, DecisionMetaStrategy> = {
  LOW: 'CONSERVATIVE',
  MEDIUM: 'BALANCED',
  HIGH: 'AGGRESSIVE',
};

/**
 * 从结构化输入推断 DecisionMeta
 * Kernel 拥有推断逻辑，Mapper/Conductor 仅负责提取输入
 */
export function inferDecisionMeta(input: DecisionMetaInput): Partial<DecisionMeta> {
  const phase = inferPhase(input.currentStep);
  const mode = inferMode(input);
  const strategy = inferStrategy(input.riskTolerance);
  return { mode, phase, strategy };
}

function inferPhase(step?: string): DecisionMetaPhase | undefined {
  if (!step) return undefined;
  return PHASE_MAP[step] ?? 'INTAKE';
}

function inferMode(input: DecisionMetaInput): DecisionMetaMode | undefined {
  const hasHighRisk =
    input.failureRiskPredictions?.some((p) => p.riskLevel === 'HIGH') ??
    false;
  const hasCriticalCompliance =
    input.complianceRiskWarnings?.some((w) => w.level === 'CRITICAL') ?? false;
  if (hasHighRisk || hasCriticalCompliance) {
    return 'EMERGENCY';
  }
  if (input.currentStep === 'REPAIR' || (input.planVersion && input.planVersion > 0)) {
    return 'ADJUST';
  }
  return 'PLAN';
}

function inferStrategy(tolerance?: string): DecisionMetaStrategy | undefined {
  if (!tolerance) return undefined;
  return STRATEGY_MAP[tolerance];
}

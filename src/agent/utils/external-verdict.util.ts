// src/agent/utils/external-verdict.util.ts
/**
 * 对外四字 Verdict（ALLOW / REJECT / ADJUST / CLARIFY）推导。
 * 合同：`docs/decision/VERDICT_GATE_POLICY_MAPPING.md`
 */

import type { GateResult, GateResultStatus, OrchestratorState } from '../interfaces/trip-plan.interface';

export type ExternalVerdict = 'ALLOW' | 'REJECT' | 'ADJUST' | 'CLARIFY';

export type PolicyAction = 'ALLOW' | 'REJECT' | 'ADJUST' | 'CLARIFY';

export interface DeriveExternalVerdictInput {
  gateResult?: GateResult | null;
  /** INTAKE：HARD 缺口 + 澄清问题且尚未产生 Gate 结果 */
  intakeClarifyShortCircuit?: boolean;
  /** Roll / `RLIntegrationService.preDecision`；仅在与 Gate 合并时使用 */
  policyAction?: PolicyAction | null;
  /** 编排是否成功（无 Gate/Policy 信号时的兜底） */
  orchestrationSuccess?: boolean;
  /** 与 `OrchestrationResult.result.needsUserConfirmation` 对齐 */
  needsUserConfirmation?: boolean;
}

function gateStatusToExternal(status: GateResultStatus): ExternalVerdict {
  switch (status) {
    case 'ALLOW':
      return 'ALLOW';
    case 'BLOCK':
      return 'REJECT';
    case 'ADJUST_REQUIRED':
      return 'ADJUST';
    case 'NEED_USER_CONFIRM':
      return 'CLARIFY';
    default:
      return 'REJECT';
  }
}

/**
 * Gate 优先于 Policy；与映射表「一对多」节一致。
 */
function mergeGateWithPolicy(
  fromGate: ExternalVerdict,
  policy?: PolicyAction | null,
): ExternalVerdict {
  if (!policy) {
    return fromGate;
  }
  if (fromGate === 'REJECT') {
    return 'REJECT';
  }
  if (fromGate === 'CLARIFY') {
    return 'CLARIFY';
  }
  if (fromGate === 'ALLOW') {
    if (policy === 'REJECT') {
      return 'REJECT';
    }
    if (policy === 'CLARIFY') {
      return 'CLARIFY';
    }
    if (policy === 'ADJUST') {
      return 'ADJUST';
    }
    return 'ALLOW';
  }
  if (fromGate === 'ADJUST') {
    if (policy === 'CLARIFY') {
      return 'CLARIFY';
    }
    return 'ADJUST';
  }
  return fromGate;
}

/**
 * HARD 缺口 + 澄清问题且尚无 `gate_result` 时视为 INTAKE 澄清短路。
 */
export function shouldIntakeClarifyShortCircuit(state: OrchestratorState | undefined): boolean {
  if (!state) {
    return false;
  }
  const hard = state.gaps?.some((g) => g.severity === 'HARD') ?? false;
  const hasQuestions = (state.clarification_questions?.length ?? 0) > 0;
  return hard && hasQuestions && !state.gate_result;
}

/**
 * 从 Gate / Policy / 编排结果推导唯一对外 Verdict。
 */
export function deriveExternalVerdict(input: DeriveExternalVerdictInput): ExternalVerdict {
  if (input.intakeClarifyShortCircuit) {
    return 'CLARIFY';
  }

  const gr = input.gateResult?.gate_result;
  if (gr !== undefined && gr !== null) {
    const fromGate = gateStatusToExternal(gr);
    return mergeGateWithPolicy(fromGate, input.policyAction ?? undefined);
  }

  if (input.policyAction) {
    return input.policyAction;
  }

  if (input.needsUserConfirmation) {
    return 'CLARIFY';
  }

  if (input.orchestrationSuccess) {
    return 'ALLOW';
  }

  return 'REJECT';
}

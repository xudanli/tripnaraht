/**
 * Learning Signal Registry — Learning 只输出 signal，禁止修改正式 Policy。
 * 冻结原则：Learning ≠ Policy Mutation。
 */

export const LEARNING_SIGNAL_SCHEMA = 'nara.learning_signal@v1' as const;

export type LearningSignalKind =
  | 'ARRIVAL_BIAS'
  | 'FATIGUE_BIAS'
  | 'RISK_BIAS'
  | 'DECISION_REPLAY_DELTA'
  | 'GENERIC_OBSERVATION';

/** 明确禁止被 Learning 写入的目标 */
export type PolicyMutationTarget =
  | 'CONTRACT'
  | 'RULE'
  | 'GATE'
  | 'SOLVER_WEIGHT'
  | 'RUNTIME'
  | 'CAPABILITY_MATRIX';

export type LearningSignalV1 = {
  schemaId: typeof LEARNING_SIGNAL_SCHEMA;
  version: 1;
  signalId: string;
  kind: LearningSignalKind;
  tripId?: string;
  createdAt: string;
  summaryZh: string;
  payload: Record<string, unknown>;
  /** 永远 false：不得改 Policy */
  mutatesPolicy: false;
  allowedUse: 'OBSERVABILITY' | 'CONTEXT_HINT' | 'REPLAY_COMPARE';
};

export type LearningPolicyGuardResult =
  | { ok: true }
  | { ok: false; code: 'LEARNING_POLICY_MUTATION_DENIED'; reason: string; target: PolicyMutationTarget };

const DENIED_TARGETS: readonly PolicyMutationTarget[] = [
  'CONTRACT',
  'RULE',
  'GATE',
  'SOLVER_WEIGHT',
  'RUNTIME',
  'CAPABILITY_MATRIX',
] as const;

/** Learning ≠ Policy Mutation */
export function assertLearningDoesNotMutatePolicy(
  target: PolicyMutationTarget,
): LearningPolicyGuardResult {
  if (DENIED_TARGETS.includes(target)) {
    return {
      ok: false,
      code: 'LEARNING_POLICY_MUTATION_DENIED',
      reason: `learning_neq_policy_mutation:cannot_mutate_${target.toLowerCase()}`,
      target,
    };
  }
  return { ok: true };
}

export function assertLearningDoesNotMutatePolicyOrThrow(
  target: PolicyMutationTarget,
): void {
  const r = assertLearningDoesNotMutatePolicy(target);
  if (r.ok === false) {
    throw new Error(`[Learning≠Policy] ${r.code}: ${r.reason}`);
  }
}

export function emitLearningSignal(input: {
  kind: LearningSignalKind;
  summaryZh: string;
  tripId?: string;
  payload?: Record<string, unknown>;
  allowedUse?: LearningSignalV1['allowedUse'];
  signalId?: string;
}): LearningSignalV1 {
  /** 发射前自检：payload 不得声明 mutate_* */
  const payload = { ...(input.payload ?? {}) };
  for (const k of Object.keys(payload)) {
    if (/^mutate_/i.test(k) || k === 'policy_patch' || k === 'solver_weight_delta') {
      throw new Error(
        `[Learning≠Policy] LEARNING_SIGNAL_FORBIDDEN_KEY: ${k}`,
      );
    }
  }
  return {
    schemaId: LEARNING_SIGNAL_SCHEMA,
    version: 1,
    signalId: input.signalId ?? `sig_${Date.now()}`,
    kind: input.kind,
    tripId: input.tripId,
    createdAt: new Date().toISOString(),
    summaryZh: input.summaryZh,
    payload,
    mutatesPolicy: false,
    allowedUse: input.allowedUse ?? 'OBSERVABILITY',
  };
}

export type LearningSignalRegistryEntry = {
  kind: LearningSignalKind;
  descriptionZh: string;
};

export const LEARNING_SIGNAL_REGISTRY: readonly LearningSignalRegistryEntry[] = [
  { kind: 'ARRIVAL_BIAS', descriptionZh: '到达时间偏差信号' },
  { kind: 'FATIGUE_BIAS', descriptionZh: '疲劳偏差信号' },
  { kind: 'RISK_BIAS', descriptionZh: '风险偏差信号' },
  { kind: 'DECISION_REPLAY_DELTA', descriptionZh: '决策重放差异信号' },
  { kind: 'GENERIC_OBSERVATION', descriptionZh: '通用观察信号' },
] as const;

export function projectLearningSignalForObservability(
  s: LearningSignalV1,
): Record<string, unknown> {
  return {
    schema_id: s.schemaId,
    signal_id: s.signalId,
    kind: s.kind,
    mutates_policy: s.mutatesPolicy,
    allowed_use: s.allowedUse,
    summary_zh: s.summaryZh,
  };
}

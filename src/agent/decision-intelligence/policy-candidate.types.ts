/**
 * PolicyCandidate — 候选策略（非 Production）。
 * 晋升前不得改 Hard Constraint / Gate BLOCK / 安全规则。
 */

export const POLICY_CANDIDATE_SCHEMA = 'nara.policy_candidate@v1' as const;

export type PolicyCandidateStatus =
  | 'DRAFT'
  | 'SHADOW'
  | 'REPLAYED'
  | 'BENCHMARKED'
  | 'APPROVED'
  | 'VERSIONED'
  | 'CANARY'
  | 'REJECTED';

export type PolicyCandidateV1 = {
  schemaId: typeof POLICY_CANDIDATE_SCHEMA;
  version: 1;
  candidateId: string;
  labelZh: string;
  status: PolicyCandidateStatus;
  /** 仅影子侧可调参数；禁止含 gate/hard/safety 变更 */
  shadowAdjustments: Record<string, unknown>;
  sourceSignalIds: string[];
  createdAt: string;
  touchesHardConstraint: false;
  touchesGateBlock: false;
  touchesSafetyRule: false;
};

export function createPolicyCandidate(input: {
  candidateId?: string;
  labelZh: string;
  shadowAdjustments?: Record<string, unknown>;
  sourceSignalIds?: string[];
}): PolicyCandidateV1 {
  const adj = { ...(input.shadowAdjustments ?? {}) };
  for (const k of Object.keys(adj)) {
    if (/gate|hard_constraint|safety|solver_weight|contract/i.test(k)) {
      throw new Error(
        `[PolicyCandidate] forbidden_adjustment_key:${k} (Hard Constraint/Gate/Safety 禁 Learning 写入)`,
      );
    }
  }
  return {
    schemaId: POLICY_CANDIDATE_SCHEMA,
    version: 1,
    candidateId: input.candidateId ?? `cand_${Date.now()}`,
    labelZh: input.labelZh,
    status: 'DRAFT',
    shadowAdjustments: adj,
    sourceSignalIds: [...(input.sourceSignalIds ?? [])],
    createdAt: new Date().toISOString(),
    touchesHardConstraint: false,
    touchesGateBlock: false,
    touchesSafetyRule: false,
  };
}

/**
 * Promotion Pipeline：Signal → Shadow → Replay → Benchmark → Approval → Version → Canary。
 * Hard Constraint / Gate BLOCK / 安全规则禁止由 Learning 自动修改或自动晋升进 Production Policy。
 */

import type { PolicyCandidateV1, PolicyCandidateStatus } from './policy-candidate.types';
import { assertLearningCannotMutateHardConstraint } from './hard-constraint-guard.util';
import type { BenchmarkSuiteResult } from './benchmark-l1-l2-l3.util';
import type { CandidateVsProductionProof } from './compare-candidate-vs-production.util';

export const PROMOTION_STAGES = [
  'SIGNAL',
  'SHADOW',
  'REPLAY',
  'BENCHMARK',
  'APPROVAL',
  'VERSION',
  'CANARY',
] as const;

export type PromotionStage = (typeof PROMOTION_STAGES)[number];

export type PromotionPipelineState = {
  candidateId: string;
  stage: PromotionStage;
  candidateStatus: PolicyCandidateStatus;
  history: Array<{ stage: PromotionStage; at: string; noteZh?: string }>;
  blocked?: { reason: string; stage: PromotionStage };
};

const STAGE_TO_STATUS: Record<PromotionStage, PolicyCandidateStatus> = {
  SIGNAL: 'DRAFT',
  SHADOW: 'SHADOW',
  REPLAY: 'REPLAYED',
  BENCHMARK: 'BENCHMARKED',
  APPROVAL: 'APPROVED',
  VERSION: 'VERSIONED',
  CANARY: 'CANARY',
};

export function startPromotionPipeline(
  candidate: PolicyCandidateV1,
): PromotionPipelineState {
  return {
    candidateId: candidate.candidateId,
    stage: 'SIGNAL',
    candidateStatus: 'DRAFT',
    history: [{ stage: 'SIGNAL', at: new Date().toISOString(), noteZh: '从 Learning Signal 创建' }],
  };
}

export function advancePromotionStage(input: {
  state: PromotionPipelineState;
  candidate: PolicyCandidateV1;
  to: PromotionStage;
  /** BENCHMARK 阶段需要套件结果 */
  benchmark?: BenchmarkSuiteResult;
  /** APPROVAL 必须人工 */
  humanApproved?: boolean;
  /** 相对 Production 的证明（DoD） */
  proof?: CandidateVsProductionProof;
  noteZh?: string;
}): { state: PromotionPipelineState; candidate: PolicyCandidateV1 } {
  for (const kind of ['HARD_CONSTRAINT', 'GATE_BLOCK', 'SAFETY_RULE'] as const) {
    const g = assertLearningCannotMutateHardConstraint(kind);
    if (g.ok) {
      throw new Error('hard_constraint_guard_misconfigured');
    }
  }

  const fromIdx = PROMOTION_STAGES.indexOf(input.state.stage);
  const toIdx = PROMOTION_STAGES.indexOf(input.to);
  if (toIdx !== fromIdx + 1) {
    return {
      state: {
        ...input.state,
        blocked: {
          stage: input.to,
          reason: `promotion_must_advance_sequentially:${input.state.stage}->${input.to}`,
        },
      },
      candidate: input.candidate,
    };
  }

  if (input.to === 'BENCHMARK') {
    if (!input.benchmark || input.benchmark.passRate < 0.7) {
      return {
        state: {
          ...input.state,
          blocked: {
            stage: 'BENCHMARK',
            reason: 'benchmark_pass_rate_below_threshold',
          },
        },
        candidate: { ...input.candidate, status: 'REJECTED' },
      };
    }
  }

  if (input.to === 'APPROVAL') {
    if (input.humanApproved !== true) {
      return {
        state: {
          ...input.state,
          blocked: {
            stage: 'APPROVAL',
            reason: 'human_approval_required',
          },
        },
        candidate: input.candidate,
      };
    }
    if (!input.proof?.candidateBetterThanProduction) {
      return {
        state: {
          ...input.state,
          blocked: {
            stage: 'APPROVAL',
            reason: 'candidate_not_proven_better_than_production',
          },
        },
        candidate: { ...input.candidate, status: 'REJECTED' },
      };
    }
  }

  const nextStatus = STAGE_TO_STATUS[input.to];
  const state: PromotionPipelineState = {
    candidateId: input.candidate.candidateId,
    stage: input.to,
    candidateStatus: nextStatus,
    history: [
      ...input.state.history,
      {
        stage: input.to,
        at: new Date().toISOString(),
        noteZh: input.noteZh,
      },
    ],
  };

  return {
    state,
    candidate: { ...input.candidate, status: nextStatus },
  };
}

/**
 * unified-explainability@v1 → 结构化 counterfactual（「若选 base 会怎样」可质疑接口）。
 */

import type { DecisionPlanVerdictRow } from '../../../decision/kernel/decision-verdict.util';
import type { UnifiedExplainabilityEnvelopeV1, UnifiedGroundedFactorV1 } from './unified-explainability.types';

export const UNIFIED_COUNTERFACTUAL_CONTRACT_VERSION = 'unified-counterfactual@v1' as const;

export type UnifiedCounterfactualEntryV1 = {
  alt_plan_id: string;
  status: 'rejected' | 'infeasible' | 'chosen';
  question_zh: string;
  answer_zh: string;
  rejection_reasons: string[];
  grounded_factor_ids: string[];
  reason_codes: string[];
  evidence_refs: string[];
  utility_delta_vs_chosen?: number;
  feasibility_probability?: number;
  monte_carlo?: {
    used: boolean;
    total_samples?: number;
    samples_for_alt?: number;
  };
};

export type UnifiedCounterfactualExplainV1 = {
  contract_version: typeof UNIFIED_COUNTERFACTUAL_CONTRACT_VERSION;
  request_id: string;
  trace_id: string;
  generated_at: string;
  chosen_plan_id: string;
  counterfactuals: UnifiedCounterfactualEntryV1[];
  integrity: {
    anchored_to_envelope: boolean;
    source: 'optimization_projection' | 'grounded_factors_only';
    drift_violations: string[];
  };
};

const REASON_CODE_RE = /\b([A-Z][A-Z0-9_]{2,})\b/g;

function extractReasonCodesFromText(text: string): string[] {
  const codes = new Set<string>();
  for (const m of text.matchAll(REASON_CODE_RE)) {
    const c = m[1];
    if (/^(HARD|SOFT|WORLD|ROAD|WEATHER|DEM|SPATIAL|READINESS|PACE)/.test(c) || c.includes('_')) {
      codes.add(c.replace(/^HARD:/, '').replace(/^SOFT:/, ''));
    }
  }
  return [...codes];
}

function mapFactorsToPlan(
  planId: string,
  reasons: string[],
  factors: UnifiedGroundedFactorV1[],
): UnifiedGroundedFactorV1[] {
  const reasonBlob = reasons.join(' ').toLowerCase();
  return factors.filter((f) => {
    if (f.factor_id.includes(planId)) return true;
    const blob = `${f.rejection_reason ?? ''} ${f.factor_id}`.toLowerCase();
    if (reasonBlob && blob && reasonBlob.split(/\W+/).some((tok) => tok.length > 3 && blob.includes(tok))) {
      return true;
    }
    return reasons.some((r) => blob.includes(r.toLowerCase().slice(0, 12)));
  });
}

function collectTraceAnchors(
  envelope: UnifiedExplainabilityEnvelopeV1,
  factorIds: string[],
): { reason_codes: string[]; evidence_refs: string[] } {
  const factorSet = new Set(factorIds);
  const matchedFactors = envelope.grounded_factors.filter((f) => factorSet.has(f.factor_id));
  const logIndices = new Set(matchedFactors.flatMap((f) => f.anchor_log_indices));
  const reason_codes = new Set<string>();
  const evidence_refs = new Set<string>();
  for (const idx of logIndices) {
    const entry = envelope.decision_trace[idx];
    if (!entry) continue;
    for (const c of entry.reason_codes ?? []) reason_codes.add(c);
    for (const e of entry.evidence_refs ?? []) evidence_refs.add(e);
  }
  for (const f of matchedFactors) {
    for (const e of f.anchor_evidence_refs ?? []) evidence_refs.add(e);
  }
  for (const r of matchedFactors.flatMap((f) => extractReasonCodesFromText(f.rejection_reason ?? ''))) {
    reason_codes.add(r);
  }
  return { reason_codes: [...reason_codes], evidence_refs: [...evidence_refs] };
}

function buildQuestionZh(planId: string, status: DecisionPlanVerdictRow['status']): string {
  if (status === 'infeasible') {
    return `若坚持选择方案「${planId}」（原 base / 不可行备选），行程能否执行？`;
  }
  return `若改选方案「${planId}」而非当前推荐方案，决策会如何变化？`;
}

function buildAnswerZh(
  plan: DecisionPlanVerdictRow,
  chosenId: string,
  anchors: { reason_codes: string[]; evidence_refs: string[] },
): string {
  const reasons = plan.rejection_reasons ?? [];
  if (plan.status === 'infeasible') {
    return `方案「${plan.id}」不可行：${reasons.join('；') || '硬约束未满足'}。当前推荐「${chosenId}」已规避上述约束。证据：${anchors.evidence_refs.join(', ') || '见 decision_trace'}。`;
  }
  const delta =
    plan.utility_delta_vs_chosen !== undefined
      ? `预期效用较推荐方案低 ${Math.abs(plan.utility_delta_vs_chosen).toFixed(2)}。`
      : '';
  return `方案「${plan.id}」被弃选：${reasons.join('；') || '综合效用低于推荐方案'}。${delta}`.trim();
}

function rowToCounterfactual(
  envelope: UnifiedExplainabilityEnvelopeV1,
  plan: DecisionPlanVerdictRow,
  chosenId: string,
  mcSummary?: { used: boolean; total_samples?: number; samples_per_candidate?: Record<string, number> },
): UnifiedCounterfactualEntryV1 {
  const reasons = plan.rejection_reasons ?? [];
  const matchedFactors = mapFactorsToPlan(plan.id, reasons, envelope.grounded_factors);
  const factorIds = matchedFactors.map((f) => f.factor_id);
  const anchors = collectTraceAnchors(envelope, factorIds.length > 0 ? factorIds : envelope.grounded_factors.map((f) => f.factor_id));

  return {
    alt_plan_id: plan.id,
    status: plan.status === 'infeasible' ? 'infeasible' : 'rejected',
    question_zh: buildQuestionZh(plan.id, plan.status),
    answer_zh: buildAnswerZh(plan, chosenId, anchors),
    rejection_reasons: reasons,
    grounded_factor_ids: factorIds,
    reason_codes: anchors.reason_codes,
    evidence_refs: anchors.evidence_refs,
    ...(plan.utility_delta_vs_chosen !== undefined
      ? { utility_delta_vs_chosen: plan.utility_delta_vs_chosen }
      : {}),
    ...(plan.feasibility_probability !== undefined
      ? { feasibility_probability: plan.feasibility_probability }
      : {}),
    ...(mcSummary
      ? {
          monte_carlo: {
            used: mcSummary.used,
            total_samples: mcSummary.total_samples,
            samples_for_alt: mcSummary.samples_per_candidate?.[plan.id],
          },
        }
      : {}),
  };
}

export function buildUnifiedCounterfactualExplain(params: {
  envelope: UnifiedExplainabilityEnvelopeV1;
  altPlanId?: string;
  generatedAt?: string;
}): UnifiedCounterfactualExplainV1 | undefined {
  const verdict = params.envelope.optimization_projection?.decision_verdict;
  const chosenId = verdict?.chosen_plan_id;
  if (!chosenId) {
    const rejectedFactors = params.envelope.grounded_factors.filter((f) => f.rejection_reason);
    if (rejectedFactors.length === 0) return undefined;
  }

  const rejected = verdict?.rejected_plans ?? [];
  let targets = rejected;
  if (params.altPlanId) {
    targets = rejected.filter((p) => p.id === params.altPlanId);
    if (targets.length === 0) return undefined;
  }

  const mc = verdict?.monte_carlo_summary;
  const counterfactuals = targets.map((p) =>
    rowToCounterfactual(params.envelope, p, chosenId ?? 'unknown', mc),
  );

  return {
    contract_version: UNIFIED_COUNTERFACTUAL_CONTRACT_VERSION,
    request_id: params.envelope.request_id,
    trace_id: params.envelope.trace_id,
    generated_at: params.generatedAt ?? new Date().toISOString(),
    chosen_plan_id: chosenId ?? 'unknown',
    counterfactuals,
    integrity: {
      anchored_to_envelope: true,
      source: verdict ? 'optimization_projection' : 'grounded_factors_only',
      drift_violations: params.envelope.integrity.drift_violations ?? [],
    },
  };
}

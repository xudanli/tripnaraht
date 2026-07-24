/**
 * unified-explainability@v1 → 训练侧 ExplainableOutput 确定性投影（无 LLM）。
 */

import type { ExplainableOutput } from '../../../agent/training/interfaces/product.interface';
import type { UnifiedExplainabilityEnvelopeV1 } from './unified-explainability.types';
import { projectExplainForHumanFromEnvelope } from './project-explain-for-human-from-envelope.util';

export function projectExplainableOutputFromEnvelope(
  envelope: UnifiedExplainabilityEnvelopeV1,
  modelVersion: string,
): ExplainableOutput {
  const human = projectExplainForHumanFromEnvelope(envelope);

  const decisionProcessSteps = envelope.decision_trace.map((entry, index) => ({
    step_name: `${entry.persona}:${entry.decision_stage}`,
    decision: `${entry.action} — ${entry.explanation}`,
    reasoning: entry.reason_codes.length
      ? `reasonCodes: ${entry.reason_codes.join(', ')}`
      : entry.explanation,
    confidence: entry.action === 'REJECT' ? 0.95 : entry.action === 'ALLOW' ? 0.85 : 0.75,
  }));

  const evidenceChain = envelope.grounded_factors.flatMap((factor) =>
    factor.anchor_evidence_refs.map((evidenceId) => ({
      evidence_id: evidenceId,
      evidence_type: factor.kind,
      evidence_content: factor.rejection_reason ?? factor.factor_id,
      relevance: factor.severity === 'BLOCK' ? 0.95 : factor.severity === 'WARN' ? 0.75 : 0.5,
    })),
  );

  const dedupedEvidence = new Map<string, ExplainableOutput['evidence_chain'][number]>();
  for (const item of evidenceChain) {
    if (!dedupedEvidence.has(item.evidence_id)) {
      dedupedEvidence.set(item.evidence_id, item);
    }
  }

  const nodes = envelope.decision_trace.map((entry, index) => ({
    id: `node_${index}`,
    label: `${entry.persona}/${entry.action}`,
    actor: entry.persona,
    decision: entry.explanation,
    confidence: entry.action === 'REJECT' ? 0.95 : 0.8,
    reason_codes: entry.reason_codes,
    evidence_refs: entry.evidence_refs,
  }));

  return {
    summary: human.summary,
    decision_process: { steps: decisionProcessSteps },
    evidence_chain: [...dedupedEvidence.values()],
    visualization: {
      type: 'DECISION_TREE',
      data: {
        nodes,
        edges: envelope.decision_trace.slice(1).map((_, index) => ({
          from: `node_${index}`,
          to: `node_${index + 1}`,
        })),
        integrity: envelope.integrity,
        optimization_chosen_plan_id:
          envelope.optimization_projection?.decision_verdict?.chosen_plan_id,
      },
    },
    metadata: {
      model_version: modelVersion,
      trace_id: envelope.trace_id,
      generated_at: envelope.generated_at,
      unified_contract_version: envelope.contract_version,
    },
  };
}

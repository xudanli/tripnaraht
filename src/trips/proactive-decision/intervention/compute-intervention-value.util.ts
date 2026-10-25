/**
 * PD-6 — RFC Intervention Value:
 * Improvement × Confidence × Actionability − Attention Cost
 */

export const PROACTIVE_INTERVENTION_VALUE_SCHEMA =
  'nara.proactive_intervention_value@v1' as const;

export type ProactiveInterventionValueV1 = {
  schemaId: typeof PROACTIVE_INTERVENTION_VALUE_SCHEMA;
  version: 1;
  improvement: number;
  confidence: number;
  actionability: number;
  attentionCost: number;
  /** RFC formula result */
  interventionValue: number;
  /**
   * Traceability to intervention-intelligence freezeInterventionCandidate.interruptValue
   * (weighted blend). Not identical; both recorded for audit.
   */
  freezeInterruptValueApprox?: number;
  threshold: number;
  passesThreshold: boolean;
};

function clamp01(n: number): number {
  if (!Number.isFinite(n)) return 0;
  return Math.max(0, Math.min(1, n));
}

export function resolveProactiveInterventionThreshold(
  env: NodeJS.ProcessEnv = process.env,
): number {
  const raw = env.PROACTIVE_INTERVENTION_THRESHOLD?.trim();
  if (!raw) return 0.08;
  const n = Number(raw);
  if (!Number.isFinite(n)) return 0.08;
  return clamp01(n);
}

/**
 * Compute RFC Intervention Value and threshold gate.
 */
export function computeProactiveInterventionValue(input: {
  improvement: number;
  confidence: number;
  actionability: number;
  attentionCost: number;
  threshold?: number;
}): ProactiveInterventionValueV1 {
  const improvement = clamp01(input.improvement);
  const confidence = clamp01(input.confidence);
  const actionability = clamp01(input.actionability);
  const attentionCost = clamp01(input.attentionCost);
  const threshold = clamp01(
    input.threshold ?? resolveProactiveInterventionThreshold(),
  );

  const interventionValue =
    improvement * confidence * actionability - attentionCost;

  /** Approx of freezeInterventionCandidate blend for cross-audit */
  const freezeInterruptValueApprox =
    0.22 * improvement +
    0.22 * Math.min(1, improvement + 0.2) +
    0.22 * actionability +
    0.14 * confidence +
    0.1 * 0.5 -
    attentionCost * 0.4;

  return {
    schemaId: PROACTIVE_INTERVENTION_VALUE_SCHEMA,
    version: 1,
    improvement,
    confidence,
    actionability,
    attentionCost,
    interventionValue,
    freezeInterruptValueApprox,
    threshold,
    passesThreshold: interventionValue > threshold,
  };
}

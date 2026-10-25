/**
 * Phase 4 P2 — L2 Interrupt only for High Value Intervention.
 * Defaults: IV > 0.2 ∧ Confidence > 0.9 ∧ Actionable.
 */

export const PROACTIVE_L2_HIGH_VALUE_GATE_SCHEMA =
  'nara.proactive_l2_high_value_gate@v1' as const;

export type ProactiveL2HighValueGateV1 = {
  schemaId: typeof PROACTIVE_L2_HIGH_VALUE_GATE_SCHEMA;
  version: 1;
  /** Intervention Value floor (exclusive lower bound in product copy as ">") */
  minInterventionValue: number;
  minConfidence: number;
  /** Actionability floor — "Actionable" */
  minActionability: number;
};

export const DEFAULT_PROACTIVE_L2_HIGH_VALUE_GATE: ProactiveL2HighValueGateV1 = {
  schemaId: PROACTIVE_L2_HIGH_VALUE_GATE_SCHEMA,
  version: 1,
  minInterventionValue: 0.2,
  minConfidence: 0.9,
  minActionability: 0.7,
};

function parseEnvNumber(
  raw: string | undefined,
  fallback: number,
): number {
  if (raw == null || raw.trim() === '') return fallback;
  const n = Number(raw);
  return Number.isFinite(n) ? n : fallback;
}

/**
 * Env:
 * - PROACTIVE_L2_MIN_INTERVENTION_VALUE (default 0.2)
 * - PROACTIVE_L2_MIN_CONFIDENCE (default 0.9)
 * - PROACTIVE_L2_MIN_ACTIONABILITY (default 0.7)
 */
export function resolveProactiveL2HighValueGate(
  env: NodeJS.ProcessEnv = process.env,
): ProactiveL2HighValueGateV1 {
  return {
    schemaId: PROACTIVE_L2_HIGH_VALUE_GATE_SCHEMA,
    version: 1,
    minInterventionValue: parseEnvNumber(
      env.PROACTIVE_L2_MIN_INTERVENTION_VALUE,
      DEFAULT_PROACTIVE_L2_HIGH_VALUE_GATE.minInterventionValue,
    ),
    minConfidence: parseEnvNumber(
      env.PROACTIVE_L2_MIN_CONFIDENCE,
      DEFAULT_PROACTIVE_L2_HIGH_VALUE_GATE.minConfidence,
    ),
    minActionability: parseEnvNumber(
      env.PROACTIVE_L2_MIN_ACTIONABILITY,
      DEFAULT_PROACTIVE_L2_HIGH_VALUE_GATE.minActionability,
    ),
  };
}

export type ProactiveL2HighValueVerdict = {
  ok: boolean;
  gate: ProactiveL2HighValueGateV1;
  interventionValue: number;
  confidence: number;
  actionability: number;
  reasonsZh: string[];
};

/**
 * High Value = IV > min ∧ Confidence > min ∧ Actionability >= min.
 */
export function evaluateProactiveL2HighValue(input: {
  interventionValue: number;
  confidence: number;
  actionability: number;
  gate?: ProactiveL2HighValueGateV1;
  env?: NodeJS.ProcessEnv;
}): ProactiveL2HighValueVerdict {
  const gate =
    input.gate ?? resolveProactiveL2HighValueGate(input.env ?? process.env);
  const reasonsZh: string[] = [];

  if (!(input.interventionValue > gate.minInterventionValue)) {
    reasonsZh.push(
      `Intervention Value 未过 High-Value（${input.interventionValue} ≤ ${gate.minInterventionValue}）`,
    );
  }
  if (!(input.confidence > gate.minConfidence)) {
    reasonsZh.push(
      `Confidence 未过 High-Value（${input.confidence} ≤ ${gate.minConfidence}）`,
    );
  }
  if (!(input.actionability >= gate.minActionability)) {
    reasonsZh.push(
      `Actionability 不足（${input.actionability} < ${gate.minActionability}）`,
    );
  }

  return {
    ok: reasonsZh.length === 0,
    gate,
    interventionValue: input.interventionValue,
    confidence: input.confidence,
    actionability: input.actionability,
    reasonsZh,
  };
}

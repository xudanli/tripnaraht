/**
 * P-ECO-Closure-8 — Audit of reasoning-about-reasoning (depth, consistency, regress risk).
 */

import type { SelfModel } from './self-model.types';

export interface RecursiveReasoningAssessment {
  reasoningDepth: number;
  semanticConsistency: number;
  selfReferenceRisk: number;
  recursiveStability: number;
}

function clamp01(x: number): number {
  return Math.min(1, Math.max(0, x));
}

/**
 * Second-order stability sketch: high when meta-beliefs align with world beliefs and depth is modest.
 */
export function evaluateRecursiveReasoning(input: {
  selfModel: SelfModel;
  metaPolicyDrift: number;
  causalSemanticMutation: number;
}): RecursiveReasoningAssessment {
  const worldAvg =
    Object.values(input.selfModel.beliefsAboutWorld).reduce((a, b) => a + b, 0) /
    Math.max(1, Object.keys(input.selfModel.beliefsAboutWorld).length);
  const metaAvg =
    Object.values(input.selfModel.beliefsAboutBeliefs).reduce((a, b) => a + b, 0) /
    Math.max(1, Object.keys(input.selfModel.beliefsAboutBeliefs).length);

  const semanticConsistency = clamp01(1 - Math.abs(worldAvg - metaAvg));

  const depthNorm = clamp01(input.selfModel.reflectiveDepth / 10);
  const selfReferenceRisk = clamp01(
    0.45 * depthNorm +
      0.35 * input.causalSemanticMutation +
      0.2 * input.metaPolicyDrift,
  );

  const recursiveStability = clamp01(
    semanticConsistency * (1 - selfReferenceRisk) * input.selfModel.confidenceInReasoning,
  );

  return {
    reasoningDepth: input.selfModel.reflectiveDepth,
    semanticConsistency,
    selfReferenceRisk,
    recursiveStability,
  };
}

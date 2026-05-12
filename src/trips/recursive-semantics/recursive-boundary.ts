/**
 * P-ECO-Closure-8 — Stop infinite regress when reflective depth or self-reference risk exceeds budget.
 */

export const DEFAULT_REFLECTIVE_MAX_DEPTH = 6;

export interface RecursiveBoundaryResult {
  freezeReflection: boolean;
  maxDepth: number;
  currentDepth: number;
  reasons: string[];
}

function clamp(x: number, lo: number, hi: number): number {
  return Math.min(hi, Math.max(lo, x));
}

export function evaluateRecursiveBoundary(input: {
  reflectiveDepth: number;
  selfReferenceRisk: number;
  maxDepth?: number;
  selfReferenceRiskThreshold?: number;
}): RecursiveBoundaryResult {
  const maxDepth = input.maxDepth ?? DEFAULT_REFLECTIVE_MAX_DEPTH;
  const riskThreshold = input.selfReferenceRiskThreshold ?? 0.92;
  const currentDepth = clamp(input.reflectiveDepth, 1, maxDepth + 4);
  const reasons: string[] = [];
  let freeze = false;

  if (currentDepth > maxDepth) {
    freeze = true;
    reasons.push(`reflectiveDepth>${maxDepth}`);
  }
  if (input.selfReferenceRisk >= riskThreshold) {
    freeze = true;
    reasons.push(`selfReferenceRisk>=${riskThreshold}`);
  }

  return {
    freezeReflection: freeze,
    maxDepth,
    currentDepth,
    reasons,
  };
}

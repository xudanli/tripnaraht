import type { HarnessCase, HarnessResult, Verdict } from "./harness.types";

/** verdict → 用于 RiskΔ 的标称期望风险（无 ground-truth 时的占位） */
const VERDICT_NOMINAL_RISK: Record<Verdict, number> = {
  ALLOW: 0.2,
  REJECT: 0.92,
  ADJUST: 0.65,
  CLARIFY: 0.47,
};

export function nominalRiskForExpectedVerdict(v: Verdict): number {
  return VERDICT_NOMINAL_RISK[v];
}

/**
 * 无 riskScoreHint 时，从 query 粗推断本地 Kernel 风险（便于 basic case 不写 hint）
 */
export function inferRiskScoreHintFromQuery(query: string): number | undefined {
  const q = query.trim();
  // 0.6 → ADJUST 且满足常见 maxRisk 0.6 上限
  if (/暴雨|户外(?!.*室内)|高风险|滑坡|极端天气|danger|storm/i.test(q)) return 0.6;
  if (/预算|什么时候|几号|日期|去哪|CLARIFY|澄清/i.test(q)) return 0.47;
  if (/拒绝|违法|禁止|REJECT/i.test(q)) return 0.85;
  return undefined;
}

export function expectedNominalRisk(c: HarnessCase): number {
  if (typeof c.expectedRisk === "number") return c.expectedRisk;
  return nominalRiskForExpectedVerdict(c.expected.verdict);
}

export function buildHarnessResult(
  c: HarnessCase,
  actual: HarnessResult["actual"],
): HarnessResult {
  const errors: string[] = [];

  if (actual.verdict !== c.expected.verdict) {
    errors.push(
      `Verdict mismatch: expected ${c.expected.verdict}, got ${actual.verdict}`,
    );
  }

  if (
    c.expected.maxRisk !== undefined &&
    actual.riskScore > c.expected.maxRisk + 1e-9
  ) {
    errors.push(
      `Risk too high: ${actual.riskScore.toFixed(3)} > ${c.expected.maxRisk}`,
    );
  }

  const expR = expectedNominalRisk(c);
  const riskDelta = actual.riskScore - expR;

  return {
    id: c.id,
    expected: c.expected,
    actual,
    pass: errors.length === 0,
    errors,
    riskDelta,
  };
}

export function averageRiskError(results: HarnessResult[]): number {
  if (results.length === 0) return 0;
  const sum = results.reduce((acc, r) => acc + Math.abs(r.riskDelta ?? 0), 0);
  return sum / results.length;
}

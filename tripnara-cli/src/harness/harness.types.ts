export type Verdict = "ALLOW" | "REJECT" | "ADJUST" | "CLARIFY";

export interface HarnessCase {
  id: string;
  query: string;
  /** 本地 mock 行程天数，默认 2 */
  days?: number;
  expected: {
    verdict: Verdict;
    maxRisk?: number;
  };
  /** 本地 Planner/Kernel 专用：显式风险，覆盖 query 启发式 */
  riskScoreHint?: number;
  /** 期望的标称风险（用于 RiskΔ；缺省则由 verdict 推导） */
  expectedRisk?: number;
  /** 说明性文案（评测报告、verbose） */
  reason?: string;
}

export interface HarnessActual {
  verdict: Verdict;
  riskScore: number;
  reason?: string;
}

export interface HarnessResult {
  id: string;
  expected: HarnessCase["expected"];
  actual: HarnessActual;
  pass: boolean;
  errors: string[];
  /** actual - expectedNominalRisk（expectedRisk 或 verdict 标称） */
  riskDelta?: number;
}

export type HarnessVariant = "local" | "api";

export interface HarnessRunOptions {
  mode: HarnessVariant;
  apiBase?: string;
  apiUserId?: string;
  apiTripId?: string;
  apiToken?: string;
  maxSeconds?: number;
}

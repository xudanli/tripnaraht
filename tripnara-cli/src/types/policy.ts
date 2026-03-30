export type Verdict = "ALLOW" | "REJECT" | "ADJUST" | "CLARIFY";

export interface PolicyDecision {
  verdict: Verdict;
  riskScore: number;
  reason: string;
}

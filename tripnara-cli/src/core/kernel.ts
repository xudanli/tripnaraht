export type Verdict = "ALLOW" | "REJECT" | "ADJUST" | "CLARIFY";

export interface DecisionInput {
  itinerary: unknown;
  riskScoreHint?: number;
}

export class DecisionKernel {
  evaluate(input: DecisionInput): {
    verdict: Verdict;
    riskScore: number;
    reason: string;
  } {
    const riskScore =
      typeof input.riskScoreHint === "number"
        ? Math.max(0, Math.min(1, input.riskScoreHint))
        : 0.32;

    if (riskScore >= 0.8) {
      return { verdict: "REJECT", riskScore, reason: "Critical risk detected" };
    }
    if (riskScore >= 0.6) {
      return { verdict: "ADJUST", riskScore, reason: "Elevated risk detected" };
    }
    if (riskScore >= 0.45) {
      return { verdict: "CLARIFY", riskScore, reason: "Need user confirmation" };
    }
    return { verdict: "ALLOW", riskScore, reason: "Safe plan" };
  }
}

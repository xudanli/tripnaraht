import { DecisionKernel } from "./kernel";

export class PolicyAdapter {
  private readonly kernel = new DecisionKernel();

  infer(input: { riskScore: number }) {
    return this.kernel.evaluate({
      itinerary: { source: "policy-only" },
      riskScoreHint: input.riskScore,
    });
  }
}

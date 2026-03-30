import { DecisionKernel } from "./kernel";

export class Planner {
  private readonly kernel = new DecisionKernel();

  async plan(input: { query: string; days: number; riskScoreHint?: number }) {
    const itinerary = {
      query: input.query,
      days: input.days,
      plan: Array.from({ length: input.days }).map((_, idx) => ({
        day: idx + 1,
        activity: idx % 2 === 0 ? "City Walk" : "Food Tour",
      })),
    };

    const decision = this.kernel.evaluate({
      itinerary,
      riskScoreHint: input.riskScoreHint,
    });

    return { itinerary, decision };
  }
}

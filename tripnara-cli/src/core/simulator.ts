import { DecisionKernel } from "./kernel";

export class Simulator {
  private readonly kernel = new DecisionKernel();

  run(input: { query: string; scenarios: number }) {
    const results = Array.from({ length: input.scenarios }).map((_, i) => {
      const risk = Math.min(1, 0.2 + i * 0.15);
      return this.kernel.evaluate({
        itinerary: { query: input.query, scenario: i + 1 },
        riskScoreHint: risk,
      });
    });
    return {
      query: input.query,
      scenarios: results.length,
      results,
    };
  }
}

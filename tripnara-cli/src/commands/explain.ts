import { Command } from "commander";
import { DecisionKernel } from "../core/kernel";

export function registerExplainCommand(program: Command): void {
  program
    .command("explain")
    .description("Explain verdict from a risk score")
    .requiredOption("--risk-score <score>", "risk score 0..1")
    .action((options: { riskScore: string }) => {
      const kernel = new DecisionKernel();
      const result = kernel.evaluate({
        itinerary: { source: "explain" },
        riskScoreHint: Number(options.riskScore),
      });
      console.log(
        JSON.stringify(
          {
            verdict: result.verdict,
            reason: result.reason,
            riskScore: result.riskScore,
            trace: ["kernel.evaluate", "policy-adapter(mock)"],
          },
          null,
          2,
        ),
      );
    });
}

import { Command } from "commander";
import { PolicyAdapter } from "../core/policy";

export function registerPolicyCommand(program: Command): void {
  program
    .command("policy")
    .description("Run policy inference demo")
    .requiredOption("--risk-score <score>", "risk score 0..1")
    .action((options: { riskScore: string }) => {
      const adapter = new PolicyAdapter();
      const result = adapter.infer({ riskScore: Number(options.riskScore) });
      console.log(JSON.stringify(result, null, 2));
    });
}

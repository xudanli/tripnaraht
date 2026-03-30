import { Command } from "commander";
import { Planner } from "../core/planner";
import { logger } from "../infra/logger";

export function registerPlanCommand(program: Command): void {
  program
    .command("plan")
    .description("Generate itinerary")
    .argument("<query>", "travel query")
    .option("--days <days>", "number of days", "2")
    .option("--risk-score <score>", "risk score hint 0..1")
    .option("--debug", "enable debug logs", false)
    .action(async (query: string, options: { days: string; riskScore?: string; debug?: boolean }) => {
      logger.info("Planning trip...");
      try {
        const planner = new Planner();
        const result = await planner.plan({
          query,
          days: Number(options.days),
          riskScoreHint:
            options.riskScore !== undefined ? Number(options.riskScore) : undefined,
        });
        logger.info("Planning done");
        if (options.debug) {
          logger.debug(`query=${query}, days=${options.days}`, true);
        }
        console.log(JSON.stringify(result, null, 2));
      } catch (error) {
        logger.error("Planning failed");
        logger.error(String(error));
        process.exitCode = 1;
      }
    });
}

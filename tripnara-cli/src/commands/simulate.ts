import { Command } from "commander";
import { callRouteAndRun } from "../core/api-client";
import { Simulator } from "../core/simulator";
import { getConfig } from "../infra/config";
import { toCliError } from "../infra/errors";

export function registerSimulateCommand(program: Command): void {
  program
    .command("simulate")
    .description("Run policy simulation scenarios")
    .argument("<query>", "travel query")
    .option("--scenarios <n>", "scenario count", "3")
    .option("--api", "call backend route_and_run API", false)
    .option("--api-base <url>", "API base URL (or TRIPNARA_API_BASE)")
    .option("--token <token>", "bearer token (or TRIPNARA_API_TOKEN)")
    .option("--user-id <id>", "user id for API mode", "cli-user")
    .option("--trip-id <id>", "trip id for API mode")
    .option("--max-seconds <n>", "server max_seconds (API)", "20")
    .action(async (query: string, options: {
      scenarios: string;
      api?: boolean;
      apiBase?: string;
      token?: string;
      userId: string;
      tripId?: string;
      maxSeconds: string;
    }) => {
      if (options.api) {
        try {
          const config = getConfig();
          const apiBase = options.apiBase ?? config.apiBase;
          if (!apiBase) {
            console.error("API mode requires --api-base or TRIPNARA_API_BASE");
            process.exitCode = 1;
            return;
          }
          const maxSeconds = Math.max(
            1,
            Math.min(20, Math.floor(Number(options.maxSeconds) || 20)),
          );
          const scenarioCount = Math.max(1, Number(options.scenarios) || 1);
          const results = [];
          for (let i = 0; i < scenarioCount; i += 1) {
            const payload: Record<string, unknown> = {
              request_id: `simulate-${i + 1}-${Date.now()}`,
              user_id: options.userId,
              trip_id: options.tripId,
              message: `${query} (scenario ${i + 1})`,
              options: {
                dry_run: true,
                max_steps: 8,
                max_seconds: maxSeconds,
              },
              conversation_context: { recent_messages: [] },
            };
            const apiResult = await callRouteAndRun(
              apiBase,
              options.token ?? config.apiToken,
              payload,
            );
            results.push({ scenario: i + 1, result: apiResult });
          }
          console.log(
            JSON.stringify(
              {
                mode: "api",
                query,
                scenarios: scenarioCount,
                results,
              },
              null,
              2,
            ),
          );
          return;
        } catch (error) {
          const cliError = toCliError(error);
          console.error(`${cliError.code}: ${cliError.message}`);
          process.exitCode = 1;
          return;
        }
      }
      const simulator = new Simulator();
      const result = simulator.run({
        query,
        scenarios: Number(options.scenarios),
      });
      console.log(JSON.stringify(result, null, 2));
    });
}

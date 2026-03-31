import { Command } from "commander";
import { callRouteAndRun } from "../core/api-client";
import { PolicyAdapter } from "../core/policy";
import { getConfig } from "../infra/config";
import { toCliError } from "../infra/errors";

export function registerPolicyCommand(program: Command): void {
  program
    .command("policy")
    .description("Run policy inference demo")
    .requiredOption("--risk-score <score>", "risk score 0..1")
    .option("--api", "call backend route_and_run API", false)
    .option("--api-base <url>", "API base URL (or TRIPNARA_API_BASE)")
    .option("--token <token>", "bearer token (or TRIPNARA_API_TOKEN)")
    .option("--user-id <id>", "user id for API mode", "cli-user")
    .option("--trip-id <id>", "trip id for API mode")
    .option("--max-seconds <n>", "server max_seconds (API)", "20")
    .option("--query <text>", "query text for API mode")
    .action(async (options: {
      riskScore: string;
      api?: boolean;
      apiBase?: string;
      token?: string;
      userId: string;
      tripId?: string;
      maxSeconds: string;
      query?: string;
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
          const payload: Record<string, unknown> = {
            request_id: `policy-${Date.now()}`,
            user_id: options.userId,
            trip_id: options.tripId,
            message:
              options.query ??
              `Policy inference request, risk score hint: ${options.riskScore}`,
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
          console.log(
            JSON.stringify(
              {
                mode: "api",
                riskScore: Number(options.riskScore),
                result: apiResult,
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
      const adapter = new PolicyAdapter();
      const result = adapter.infer({ riskScore: Number(options.riskScore) });
      console.log(JSON.stringify(result, null, 2));
    });
}

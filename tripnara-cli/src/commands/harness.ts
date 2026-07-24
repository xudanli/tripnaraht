import { Command } from "commander";
import { loadCases } from "../harness/harness.loader";
import { HarnessRunner, variantFromString } from "../harness/harness.runner";
import { printReport, printAbReport } from "../harness/harness.reporter";
import { replayFromArgs } from "../harness/harness.replay";
import type { HarnessResult, HarnessRunOptions, HarnessVariant } from "../harness/harness.types";
import { getConfig } from "../infra/config";
import { registerHarnessTraceCommands } from "./harness-trace";
import { registerHarnessShadowGraderCommands } from "./harness-shadow-grader";
import { registerHarnessKernelHardCommands } from "./harness-kernel-hard";
import { registerHarnessBadcaseCommands } from "./harness-badcase";
import { registerHarnessQualityCommands } from "./harness-quality";
import { registerHarnessShadowHarnessCommands, registerHarnessLlmRoutingCommands } from "./harness-shadow-harness";
import { registerHarnessCostCommands } from "./harness-cost";

function collectVariant(value: string, prev: string[]): string[] {
  return prev.concat([value]);
}

function resolveHarnessOpts(
  api: boolean,
  apiBase: string | undefined,
  config: ReturnType<typeof getConfig>,
  userId: string | undefined,
  tripId: string | undefined,
  token: string | undefined,
  maxSeconds: number,
): HarnessRunOptions {
  const base = apiBase ?? config.apiBase;
  const mode: HarnessVariant = api ? "api" : "local";
  return {
    mode,
    apiBase: base,
    apiUserId: userId,
    apiTripId: tripId,
    apiToken: token ?? config.apiToken,
    maxSeconds,
  };
}

export function registerHarnessCommand(program: Command): void {
  const harness = program
    .command("harness")
    .description("Run verdict/risk harness cases (local Planner or API route_and_run)");

  registerHarnessTraceCommands(harness);
  registerHarnessShadowGraderCommands(harness);
  registerHarnessKernelHardCommands(harness);
  registerHarnessBadcaseCommands(harness);
  registerHarnessQualityCommands(harness);
  registerHarnessShadowHarnessCommands(harness);
  registerHarnessLlmRoutingCommands(harness);
  registerHarnessCostCommands(harness);

  harness
    .command("run")
    .argument("<file>", "path to cases JSON array")
    .option("--verbose", "detailed per-case output", false)
    .option("--api", "call backend route_and_run instead of local Planner", false)
    .option("--api-base <url>", "API base URL")
    .option("--user-id <id>", "user id (API mode)", "harness-user")
    .option("--trip-id <id>", "trip id (API mode)")
    .option("--token <token>", "bearer token")
    .option("--max-seconds <n>", "server max_seconds (API)", "20")
    .action(
      async (
        file: string,
        opts: {
          verbose?: boolean;
          api?: boolean;
          apiBase?: string;
          userId?: string;
          tripId?: string;
          token?: string;
          maxSeconds: string;
        },
      ) => {
        const config = getConfig();
        const cases = loadCases(file);
        const runner = new HarnessRunner();
        const maxSec = Math.max(1, Math.min(20, Math.floor(Number(opts.maxSeconds) || 20)));
        const runOpts = resolveHarnessOpts(
          !!opts.api,
          opts.apiBase,
          config,
          opts.userId,
          opts.tripId,
          opts.token,
          maxSec,
        );
        if (runOpts.mode === "api" && !runOpts.apiBase) {
          console.error("API mode requires --api-base or TRIPNARA_API_BASE in .env");
          process.exitCode = 1;
          return;
        }
        const results = await runner.run(cases, runOpts);
        printReport(results, { verbose: !!opts.verbose, cases });
      },
    );

  harness
    .command("replay")
    .description("Re-run a single case by id")
    .requiredOption("--case-id <id>", "case id, e.g. case_1")
    .option("--file <path>", "cases JSON file", "cases/basic.json")
    .option("--api", "use API", false)
    .option("--api-base <url>", "API base URL")
    .option("--user-id <id>", "user id (API)", "harness-user")
    .option("--trip-id <id>", "trip id (API)")
    .option("--token <token>", "bearer token")
    .option("--max-seconds <n>", "server max_seconds (API)", "20")
    .action(
      async (opts: {
        caseId: string;
        file: string;
        api?: boolean;
        apiBase?: string;
        userId?: string;
        tripId?: string;
        token?: string;
        maxSeconds: string;
      }) => {
        const config = getConfig();
        const maxSec = Math.max(1, Math.min(20, Math.floor(Number(opts.maxSeconds) || 20)));
        const mode: HarnessVariant = opts.api ? "api" : "local";
        const apiBase = opts.apiBase ?? config.apiBase;
        if (mode === "api" && !apiBase) {
          console.error("API mode requires --api-base or TRIPNARA_API_BASE");
          process.exitCode = 1;
          return;
        }
        await replayFromArgs({
          caseId: opts.caseId,
          file: opts.file,
          mode,
          apiBase,
          apiUserId: opts.userId,
          apiTripId: opts.tripId,
          apiToken: opts.token ?? config.apiToken,
          maxSeconds: maxSec,
        });
      },
    );

  harness
    .command("ab")
    .description("Compare two harness variants (e.g. local Planner vs API)")
    .argument("<file>", "cases JSON")
    .option(
      "--variant <name>",
      "variant label: local | api (repeat twice for A/B)",
      collectVariant,
      [] as string[],
    )
    .option("--api-base <url>", "API base URL (for api variant)")
    .option("--user-id <id>", "user id for API", "harness-user")
    .option("--trip-id <id>", "trip id for API")
    .option("--token <token>", "bearer token")
    .option("--max-seconds <n>", "server max_seconds", "20")
    .action(
      async (
        file: string,
        opts: {
          variant: string[];
          apiBase?: string;
          userId?: string;
          tripId?: string;
          token?: string;
          maxSeconds: string;
        },
      ) => {
        const config = getConfig();
        let labels = opts.variant?.length ? opts.variant : ["local", "api"];
        if (labels.length < 2) {
          labels = ["local", "api"];
        }
        if (labels.length > 2) {
          console.warn("More than 2 variants: comparing first two only");
          labels = labels.slice(0, 2);
        }

        const cases = loadCases(file);
        const maxSec = Math.max(1, Math.min(20, Math.floor(Number(opts.maxSeconds) || 20)));
        const runner = new HarnessRunner();
        const resultsPerVariant: HarnessResult[][] = [];

        for (const label of labels) {
          const mode = variantFromString(label);
          const runOpts: HarnessRunOptions = {
            mode,
            apiBase: opts.apiBase ?? config.apiBase,
            apiUserId: opts.userId,
            apiTripId: opts.tripId,
            apiToken: opts.token ?? config.apiToken,
            maxSeconds: maxSec,
          };
          if (mode === "api" && !runOpts.apiBase) {
            console.error(`Variant "${label}" is API mode but --api-base / TRIPNARA_API_BASE is missing`);
            process.exitCode = 1;
            return;
          }
          const res = await runner.run(cases, runOpts);
          resultsPerVariant.push(res);
        }

        printAbReport(cases, labels, resultsPerVariant);
      },
    );
}

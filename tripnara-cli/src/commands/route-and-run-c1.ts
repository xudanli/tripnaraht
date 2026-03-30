import { Command } from "commander";
import { join } from "path";
import { writeFileSync } from "fs";
import { callHealth, callRouteAndRun } from "../core/api-client";
import { getConfig } from "../infra/config";
import { loadCases } from "../harness/harness.loader";
import type { HarnessCase } from "../harness/harness.types";
import { toCliError } from "../infra/errors";

function resolveCliRoot(): string {
  return join(__dirname, "..", "..");
}

function resolveApiBase(apiBaseOpt?: string): string | undefined {
  if (apiBaseOpt) return apiBaseOpt;
  return process.env.API_BASE || process.env.TRIPNARA_API_BASE;
}

function resolveAuth(authOpt?: string): string | undefined {
  if (authOpt) return authOpt;
  return process.env.AUTH_TOKEN || process.env.TRIPNARA_API_TOKEN || getConfig().apiToken;
}

function pickCase(cases: HarnessCase[], caseId?: string): HarnessCase {
  if (caseId) {
    const c = cases.find((x) => x.id === caseId);
    if (!c) throw new Error(`case id not found: ${caseId}`);
    return c;
  }
  return cases[0];
}

function tsIso(): string {
  return new Date().toISOString().replace(/\.\d{3}Z$/, "Z");
}

/** C1 strict: envelope `result.status === OK` (see RouteAndRunResponseDto). */
function isRunSuccessStrict(result: Awaited<ReturnType<typeof callRouteAndRun>>): boolean {
  return result.result_status === "OK";
}

/**
 * Local / smoke: treat NEED_MORE_INFO + CLARIFY as success (orchestration returned clarification, not error).
 * Staging release checklist often still wants strict `OK`; use strict mode for that.
 */
function isRunSuccessSoft(result: Awaited<ReturnType<typeof callRouteAndRun>>): boolean {
  if (isRunSuccessStrict(result)) return true;
  return (
    result.result_status === "NEED_MORE_INFO" &&
    result.verdict === "CLARIFY"
  );
}

function printRunDiagnostics(
  result: Awaited<ReturnType<typeof callRouteAndRun>>,
  verbose: boolean,
): void {
  if (!verbose) return;
  const err0 = result.orchestration_errors?.[0];
  console.error(
    [
      "[route_and_run] diagnostics",
      `  result_status: ${result.result_status ?? "(missing)"}`,
      `  verdict: ${result.verdict ?? "-"}`,
      `  gate_result: ${result.gate_result ?? "-"}`,
      err0 ? `  orchestration_error: ${err0.message ?? err0.error_code ?? JSON.stringify(err0)}` : null,
      result.answer_text
        ? `  answer_text: ${String(result.answer_text).slice(0, 200)}${String(result.answer_text).length > 200 ? "…" : ""}`
        : null,
    ]
      .filter(Boolean)
      .join("\n"),
  );
}

export function registerRouteAndRunC1Command(program: Command): void {
  program
    .command("route_and_run")
    .description(
      "C1 smoke: GET /health + POST /api/agent/route_and_run (non-mock staging; real API)",
    )
    .requiredOption("--case <name>", "case file name without .json, e.g. basic")
    .option("--env <name>", "label stored in artifact (e.g. staging)", "staging")
    .option("--auth <token>", "Bearer token (or AUTH_TOKEN / TRIPNARA_API_TOKEN)")
    .option("--api-base <url>", "override API base (else API_BASE or TRIPNARA_API_BASE)")
    .option("--case-id <id>", "harness case id in file (default: first case)")
    .option("--user-id <id>", "user id for API", "harness-user")
    .option("--trip-id <id>", "trip id for API")
    .option("--max-seconds <n>", "server max_seconds (1–20)", "20")
    .option(
      "--full-run",
      "set dry_run=false in backend options (stronger downstream; staging only)",
      false,
    )
    .option(
      "--write-artifact <path>",
      "write e2e_run_log.json for repo root: npm run release-gate:v2",
    )
    .option("--verbose", "on run failure, print result_status / verdict / gate_result / snippet", false)
    .option(
      "--soft",
      "count NEED_MORE_INFO + CLARIFY as run SUCCESS (orchestration asked for info; not result.status OK)",
      false,
    )
    .action(
      async (opts: {
        case: string;
        env?: string;
        auth?: string;
        apiBase?: string;
        caseId?: string;
        userId?: string;
        tripId?: string;
        maxSeconds?: string;
        fullRun?: boolean;
        writeArtifact?: string;
        verbose?: boolean;
        soft?: boolean;
      }) => {
        try {
          const apiBase = resolveApiBase(opts.apiBase);
          if (!apiBase) {
            console.error(
              "Missing API base: set API_BASE or TRIPNARA_API_BASE, or pass --api-base",
            );
            process.exitCode = 1;
            return;
          }
          const token = resolveAuth(opts.auth);
          const cliRoot = resolveCliRoot();
          const casePath = join(cliRoot, "cases", `${opts.case}.json`);
          const cases = loadCases(casePath);
          const c = pickCase(cases, opts.caseId);
          const maxSec = Math.max(
            1,
            Math.min(20, Math.floor(Number(opts.maxSeconds) || 20)),
          );
          const dryRun = !opts.fullRun;

          const health = await callHealth(apiBase);
          const routeOk = health.ok;

          let runOk = false;
          let strictOkResult = false;
          let parsed: Awaited<ReturnType<typeof callRouteAndRun>> | null = null;
          if (routeOk) {
            const body: Record<string, unknown> = {
              request_id: `c1-${c.id}-${Date.now()}`,
              user_id: opts.userId ?? "harness-user",
              trip_id: opts.tripId,
              message: c.query,
              options: {
                use_claude_orchestration: true,
                use_state_machine_orchestration: true,
                dry_run: dryRun,
                max_steps: 8,
                max_seconds: maxSec,
              },
              conversation_context: { recent_messages: [] },
            };
            parsed = await callRouteAndRun(apiBase, token, body);
            strictOkResult = isRunSuccessStrict(parsed);
            const softOk = !!opts.soft && isRunSuccessSoft(parsed);
            runOk = strictOkResult || softOk;
            if (!runOk) {
              printRunDiagnostics(parsed, !!opts.verbose);
              if (!opts.verbose) {
                console.error(
                  `[route_and_run] run_status=FAILED (result_status=${parsed.result_status ?? "?"}). Re-run with --verbose for verdict / gate_result / errors.`,
                );
              }
            } else if (opts.soft && !strictOkResult && softOk) {
              console.error(
                "[route_and_run] soft pass: NEED_MORE_INFO + CLARIFY (use strict OK for staging sign-off if required)",
              );
            }
          }

          const routeStatus = routeOk ? "SUCCESS" : "FAILED";
          const runStatus = routeOk ? (runOk ? "SUCCESS" : "FAILED") : "FAILED";

          const artifact: Record<string, unknown> = {
            case_id: opts.case,
            env: opts.env ?? "staging",
            route_status: routeStatus,
            run_status: runStatus,
            cli_harness_case_id: `${opts.case}.json`,
            timestamp: tsIso(),
          };
          if (opts.soft && runStatus === "SUCCESS" && parsed) {
            artifact.c1_soft_pass = !strictOkResult;
          }

          if (opts.writeArtifact) {
            writeFileSync(opts.writeArtifact, JSON.stringify(artifact, null, 2) + "\n", "utf8");
            console.error(`Wrote artifact: ${opts.writeArtifact}`);
          }

          console.log(JSON.stringify(artifact, null, 2));

          if (routeStatus !== "SUCCESS" || runStatus !== "SUCCESS") {
            process.exitCode = 1;
          }
        } catch (error) {
          const cliError = toCliError(error);
          console.error(`${cliError.code}: ${cliError.message}`);
          process.exitCode = 1;
        }
      },
    );
}

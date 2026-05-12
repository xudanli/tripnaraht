import { Command } from "commander";
import {
  callRouteAndRun,
  type ItineraryDayRow,
} from "../core/api-client";
import { logger } from "../infra/logger";
import { getConfig } from "../infra/config";
import { toCliError } from "../infra/errors";

function truncateText(s: string, max: number): string {
  const t = s.replace(/\s+/g, " ").trim();
  return t.length <= max ? t : `${t.slice(0, max - 1)}…`;
}

function formatTimeWindow(start?: string, end?: string): string {
  if (start && end) return `${start}–${end}`;
  if (start) return `${start}–`;
  if (end) return `–${end}`;
  return "";
}

/** Terminal-friendly view of the same fields a web UI should map to cards (not raw JSON). */
function printItineraryHuman(
  days: ItineraryDayRow[],
  colorize: (text: string, code: string, enabled: boolean) => string,
  useColor: boolean,
): void {
  if (days.length === 0) {
    console.log(colorize("--- itinerary: (empty — timeline & orchestration days both missing) ---", "90", useColor));
    return;
  }
  console.log(
    colorize(
      "--- itinerary (from payload.timeline or orchestrationResult.itinerary.days) ---",
      "36",
      useColor,
    ),
  );
  for (const d of days) {
    const header = d.date ? d.date : `Day ${d.day_index}`;
    console.log(colorize(`▸ ${header}`, "1", useColor));
    if (d.items.length === 0) {
      console.log("   (no items)");
      continue;
    }
    for (const it of d.items) {
      const win = formatTimeWindow(it.start_window, it.end_window).padEnd(13);
      const title = it.name ?? "(unnamed)";
      const metaParts = [it.type, it.place_id ? `#${it.place_id}` : undefined].filter(Boolean);
      const meta = metaParts.length > 0 ? `  (${metaParts.join(" · ")})` : "";
      console.log(`   ${win} ${title}${colorize(meta, "90", useColor)}`);
      if (it.address) {
        console.log(colorize(`             ${it.address}`, "90", useColor));
      }
    }
  }
}

export function registerRunRouteAndRunCommand(program: Command): void {
  const colorize = (text: string, code: string, enabled: boolean): string =>
    enabled ? `\u001b[${code}m${text}\u001b[0m` : text;

  program
    .command("run-route-and-run")
    .description("Call TripNARA route_and_run API")
    .requiredOption("--api-base <url>", "API base URL, e.g. http://localhost:3000")
    .requiredOption("--user-id <id>", "user id")
    .requiredOption("--query <text>", "user query")
    .option("--token <token>", "bearer token")
    .option("--trip-id <id>", "trip id")
    .option("--request-id <id>", "request id", `cli-${Date.now()}`)
    .option("--days <n>", "days hint", "2")
    .option("--format <format>", "output format: json|table|itinerary", "json")
    .option("--top-risks <n>", "top N risk tags in debug table output", "5")
    .option("--min-risk-count <n>", "minimum count threshold for risk breakdown", "1")
    .option("--color", "enable colored table output", true)
    .option("--no-color", "disable colored table output")
    .option("--debug", "show decision trace and policy path", false)
    .option("--raw", "print full raw response", false)
    .option(
      "--max-seconds <n>",
      "server agent deadline (1–20; backend caps at 20s; default 20 to avoid 12s default TIMEOUT)",
      "20",
    )
    .action(
      async (options: {
        apiBase: string;
        token?: string;
        userId: string;
        tripId?: string;
        requestId: string;
        query: string;
        days: string;
        maxSeconds: string;
        format?: "json" | "table" | "itinerary" | string;
        topRisks?: string;
        minRiskCount?: string;
        color?: boolean;
        debug?: boolean;
        raw?: boolean;
      }) => {
        try {
          const config = getConfig();
          const maxSeconds = Math.max(
            1,
            Math.min(20, Math.floor(Number(options.maxSeconds) || 20)),
          );
          logger.info("Calling route_and_run...");
          const body: Record<string, unknown> = {
            request_id: options.requestId,
            user_id: options.userId,
            trip_id: options.tripId,
            message: options.query,
            options: {
              use_claude_orchestration: true,
              use_state_machine_orchestration: true,
              dry_run: true,
              max_steps: 8,
              max_seconds: maxSeconds,
            },
            conversation_context: {
              recent_messages: [],
            },
          };

          const result = await callRouteAndRun(
            options.apiBase,
            options.token ?? config.apiToken,
            body,
          );

          if (options.raw) {
            console.log(JSON.stringify(result.raw, null, 2));
            return;
          }
          const useColor = options.color !== false;
          if (options.format === "itinerary") {
            printItineraryHuman(result.itinerary_days ?? [], colorize, useColor);
            return;
          }
          if (result.result_status === "TIMEOUT") {
            logger.warn(
              `编排超时：后端默认约 12s、上限 20s；已传 max_seconds=${maxSeconds}。若仍超时，需在后端放宽 deadline 或降低 LLM/技能耗时。`,
            );
          }
          if (options.format === "table") {
            const risks = (result.risk_tags_summary ?? [])
              .map((x) => `${x.tag}(${x.count})`)
              .join(", ");
            const limitations = (result.limitations ?? [])
              .map((x) => `${x.type}:${x.impact}`)
              .join(" | ");
            console.log(colorize("=== TripNARA route_and_run ===", "36", useColor));
            console.log(`result_status: ${result.result_status ?? "-"}`);
            console.log(`verdict      : ${result.verdict ?? "-"}`);
            console.log(`gate_result  : ${result.gate_result ?? "-"}`);
            console.log(`risk_tags    : ${risks || "-"}`);
            console.log(`limitations  : ${limitations || "-"}`);
            const err0 = result.orchestration_errors?.[0];
            const summaryLine =
              err0?.message ??
              (result.result_status && result.result_status !== "OK"
                ? result.answer_text
                : undefined);
            if (summaryLine) {
              console.log(
                colorize(`message      : ${truncateText(summaryLine, options.debug ? 400 : 160)}`, "33", useColor),
              );
            }
            if (options.debug) {
              console.log(colorize("--- debug trace ---", "90", useColor));
              console.log(`decision_steps: ${(result.decision_steps ?? []).join(" -> ") || "-"}`);
              console.log(`policy_path   : ${(result.policy_path ?? []).join(" | ") || "-"}`);
              if (result.confidence) {
                console.log(
                  `confidence    : overall=${result.confidence.overall ?? "-"}, gate=${result.confidence.gate_evaluation ?? "-"}, plan=${result.confidence.plan_generation ?? "-"}`,
                );
              }
              const topRisks = result.risk_tags_summary ?? [];
              if (topRisks.length > 0) {
                const topN = Math.max(1, Number(options.topRisks ?? "5"));
                const minCount = Math.max(1, Number(options.minRiskCount ?? "1"));
                const sorted = [...topRisks]
                  .filter((x) => x.count >= minCount)
                  .sort((a, b) => b.count - a.count)
                  .slice(0, topN);
                const highRiskTags = new Set(["SAFETY", "HEALTH"]);
                console.log(
                  colorize(
                    `--- risk breakdown (top=${topN}, min_count=${minCount}) ---`,
                    "33",
                    useColor,
                  ),
                );
                if (sorted.length === 0) {
                  console.log("  -");
                } else {
                  for (const r of sorted) {
                    const marker = highRiskTags.has(r.tag) ? "!!" : "  ";
                    const line = `${marker} ${r.tag.padEnd(12)} count=${r.count}`;
                    console.log(
                      highRiskTags.has(r.tag)
                        ? colorize(line, "31", useColor)
                        : line,
                    );
                  }
                }
              }
            }
            printItineraryHuman(result.itinerary_days ?? [], colorize, useColor);
            return;
          }

          console.log(
            JSON.stringify(
              {
                result_status: result.result_status,
                verdict: result.verdict,
                gate_result: result.gate_result,
                answer_text: result.answer_text,
                itinerary_days: result.itinerary_days ?? [],
                orchestration_errors: result.orchestration_errors ?? [],
                risk_tags_summary: result.risk_tags_summary ?? [],
                limitations: result.limitations ?? [],
                ...(options.debug
                  ? {
                      decision_steps: result.decision_steps ?? [],
                      policy_path: result.policy_path ?? [],
                      confidence: result.confidence,
                    }
                  : {}),
              },
              null,
              2,
            ),
          );
        } catch (error) {
          const cliError = toCliError(error);
          logger.error(`${cliError.code}: ${cliError.message}`);
          if (cliError.code === "AUTH_FAILED") {
            logger.warn("Hint: pass --token or set TRIPNARA_API_TOKEN in .env");
          } else if (cliError.code === "RATE_LIMITED") {
            logger.warn("Hint: retry later or reduce request frequency");
          } else if (cliError.code === "NETWORK_ERROR") {
            logger.warn(
              "Hint: ensure the Nest API is running (e.g. project root: npm run dev) and --api-base matches host:port",
            );
          }
          process.exitCode = 1;
        }
      },
    );
}

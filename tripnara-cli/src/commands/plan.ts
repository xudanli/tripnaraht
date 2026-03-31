import { Command } from "commander";
import * as readline from "node:readline/promises";
import { stdin as input, stdout as output } from "node:process";
import { callRouteAndRun } from "../core/api-client";
import { Planner } from "../core/planner";
import { getConfig } from "../infra/config";
import { toCliError } from "../infra/errors";
import { logger } from "../infra/logger";

function renderTimeline(plan: {
  type?: string;
  timeline?: Array<{ time?: string; action?: string }>;
  strategy?: string;
}): void {
  const timeline = Array.isArray(plan.timeline) ? plan.timeline : [];
  if (timeline.length === 0) return;
  console.log("\nTrip Plan:\n");
  for (const item of timeline) {
    const time = item.time ?? "--:--";
    const action = item.action ?? "";
    console.log(`${time}  ${action}`);
  }
  if (plan.type === "fallback") {
    console.log(
      `\n[Fallback] 使用默认探索策略${plan.strategy ? `（${plan.strategy}）` : ""}`,
    );
  }
}

function renderDebugScores(
  debugScores: Array<{
    slot?: string;
    desiredType?: string;
    poiName?: string;
    typeScore?: number;
    timeScore?: number;
    ratingScore?: number;
    affordabilityScore?: number;
    nameHintScore?: number;
    totalScore?: number;
  }>,
  selectedTimeline?: Array<{ time?: string; action?: string }>,
): void {
  const selectedSet = new Set(
    (selectedTimeline || []).map((x) => `${x.time ?? ""}::${x.action ?? ""}`),
  );
  const bySlot = new Map<string, typeof debugScores>();
  for (const row of debugScores) {
    const key = `${row.slot ?? "UNKNOWN"}/${row.desiredType ?? "poi"}`;
    const list = bySlot.get(key) || [];
    list.push(row);
    bySlot.set(key, list);
  }

  console.log("\nDebug Scores (Top3 per slot):");
  for (const [slotKey, rows] of bySlot.entries()) {
    const top = [...rows].sort((a, b) => (b.totalScore ?? 0) - (a.totalScore ?? 0)).slice(0, 3);
    console.log(`- ${slotKey}`);
    for (const d of top) {
      const picked = selectedSet.has(`${d.slot ?? ""}::${d.poiName ?? ""}`) ? " [picked]" : "";
      console.log(
        `  • ${d.poiName ?? "未知POI"} => total=${d.totalScore ?? 0}${picked} (type=${d.typeScore ?? 0}, time=${d.timeScore ?? 0}, rating=${d.ratingScore ?? 0}, cost=${d.affordabilityScore ?? 0}, hint=${d.nameHintScore ?? 0})`,
      );
    }
  }
}

function renderCommuteMatrix(matrix: {
  mode?: string;
  from_start?: boolean;
  nodes?: string[];
  minutes?: number[][];
}): void {
  const LONG_LEG_MINUTES = 180;
  const nodes = Array.isArray(matrix.nodes) ? matrix.nodes : [];
  const rows = Array.isArray(matrix.minutes) ? matrix.minutes : [];
  if (nodes.length === 0 || rows.length === 0) return;
  console.log(
    `\nCommute Matrix (minutes, mode=${matrix.mode ?? "mixed"}, !>${LONG_LEG_MINUTES}m):`,
  );
  const header = ["from\\to", ...nodes].join("\t");
  console.log(header);
  rows.forEach((row, i) => {
    const from = nodes[i] ?? `row-${i}`;
    const cells = row.map((v, j) => {
      if (i === j) return String(v);
      return v > LONG_LEG_MINUTES ? `!${v}` : String(v);
    });
    console.log([from, ...cells].join("\t"));
  });
}

function extractTimelineFromApiRaw(raw: unknown): Array<{
  date?: string;
  items: Array<{ time: string; action: string }>;
}> {
  const root = raw as
    | {
        result?: {
          payload?: {
            timeline?: Array<{
              date?: string;
              items?: Array<{ start_window?: string; location_ref?: { name?: string }; notes?: string }>;
            }>;
          };
        };
      }
    | undefined;
  const days = root?.result?.payload?.timeline;
  if (!Array.isArray(days)) return [];
  const grouped: Array<{ date?: string; items: Array<{ time: string; action: string }> }> = [];
  for (const day of days) {
    const items = Array.isArray(day?.items) ? day.items : [];
    const dayItems: Array<{ time: string; action: string }> = [];
    for (const item of items) {
      const time = item?.start_window ?? "--:--";
      const action = item?.location_ref?.name ?? item?.notes ?? "活动";
      dayItems.push({ time, action });
    }
    if (dayItems.length > 0) {
      grouped.push({ date: day?.date, items: dayItems });
    }
  }
  return grouped;
}

function renderGroupedTimeline(days: Array<{ date?: string; items: Array<{ time: string; action: string }> }>): void {
  if (!days.length) return;
  console.log("\nTrip Plan:\n");
  days.forEach((day, idx) => {
    const title = day.date ? `Day ${idx + 1} (${day.date})` : `Day ${idx + 1}`;
    console.log(title);
    for (const item of day.items) {
      console.log(`${item.time}  ${item.action}`);
    }
    console.log("");
  });
}

async function askInteractiveClarification(
  result: Awaited<ReturnType<typeof callRouteAndRun>>,
): Promise<string | undefined> {
  const q = result.clarification_questions?.[0];
  const options = Array.isArray(q?.options) ? q.options : [];
  if (!q?.question || options.length === 0) return undefined;
  console.log(`\n需要补充信息：${q.question}`);
  options.forEach((opt, i) => console.log(`${i + 1}) ${opt}`));
  const rl = readline.createInterface({ input, output });
  try {
    const answer = await rl.question("请选择序号（直接回车取消）: ");
    const idx = Number(answer.trim());
    if (!Number.isFinite(idx) || idx < 1 || idx > options.length) return undefined;
    return options[idx - 1];
  } finally {
    rl.close();
  }
}

export function registerPlanCommand(program: Command): void {
  program
    .command("plan")
    .description("Generate itinerary")
    .argument("<query>", "travel query")
    .option("--days <days>", "number of days", "2")
    .option("--risk-score <score>", "risk score hint 0..1")
    .option("--api", "call backend route_and_run API", false)
    .option("--api-base <url>", "API base URL (or TRIPNARA_API_BASE)")
    .option("--token <token>", "bearer token (or TRIPNARA_API_TOKEN)")
    .option("--user-id <id>", "user id for API mode", "cli-user")
    .option("--trip-id <id>", "trip id for API mode")
    .option("--max-seconds <n>", "server max_seconds (API)", "60")
    .option(
      "--strategy <name>",
      "fallback strategy hint: CITY_WALK|CLASSIC|HOT_SPOTS|BALANCED",
    )
    .option("--show-debug-scores", "show fallback score breakdown", false)
    .option("--require-poi-data", "require POI data from database", false)
    .option("--allow-partial", "allow partial execution with missing fields", false)
    .option("--poi-policy <mode>", "poi policy: strict|fallback|explore")
    .option("--poi-source <name>", "poi source hint: vector|google|foursquare|auto")
    .option("--show-poi-trace", "show poi source/selection trace", false)
    .option("--show-commute-matrix", "show estimated commute matrix", false)
    .option("--interactive", "auto-handle clarification by terminal choice", false)
    .option("--debug", "enable debug logs", false)
    .action(async (query: string, options: {
      days: string;
      riskScore?: string;
      api?: boolean;
      apiBase?: string;
      token?: string;
      userId: string;
      tripId?: string;
      maxSeconds: string;
      strategy?: string;
      showDebugScores?: boolean;
      requirePoiData?: boolean;
      allowPartial?: boolean;
      poiPolicy?: string;
      poiSource?: string;
      showPoiTrace?: boolean;
      showCommuteMatrix?: boolean;
      interactive?: boolean;
      debug?: boolean;
    }) => {
      logger.info("Planning trip...");
      try {
        if (options.api) {
          const config = getConfig();
          const apiBase = options.apiBase ?? config.apiBase;
          if (!apiBase) {
            logger.error("API mode requires --api-base or TRIPNARA_API_BASE");
            process.exitCode = 1;
            return;
          }
          const maxSeconds = Math.max(
            1,
            Math.min(120, Math.floor(Number(options.maxSeconds) || 60)),
          );
          let currentQuery = query;
          let apiResult = await callRouteAndRun(
            apiBase,
            options.token ?? config.apiToken,
            {
              request_id: `plan-${Date.now()}`,
              user_id: options.userId,
              trip_id: options.tripId,
              message: currentQuery,
              options: {
                dry_run: true,
                max_steps: 8,
                max_seconds: maxSeconds,
                ...(options.strategy
                  ? { fallback_strategy: options.strategy.toUpperCase() }
                  : {}),
                ...(options.showDebugScores ? { show_debug_scores: true } : {}),
                ...(options.requirePoiData ? { require_poi_data: true } : {}),
                ...(options.allowPartial ? { allow_partial: true } : {}),
                ...(options.poiPolicy
                  ? { poi_policy: options.poiPolicy.toLowerCase() }
                  : {}),
                ...(options.poiSource
                  ? { poi_source: options.poiSource.toLowerCase() }
                  : {}),
                ...(options.showPoiTrace ? { show_poi_trace: true } : {}),
                ...(options.showCommuteMatrix ? { show_commute_matrix: true } : {}),
              },
              conversation_context: { recent_messages: [] },
            },
          );
          if (options.interactive) {
            for (let i = 0; i < 2; i += 1) {
              if (apiResult.result_status !== "NEED_MORE_INFO") break;
              const picked = await askInteractiveClarification(apiResult);
              if (!picked) break;
              currentQuery = `${currentQuery}。我选择：${picked}`;
              apiResult = await callRouteAndRun(
                apiBase,
                options.token ?? config.apiToken,
                {
                  request_id: `plan-${Date.now()}-r${i + 1}`,
                  user_id: options.userId,
                  trip_id: options.tripId,
                  message: currentQuery,
                  options: {
                    dry_run: true,
                    max_steps: 8,
                    max_seconds: maxSeconds,
                    ...(options.strategy
                      ? { fallback_strategy: options.strategy.toUpperCase() }
                      : {}),
                    ...(options.showDebugScores ? { show_debug_scores: true } : {}),
                    ...(options.requirePoiData ? { require_poi_data: true } : {}),
                    ...(options.allowPartial ? { allow_partial: true } : {}),
                    ...(options.poiPolicy
                      ? { poi_policy: options.poiPolicy.toLowerCase() }
                      : {}),
                    ...(options.poiSource
                      ? { poi_source: options.poiSource.toLowerCase() }
                      : {}),
                    ...(options.showPoiTrace ? { show_poi_trace: true } : {}),
                    ...(options.showCommuteMatrix ? { show_commute_matrix: true } : {}),
                  },
                  conversation_context: { recent_messages: [] },
                },
              );
            }
          }
          logger.info("Planning done (api)");
          const hasFallbackTimeline = !!apiResult.fallback_plan?.timeline?.length;
          if (hasFallbackTimeline) {
            const fallbackPlan = apiResult.fallback_plan;
            if (!fallbackPlan) {
              console.log(JSON.stringify({ mode: "api", query, result: apiResult }, null, 2));
              return;
            }
            renderTimeline(fallbackPlan);
            if (apiResult.fallback_plans?.length) {
              console.log("\n候选方案:");
              for (const plan of apiResult.fallback_plans) {
                const selected = plan.strategy === apiResult.fallback_selected_strategy;
                console.log(`- ${plan.strategy ?? "UNKNOWN"}${selected ? " (推荐)" : ""}`);
              }
            }
            if (apiResult.fallback_explain?.summary) {
              console.log(`\nExplain: ${apiResult.fallback_explain.summary}`);
            }
            if (apiResult.fallback_explain?.objective) {
              console.log(`Objective: ${apiResult.fallback_explain.objective}`);
            }
            const score = apiResult.fallback_plan?.plan_score ?? apiResult.fallback_explain?.planScore;
            if (typeof score === "number") {
              console.log(`Plan Score: ${score} / 10`);
            }
            const pacingMode =
              apiResult.fallback_plan?.pacing_mode ??
              apiResult.fallback_explain?.pacingMode ??
              apiResult.fallback_pacing_mode;
            if (pacingMode) {
              console.log(`Pacing Mode: ${pacingMode}`);
            }
            if (apiResult.fallback_template_version) {
              console.log(`Template Version: ${apiResult.fallback_template_version}`);
            }
            if (options.showPoiTrace && apiResult.poi_trace) {
              console.log("\nPOI Trace:");
              console.log(
                JSON.stringify(
                  {
                    policy: apiResult.poi_trace.policy,
                    source_hint: apiResult.poi_trace.sourceHint,
                    provider: apiResult.poi_trace.provider,
                    input: apiResult.poi_trace.inputCount,
                    selected: apiResult.poi_trace.selectedCount,
                    commute_budget_minutes: apiResult.poi_trace.commute_budget_minutes,
                    estimated_commute_minutes: apiResult.poi_trace.estimated_commute_minutes,
                    over_budget: apiResult.poi_trace.over_budget,
                  },
                  null,
                  2,
                ),
              );
            }
            if (options.showDebugScores && apiResult.fallback_plan?.debug_scores?.length) {
              renderDebugScores(
                apiResult.fallback_plan.debug_scores,
                apiResult.fallback_plan.timeline,
              );
            } else if (options.showDebugScores && apiResult.poi_trace?.debug_scores?.length) {
              renderDebugScores(apiResult.poi_trace.debug_scores);
            } else if (options.showDebugScores) {
              console.log(
                "\n[Debug] 当前结果没有 fallback debug scores（通常因为未进入 fallback 分支）。",
              );
            }
            if (options.showCommuteMatrix && apiResult.fallback_plan?.commute_matrix) {
              renderCommuteMatrix(apiResult.fallback_plan.commute_matrix);
            } else if (options.showCommuteMatrix && apiResult.poi_trace?.commute_matrix) {
              renderCommuteMatrix(apiResult.poi_trace.commute_matrix);
            } else if (options.showCommuteMatrix) {
              console.log(
                "\n[Debug] 当前结果没有 commute matrix（通常因为未进入 fallback 分支，或后端未返回）。",
              );
            }
            if (apiResult.fallback_explain?.reasoning?.length) {
              for (const reason of apiResult.fallback_explain.reasoning) {
                console.log(`- ${reason}`);
              }
            }
          } else {
            const timeline = extractTimelineFromApiRaw(apiResult.raw);
            if (timeline.length > 0) {
              renderGroupedTimeline(timeline);
              if (options.showPoiTrace && apiResult.poi_trace) {
                console.log("\nPOI Trace:");
                console.log(
                  JSON.stringify(
                    {
                      policy: apiResult.poi_trace.policy,
                      source_hint: apiResult.poi_trace.sourceHint,
                      provider: apiResult.poi_trace.provider,
                      input: apiResult.poi_trace.inputCount,
                      selected: apiResult.poi_trace.selectedCount,
                      commute_budget_minutes: apiResult.poi_trace.commute_budget_minutes,
                      estimated_commute_minutes: apiResult.poi_trace.estimated_commute_minutes,
                      over_budget: apiResult.poi_trace.over_budget,
                    },
                    null,
                    2,
                  ),
                );
              } else if (options.showPoiTrace) {
                console.log("\n[Debug] 当前结果没有 poi trace（后端未返回）。");
              }
              if (options.showDebugScores) {
                if (apiResult.poi_trace?.debug_scores?.length) {
                  renderDebugScores(apiResult.poi_trace.debug_scores);
                } else {
                  console.log(
                    "\n[Debug] 当前结果没有 fallback debug scores（通常因为未进入 fallback 分支）。",
                  );
                }
              }
              if (options.showCommuteMatrix) {
                if (apiResult.poi_trace?.commute_matrix) {
                  renderCommuteMatrix(apiResult.poi_trace.commute_matrix);
                } else {
                  console.log(
                    "\n[Debug] 当前结果没有 commute matrix（通常因为未进入 fallback 分支，或后端未返回）。",
                  );
                }
              }
            } else {
              console.log(JSON.stringify({ mode: "api", query, result: apiResult }, null, 2));
            }
          }
          return;
        }
        const planner = new Planner();
        const result = await planner.plan({
          query: options.strategy ? `${query} fallback:${options.strategy}` : query,
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
        const cliError = toCliError(error);
        logger.error("Planning failed");
        logger.error(`${cliError.code}: ${cliError.message}`);
        process.exitCode = 1;
      }
    });
}

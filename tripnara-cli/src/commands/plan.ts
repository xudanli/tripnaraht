import { Command } from "commander";
import * as readline from "node:readline/promises";
import { stdin as input, stdout as output } from "node:process";
import { callRouteAndRun, type RouteAndRunApiResult } from "../core/api-client";
import { Planner } from "../core/planner";
import { getConfig } from "../infra/config";
import { toCliError } from "../infra/errors";
import { logger } from "../infra/logger";

const PLAN_CLI_OBSERVABILITY_REV = "20260408-obs";

function poiTraceForDisplay(t: RouteAndRunApiResult["poi_trace"]): Record<string, unknown> {
  if (!t) return {};
  return {
    policy: t.policy,
    source_hint: t.sourceHint,
    provider: t.provider,
    input: t.inputCount,
    selected: t.selectedCount,
    orchestration_mode_final: t.orchestration_mode_final,
    received_route_direction_id: t.received_route_direction_id,
    request_route_direction_id: t.requestRouteDirectionId,
    selected_region: t.selected_region,
    region_written_to_dso: t.region_written_to_dso,
    region_geometry_loaded: t.region_geometry_loaded,
    country_filter_applied: t.country_filter_applied,
    spatial_filter_applied: t.spatial_filter_applied,
    poi_query_scope: t.poi_query_scope,
    recall_before_filter: t.recall_before_filter,
    after_country_filter: t.after_country_filter,
    after_region_filter: t.after_region_filter,
    selected_after_rank: t.selected_after_rank,
    commute_budget_minutes: t.commute_budget_minutes,
    estimated_commute_minutes: t.estimated_commute_minutes,
    over_budget: t.over_budget,
  };
}

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
  currentQuery: string,
  forceKeywordInput = false,
  suppressQuestionText = false,
): Promise<string | undefined> {
  const q = result.clarification_questions?.[0];
  const options = Array.isArray(q?.options) ? q.options : [];
  const askRoutePreference = async (
    rl: readline.Interface,
  ): Promise<{ label: string; hint: string }> => {
    const prefs = [
      { label: "自然风光", hint: "nature scenery viewpoint" },
      { label: "人文历史", hint: "culture history museum" },
      { label: "轻松自驾", hint: "self drive easy pace" },
      { label: "徒步探索", hint: "hiking trail outdoor" },
      { label: "亲子友好", hint: "family friendly easy access" },
    ];
    console.log("\n请选择路线偏好：");
    prefs.forEach((p, i) => console.log(`${i + 1}) ${p.label}`));
    const ans = (await rl.question("偏好序号（回车默认 自然风光）: ")).trim();
    const idx = Number(ans);
    if (!Number.isFinite(idx) || idx < 1 || idx > prefs.length) return prefs[0];
    return prefs[idx - 1];
  };
  const isInvalidManual = (v: string): boolean =>
    /^(无|没有|不知道|不清楚|随便|whatever|none|null|n\/a)$/i.test(v.trim());
  if (!q?.question) return undefined;
  if (!suppressQuestionText) {
    console.log(`\n需要补充信息：${q.question}`);
  }
  if (q?.type === "text") {
    const rl = readline.createInterface({ input, output });
    try {
      const manual = await rl.question("请输入内容（直接回车取消）: ");
      const value = manual.trim();
      if (!value || isInvalidManual(value)) return undefined;
      return value;
    } finally {
      rl.close();
    }
  }
  if (forceKeywordInput) {
    const rl = readline.createInterface({ input, output });
    try {
      const manual = await rl.question("请输入具体景点关键词（英文地标名更稳，例如：Hallgrimskirkja）: ");
      const value = manual.trim();
      if (!value || isInvalidManual(value)) return undefined;
      return `__KEYWORD__:${value}`;
    } finally {
      rl.close();
    }
  }
  if (options.length === 0) return undefined;
  // 对于“目的地范围过大/过散”的问题：先让用户选偏好，再用偏好重发一次请求，
  // 让后端按偏好重新过滤/排序路线方向选项，避免“先选方向后问偏好”的体验。
  if (q?.id === "destination_scope_too_sparse" && !/用户偏好[:：]/.test(currentQuery)) {
    // 这里不重复打印“需要补充信息”，避免用户看到同一问题两遍
    if (!suppressQuestionText) {
      console.log("\n（先选偏好，用于筛选更合适的路线方向）");
    }
    const rl = readline.createInterface({ input, output });
    try {
      const pref = await askRoutePreference(rl);
      return `__PREF__:${pref.label}|${pref.hint}`;
    } finally {
      rl.close();
    }
  }
  const displayOptions = options.map((opt) => {
    if (typeof opt === "string") return { label: opt, value: opt };
    if (opt && typeof opt === "object" && "label" in opt && "value" in opt) {
      const label = (opt as any).label;
      const value = (opt as any).value;
      if (typeof label === "string" && typeof value === "string") return { label, value };
    }
    return { label: String(opt), value: String(opt) };
  });
  displayOptions.forEach((opt, i) => console.log(`${i + 1}) ${opt.label}`));
  const rl = readline.createInterface({ input, output });
  try {
    const answer = await rl.question("请选择序号（直接回车取消）: ");
    const raw = answer.trim();
    if (!raw) return undefined;
    if (!/^\d+$/.test(raw)) {
      // 允许直接输入目的地文本（例如 "Reykjavik, Iceland"）
      return raw;
    }
    const idx = Number(raw);
    if (!Number.isFinite(idx) || idx < 1 || idx > options.length) return undefined;
    const selected = displayOptions[idx - 1];
    if (q?.id === "destination_scope_too_sparse" && !selected.label.includes("手动输入")) {
      const routeHintMap: Record<string, string> = {
        "市区": "downtown city center landmarks",
        "近郊": "suburb nearby attractions",
        "南部": "south coast attractions",
        "北部": "north area attractions",
        "东部": "east area attractions",
        "西部": "west area attractions",
      };
      const suffix = Object.keys(routeHintMap).find((k) => selected.label.includes(k));
      if (suffix) {
        return `__ROUTE__:${selected.label}|${routeHintMap[suffix]}`;
      }
      // DB 方向：用 value（uuid）回传，避免当作可 geocode 地址
      if (/^[0-9a-fA-F-]{16,}$/.test(selected.value)) {
        return `__ROUTE_DIR__:${selected.value}`;
      }
      // 兜底：仍把纯文本当作路线方向（老数据/未升级后端）
      return `__ROUTE__:${selected.label}|${selected.label}`;
    }
    if (q?.id === "destination_poi_intent_refine" && !selected.label.includes("手动输入")) {
      const scenicHintMap: Record<string, string> = {
        "地标景点": "landmark attractions sightseeing",
        "博物馆区": "museum art gallery culture",
        "自然风光": "nature park viewpoint waterfall",
      };
      const suffix = Object.keys(scenicHintMap).find((k) => selected.label.includes(k));
      if (suffix) {
        return `__KEYWORD__:${scenicHintMap[suffix]}`;
      }
    }
    if (
      selected.label.includes("手动输入") ||
      /(市区|近郊|南部|北部|东部|西部)$/.test(selected.label.replace(/\s+/g, ""))
    ) {
      const manual = await rl.question("请输入更具体的城市/区域（例如：雷克雅未克市区）: ");
      const value = manual.trim();
      if (!value || isInvalidManual(value)) return undefined;
      return value;
    }
    return selected.value;
  } finally {
    rl.close();
  }
}

function normalizeDestinationSelection(selection: string): string {
  return selection.replace(/\s+/g, "").replace(/(市区|近郊|南部|北部|东部|西部)$/, "$1");
}

function buildFollowupQuery(currentQuery: string, selection: string): string {
  if (selection.startsWith("__PREF__:")) {
    const payload = selection.replace("__PREF__:", "");
    const [prefLabel, prefHint] = payload.split("|");
    return `${currentQuery}，用户偏好：${prefLabel ?? ""} ${prefHint ?? ""}`.trim();
  }
  if (selection.startsWith("__ROUTE_DIR__:")) {
    // 方向 ID 通过 request.route_direction_id 传递，不污染 query 文本
    return currentQuery;
  }
  if (selection.startsWith("__ROUTE__:")) {
    const payload = selection.replace("__ROUTE__:", "");
    const [routeLabel, routeHint] = payload.split("|");
    const normalizedRoute = normalizeDestinationSelection(routeLabel || "");
    if (/在.+的.*行程/.test(currentQuery)) {
      const replaced = currentQuery.replace(/在(.+?)的(.*行程)/, `在${normalizedRoute}的$2`);
      return `${replaced}，路线方向偏好：${routeHint ?? ""}`.trim();
    }
    return `${currentQuery}。路线方向改为：${normalizedRoute}，并优先检索：${routeHint ?? ""}`.trim();
  }
  if (selection.startsWith("__KEYWORD__:")) {
    const keyword = selection.replace("__KEYWORD__:", "").trim();
    if (!keyword) return currentQuery;
    return `${currentQuery}，请优先包含这些景点关键词：${keyword}`;
  }
  const raw = selection.trim();
  const scenicSuffixMatch = raw.match(/(地标景点|博物馆区|自然风光)$/);
  const scenicSuffix = scenicSuffixMatch?.[1];
  const destinationPart = scenicSuffix
    ? raw.slice(0, raw.length - scenicSuffix.length).trim()
    : raw;
  const normalized = normalizeDestinationSelection(destinationPart || raw);
  const preferenceHint = scenicSuffix ? `，偏好${scenicSuffix}` : "";
  // 优先替换“在X的一日行程”里的 X，避免不断追加导致 NLU 噪声
  if (/在.+的.*行程/.test(currentQuery)) {
    const replaced = currentQuery.replace(/在(.+?)的(.*行程)/, `在${normalized}的$2`);
    return `${replaced}${preferenceHint}`;
  }
  return `${currentQuery}。目的地改为：${normalized}${preferenceHint}`;
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
          let routeDirectionId: string | undefined = undefined;
          let apiResult = await callRouteAndRun(
            apiBase,
            options.token ?? config.apiToken,
            {
              request_id: `plan-${Date.now()}`,
              user_id: options.userId,
              trip_id: options.tripId,
              route_direction_id: routeDirectionId,
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
            const clarificationSeenCount = new Map<string, number>();
            for (let i = 0; i < 3; i += 1) {
              if (apiResult.result_status !== "NEED_MORE_INFO") break;
              const qid = apiResult.clarification_questions?.[0]?.id ?? "";
              const seen = clarificationSeenCount.get(qid) ?? 0;
              clarificationSeenCount.set(qid, seen + 1);
              const forceKeywordInput =
                qid === "destination_poi_intent_refine" && seen >= 1;
              const suppressQuestionText =
                qid === "destination_scope_too_sparse" && seen >= 1;
              const picked = await askInteractiveClarification(
                apiResult,
                currentQuery,
                forceKeywordInput,
                suppressQuestionText,
              );
              if (!picked) break;
              if (picked.startsWith("__ROUTE_DIR__:")) {
                routeDirectionId = picked.replace("__ROUTE_DIR__:", "").trim() || routeDirectionId;
              } else {
                currentQuery = buildFollowupQuery(currentQuery, picked);
              }
              apiResult = await callRouteAndRun(
                apiBase,
                options.token ?? config.apiToken,
                {
                  request_id: `plan-${Date.now()}-r${i + 1}`,
                  user_id: options.userId,
                  trip_id: options.tripId,
                  route_direction_id: routeDirectionId,
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
          process.stderr.write(`\n[CLI] plan observability rev=${PLAN_CLI_OBSERVABILITY_REV}\n`);
          process.stderr.write(
            `Orchestration trace: mode_final=${apiResult.mode_final ?? "n/a"} orchestration_mode_final=${apiResult.orchestration_mode_final ?? "n/a"} received_route_direction_id=${apiResult.received_route_direction_id ?? "n/a"}\n`,
          );
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
              console.log(JSON.stringify(poiTraceForDisplay(apiResult.poi_trace), null, 2));
            } else if (options.showPoiTrace) {
              console.log("\n[Debug] 当前结果没有 poi trace（后端未返回）。");
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
                console.log(JSON.stringify(poiTraceForDisplay(apiResult.poi_trace), null, 2));
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

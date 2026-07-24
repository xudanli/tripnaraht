import { CliError } from "../infra/errors";
import {
  extractHarnessTraceObservability,
  type HarnessTraceObservabilitySlice,
} from "./harness-observability.util";

export interface OrchestrationErrorEntry {
  step?: string;
  error_code?: string;
  message?: string;
}

/** Parsed from `result.payload.timeline` or `payload.orchestrationResult.itinerary.days` for CLI / tooling. */
export interface ItineraryItemRow {
  id?: string;
  type?: string;
  start_window?: string;
  end_window?: string;
  name?: string;
  address?: string;
  place_id?: string;
}

export interface ItineraryDayRow {
  date?: string;
  /** 1-based index in the returned days array */
  day_index: number;
  items: ItineraryItemRow[];
}

function parseItineraryItem(it: unknown): ItineraryItemRow {
  const ir = asRecord(it);
  if (!ir) return {};
  const loc = asRecord(ir.location_ref);
  return {
    id: typeof ir.id === "string" ? ir.id : undefined,
    type: typeof ir.type === "string" ? ir.type : undefined,
    start_window: typeof ir.start_window === "string" ? ir.start_window : undefined,
    end_window: typeof ir.end_window === "string" ? ir.end_window : undefined,
    name:
      typeof loc?.name === "string"
        ? loc.name
        : typeof ir.title === "string"
          ? ir.title
          : undefined,
    address: typeof loc?.address === "string" ? loc.address : undefined,
    place_id:
      loc && "place_id" in loc && loc.place_id != null
        ? String((loc as Record<string, unknown>).place_id)
        : undefined,
  };
}

/**
 * Prefer `payload.timeline` (System 2 timeline mirror); if empty, fall back to
 * `orchestrationResult.itinerary.days` (same items the debug UI often JSON-stringifies).
 */
export function extractItineraryDaysFromRoutePayload(
  payloadObj: Record<string, unknown> | undefined,
): ItineraryDayRow[] {
  if (!payloadObj) return [];
  const timeline = Array.isArray(payloadObj.timeline) ? (payloadObj.timeline as unknown[]) : [];
  const orch = asRecord(payloadObj.orchestrationResult);
  const itin = orch ? asRecord(orch.itinerary) : undefined;
  const orchDays =
    itin && Array.isArray(itin.days) ? (itin.days as unknown[]) : ([] as unknown[]);
  const daysSource = timeline.length > 0 ? timeline : orchDays;
  if (!Array.isArray(daysSource) || daysSource.length === 0) return [];
  return daysSource.map((day, idx) => {
    const dr = asRecord(day);
    const date = typeof dr?.date === "string" ? dr.date : undefined;
    const itemsRaw = Array.isArray(dr?.items) ? dr.items : [];
    const items = itemsRaw.map(parseItineraryItem);
    return { date, day_index: idx + 1, items };
  });
}

export interface RouteAndRunApiResult {
  verdict?: string;
  /** `result.status` from envelope (OK | FAILED | NEED_MORE_INFO | …) */
  result_status?: string;
  /** `result.answer_text` — user-facing message (may be long) */
  answer_text?: string;
  gate_result?: string;
  risk_tags_summary?: Array<{ tag: string; count: number }>;
  limitations?: Array<{ type: string; description: string; impact: string }>;
  decision_steps?: string[];
  /** `orchestrationResult.state.errors` */
  orchestration_errors?: OrchestrationErrorEntry[];
  confidence?: {
    overall?: number;
    gate_evaluation?: number;
    plan_generation?: number;
  };
  policy_path?: string[];
  fallback_plan?: {
    type?: string;
    strategy?: string;
    name?: string;
    timeline?: Array<{ time?: string; action?: string; type?: string }>;
    confidence?: number;
    selected_pois?: string[];
    plan_score?: number;
    pacing_mode?: "normal" | "conservative";
    debug_scores?: Array<{
      slot: string;
      desiredType: string;
      poiName: string;
      typeScore: number;
      timeScore: number;
      ratingScore: number;
      affordabilityScore: number;
      nameHintScore: number;
      commuteDistanceKm?: number;
      commuteMinutes?: number;
      commutePenalty?: number;
      timeWindowPenalty?: number;
      totalScore: number;
    }>;
    commute_matrix?: {
      mode?: "walk" | "drive" | "transit" | "mixed";
      from_start?: boolean;
      nodes?: string[];
      minutes?: number[][];
    };
  };
  fallback_explain?: {
    summary?: string;
    reasoning?: string[];
    objective?: string;
    planScore?: number;
    pacingMode?: "normal" | "conservative";
  };
  fallback_plans?: Array<{
    type?: string;
    strategy?: string;
    name?: string;
    timeline?: Array<{ time?: string; action?: string; type?: string }>;
    confidence?: number;
  }>;
  fallback_selected_strategy?: string;
  fallback_template_version?: string;
  fallback_pacing_mode?: "normal" | "conservative";
  orchestration_mode_final?: string;
  received_route_direction_id?: string;
  mode_final?: string;
  harness_active_trace_id?: string;
  harness_trace_export_path?: string;
  evaluation_run_id?: string;
  otel_trace_id?: string;
  otel_span_id?: string;
  run_id?: string;
  clarification_questions?: Array<{
    id?: string;
    question?: string;
    type?: string;
    options?: Array<string | { value: string; label: string }>;
    required?: boolean;
  }>;
  /** Human-readable rows for itinerary UI (timeline or orchestration itinerary.days). */
  itinerary_days?: ItineraryDayRow[];
  poi_trace?: {
    policy?: "strict" | "fallback" | "explore";
    sourceHint?: string;
    provider?: string;
    inputCount?: number;
    selectedCount?: number;
    commute_budget_minutes?: number;
    estimated_commute_minutes?: number;
    over_budget?: boolean;
    debug_scores?: Array<{
      slot?: string;
      desiredType?: string;
      poiName?: string;
      typeScore?: number;
      timeScore?: number;
      ratingScore?: number;
      affordabilityScore?: number;
      nameHintScore?: number;
      commuteDistanceKm?: number;
      commuteMinutes?: number;
      commutePenalty?: number;
      timeWindowPenalty?: number;
      totalScore?: number;
    }>;
    commute_matrix?: {
      mode?: "walk" | "drive" | "transit" | "mixed";
      from_start?: boolean;
      nodes?: string[];
      minutes?: number[][];
    };
    orchestration_mode_final?: string;
    received_route_direction_id?: string;
    requestRouteDirectionId?: string;
    selected_region?: string;
    region_written_to_dso?: boolean;
    region_geometry_loaded?: boolean;
    country_filter_applied?: boolean;
    spatial_filter_applied?: boolean;
    poi_query_scope?: string;
    recall_before_filter?: number;
    recall_raw_research?: number;
    recall_after_route_augment?: number;
    after_dedupe?: number;
    after_hard_guards?: number;
    after_country_filter?: number;
    after_region_filter?: number;
    selected_after_rank?: number;
    destination_country?: string | null;
    route_direction_id?: string;
    route_signature_pois_added?: number;
    route_corridor_pois_added?: number;
  };
  raw: unknown;
}

function asRecord(v: unknown): Record<string, unknown> | undefined {
  return v !== null && typeof v === "object" && !Array.isArray(v)
    ? (v as Record<string, unknown>)
    : undefined;
}

/** Surface ECONNREFUSED / cause chain — undici `fetch failed` alone is opaque */
function formatNetworkError(error: unknown, url: string): string {
  const parts: string[] = [String(error)];
  let cur: unknown = error;
  for (let i = 0; i < 4 && cur && typeof cur === "object" && "cause" in cur; i++) {
    cur = (cur as { cause?: unknown }).cause;
    if (cur !== undefined) parts.push(`cause: ${String(cur)}`);
  }
  const joined = parts.join(" | ");
  if (/ECONNREFUSED/i.test(joined)) {
    return `${joined} (nothing listening — start the API, e.g. project root: \`npm run dev\`, and check ${url})`;
  }
  if (/ENOTFOUND/i.test(joined)) {
    return `${joined} (DNS / hostname — check --api-base)`;
  }
  return `${joined} (url: ${url})`;
}

export async function callRouteAndRun(
  baseUrl: string,
  token: string | undefined,
  payload: Record<string, unknown>,
): Promise<RouteAndRunApiResult> {
  // Must match Nest AgentController: @Post('route_and_run') + setGlobalPrefix('api')
  const url = `${baseUrl.replace(/\/+$/, "")}/api/agent/route_and_run`;
  const headers: Record<string, string> = {
    "Content-Type": "application/json",
  };
  if (token) {
    headers.Authorization = `Bearer ${token}`;
  }

  let res: Response;
  try {
    res = await fetch(url, {
      method: "POST",
      headers,
      body: JSON.stringify(payload),
    });
  } catch (error) {
    throw new CliError("NETWORK_ERROR", formatNetworkError(error, url));
  }
  if (!res.ok) {
    const text = await res.text();
    if (res.status === 401 || res.status === 403) {
      throw new CliError("AUTH_FAILED", `auth failed (${res.status}): ${text}`, res.status);
    }
    if (res.status === 429) {
      throw new CliError("RATE_LIMITED", `rate limited (${res.status}): ${text}`, res.status);
    }
    throw new CliError(
      "BACKEND_ERROR",
      `route-and-run failed (${res.status} ${res.statusText}): ${text}`,
      res.status,
    );
  }

  let json: unknown;
  try {
    json = (await res.json()) as unknown;
  } catch (error) {
    throw new CliError("INVALID_RESPONSE", `invalid JSON response: ${String(error)}`);
  }
  const root = asRecord(json);
  if (!root) {
    throw new CliError("INVALID_RESPONSE", "response is not an object");
  }
  const result = asRecord(root?.result);
  const payloadObj = asRecord(result?.payload);
  const obs =
    asRecord(root?.observability) ??
    asRecord(result?.observability) ??
    asRecord(payloadObj?.observability);
  const orchestration = asRecord(payloadObj?.orchestrationResult);
  const state = asRecord(orchestration?.state);
  const gateOnState = asRecord(state?.gate_result);
  const gateOnOrchestration = asRecord(orchestration?.gate_result);
  const explain = asRecord(root?.explain);
  const simplified = asRecord(explain?.simplified_explanation);
  const ai = asRecord(explain?.ai_capability_display);
  const decisionLog = Array.isArray(explain?.decision_log)
    ? (explain?.decision_log as Array<Record<string, unknown>>)
    : [];

  const verdict =
    (typeof state?.verdict === "string" ? state.verdict : undefined) ??
    (typeof root?.["verdict"] === "string" ? (root["verdict"] as string) : undefined);
  /** Backend may attach GateResult on state or on orchestrationResult (DTO allows both). */
  const gateResult =
    (typeof gateOnState?.gate_result === "string" ? gateOnState.gate_result : undefined) ??
    (typeof gateOnOrchestration?.gate_result === "string"
      ? gateOnOrchestration.gate_result
      : undefined);

  const riskTagsSummary = Array.isArray(simplified?.risk_tags_summary)
    ? (simplified?.risk_tags_summary as Array<{ tag: string; count: number }>)
    : undefined;
  const limitations = Array.isArray(ai?.limitations)
    ? (ai?.limitations as Array<{ type: string; description: string; impact: string }>)
    : undefined;
  const confidence = asRecord(ai?.confidence)
    ? {
        overall:
          typeof asRecord(ai?.confidence)?.overall === "number"
            ? (asRecord(ai?.confidence)?.overall as number)
            : undefined,
        gate_evaluation:
          typeof asRecord(ai?.confidence)?.gate_evaluation === "number"
            ? (asRecord(ai?.confidence)?.gate_evaluation as number)
            : undefined,
        plan_generation:
          typeof asRecord(ai?.confidence)?.plan_generation === "number"
            ? (asRecord(ai?.confidence)?.plan_generation as number)
            : undefined,
      }
    : undefined;
  const decisionSteps = decisionLog
    .map((d) => (typeof d.step === "string" ? d.step : ""))
    .filter((s) => s.length > 0);

  const resultStatus = typeof result?.status === "string" ? result.status : undefined;
  const answerText = typeof result?.answer_text === "string" ? result.answer_text : undefined;
  const stateErrors = Array.isArray(state?.errors)
    ? (state?.errors as Array<Record<string, unknown>>)
    : [];
  const orchestrationErrors: OrchestrationErrorEntry[] = stateErrors
    .map((e) => ({
      step: typeof e.step === "string" ? e.step : undefined,
      error_code: typeof e.error_code === "string" ? e.error_code : undefined,
      message: typeof e.message === "string" ? e.message : undefined,
    }))
    .filter((e) => e.message !== undefined || e.error_code !== undefined);

  const policyPath: string[] = [];
  if (verdict) policyPath.push(`verdict:${verdict}`);
  if (gateResult) policyPath.push(`gate:${gateResult}`);
  if (confidence?.overall !== undefined) {
    policyPath.push(`confidence:${confidence.overall.toFixed(2)}`);
  }
  if (resultStatus) policyPath.push(`result:${resultStatus}`);

  const fallbackPlan = asRecord(payloadObj?.fallbackPlan);
  const fallbackExplain = asRecord(payloadObj?.fallbackExplain);
  const fallbackPlans = Array.isArray(payloadObj?.fallbackPlans)
    ? (payloadObj?.fallbackPlans as Array<Record<string, unknown>>)
    : [];
  const poiTrace =
    asRecord(payloadObj?.poiTrace) ??
    asRecord((payloadObj as Record<string, unknown> | undefined)?.poi_trace) ??
    asRecord((payloadObj as Record<string, unknown> | undefined)?.poiTraceV2);
  const clarificationQuestions = Array.isArray(payloadObj?.clarificationQuestions)
    ? (payloadObj.clarificationQuestions as Array<Record<string, unknown>>)
    : [];

  const itinerary_days = extractItineraryDaysFromRoutePayload(payloadObj);
  const harnessObs: HarnessTraceObservabilitySlice = extractHarnessTraceObservability(root);

  return {
    verdict,
    result_status: resultStatus,
    answer_text: answerText,
    gate_result: gateResult,
    risk_tags_summary: riskTagsSummary,
    limitations,
    decision_steps: decisionSteps,
    orchestration_errors: orchestrationErrors.length > 0 ? orchestrationErrors : undefined,
    confidence,
    policy_path: policyPath.length > 0 ? policyPath : undefined,
    fallback_plan: fallbackPlan
      ? {
          type: typeof fallbackPlan.type === "string" ? fallbackPlan.type : undefined,
          strategy:
            typeof fallbackPlan.strategy === "string" ? fallbackPlan.strategy : undefined,
          name: typeof fallbackPlan.name === "string" ? fallbackPlan.name : undefined,
          timeline: Array.isArray(fallbackPlan.timeline)
            ? (fallbackPlan.timeline as Array<{ time?: string; action?: string; type?: string }>)
            : undefined,
          confidence:
            typeof fallbackPlan.confidence === "number"
              ? fallbackPlan.confidence
              : undefined,
          selected_pois: Array.isArray(fallbackPlan.selected_pois)
            ? (fallbackPlan.selected_pois.filter((x) => typeof x === "string") as string[])
            : undefined,
          plan_score:
            typeof fallbackPlan.plan_score === "number"
              ? fallbackPlan.plan_score
              : undefined,
          pacing_mode:
            fallbackPlan.pacing_mode === "normal" ||
            fallbackPlan.pacing_mode === "conservative"
              ? fallbackPlan.pacing_mode
              : undefined,
          debug_scores: Array.isArray(fallbackPlan.debug_scores)
            ? (fallbackPlan.debug_scores as Array<{
                slot: string;
                desiredType: string;
                poiName: string;
                typeScore: number;
                timeScore: number;
                ratingScore: number;
                affordabilityScore: number;
                nameHintScore: number;
                commuteDistanceKm?: number;
                commuteMinutes?: number;
                commutePenalty?: number;
                timeWindowPenalty?: number;
                totalScore: number;
              }>)
            : undefined,
          commute_matrix: asRecord(fallbackPlan.commute_matrix)
            ? {
                mode:
                  asRecord(fallbackPlan.commute_matrix)?.mode === "walk" ||
                  asRecord(fallbackPlan.commute_matrix)?.mode === "drive" ||
                  asRecord(fallbackPlan.commute_matrix)?.mode === "transit" ||
                  asRecord(fallbackPlan.commute_matrix)?.mode === "mixed"
                    ? (asRecord(fallbackPlan.commute_matrix)?.mode as
                        | "walk"
                        | "drive"
                        | "transit"
                        | "mixed")
                    : undefined,
                from_start:
                  typeof asRecord(fallbackPlan.commute_matrix)?.from_start === "boolean"
                    ? (asRecord(fallbackPlan.commute_matrix)?.from_start as boolean)
                    : undefined,
                nodes: Array.isArray(asRecord(fallbackPlan.commute_matrix)?.nodes)
                  ? (asRecord(fallbackPlan.commute_matrix)?.nodes as unknown[]).filter(
                      (x): x is string => typeof x === "string",
                    )
                  : undefined,
                minutes: Array.isArray(asRecord(fallbackPlan.commute_matrix)?.minutes)
                  ? (asRecord(fallbackPlan.commute_matrix)?.minutes as unknown[])
                      .map((row) =>
                        Array.isArray(row)
                          ? row.map((v) => (typeof v === "number" ? v : Number(v) || 0))
                          : [],
                      )
                      .filter((row) => Array.isArray(row))
                  : undefined,
              }
            : undefined,
        }
      : undefined,
    fallback_explain: fallbackExplain
      ? {
          summary:
            typeof fallbackExplain.summary === "string"
              ? fallbackExplain.summary
              : undefined,
          reasoning: Array.isArray(fallbackExplain.reasoning)
            ? (fallbackExplain.reasoning.filter((x) => typeof x === "string") as string[])
            : undefined,
          objective:
            typeof fallbackExplain.objective === "string"
              ? fallbackExplain.objective
              : undefined,
          planScore:
            typeof fallbackExplain.planScore === "number"
              ? fallbackExplain.planScore
              : undefined,
          pacingMode:
            fallbackExplain.pacingMode === "normal" ||
            fallbackExplain.pacingMode === "conservative"
              ? fallbackExplain.pacingMode
              : undefined,
        }
      : undefined,
    fallback_plans:
      fallbackPlans.length > 0
        ? fallbackPlans.map((p) => ({
            type: typeof p.type === "string" ? p.type : undefined,
            strategy: typeof p.strategy === "string" ? p.strategy : undefined,
            name: typeof p.name === "string" ? p.name : undefined,
            timeline: Array.isArray(p.timeline)
              ? (p.timeline as Array<{ time?: string; action?: string; type?: string }>)
              : undefined,
            confidence: typeof p.confidence === "number" ? p.confidence : undefined,
          }))
        : undefined,
    fallback_selected_strategy:
      typeof payloadObj?.fallbackSelectedStrategy === "string"
        ? payloadObj.fallbackSelectedStrategy
        : undefined,
    fallback_template_version:
      typeof payloadObj?.fallbackTemplateVersion === "string"
        ? payloadObj.fallbackTemplateVersion
        : undefined,
    fallback_pacing_mode:
      payloadObj?.fallbackPacingMode === "normal" ||
      payloadObj?.fallbackPacingMode === "conservative"
        ? payloadObj.fallbackPacingMode
        : undefined,
    orchestration_mode_final:
      typeof obs?.orchestration_mode_final === "string"
        ? obs.orchestration_mode_final
        : undefined,
    received_route_direction_id:
      typeof obs?.received_route_direction_id === "string"
        ? obs.received_route_direction_id
        : undefined,
    mode_final: typeof obs?.mode_final === "string" ? obs.mode_final : undefined,
    harness_active_trace_id: harnessObs.harness_active_trace_id,
    harness_trace_export_path: harnessObs.harness_trace_export_path,
    evaluation_run_id: harnessObs.evaluation_run_id,
    otel_trace_id: harnessObs.otel_trace_id,
    otel_span_id: harnessObs.otel_span_id,
    run_id: harnessObs.run_id,
    clarification_questions:
      clarificationQuestions.length > 0
        ? clarificationQuestions.map((q) => ({
            id: typeof q.id === "string" ? q.id : undefined,
            question: typeof q.question === "string" ? q.question : undefined,
            type: typeof q.type === "string" ? q.type : undefined,
            options: Array.isArray(q.options)
              ? (q.options
                  .map((x) => {
                    if (typeof x === "string") return x;
                    if (x && typeof x === "object" && "value" in x && "label" in x) {
                      const v = (x as any).value;
                      const l = (x as any).label;
                      if (typeof v === "string" && typeof l === "string") {
                        return { value: v, label: l };
                      }
                    }
                    return undefined;
                  })
                  .filter(
                    (x): x is string | { value: string; label: string } => x !== undefined,
                  ))
              : undefined,
            required: typeof q.required === "boolean" ? q.required : undefined,
          }))
        : undefined,
    itinerary_days: itinerary_days.length > 0 ? itinerary_days : undefined,
    poi_trace: poiTrace
      ? {
          policy:
            poiTrace.policy === "strict" ||
            poiTrace.policy === "fallback" ||
            poiTrace.policy === "explore"
              ? poiTrace.policy
              : undefined,
          sourceHint:
            typeof poiTrace.sourceHint === "string" ? poiTrace.sourceHint : undefined,
          provider: typeof poiTrace.provider === "string" ? poiTrace.provider : undefined,
          inputCount:
            typeof poiTrace.inputCount === "number" ? poiTrace.inputCount : undefined,
          selectedCount:
            typeof poiTrace.selectedCount === "number"
              ? poiTrace.selectedCount
              : undefined,
          orchestration_mode_final:
            typeof (poiTrace as Record<string, unknown>).orchestration_mode_final === "string"
              ? ((poiTrace as Record<string, unknown>).orchestration_mode_final as string)
              : undefined,
          received_route_direction_id:
            typeof (poiTrace as Record<string, unknown>).received_route_direction_id === "string"
              ? ((poiTrace as Record<string, unknown>).received_route_direction_id as string)
              : undefined,
          requestRouteDirectionId:
            typeof (poiTrace as Record<string, unknown>).requestRouteDirectionId === "string"
              ? ((poiTrace as Record<string, unknown>).requestRouteDirectionId as string)
              : typeof (poiTrace as Record<string, unknown>).request_route_direction_id === "string"
                ? ((poiTrace as Record<string, unknown>).request_route_direction_id as string)
                : undefined,
          selected_region:
            typeof (poiTrace as Record<string, unknown>).selected_region === "string"
              ? ((poiTrace as Record<string, unknown>).selected_region as string)
              : undefined,
          region_written_to_dso:
            typeof (poiTrace as Record<string, unknown>).region_written_to_dso === "boolean"
              ? ((poiTrace as Record<string, unknown>).region_written_to_dso as boolean)
              : undefined,
          region_geometry_loaded:
            typeof (poiTrace as Record<string, unknown>).region_geometry_loaded === "boolean"
              ? ((poiTrace as Record<string, unknown>).region_geometry_loaded as boolean)
              : undefined,
          country_filter_applied:
            typeof (poiTrace as Record<string, unknown>).country_filter_applied === "boolean"
              ? ((poiTrace as Record<string, unknown>).country_filter_applied as boolean)
              : undefined,
          spatial_filter_applied:
            typeof (poiTrace as Record<string, unknown>).spatial_filter_applied === "boolean"
              ? ((poiTrace as Record<string, unknown>).spatial_filter_applied as boolean)
              : undefined,
          poi_query_scope:
            typeof (poiTrace as Record<string, unknown>).poi_query_scope === "string"
              ? ((poiTrace as Record<string, unknown>).poi_query_scope as string)
              : undefined,
          recall_before_filter:
            typeof (poiTrace as Record<string, unknown>).recall_before_filter === "number"
              ? ((poiTrace as Record<string, unknown>).recall_before_filter as number)
              : undefined,
          recall_raw_research:
            typeof (poiTrace as Record<string, unknown>).recall_raw_research === "number"
              ? ((poiTrace as Record<string, unknown>).recall_raw_research as number)
              : undefined,
          recall_after_route_augment:
            typeof (poiTrace as Record<string, unknown>).recall_after_route_augment === "number"
              ? ((poiTrace as Record<string, unknown>).recall_after_route_augment as number)
              : undefined,
          after_dedupe:
            typeof (poiTrace as Record<string, unknown>).after_dedupe === "number"
              ? ((poiTrace as Record<string, unknown>).after_dedupe as number)
              : undefined,
          after_hard_guards:
            typeof (poiTrace as Record<string, unknown>).after_hard_guards === "number"
              ? ((poiTrace as Record<string, unknown>).after_hard_guards as number)
              : undefined,
          destination_country: (() => {
            const v = (poiTrace as Record<string, unknown>).destination_country;
            if (typeof v === "string") return v;
            if (v === null) return null;
            return undefined;
          })(),
          route_direction_id:
            typeof (poiTrace as Record<string, unknown>).route_direction_id === "string"
              ? ((poiTrace as Record<string, unknown>).route_direction_id as string)
              : undefined,
          route_signature_pois_added:
            typeof (poiTrace as Record<string, unknown>).route_signature_pois_added === "number"
              ? ((poiTrace as Record<string, unknown>).route_signature_pois_added as number)
              : undefined,
          route_corridor_pois_added:
            typeof (poiTrace as Record<string, unknown>).route_corridor_pois_added === "number"
              ? ((poiTrace as Record<string, unknown>).route_corridor_pois_added as number)
              : undefined,
          after_country_filter:
            typeof (poiTrace as Record<string, unknown>).after_country_filter === "number"
              ? ((poiTrace as Record<string, unknown>).after_country_filter as number)
              : undefined,
          after_region_filter:
            typeof (poiTrace as Record<string, unknown>).after_region_filter === "number"
              ? ((poiTrace as Record<string, unknown>).after_region_filter as number)
              : undefined,
          selected_after_rank:
            typeof (poiTrace as Record<string, unknown>).selected_after_rank === "number"
              ? ((poiTrace as Record<string, unknown>).selected_after_rank as number)
              : undefined,
          commute_budget_minutes:
            typeof poiTrace.commute_budget_minutes === "number"
              ? poiTrace.commute_budget_minutes
              : undefined,
          estimated_commute_minutes:
            typeof poiTrace.estimated_commute_minutes === "number"
              ? poiTrace.estimated_commute_minutes
              : undefined,
          over_budget:
            typeof poiTrace.over_budget === "boolean"
              ? poiTrace.over_budget
              : undefined,
          debug_scores: Array.isArray(poiTrace.debug_scores)
            ? (poiTrace.debug_scores as Array<{
                slot?: string;
                desiredType?: string;
                poiName?: string;
                typeScore?: number;
                timeScore?: number;
                ratingScore?: number;
                affordabilityScore?: number;
                nameHintScore?: number;
                commuteDistanceKm?: number;
                commuteMinutes?: number;
                commutePenalty?: number;
                timeWindowPenalty?: number;
                totalScore?: number;
              }>)
            : undefined,
          commute_matrix: asRecord(poiTrace.commute_matrix)
            ? {
                mode:
                  asRecord(poiTrace.commute_matrix)?.mode === "walk" ||
                  asRecord(poiTrace.commute_matrix)?.mode === "drive" ||
                  asRecord(poiTrace.commute_matrix)?.mode === "transit" ||
                  asRecord(poiTrace.commute_matrix)?.mode === "mixed"
                    ? (asRecord(poiTrace.commute_matrix)?.mode as
                        | "walk"
                        | "drive"
                        | "transit"
                        | "mixed")
                    : undefined,
                from_start:
                  typeof asRecord(poiTrace.commute_matrix)?.from_start === "boolean"
                    ? (asRecord(poiTrace.commute_matrix)?.from_start as boolean)
                    : undefined,
                nodes: Array.isArray(asRecord(poiTrace.commute_matrix)?.nodes)
                  ? (asRecord(poiTrace.commute_matrix)?.nodes as unknown[]).filter(
                      (x): x is string => typeof x === "string",
                    )
                  : undefined,
                minutes: Array.isArray(asRecord(poiTrace.commute_matrix)?.minutes)
                  ? (asRecord(poiTrace.commute_matrix)?.minutes as unknown[])
                      .map((row) =>
                        Array.isArray(row)
                          ? row.map((v) => (typeof v === "number" ? v : Number(v) || 0))
                          : [],
                      )
                      .filter((row) => Array.isArray(row))
                  : undefined,
              }
            : undefined,
        }
      : undefined,
    raw: json,
  };
}

/** GET /health (Nest registers at app root; not under /api). */
export async function callHealth(baseUrl: string): Promise<{ ok: boolean; status: number }> {
  const url = `${baseUrl.replace(/\/+$/, "")}/health`;
  try {
    const res = await fetch(url, { method: "GET" });
    return { ok: res.ok, status: res.status };
  } catch (error) {
    throw new CliError("NETWORK_ERROR", formatNetworkError(error, url));
  }
}

import { CliError } from "../infra/errors";

export interface OrchestrationErrorEntry {
  step?: string;
  error_code?: string;
  message?: string;
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

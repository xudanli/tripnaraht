import type { RouteAndRunApiResult } from "../core/api-client";
import type { HarnessActual, Verdict } from "./harness.types";

const VERDICTS: Verdict[] = ["ALLOW", "REJECT", "ADJUST", "CLARIFY"];

function isVerdict(s: string): s is Verdict {
  return VERDICTS.includes(s as Verdict);
}

/**
 * 将 route_and_run 解析结果映射为 harness 的 verdict + 风险代理分数。
 * 风险：优先用 1 - confidence.overall；无 confidence 时用结果态启发式。
 */
export function mapApiResultToHarnessActual(parsed: RouteAndRunApiResult): HarnessActual {
  const status = parsed.result_status;
  const rawV = parsed.verdict;

  let verdict: Verdict = "CLARIFY";
  if (typeof rawV === "string" && isVerdict(rawV)) {
    verdict = rawV;
  } else if (status === "NEED_MORE_INFO" || status === "NEED_CONFIRMATION") {
    verdict = "CLARIFY";
  } else if (status === "TIMEOUT" || status === "FAILED") {
    verdict = "REJECT";
  } else if (status === "OK") {
    verdict = "ALLOW";
  }

  const overall = parsed.confidence?.overall;
  let riskScore = 0.5;
  if (typeof overall === "number") {
    riskScore = Math.max(0, Math.min(1, 1 - overall));
  } else {
    if (verdict === "ALLOW") riskScore = 0.25;
    else if (verdict === "CLARIFY") riskScore = 0.47;
    else if (verdict === "ADJUST") riskScore = 0.65;
    else if (verdict === "REJECT") riskScore = 0.9;
  }

  if (status === "TIMEOUT") riskScore = Math.max(riskScore, 0.85);
  if (status === "FAILED") riskScore = Math.max(riskScore, 0.8);

  const reason =
    parsed.answer_text?.slice(0, 300) ||
    parsed.orchestration_errors?.[0]?.message?.slice(0, 300);

  return { verdict, riskScore, reason };
}

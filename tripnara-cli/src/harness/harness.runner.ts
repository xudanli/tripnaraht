import { callRouteAndRun } from "../core/api-client";
import { Planner } from "../core/planner";
import { mapApiResultToHarnessActual } from "./harness.api-mapper";
import { buildHarnessResult, inferRiskScoreHintFromQuery } from "./harness.evaluator";
import type { HarnessCase, HarnessResult, HarnessRunOptions, HarnessVariant, HarnessActual } from "./harness.types";

export class HarnessRunner {
  private readonly planner = new Planner();

  async run(cases: HarnessCase[], opts: HarnessRunOptions): Promise<HarnessResult[]> {
    const out: HarnessResult[] = [];
    for (const c of cases) {
      const actual =
        opts.mode === "api" ? await this.runCaseApi(c, opts) : await this.runCaseLocal(c);
      out.push(buildHarnessResult(c, actual));
    }
    return out;
  }

  async runSingle(
    c: HarnessCase,
    opts: HarnessRunOptions,
  ): Promise<HarnessResult> {
    const actual =
      opts.mode === "api" ? await this.runCaseApi(c, opts) : await this.runCaseLocal(c);
    return buildHarnessResult(c, actual);
  }

  private async runCaseLocal(c: HarnessCase): Promise<HarnessActual> {
    const hint =
      typeof c.riskScoreHint === "number"
        ? c.riskScoreHint
        : inferRiskScoreHintFromQuery(c.query);
    const days = typeof c.days === "number" ? c.days : 2;
    const res = await this.planner.plan({
      query: c.query,
      days,
      riskScoreHint: hint,
    });
    const d = res.decision;
    return {
      verdict: d.verdict,
      riskScore: d.riskScore,
      reason: d.reason,
    };
  }

  private async runCaseApi(c: HarnessCase, opts: HarnessRunOptions): Promise<HarnessActual> {
    const base = opts.apiBase;
    if (!base) {
      throw new Error("API mode requires --api-base (or TRIPNARA_API_BASE)");
    }
    const body: Record<string, unknown> = {
      request_id: `harness-${c.id}-${Date.now()}`,
      user_id: opts.apiUserId ?? "harness-user",
      trip_id: opts.apiTripId,
      message: c.query,
      options: {
        use_claude_orchestration: true,
        use_state_machine_orchestration: true,
        dry_run: true,
        max_steps: 8,
        max_seconds: opts.maxSeconds ?? 20,
      },
      conversation_context: { recent_messages: [] },
    };
    const parsed = await callRouteAndRun(base, opts.apiToken, body);
    return mapApiResultToHarnessActual(parsed);
  }
}

export function variantFromString(s: string): HarnessVariant {
  const v = s.trim().toLowerCase();
  if (v === "api" || v === "remote" || v === "b") return "api";
  if (v === "a" || v === "local") return "local";
  return "local";
}

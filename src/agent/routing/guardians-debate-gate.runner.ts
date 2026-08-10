/**
 * Gate 后 Guardians 辩论：shadow 启动 / await 融合 / Abu REJECT 短路（从 ClaudeOrchestrator 迁出）。
 */

import type { GuardiansDebateGateHost } from './guardians-debate-gate.host';
import type { DecisionState } from '../../decision/kernel/decision-state.types';
import type { RouteAndRunRequestDto } from '../dto/route-and-run.dto';
import type {
  AgentContext,
  OrchestrationResult,
} from '../interfaces/claude-orchestration.interface';
import type {
  GateResult,
  OrchestratorState,
  TripPlanRequest,
} from '../interfaces/trip-plan.interface';
import {
  extractDecisionLogTripContext,
  formatGuardianDebateGateInputsZh,
  formatGuardianDebateGateOutputsZh,
} from '../utils/decision-log-user-facing.zh.util';
import { computeGuardiansDebateAwaitBudgetMs } from '../services/guardians-debate.service';
import {
  buildGuardianDebateFusionClarificationQuestions,
  fuseGuardianDebateVerdictIntoGate,
} from '../utils/guardian-debate-gate-fusion.util';
import { resolvePersonaClosureAudit } from '../utils/persona-closure-repair-skip.util';
import { enrichGuardianDebateTripContextFromGateEval } from '../utils/guardian-debate-trip-context-enricher.util';

export function enrichGuardianDebateTripContextAfterGateEval(
  host: GuardiansDebateGateHost,
  state: OrchestratorState,
): void {
  try {
    enrichGuardianDebateTripContextFromGateEval(state);
  } catch (e: any) {
    host.logger.warn(`[Claude Orchestrator] enrichGuardianDebateTripContext failed: ${e?.message ?? e}`);
  }
}

/**
 * Gate 最终落定（含 `allow_partial` 放宽）后尽早启动辩论 LLM shadow，与后续 PLAN 等步骤并行；
 * 由 Assembler `GuardiansDebateService.consumeShadowOrMerge` 消费。
 */
export function maybeStartGuardiansDebateShadowAfterGate(
  host: GuardiansDebateGateHost,
  request: RouteAndRunRequestDto,
  state: OrchestratorState,
): void {
  if (!host.guardiansDebate) return;
  if (request.options?.enable_guardians_debate_llm !== true) return;
  const gate = state.gate_result;
  if (!gate) return;
  if (host.guardiansDebate.hasFatalViolation(gate)) return;
  host.guardiansDebate.startShadowIfEligible(request.request_id, gate, {
    personaHint: request.options.persona_hint as TripPlanRequest['persona_hint'],
    tripContext: state.trip_plan_request,
    llmProvider: request.options.llm_provider,
    personaClosureAudit: resolvePersonaClosureAudit({
      gateResult: gate,
      orchestratorMetadata: state.metadata as Record<string, unknown>,
    }),
  });
  if (state.metadata) {
    (state.metadata as Record<string, unknown>).debate_triggered_at = Date.now();
    (state.metadata as Record<string, unknown>).debate_shadow_started = true;
  }
}

/**
 * PLAN_GEN 前 await 影子辩论；Abu REJECT → `NEED_USER_CONFIRM` 并短路（不生成行程草案）。
 */
export async function maybeAwaitGuardiansDebateFuseAndShortCircuit(
  host: GuardiansDebateGateHost,
  request: RouteAndRunRequestDto,
  state: OrchestratorState,
  decisionState: DecisionState | undefined,
  context: AgentContext,
  startTime: number,
  deadline?: { remainingMs: () => number },
): Promise<OrchestrationResult | undefined> {
  if (!host.guardiansDebate || request.options?.enable_guardians_debate_llm !== true) {
    return undefined;
  }
  const gateBefore = state.gate_result;
  if (!gateBefore || host.guardiansDebate.hasFatalViolation(gateBefore)) {
    return undefined;
  }

  const remaining = deadline?.remainingMs?.() ?? 90_000;
  const debateBudgetMs = computeGuardiansDebateAwaitBudgetMs(remaining);

  const stepStart = Date.now();
  let gateWithDebate: GateResult;
  let debateWaitTimedOut = false;
  try {
    const consumed = await host.guardiansDebate.consumeShadowOrMergeWithBudget(
      request.request_id,
      gateBefore,
      {
        personaHint: request.options.persona_hint as TripPlanRequest['persona_hint'],
        tripContext: state.trip_plan_request,
        llmProvider: request.options.llm_provider,
        personaClosureAudit: resolvePersonaClosureAudit({
          gateResult: gateBefore,
          orchestratorMetadata: state.metadata as Record<string, unknown>,
        }),
      },
      debateBudgetMs,
    );
    gateWithDebate = consumed.gate;
    debateWaitTimedOut = consumed.debate_wait_timed_out;
  } catch (e: unknown) {
    host.logger.warn(
      `[Claude Orchestrator] GuardiansDebate pre-plan await failed: ${e instanceof Error ? e.message : String(e)}`,
    );
    return undefined;
  }

  const fusion = fuseGuardianDebateVerdictIntoGate(gateWithDebate, state.trip_plan_request);
  state.gate_result = fusion.gate;
  state.metadata = {
    ...(state.metadata ?? {}),
    debate_merged_before_plan_gen: true,
    debate_await_budget_ms: debateBudgetMs,
    ...(debateWaitTimedOut ? { debate_wait_timed_out: true } : {}),
    ...(fusion.fused ? { debate_gate_fusion: fusion.reason } : {}),
  } as OrchestratorState['metadata'];

  state.decision_log.push({
    request_id: state.request_id,
    step: 'GATE_EVAL',
    actor: 'Gatekeeper',
    inputs_summary: formatGuardianDebateGateInputsZh(
      debateBudgetMs,
      extractDecisionLogTripContext({
        tripPlanRequest: state.trip_plan_request,
        metadata: state.metadata as Record<string, unknown>,
      }),
    ),
    outputs_summary: formatGuardianDebateGateOutputsZh({
      gateResult: fusion.gate.gate_result,
      fused: fusion.fused,
      fusionReason: fusion.reason,
      guardian: {
        abu: fusion.gate.guardian_results?.abu?.verdict,
        drdre: fusion.gate.guardian_results?.drdre?.verdict,
        neptune: fusion.gate.guardian_results?.neptune?.verdict,
      },
    }),
    evidence_refs: [],
    timestamp: new Date().toISOString(),
    metadata: {
      duration_ms: Date.now() - stepStart,
      gate_result: fusion.gate.gate_result,
      debate_source: fusion.gate.guardian_results?.source,
      debate_gate_fusion: fusion.reason,
      abu_verdict: fusion.gate.guardian_results?.abu?.verdict,
      debate_wait_timed_out: debateWaitTimedOut,
      debate_await_budget_ms: debateBudgetMs,
    },
  });

  if (!fusion.fused || fusion.gate.gate_result !== 'NEED_USER_CONFIRM') {
    return undefined;
  }

  const debateQuestions = buildGuardianDebateFusionClarificationQuestions(
    fusion.gate,
    state.trip_plan_request,
  );
  const existing = state.clarification_questions ?? [];
  const merged = [...existing];
  for (const q of debateQuestions) {
    if (!merged.some((m) => m.id === q.id)) merged.push(q);
  }
  state.clarification_questions = merged;

  host.logger.log(
    `[Claude Orchestrator] Abu REJECT → NEED_USER_CONFIRM，跳过 PLAN_GEN request_id=${request.request_id}`,
  );
  return host.buildClarificationResult(state, startTime, decisionState, context);
}

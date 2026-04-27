import { Injectable } from '@nestjs/common';
import type { RouteAndRunRequestDto, RouteAndRunResponseDto } from '../dto/route-and-run.dto';
import type { DecisionCandidateDto } from '../dto/route-and-run.dto';
import { TokenCalculator } from '../utils/token-calculator.util';
import type { OrchestrationResult } from '../interfaces/claude-orchestration.interface';
import {
  OrchestrationStep,
  DecisionLogEntry,
  GateResult,
  Itinerary,
  ItineraryRiskTag,
  OrchestratorState,
  SimplifiedExplanation,
  AICapabilityDisplay,
} from '../interfaces/trip-plan.interface';
import { RouteType, RouterReason, UIStatus } from '../interfaces/router.interface';
import { MetricsRecorder, extractMetricsFromResponse } from '../utils/agent-metrics.util';
import { deriveExternalVerdict, shouldIntakeClarifyShortCircuit, type PolicyAction } from '../utils/external-verdict.util';
import { ErrorType } from '../interfaces/error-types.interface';
import type { DecisionState } from '../../decision/kernel/decision-state.types';
import { buildTravelOntologyStateFromOrchestrator, mergeTravelOntologyState } from '../../decision/kernel/travel-ontology.mapper';
import { JepaProjectorService } from './jepa-projector.service';
import { assertDoneResponseCompleteness } from '../guards/done-response-completeness.guard';
import { assembleDecisionEvidenceCards } from '../utils/evidence-payload-assembler.util';
import { assembleEvidenceCardUIPropsFromState } from '../utils/evidence-ui-assembler.util';
import { sha256Signature } from '../contracts/decision-contract.types';
import { normalizeHardRuleSnapshot } from '../../trips/decision/shared/hard-rule-snapshot.types';
import { deriveFactsFromMetadata } from '../../trips/decision/shared/fact-derivation.util';

@Injectable()
export class RouteAndRunResponseAssemblerService {
  constructor(private readonly jepaProjector: JepaProjectorService) {}

  private isC1StrictEvidenceBundle(): boolean {
    const v = process.env.C1_STRICT_EVIDENCE_BUNDLE;
    return v === '1' || v === 'true';
  }

  private buildEvidenceBundle(params: {
    requestId: string;
    decisionLog: DecisionLogEntry[];
    state?: OrchestratorState | null;
    candidateId?: string;
  }): DecisionCandidateDto['evidence_bundle'] {
    const now = new Date().toISOString();
    const cards = assembleDecisionEvidenceCards(params.state ?? undefined);
    const hardFacts = new Map<string, { rule_id: string; is_violated?: boolean; severity?: string; ref_id?: string }>();

    // Primary: metadata.assertions_triggered (Kernel-native hard snapshot)
    for (const e of params.decisionLog ?? []) {
      const meta = (e as any)?.metadata;
      const snap = normalizeHardRuleSnapshot(meta);
      for (const f of snap.assertions_triggered ?? []) {
        hardFacts.set(f.rule_id, {
          rule_id: f.rule_id,
          is_violated: f.is_violated,
          severity: f.severity,
          ref_id: undefined,
        });
      }
      // Backfill: Pattern-A metadata.details.evidence → derived facts
      const derived = deriveFactsFromMetadata({
        metadata: (meta && typeof meta === 'object' ? meta : {}) as any,
        reasonCodes: [String((meta as any)?.rule_id ?? '')].filter(Boolean),
        timestampIso: (e as any)?.timestamp,
      });
      for (const f of derived) {
        if (!hardFacts.has(f.rule_id)) {
          hardFacts.set(f.rule_id, { rule_id: f.rule_id, is_violated: f.is_violated, severity: f.severity });
        }
      }
    }

    const hardFactsList = Array.from(hardFacts.values());
    const evidenceCardRefs = cards.map((c) => ({ kind: c.kind, rule_id: c.rule_id }));

    // C1 strict rule-of-thumb:
    // - VERIFIED when we have at least 1 hard fact and at least 1 evidence card (human-auditable UI payload).
    // - PARTIAL when only one side exists.
    // - FAILED when neither exists.
    const hasFacts = hardFactsList.length > 0;
    const hasCards = evidenceCardRefs.length > 0;
    const verification_status = hasFacts && hasCards ? 'VERIFIED' : hasFacts || hasCards ? 'PARTIAL' : 'FAILED';

    const snapshot_id = sha256Signature({
      request_id: params.requestId,
      candidate_id: params.candidateId ?? null,
      hard_facts: hardFactsList.map((x) => x.rule_id).sort(),
      evidence_cards: evidenceCardRefs.map((x) => `${x.kind}:${x.rule_id ?? ''}`).sort(),
    });
    const bundle_id = sha256Signature({
      snapshot_id,
      generated_at: now,
      verification_status,
    });

    return {
      bundle_id,
      snapshot_id,
      sources: [
        ...(hasFacts ? [{ type: 'HARD_RULE_SNAPSHOT', label: 'hard facts snapshot' }] : []),
        ...(hasCards ? [{ type: 'IRON_SHIELD', label: 'evidence cards' }] : []),
      ],
      hard_facts: hardFactsList,
      evidence_cards: evidenceCardRefs,
      confidence: hasFacts && hasCards ? 0.9 : hasFacts || hasCards ? 0.6 : 0.1,
      generated_at: now,
      verification_status,
    } as any;
  }

  /** Iron Shield: API evidence_cards + parallel ui_display.evidence_cards_ui */
  private buildIronShieldPayloadBlocks(state: OrchestratorState | undefined | null) {
    const st = state === null ? undefined : state;
    return {
      decision_metadata: {
        evidence_cards: assembleDecisionEvidenceCards(st),
      },
      ui_display: {
        evidence_cards_ui: assembleEvidenceCardUIPropsFromState(st),
      },
    };
  }

  buildSimplifiedExplanation(
    decisionLog: DecisionLogEntry[],
    gateResult?: GateResult,
    itinerary?: Itinerary,
  ): SimplifiedExplanation | undefined {
    return this.generateSimplifiedExplanation(decisionLog, gateResult, itinerary);
  }

  assembleClaudeStateMachineResponse(params: {
    request: RouteAndRunRequestDto;
    startTime: number;
    traceInfo?: { orchestration: any; timestamp: string };
    orchestrationResult: OrchestrationResult;
    policyAction?: PolicyAction;
    /** v1.0 Durable：断点续跑可观测性 */
    durableRun?: { trip_run_id?: string; checkpoint_loaded?: boolean };
  }): RouteAndRunResponseDto {
    const { request, startTime, traceInfo, orchestrationResult, policyAction, durableRun } = params;
    const latency = Date.now() - startTime;

    const currentStep =
      orchestrationResult.result?.state?.current_step || (orchestrationResult.success ? 'DONE' : 'FAILED');
    const gateResult = orchestrationResult.result?.gate_result?.gate_result;

    const stateStartedAt = orchestrationResult.result?.state?.metadata?.started_at;
    const elapsedTime = stateStartedAt ? Date.now() - new Date(stateStartedAt).getTime() : latency;

    const uiState = this.mapOrchestrationStepToUIState(currentStep as OrchestrationStep, gateResult, elapsedTime);

    const isTimeout =
      !orchestrationResult.success &&
      (orchestrationResult.result?.errorType === ErrorType.TIMEOUT_ERROR ||
        orchestrationResult.result?.state?.current_step === 'TIMEOUT' ||
        orchestrationResult.answerText?.includes('超时') ||
        orchestrationResult.answerText?.includes('timeout') ||
        orchestrationResult.answerText?.includes('TIMEOUT'));

    const needsUserConfirmation =
      !orchestrationResult.success && !isTimeout && orchestrationResult.result?.needsUserConfirmation === true;

    const rawState = orchestrationResult.result?.state;
    const verdict = deriveExternalVerdict({
      gateResult: orchestrationResult.result?.gate_result,
      intakeClarifyShortCircuit: shouldIntakeClarifyShortCircuit(rawState),
      policyAction,
      orchestrationSuccess: orchestrationResult.success,
      needsUserConfirmation,
    });
    const finalVerdict = rawState?.metadata?.fallback_used === true ? 'ALLOW_WITH_FALLBACK' : verdict;
    const stateWithVerdict = rawState !== undefined ? { ...rawState, verdict: finalVerdict } : undefined;

    const k3DecisionLog = this.resolveCanonicalDecisionLogForK3(orchestrationResult);
    const evidenceBundle = this.buildEvidenceBundle({
      requestId: request.request_id,
      decisionLog: k3DecisionLog ?? [],
      state: stateWithVerdict as any,
    });

    const resultStatus = isTimeout
      ? 'TIMEOUT'
      : needsUserConfirmation
        ? 'NEED_MORE_INFO'
        : orchestrationResult.success
          ? 'OK'
          : 'FAILED';

    const response: RouteAndRunResponseDto = {
      request_id: request.request_id,
      route: {
        route: RouteType.SYSTEM2_REASONING,
        confidence: 0.8,
        reasons: [RouterReason.LLM_DECISION],
        required_capabilities: ['planning'],
        consent_required: false,
        budget: {
          max_seconds: request.options?.max_seconds || 60,
          max_steps: request.options?.max_steps || 8,
          max_browser_steps: request.options?.max_browser_steps || 0,
        },
        ui_hint: {
          mode: 'slow',
          status: isTimeout
            ? UIStatus.FAILED
            : needsUserConfirmation
              ? UIStatus.AWAITING_CONFIRMATION
              : orchestrationResult.success
                ? UIStatus.DONE
                : UIStatus.FAILED,
          message: isTimeout
            ? '请求超时，请缩小范围或稍后重试。'
            : needsUserConfirmation
              ? '需要您的确认'
              : orchestrationResult.success
                ? '处理完成'
                : '处理失败',
        },
      },
      ui_state: uiState,
      result: {
        status: resultStatus as any,
        answer_text: isTimeout
          ? '请求超时，请缩小范围或稍后重试。'
          : needsUserConfirmation
            ? orchestrationResult.result?.clarificationMessage || orchestrationResult.answerText
            : orchestrationResult.answerText,
        payload: {
          timeline: orchestrationResult.result?.itinerary?.days || [],
          dropped_items: [],
          candidates: this.buildDecisionCandidates(orchestrationResult.result?.decisionState, {
            requestId: request.request_id,
            decisionLog: k3DecisionLog ?? [],
            state: stateWithVerdict as any,
          }),
          alternatives: this.buildDecisionCandidates(orchestrationResult.result?.decisionState, {
            requestId: request.request_id,
            decisionLog: k3DecisionLog ?? [],
            state: stateWithVerdict as any,
          }),
          evidence: stateWithVerdict?.decision_log || [],
          robustness: orchestrationResult.result?.itinerary?.metadata?.robustness_score || null,
          evidence_bundle: evidenceBundle,
          orchestrationResult:
            orchestrationResult.result && stateWithVerdict
              ? {
                  state: stateWithVerdict,
                  itinerary: orchestrationResult.result.itinerary,
                  gate_result: orchestrationResult.result.gate_result,
                  decision_log: k3DecisionLog,
                }
              : undefined,
          travelOntologyState: this.resolveTravelOntologyForPayload(orchestrationResult.result),
          jepa: this.jepaProjector.buildJePaPayload(orchestrationResult.result?.decisionState, stateWithVerdict),
          fallbackPlan: orchestrationResult.result?.state?.metadata?.fallback_plan,
          fallbackExplain: orchestrationResult.result?.state?.metadata?.fallback_explain,
          fallbackPlans: orchestrationResult.result?.state?.metadata?.fallback_plans,
          fallbackSelectedStrategy: orchestrationResult.result?.state?.metadata?.fallback_selected_strategy,
          fallbackTemplateVersion: orchestrationResult.result?.state?.metadata?.fallback_template_version,
          fallbackPacingMode: orchestrationResult.result?.state?.metadata?.fallback_pacing_mode,
          poiTrace: orchestrationResult.result?.state?.metadata?.poi_trace,
          ...this.buildIronShieldPayloadBlocks(stateWithVerdict as OrchestratorState | undefined),
          ...(isTimeout ? { errorType: ErrorType.TIMEOUT_ERROR } : {}),
          ...(needsUserConfirmation
            ? {
                needsUserConfirmation: true,
                clarificationMessage: orchestrationResult.result?.clarificationMessage,
                clarificationQuestions: orchestrationResult.result?.clarificationQuestions,
                missingServices: orchestrationResult.result?.missingServices || [],
                solutions: orchestrationResult.result?.solutions || [],
                errorType: orchestrationResult.result?.errorType,
              }
            : {}),
        } as any,
      },
      explain: {
        decision_log: k3DecisionLog,
        simplified_explanation: this.generateSimplifiedExplanation(
          k3DecisionLog,
          orchestrationResult.result?.gate_result,
          orchestrationResult.result?.itinerary,
        ),
        ai_capability_display: this.generateAICapabilityDisplay(
          orchestrationResult,
          orchestrationResult.result?.gate_result,
          stateWithVerdict,
        ),
        optimization: this.buildOptimizationExplain(orchestrationResult.result?.decisionState),
        kernel_explainability: this.buildKernelExplainability(orchestrationResult.result?.decisionState),
      } as any,
      observability: {
        latency_ms: latency,
        router_ms: 0,
        system_mode: 'SYSTEM2',
        tool_calls: orchestrationResult.stepsExecuted?.length || 0,
        browser_steps: 0,
        tokens_est: 0,
        cost_est_usd: orchestrationResult.totalCost || 0,
        fallback_used: orchestrationResult.result?.state?.metadata?.fallback_used === true,
        fallback_template_version: orchestrationResult.result?.state?.metadata?.fallback_template_version,
        fallback_data_source: orchestrationResult.result?.state?.metadata?.fallback_data_source,
        fallback_source_confidence: orchestrationResult.result?.state?.metadata?.fallback_source_confidence,
        fallback_pacing_mode: orchestrationResult.result?.state?.metadata?.fallback_pacing_mode,
        orchestration_request_id: request.request_id,
        current_step: orchestrationResult.result?.state?.current_step,
        trace: traceInfo,
        ...this.computeP4ObservabilityMetrics(orchestrationResult),
        ...this.resolveHarnessObservability(request, orchestrationResult),
        ...this.resolvePoiPlanningObservability(orchestrationResult),
        ...(durableRun?.trip_run_id ? { durable_trip_run_id: durableRun.trip_run_id } : {}),
        ...(durableRun?.checkpoint_loaded ? { durable_checkpoint_loaded: true } : {}),
        dso_version:
          orchestrationResult.result?.decisionState?.systemState?.version ??
          orchestrationResult.result?.state?.plan_version,
      } as any,
    };

    // C1 strict: final output must carry evidence bundle; candidates must carry evidence bundle.
    if (this.isC1StrictEvidenceBundle()) {
      const payload: any = response.result?.payload ?? {};
      if (!payload.evidence_bundle) {
        throw new Error('C1_STRICT_EVIDENCE_BUNDLE: missing payload.evidence_bundle');
      }
      if (String(payload.evidence_bundle?.verification_status ?? '') === 'FAILED') {
        throw new Error('C1_STRICT_EVIDENCE_BUNDLE: payload evidence_bundle verification_status=FAILED');
      }
      const candidates: any[] = Array.isArray(payload.alternatives) ? payload.alternatives : Array.isArray(payload.candidates) ? payload.candidates : [];
      if (candidates.some((c) => !c?.evidence_bundle)) {
        throw new Error('C1_STRICT_EVIDENCE_BUNDLE: candidate missing evidence_bundle');
      }
      if (candidates.some((c) => String(c?.evidence_bundle?.verification_status ?? '') === 'FAILED')) {
        throw new Error('C1_STRICT_EVIDENCE_BUNDLE: candidate evidence_bundle verification_status=FAILED');
      }
    }

    const metrics = extractMetricsFromResponse(response);
    if (metrics.error_type) MetricsRecorder.recordClarification(metrics.error_type);
    if (metrics.decision_log_completeness !== undefined) {
      MetricsRecorder.recordDecisionLogCompleteness(metrics.decision_log_completeness);
    }

    assertDoneResponseCompleteness(response, {
      stepsExecuted: orchestrationResult.stepsExecuted,
    });

    return response;
  }

  private buildDecisionCandidates(
    decisionState: any | undefined,
    ctx?: { requestId: string; decisionLog: DecisionLogEntry[]; state?: OrchestratorState | null },
  ): DecisionCandidateDto[] {
    const hints = decisionState?.optimizationHints;
    const alts: any[] = Array.isArray(hints?.alternatives) ? hints.alternatives : [];
    const dim = hints?.dimensionBreakdown ?? {};
    const clamp01 = (x: unknown): number | undefined => {
      if (typeof x !== 'number' || !Number.isFinite(x)) return undefined;
      return Math.max(0, Math.min(1, x));
    };
    const safety = clamp01(1 - Math.max(Number(dim.weather ?? 0), Number(dim.fatigue ?? 0)));
    const experience = clamp01(1 - Number(dim.crowdAvoidance ?? 0));
    const costEfficiency = clamp01(1 - Number(dim.budget ?? 0));

    return alts
      .map((a) => ({
        candidate_id: String(a?.id ?? ''),
        itinerary: a?.itinerary ?? undefined,
        score_breakdown: {
          total_utility: clamp01(a?.expectedUtility ?? a?.score),
          dimensions: {
            safety,
            experience,
            cost_efficiency: costEfficiency,
          },
        },
        risk_profile: {
          probability_of_drift: clamp01(
            a?.feasibilityProbability !== undefined ? 1 - Number(a.feasibilityProbability) : undefined,
          ),
          critical_constraints: Array.isArray(a?.violations)
            ? a.violations
                .filter((v: any) => v?.severity === 'SOFT')
                .map((v: any) => String(v?.type ?? ''))
                .filter(Boolean)
            : [],
        },
        explanation: typeof a?.summary === 'string' ? a.summary : undefined,
        evidence_bundle:
          ctx && ctx.requestId
            ? this.buildEvidenceBundle({
                requestId: ctx.requestId,
                decisionLog: ctx.decisionLog ?? [],
                state: ctx.state ?? undefined,
                candidateId: String(a?.id ?? ''),
              })
            : undefined,
      }))
      .filter((c) => c.candidate_id)
      // C1 strict: do not emit candidates without evidence bundle.
      .filter((c) => (this.isC1StrictEvidenceBundle() ? Boolean((c as any).evidence_bundle) : true));
  }

  assembleClaudeDynamicResponse(params: {
    request: RouteAndRunRequestDto;
    startTime: number;
    traceInfo?: { orchestration: any; timestamp: string };
    orchestrationResult: OrchestrationResult;
    system1Result?: { success: boolean; answerText?: string; result?: any };
  }): RouteAndRunResponseDto {
    const { request, startTime, traceInfo, orchestrationResult, system1Result } = params;

    // System 1：由调用方传入 System1Executor 结果（保持现有行为）
    const route = orchestrationResult.result?.routingDecision?.route || RouteType.SYSTEM2_REASONING;
    const isSystem1 = route.startsWith('SYSTEM1');
    if (isSystem1 && orchestrationResult.success && system1Result) {
      const latency = Date.now() - startTime;
      const resp: RouteAndRunResponseDto = {
        request_id: request.request_id,
        route: {
          route: route as any,
          confidence: orchestrationResult.result?.routingDecision?.confidence || 0.8,
          reasons: [RouterReason.LLM_DECISION],
          required_capabilities: orchestrationResult.result?.routingDecision?.requiredCapabilities || [],
          consent_required: false,
          budget: orchestrationResult.result?.routingDecision?.budget || {
            max_seconds: 3,
            max_steps: 1,
            max_browser_steps: 0,
          },
          ui_hint: {
            mode: 'fast',
            status: system1Result.success ? UIStatus.DONE : UIStatus.FAILED,
            message: system1Result.success ? '处理完成' : '处理失败',
          },
        },
        result: {
          status: system1Result.success ? 'OK' : 'FAILED',
          answer_text: system1Result.answerText ?? '',
          payload: {
            timeline: system1Result.result?.timeline || [],
            dropped_items: system1Result.result?.dropped_items || [],
            candidates: system1Result.result?.candidates || [],
            evidence: system1Result.result?.evidence || [],
            robustness: system1Result.result?.robustness || null,
            ...this.buildIronShieldPayloadBlocks(orchestrationResult.result?.state as OrchestratorState | undefined),
          },
        },
        explain: {
          decision_log: orchestrationResult.decisionLog || [],
          simplified_explanation: this.generateSimplifiedExplanation(
            orchestrationResult.decisionLog || [],
            orchestrationResult.result?.gate_result,
            orchestrationResult.result?.itinerary,
          ),
          ai_capability_display: this.generateAICapabilityDisplay(
            orchestrationResult,
            orchestrationResult.result?.gate_result,
            orchestrationResult.result?.state,
          ),
          optimization: this.buildOptimizationExplain(orchestrationResult.result?.decisionState),
        } as any,
        observability: {
          latency_ms: latency,
          router_ms: 0,
          system_mode: 'SYSTEM1',
          tool_calls: 1,
          browser_steps: 0,
          tokens_est: 0,
          cost_est_usd: 0,
          fallback_used: false,
          orchestration_request_id: request.request_id,
          current_step: orchestrationResult.result?.state?.current_step,
          trace: traceInfo,
          ...this.computeP4ObservabilityMetrics(orchestrationResult),
          ...this.resolveHarnessObservability(request, orchestrationResult),
          ...this.resolvePoiPlanningObservability(orchestrationResult),
        } as any,
      };
      return resp;
    }

    // System 2：保持现有逻辑
    const latency = Date.now() - startTime;
    const isTimeout =
      !orchestrationResult.success &&
      (orchestrationResult.result?.errorType === ErrorType.TIMEOUT_ERROR ||
        orchestrationResult.answerText?.includes('超时') ||
        orchestrationResult.answerText?.includes('timeout') ||
        orchestrationResult.answerText?.includes('TIMEOUT'));

    const needsUserConfirmation =
      !orchestrationResult.success && !isTimeout && orchestrationResult.result?.needsUserConfirmation === true;
    const clarificationMessage = orchestrationResult.result?.clarificationMessage || orchestrationResult.answerText;

    const resultStatus = isTimeout
      ? 'TIMEOUT'
      : needsUserConfirmation
        ? 'NEED_MORE_INFO'
        : orchestrationResult.success
          ? 'OK'
          : 'FAILED';

    const k3DecisionLogClaude = this.resolveCanonicalDecisionLogForK3(orchestrationResult);

    const response: RouteAndRunResponseDto = {
      request_id: request.request_id,
      route: {
        route: route as any,
        confidence: orchestrationResult.result?.routingDecision?.confidence || 0.8,
        reasons: [RouterReason.LLM_DECISION],
        required_capabilities: orchestrationResult.result?.routingDecision?.requiredCapabilities || [],
        consent_required: orchestrationResult.result?.routingDecision?.consentRequired || false,
        budget: orchestrationResult.result?.routingDecision?.budget || {
          max_seconds: 60,
          max_steps: 8,
          max_browser_steps: 0,
        },
        ui_hint: {
          mode: isSystem1 ? 'fast' : 'slow',
          status: isTimeout
            ? UIStatus.FAILED
            : needsUserConfirmation
              ? UIStatus.AWAITING_CONFIRMATION
              : orchestrationResult.success
                ? UIStatus.DONE
                : UIStatus.FAILED,
          message: isTimeout
            ? '请求超时，请缩小范围或稍后重试。'
            : needsUserConfirmation
              ? '需要您的确认'
              : orchestrationResult.success
                ? '处理完成'
                : '处理失败',
        },
      },
      result: {
        status: resultStatus as any,
        answer_text: isTimeout ? '请求超时，请缩小范围或稍后重试。' : needsUserConfirmation ? clarificationMessage : orchestrationResult.answerText,
        payload: {
          timeline: [],
          dropped_items: [],
          candidates: this.buildDecisionCandidates(orchestrationResult.result?.decisionState),
          alternatives: this.buildDecisionCandidates(orchestrationResult.result?.decisionState),
          evidence: [],
          robustness: null,
          ...(orchestrationResult.result && (orchestrationResult.result as any).state
            ? {
                orchestrationResult: {
                  state: (orchestrationResult.result as any).state,
                  itinerary: (orchestrationResult.result as any).itinerary,
                  gate_result: (orchestrationResult.result as any).gate_result,
                  decision_log: k3DecisionLogClaude,
                },
              }
            : {}),
          travelOntologyState: this.resolveTravelOntologyForPayload(orchestrationResult.result),
          ...(isTimeout ? { errorType: ErrorType.TIMEOUT_ERROR } : {}),
          ...(needsUserConfirmation
            ? {
                needsUserConfirmation: true,
                clarificationMessage: orchestrationResult.result?.clarificationMessage,
                clarificationQuestions: orchestrationResult.result?.clarificationQuestions,
                missingServices: orchestrationResult.result?.missingServices || [],
                solutions: orchestrationResult.result?.solutions || [],
                errorType: orchestrationResult.result?.errorType,
              }
            : {}),
          ...this.buildIronShieldPayloadBlocks((orchestrationResult.result as any)?.state as OrchestratorState | undefined),
        } as any,
      },
      explain: {
        decision_log: k3DecisionLogClaude,
      } as any,
      observability: {
        latency_ms: latency,
        router_ms: 0,
        system_mode: isSystem1 ? 'SYSTEM1' : 'SYSTEM2',
        tool_calls: orchestrationResult.stepsExecuted.length,
        browser_steps: 0,
        tokens_est: TokenCalculator.estimateTotalTokens(request.message, orchestrationResult.answerText, {
          orchestrationResult: orchestrationResult.result,
          stepsExecuted: orchestrationResult.stepsExecuted,
          decisionLog: k3DecisionLogClaude,
        }),
        cost_est_usd: orchestrationResult.totalCost || 0,
        fallback_used: false,
        orchestration_request_id: request.request_id,
        current_step: orchestrationResult.result?.state?.current_step,
        trace: traceInfo,
        ...this.computeP4ObservabilityMetrics(orchestrationResult),
        ...this.resolveHarnessObservability(request, orchestrationResult),
        ...this.resolvePoiPlanningObservability(orchestrationResult),
        dso_version:
          orchestrationResult.result?.decisionState?.systemState?.version ??
          orchestrationResult.result?.state?.plan_version,
      } as any,
    };

    if (resultStatus === 'OK' && !isSystem1) {
      assertDoneResponseCompleteness(response, {
        stepsExecuted: orchestrationResult.stepsExecuted,
      });
    }

    return response;
  }

  // ==================== helpers (migrated from AgentService) ====================

  /** Phase 2.0：poiPlanning slice + 真实 outcome（POI_SELECTION / itinerary）供聚合与前后对比 */
  private resolvePoiPlanningObservability(orchestrationResult: OrchestrationResult): Record<string, unknown> {
    const raw = orchestrationResult.result as
      | { state?: OrchestratorState; decisionState?: DecisionState }
      | undefined;
    const meta = raw?.state?.metadata as Record<string, unknown> | undefined;
    const bundle = meta?.poiPlanningOutcome as Record<string, unknown> | undefined;
    const sliceDso = raw?.decisionState?.poiPlanning;
    if (!bundle && !sliceDso) return {};
    const compactFromMeta = bundle?.slice as Record<string, unknown> | undefined;
    return {
      poi_planning: {
        regionId: compactFromMeta?.regionId ?? sliceDso?.routeIntent?.regionId,
        feasibility: compactFromMeta?.feasibility ?? sliceDso?.schedulePlan?.feasibility,
        resolution: compactFromMeta?.resolution ?? sliceDso?.resolution,
        appliedBackoffSteps: compactFromMeta?.appliedBackoffSteps ?? sliceDso?.appliedBackoffSteps,
        budgetGateApplied: compactFromMeta?.budgetGateApplied ?? sliceDso?.budgetGateApplied,
        outcome: bundle,
      },
    };
  }

  private resolveHarnessObservability(
    request: RouteAndRunRequestDto,
    orchestrationResult: OrchestrationResult,
  ): {
    harness_active_trace_id: string | null;
    harness_trace_export_path: string | null;
    evaluation_run_id: string | null;
  } {
    const ds = orchestrationResult.result?.decisionState as DecisionState | undefined;
    const hr = ds?.harnessRuntime;
    return {
      harness_active_trace_id: hr?.activeTraceId ?? null,
      harness_trace_export_path: hr?.traceExportRelativePath ?? null,
      evaluation_run_id: request.meta?.run_id ?? hr?.evaluationRunId ?? null,
    };
  }

  private resolveTravelOntologyForPayload(
    result: unknown,
  ): DecisionState['travelOntologyState'] | undefined {
    if (!result || typeof result !== 'object') return undefined;
    const r = result as { state?: OrchestratorState; decisionState?: DecisionState };
    const fromDso = r.decisionState?.travelOntologyState;
    const fromOs = r.state ? buildTravelOntologyStateFromOrchestrator(r.state) : undefined;
    if (!fromDso) return fromOs;
    if (!fromOs) return fromDso;
    return mergeTravelOntologyState(fromDso, fromOs) ?? fromDso;
  }

  private computeP4ObservabilityMetrics(orchestrationResult: OrchestrationResult): {
    step_latency_ms?: Record<string, number>;
    gate_block_rate?: number;
    skill_success_rate?: number;
  } {
    const out: { step_latency_ms?: Record<string, number>; gate_block_rate?: number; skill_success_rate?: number } = {};
    const log = this.resolveCanonicalDecisionLogForK3(orchestrationResult);
    const steps = orchestrationResult.stepsExecuted || [];

    if (log.length > 0) {
      const stepLatency: Record<string, number> = {};
      for (const e of log) {
        const ms = (e as any).metadata?.duration_ms ?? 0;
        if ((e as any).step && ms > 0) {
          stepLatency[(e as any).step] = (stepLatency[(e as any).step] ?? 0) + ms;
        }
      }
      if (Object.keys(stepLatency).length > 0) out.step_latency_ms = stepLatency;
    } else if (steps.length > 0) {
      const stepLatency: Record<string, number> = {};
      for (const s of steps) {
        if ((s as any).stepId && (s as any).duration > 0) {
          stepLatency[(s as any).stepId] = (stepLatency[(s as any).stepId] ?? 0) + (s as any).duration;
        }
      }
      if (Object.keys(stepLatency).length > 0) out.step_latency_ms = stepLatency;
    }

    const gateResult = orchestrationResult.result?.gate_result?.gate_result;
    if (gateResult !== undefined) {
      out.gate_block_rate = gateResult === 'BLOCK' ? 1 : 0;
    }

    if (steps.length > 0) {
      const ok = steps.filter((s: any) => s.success).length;
      out.skill_success_rate = ok / steps.length;
    }

    return out;
  }

  private resolveCanonicalDecisionLogForK3(orchestrationResult: OrchestrationResult): DecisionLogEntry[] {
    const r = orchestrationResult.result as {
      decision_log?: DecisionLogEntry[];
      state?: OrchestratorState;
    };
    const fromState = (r as any)?.state?.decision_log;
    if (Array.isArray(fromState)) return fromState;
    const fromResult = (r as any)?.decision_log;
    if (Array.isArray(fromResult)) return fromResult;
    return orchestrationResult.decisionLog ?? [];
  }

  private buildKernelExplainability(
    decisionState?: DecisionState,
  ): RouteAndRunResponseDto['explain']['kernel_explainability'] {
    if (!decisionState) return undefined;
    const violations = decisionState.constraints?.violations;
    const hints = decisionState.optimizationHints as
      | {
          method?: string;
          recommendedAlternativeId?: string;
        }
      | undefined;
    const row: NonNullable<RouteAndRunResponseDto['explain']['kernel_explainability']> = {
      dso_version: decisionState.systemState?.version,
      last_step: decisionState.systemState?.lastStep,
      current_phase: decisionState.systemState?.currentPhase,
      cursor_step: decisionState.systemState?.cursorStep as string | undefined,
    };
    if (violations && violations.length > 0) {
      row.constraint_violations = violations.map((v) => ({
        type: v.type,
        severity: v.severity,
        detail: v.detail,
        ...(v.constraint ? { constraint: v.constraint } : {}),
      }));
    }
    if (hints?.method) row.optimization_method = hints.method;
    if (hints?.recommendedAlternativeId) row.recommended_alternative_id = hints.recommendedAlternativeId;

    const shadow = decisionState.harnessRuntime?.shadow_harness_events;
    if (shadow?.length) {
      row.harness_shadow_events = shadow.map((e) => ({
        kernel_phase: e.kernel_phase,
        harness_step: e.harness_step,
        run_status: e.run_status,
        harness_warning: e.harness_warning,
        validation_results: e.validation_results,
        recorded_at: e.recorded_at,
      }));
      const bad = shadow.filter((e) => e.run_status !== 'PASSED' && e.run_status !== 'REPAIRED');
      if (bad.length) {
        row.harness_shadow_summary = `SHADOW_VIOLATIONS(${bad.length}): ${bad
          .map((b) => `${b.harness_step}=${b.run_status}`)
          .join('; ')}`;
      }
    }

    const rad = decisionState.harnessRuntime?.resume_admission_step;
    if (rad !== undefined && rad !== null && String(rad).length > 0) {
      row.resume_admission = {
        step: String(rad),
        passed: decisionState.harnessRuntime?.resume_admission_passed,
      };
    }

    const meaningful =
      row.dso_version !== undefined ||
      !!row.last_step ||
      !!row.current_phase ||
      !!row.cursor_step ||
      (row.constraint_violations && row.constraint_violations.length > 0) ||
      !!row.optimization_method ||
      !!row.recommended_alternative_id ||
      (row.harness_shadow_events && row.harness_shadow_events.length > 0) ||
      !!row.harness_shadow_summary ||
      !!row.resume_admission;
    return meaningful ? row : undefined;
  }

  private buildOptimizationExplain(decisionState?: DecisionState): RouteAndRunResponseDto['explain']['optimization'] {
    const hints = decisionState?.optimizationHints;
    if (!hints) return undefined;
    return {
      method: (hints as any).method,
      recommended_alternative_id: (hints as any).recommendedAlternativeId,
      alternatives: (hints as any).alternatives?.map((a: any) => ({
        id: a.id,
        score: a.score,
        expected_utility: a.expectedUtility,
        feasibility_probability: a.feasibilityProbability,
        confidence_interval: a.confidenceInterval,
      })),
    } as any;
  }

  private mapOrchestrationStepToUIState(
    step: OrchestrationStep,
    gateResult?: string,
    elapsedTime?: number,
  ): {
    phase: OrchestrationStep;
    ui_status:
      | 'thinking'
      | 'browsing'
      | 'verifying'
      | 'repairing'
      | 'awaiting_consent'
      | 'awaiting_confirmation'
      | 'done'
      | 'failed';
    progress_percent: number;
    message: string;
    requires_user_action: boolean;
    estimated_time_remaining_ms?: number;
    current_step_detail?: string;
  } {
    const stepProgressMap: Record<OrchestrationStep, number> = {
      INTAKE: 8.0,
      STATE_UPDATE: 10.0,
      RESEARCH: 18.0,
      POI_SELECTION: 24.0,
      GATE_EVAL: 28.0,
      CONTEXT_BUILD: 32.0,
      PLAN_GEN: 42.0,
      OPTIMIZE: 48.0,
      VERIFY: 55.0,
      COMPLIANCE: 62.0,
      REPAIR: 72.0,
      NARRATE: 82.0,
      FEEDBACK: 92.0,
      DONE: 100.0,
      FAILED: 0,
      TIMEOUT: 0,
      HALLUCINATION_DETECTION: 96.0,
    };

    const stepMessageMap: Record<OrchestrationStep, string> = {
      INTAKE: '正在解析请求...',
      STATE_UPDATE: '正在更新决策状态...',
      RESEARCH: '正在收集数据...',
      POI_SELECTION: '正在筛选候选地点...',
      GATE_EVAL: '正在评估行程可行性...',
      CONTEXT_BUILD: '正在构建上下文...',
      PLAN_GEN: '正在生成行程安排...',
      OPTIMIZE: '正在抽取优化提示...',
      VERIFY: '正在验证行程...',
      COMPLIANCE: '正在检查风险合规...',
      REPAIR: '正在修复行程问题...',
      NARRATE: '正在生成说明...',
      FEEDBACK: '正在收集反馈信号...',
      DONE: '处理完成',
      FAILED: '处理失败',
      TIMEOUT: '请求超时',
      HALLUCINATION_DETECTION: '正在检测内容真实性...',
    };

    const stepEstimatedTimeMap: Record<OrchestrationStep, number> = {
      INTAKE: 2000,
      STATE_UPDATE: 100,
      RESEARCH: 8000,
      POI_SELECTION: 1500,
      GATE_EVAL: 5000,
      CONTEXT_BUILD: 3000,
      PLAN_GEN: 10000,
      OPTIMIZE: 100,
      VERIFY: 6000,
      COMPLIANCE: 3000,
      REPAIR: 4000,
      NARRATE: 3000,
      FEEDBACK: 2000,
      DONE: 0,
      FAILED: 0,
      TIMEOUT: 0,
      HALLUCINATION_DETECTION: 2000,
    };

    const stepDetailMap: Record<OrchestrationStep, string> = {
      INTAKE: '分析您的需求，提取关键信息（目的地、日期、预算等）',
      STATE_UPDATE: '同步 OrchestratorState 到 Decision Kernel',
      RESEARCH: '查询交通、POI、开放时间、DEM地形等数据',
      POI_SELECTION: '对候选 POI 做排序与裁剪，为 PLAN_GEN 提供输入',
      GATE_EVAL: '评估路线安全性、可达性和可行性（三人格评审）',
      CONTEXT_BUILD: '构建 Context Package 供 PLAN 使用',
      PLAN_GEN: '生成详细的行程安排，包括时间、地点、交通方式',
      OPTIMIZE: '抽取安全/疲劳趋势等优化提示',
      VERIFY: '验证时间冲突、换乘时间、开放时间等',
      COMPLIANCE: '检查风险分类、合规要求和免责留痕',
      REPAIR: '修复发现的问题，优化行程（如需要）',
      NARRATE: '生成用户友好的行程说明和提示',
      FEEDBACK: '收集用户反馈信号用于决策优化',
      DONE: '所有步骤已完成',
      FAILED: '处理过程中出现错误',
      TIMEOUT: '请求超时，请缩小范围或稍后重试',
      HALLUCINATION_DETECTION: '检测生成内容中的事实声明，确保信息准确性',
    };

    let uiStatus:
      | 'thinking'
      | 'browsing'
      | 'verifying'
      | 'repairing'
      | 'awaiting_consent'
      | 'awaiting_confirmation'
      | 'done'
      | 'failed' = 'thinking';
    let requiresUserAction = false;

    switch (step) {
      case 'INTAKE':
      case 'RESEARCH':
      case 'POI_SELECTION':
      case 'PLAN_GEN':
      case 'NARRATE':
      case 'FEEDBACK':
        uiStatus = 'thinking';
        break;
      case 'GATE_EVAL':
        uiStatus = 'verifying';
        if (gateResult === 'NEED_CONFIRM') {
          uiStatus = 'awaiting_confirmation';
          requiresUserAction = true;
        }
        break;
      case 'VERIFY':
      case 'COMPLIANCE':
        uiStatus = 'verifying';
        break;
      case 'REPAIR':
        uiStatus = 'repairing';
        break;
      case 'DONE':
        uiStatus = 'done';
        break;
      case 'FAILED':
      case 'TIMEOUT':
        uiStatus = 'failed';
        break;
      case 'HALLUCINATION_DETECTION':
        uiStatus = 'verifying';
        break;
    }

    let estimatedTimeRemaining: number | undefined;
    if (elapsedTime !== undefined && step !== 'DONE' && step !== 'FAILED' && step !== 'TIMEOUT') {
      const currentStepTime = stepEstimatedTimeMap[step];
      const currentStepRemaining = Math.max(0, currentStepTime - elapsedTime);
      estimatedTimeRemaining = currentStepRemaining;
    }

    return {
      phase: step,
      ui_status: uiStatus,
      progress_percent: stepProgressMap[step] || 0,
      message: stepMessageMap[step] || '处理中...',
      requires_user_action: requiresUserAction,
      estimated_time_remaining_ms: estimatedTimeRemaining,
      current_step_detail: stepDetailMap[step],
    };
  }

  private generateSimplifiedExplanation(
    decisionLog: DecisionLogEntry[],
    gateResult?: GateResult,
    itinerary?: Itinerary,
  ): SimplifiedExplanation | undefined {
    if (!decisionLog || decisionLog.length === 0) return undefined;

    const keyDecisions: Array<{ step: string; decision: string; impact: 'HIGH' | 'MEDIUM' | 'LOW' }> = [];
    if (gateResult) {
      keyDecisions.push({
        step: 'GATE_EVAL',
        decision: this.translateGateResult(gateResult.gate_result),
        impact: 'HIGH',
      });
    }

    const keySteps = ['GATE_EVAL', 'PLAN_GEN', 'VERIFY', 'REPAIR'];
    for (const entry of decisionLog) {
      if (keySteps.includes((entry as any).step)) {
        keyDecisions.push({
          step: (entry as any).step,
          decision: this.simplifyDecisionMessage(entry),
          impact: this.assessDecisionImpact(entry),
        });
      }
    }

    const filteredDecisions = keyDecisions.filter((d) => d.impact === 'HIGH' || d.impact === 'MEDIUM');
    const summary = this.generateDecisionSummary(gateResult, filteredDecisions);

    return {
      summary,
      key_decisions: filteredDecisions.slice(0, 5),
      evidence_count: decisionLog.reduce((sum, entry) => sum + (((entry as any).evidence_refs?.length as number) || 0), 0),
      risk_tags_summary: this.buildRiskTagsSummary(itinerary),
      has_details: true,
    };
  }

  private buildRiskTagsSummary(
    itinerary?: Itinerary,
  ): Array<{ tag: ItineraryRiskTag; count: number }> | undefined {
    if (!itinerary?.days?.length) return undefined;
    const counter = new Map<ItineraryRiskTag, number>();
    for (const day of itinerary.days) {
      for (const item of (day as any).items ?? []) {
        const tags = (item as any).metadata?.risk_tags as ItineraryRiskTag[] | undefined;
        if (!tags?.length) continue;
        for (const tag of tags) counter.set(tag, (counter.get(tag) ?? 0) + 1);
      }
    }
    if (counter.size === 0) return undefined;
    return Array.from(counter.entries())
      .sort((a, b) => b[1] - a[1])
      .slice(0, 5)
      .map(([tag, count]) => ({ tag, count }));
  }

  private translateGateResult(status: string): string {
    const translations: Record<string, string> = {
      ALLOW: '已通过',
      BLOCK: '被拒绝',
      ADJUST_REQUIRED: '需要调整',
      NEED_USER_CONFIRM: '需要您确认',
    };
    return translations[status] || status;
  }

  private simplifyDecisionMessage(entry: DecisionLogEntry): string {
    let message = (entry as any).outputs_summary || (entry as any).inputs_summary || '';
    message = message.replace(/GATE_EVAL/g, '可行性评估');
    message = message.replace(/PLAN_GEN/g, '行程生成');
    message = message.replace(/VERIFY/g, '验证');
    message = message.replace(/REPAIR/g, '修复');
    message = message.replace(/INTAKE/g, '需求解析');
    message = message.replace(/RESEARCH/g, '数据收集');
    message = message.replace(/NARRATE/g, '说明生成');
    if (message.length > 100) message = message.substring(0, 97) + '...';
    return message;
  }

  private assessDecisionImpact(entry: DecisionLogEntry): 'HIGH' | 'MEDIUM' | 'LOW' {
    if ((entry as any).step === 'GATE_EVAL') return 'HIGH';
    if ((entry as any).step === 'PLAN_GEN' || (entry as any).step === 'REPAIR') return 'HIGH';
    if ((entry as any).step === 'VERIFY') return 'MEDIUM';
    return 'LOW';
  }

  private generateDecisionSummary(
    gateResult: GateResult | undefined,
    keyDecisions: Array<{ step: string; decision: string; impact: string }>,
  ): string {
    const parts: string[] = [];
    if (gateResult) parts.push(`行程${this.translateGateResult(gateResult.gate_result)}`);
    if (keyDecisions.length > 0) parts.push(`进行了${keyDecisions.length}项关键检查`);
    return parts.length > 0 ? parts.join('，') + '。' : '已完成行程规划。';
  }

  private generateAICapabilityDisplay(
    orchestrationResult: any,
    gateResult?: GateResult,
    state?: any,
  ): AICapabilityDisplay | undefined {
    if (!orchestrationResult.success && !gateResult) return undefined;

    const capabilitiesUsed: Array<{ name: string; description: string; status: 'SUCCESS' | 'PARTIAL' | 'FAILED' }> = [];

    const decisionLog = orchestrationResult.decisionLog || [];
    const skillsUsed = new Set<string>();
    for (const entry of decisionLog) {
      const toolCalls = (entry as any)?.metadata?.tool_calls;
      if (Array.isArray(toolCalls)) {
        toolCalls.forEach((call: any) => {
          if (call.skill_name) skillsUsed.add(call.skill_name);
        });
      }
    }

    if (gateResult) {
      capabilitiesUsed.push({
        name: '安全评估',
        description: '评估路线安全性和可行性',
        status: gateResult.gate_result === 'ALLOW' ? 'SUCCESS' : 'PARTIAL',
      });
    }
    if (state?.itinerary) {
      capabilitiesUsed.push({
        name: '行程生成',
        description: '生成详细的行程安排',
        status: 'SUCCESS',
      });
    }

    if (skillsUsed.has('transport.search')) {
      capabilitiesUsed.push({ name: '交通查询', description: '查询交通班次和路线', status: 'SUCCESS' });
    }
    if (skillsUsed.has('poi.search')) {
      capabilitiesUsed.push({ name: '地点搜索', description: '搜索和推荐景点', status: 'SUCCESS' });
    }
    if (skillsUsed.has('dem.get.profile')) {
      capabilitiesUsed.push({ name: '地形分析', description: '分析地形和体力消耗', status: 'SUCCESS' });
    }

    const evidenceCount = decisionLog.reduce((sum: number, entry: any) => sum + (entry.evidence_refs?.length || 0), 0);
    const dataCompleteness = evidenceCount > 0 ? Math.min(1, evidenceCount / 10) : 0.5;
    const dataFreshness = 0.9;
    const dataReliability = gateResult?.confidence || 0.8;

    const gateConfidence = gateResult?.confidence || 0.8;
    const planConfidence = state?.itinerary ? 0.85 : 0.5;
    const overallConfidence = (gateConfidence + planConfidence) / 2;

    const limitations: Array<{
      type: 'DATA_MISSING' | 'SERVICE_UNAVAILABLE' | 'UNCERTAINTY' | 'ASSUMPTION';
      description: string;
      impact: 'LOW' | 'MEDIUM' | 'HIGH';
    }> = [];

    if (dataCompleteness < 0.8) {
      limitations.push({ type: 'DATA_MISSING', description: '部分数据可能不完整', impact: 'MEDIUM' });
    }
    if (gateResult?.gate_result === 'ADJUST_REQUIRED') {
      limitations.push({ type: 'UNCERTAINTY', description: '行程需要根据实际情况调整', impact: 'MEDIUM' });
    }
    if (overallConfidence < 0.7) {
      limitations.push({ type: 'UNCERTAINTY', description: '部分决策基于估算，建议人工确认', impact: 'HIGH' });
    }

    const riskSummary = this.buildRiskTagsSummary(state?.itinerary ?? orchestrationResult?.result?.itinerary);
    if (riskSummary && riskSummary.length > 0) {
      const top = riskSummary.slice(0, 3);
      const labels = top.map((x) => `${x.tag}(${x.count})`).join('、');
      const highImpactTags = new Set<ItineraryRiskTag>(['SAFETY', 'HEALTH']);
      const hasHigh = top.some((x) => highImpactTags.has(x.tag));
      limitations.push({
        type: 'UNCERTAINTY',
        description: `风险标签摘要：${labels}`,
        impact: hasHigh ? 'HIGH' : 'MEDIUM',
      });
    }

    return {
      success: orchestrationResult.success,
      capabilities_used: capabilitiesUsed,
      data_quality: {
        completeness: dataCompleteness,
        freshness: dataFreshness,
        reliability: dataReliability,
      },
      confidence: {
        overall: overallConfidence,
        gate_evaluation: gateConfidence,
        plan_generation: planConfidence,
      },
      limitations: limitations.length > 0 ? limitations : undefined,
    };
  }
}


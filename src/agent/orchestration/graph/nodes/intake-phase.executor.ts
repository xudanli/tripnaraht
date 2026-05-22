import type { DecisionState } from '../../../../decision/kernel/decision-state.types';
import type { LlmProvider } from '../../../../llm/dto/llm-request.dto';
import type { RouteAndRunRequestDto } from '../../../dto/route-and-run.dto';
import type { AgentContext } from '../../../interfaces/claude-orchestration.interface';
import type { OrchestratorState } from '../../../interfaces/trip-plan.interface';
import type { EarlyWarning } from '../../../services/shadow-conflict-scanner.service';
import { SignatureBuilder } from '../../../cbr/signature-builder.util';
import {
  collectDecisionEvidenceSummaries,
  computeDecisionEvidenceFingerprint,
} from '../../../utils/decision-evidence-fingerprint.util';
import {
  formatIntakeInputsPreviewZh,
  formatIntakeOutputsZh,
} from '../../../utils/decision-log-user-facing.zh.util';
import {
  generateClarificationQuestions,
  identifyGapsFromRequest,
  type IntakeGap,
} from '../../../utils/clarification-question-generator.util';
import {
  isStructuredClarificationEchoMessage,
  rebuildTripPlanMessagePreservingSystemBlocks,
  resolveCanonicalIntakeUserMessage,
} from '../../../utils/trip-plan-intake-message.util';
import { reconcileTripPlanVehicleConstraints } from '../../../utils/trip-plan-intake-vehicle.util';
import {
  applyFroadHighlandSignalsToTripPlan,
  buildFroadHighlandIntentSignals,
} from '../../../utils/froad-intake-signals.util';
import {
  applyPeakSeasonTimeShiftSignalsToTripPlan,
  buildPeakSeasonTimeShiftSignals,
} from '../../../utils/peak-season-time-shift-intake.util';
import {
  buildFroad2wdIntakeClarificationQuestion,
  buildMarathonIntakeClarificationQuestion,
  buildPeakSeasonTimeShiftIntakeClarificationQuestion,
  isFroad2wdIntakeClarificationPending,
  isMarathonDeferredIntakeClarificationPending,
  isPeakSeasonTimeShiftIntakeClarificationPending,
} from '../../../utils/structured-intake-clarification.util';
import {
  analyzeRouteAndRunIntent,
  type TripDaySnapshotForPlacement,
} from '../../../utils/route-and-run-intent-analyzer.util';
import type { IntakeExecutorContext } from '../../../../decision/kernel/interfaces/phase-executor.interface';
import { appendItineraryAdjustSystemHints } from '../../../utils/itinerary-adjust-intent.util';
import {
  buildItinerarySlotPlacementClarificationQuestion,
  isItinerarySlotPlacementIntakeClarificationPending,
} from '../../../utils/itinerary-slot-placement.util';
import {
  applyIntakeFitnessMaterialToTripPlanMessage,
  consumeIntakeFitnessMaterial,
} from './intake-request-sanitizer.util';
import type { IntakePhaseHost, RunIntakePhaseParams } from './intake-phase.host';

/**
 * INTAKE 内核/降级执行体（自 claude-orchestrator 迁出）。
 * 经 DecisionKernel.executeIntake → Context Lint + Harness 硬门；旁路 __* 键在漏斗口熔断。
 */
export async function runIntakePhase(host: IntakePhaseHost, params: RunIntakePhaseParams): Promise<void> {
  const { request, state, llmProvider: _provider } = params;

    state.current_step = 'INTAKE';
    const stepStartTime = Date.now();

    host.logger.debug(`[Claude Orchestrator] 执行 INTAKE 步骤...`);

    try {
      state.metadata = {
        ...(state.metadata ?? {}),
        clarification_locale: request.conversation_context?.locale,
      } as any;

      let tripPlanRequest = host.convertToTripPlanRequest(request, state);
      await host.hydrateTripPlanRequestFromTripRecord(request, tripPlanRequest, state);

      // Constraint Zone (Temporal hard deadlines): make them explicitly visible to downstream LLM/planning skills.
      // We keep it as a high-weight system hint embedded in TripPlanRequest.message (best-effort, backwards compatible).
      const hardDeadlines = (request as any)?.emergency_constraints?.hard_deadlines as Record<string, string> | undefined;
      if (hardDeadlines && typeof hardDeadlines === 'object' && Object.keys(hardDeadlines).length > 0) {
        const lines = Object.entries(hardDeadlines)
          .slice(0, 10)
          .map(([k, v]) => `- ${String(k)} 截止于 ${String(v)}`);
        const sysHint =
          `[SYSTEM_MESSAGE][CONSTRAINT_ZONE][TEMPORAL_DEADLINE]\n` +
          `注意：以下 POI/Segment 受到物理环境限制（如日落），必须在指定时间前结束。\n` +
          `${lines.join('\n')}\n` +
          `如果当前计划冲突，请优先尝试调换行程顺序（例如将上午的室内活动挪至傍晚，或将高风险户外活动提前）。\n`;
        tripPlanRequest.message = `${sysHint}\n${tripPlanRequest.message ?? request.message ?? ''}`.trim();
        state.decision_log.push({
          request_id: state.request_id,
          step: 'INTAKE',
          actor: 'Orchestrator',
          inputs_summary: 'emergency_constraints.hard_deadlines → Constraint Zone system hint',
          outputs_summary: `TEMPORAL_DEADLINES=${Object.keys(hardDeadlines).length}`,
          evidence_refs: [],
          timestamp: new Date().toISOString(),
          metadata: {
            system_action: 'CONSTRAINT_ZONE_TEMPORAL_DEADLINE',
            hard_deadlines: hardDeadlines,
          },
        });
      }

      tripPlanRequest = applyIntakeFitnessMaterialToTripPlanMessage(
        tripPlanRequest,
        request,
        consumeIntakeFitnessMaterial(request),
      );

      // 闭环：消费澄清回合答案 → 组合放宽补丁 / 或用户批准终止
      const clarificationAnswers = (request as any).clarification_answers as any[] | undefined;
      if (Array.isArray(clarificationAnswers) && clarificationAnswers.length > 0) {
        (state.metadata as Record<string, unknown>).clarification_answers = clarificationAnswers;
      }
      if (host.clarificationHandler && Array.isArray(clarificationAnswers) && clarificationAnswers.length > 0) {
        const {
          tripPlanRequest: patched,
          applied,
          terminalIntent,
          fingerprint,
          earlyWarningProceedAtOwnRisk,
          didPatch,
          transportClarificationApplied,
        } = host.clarificationHandler.applyRelaxationsFromAnswers(tripPlanRequest, clarificationAnswers);
        // 防御性：记录 fingerprint 与重试次数到 DSO.systemState（用于识别无效重复尝试）
        if (host.decisionKernel && (state as any).decisionState) {
          // no-op: decisionState 不在 state 上；留给 STATE_UPDATE 后统一写入
        }
        if (terminalIntent) {
          state.metadata = {
            ...(state.metadata ?? {}),
            terminal_intent: terminalIntent,
            last_relaxation_fingerprint: fingerprint,
          } as any;
          state.decision_log.push({
            request_id: state.request_id,
            step: 'STATE_UPDATE',
            actor: 'Orchestrator',
            inputs_summary: 'clarification_answers → TerminalIntent',
            outputs_summary: 'CONSENSUS_REACHED: NO_FEASIBLE_PATH',
            evidence_refs: [],
            timestamp: new Date().toISOString(),
            metadata: {
              system_action: 'CONSENSUS_REACHED_NO_FEASIBLE_PATH',
              terminal_intent: terminalIntent,
              fingerprint,
            },
          });
        } else if (applied.length > 0 || didPatch) {
          tripPlanRequest = patched;
          state.metadata = {
            ...(state.metadata ?? {}),
            applied_relaxations: applied,
            last_relaxation_fingerprint: fingerprint,
          } as any;
          state.decision_log.push({
            request_id: state.request_id,
            step: 'STATE_UPDATE',
            actor: 'Orchestrator',
            inputs_summary: 'clarification_answers → CompositeRelaxationPatch',
            outputs_summary: `RELAXATION_APPLIED: ${applied.map((a) => a.id).join('+')}`,
            evidence_refs: [],
            timestamp: new Date().toISOString(),
            metadata: {
              system_action: 'RELAXATION_APPLIED',
              applied_relaxations: applied,
              fingerprint,
            },
          });
        }

        if (earlyWarningProceedAtOwnRisk) {
          const ew = (state.metadata as any)?.early_warning as EarlyWarning | undefined;
          // 此时我们可能还没有 VERIFY 报告；保持绑定的稳定性和轻量级。
          const evidence = collectDecisionEvidenceSummaries(undefined);
          const fp = computeDecisionEvidenceFingerprint(evidence);
          state.metadata = {
            ...(state.metadata ?? {}),
            early_warning_acknowledged: true,
            early_warning_proceed_at: new Date().toISOString(),
            ...(fingerprint ? { last_relaxation_fingerprint: fingerprint } : {}),
          } as any;
          state.decision_log.push({
            request_id: state.request_id,
            step: 'STATE_UPDATE',
            actor: 'Orchestrator',
            inputs_summary: 'clarification_answers → EARLY_WARNING_PROCEED_AT_OWN_RISK',
            outputs_summary: 'USER_PROCEEDED_AT_OWN_RISK: no TripPlanRequest patch; downstream POI/PLAN_GEN allowed',
            evidence_refs: [],
            timestamp: new Date().toISOString(),
            metadata: {
              system_action: 'EARLY_WARNING_PROCEED_AT_OWN_RISK',
              early_warning_id: ew?.early_warning_id,
              event: 'PROCEED_AT_OWN_RISK',
              evidence_fingerprint: fp.evidence_fingerprint,
              acknowledged_violations: fp.acknowledged_violations,
              max_violation_slack: fp.max_violation_slack,
            },
          });
        }

        // 行为分析：记录用户在澄清问题上的“选择/拒绝”（用于 EARLY_WARNING → PLAN_GEN 的认知差语料）
        const ewAnswer = clarificationAnswers.find((a) => a?.questionId === 'early_warning_relaxations');
        const pgAnswer = clarificationAnswers.find((a) => a?.questionId === 'plan_gen_empty_draft_relax_constraints');

        const normalizePicked = (v: any): string[] => {
          if (Array.isArray(v)) return v.map(String).filter(Boolean);
          if (typeof v === 'string') return [v].filter(Boolean);
          return [];
        };

        if (ewAnswer) {
          const ew = (state.metadata as any)?.early_warning as EarlyWarning | undefined;
          const suggested = Array.isArray(ew?.suggested_actions)
            ? ew!.suggested_actions.map((s) => String(s?.relaxation_type ?? '')).filter(Boolean)
            : [];
          const chosen = normalizePicked(ewAnswer.value);
          const rejected = suggested.filter((x) => !chosen.includes(x));
          const proceed = chosen.includes('proceed_at_own_risk');
          const evidence = proceed ? collectDecisionEvidenceSummaries(undefined) : [];
          const fp = proceed ? computeDecisionEvidenceFingerprint(evidence) : undefined;
          state.decision_log.push({
            request_id: state.request_id,
            step: 'STATE_UPDATE',
            actor: 'Orchestrator',
            inputs_summary: 'clarification_answers → EARLY_WARNING_USER_CHOICE',
            outputs_summary: `EARLY_WARNING_USER_CHOICE: chosen=${chosen.join(',') || '∅'} rejected=${rejected.join(',') || '∅'}`,
            evidence_refs: [],
            timestamp: new Date().toISOString(),
            metadata: {
              system_action: 'EARLY_WARNING_USER_CHOICE',
              early_warning_id: ew?.early_warning_id,
              suggested_actions: suggested,
              chosen_actions: chosen,
              rejected_actions: rejected,
              ...(proceed && fp
                ? {
                    event: 'PROCEED_AT_OWN_RISK',
                    evidence_fingerprint: fp.evidence_fingerprint,
                    acknowledged_violations: fp.acknowledged_violations,
                    max_violation_slack: fp.max_violation_slack,
                  }
                : {}),
            },
          });

          // Conversion Learning: CLARIFICATION_FEEDBACK — bind the choice to the option snapshot at presentation time.
          const snap = (state.decision_log ?? [])
            .slice()
            .reverse()
            .find((e) => e?.metadata?.system_action === 'EARLY_WARNING_INTERCEPT')?.metadata?.options_snapshot as any[] | undefined;
          const top = Array.isArray(snap)
            ? snap
                .filter((o) => o && typeof o === 'object' && typeof (o as any).metadata?.score === 'number')
                .sort((a, b) => ((b as any).metadata.score as number) - ((a as any).metadata.score as number))[0]
            : undefined;
          const topValue = top ? String((top as any).value ?? '') : '';
          const reward = proceed ? -1 : topValue && chosen.includes(topValue) ? 1 : 0;
          state.decision_log.push({
            request_id: state.request_id,
            step: 'STATE_UPDATE',
            actor: 'Orchestrator',
            inputs_summary: 'clarification_answers → CLARIFICATION_FEEDBACK (EARLY_WARNING)',
            outputs_summary: `CLARIFICATION_FEEDBACK: q=early_warning_relaxations reward=${reward}`,
            evidence_refs: [],
            timestamp: new Date().toISOString(),
            metadata: {
              system_action: 'CLARIFICATION_FEEDBACK',
              questionId: 'early_warning_relaxations',
              early_warning_id: ew?.early_warning_id,
              dominant_cid: (top as any)?.metadata?.dominant_cid ?? (ew as any)?.conflict_type,
              fingerprint: (state.metadata as any)?.last_relaxation_fingerprint,
              oscillation_k: 0,
              options_snapshot: Array.isArray(snap) ? snap : [],
              chosen_actions: chosen,
              top_scored_value: topValue || undefined,
              reward,
            },
          });

          // 回灌到 CaseStore：记录 shown/chosen_top/proceeded/rejected（best-effort，不阻塞）
          if (host.localCaseStore && Array.isArray(snap)) {
            const sig = SignatureBuilder.buildConversionSignature({
              conflict_type: ((ew as any)?.conflict_type ?? 'MIXED') as any,
              primary_violation_type: (top as any)?.metadata?.dominant_cid,
              region_id: (state.trip_plan_request as any)?.region_id,
              start_date: (state.trip_plan_request as any)?.start_date ?? state.trip_plan_request?.date_range?.start_date,
            }) as any;
            Promise.resolve()
              .then(() => {
                for (const o of snap) {
                  const v = String((o as any)?.value ?? '');
                  if (!v) continue;
                  host.localCaseStore!.recordConversion({ signature: sig, action: v as any, kind: 'shown' });
                }
                if (proceed) host.localCaseStore!.recordConversion({ signature: sig, action: 'proceed_at_own_risk', kind: 'proceeded' });
                if (topValue && chosen.includes(topValue)) host.localCaseStore!.recordConversion({ signature: sig, action: topValue as any, kind: 'chosen_top' });
                // targeted rejection: only count top-scored action rejected when user didn't pick it.
                if (topValue && !chosen.includes(topValue)) {
                  host.localCaseStore!.recordConversion({ signature: sig, action: topValue as any, kind: 'rejected' });
                }
              })
              .catch(() => undefined);
          }
        }

        if (pgAnswer) {
          const chosen = normalizePicked(pgAnswer.value);
          state.decision_log.push({
            request_id: state.request_id,
            step: 'STATE_UPDATE',
            actor: 'Orchestrator',
            inputs_summary: 'clarification_answers → PLAN_GEN_USER_CHOICE',
            outputs_summary: `PLAN_GEN_USER_CHOICE: chosen=${chosen.join(',') || '∅'}`,
            evidence_refs: [],
            timestamp: new Date().toISOString(),
            metadata: {
              system_action: 'PLAN_GEN_USER_CHOICE',
              chosen_actions: chosen,
            },
          });

          const snap = (state.decision_log ?? [])
            .slice()
            .reverse()
            .find((e) => e?.metadata?.system_action === 'PLAN_GEN_EMPTY_DRAFT_CLARIFICATION')?.metadata?.options_snapshot as any[] | undefined;
          const top = Array.isArray(snap)
            ? snap
                .filter((o) => o && typeof o === 'object' && typeof (o as any).metadata?.score === 'number')
                .sort((a, b) => ((b as any).metadata.score as number) - ((a as any).metadata.score as number))[0]
            : undefined;
          const topValue = top ? String((top as any).value ?? '') : '';
          const reward = chosen.includes('accept_no_solution') ? -1 : topValue && chosen.includes(topValue) ? 1 : 0;
          state.decision_log.push({
            request_id: state.request_id,
            step: 'STATE_UPDATE',
            actor: 'Orchestrator',
            inputs_summary: 'clarification_answers → CLARIFICATION_FEEDBACK (PLAN_GEN)',
            outputs_summary: `CLARIFICATION_FEEDBACK: q=plan_gen_empty_draft_relax_constraints reward=${reward}`,
            evidence_refs: [],
            timestamp: new Date().toISOString(),
            metadata: {
              system_action: 'CLARIFICATION_FEEDBACK',
              questionId: 'plan_gen_empty_draft_relax_constraints',
              dominant_cid: (top as any)?.metadata?.dominant_cid,
              fingerprint: (state.metadata as any)?.last_relaxation_fingerprint,
              oscillation_k: 0,
              options_snapshot: Array.isArray(snap) ? snap : [],
              chosen_actions: chosen,
              top_scored_value: topValue || undefined,
              reward,
            },
          });

          if (host.localCaseStore && Array.isArray(snap)) {
            const sig = SignatureBuilder.buildConversionSignature({
              conflict_type: 'MIXED',
              primary_violation_type: (top as any)?.metadata?.dominant_cid,
              region_id: (state.trip_plan_request as any)?.region_id,
              start_date: (state.trip_plan_request as any)?.start_date ?? state.trip_plan_request?.date_range?.start_date,
            }) as any;
            Promise.resolve()
              .then(() => {
                for (const o of snap) {
                  const v = String((o as any)?.value ?? '');
                  if (!v) continue;
                  host.localCaseStore!.recordConversion({ signature: sig, action: v as any, kind: 'shown' });
                }
                if (topValue && chosen.includes(topValue)) host.localCaseStore!.recordConversion({ signature: sig, action: topValue as any, kind: 'chosen_top' });
                if (topValue && !chosen.includes(topValue)) {
                  host.localCaseStore!.recordConversion({ signature: sig, action: topValue as any, kind: 'rejected' });
                }
              })
              .catch(() => undefined);
          }
        }

        if (transportClarificationApplied) {
          state.metadata = {
            ...(state.metadata ?? {}),
            transport_research_followup: true,
            last_transport_clarification_fingerprint: fingerprint,
          } as any;
          state.decision_log.push({
            request_id: state.request_id,
            step: 'INTAKE',
            actor: 'Orchestrator',
            inputs_summary: 'clarification_answers → clarify_transport_endpoints_v1',
            outputs_summary: 'TRANSPORT_ENDPOINTS_PATCHED; next RESEARCH may run transport_only',
            evidence_refs: [],
            timestamp: new Date().toISOString(),
            metadata: {
              system_action: 'CLARIFY_TRANSPORT_ENDPOINTS_APPLIED',
              fingerprint,
            },
          });
        }
      }

      const priorIntake = (state.metadata as { intake_user_message?: string } | undefined)
        ?.intake_user_message;
      const canonicalIntake = resolveCanonicalIntakeUserMessage({
        requestMessage: request.message,
        previousIntake: priorIntake,
      });
      if (canonicalIntake) {
        (state.metadata as { intake_user_message?: string }).intake_user_message = canonicalIntake;
        if (isStructuredClarificationEchoMessage(request.message)) {
          tripPlanRequest = {
            ...tripPlanRequest,
            message: rebuildTripPlanMessagePreservingSystemBlocks(
              tripPlanRequest.message,
              canonicalIntake,
            ),
          };
        }
      } else if (request.message?.trim()) {
        state.metadata.intake_user_message = request.message;
      }

      tripPlanRequest = reconcileTripPlanVehicleConstraints(
        tripPlanRequest,
        canonicalIntake ?? request.message,
      );
      state.trip_plan_request = tripPlanRequest;

      if (host.decisionKernel) {
        const intakeCtx: IntakeExecutorContext = {
          requestId: state.request_id,
          userId: request.user_id,
          tripPlanRequest: tripPlanRequest as any,
          orchestratorState: state,
          locale: request.conversation_context?.locale,
        };
        const dso = host.decisionKernel.createInitialState(state.request_id, host.kernelCreateInitialOpts(request, state));
        const result = await host.decisionKernel.executeIntake(dso, intakeCtx);

        state.gaps = result.gaps as OrchestratorState['gaps'];
        state.clarification_questions = result.clarificationQuestions as any;
        if ((result as any).simulation) {
          (state.metadata as any) = { ...(state.metadata ?? {}), intake_simulation: (result as any).simulation };
        }
        state.decision_log.push({
          request_id: state.request_id,
          step: 'INTAKE',
          actor: 'Planner',
          inputs_summary: formatIntakeInputsPreviewZh(request.message, 100),
          outputs_summary: formatIntakeOutputsZh(result.intent ?? 'PLAN_TRIP', result.gaps.length),
          evidence_refs: [],
          timestamp: new Date().toISOString(),
          metadata: {
            duration_ms: Date.now() - stepStartTime,
            gaps: result.gaps,
            candidate_structure: result.candidate_structure,
            clarification_questions_count: result.clarificationQuestions?.length || 0,
          },
        });
      } else {
        // P3 D.1: 降级路径统一为 util 规则识别，不再直接调用 plannerAgent
        const gaps = identifyGapsFromRequest(tripPlanRequest);
        state.gaps = gaps as OrchestratorState['gaps'];
        const hardGaps = gaps.filter((g) => g.severity === 'HARD');
        if (hardGaps.length > 0) {
          state.clarification_questions = generateClarificationQuestions(hardGaps, tripPlanRequest, {
            locale: request.conversation_context?.locale,
          });
        }
        state.decision_log.push({
          request_id: state.request_id,
          step: 'INTAKE',
          actor: 'Orchestrator',
          inputs_summary: formatIntakeInputsPreviewZh(request.message, 100),
          outputs_summary: formatIntakeOutputsZh('PLAN_TRIP', gaps.length),
          evidence_refs: [],
          timestamp: new Date().toISOString(),
          metadata: {
            duration_ms: Date.now() - stepStartTime,
            gaps,
            clarification_questions_count: state.clarification_questions?.length || 0,
          },
        });
      }

      state.metadata.last_updated_at = new Date().toISOString();
      await host.generateDecisionStepForStep(state, 'INTAKE', 'Planner');
      host.applyMarathonPipelineSignals(state, request);

      const intakeMsg =
        request.message ?? (state.metadata as { intake_user_message?: string }).intake_user_message;
      const clarAnswers = (request as { clarification_answers?: unknown[] }).clarification_answers;
      const tripIdForIntent = request.trip_id?.trim() ?? state.trip_plan_request?.trip_id?.trim();
      let tripDaySnapshots: TripDaySnapshotForPlacement[] = [];
      if (tripIdForIntent) {
        tripDaySnapshots = await host.loadTripDaySnapshotsForSlotPlacement(
          tripIdForIntent,
          request.user_id,
        );
      }
      const intentAnalysis = analyzeRouteAndRunIntent(intakeMsg, {
        trip: state.trip_plan_request,
        tripId: tripIdForIntent,
        hasTripDays: tripDaySnapshots.length > 0,
      });
      (state.metadata as Record<string, unknown>).route_and_run_intent = intentAnalysis;
      if (intentAnalysis.primary === 'ITINERARY_ADJUST' && state.trip_plan_request) {
        appendItineraryAdjustSystemHints(state.trip_plan_request, intakeMsg ?? '');
        (state.metadata as Record<string, unknown>).itinerary_adjust_intake = true;
      }

      if (isFroad2wdIntakeClarificationPending(state.trip_plan_request, intakeMsg, clarAnswers)) {
        const froadSignals = buildFroadHighlandIntentSignals(intakeMsg ?? '');
        if (froadSignals && state.trip_plan_request) {
          state.trip_plan_request = applyFroadHighlandSignalsToTripPlan(
            state.trip_plan_request,
            froadSignals,
            intakeMsg,
          );
        }
        state.clarification_questions = [
          buildFroad2wdIntakeClarificationQuestion(state.trip_plan_request, intakeMsg),
        ];
        (state.metadata as Record<string, unknown>).froad_2wd_intake_clarification_short_circuit = true;
      } else if (
        isItinerarySlotPlacementIntakeClarificationPending(
          state.trip_plan_request,
          intakeMsg,
          clarAnswers,
          {
            tripId: tripIdForIntent,
            hasTripDays: tripDaySnapshots.length > 0 || Boolean(tripIdForIntent),
          },
        )
      ) {
        const slotResolved = await host.resolveItinerarySlotCandidatesForIntake(
          intakeMsg ?? '',
          state.trip_plan_request,
          tripIdForIntent ?? '',
          request.user_id,
          tripDaySnapshots,
        );
        if (slotResolved.paAnalysis) {
          (state.metadata as Record<string, unknown>).slot_placement_pa = slotResolved.paAnalysis;
          if (slotResolved.paAnalysis.fallbackReason) {
            (state.metadata as Record<string, unknown>).slot_placement_pa_fallback =
              slotResolved.paAnalysis.fallbackReason;
          }
        }
        state.clarification_questions = [
          buildItinerarySlotPlacementClarificationQuestion(
            state.trip_plan_request,
            tripDaySnapshots,
            intakeMsg,
            {
              paAnalysis: slotResolved.paAnalysis,
              paCandidates: slotResolved.candidates,
            },
          ),
        ];
        (state.metadata as Record<string, unknown>).itinerary_slot_placement_intake_short_circuit =
          true;
      } else if (
        isPeakSeasonTimeShiftIntakeClarificationPending(
          state.trip_plan_request,
          intakeMsg,
          clarAnswers,
          {
            tripId: tripIdForIntent,
            hasTripDays: tripDaySnapshots.length > 0 || Boolean(tripIdForIntent),
          },
        )
      ) {
        const peakSignals = buildPeakSeasonTimeShiftSignals(
          intakeMsg ?? '',
          new Date().getFullYear(),
          state.trip_plan_request,
        );
        if (peakSignals && state.trip_plan_request) {
          state.trip_plan_request = applyPeakSeasonTimeShiftSignalsToTripPlan(
            state.trip_plan_request,
            peakSignals,
            intakeMsg,
          );
        }
        state.clarification_questions = [
          buildPeakSeasonTimeShiftIntakeClarificationQuestion(state.trip_plan_request, intakeMsg),
        ];
        (state.metadata as Record<string, unknown>).peak_season_time_shift_intake_short_circuit = true;
      } else if (
        isMarathonDeferredIntakeClarificationPending(
          state.gaps as IntakeGap[] | undefined,
          clarAnswers,
        )
      ) {
        state.clarification_questions = [
          buildMarathonIntakeClarificationQuestion(state.trip_plan_request, intakeMsg),
        ];
        (state.metadata as Record<string, unknown>).marathon_intake_clarification_short_circuit = true;
      }
    } catch (error: any) {
      host.logger.error(`[Claude Orchestrator] INTAKE 步骤失败: ${error?.message}`);
      throw error;
    }}

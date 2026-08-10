/**
 * Planning 状态机路径实现体（从 ClaudeOrchestrator.orchestrateWithStateMachine 迁出）。
 */

import {
  resolveRouteAndRunUserMessage,
} from '../utils/resolve-route-and-run-message.util';
import {
  setLlmTraceRoutePath,
} from '../../llm/token-context.storage';
import {
  OrchestrationResult,
  AgentContext,
} from '../interfaces/claude-orchestration.interface';
import {
  RouteAndRunRequestDto,
} from '../dto/route-and-run.dto';
import {
  isWorkbenchAssistantPlaceholderMessage,
} from '../utils/trip-plan-intake-message.util';
import {
  authorizeDecisionFromUserConfirmation,
  canAuthorizeDecisionPresentation,
  detectUserDecisionAuthorization,
  gatePlanWriteAdmission,
  markDecisionAuthorized,
  markPlanApplied,
  resolveDecisionDepth,
  shouldRunPlanVerifyEngineering,
  stampDecisionDepth,
} from '../../decision/kernel/decision-cognition.util';
import {
  applyTripPlanningStateMachineOptionDefaults,
} from '../utils/route-and-run-option-defaults.util';
import {
  buildSilentVoteCreateSuggestedOperation,
  isSilentVoteCreateIntentMessage,
} from '../utils/trip-consultation-suggested-operations.util';
import {
  buildTeamFitnessSubmissionStatusAnswer,
  isTeamFitnessSubmissionStatusQuery,
  loadTeamFitnessSubmissionStatuses,
} from '../utils/team-fitness-submission-status.util';
import {
  mergeEmotionalClientSignalsFromRouteAndRunRequest,
} from '../narrator/emotional-orchestrator-metadata.util';
import {
  OrchestratorState,
  OrchestrationStep,
  SubAgentType,
} from '../interfaces/trip-plan.interface';
import type {
  PlanState,
} from '../../skills/plan/shared/plan-state.types';
import {
  classifyOrchestratorFailure,
  coerceOrchestratorFailureForWallClockTimeout,
  truncateOrchestratorFailurePreview,
} from '../utils/orchestrator-failure-taxonomy.util';
import {
  HarnessStepName,
} from '../../harness/contracts/harness-step.types';
import {
  DecisionState,
} from '../../decision/kernel/decision-state.types';
import {
  mergeReplanLineageIntoTripRunMetadata,
  resolveOrchestratorPlanVersionAfterReplan,
} from '../utils/trip-run-replan-metadata.util';
import {
  computeResumeGraphEntryFromLast,
  runPostPlanGraph,
  runPrePlanUntilContextBuild,
  suggestGraphEntryFromHarnessAdmission,
} from '../orchestration/graph';
import {
  runPlanVerifyOptimizeRepairLoop,
  runVerifyReturnToResearchRetryLoop,
} from '../orchestration/plan-verify-loop';
import {
  runGraphEffectivePlanMaterializePhase,
} from '../orchestration/travel-compile/graph-effective-plan-materialize-phase.util';

import type { PlanningStateMachineHost } from './planning-state-machine.host';

export async function runPlanningStateMachinePath(
  host: PlanningStateMachineHost,
  request: RouteAndRunRequestDto,
  context: AgentContext,
  deadline?: { remainingMs: () => number; clamp: (ms: number, minMs?: number) => number },
  resume?: { decision_state: DecisionState; checkpoint_loaded?: boolean },
): Promise<OrchestrationResult> {
    applyTripPlanningStateMachineOptionDefaults(request);
    setLlmTraceRoutePath('STATE_MACHINE');
    const startTime = Date.now();
    const boundTripIdEarly = (request.trip_id || context.tripId || '').trim();
    const earlyMsg = resolveRouteAndRunUserMessage(request);
    if (boundTripIdEarly && isSilentVoteCreateIntentMessage(earlyMsg)) {
      host.logger.log(
        `[Claude Orchestrator] 状态机入口：发起投票 → SilentVote CTA 短路 request_id=${request.request_id}`,
      );
      setLlmTraceRoutePath('LIGHTWEIGHT');
      const voteOp = buildSilentVoteCreateSuggestedOperation(boundTripIdEarly);
      return {
        success: true,
        answerText:
          '可以发起团队匿名投票。请点击下方「发起投票」打开创建面板（选项与截止时间由你确认后提交）。若未看到按钮，请到本行程「成员 / 团队协作」→ Silent Vote 手动发起。',
        result: {
          routingTaskType: 'DATA_LOOKUP',
          lightweightKnowledgeQa: true,
          ui_surface: 'consultation' as const,
          trip_id: boundTripIdEarly,
          ...(voteOp ? { suggested_operations: [voteOp] } : {}),
        },
        stepsExecuted: [],
        totalDuration: Date.now() - startTime,
        decisionLog: [
          {
            request_id: request.request_id,
            step: 'INTAKE' as OrchestrationStep,
            actor: 'Orchestrator' as SubAgentType,
            inputs_summary: earlyMsg.slice(0, 200),
            outputs_summary: 'silent_vote_create CTA (SM entry bypass)',
            evidence_refs: [],
            timestamp: new Date().toISOString(),
            metadata: { system_action: 'SILENT_VOTE_CREATE_CTA' },
          },
        ],
      };
    }
    if (boundTripIdEarly && isTeamFitnessSubmissionStatusQuery(earlyMsg) && host.prisma) {
      host.logger.log(
        `[Claude Orchestrator] 状态机入口：体能提交状态 → 短路 request_id=${request.request_id}`,
      );
      setLlmTraceRoutePath('LIGHTWEIGHT');
      try {
        const loaded = await loadTeamFitnessSubmissionStatuses(host.prisma as never, boundTripIdEarly);
        const answerText = buildTeamFitnessSubmissionStatusAnswer(loaded);
        const missing = loaded.members.filter((m) => !m.submitted);
        return {
          success: true,
          answerText,
          result: {
            routingTaskType: 'DATA_LOOKUP',
            lightweightKnowledgeQa: true,
            ui_surface: 'consultation' as const,
            trip_id: boundTripIdEarly,
            team_fitness_submission_status: {
              missing_count: missing.length,
              submitted_count: loaded.members.length - missing.length,
              members: loaded.members.map((m) => ({
                user_id: m.userId,
                display_name: m.displayName,
                role: m.role,
                submitted: m.submitted,
                fitness_level: m.fitnessLevel ?? null,
              })),
            },
          },
          stepsExecuted: [],
          totalDuration: Date.now() - startTime,
          decisionLog: [
            {
              request_id: request.request_id,
              step: 'INTAKE' as OrchestrationStep,
              actor: 'Orchestrator' as SubAgentType,
              inputs_summary: earlyMsg.slice(0, 200),
              outputs_summary: `team_fitness_submission_status missing=${missing.length}/${loaded.members.length}`,
              evidence_refs: [],
              timestamp: new Date().toISOString(),
              metadata: {
                system_action: 'TEAM_FITNESS_SUBMISSION_STATUS',
                missing_user_ids: missing.map((m) => m.userId),
              },
            },
          ],
        };
      } catch (error: any) {
        host.logger.warn(
          `[Claude Orchestrator] 体能提交状态短路失败，回退状态机: ${error?.message ?? error}`,
        );
      }
    }
    if (boundTripIdEarly && isWorkbenchAssistantPlaceholderMessage(request.message)) {
      host.logger.log(
        `[Claude Orchestrator] 状态机入口：工作台占位欢迎语 → 短路 request_id=${request.request_id}`,
      );
      setLlmTraceRoutePath('LIGHTWEIGHT');
      return await host.orchestrateWorkbenchAssistantPlaceholder(request, context, startTime);
    }
    host.logger.log(`[Claude Orchestrator] 开始状态机编排: request_id=${request.request_id}`);
    host.logger.log(`[Claude Orchestrator] Deadline: ${deadline?.remainingMs() || 'N/A'}ms`);

    // 获取 LLM 提供商
    const llmProvider = host.getLlmProvider(request);
    host.logger.log(`[Claude Orchestrator] LLM Provider: ${llmProvider}`);

    // 初始化状态（replan：plan_version = previous_plan_version + 1，见 resolveOrchestratorPlanVersionAfterReplan）
    const initialPlanVersion = resolveOrchestratorPlanVersionAfterReplan(request.options);
    const state: OrchestratorState = {
      request_id: request.request_id,
      // P0 改进：PlanState 版本化
      plan_id: request.trip_id ? `plan-${request.trip_id}` : `plan-${request.request_id}`,
      plan_version: initialPlanVersion,
      current_step: 'INTAKE',
      evidence_registry: new Map(),
      decision_log: [],
      decision_steps: [], // Decision Steps（业务层决策，来自 Decision-First Engine）
      errors: [],
      metadata: mergeReplanLineageIntoTripRunMetadata(
        {
          started_at: new Date().toISOString(),
          last_updated_at: new Date().toISOString(),
          // Context Orchestrator：打通 userId/tripId 供 buildContextForNode / UserTravelProfile 使用
          userId: request.user_id ?? undefined,
          tripId: request.trip_id ?? undefined,
          /** 真实 TripRun（trip_runs.id）；优先 AgentService 注入，其次 options 断点续跑 id */
          tripRunId:
            context.tripRunId ??
            request.options?.durable_trip_run_id?.trim() ??
            undefined,
          fallback_strategy_hint: request.options?.fallback_strategy,
          fallback_debug_scores: request.options?.show_debug_scores,
          show_commute_matrix: request.options?.show_commute_matrix === true,
          require_poi_data: request.options?.require_poi_data === true,
          allow_partial: request.options?.allow_partial === true,
          poi_policy: request.options?.poi_policy,
          poi_source_hint: request.options?.poi_source,
          show_poi_trace: request.options?.show_poi_trace === true,
          // Persist emergency constraints on OrchestratorState for DSO projection (Sentinel hard mask).
          emergency_constraints: (request as any).emergency_constraints ?? undefined,
        },
        request.options,
      ) as OrchestratorState['metadata'],
    };
    state.metadata = mergeEmotionalClientSignalsFromRouteAndRunRequest(state.metadata, request);
    if (context.requestRouterDecision?.decisionDepth) {
      (state.metadata as Record<string, unknown>).decision_depth =
        context.requestRouterDecision.decisionDepth;
      (state.metadata as Record<string, unknown>).request_router = context.requestRouterDecision;
    }

    // Phase 2.1: 初始化 DecisionState (DSO)，与 OrchestratorState 并行维护
    // Phase 2.4: DECISION_KERNEL_ENABLED=false 可回滚到无 Kernel 路径
    // P1: DECISION_KERNEL_AB_PERCENT 设置时按 hash 分流（如 10 表示 10% 实验组）
    let decisionState: DecisionState | undefined;
    let resumeSkipIntake = false;
    if (resume?.decision_state && host.decisionKernel && host.isKernelEnabledForRequest(request)) {
      decisionState = resume.decision_state;
      const requestId = request.request_id;
      const nextHarness = host.computeResumeHarnessEntryFromLast(decisionState.systemState?.lastStep);
      let step = nextHarness;
      let admission = await host.decisionKernel.validateStepAdmission(decisionState, step, { requestId });
      let depth = 0;
      while (!admission.passed && admission.suggested_fallback_step && depth < 8) {
        depth += 1;
        step = admission.suggested_fallback_step;
        admission = await host.decisionKernel.validateStepAdmission(decisionState, step, { requestId });
      }
      if (!admission.passed) {
        host.logger.warn(
          `[Claude Orchestrator] Durable resume: 准入失败，回退全新 DSO。末次尝试 step=${String(step)} codes=${admission.validation_results
            .filter((r) => !r.passed)
            .map((r) => r.code)
            .join(',') ?? 'n/a'}`,
        );
        decisionState = host.decisionKernel.createInitialState(requestId, host.kernelCreateInitialOpts(request, state));
        resumeSkipIntake = false;
      } else {
        const ls = decisionState.systemState?.lastStep;
        resumeSkipIntake = ls === HarnessStepName.INTAKE || ls === 'INTAKE';
        decisionState = host.decisionKernel.updateState(decisionState, {
          harnessRuntime: {
            ...(decisionState.harnessRuntime ?? {}),
            resume_admission_step: step,
            resume_admission_passed: true,
          },
        });
        const graphEntry =
          suggestGraphEntryFromHarnessAdmission(admission) ??
          computeResumeGraphEntryFromLast(decisionState.systemState?.lastStep);
        (state.metadata as Record<string, unknown>).graph_resume_entry = graphEntry;
        (state.metadata as Record<string, unknown>).harness_resume_admission_step = step;
        host.logger.debug(
          `[Claude Orchestrator] Durable resume: DSO 已加载 admission_step=${String(step)} graph_entry=${graphEntry} skip_intake=${resumeSkipIntake}`,
        );
      }
    } else if (host.decisionKernel && host.isKernelEnabledForRequest(request)) {
      decisionState = host.decisionKernel.createInitialState(
        request.request_id,
        host.kernelCreateInitialOpts(request, state),
      );
      host.logger.debug(`[Claude Orchestrator] DSO 已初始化: requestId=${request.request_id}`);
    }

    decisionState = host.mergeGovernanceRuntimeBranchDirective(request, decisionState);
    if (decisionState && context.requestRouterDecision?.decisionDepth) {
      decisionState = stampDecisionDepth(
        decisionState,
        context.requestRouterDecision.decisionDepth,
      );
    }
    if (decisionState) {
      const clarAnswers = (
        request as RouteAndRunRequestDto & {
          clarification_answers?: Array<{ questionId?: string; value?: unknown }>;
        }
      ).clarification_answers;
      const earlyWarningAcknowledged =
        (state.metadata as Record<string, unknown>)?.early_warning_acknowledged === true ||
        decisionState.systemState?.earlyWarningAcknowledged === true ||
        clarAnswers?.some((a) => a?.questionId === 'early_warning_relaxations') === true;
      const explicitConsent = request.options?.decision_consent === true;
      const authDet = detectUserDecisionAuthorization({
        clarificationAnswers: clarAnswers,
        earlyWarningAcknowledged,
        explicitConsent,
      });
      if (authDet.authorized) {
        decisionState = authorizeDecisionFromUserConfirmation(decisionState, {
          clarificationAnswers: clarAnswers,
          earlyWarningAcknowledged,
          explicitConsent,
        });
        (state.metadata as Record<string, unknown>).user_decision_authorized = true;
        (state.metadata as Record<string, unknown>).user_decision_authorized_reason = authDet.reason;
        (state.metadata as Record<string, unknown>).decision_consent = explicitConsent;
        (state.metadata as Record<string, unknown>).cognition_markers =
          decisionState.cognition?.markers ?? [];
        host.logger.log(
          `[Claude Orchestrator] user confirmation → DECISION_AUTHORIZED reason=${authDet.reason} request_id=${request.request_id}`,
        );
      }
    }

    try {
      const prePlanOutcome = await runPrePlanUntilContextBuild(host.asPrePlanGraphHost(), {
        request,
        context,
        state,
        decisionState,
        llmProvider,
        startTime,
        deadline,
        resumeSkipIntake,
        entry: resume?.decision_state
          ? computeResumeGraphEntryFromLast(decisionState?.systemState?.lastStep)
          : undefined,
      });
      decisionState = prePlanOutcome.decisionState ?? decisionState;
      if (prePlanOutcome.kind === "terminal") {
        return prePlanOutcome.result;
      }

      const staleDecisionDepth =
        context.requestRouterDecision?.decisionDepth ??
        decisionState?.cognition?.decisionDepth ??
        ((state.metadata as Record<string, unknown> | undefined)?.decision_depth as
          | import('../../decision/kernel/decision-cognition.types').DecisionDepth
          | undefined);
      /** SM 入口禁止信任 resume/metadata 泄漏的浅层深度，重新按消息与模式收敛 */
      const decisionDepth = resolveDecisionDepth({
        routingTaskType: request.options?.intent_mode,
        orchestrateMode: 'PLANNING_STATE_MACHINE',
        message: request.message,
      });
      if (staleDecisionDepth && staleDecisionDepth !== decisionDepth) {
        host.logger.debug?.(
          `[Claude Orchestrator] recompute decisionDepth stale=${staleDecisionDepth} → ${decisionDepth} request_id=${request.request_id}`,
        );
      }
      if (decisionState?.cognition) {
        decisionState = {
          ...decisionState,
          cognition: { ...decisionState.cognition, decisionDepth },
        };
      }
      (state.metadata as Record<string, unknown>).decision_depth = decisionDepth;
      const smEntry =
        (context.requestRouterDecision as { entry?: string } | undefined)?.entry ??
        (state.metadata as Record<string, unknown> | undefined)?.sm_entry;
      const runPlanVerify = shouldRunPlanVerifyEngineering(decisionDepth, {
        orchestrateMode: 'PLANNING_STATE_MACHINE',
        smEntry: typeof smEntry === 'string' ? smEntry : undefined,
      });

      if (!runPlanVerify) {
        (state.metadata as Record<string, unknown>).cognition_skip_plan_verify = true;
        state.decision_log.push({
          request_id: state.request_id,
          step: 'PLAN_GEN' as OrchestrationStep,
          actor: 'Orchestrator' as SubAgentType,
          inputs_summary: `decisionDepth=${decisionDepth ?? 'n/a'}`,
          outputs_summary: '认知深度不足预演层，跳过 PLAN_GEN→VERIFY→REPAIR 工程段',
          evidence_refs: [],
          timestamp: new Date().toISOString(),
          metadata: {
            cognition_skip_plan_verify: true,
            decision_depth: decisionDepth,
          },
        });
        host.logger.log(
          `[Claude Orchestrator] skip plan-verify engineering depth=${decisionDepth} request_id=${request.request_id}`,
        );
      } else {
        const planGenOut = await host.runPlanGenWithEmptyDraftGuard({
          request,
          context,
          state,
          decisionState,
          llmProvider,
          startTime,
        });
        decisionState = planGenOut.decisionState;
        if (planGenOut.terminal) {
          return planGenOut.terminal;
        }

        await host.runTravelCompilePhaseIfEnabled(state, request);

        let planVerifyOutcome = await runPlanVerifyOptimizeRepairLoop(host.asPlanVerifyLoopHost(), {
          request,
          context,
          state,
          decisionState,
          llmProvider,
          startTime,
        });
        decisionState = planVerifyOutcome.decisionState;
        const verifyRetry = await runVerifyReturnToResearchRetryLoop({
          state,
          planVerifyOutcome,
          decisionState,
          onRetryStarted: (retryIndex, maxRetries) => {
            host.logger.warn(
              `[Claude Orchestrator] VERIFY RETURN_TO_RESEARCH: retry=${retryIndex}/${maxRetries} → pre_plan from research`,
            );
          },
          onRetry: async ({ decisionState: dsFromVerify }) => {
            const rePrePlan = await runPrePlanUntilContextBuild(host.asPrePlanGraphHost(), {
              request,
              context,
              state,
              decisionState: dsFromVerify,
              llmProvider,
              startTime,
              deadline,
              resumeSkipIntake: true,
              entry: 'research',
            });
            if (rePrePlan.kind === 'terminal') {
              return {
                planVerifyOutcome,
                decisionState: rePrePlan.decisionState,
                prePlanTerminal: rePrePlan.result,
              };
            }
            let ds = rePrePlan.decisionState ?? dsFromVerify;
            const regen = await host.runPlanGenWithEmptyDraftGuard({
              request,
              context,
              state,
              decisionState: ds,
              llmProvider,
              startTime,
            });
            ds = regen.decisionState ?? ds;
            if (regen.terminal) {
              return { planVerifyOutcome, decisionState: ds, planGenTerminal: regen.terminal };
            }
            await host.runTravelCompilePhaseIfEnabled(state, request);
            const reVerify = await runPlanVerifyOptimizeRepairLoop(host.asPlanVerifyLoopHost(), {
              request,
              context,
              state,
              decisionState: ds,
              llmProvider,
              startTime,
            });
            return {
              planVerifyOutcome: reVerify,
              decisionState: reVerify.decisionState ?? ds,
            };
          },
        });
        if (verifyRetry.terminal) {
          return verifyRetry.terminal;
        }
        planVerifyOutcome = verifyRetry.planVerifyOutcome;
        decisionState = verifyRetry.decisionState;
        if (planVerifyOutcome.kind === 'terminal') {
          return planVerifyOutcome.result;
        }

        await runGraphEffectivePlanMaterializePhase({
          state,
          request,
          materializer: host.graphEffectivePlanMaterializer as any,
          configService: host.configService as any,
        });
      }

      if (decisionState && canAuthorizeDecisionPresentation(decisionState)) {
        decisionState = markDecisionAuthorized(decisionState);
        (state.metadata as Record<string, unknown>).cognition_markers =
          decisionState.cognition?.markers ?? [];
      }

      // 认知写回准入：未授权 / VERIFY BLOCK / 缺 planVersion 时跳过 auto-apply
      let cognitionWriteAdmitted = true;
      if (decisionState) {
        const gated = gatePlanWriteAdmission(decisionState);
        decisionState = gated.dso;
        cognitionWriteAdmitted = gated.admission.ok;
        (state.metadata as Record<string, unknown>).cognition_write_admission = {
          ok: gated.admission.ok,
          missing: gated.admission.missing,
        };
      }

      // P0：写库必须在 PostPlan（NARRATE→HALLUCINATION terminal）之前，否则成功路径永远跳过 auto-apply。
      if (cognitionWriteAdmitted) {
        await host.maybeAutoApplyItineraryAdjustCorridor(state);
      } else {
        (state.metadata as Record<string, unknown>).itinerary_adjust_auto_apply = {
          applied: false,
          skipped: true,
          reason: 'cognition_write_admission_denied',
        };
      }
      const autoApplyMeta = (state.metadata as Record<string, unknown> | undefined)
        ?.itinerary_adjust_auto_apply as { applied?: boolean } | undefined;
      if (decisionState && autoApplyMeta?.applied === true) {
        decisionState = markPlanApplied(decisionState);
        (state.metadata as Record<string, unknown>).cognition_markers =
          decisionState.cognition?.markers ?? [];
      }

      const postPlanOutcome = await runPostPlanGraph(host.asPostPlanGraphHost(), {
        request,
        context,
        state,
        decisionState,
        llmProvider,
        startTime,
        deadline,
      });
      if (postPlanOutcome.kind === 'terminal') {
        // post_plan 子图在 HALLUCINATION 节点以 terminal 出口并内嵌 buildSuccessResult；
        // 须在此仍走整段重规划住宿 enrich，否则会跳过 FULL_TRIP_REPLAN_HOTEL_SENSOR。
        return await host.enrichOrchestrationResultWithFullTripReplanHotel(
          request,
          context,
          state,
          postPlanOutcome.result,
        );
      }
      const baseResult = host.buildSuccessResult(
        state,
        startTime,
        postPlanOutcome.decisionState,
        context,
      );
      return await host.enrichOrchestrationResultWithFullTripReplanHotel(
        request,
        context,
        state,
        baseResult,
      );
    } catch (error: any) {
      host.logger.error(`[Claude Orchestrator] 状态机编排失败: ${error?.message}`, error?.stack);

      const failingStep = state.current_step;

      // 🆕 检查是否是超时错误
      const isTimeout =
        error?.message?.startsWith('TIMEOUT:') ||
        error?.code === 'ECONNABORTED' ||
        (deadline?.remainingMs?.() ?? Number.POSITIVE_INFINITY) <= 0;

      let robust = classifyOrchestratorFailure(error, { orchestrator_step: failingStep });
      if (isTimeout) robust = coerceOrchestratorFailureForWallClockTimeout(robust);

      if (isTimeout) {
        host.logger.warn(
          `[Claude Orchestrator] 状态机执行超时，当前步骤: ${failingStep}, 已执行步骤数: ${state.decision_log.length}`,
        );
        state.current_step = 'TIMEOUT';
        state.errors.push({
          step: state.current_step,
          error_code: 'TIMEOUT',
          message: `执行超时，已执行到步骤: ${failingStep}`,
          timestamp: new Date().toISOString(),
        });

        // 🆕 记录超时时的决策日志
        state.decision_log.push({
          request_id: state.request_id,
          step: 'TIMEOUT' as OrchestrationStep,
          actor: 'Orchestrator' as SubAgentType,
          inputs_summary: `状态机执行超时`,
          outputs_summary: `已执行步骤: ${state.decision_log.map((log) => log.step).join(' → ')}`,
          evidence_refs: [],
          timestamp: new Date().toISOString(),
          metadata: {
            duration_ms: Date.now() - startTime,
            timeout: true,
            executed_steps: state.decision_log.map((log) => log.step),
            orchestrator_robustness: robust,
          },
        });
        host.maybeSnapshot(state, 'CHECKPOINT');
      } else {
        state.current_step = 'FAILED';
        state.errors.push({
          step: state.current_step,
          error_code: 'ORCHESTRATION_ERROR',
          message: error?.message || '未知错误',
          timestamp: new Date().toISOString(),
        });
        state.decision_log.push({
          request_id: state.request_id,
          step: 'FAILED' as OrchestrationStep,
          actor: 'Orchestrator' as SubAgentType,
          inputs_summary: `编排异常 @ ${failingStep}`,
          outputs_summary: truncateOrchestratorFailurePreview(String(error?.message || '未知错误'), 400),
          evidence_refs: [],
          timestamp: new Date().toISOString(),
          metadata: {
            duration_ms: Date.now() - startTime,
            orchestrator_robustness: robust,
          },
        });
        host.maybeSnapshot(state, 'CHECKPOINT');
      }

      return host.buildErrorResult(state, error, startTime, decisionState, failingStep, robust, context);
    }
  }

  /** Layer1 行程槽位：先选哪一天，再进入 SKU 错峰场次 */


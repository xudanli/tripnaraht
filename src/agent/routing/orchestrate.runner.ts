/**
 * ClaudeOrchestrator.orchestrate 入口（从 Service 迁出）。
 */

import type { OrchestrateHost } from './orchestrate.host';
import type { RouteAndRunRequestDto } from '../dto/route-and-run.dto';
import type {
  AgentContext,
  OrchestrationResult,
} from '../interfaces/claude-orchestration.interface';
import type { OrchestrationStep, SubAgentType } from '../interfaces/trip-plan.interface';
import { ErrorType } from '../interfaces/error-types.interface';
import { resolveRouteAndRunUserMessage } from '../utils/resolve-route-and-run-message.util';
import {
  buildContextRequirementPlan,
  inferCreActivityFlagsFromMessage,
  serializeCrePlanForObservability,
} from '../context-requirement/context-requirement.service';
import { runRealityObservationRuntime } from '../reality-observation/reality-observation.runtime';
import { resolveOrchestrateEntry } from './request-router.util';
import { dispatchOrchestrateEntry } from './orchestrate-entry.dispatcher';
import { runDynamicDagPath } from './dynamic-dag.runner';
import { buildCreAskUserResult } from './cre-ask-user-result.util';
import { buildRorAskUserResult } from './ror-ask-user-result.util';
import {
  buildUnifiedIntentShadowCompare,
  serializeUnifiedIntentShadow,
} from '../intent/unified-intent.shadow';
import { tryLiveRouteTakeover } from '../intent/unified-intent.execution-route';
import { resolveUnifiedIntent } from '../intent/unified-intent.resolver';
import {
  applyContractAcquisitionToCrePlan,
  buildDecisionStateDivergenceV1,
  buildDecisionStateShadow,
  noteUnownedLocalEdit,
  resolveDecisionTakeover,
  serializeActivityDecisionShadow,
  serializeActivityDecisionTakeover,
} from '../decision-state';
import { buildDecisionReadinessAskUserResult } from './decision-readiness-ask-user-result.util';

export async function orchestrate(
  host: OrchestrateHost,
  request: RouteAndRunRequestDto,
  context: AgentContext,
  deadline?: { remainingMs: () => number; clamp: (ms: number, minMs?: number) => number },
): Promise<OrchestrationResult> {
  const startTime = Date.now();
  host.logger.log(
    `[Claude Orchestrator] 开始编排: request_id=${request.request_id}, message=${request.message.substring(0, 50)}...`,
  );
  host.logger.debug(
    `[Claude Orchestrator] SkillsRegistry: ${!!host.skillsRegistry}, ActionRegistry: ${!!host.actionRegistry}`,
  );

  const llmProvider = host.getLlmProvider(request);
  host.logger.debug(`[Claude Orchestrator] 使用 LLM 提供商: ${llmProvider}`);

  try {
    const boundTripIdEarly = (request.trip_id || context.tripId || '').trim();
    const resolvedMessage = resolveRouteAndRunUserMessage(request);

    /** P2：先冻结统一意图，再允许 RequestRouter / CRE 消费只读接管 */
    const unifiedDecision = resolveUnifiedIntent({
      message: resolvedMessage,
      tripId: boundTripIdEarly || null,
      entryPoint: request.options?.entry_point ?? null,
    });
    const liveTakeover = tryLiveRouteTakeover(
      unifiedDecision,
      resolvedMessage,
      boundTripIdEarly || null,
    );

    const entryDecision = resolveOrchestrateEntry({
      tripId: boundTripIdEarly,
      message: request.message ?? '',
      resolvedUserMessage: resolvedMessage,
      routingTaskType: context.routingTaskType,
      extractCountryCode: (msg) => host.extractCountryCodeFromMessage(msg),
    });
    context.requestRouterDecision = entryDecision;
    host.logger.debug(
      `[Claude Orchestrator] RequestRouter mode=${entryDecision.mode} depth=${entryDecision.decisionDepth} reason=${entryDecision.reason} request_id=${request.request_id}`,
    );

    /** CRE：P5 始终传入统一语义意图（不限 live takeover），压缩 keyword 兜底依赖 */
    let crePlan = buildContextRequirementPlan({
      message: request.message ?? '',
      tripId: boundTripIdEarly || null,
      routingTaskType: context.routingTaskType,
      actionKind: context.routingActionKind,
      unifiedSemanticIntent: unifiedDecision.semanticIntent,
      hints: {
        tripId: boundTripIdEarly || null,
        message: request.message ?? '',
        // 有绑定行程则可推导目的地；不假装 DayPlan/产品已装载（留给 FETCHABLE）
        destinationKnown: Boolean(boundTripIdEarly),
      },
    });
    context.contextRequirementPlan = crePlan;
    host.logger.log(
      `[CRE] operation=${crePlan.operation} nextAction=${crePlan.nextAction} blocking=${crePlan.blockingGaps.length} slimLoad=${crePlan.acquisition.slimLoad} request_id=${request.request_id} plan=${JSON.stringify(serializeCrePlanForObservability(crePlan))}`,
    );

    /**
     * Unified Intent Shadow（P0）+ Decision State 标注。
     */
    const intentShadow = buildUnifiedIntentShadowCompare({
      message: resolvedMessage,
      tripId: boundTripIdEarly || null,
      entryPoint: request.options?.entry_point ?? null,
      legacyTaskType: context.routingTaskType,
      legacyActionKind: context.routingActionKind,
      legacyCreOperation: crePlan.operation,
      legacyRouteMode: entryDecision.mode,
      legacyDecisionDepth: entryDecision.decisionDepth,
      decision: unifiedDecision,
    });
    context.unifiedIntentShadow = intentShadow;
    const shadowObs = {
      ...serializeUnifiedIntentShadow(intentShadow),
      liveTakeover: liveTakeover
        ? { kind: liveTakeover.kind, reason: liveTakeover.reason }
        : null,
    };
    host.logger.log(
      `[UnifiedIntent:shadow] mismatch=${intentShadow.routeMismatch} takeover=${liveTakeover?.kind ?? 'none'} new=${intentShadow.decision.semanticIntent}/${intentShadow.decision.routeClass} legacy=${intentShadow.legacyRouteLabel} reasons=${intentShadow.mismatchReasons.join('|') || '-'} request_id=${request.request_id} payload=${JSON.stringify(shadowObs)}`,
    );

    /**
     * Decision State Contract：Activity / Lodging MDS → Readiness takeover。
     * CRE/ROR 对已接管决策族仅 OBSERVE；InteractionPolicy 活动/住宿特例不再叠加。
     */
    const focusDayHint =
      crePlan.target?.dayIndex ??
      (request.options as { focus_day?: number } | undefined)?.focus_day ??
      null;
    const decisionStateShadow = buildDecisionStateShadow({
      message: resolvedMessage,
      activityHints: {
        message: resolvedMessage,
        focusDayIndex: focusDayHint,
      },
      lodgingHints: {
        message: resolvedMessage,
        tripId: boundTripIdEarly || null,
        focusDayIndex: focusDayHint,
      },
      transportHints: {
        message: resolvedMessage,
        tripId: boundTripIdEarly || null,
        focusDayIndex: focusDayHint,
      },
      diningRiskHints: {
        message: resolvedMessage,
        tripId: boundTripIdEarly || null,
        focusDayIndex: focusDayHint,
      },
      legacy: {
        creOperation: crePlan.operation,
        creNextAction: crePlan.nextAction,
        wouldAskUser:
          crePlan.nextAction === 'ASK_USER' || crePlan.blockingGaps.length > 0,
        blockKeys: crePlan.blockingGaps.map((g) => g.key),
      },
    });
    /** Phase3：合同驱动 fetchKeys */
    if (decisionStateShadow.contract) {
      crePlan = applyContractAcquisitionToCrePlan(crePlan, decisionStateShadow.contract);
      context.contextRequirementPlan = crePlan;
    }
    const decisionTakeover = resolveDecisionTakeover(decisionStateShadow);
    const decisionStateDivergence = buildDecisionStateDivergenceV1({
      shadow: decisionStateShadow,
      takeover: decisionTakeover,
    });
    context.decisionStateShadow = decisionStateShadow;
    const decisionStateOwnsAsk = decisionTakeover.kind !== 'INACTIVE';
    const unownedLocalEdit = noteUnownedLocalEdit({
      message: resolvedMessage,
      creOperation: crePlan.operation,
      semanticIntent: unifiedDecision.semanticIntent,
      mdsOwnsAsk: decisionStateOwnsAsk,
    });
    const decisionStateShadowObs: Record<string, unknown> = {
      ...serializeActivityDecisionShadow(decisionStateShadow),
      phase2_takeover: serializeActivityDecisionTakeover(decisionTakeover),
      divergence_v1: decisionStateDivergence,
      ...(unownedLocalEdit
        ? { unowned_local_edit: unownedLocalEdit }
        : {}),
    };
    if (decisionStateShadow.classified.decisionClass) {
      host.logger.log(
        `[DecisionState:shadow] class=${decisionStateShadow.classified.decisionClass} readiness=${decisionStateShadow.readiness?.readiness ?? 'n/a'} next=${decisionStateShadow.readiness?.nextAction ?? 'n/a'} takeover=${decisionTakeover.kind} diverge=${decisionStateShadow.legacyCompare.divergenceCodes.join('|') || '-'} legacy_over_ask=${decisionStateDivergence.legacy_over_ask} request_id=${request.request_id} payload=${JSON.stringify(decisionStateShadowObs)}`,
      );
    }

    /** Readiness 独占 ASK / BLOCK（CRE/ROR 不得并行出站追问） */
    if (
      decisionTakeover.kind === 'ASK_FROM_READINESS' ||
      decisionTakeover.kind === 'BLOCK_FROM_READINESS'
    ) {
      host.logger.log(
        `[DecisionState:takeover] ${decisionTakeover.kind} reason=${decisionTakeover.reason} request_id=${request.request_id}`,
      );
      return buildDecisionReadinessAskUserResult({
        request,
        shadow: decisionStateShadow,
        takeover: decisionTakeover,
        startTime,
      });
    }

    /** P1：LLM 消歧 Shadow（超时不阻断主链；结果只写观测） */
    let llmShadowObs: Record<string, unknown> | null = null;
    if (host.classifyUnifiedIntentLlmShadow) {
      try {
        const llmShadowPromise = host.classifyUnifiedIntentLlmShadow({
          message: resolvedMessage,
          tripId: boundTripIdEarly || null,
          entryPoint: request.options?.entry_point ?? null,
          ruleDecision: unifiedDecision,
        });
        const timeoutMs = Number(process.env.UNIFIED_INTENT_LLM_SHADOW_TIMEOUT_MS ?? 2500);
        const llmShadow = await Promise.race([
          llmShadowPromise,
          new Promise<null>((resolve) => setTimeout(() => resolve(null), timeoutMs)),
        ]);
        if (llmShadow) {
          const {
            serializeUnifiedIntentLlmShadow,
          } = require('../intent/unified-intent.llm-classifier') as typeof import('../intent/unified-intent.llm-classifier');
          llmShadowObs = serializeUnifiedIntentLlmShadow(llmShadow);
          host.logger.log(
            `[UnifiedIntent:llm-shadow] ran=${llmShadow.ran} agree=${llmShadow.agree} rule=${llmShadow.ruleIntent} llm=${llmShadow.llm?.semanticIntent ?? '-'} request_id=${request.request_id} payload=${JSON.stringify(llmShadowObs)}`,
          );
        }
      } catch (e: unknown) {
        host.logger.debug(
          `[UnifiedIntent:llm-shadow] error ${e instanceof Error ? e.message : String(e)} request_id=${request.request_id}`,
        );
      }
    }

    if (
      crePlan.nextAction === 'ASK_USER' &&
      entryDecision.mode !== 'LIGHTWEIGHT' &&
      entryDecision.mode !== 'TEAM_STRUCTURED_DISCUSSION'
    ) {
      const {
        resolveCreInteractionPolicy,
        interactionPolicyShouldShortCircuitAsk,
      } = require('../intent/interaction-policy') as typeof import('../intent/interaction-policy');
      const creIx = resolveCreInteractionPolicy({
        intent: unifiedDecision,
        plan: crePlan,
        decisionStateDefer: decisionStateOwnsAsk,
      });
      host.logger.log(
        `[InteractionPolicy] source=CRE outcome=${creIx.outcome} reason=${creIx.reason} suppressed=${(creIx.suppressedAskKeys ?? []).join(',') || '-'} mds_defer=${decisionStateOwnsAsk} request_id=${request.request_id}`,
      );
      if (creIx.reason === 'decision_state_owns_ask') {
        host.logger.log(
          `[CRE] ASK_USER deferred to DecisionState gaps=${crePlan.blockingGaps.map((g) => g.key).join(',')} request_id=${request.request_id}`,
        );
      } else if (interactionPolicyShouldShortCircuitAsk(creIx)) {
        host.logger.log(
          `[CRE] ASK_USER 经 InteractionPolicy 短路 gaps=${(creIx.askKeys ?? crePlan.blockingGaps.map((g) => g.key)).join(',')} request_id=${request.request_id}`,
        );
        return buildCreAskUserResult({ request, plan: crePlan, startTime });
      } else {
        host.logger.log(
          `[CRE] ASK_USER 被 InteractionPolicy 降级为 ${creIx.outcome}，继续主链 request_id=${request.request_id}`,
        );
      }
    }

    /** ROR：CRE 之后、Gate 之前 — Plan→Execute→Reflect→Freeze */
    let rorObs: Record<string, unknown> | null = null;
    if (
      entryDecision.mode !== 'LIGHTWEIGHT' &&
      entryDecision.mode !== 'TEAM_STRUCTURED_DISCUSSION'
    ) {
      const activityFlags = inferCreActivityFlagsFromMessage(request.message ?? '');
      const dayIndex = crePlan.target.dayIndex ?? null;
      let tripDay: import('../reality-observation/observation-seed.builder').TripDaySeed | null =
        null;
      if (boundTripIdEarly && host.loadRorTripDaySeed) {
        try {
          tripDay = await host.loadRorTripDaySeed(boundTripIdEarly, dayIndex);
        } catch (e: unknown) {
          host.logger.debug(
            `[ROR] trip day prefetch skipped: ${e instanceof Error ? e.message : String(e)}`,
          );
        }
      }
      const seedFacts = {
        byKey: {
          ...(boundTripIdEarly ? { 'trip.id': boundTripIdEarly } : {}),
          ...(dayIndex != null
            ? { 'targetDay.date': tripDay?.date ?? dayIndex, 'page.focusDay': dayIndex }
            : {}),
        },
      };
      const fetchHost = host.buildRorObservationFetchHost?.({
        seeds: seedFacts,
        cityHint: tripDay?.weatherCityHint ?? null,
        dateYmd: typeof tripDay?.date === 'string' ? tripDay.date : null,
        destinationHint: tripDay?.destinationHint ?? null,
        latitudeDeg: tripDay?.latitudeDeg ?? null,
        longitudeDeg: tripDay?.longitudeDeg ?? null,
        routeLegs: tripDay?.routeLegs ?? null,
        travelMinutesHint: tripDay?.travelMinutesHint ?? null,
        travelMode: tripDay?.travelMode ?? null,
      });
      const ror = await runRealityObservationRuntime({
        message: request.message ?? '',
        scope: {
          tripId: boundTripIdEarly || null,
          dayIndex,
          message: request.message ?? '',
        },
        crePlan,
        tripDay,
        host: fetchHost,
        travelMode: tripDay?.travelMode ?? null,
        containsOutdoorActivity: activityFlags.containsOutdoorActivity,
        containsReservableActivity: activityFlags.containsReservableActivity,
        /** ASK/slim 不挖 latent；其余任务可挖但不注入 Gate 投影 */
        includeLatent: crePlan.acquisition.slimLoad !== true,
        seeds: seedFacts,
      });
      rorObs = ror.observability;
      if (ror.snapshot) {
        context.realityObservationSnapshot = ror.snapshot;
        host.logger.log(
          `[ROR] task=${ror.snapshot.operation} next=${ror.snapshot.nextActionAfterFreeze} conf=${ror.snapshot.confidence.toFixed(2)} rounds=${ror.snapshot.reflectRoundsUsed} latent=${ror.snapshot.latentHypotheses.length} canonicalOnlyGate=1 obs=${JSON.stringify(rorObs)} request_id=${request.request_id}`,
        );
        if (ror.snapshot.nextActionAfterFreeze === 'ASK_USER') {
          const {
            resolveRorInteractionPolicy,
            interactionPolicyShouldShortCircuitAsk,
          } = require('../intent/interaction-policy') as typeof import('../intent/interaction-policy');
          const rorIx = resolveRorInteractionPolicy({
            intent: unifiedDecision,
            snapshot: ror.snapshot,
            decisionStateDefer: decisionStateOwnsAsk,
          });
          host.logger.log(
            `[InteractionPolicy] source=ROR outcome=${rorIx.outcome} reason=${rorIx.reason} suppressed=${(rorIx.suppressedAskKeys ?? []).join(',') || '-'} mds_defer=${decisionStateOwnsAsk} request_id=${request.request_id}`,
          );
          if (rorIx.reason === 'decision_state_owns_ask') {
            host.logger.log(
              `[ROR] ASK_USER deferred to DecisionState (${decisionTakeover.kind}/${decisionTakeover.reason}) request_id=${request.request_id}`,
            );
          } else if (!interactionPolicyShouldShortCircuitAsk(rorIx)) {
            /** MDS 未接管：仅 InteractionPolicy 可 soft-continue（已无 pace/optimize/add 特例） */
            host.logger.log(
              `[ROR] ASK_USER soft-continue via InteractionPolicy (${rorIx.outcome}) request_id=${request.request_id}`,
            );
          } else {
            host.logger.log(
              `[ROR] ASK_USER 经 InteractionPolicy 短路 request_id=${request.request_id}`,
            );
            return buildRorAskUserResult({
              request,
              snapshot: ror.snapshot,
              startTime,
            });
          }
        }
      } else {
        host.logger.debug(
          `[ROR] skipped reason=${ror.reason} request_id=${request.request_id}`,
        );
      }
    }

    const entryDispatched = await dispatchOrchestrateEntry({
      entryDecision,
      request,
      context,
      deadline,
      llmProvider,
      startTime,
      host: host.asOrchestrateEntryHost(),
    });
    if (entryDispatched.kind === 'terminal') {
      const terminal = entryDispatched.result;
      if (terminal.decisionLog?.[0] && crePlan) {
        const first = terminal.decisionLog[0];
        first.metadata = {
          ...(first.metadata && typeof first.metadata === 'object' ? first.metadata : {}),
          context_requirement_plan: serializeCrePlanForObservability(crePlan),
          unified_intent_shadow: shadowObs,
          decision_state_contract_shadow: decisionStateShadowObs,
          ...(llmShadowObs ? { unified_intent_llm_shadow: llmShadowObs } : {}),
          ...(rorObs ? { reality_observation_snapshot: rorObs } : {}),
        };
      }
      if (terminal.result && typeof terminal.result === 'object') {
        (terminal.result as Record<string, unknown>).contextRequirementPlan =
          serializeCrePlanForObservability(crePlan);
        (terminal.result as Record<string, unknown>).unifiedIntentShadow = shadowObs;
        (terminal.result as Record<string, unknown>).decisionStateShadow =
          decisionStateShadowObs;
        (terminal.result as Record<string, unknown>).decisionStateDivergence =
          decisionStateDivergence;
        if (llmShadowObs) {
          (terminal.result as Record<string, unknown>).unifiedIntentLlmShadow = llmShadowObs;
        }
        if (rorObs) {
          (terminal.result as Record<string, unknown>).realityObservationSnapshot = rorObs;
        }
      }
      return terminal;
    }

    const dagResult = await runDynamicDagPath(
      host.asDynamicDagHost(),
      request,
      context,
      deadline,
      llmProvider,
      startTime,
    );
    const creObs = serializeCrePlanForObservability(crePlan);
    if (dagResult.result && typeof dagResult.result === 'object') {
      (dagResult.result as Record<string, unknown>).contextRequirementPlan = creObs;
      (dagResult.result as Record<string, unknown>).unifiedIntentShadow = shadowObs;
      (dagResult.result as Record<string, unknown>).decisionStateShadow =
        decisionStateShadowObs;
      (dagResult.result as Record<string, unknown>).decisionStateDivergence =
        decisionStateDivergence;
      if (llmShadowObs) {
        (dagResult.result as Record<string, unknown>).unifiedIntentLlmShadow = llmShadowObs;
      }
      if (rorObs) {
        (dagResult.result as Record<string, unknown>).realityObservationSnapshot = rorObs;
      }
      if (context.realityObservationSnapshot?.decisionSnapshot) {
        /** Gate 只读 Canonical v1 投影，不附带 latent 全量 */
        (dagResult.result as Record<string, unknown>).decisionRealitySnapshot =
          context.realityObservationSnapshot.decisionSnapshot;
        (dagResult.result as Record<string, unknown>).realityLoadMode = 'CANONICAL_ONLY';
        (dagResult.result as Record<string, unknown>).latentHypothesesForSuggest =
          context.realityObservationSnapshot.latentHypotheses;
      }
    }
    if (dagResult.decisionLog?.length) {
      const first = dagResult.decisionLog[0];
      first.metadata = {
        ...(first.metadata && typeof first.metadata === 'object' ? first.metadata : {}),
        context_requirement_plan: creObs,
        unified_intent_shadow: shadowObs,
        decision_state_contract_shadow: decisionStateShadowObs,
        ...(llmShadowObs ? { unified_intent_llm_shadow: llmShadowObs } : {}),
        ...(rorObs ? { reality_observation_snapshot: rorObs } : {}),
      };
    }
    return dagResult;
  } catch (error: any) {
    host.logger.error(
      `[Claude Orchestrator] ❌ 编排失败: ${error?.message || String(error)}`,
      error?.stack,
    );

    const isTimeoutError =
      error?.code === 'ECONNABORTED' ||
      error?.message?.includes('timeout') ||
      error?.message?.includes('超时') ||
      error?.message?.startsWith('TIMEOUT:');

    if (isTimeoutError) {
      host.logger.error(`[Claude Orchestrator] 请求超时，返回超时错误信息`);
      return {
        success: false,
        result: {
          needsUserConfirmation: false,
          clarificationMessage: '请求超时，请缩小范围或稍后重试。',
          errorType: ErrorType.TIMEOUT_ERROR,
          missingParams: [],
          solutions: ['请稍后重试', '简化您的请求内容', '减少请求的复杂度'],
        },
        answerText: '请求超时，请缩小范围或稍后重试。',
        stepsExecuted: [],
        totalDuration: Date.now() - startTime,
        decisionLog: [],
      };
    }

    const errorInfo = {
      message: error?.message || '未知错误',
      stack: error?.stack,
      skillsRegistryAvailable: !!host.skillsRegistry,
      actionRegistryAvailable: !!host.actionRegistry,
    };
    host.logger.error(`[Claude Orchestrator] 错误详情: ${JSON.stringify(errorInfo, null, 2)}`);

    return {
      success: false,
      result: {
        errors: error?.message || '未知错误',
      },
      answerText: `抱歉，处理您的请求时出现错误：${error?.message || '未知错误'}`,
      stepsExecuted: [],
      totalDuration: Date.now() - startTime,
      decisionLog: [
        {
          request_id: request.request_id,
          step: 'FAILED' as OrchestrationStep,
          actor: 'Orchestrator' as SubAgentType,
          inputs_summary: `用户请求: ${request.message}`,
          outputs_summary: `处理失败: ${error?.message || '未知错误'}`,
          evidence_refs: [],
          timestamp: new Date().toISOString(),
          metadata: {
            error: error?.message || '未知错误',
            skillsRegistryAvailable: !!host.skillsRegistry,
            actionRegistryAvailable: !!host.actionRegistry,
          },
        },
      ],
    };
  }
}

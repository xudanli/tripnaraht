/**
 * LIVE_EXECUTION 快路径：TaskContract → 传感器 Evidence → LiveConclusion → 答复。
 * MUST NOT：静默改行程 / 无证据强结论（由 Live Runtime 保证）。
 */

import type { RouteAndRunRequestDto, RouteAndRunResponseDto } from '../dto/route-and-run.dto';
import type { DecisionLogEntry } from '../interfaces/trip-plan.interface';
import {
  attachConversationTurnToRouteAndRunResponse,
  buildTripConversationContextSnapshot,
} from '../delivery/conversation';
import { resolveRouteAndRunUserMessage } from '../utils/resolve-route-and-run-message.util';
import {
  applyAgentTaskContractInPlace,
  projectAgentTaskContractForTrace,
  readAgentTaskContract,
} from '../harness/compile-agent-task-contract.util';
import {
  buildLiveExecutionAnswerZh,
  projectLiveExecutionForTrace,
  runLiveExecutionPipeline,
  type LiveEvidenceFactV1,
} from '../harness/live-execution-runtime.util';
import {
  collectLiveEvidenceFromSensorBlocks,
} from '../harness/collect-live-sensor-evidence.util';
import { bindLiveExecutionSensorHostFromAgent } from '../harness/bind-live-execution-sensor-host.util';
import {
  buildTravelingExecutionConclusion,
} from '../delivery/conversation/traveling-execution-conclusion.util';
import {
  buildAgentTurnTrace,
  projectAgentTurnTraceForObservability,
} from '../harness/hardening/agent-turn-trace.util';
import {
  assertRuntimeTransition,
  type HarnessRuntimeId,
} from '../harness/hardening/runtime-transition.contract';
import {
  normalizeEvidenceFreshness,
  liveVerdictToStrength,
  type EvidenceFactV1,
} from '../harness/hardening/evidence.contract';
import {
  adaptLiveEvidenceFactV1,
  buildLiveFeasibilityClaims,
  compileSystem1AcquisitionPlan,
  createLiveFeasibilityFetcher,
  ensureSystem1CrePlan,
  executeEvidenceAcquisition,
  mergeSystem1Evidence,
  projectSystem1TurnTrace,
  runSystem1DecisionRuntime,
} from '../system1-runtime';
import { evaluateClaimGroundingForHarness } from '../harness/hardening/claim-grounding-eval.util';
import {
  projectTravelWorldStateForTurn,
  echoTravelWorldStateObservability,
  readTravelWorldStateSeedFromOptions,
  readOutcomeReconciliationFromOptions,
  appendOutcomeToTravelEventLedger,
} from '../state-learning/attach-state-learning.util';
import { getDefaultTravelEventLedger } from '../state-learning/travel-event-ledger.store';

export type LiveExecutionFastPathHost = {
  logger?: { warn?: (msg: string) => void; log?: (msg: string) => void };
  /** 可选：拉取天气传感器文案块 */
  fetchLiveWeatherBlock?: (input: {
    request: RouteAndRunRequestDto;
    tripId?: string;
  }) => Promise<{ block?: string | null; riskZh?: string | null } | null>;
  /** 可选：拉取路况文案块 */
  fetchLiveRoadBlock?: (input: {
    request: RouteAndRunRequestDto;
    tripId?: string;
  }) => Promise<{ block?: string | null; alertZh?: string | null; aggregate?: string | null } | null>;
};

function buildLiveResponse(params: {
  request: RouteAndRunRequestDto;
  startTime: number;
  answerText: string;
  conclusionTrace: Record<string, unknown>;
  contractTrace?: Record<string, unknown>;
  turnTrace?: Record<string, unknown>;
  travelingProjection?: ReturnType<typeof buildTravelingExecutionConclusion>;
  verdict: string;
}): RouteAndRunResponseDto {
  const latencyMs = Date.now() - params.startTime;
  const response = {
    request_id: params.request.request_id,
    route: {
      route: 'SYSTEM1_API',
      confidence: 0.9,
      reasons: ['LIVE_EXECUTION_FAST_PATH'],
      required_capabilities: ['live_execution'],
      consent_required: false,
      budget: { max_seconds: 8, max_steps: 0, max_browser_steps: 0 },
      ui_hint: {
        mode: 'fast',
        status: 'done',
        message: '行程执行结论',
      },
    },
    result: {
      status: 'OK',
      answer_text: params.answerText,
      payload: {
        trip_id: params.request.trip_id,
        ui_surface: 'live_execution',
        conversation_route: 'LIVE_EXECUTION',
        live_execution_conclusion: params.conclusionTrace,
        traveling_execution_conclusion: params.travelingProjection,
        applied_to_itinerary: false,
        ...(params.turnTrace ? { agent_turn_trace: params.turnTrace } : {}),
      },
    },
    ui_state: {
      phase: 'DONE',
      ui_status: 'done',
      active_skill: null,
      pending_question: null,
    },
    explain: {
      decision_log: [
        {
          request_id: params.request.request_id,
          step: 'INTAKE',
          actor: 'Orchestrator',
          inputs_summary: resolveRouteAndRunUserMessage(params.request).slice(0, 200),
          outputs_summary: `live_execution verdict=${params.verdict}`,
          evidence_refs: [],
          timestamp: new Date().toISOString(),
          metadata: {
            live_execution_conclusion: params.conclusionTrace,
            agent_task_contract: params.contractTrace,
            agent_turn_trace: params.turnTrace,
            applied_to_itinerary: false,
          },
        } as DecisionLogEntry,
      ],
    },
    observability: {
      latency_ms: latencyMs,
      router_ms: 0,
      system_mode: 'SYSTEM1',
      tool_calls: 0,
      browser_steps: 0,
      tokens_est: 0,
      cost_est_usd: 0,
      fallback_used: false,
      orchestration_mode_final: 'LIVE_EXECUTION_FAST_PATH',
      agent_task_contract: params.contractTrace,
      live_execution_conclusion: params.conclusionTrace,
      ...(params.turnTrace ? { agent_turn_trace: params.turnTrace } : {}),
    },
  } as unknown as RouteAndRunResponseDto;

  return attachConversationTurnToRouteAndRunResponse(response, {
    context: buildTripConversationContextSnapshot({
      trip_id: params.request.trip_id,
      today_ymd: new Date().toISOString().slice(0, 10),
    }),
  });
}

/**
 * @returns 命中 LIVE_EXECUTION 则返回；否则 null。
 */
export async function tryBuildLiveExecutionFastPath(
  agent: LiveExecutionFastPathHost | undefined,
  request: RouteAndRunRequestDto,
  startTime: number,
): Promise<RouteAndRunResponseDto | null> {
  applyAgentTaskContractInPlace(request);
  const contract = readAgentTaskContract(request);
  if (!contract || contract.taskType !== 'LIVE_EXECUTION') return null;

  const host = bindLiveExecutionSensorHostFromAgent(agent);
  const message = resolveRouteAndRunUserMessage(request);
  const tripId = request.trip_id?.trim();
  const liveFacts: LiveEvidenceFactV1[] = [];
  const sensorAudit: Array<{ source: string; ok: boolean; detail?: string }> = [];

  /** 请求侧可注入（测试 / 上游已采） */
  const injected = (request.options as any)?.live_sensor_evidence as
    | {
        weather_block?: string;
        road_block?: string;
        weather_risk_zh?: string;
        road_alert_zh?: string;
        road_aggregate?: string;
        skip_host_fetch?: boolean;
      }
    | undefined;
  if (injected) {
    liveFacts.push(
      ...collectLiveEvidenceFromSensorBlocks({
        weatherBlock: injected.weather_block,
        roadBlock: injected.road_block,
        weatherRiskZh: injected.weather_risk_zh,
        roadAlertZh: injected.road_alert_zh,
        ontologyRoadAggregate: injected.road_aggregate,
      }),
    );
    sensorAudit.push({ source: 'injected', ok: liveFacts.length > 0 });
  }

  const skipHost = injected?.skip_host_fetch === true;
  let system1Evidence = adaptLiveEvidenceFactV1(liveFacts);
  const crePlan = ensureSystem1CrePlan({
    family: 'LIVE_FEASIBILITY',
    message,
    tripId,
    hints: {
      message,
      tripId: tripId ?? null,
      travelMode: 'SELF_DRIVE',
      destinationKnown: Boolean(tripId),
      hasWeather: liveFacts.some((f) => f.key === 'weather'),
      hasRoadStatus: liveFacts.some((f) => f.key === 'road'),
    },
  });
  const compiled = compileSystem1AcquisitionPlan({
    family: 'LIVE_FEASIBILITY',
    evidence: system1Evidence,
    tripId,
    skipExternalFetch: skipHost,
    crePlan,
  });
  const required = compiled.required;
  const acquisitionPlan = compiled.plan;

  if (!skipHost && acquisitionPlan.fetchKeys.length > 0) {
    const acquired = await executeEvidenceAcquisition({
      plan: acquisitionPlan,
      fetch: createLiveFeasibilityFetcher({ host, request, tripId }),
    });
    system1Evidence = mergeSystem1Evidence([system1Evidence, acquired.evidence]);
    for (const row of acquired.plan.fetchLog ?? []) {
      sensorAudit.push({
        source: `acquisition:${row.key}`,
        ok: row.ok,
        detail: row.detail,
      });
    }
    Object.assign(acquisitionPlan, {
      fetchedKeys: acquired.plan.fetchedKeys,
      fetchLog: acquired.plan.fetchLog,
    });
    for (const e of acquired.evidence) {
      if (e.status === 'UNAVAILABLE') continue;
      if (e.key === 'weather.wind') {
        liveFacts.push({
          key: 'weather',
          valueZh: typeof e.value === 'string' ? e.value : String(e.value ?? ''),
          freshness: e.status === 'VERIFIED' ? 'LIVE' : e.status === 'STALE' ? 'STALE' : 'ASSUMED',
          source: e.sourceRef ?? e.provenance?.provider,
        });
      }
      if (e.key === 'route.status') {
        liveFacts.push({
          key: 'road',
          valueZh: typeof e.value === 'string' ? e.value : String(e.value ?? ''),
          freshness: e.status === 'VERIFIED' ? 'LIVE' : e.status === 'STALE' ? 'STALE' : 'ASSUMED',
          source: e.sourceRef ?? e.provenance?.provider,
        });
      }
    }
  }

  const evidence: LiveEvidenceFactV1[] = liveFacts;

  const postCompiled = compileSystem1AcquisitionPlan({
    family: 'LIVE_FEASIBILITY',
    evidence: system1Evidence,
    tripId,
    skipExternalFetch: skipHost,
    alreadyFetched: acquisitionPlan.fetchedKeys ?? acquisitionPlan.fetchKeys,
    crePlan,
  });
  const acquisition = {
    ...postCompiled.plan,
    fetchedKeys: acquisitionPlan.fetchedKeys ?? [],
    fetchLog: acquisitionPlan.fetchLog ?? [],
  };

  const pipe = runLiveExecutionPipeline({
    contract,
    message,
    evidence,
    remainingDriveHours:
      typeof (request.options as any)?.remaining_drive_hours === 'number'
        ? (request.options as any).remaining_drive_hours
        : null,
  });

  const adapted = mergeSystem1Evidence([
    system1Evidence,
    adaptLiveEvidenceFactV1(pipe.conclusion.evidence),
  ]);
  const runtime = runSystem1DecisionRuntime({
    message,
    tripId,
    lifecycle: contract.lifecycle,
    contract,
    family: 'LIVE_FEASIBILITY',
    creOperation: crePlan.operation,
    evidence: adapted,
    acquisition,
    requiredEvidence: required,
    cre: compiled.cre,
    claims: buildLiveFeasibilityClaims({
      conclusionZh: pipe.conclusion.conclusionZh,
      verdict: pipe.conclusion.verdict,
      hasEta: pipe.conclusion.evidence.some((e) => e.key === 'remaining_drive_hours'),
      etaText: pipe.conclusion.evidence.find((e) => e.key === 'remaining_drive_hours')?.valueZh,
      hasWeather: adapted.some((e) => e.key === 'weather.wind' && e.status !== 'UNAVAILABLE'),
      weatherText: adapted.find((e) => e.key === 'weather.wind')
        ? String(adapted.find((e) => e.key === 'weather.wind')?.value ?? '')
        : undefined,
    }),
    draftAnswer: pipe.conclusion.conclusionZh,
  });

  if (
    pipe.conclusion.verdict === 'YES' &&
    runtime.routeDecision.answerMode !== 'STRONG'
  ) {
    pipe.conclusion.verdict = 'CONDITIONAL';
    pipe.conclusion.conclusionZh +=
      '（关键证据不足或过期，已降为有条件判断，不会自动改行程。）';
  } else if (
    runtime.sufficiency?.status === 'CONFLICTED' &&
    pipe.conclusion.verdict !== 'NO'
  ) {
    pipe.conclusion.verdict = 'CONDITIONAL';
    pipe.conclusion.conclusionZh += '（证据冲突，System1 不仲裁，建议升级 System2。）';
  }
  runtime.finalAnswer = buildLiveExecutionAnswerZh(pipe.conclusion);

  const answerText = runtime.finalAnswer;
  const travelingProjection = buildTravelingExecutionConclusion({
    answer_text: pipe.conclusion.conclusionZh,
    weather_risk_zh: evidence.find((e) => e.key === 'weather')?.valueZh,
    road_alert_zh: evidence.find((e) => e.key === 'road')?.valueZh,
    delay_minutes: (() => {
      const d = evidence.find((e) => e.key === 'delay_hours');
      const m = d?.valueZh.match(/(\d+(?:\.\d+)?)/);
      return m ? Math.round(Number(m[1]) * 60) : null;
    })(),
    alternative_shorten_zh: pipe.conclusion.alternativesZh[0],
  });

  host.logger?.log?.(
    `[LiveExecutionFastPath] verdict=${pipe.conclusion.verdict} evidence=${evidence.length} cre=${crePlan.operation}/${crePlan.nextAction} fetch=${(acquisition.fetchedKeys ?? []).join(',') || '-'} request_id=${request.request_id}`,
  );

  const evidenceContract: EvidenceFactV1[] = pipe.conclusion.evidence.map((e) => ({
    key: e.key,
    valueZh: e.valueZh,
    freshness: normalizeEvidenceFreshness(e.freshness),
    source: e.source,
  }));
  const previousRuntime = (request.options as { harness_previous_runtime?: HarnessRuntimeId } | undefined)
    ?.harness_previous_runtime;
  const transition = previousRuntime
    ? assertRuntimeTransition({
        from: previousRuntime,
        to: 'LIVE_EXECUTION',
        explicitEscalation: (request.options as any)?.harness_explicit_escalation === true,
        newTaskId: (request.options as any)?.harness_new_task_id === true,
        strongConfirmation: (request.options as any)?.harness_strong_confirmation === true,
      })
    : { ok: true as const, rule: 'no_previous' };
  const turnTrace = projectAgentTurnTraceForObservability(
    buildAgentTurnTrace({
      contract,
      runtimeSelected: 'LIVE_EXECUTION',
      runtimePrevious: previousRuntime,
      transitionOk: transition.ok,
      transitionReason: transition.ok ? transition.rule : (transition as any).reason,
      evidence: evidenceContract,
      claimGrounding: evaluateClaimGroundingForHarness(runtime),
      attemptedCapabilities: ['ANSWER', 'QUERY_RISK'],
      resultStatus: 'OK',
      conclusionStrength: liveVerdictToStrength(pipe.conclusion.verdict),
      answerPreviewZh: answerText,
      appliedToItinerary: false,
      unauthorizedWriteAttempt: false,
    }),
  );

  const worldState = projectTravelWorldStateForTurn({
    tripId: request.trip_id,
    contract,
    seed: readTravelWorldStateSeedFromOptions(
      request.options as Record<string, unknown> | undefined,
    ),
    liveConclusion: pipe.conclusion,
  });
  const worldStateEcho = echoTravelWorldStateObservability(worldState);

  /** Live 风险情景写入 Ledger（Context-only，非 Evidence） */
  if (request.trip_id?.trim() && evidence.some((e) => e.key === 'weather' || e.key === 'road')) {
    getDefaultTravelEventLedger().append({
      kind: 'LIVE_RISK',
      correlation: {
        tripId: request.trip_id.trim(),
        turnId: contract.turnId,
        taskId: contract.taskId,
        worldStateProjectedAt: worldState.projectedAt,
      },
      payload: {
        verdict: pipe.conclusion.verdict,
        risk_keys: evidence
          .filter((e) => e.key === 'weather' || e.key === 'road')
          .map((e) => e.key),
        not_evidence: true,
      },
    });
  }

  let outcomeEcho: Record<string, unknown> | undefined;
  const outcomeReq = readOutcomeReconciliationFromOptions(
    request.options as Record<string, unknown> | undefined,
  );
  if (outcomeReq && request.trip_id?.trim()) {
    outcomeEcho = appendOutcomeToTravelEventLedger({
      tripId: request.trip_id.trim(),
      outcome: { ...outcomeReq, turnId: outcomeReq.turnId ?? contract.turnId },
    }).observability;
  }

  const response = buildLiveResponse({
    request,
    startTime,
    answerText,
    verdict: pipe.conclusion.verdict,
    conclusionTrace: projectLiveExecutionForTrace(pipe.conclusion),
    contractTrace: projectAgentTaskContractForTrace(contract),
    turnTrace,
    travelingProjection,
  });
  (response.observability as any).live_sensor_audit = sensorAudit;
  (response.observability as any).travel_world_state = worldStateEcho;
  if (outcomeEcho) {
    (response.observability as any).outcome_reconciliation = outcomeEcho;
  }
  if (response.result?.payload) {
    (response.result.payload as any).live_sensor_audit = sensorAudit;
    (response.result.payload as any).travel_world_state = worldStateEcho;
    (response.result.payload as any).system1_runtime = projectSystem1TurnTrace(runtime);
  }
  (response.observability as any).system1_runtime = projectSystem1TurnTrace(runtime);
  return response;
}

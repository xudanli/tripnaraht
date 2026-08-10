/**
 * DECISION_SUPPORT 快路径：开放取舍题 → TravelDecisionProblem → decision_options。
 * Commit：写入 trip.metadata 决策目标；可选草案 CTA；不静默改行程。
 */

import type { RouteAndRunRequestDto, RouteAndRunResponseDto } from '../dto/route-and-run.dto';
import type { DecisionLogEntry } from '../interfaces/trip-plan.interface';
import { PrismaService } from '../../prisma/prisma.service';
import {
  attachConversationTurnToRouteAndRunResponse,
  buildTripConversationContextSnapshot,
} from '../delivery/conversation';
import { resolveRouteAndRunUserMessage } from '../utils/resolve-route-and-run-message.util';
import {
  buildDecisionCommitAnswerText,
  buildDecisionSupportAnswerText,
  buildDraftBridgeMessage,
  buildTravelDecisionProblem,
  commitTravelDecisionSelection,
  detectDecisionSelectIntent,
  detectDecisionSupportCandidate,
  detectProactiveDecisionCandidate,
  findOpenDecisionForTrip,
  getTravelDecisionProblem,
  hydrateTravelDecisionStoreFromMetadata,
  mergeTravelDecisionCommitmentIntoMetadata,
  projectDecisionProblemToTradeoffSource,
  putTravelDecisionProblem,
  upsertOpenTravelDecisionIntoMetadata,
  type TravelDecisionProblem,
} from '../decision-support';
import {
  applyAgentTaskContractInPlace,
  projectAgentTaskContractForTrace,
  readAgentTaskContract,
} from '../harness/compile-agent-task-contract.util';
import { isCapabilityAllowed } from '../harness/assert-task-capability.util';
import { tryRunDecisionFromMessage } from '../harness/decision-runtime.util';
import {
  applyHarnessPipelineToTravelProblem,
  mapHarnessDecisionKeyToRegistry,
  projectHarnessDecisionPipelineForTrace,
} from '../harness/adapt-harness-decision-to-travel.util';
import {
  buildAgentTurnTrace,
  projectAgentTurnTraceForObservability,
} from '../harness/hardening/agent-turn-trace.util';
import {
  assertRuntimeTransition,
  type HarnessRuntimeId,
} from '../harness/hardening/runtime-transition.contract';
import {
  projectTravelWorldStateForTurn,
  echoTravelWorldStateObservability,
  readTravelWorldStateSeedFromOptions,
  readOutcomeReconciliationFromOptions,
  appendOutcomeToTravelEventLedger,
} from '../state-learning/attach-state-learning.util';

function resolveDayCount(request: RouteAndRunRequestDto): number | null {
  const fromOpts = Number((request.options as any)?.day_count);
  if (Number.isFinite(fromOpts) && fromOpts > 0) return fromOpts;
  const meta = (request as any)?.trip_meta?.day_count;
  if (Number.isFinite(Number(meta)) && Number(meta) > 0) return Number(meta);
  return null;
}

function resolveWinterLikely(message: string, request: RouteAndRunRequestDto): boolean {
  if (/冬季|冬天|冬日|winter/i.test(message)) return true;
  const start = String(
    (request as any)?.trip_meta?.start_date ??
      (request.options as { start_date?: string } | undefined)?.start_date ??
      '',
  ).slice(5, 7);
  const month = Number(start);
  return Number.isFinite(month) && (month <= 3 || month >= 11);
}

function matchOptionFromHint(
  problem: TravelDecisionProblem,
  hint: { optionHint?: string; ordinal?: number },
): string | null {
  if (hint.ordinal != null) {
    const idx = hint.ordinal - 1;
    const o = problem.options[idx];
    return o && o.feasibility !== 'BLOCKED' ? o.optionId : null;
  }
  const h = String(hint.optionHint ?? '').toLowerCase();
  if (!h) return null;
  for (const o of problem.options) {
    if (o.feasibility === 'BLOCKED') continue;
    if (
      o.label_zh.toLowerCase().includes(h) ||
      o.optionId.toLowerCase().includes(h) ||
      h.includes(o.optionId.toLowerCase())
    ) {
      return o.optionId;
    }
  }
  if (/南岸深度|只走南岸|南岸/.test(h)) {
    const o = problem.options.find((x) => x.optionId === 'SOUTH_COAST');
    if (o) return o.optionId;
  }
  if (/环岛|完整环/.test(h)) {
    const o = problem.options.find((x) => x.optionId === 'RING_ROAD');
    if (o) return o.optionId;
  }
  if (/斯奈/.test(h)) {
    const o = problem.options.find((x) => x.optionId === 'SOUTH_PLUS_SNAEFELLSNES');
    if (o) return o.optionId;
  }
  if (/四驱|4wd|suv/.test(h)) {
    const o = problem.options.find((x) => x.optionId === '4WD' || x.optionId === '4WD_PLUS');
    if (o) return o.optionId;
  }
  if (/两驱|2wd/.test(h)) {
    const o = problem.options.find((x) => x.optionId === '2WD');
    if (o) return o.optionId;
  }
  return null;
}

function resolvePrisma(agent: any): PrismaService | undefined {
  return (
    agent?.prisma ?? agent?.moduleRef?.get?.(PrismaService, { strict: false })
  );
}

async function loadTripMetadata(agent: any, tripId: string): Promise<unknown> {
  const prisma = resolvePrisma(agent);
  if (!prisma?.trip?.findUnique) return null;
  try {
    const trip = await prisma.trip.findUnique({
      where: { id: tripId },
      select: { metadata: true },
    });
    return trip?.metadata ?? null;
  } catch {
    return null;
  }
}

async function persistOpenProblemToTrip(
  agent: any,
  problem: TravelDecisionProblem,
): Promise<boolean> {
  const prisma = resolvePrisma(agent);
  if (!prisma?.trip?.findUnique || !prisma?.trip?.update) return false;
  try {
    const trip = await prisma.trip.findUnique({
      where: { id: problem.tripId },
      select: { metadata: true },
    });
    if (!trip) return false;
    const nextMeta = upsertOpenTravelDecisionIntoMetadata(trip.metadata, problem);
    await prisma.trip.update({
      where: { id: problem.tripId },
      data: { metadata: nextMeta as any, updatedAt: new Date() },
    });
    return true;
  } catch (e: any) {
    agent?.logger?.warn?.(
      `[DecisionSupport] persist open problem failed: ${e?.message ?? e}`,
    );
    return false;
  }
}

async function persistCommitmentToTrip(
  agent: any,
  problem: TravelDecisionProblem,
): Promise<{
  persisted: boolean;
  contractPatch?: Record<string, unknown>;
  travelDecisionContract?: unknown;
}> {
  const prisma = resolvePrisma(agent);
  if (!prisma?.trip?.findUnique || !prisma?.trip?.update) {
    return { persisted: false };
  }
  try {
    const trip = await prisma.trip.findUnique({
      where: { id: problem.tripId },
      select: { metadata: true },
    });
    if (!trip) return { persisted: false };
    const nextMeta = mergeTravelDecisionCommitmentIntoMetadata(trip.metadata, problem);
    await prisma.trip.update({
      where: { id: problem.tripId },
      data: {
        metadata: nextMeta as any,
        updatedAt: new Date(),
      },
    });
    return {
      persisted: true,
      contractPatch: (nextMeta.travelDecisionLatest as Record<string, unknown>) ?? undefined,
      travelDecisionContract: nextMeta.travelDecisionContract,
    };
  } catch (e: any) {
    agent?.logger?.warn?.(
      `[DecisionSupport] persist commit failed: ${e?.message ?? e}`,
    );
    return { persisted: false };
  }
}

function buildDraftSuggestedOperation(
  tripId: string,
  problem: TravelDecisionProblem,
): Record<string, unknown> | null {
  const msg = buildDraftBridgeMessage(problem);
  if (!msg) return null;
  return {
    id: 'generate_decision_draft',
    label: '生成调整草案',
    label_zh: '生成调整草案',
    kind: 'route_and_run_message',
    payload: {
      message: msg,
      trip_id: tripId,
      decision_id: problem.decisionId,
      decision_key: problem.decisionKey,
    },
  };
}

function buildDecisionResponse(params: {
  request: RouteAndRunRequestDto;
  startTime: number;
  problem: TravelDecisionProblem;
  answerText: string;
  status: 'NEED_CONFIRMATION' | 'OK';
  reason: string;
  persisted?: boolean;
  contractPatch?: Record<string, unknown>;
  travelDecisionContract?: unknown;
  autoDraft?: boolean;
  /** Harness TaskContract / Decision Runtime 投影（D3） */
  harnessObservability?: {
    agent_task_contract?: Record<string, unknown>;
    decision_runtime_pipeline?: Record<string, unknown>;
    agent_turn_trace?: Record<string, unknown>;
    travel_world_state?: Record<string, unknown>;
    outcome_reconciliation?: Record<string, unknown>;
  };
}): RouteAndRunResponseDto {
  const { request, startTime, problem, answerText, status, reason } = params;
  const projected = projectDecisionProblemToTradeoffSource(problem);
  const draftOp =
    problem.state === 'COMMITTED'
      ? buildDraftSuggestedOperation(problem.tripId, problem)
      : null;
  const draftMsg = draftOp ? String((draftOp.payload as any)?.message ?? '') : '';
  const autoDraft = params.autoDraft === true && Boolean(draftMsg);
  const latencyMs = Date.now() - startTime;
  const harnessObs = params.harnessObservability;

  const response = {
    request_id: request.request_id,
    route: {
      route: 'SYSTEM1_API',
      confidence: 0.94,
      reasons: [reason],
      required_capabilities: ['decision_support'],
      consent_required: status === 'NEED_CONFIRMATION',
      budget: { max_seconds: 5, max_steps: 0, max_browser_steps: 0 },
      ui_hint: {
        mode: 'fast',
        status: status === 'NEED_CONFIRMATION' ? 'awaiting_confirmation' : 'done',
        message: problem.subject.title_zh,
      },
    },
    result: {
      status,
      answer_text: answerText,
      payload: {
        trip_id: problem.tripId,
        ui_surface: 'decision_support',
        conversation_route: 'DECISION_SUPPORT',
        travel_decision_problem: problem,
        negotiation_payload: projected.negotiation_payload,
        ...(problem.state === 'COMMITTED' && draftOp
          ? { suggested_operations: [draftOp] }
          : projected.suggested_operations?.length
            ? { suggested_operations: projected.suggested_operations }
            : {}),
        ...(autoDraft
          ? {
              pending_route_and_run_message: draftMsg,
              client_auto_follow: {
                enabled: true,
                message: draftMsg,
                reason: 'decision_auto_draft',
              },
            }
          : {}),
        decision_commit:
          problem.state === 'COMMITTED'
            ? {
                decision_id: problem.decisionId,
                option_id: problem.selection?.optionId,
                persistence_target: problem.persistenceTarget,
                applied_to_itinerary: false,
                persisted_to_trip_metadata: params.persisted === true,
                contract_patch: params.contractPatch ?? null,
                travel_decision_contract: params.travelDecisionContract ?? null,
                draft_bridge_available: Boolean(draftOp),
                auto_draft_requested: autoDraft,
              }
            : undefined,
      },
    },
    ui_state: {
      phase: status === 'NEED_CONFIRMATION' ? 'AWAITING_CONFIRMATION' : 'DONE',
      ui_status: status === 'NEED_CONFIRMATION' ? 'awaiting_confirmation' : 'done',
      active_skill: null,
      pending_question: null,
    },
    explain: {
      decision_log: [
        {
          request_id: request.request_id,
          step: 'INTAKE',
          actor: 'Orchestrator',
          inputs_summary: resolveRouteAndRunUserMessage(request).slice(0, 200),
          outputs_summary: `decision_support ${problem.decisionKey} state=${problem.state}`,
          evidence_refs: [],
          timestamp: new Date().toISOString(),
          metadata: {
            decision_id: problem.decisionId,
            decision_key: problem.decisionKey,
            persisted: params.persisted === true,
            auto_draft: autoDraft,
            applied_to_itinerary: false,
            ...(harnessObs?.agent_task_contract
              ? { agent_task_contract: harnessObs.agent_task_contract }
              : {}),
            ...(harnessObs?.decision_runtime_pipeline
              ? { decision_runtime_pipeline: harnessObs.decision_runtime_pipeline }
              : {}),
            ...(harnessObs?.agent_turn_trace
              ? { agent_turn_trace: harnessObs.agent_turn_trace }
              : {}),
            ...(harnessObs?.travel_world_state
              ? { travel_world_state: harnessObs.travel_world_state }
              : {}),
            ...(harnessObs?.outcome_reconciliation
              ? { outcome_reconciliation: harnessObs.outcome_reconciliation }
              : {}),
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
      orchestration_mode_final: 'DECISION_SUPPORT_FAST_PATH',
      ...(harnessObs?.agent_task_contract
        ? { agent_task_contract: harnessObs.agent_task_contract }
        : {}),
      ...(harnessObs?.decision_runtime_pipeline
        ? { decision_runtime_pipeline: harnessObs.decision_runtime_pipeline }
        : {}),
      ...(harnessObs?.agent_turn_trace
        ? { agent_turn_trace: harnessObs.agent_turn_trace }
        : {}),
      ...(harnessObs?.travel_world_state
        ? { travel_world_state: harnessObs.travel_world_state }
        : {}),
      ...(harnessObs?.outcome_reconciliation
        ? { outcome_reconciliation: harnessObs.outcome_reconciliation }
        : {}),
    },
  } as unknown as RouteAndRunResponseDto;

  const attached = attachConversationTurnToRouteAndRunResponse(response, {
    context: buildTripConversationContextSnapshot({
      trip_id: problem.tripId,
      today_ymd: new Date().toISOString().slice(0, 10),
      open_decision_count: problem.state === 'COMMITTED' ? 0 : 1,
      open_decisions_zh: problem.state === 'COMMITTED' ? [] : [problem.subject.title_zh],
      vehicle_type:
        typeof params.contractPatch?.vehicle_drive === 'string'
          ? String(params.contractPatch.vehicle_drive)
          : undefined,
    }),
  });

  if (draftOp && attached.result?.payload) {
    const turn = (attached.result.payload as any).conversation_turn_result;
    if (turn && Array.isArray(turn.actions)) {
      turn.actions.push({
        id: 'generate_decision_draft',
        kind: 'route_and_run_message',
        label_zh: autoDraft ? '正在生成调整草案…' : '生成调整草案',
        payload: draftOp.payload,
      });
    }
  }

  return attached;
}

async function finalizeCommit(
  agent: any | undefined,
  request: RouteAndRunRequestDto,
  startTime: number,
  problem: TravelDecisionProblem,
  harnessObservability?: {
    agent_task_contract?: Record<string, unknown>;
    decision_runtime_pipeline?: Record<string, unknown>;
    agent_turn_trace?: Record<string, unknown>;
    travel_world_state?: Record<string, unknown>;
    outcome_reconciliation?: Record<string, unknown>;
  },
): Promise<RouteAndRunResponseDto> {
  let persisted = false;
  let contractPatch: Record<string, unknown> | undefined;
  let travelDecisionContract: unknown;
  if (agent) {
    const r = await persistCommitmentToTrip(agent, problem);
    persisted = r.persisted;
    contractPatch = r.contractPatch;
    travelDecisionContract = r.travelDecisionContract;
  }
  if (!contractPatch || !travelDecisionContract) {
    const merged = mergeTravelDecisionCommitmentIntoMetadata({}, problem);
    contractPatch =
      contractPatch ??
      (merged.travelDecisionLatest as Record<string, unknown>);
    travelDecisionContract = travelDecisionContract ?? merged.travelDecisionContract;
  }
  const autoDraft =
    (request.options as any)?.decision_auto_draft === true ||
    (request.options as any)?.decision_select?.auto_draft === true;

  return buildDecisionResponse({
    request,
    startTime,
    problem,
    answerText: buildDecisionCommitAnswerText(problem),
    status: 'OK',
    reason: 'DECISION_SUPPORT_COMMIT',
    persisted,
    contractPatch,
    travelDecisionContract,
    autoDraft,
    harnessObservability,
  });
}

/**
 * @returns 命中则返回响应；否则 null。
 */
export async function tryBuildDecisionSupportFastPath(
  agent: any | undefined,
  request: RouteAndRunRequestDto,
  startTime: number,
): Promise<RouteAndRunResponseDto | null> {
  const tripId = request.trip_id?.trim();
  if (!tripId) return null;

  /** D3：编译 TaskContract；Query 等无 CREATE_DECISION 权限时不得新开 Decision Card */
  applyAgentTaskContractInPlace(request);
  const taskContract = readAgentTaskContract(request);
  const previousRuntime = (request.options as { harness_previous_runtime?: HarnessRuntimeId } | undefined)
    ?.harness_previous_runtime;
  const transition = previousRuntime
    ? assertRuntimeTransition({
        from: previousRuntime,
        to: 'DECISION_SUPPORT',
        explicitEscalation: (request.options as any)?.harness_explicit_escalation === true,
        newTaskId: (request.options as any)?.harness_new_task_id === true,
        strongConfirmation: (request.options as any)?.harness_strong_confirmation === true,
      })
    : { ok: true as const, rule: 'no_previous' };
  const turnTrace = taskContract
    ? projectAgentTurnTraceForObservability(
        buildAgentTurnTrace({
          contract: taskContract,
          runtimeSelected: 'DECISION_SUPPORT',
          runtimePrevious: previousRuntime,
          transitionOk: transition.ok,
          transitionReason: transition.ok ? transition.rule : (transition as any).reason,
          attemptedCapabilities: ['CREATE_DECISION'],
          resultStatus: 'NEED_CONFIRMATION',
          appliedToItinerary: false,
          unauthorizedWriteAttempt: false,
        }),
      )
    : undefined;
  const worldStateEcho = taskContract
    ? echoTravelWorldStateObservability(
        projectTravelWorldStateForTurn({
          tripId,
          contract: taskContract,
          seed: readTravelWorldStateSeedFromOptions(
            request.options as Record<string, unknown> | undefined,
          ),
        }),
      )
    : undefined;
  let outcomeEcho: Record<string, unknown> | undefined;
  const outcomeReq = readOutcomeReconciliationFromOptions(
    request.options as Record<string, unknown> | undefined,
  );
  if (outcomeReq && tripId) {
    outcomeEcho = appendOutcomeToTravelEventLedger({
      tripId,
      outcome: {
        ...outcomeReq,
        turnId: outcomeReq.turnId ?? taskContract?.turnId,
      },
    }).observability;
  }
  const harnessObsBase = taskContract
    ? {
        agent_task_contract: projectAgentTaskContractForTrace(taskContract),
        ...(turnTrace ? { agent_turn_trace: turnTrace } : {}),
        ...(worldStateEcho ? { travel_world_state: worldStateEcho } : {}),
        ...(outcomeEcho ? { outcome_reconciliation: outcomeEcho } : {}),
      }
    : undefined;
  const canCreateDecision = taskContract
    ? isCapabilityAllowed(taskContract, 'CREATE_DECISION')
    : true;

  const message = resolveRouteAndRunUserMessage(request);
  const selectFromOptions = (request.options as any)?.decision_select as
    | { decision_id?: string; option_id?: string; auto_draft?: boolean }
    | undefined;

  let tripMetadata: unknown = (request as any)?.trip_meta?.metadata ?? null;
  if (!tripMetadata) {
    tripMetadata = await loadTripMetadata(agent, tripId);
  }
  if (tripMetadata) {
    hydrateTravelDecisionStoreFromMetadata(tripId, tripMetadata);
  }

  if (selectFromOptions?.decision_id && selectFromOptions?.option_id) {
    let committed = commitTravelDecisionSelection({
      decisionId: selectFromOptions.decision_id,
      optionId: selectFromOptions.option_id,
      selectedBy: request.user_id,
    });
    if (!committed.ok && tripMetadata) {
      hydrateTravelDecisionStoreFromMetadata(tripId, tripMetadata);
      committed = commitTravelDecisionSelection({
        decisionId: selectFromOptions.decision_id,
        optionId: selectFromOptions.option_id,
        selectedBy: request.user_id,
      });
    }
    if (!committed.ok) return null;
    return finalizeCommit(agent, request, startTime, committed.problem, harnessObsBase);
  }

  const selectHint = detectDecisionSelectIntent(message);
  if (selectHint?.ambiguousMultiSelect) {
    const open = findOpenDecisionForTrip(tripId);
    if (open) {
      return buildDecisionResponse({
        request,
        startTime,
        problem: open,
        answerText:
          '检测到输入框里被填入了多个方案标识（例如 2WD、4WD）。请只点选卡片上的一个「选择」按钮，或回复 1 / 2 / 3，不要把多个选项粘进输入框。',
        status: 'NEED_CONFIRMATION',
        reason: 'DECISION_SUPPORT_AMBIGUOUS_MULTI_SELECT',
        harnessObservability: harnessObsBase,
      });
    }
  }
  if (selectHint && !selectHint.ambiguousMultiSelect) {
    const open =
      findOpenDecisionForTrip(tripId) ??
      (selectFromOptions?.decision_id
        ? getTravelDecisionProblem(selectFromOptions.decision_id)
        : undefined);
    if (open) {
      const optionId = matchOptionFromHint(open, selectHint);
      if (optionId) {
        const committed = commitTravelDecisionSelection({
          decisionId: open.decisionId,
          optionId,
          selectedBy: request.user_id,
        });
        if (committed.ok) {
          return finalizeCommit(agent, request, startTime, committed.problem, harnessObsBase);
        }
      }
    }
  }

  let candidate =
    detectDecisionSupportCandidate(message) ??
    detectProactiveDecisionCandidate({
      tripId,
      message,
      metadata: tripMetadata,
      vehicleHint: (request as any)?.trip_meta?.vehicle_type ?? null,
    });

  /** Harness 管线兜底：Registry 未命中但 TaskContract=DECISION_SUPPORT 时仍可开卡 */
  let harnessPipe =
    taskContract && taskContract.taskType === 'DECISION_SUPPORT'
      ? tryRunDecisionFromMessage({ contract: taskContract, message })
      : null;
  if (!candidate && harnessPipe) {
    const mappedKey = mapHarnessDecisionKeyToRegistry(
      harnessPipe.problem.decisionKey,
      harnessPipe.problem.kind,
    );
    if (mappedKey) {
      candidate = {
        decisionKey: mappedKey,
        confidence: 0.88,
        reason: 'explicit_choice',
      };
    }
  }

  if (!candidate) return null;

  /**
   * TaskContract 无 CREATE_DECISION 时禁止新开卡（防 Query 偷跑 Decision）。
   * 例外：system_trigger 为系统升格（两驱+高地等），允许开卡但不 Apply。
   */
  if (!canCreateDecision && candidate.reason !== 'system_trigger') {
    return null;
  }

  let problem = buildTravelDecisionProblem(candidate.decisionKey, {
    tripId,
    dayCount: resolveDayCount(request),
    winterLikely: resolveWinterLikely(message, request),
    vehicleHint: (request as any)?.trip_meta?.vehicle_type ?? null,
    message,
  });
  if (!problem) return null;

  if (!harnessPipe && taskContract && isCapabilityAllowed(taskContract, 'CREATE_DECISION')) {
    harnessPipe = tryRunDecisionFromMessage({ contract: taskContract, message });
  }
  /** system_trigger 升格：用临时 DECISION capabilities 跑 Gate/Recommend（不持久化 contract） */
  if (!harnessPipe && candidate.reason === 'system_trigger' && taskContract) {
    const escalated = {
      ...taskContract,
      taskType: 'DECISION_SUPPORT' as const,
      authority: 'DECISION_COMMIT' as const,
      capabilities: {
        allow: [
          'READ_TRIP',
          'SUMMARIZE',
          'ANSWER',
          'CREATE_DECISION',
          'GATE_EVAL',
          'SOLVER',
        ] as const,
        deny: ['PLAN', 'OPTIMIZE', 'REPAIR', 'APPLY', 'EXTERNAL_ACTION'] as const,
      },
    };
    harnessPipe = tryRunDecisionFromMessage({
      contract: escalated as any,
      message,
    });
  }
  if (harnessPipe) {
    problem = applyHarnessPipelineToTravelProblem(problem, harnessPipe);
  }

  putTravelDecisionProblem(problem);
  if (agent) {
    await persistOpenProblemToTrip(agent, problem);
  }

  const reason =
    candidate.reason === 'system_trigger'
      ? 'DECISION_SUPPORT_SYSTEM_TRIGGER'
      : harnessPipe
        ? 'DECISION_SUPPORT_FAST_PATH_HARNESS'
        : 'DECISION_SUPPORT_FAST_PATH';

  return buildDecisionResponse({
    request,
    startTime,
    problem,
    answerText: buildDecisionSupportAnswerText(problem),
    status: 'NEED_CONFIRMATION',
    reason,
    harnessObservability: {
      ...harnessObsBase,
      ...(harnessPipe
        ? { decision_runtime_pipeline: projectHarnessDecisionPipelineForTrace(harnessPipe) }
        : {}),
    },
  });
}

/** HTTP select：在内存问题上 Commit 并可选持久化 */
export async function selectTravelDecisionOption(params: {
  agent?: any;
  decisionId: string;
  optionId: string;
  selectedBy?: string;
  requestId?: string;
  tripId?: string;
}): Promise<
  | {
      ok: true;
      problem: TravelDecisionProblem;
      persisted: boolean;
      contractPatch: Record<string, unknown>;
      travelDecisionContract?: unknown;
      draftBridgeMessage: string | null;
    }
  | { ok: false; reason: string }
> {
  if (params.tripId && params.agent) {
    const meta = await loadTripMetadata(params.agent, params.tripId);
    if (meta) hydrateTravelDecisionStoreFromMetadata(params.tripId, meta);
  }

  let committed = commitTravelDecisionSelection({
    decisionId: params.decisionId,
    optionId: params.optionId,
    selectedBy: params.selectedBy,
  });
  if (!committed.ok && params.agent) {
    /** 尝试从任意 trip 水合：用 decision 上的 tripId 若内存无题 */
    const metaTripId = params.tripId;
    if (metaTripId) {
      const meta = await loadTripMetadata(params.agent, metaTripId);
      if (meta) {
        hydrateTravelDecisionStoreFromMetadata(metaTripId, meta);
        committed = commitTravelDecisionSelection({
          decisionId: params.decisionId,
          optionId: params.optionId,
          selectedBy: params.selectedBy,
        });
      }
    }
  }
  if (committed.ok === false) {
    return { ok: false, reason: committed.reason };
  }

  let persisted = false;
  const merged = mergeTravelDecisionCommitmentIntoMetadata({}, committed.problem);
  let contractPatch = merged.travelDecisionLatest as Record<string, unknown>;
  let travelDecisionContract = merged.travelDecisionContract;

  if (params.agent) {
    const r = await persistCommitmentToTrip(params.agent, committed.problem);
    persisted = r.persisted;
    if (r.contractPatch) contractPatch = r.contractPatch;
    if (r.travelDecisionContract) travelDecisionContract = r.travelDecisionContract;
  }

  return {
    ok: true,
    problem: committed.problem,
    persisted,
    contractPatch,
    travelDecisionContract,
    draftBridgeMessage: buildDraftBridgeMessage(committed.problem),
  };
}

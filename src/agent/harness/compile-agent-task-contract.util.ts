/**
 * Task Contract Compiler：Intake → AgentTaskContractV1。
 * 吸收 Planning Admission Gate；intent_mode / Day 锚仅为 hints。
 */

import { randomUUID } from 'crypto';
import type { RouteAndRunRequestDto } from '../dto/route-and-run.dto';
import { resolveRouteAndRunUserMessage } from '../utils/resolve-route-and-run-message.util';
import { stripUiInjectedDayScheduleContext } from '../utils/ui-day-schedule-context.util';
import {
  evaluatePlanningAdmission,
  type PlanningAdmissionDecision,
} from '../routing/planning-admission-gate.util';
import { detectItineraryAdjustIntent } from '../utils/itinerary-adjust-intent.util';
import {
  AGENT_TASK_CONTRACT_SCHEMA,
  type AgentLifecyclePhase,
  type AgentTaskContractV1,
  type AgentTaskType,
} from './agent-task-contract.types';
import { getRuntimeCapabilityProfile } from './runtime-capability.registry';
import { resolveFastQueryContextEntry } from './task-context.registry';
import { parseAffectedDaysFromMessage } from './adjustment-runtime.util';

export const REQUEST_TASK_CONTRACT_MARK = '__agent_task_contract' as const;

export type AgentTaskContractRequestMark = {
  [REQUEST_TASK_CONTRACT_MARK]?: AgentTaskContractV1;
};

function resolveLifecycle(raw?: string | null): AgentLifecyclePhase {
  const t = String(raw ?? '').toUpperCase();
  if (t === 'PLANNING' || t === 'TRAVELING' || t === 'COMPLETED') return t;
  return 'UNKNOWN';
}

function detectDecisionSupport(msg: string): boolean {
  return (
    /两驱还是四驱|四驱还是两驱|环岛还是|只跑南岸|南岸还是环岛|租什么车|买不买保险|要不要买|是否加入|少换酒店还是/.test(
      msg,
    ) || /\b(2wd|4wd|awd)\b.*\bor\b/i.test(msg)
  );
}

function detectLiveExecution(msg: string): boolean {
  return (
    /还能去|来得及|晚了|晚点|延误|现在还能|今天继续还是|返回酒店/.test(msg) ||
    /会不会赶不上|还能不能去/.test(msg)
  );
}

function detectTeamAction(msg: string): boolean {
  return /问一下大家|投票|谁愿意|征求意见|团队讨论/.test(msg);
}

function detectContentImport(msg: string): boolean {
  return /导入攻略|导进行程|从链接导入|guide.?to.?plan|识别图片行程/i.test(msg);
}

function detectTripQueryLodgingOrStatus(msg: string): boolean {
  return (
    /哪一天没住宿|哪天没住宿|哪一天没有住宿|哪天没有住宿|还缺住宿|明天住哪里|住哪|有没有订酒店|今天怎么安排|下一站|还有哪些没确认|准备度|全面分析|总体行程|行程怎么样/.test(
      msg,
    ) || /(?:住宿|过夜).{0,12}(?:缺口|缺失|没有|没安排)/.test(msg)
  );
}

/**
 * 在 Admission 结果之上选择 taskType（Intent ≠ Runtime 复杂度）。
 */
export function selectTaskType(input: {
  semanticMessage: string;
  tripId?: string | null;
  admission: PlanningAdmissionDecision;
}): AgentTaskType {
  const msg = input.semanticMessage;
  /** 时效性 / 二选一决策优先于 Admission 改排（避免「环岛还是南岸？轻松一点」误进 ADJUST） */
  if (detectLiveExecution(msg)) return 'LIVE_EXECUTION';
  if (detectDecisionSupport(msg)) return 'DECISION_SUPPORT';
  if (input.admission.admitted) {
    if (input.admission.kind === 'REPLAN' || detectItineraryAdjustIntent(msg)) {
      return 'ITINERARY_ADJUST';
    }
    if (input.admission.kind === 'PLAN_MUTATION') {
      return 'ITINERARY_ADJUST';
    }
    if (input.admission.kind === 'EXPLICIT_ESCALATION') {
      return 'ITINERARY_ADJUST';
    }
  }
  if (detectTeamAction(msg)) return 'TEAM_ACTION';
  if (detectContentImport(msg)) return 'CONTENT_IMPORT';
  if (input.tripId?.trim()) {
    if (detectTripQueryLodgingOrStatus(msg) || msg.length > 0) {
      return 'TRIP_QUERY';
    }
  }
  return 'GENERAL_RESEARCH';
}

export function compileAgentTaskContract(input: {
  message: string;
  turnId: string;
  tripId?: string | null;
  lifecycle?: string | null;
  intentModeHint?: string | null;
  entryPointHint?: string | null;
  explicitPlanningEscalation?: boolean;
  hasClarificationAnswers?: boolean;
  modeLockHint?: boolean;
  taskId?: string;
}): AgentTaskContractV1 {
  const raw = String(input.message ?? '');
  const semanticMessage = stripUiInjectedDayScheduleContext(raw).trim() || raw.trim();
  const hasDayAnchor = raw.includes('[日程]') && semanticMessage !== raw.trim();

  const admission = evaluatePlanningAdmission({
    message: raw,
    tripId: input.tripId,
    intentModeHint: input.intentModeHint,
    entryPointHint: input.entryPointHint,
    explicitPlanningEscalation: input.explicitPlanningEscalation,
    hasClarificationAnswers: input.hasClarificationAnswers,
    modeLockHint: input.modeLockHint,
  });

  const taskType = selectTaskType({
    semanticMessage: admission.semanticMessage || semanticMessage,
    tripId: input.tripId,
    admission,
  });
  const profile = getRuntimeCapabilityProfile(taskType);

  const ignoredHints =
    !admission.admitted && 'ignoredHints' in admission ? admission.ignoredHints : [];

  let contextPolicy = { required: [] as string[], optional: [] as string[], freshness: undefined as Record<string, string> | undefined };
  let contextRegistryKey: string | undefined;
  if (taskType === 'TRIP_QUERY' || taskType === 'GENERAL_RESEARCH') {
    const entry = resolveFastQueryContextEntry(admission.semanticMessage || semanticMessage);
    contextRegistryKey = entry.key;
    contextPolicy = {
      required: [...entry.required],
      optional: [...(entry.optional ?? [])],
      freshness: entry.freshness,
    };
  } else if (taskType === 'ITINERARY_ADJUST') {
    contextPolicy = {
      required: ['AFFECTED_DAYS', 'PLAN_SLICE'],
      optional: ['CONSTRAINTS', 'ACCOMMODATION_ANCHORS'],
      freshness: undefined,
    };
  } else if (taskType === 'DECISION_SUPPORT') {
    contextPolicy = {
      required: ['DECISION_SLICE', 'TRIP_CONSTRAINTS'],
      optional: ['ROUTE_EVIDENCE'],
      freshness: undefined,
    };
  } else if (taskType === 'LIVE_EXECUTION') {
    contextPolicy = {
      required: ['CURRENT_TIME', 'CURRENT_LOCATION', 'CURRENT_DAY_PLAN'],
      optional: ['WEATHER', 'ROAD_STATE', 'NEXT_DESTINATION'],
      freshness: { WEATHER: 'LIVE', ROAD_STATE: 'LIVE' },
    };
  }

  /** Query 永不允许 Full Planning；仅 mutation/replan/escalation 且 profile 含 PLAN 才放行 */
  const allowFullPlanning =
    admission.admitted &&
    (taskType === 'ITINERARY_ADJUST' || taskType === 'LIVE_EXECUTION') &&
    profile.allow.includes('PLAN');

  const contract: AgentTaskContractV1 = {
    schemaId: AGENT_TASK_CONTRACT_SCHEMA,
    version: 1,
    taskId: input.taskId?.trim() || `task_${randomUUID()}`,
    turnId: input.turnId,
    tripId: input.tripId?.trim() || undefined,
    lifecycle: resolveLifecycle(input.lifecycle),
    taskType,
    scope: {
      contextRegistryKey,
      days:
        taskType === 'ITINERARY_ADJUST'
          ? parseAffectedDaysFromMessage(admission.semanticMessage || semanticMessage)
          : undefined,
      entities:
        contextRegistryKey === 'TRIP_QUERY_LODGING'
          ? ['DAY', 'ACCOMMODATION']
          : undefined,
    },
    contextPolicy,
    capabilities: {
      allow: [...profile.allow],
      deny: [...profile.deny],
    },
    authority: profile.authority,
    verificationPolicy: profile.verificationPolicy,
    completionCondition: profile.completionCondition,
    allowFullPlanning,
    planningAdmissionReason: admission.admitted
      ? `admitted:${admission.kind}:${admission.reason}`
      : `denied:${admission.reason}`,
    semanticMessage: admission.semanticMessage || semanticMessage,
    hints: {
      intentMode: input.intentModeHint?.trim() || undefined,
      entryPoint: input.entryPointHint?.trim() || undefined,
      uiDayAnchor: hasDayAnchor || undefined,
      ignoredHints: ignoredHints.length ? ignoredHints : undefined,
    },
  };

  return Object.freeze(contract) as AgentTaskContractV1;
}

export function compileAgentTaskContractForRequest(
  request: Pick<
    RouteAndRunRequestDto,
    'request_id' | 'message' | 'trip_id' | 'options' | 'clarification_answers'
  > &
    AgentTaskContractRequestMark,
): AgentTaskContractV1 {
  const cached = request[REQUEST_TASK_CONTRACT_MARK];
  if (cached) return cached;

  const message = resolveRouteAndRunUserMessage(request as RouteAndRunRequestDto);
  const opts = request.options as
    | {
        intent_mode?: string;
        entry_point?: string;
        explicit_planning_escalation?: boolean;
        planning_operation_id?: string;
        lifecycle_phase?: string;
      }
    | undefined;

  const contract = compileAgentTaskContract({
    message,
    turnId: request.request_id,
    tripId: request.trip_id,
    lifecycle: opts?.lifecycle_phase,
    intentModeHint: opts?.intent_mode,
    entryPointHint: opts?.entry_point,
    explicitPlanningEscalation: opts?.explicit_planning_escalation === true,
    hasClarificationAnswers: Boolean(request.clarification_answers?.length),
    taskId: opts?.planning_operation_id,
  });

  (request as AgentTaskContractRequestMark)[REQUEST_TASK_CONTRACT_MARK] = contract;
  return contract;
}

/**
 * 编译 TaskContract + 未准入时降级 options（与 Admission Gate 对齐）。
 */
export function applyAgentTaskContractInPlace(
  request: RouteAndRunRequestDto & AgentTaskContractRequestMark,
): AgentTaskContractV1 {
  const contract = compileAgentTaskContractForRequest(request);
  if (!contract.allowFullPlanning) {
    request.options = {
      ...request.options,
      intent_mode: 'DATA_LOOKUP',
      use_state_machine_orchestration: false,
    };
  }
  return contract;
}

export function readAgentTaskContract(
  request: object | null | undefined,
): AgentTaskContractV1 | undefined {
  return (request as AgentTaskContractRequestMark | null | undefined)?.[
    REQUEST_TASK_CONTRACT_MARK
  ];
}

/** 供 Trace / observability 精简投影 */
export function projectAgentTaskContractForTrace(contract: AgentTaskContractV1): Record<string, unknown> {
  return {
    schemaId: contract.schemaId,
    taskId: contract.taskId,
    turnId: contract.turnId,
    tripId: contract.tripId,
    taskType: contract.taskType,
    authority: contract.authority,
    allowFullPlanning: contract.allowFullPlanning,
    planningAdmissionReason: contract.planningAdmissionReason,
    capabilities_allow: contract.capabilities.allow,
    capabilities_deny: contract.capabilities.deny,
    context_required: contract.contextPolicy.required,
    context_registry_key: contract.scope.contextRegistryKey,
    completionCondition: contract.completionCondition,
    semanticMessage: contract.semanticMessage,
    hints: contract.hints,
  };
}

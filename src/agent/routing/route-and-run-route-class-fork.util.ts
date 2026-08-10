/**
 * Production fork: orchestrator branches on `RouteAndRunRouteClass` (protocol SSOT).
 * Env: ROUTE_CLASS_FORK=1 (default on); set 0 to disable and fall back to legacy signals-only routing.
 */

import type { RouteAndRunRequestDto } from '../dto/route-and-run.dto';
import type { OrchestrationPolicyDecision } from './gateway-route-policy.util';
import type { OrchestrationMode } from '../utils/resolve-orchestration-mode.util';
import { applyBoundTripReviewRouteAndRunOverrideInPlace } from '../utils/orchestration-signals.util';
import { applyPlanningAdmissionGateInPlace } from './planning-admission-gate.util';
import { applyAgentTaskContractInPlace } from '../harness/compile-agent-task-contract.util';
import { expandHotelFollowupAffirmation } from '../chat/expand-hotel-followup-affirmation.util';
import { classifyRouteAndRunRouteClass } from './route-and-run-route-class.util';
import type {
  DeepResearchV71Trigger,
  OrchestrationDepth,
  RouteAndRunRouteClass,
  RouteAndRunRouteClassDecision,
} from './route-and-run-routing-protocol.types';

export interface RouteClassForkV1 {
  schemaId: 'tripnara.route_class_fork@v1';
  version: 1;
  enabled: true;
  routeClass: RouteAndRunRouteClass;
  matchedRule: string;
  orchestrationDepth: OrchestrationDepth;
  deepResearchV71: DeepResearchV71Trigger;
  asyncEligible: boolean;
  forkActions: string[];
}

export type RouteAndRunRequestWithRouteClassFork = RouteAndRunRequestDto & {
  __routeClassDecision?: RouteAndRunRouteClassDecision;
  __routeClassFork?: RouteClassForkV1;
};

export function isRouteClassForkEnabled(env: NodeJS.ProcessEnv = process.env): boolean {
  const raw = (env.ROUTE_CLASS_FORK ?? '1').trim().toLowerCase();
  return raw !== '0' && raw !== 'false' && raw !== 'off';
}

export function shouldApplyRouteClassFork(
  request: RouteAndRunRequestDto,
  env: NodeJS.ProcessEnv = process.env,
): boolean {
  if (!isRouteClassForkEnabled(env)) {
    return false;
  }
  if (request.options?.orchestration_replay_strict_seal === true) {
    return false;
  }
  const mode = request.options?.intent_mode;
  if (mode && mode !== 'AUTO') {
    return false;
  }
  return true;
}

function ensureClaudeEnabledForFork(request: RouteAndRunRequestDto, forkActions: string[]): void {
  if (request.options?.use_claude_orchestration === true) {
    return;
  }
  request.options = {
    ...request.options,
    use_claude_orchestration: true,
  };
  forkActions.push('use_claude_orchestration=true');
}

/**
 * Classify + mutate request.options so downstream signals / routePolicy / execMode follow protocol.
 */
export function applyRouteClassForkInPlace(
  request: RouteAndRunRequestDto,
  env: NodeJS.ProcessEnv = process.env,
): RouteClassForkV1 | null {
  if (!shouldApplyRouteClassFork(request, env)) {
    return null;
  }

  const decision = classifyRouteAndRunRouteClass(request);
  const forkActions: string[] = [];
  request.options = { ...(request.options ?? {}) };

  const augmented = request as RouteAndRunRequestWithRouteClassFork;
  augmented.__routeClassDecision = decision;

  switch (decision.routeClass) {
    case 'QUICK_ANSWER':
      request.options.intent_mode = 'DATA_LOOKUP';
      request.options.use_state_machine_orchestration = false;
      forkActions.push('intent_mode=DATA_LOOKUP', 'use_state_machine_orchestration=false');
      if (request.trip_id?.trim()) {
        request.conversation_context = {
          ...(request.conversation_context ?? {}),
          context_type: request.conversation_context?.context_type ?? 'active_trip_summary',
        };
        forkActions.push('conversation_context=active_trip_summary');
      }
      break;

    case 'SAFETY_CONSENT_OR_BLOCK':
      request.options.intent_mode = 'DATA_LOOKUP';
      request.options.use_state_machine_orchestration = false;
      forkActions.push('intent_mode=DATA_LOOKUP', 'use_state_machine_orchestration=false', 'safety_lane');
      break;

    case 'CRUD_EDIT':
      ensureClaudeEnabledForFork(request, forkActions);
      request.options.use_state_machine_orchestration = true;
      forkActions.push('use_state_machine_orchestration=true', 'crud_intake_sm');
      break;

    case 'SLOT_PLACEMENT_CLARIFY':
    case 'PARTIAL_REPLAN':
    case 'CONDITIONAL_BRANCH':
    case 'FULL_DEEP_PLAN':
      ensureClaudeEnabledForFork(request, forkActions);
      request.options.intent_mode = 'TRIP_PLANNING';
      request.options.use_state_machine_orchestration = true;
      forkActions.push('intent_mode=TRIP_PLANNING', 'use_state_machine_orchestration=true');
      if (decision.deepResearchV71 !== 'OFF') {
        (request.options as Record<string, unknown>).route_class_deep_research_v71 =
          decision.deepResearchV71;
        forkActions.push(`deep_research_v71=${decision.deepResearchV71}`);
      }
      break;

    default:
      break;
  }

  const fork: RouteClassForkV1 = {
    schemaId: 'tripnara.route_class_fork@v1',
    version: 1,
    enabled: true,
    routeClass: decision.routeClass,
    matchedRule: decision.matchedRule,
    orchestrationDepth: decision.orchestrationDepth,
    deepResearchV71: decision.deepResearchV71,
    asyncEligible: decision.asyncEligible,
    forkActions,
  };
  augmented.__routeClassFork = fork;
  return fork;
}

/**
 * Gateway / AgentService entry:
 * 1) Task Contract Compiler（吸收 Admission Gate）
 * 2) route class fork
 * 3) bound-trip review override
 *
 * intent_mode / Day 锚仅为 hint；Full Planning 由 TaskContract.allowFullPlanning 裁定。
 */
export function applyRouteAndRunEntryRoutingInPlace(
  request: RouteAndRunRequestDto,
  env: NodeJS.ProcessEnv = process.env,
): RouteClassForkV1 | null {
  const rawMessage = String(request.message ?? '');
  const recent = request.conversation_context?.recent_messages;
  const expanded = expandHotelFollowupAffirmation({
    message: rawMessage,
    recentMessages: Array.isArray(recent) ? recent.map((m) => String(m)) : undefined,
  });
  if (expanded !== rawMessage) {
    request.message = expanded;
  }
  /** TaskContract 编译（含 Admission）；未准入则降级 options */
  applyAgentTaskContractInPlace(request);
  applyPlanningAdmissionGateInPlace(request);
  const fork = applyRouteClassForkInPlace(request, env);
  applyBoundTripReviewRouteAndRunOverrideInPlace(request);
  return fork;
}

function clonePolicyDecision(
  decision: OrchestrationPolicyDecision,
  patch: Partial<OrchestrationPolicyDecision> & { matchedRules: string[] },
): OrchestrationPolicyDecision {
  const next: OrchestrationPolicyDecision = {
    ...decision,
    ...patch,
    signals: decision.signals,
    flags: decision.flags,
    recommendations: decision.recommendations ? { ...decision.recommendations } : undefined,
  };
  Object.freeze(next);
  if (next.recommendations) {
    Object.freeze(next.recommendations);
  }
  Object.freeze(next.signals);
  Object.freeze(next.flags);
  return next;
}

function claudePathAvailable(decision: OrchestrationPolicyDecision): boolean {
  return (
    decision.flags.env_USE_CLAUDE_ORCHESTRATION === true ||
    decision.flags.opt_use_claude_orchestration === true
  );
}

function upgradeMode(
  decision: OrchestrationPolicyDecision,
  mode: OrchestrationMode,
  reasonSuffix: string,
  rule: string,
  fork: RouteClassForkV1,
): OrchestrationPolicyDecision {
  return clonePolicyDecision(decision, {
    mode,
    reason: `${decision.reason} → ${mode} (${reasonSuffix})`,
    matchedRules: [...decision.matchedRules, `route_class_fork:${fork.routeClass}`, rule],
  });
}

/**
 * Align routePolicy mode with protocol depth after signals-based policy resolution.
 */
export function applyRouteClassForkPolicyOverrides(
  decision: OrchestrationPolicyDecision,
  fork: RouteClassForkV1 | null | undefined,
): OrchestrationPolicyDecision {
  if (!fork?.enabled) {
    return decision;
  }

  const depth = fork.orchestrationDepth;

  if (fork.routeClass === 'CRUD_EDIT') {
    if (decision.mode !== 'CLAUDE_SM' && claudePathAvailable(decision)) {
      return upgradeMode(
        decision,
        'CLAUDE_SM',
        'route_class_fork CRUD_EDIT intake',
        'fork_crud_force_sm',
        fork,
      );
    }
    return clonePolicyDecision(decision, {
      matchedRules: [...decision.matchedRules, `route_class_fork:${fork.routeClass}`],
    });
  }

  if (depth === 'LIGHT_LOOKUP') {
    if (decision.mode === 'CLAUDE_SM') {
      return upgradeMode(
        decision,
        'CLAUDE_DYNAMIC',
        `route_class_fork ${fork.routeClass}`,
        'fork_light_downgrade_sm',
        fork,
      );
    }
    return clonePolicyDecision(decision, {
      matchedRules: [...decision.matchedRules, `route_class_fork:${fork.routeClass}`],
    });
  }

  if (depth === 'FULL_CHAIN' || depth === 'PLAN_VERIFY_PARTIAL') {
    if (decision.mode !== 'CLAUDE_SM' && claudePathAvailable(decision)) {
      return upgradeMode(
        decision,
        'CLAUDE_SM',
        `route_class_fork ${fork.routeClass}`,
        'fork_deep_force_sm',
        fork,
      );
    }
    return clonePolicyDecision(decision, {
      matchedRules: [...decision.matchedRules, `route_class_fork:${fork.routeClass}`],
    });
  }

  return clonePolicyDecision(decision, {
    matchedRules: [...decision.matchedRules, `route_class_fork:${fork.routeClass}`],
  });
}

export function readRouteClassForkFromRequest(
  request: RouteAndRunRequestDto,
): RouteClassForkV1 | null {
  return (request as RouteAndRunRequestWithRouteClassFork).__routeClassFork ?? null;
}

export function readRouteClassDecisionFromRequest(
  request: RouteAndRunRequestDto,
): RouteAndRunRouteClassDecision | null {
  return (request as RouteAndRunRequestWithRouteClassFork).__routeClassDecision ?? null;
}

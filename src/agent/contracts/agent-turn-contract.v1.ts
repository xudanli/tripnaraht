/**
 * Agent turn contract v1 — Harness-style snapshot assembled at ExecutionGateway
 * after memory freeze and trip_id alias merge (see `buildAgentTurnContract` call site).
 */
import type { RouteAndRunRequestDto } from '../dto/route-and-run.dto';
import type { AgentMemoryContext } from '../memory/interfaces/agent-memory-context.interface';
import type { IntentMode } from '../constants/intent-mode.constants';
import type { HydratedGovernanceRuntimeContext } from '../../governance/activation/governance-activation.types';
import { applyGovernancePressureToPreferenceWeights } from '../../governance/activation/runtime/apply-governance-pressure-to-preference-weights.util';
import { normalizeLiveTools } from '../utils/live-tools.util';

export type AgentTurnContractVersion = 'v1';

/** Where heavy agent loop / tool execution is allowed to run (RemoteBridge placeholder). */
export type AgentTurnExecutionAffinity = 'LOCAL' | 'REMOTE';

export interface AgentTurnInputSliceV1 {
  request_id: string;
  user_id: string;
  /** Canonical trip id for this turn (prefer post-merge `request.trip_id`). */
  trip_id: string | null;
  message: string;
  intent_mode?: IntentMode;
  locale?: string;
  timezone?: string;
}

/** Frozen memory handles for audit / replay; not a deep clone of ledger graphs. */
export interface AgentTurnContextSliceV1 {
  snapshot_id: string;
  snapshot_version: number;
  memory_request_id: string;
  memory_user_id: string | null;
  memory_trip_id: string | null;
  loaded_at: string;
  observability_layers: readonly string[];
}

/** Tool / permission surface for this turn (derived from request.options + flags). */
export interface AgentTurnScopeV1 {
  dry_run: boolean;
  allow_webbrowse: boolean;
  enable_live_tools: readonly string[];
  live_facts: boolean;
  intent_recognition_skill: boolean;
  use_claude_orchestration: boolean;
  use_state_machine_orchestration: boolean;
  /** Reserved: SAP-readonly vs open-search style splits map here in later phases. */
  tool_policy_tags: readonly string[];
}

export interface AgentTurnBudgetV1 {
  max_seconds: number;
  max_steps: number;
  max_browser_steps: number;
  cost_budget_usd: number | null;
}

/** Environment / channel signals only — policy tables live in Gateway, not Controller. */
export interface AgentTurnProfileV1 {
  client_profile: string | null;
  execution_model_runtime_hint: string | null;
}

export interface AgentTurnPreferenceWeightsV1 {
  max_extra_cost_usd?: number;
  max_delay_minutes?: number;
  cost_sensitivity?: number;
  time_sensitivity?: number;
  effort_sensitivity?: number;
}

export interface AgentTurnContractV1 {
  version: AgentTurnContractVersion;
  input: AgentTurnInputSliceV1;
  context: AgentTurnContextSliceV1;
  scope: AgentTurnScopeV1;
  budget: AgentTurnBudgetV1;
  profile: AgentTurnProfileV1;
  preference_weights: AgentTurnPreferenceWeightsV1 | null;
  execution_affinity: AgentTurnExecutionAffinity;
  /** Governance Activation Layer hydration (nested; first-class subsystem input). */
  governanceRuntime?: HydratedGovernanceRuntimeContext;
}

/** Canonical trip id on the request (post-merge preferred: `trip_id` then `tripId`). */
export function canonicalTripIdForRouteAndRunRequest(request: RouteAndRunRequestDto): string | null {
  const a = request.trip_id;
  if (a !== undefined && a !== null && String(a).trim() !== '') return String(a).trim();
  const b = request.tripId;
  if (b !== undefined && b !== null && String(b).trim() !== '') return String(b).trim();
  return null;
}

function resolveExecutionAffinity(_request: RouteAndRunRequestDto): AgentTurnExecutionAffinity {
  // v1: fixed LOCAL; RemoteBridge / HPC will set REMOTE via options extension later.
  return 'LOCAL';
}

function deriveToolPolicyTags(request: RouteAndRunRequestDto): readonly string[] {
  const opt = request.options ?? {};
  const tags: string[] = [];
  if (opt.readonly_mode === true) {
    tags.push('READONLY_GATE');
  }
  const profile = (request.meta?.client_profile ?? '').toLowerCase();
  if (profile.includes('sap')) {
    tags.push('SAP_CHAIN_READ_ONLY');
  }
  if (profile.includes('ccl') || profile.includes('cost_ledger')) {
    tags.push('CCL_COST_LEDGER');
  }
  return Object.freeze([...tags]) as readonly string[];
}

/**
 * Pure factory: maps RouteAndRunRequestDto + frozen AgentMemoryContext into a single read model.
 * Call only after `mergeTripIdAliasesIntoRouteAndRunRequest` and `freezeAgentMemorySnapshot`.
 */
export function buildAgentTurnContract(args: {
  request: RouteAndRunRequestDto;
  memory: AgentMemoryContext;
  governanceRuntime?: HydratedGovernanceRuntimeContext | null;
}): AgentTurnContractV1 {
  const { request, memory } = args;
  const opt = request.options ?? {};
  const liveTools = normalizeLiveTools(opt.enable_live_tools);
  const intentFlags = opt.intent_flags;

  const preference = request.preference_profile;
  const pressure = args.governanceRuntime?.pressure;
  const hasPressureSignal =
    pressure != null &&
    (pressure.worldPressure > 0.001 ||
      pressure.policyPressure > 0.001 ||
      pressure.executionPressure > 0.001 ||
      pressure.recoveryPressure > 0.001);
  const neutral = { cost_sensitivity: 0.5, time_sensitivity: 0.5, effort_sensitivity: 0.5 };
  const rawWeights =
    preference != null
      ? {
          max_extra_cost_usd: preference.max_extra_cost_usd,
          max_delay_minutes: preference.max_delay_minutes,
          cost_sensitivity: preference.cost_sensitivity,
          time_sensitivity: preference.time_sensitivity,
          effort_sensitivity: preference.effort_sensitivity,
        }
      : hasPressureSignal
        ? neutral
        : null;
  const zeroPressure = {
    worldPressure: 0,
    weather: 0,
    policyPressure: 0,
    executionPressure: 0,
    recoveryPressure: 0,
  };
  const preference_weights =
    rawWeights != null
      ? applyGovernancePressureToPreferenceWeights(rawWeights, pressure ?? zeroPressure)
      : null;

  return {
    version: 'v1',
    input: {
      request_id: request.request_id,
      user_id: request.user_id,
      trip_id: canonicalTripIdForRouteAndRunRequest(request),
      message: request.message,
      intent_mode: opt.intent_mode,
      locale: request.conversation_context?.locale,
      timezone: request.conversation_context?.timezone,
    },
    context: {
      snapshot_id: memory.snapshotId,
      snapshot_version: memory.snapshotVersion,
      memory_request_id: memory.requestId,
      memory_user_id: memory.userId,
      memory_trip_id: memory.tripId,
      loaded_at: memory.loadedAt,
      observability_layers: Object.freeze([...memory.observability.layers]) as readonly string[],
    },
    scope: {
      dry_run: opt.dry_run === true,
      allow_webbrowse: opt.allow_webbrowse === true,
      enable_live_tools: Object.freeze([...liveTools]) as readonly string[],
      live_facts: intentFlags?.live_facts === true,
      intent_recognition_skill: opt.enable_intent_recognition_skill !== false,
      use_claude_orchestration: opt.use_claude_orchestration === true,
      use_state_machine_orchestration: opt.use_state_machine_orchestration !== false,
      tool_policy_tags: deriveToolPolicyTags(request),
    },
    budget: {
      max_seconds: Number(opt.max_seconds ?? 30),
      max_steps: Number(opt.max_steps ?? 8),
      max_browser_steps: Number(opt.max_browser_steps ?? 12),
      cost_budget_usd: opt.cost_budget_usd !== undefined ? Number(opt.cost_budget_usd) : null,
    },
    profile: {
      client_profile: request.meta?.client_profile?.trim() || null,
      execution_model_runtime_hint: opt.execution_model_runtime_hint?.trim() || null,
    },
    preference_weights,
    execution_affinity: resolveExecutionAffinity(request),
    ...(args.governanceRuntime
      ? {
          governanceRuntime: args.governanceRuntime,
        }
      : {}),
  };
}

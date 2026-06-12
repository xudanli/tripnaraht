/**
 * P0 EmotionNarratorOrchestrator — 纯函数 Signal Weaver（无 IO，可单测 / DPO 回放）。
 */

import type { DecisionState } from '../../decision/kernel/decision-state.types';
import type { NarrateExecutorContext } from '../../decision/kernel/interfaces/phase-executor.interface';
import type { OrchestratorState } from '../interfaces/trip-plan.interface';
import type { AgentMemoryContext } from '../memory/interfaces/agent-memory-context.interface';
import {
  projectSharedExperienceGraph,
  sharedMilestonesFromExperienceGraph,
} from '../memory/shared-experience/shared-experience-graph.util';
import {
  agentMemoryNarrateSnapshotToContext,
  type AgentMemoryNarrateSnapshot,
} from '../memory/utils/agent-memory-snapshot.util';
import { FRUSTRATION_CIRCUIT_BREAKER_THRESHOLD } from '../memory/emotional-resonance/emotional-resonance.constants';
import {
  EXPERIENCE_FLOW_RESEARCH_KEY,
  type ExperienceFlowModel,
} from '../../trips/decision/models/experience-flow.model';
import type {
  EmotionNarratorBuildInputs,
  EmotionalContext,
  EmotionalRealtimeSignals,
  EmotionalVoiceToneModifier,
  ProactivityGate,
  SharedMilestoneAnchor,
} from './types/emotional-context.type';

const CLAMP01 = (x: number) => Math.max(0, Math.min(1, x));

const URGENT_KEYWORD_RE =
  /(怎么回事|丢了|坏了|走不动|风太大|封路|救命|来不及|慌|迷路|钱包|护照)/i;

const WIND_LOCK_REASON_RE = /WIND|STORM|WEATHER.*LOCK|F_ROAD|F-ROAD|ICE_CAVE/i;

export function detectUrgentKeywords(message?: string): boolean {
  if (!message?.trim()) return false;
  return URGENT_KEYWORD_RE.test(message);
}

export function checkIsGoldenHour(localTime?: string): boolean {
  if (!localTime?.trim()) return false;
  const hour = parseInt(localTime.split(':')[0] ?? '', 10);
  return Number.isFinite(hour) && hour >= 17 && hour <= 19;
}

export function deriveBaseFatigueFromExperienceFlow(flow: ExperienceFlowModel | null | undefined): number {
  if (!flow) return 0.2;
  const fromFriction = CLAMP01(1 - flow.currentFrictionCapacity);
  const tempoBoost = flow.tempo === 'EMPATHY_RECOVERY' ? 0.15 : 0;
  return CLAMP01(fromFriction + tempoBoost);
}

export function deriveFatigueIndex(
  baseFatigue: number,
  continuousDrivingSeconds?: number,
): number {
  const drivingHours = (continuousDrivingSeconds ?? 0) / 3600;
  const drivingBoost = drivingHours > 3 ? 0.3 : drivingHours > 2 ? 0.15 : 0;
  return CLAMP01(baseFatigue + drivingBoost);
}

export function deriveAnxietyLevel(params: {
  frustrationScore?: number;
  isEmergencyMode?: boolean;
  hasUrgentKeywords?: boolean;
}): number {
  const base = params.frustrationScore ?? 0;
  const emergencyBoost = params.isEmergencyMode ? 0.4 : 0;
  const keywordBoost = params.hasUrgentKeywords ? 0.2 : 0;
  return CLAMP01(base + emergencyBoost + keywordBoost);
}

export function isEmergencyEmotionalMode(
  realtime: EmotionalRealtimeSignals | null | undefined,
  decisionMetaMode?: string,
): boolean {
  if (decisionMetaMode === 'EMERGENCY' || realtime?.decisionMetaMode === 'EMERGENCY') {
    return true;
  }
  const delay = realtime?.delayMinutes;
  const speed = realtime?.speedMs;
  return (
    typeof delay === 'number' &&
    Number.isFinite(delay) &&
    delay >= 60 &&
    (speed === undefined || speed === 0)
  );
}

export function resolveProactivityGate(params: {
  toneModifier: EmotionalVoiceToneModifier;
  fatigueIndex: number;
  anxietyTriggered: boolean;
  isEmergencyMode: boolean;
  experienceFlow?: ExperienceFlowModel | null;
  stationaryMinutes?: number;
}): ProactivityGate {
  if (params.isEmergencyMode || params.anxietyTriggered) return 'ACTIVE';
  if (
    params.toneModifier === 'silent_observant' ||
    (params.experienceFlow?.tempo === 'EMPATHY_RECOVERY' &&
      (params.stationaryMinutes ?? 0) >= 20)
  ) {
    return 'SILENT';
  }
  if (params.fatigueIndex >= 0.65 || params.toneModifier === 'empathetic_reassurance') {
    return 'GENTLE';
  }
  return 'GENTLE';
}

export function routeEmotionalVoiceStance(params: {
  isEmergencyMode: boolean;
  anxietyTriggered: boolean;
  fatigueIndex: number;
  experienceFlow?: ExperienceFlowModel | null;
  stationaryMinutes?: number;
  hasMajorItineraryConflict?: boolean;
  hasSparseIntentionalSlack?: boolean;
}): EmotionalContext['recommendedVoiceStance'] {
  if (params.isEmergencyMode) {
    return {
      toneModifier: 'professional_authoritative',
      audioProsodyPreference: { pitch: 'low', speedFactor: 0.9 },
    };
  }
  if (params.hasMajorItineraryConflict || params.hasSparseIntentionalSlack) {
    return {
      toneModifier: 'empathetic_reassurance',
      audioProsodyPreference: { pitch: 'low', speedFactor: 0.85 },
    };
  }
  if (params.anxietyTriggered) {
    return {
      toneModifier: 'professional_authoritative',
      audioProsodyPreference: { pitch: 'low', speedFactor: 0.9 },
    };
  }
  if (params.fatigueIndex > 0.7) {
    return {
      toneModifier: 'empathetic_reassurance',
      audioProsodyPreference: { pitch: 'medium', speedFactor: 0.85 },
    };
  }
  if (
    params.experienceFlow?.tempo === 'EMPATHY_RECOVERY' ||
    (params.stationaryMinutes ?? 0) >= 30
  ) {
    return {
      toneModifier: 'silent_observant',
      audioProsodyPreference: { pitch: 'low', speedFactor: 0.88 },
    };
  }
  if (params.experienceFlow?.tempo === 'ACCELERATED') {
    return {
      toneModifier: 'relaxed_buddy',
      audioProsodyPreference: { pitch: 'medium', speedFactor: 1.0 },
    };
  }
  return {
    toneModifier: 'relaxed_buddy',
    audioProsodyPreference: { pitch: 'medium', speedFactor: 1.0 },
  };
}

export function projectSharedMilestones(
  agentMemory: AgentMemoryContext | AgentMemoryNarrateSnapshot | null | undefined,
  currentTripId: string,
): SharedMilestoneAnchor[] {
  const mem = normalizeAgentMemoryForProjection(agentMemory);
  return sharedMilestonesFromExperienceGraph(projectSharedExperienceGraph(mem, currentTripId));
}

function normalizeAgentMemoryForProjection(
  raw: AgentMemoryContext | AgentMemoryNarrateSnapshot | null | undefined,
): AgentMemoryContext | null {
  if (!raw) return null;
  if ('snapshotId' in raw && !('loadedAt' in raw)) {
    return agentMemoryNarrateSnapshotToContext(raw as AgentMemoryNarrateSnapshot) as AgentMemoryContext;
  }
  return raw as AgentMemoryContext;
}

export function buildEmotionalContext(inputs: EmotionNarratorBuildInputs): EmotionalContext {
  const baseFatigue = deriveBaseFatigueFromExperienceFlow(inputs.experienceFlow);
  const fatigueIndex = deriveFatigueIndex(
    baseFatigue,
    inputs.realtimeState?.continuousDrivingSeconds,
  );

  const hasUrgentKeywords = detectUrgentKeywords(inputs.lastUserMessage);
  const isEmergencyMode = isEmergencyEmotionalMode(
    inputs.realtimeState,
    inputs.decisionMetaMode ?? inputs.realtimeState?.decisionMetaMode,
  );

  const anxietyLevel = deriveAnxietyLevel({
    frustrationScore: inputs.userEmotionalAccount?.frustration_score,
    isEmergencyMode,
    hasUrgentKeywords,
  });
  const anxietyTriggered = anxietyLevel >= FRUSTRATION_CIRCUIT_BREAKER_THRESHOLD;

  const weatherWindLockActive =
    inputs.weatherWindLockActive === true ||
    inputs.realtimeState?.weatherWindLockActive === true;

  const recommendedVoiceStance = routeEmotionalVoiceStance({
    isEmergencyMode,
    anxietyTriggered,
    fatigueIndex,
    experienceFlow: inputs.experienceFlow,
    stationaryMinutes: inputs.realtimeState?.stationaryMinutes,
    hasMajorItineraryConflict: inputs.hasMajorItineraryConflict === true,
    hasSparseIntentionalSlack: inputs.hasSparseIntentionalSlack === true,
  });

  const proactivityGate = resolveProactivityGate({
    toneModifier: recommendedVoiceStance.toneModifier,
    fatigueIndex,
    anxietyTriggered,
    isEmergencyMode,
    experienceFlow: inputs.experienceFlow,
    stationaryMinutes: inputs.realtimeState?.stationaryMinutes,
  });

  return {
    schemaVersion: 'tripnara.emotional_context@v1',
    userId: inputs.userId,
    tripId: inputs.tripId,
    fatigueIndex,
    anxietyLevel,
    anxietyTriggered,
    ambienceSignals: {
      isGoldenHour: checkIsGoldenHour(inputs.realtimeState?.localTime),
      isRomancePacingActive: inputs.isRomancePacingActive === true,
      weatherWindLockActive,
    },
    sharedMilestones: projectSharedMilestones(inputs.agentMemory, inputs.tripId),
    recommendedVoiceStance,
    proactivityGate,
  };
}

export function resolveAgentMemoryFromOrchestratorState(
  state: OrchestratorState,
): AgentMemoryContext | AgentMemoryNarrateSnapshot | null {
  const md = state.metadata as Record<string, unknown> | undefined;
  const raw = md?.agent_memory_context ?? md?.memory_snapshot;
  if (!raw || typeof raw !== 'object' || Array.isArray(raw)) return null;
  return raw as AgentMemoryContext | AgentMemoryNarrateSnapshot;
}

export function resolveEmotionalRealtimeSignals(
  state: OrchestratorState,
  dso: DecisionState,
): EmotionalRealtimeSignals | null {
  const md = state.metadata as Record<string, unknown> | undefined;
  const fromMeta = md?.emotional_realtime_signals ?? md?.realtime_state;
  if (fromMeta && typeof fromMeta === 'object' && !Array.isArray(fromMeta)) {
    return fromMeta as EmotionalRealtimeSignals;
  }

  const env = dso.environmentState as Record<string, unknown> | undefined;
  const localTime =
    typeof env?.localTime === 'string'
      ? env.localTime
      : typeof env?.local_time === 'string'
        ? env.local_time
        : undefined;

  const windSpeedMs = Number(env?.windSpeedMs ?? (env?.weather as { wind_speed_mps?: number })?.wind_speed_mps);
  const weatherWindLockActive =
    Number.isFinite(windSpeedMs) && windSpeedMs >= 18
      ? true
      : detectWeatherWindLockFromDecisionLog(state);

  if (!localTime && !weatherWindLockActive) return weatherWindLockActive ? { weatherWindLockActive } : null;

  return {
    ...(localTime ? { localTime } : {}),
    weatherWindLockActive,
  };
}

export function detectWeatherWindLockFromDecisionLog(state: OrchestratorState): boolean {
  const logs = state.decision_log ?? [];
  return logs.some((entry) => {
    const code = String((entry as { reason_code?: string; reasonCode?: string }).reason_code ?? (entry as { reasonCode?: string }).reasonCode ?? '');
    return WIND_LOCK_REASON_RE.test(code);
  });
}

export function resolveLastUserMessage(state: OrchestratorState): string | undefined {
  const md = state.metadata as Record<string, unknown> | undefined;
  const fromMeta = md?.last_user_message ?? md?.user_query;
  if (typeof fromMeta === 'string' && fromMeta.trim()) return fromMeta;

  const req = state.trip_plan_request as { user_query?: string; query?: string } | undefined;
  return req?.user_query ?? req?.query;
}

export function extractEmotionNarratorBuildInputs(params: {
  dso: DecisionState;
  ctx: NarrateExecutorContext;
  state: OrchestratorState;
}): EmotionNarratorBuildInputs {
  const { dso, ctx, state } = params;
  const userId = ctx.userId ?? 'anonymous';
  const md = state.metadata as Record<string, unknown> | undefined;
  const tripId =
    (typeof md?.dos_trip_id === 'string' && md.dos_trip_id) ||
    ctx.tripPlanRequest?.trip_id ||
    (state.trip_plan_request as { trip_id?: string } | undefined)?.trip_id ||
    state.request_id ||
    'unknown';

  const researchData = state.research_data as Record<string, unknown> | undefined;
  const experienceFlowRaw = researchData?.[EXPERIENCE_FLOW_RESEARCH_KEY];
  const experienceFlow =
    experienceFlowRaw && typeof experienceFlowRaw === 'object' && !Array.isArray(experienceFlowRaw)
      ? (experienceFlowRaw as ExperienceFlowModel)
      : null;

  const party = (state.trip_plan_request as { party?: { is_couple?: boolean; romance?: boolean } })?.party;
  const isRomancePacingActive =
    party?.is_couple === true ||
    party?.romance === true ||
    experienceFlow?.narrativeTone === 'balanced_warm';

  const travelDiagnostic = md?.travel_diagnostic as { hasMajorItineraryConflict?: boolean } | undefined;
  const decisionCtx = dso.constraints?.decisionContext;
  const hasSparseIntentionalSlack =
    (decisionCtx?.intentionalSlack?.length ?? 0) > 0 || Boolean(decisionCtx?.sparseProfileId);

  return {
    userId,
    tripId,
    agentMemory: resolveAgentMemoryFromOrchestratorState(state),
    experienceFlow,
    userEmotionalAccount: ctx.researchConflict?.user_emotional_account ?? undefined,
    realtimeState: resolveEmotionalRealtimeSignals(state, dso),
    lastUserMessage: resolveLastUserMessage(state),
    decisionMetaMode: dso.decisionMeta?.mode,
    weatherWindLockActive: detectWeatherWindLockFromDecisionLog(state),
    isRomancePacingActive,
    hasMajorItineraryConflict: travelDiagnostic?.hasMajorItineraryConflict === true,
    hasSparseIntentionalSlack,
  };
}

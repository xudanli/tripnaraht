import type { EmotionalContext } from '../narrator/types/emotional-context.type';

/** BFF / 客户端消费的情绪矩阵 slim 投影（schema tripnara.emotional_context.client@v1） */
export type EmotionalContextClientProjection = Readonly<{
  schemaVersion: 'tripnara.emotional_context.client@v1';
  fatigueIndex: number;
  anxietyLevel: number;
  anxietyTriggered: boolean;
  proactivityGate: EmotionalContext['proactivityGate'];
  voiceToneModifier: EmotionalContext['recommendedVoiceStance']['toneModifier'];
  audioProsody: EmotionalContext['recommendedVoiceStance']['audioProsodyPreference'];
  ambienceSignals: EmotionalContext['ambienceSignals'];
  sharedMilestones: EmotionalContext['sharedMilestones'];
}>;

export function projectEmotionalContextForClient(
  raw: EmotionalContext | null | undefined,
): EmotionalContextClientProjection | undefined {
  if (!raw || raw.schemaVersion !== 'tripnara.emotional_context@v1') return undefined;
  return {
    schemaVersion: 'tripnara.emotional_context.client@v1',
    fatigueIndex: raw.fatigueIndex,
    anxietyLevel: raw.anxietyLevel,
    anxietyTriggered: raw.anxietyTriggered,
    proactivityGate: raw.proactivityGate,
    voiceToneModifier: raw.recommendedVoiceStance.toneModifier,
    audioProsody: raw.recommendedVoiceStance.audioProsodyPreference,
    ambienceSignals: raw.ambienceSignals,
    sharedMilestones: raw.sharedMilestones,
  };
}

export function resolveEmotionalContextFromOrchestratorState(
  state: { emotional_context?: EmotionalContext; metadata?: Record<string, unknown> } | null | undefined,
): EmotionalContext | undefined {
  if (!state) return undefined;
  if (state.emotional_context?.schemaVersion === 'tripnara.emotional_context@v1') {
    return state.emotional_context;
  }
  const md = state.metadata?.emotional_context;
  if (md && typeof md === 'object' && !Array.isArray(md)) {
    const ctx = md as EmotionalContext;
    if (ctx.schemaVersion === 'tripnara.emotional_context@v1') return ctx;
  }
  return undefined;
}

export function attachEmotionalContextToProgressPayload<
  T extends { current_phase?: string; emotional_context?: EmotionalContextClientProjection },
>(
  payload: T,
  state: { emotional_context?: EmotionalContext; metadata?: Record<string, unknown> } | null | undefined,
): T {
  if (String(payload.current_phase ?? '').toUpperCase() !== 'NARRATE') return payload;
  const projected = projectEmotionalContextForClient(resolveEmotionalContextFromOrchestratorState(state));
  if (!projected) return payload;
  return { ...payload, emotional_context: projected };
}

import {
  attachEmotionalContextToProgressPayload,
  projectEmotionalContextForClient,
  resolveEmotionalContextFromOrchestratorState,
} from './emotional-context-client-projection.util';
import type { EmotionalContext } from './types/emotional-context.type';

const sample: EmotionalContext = {
  schemaVersion: 'tripnara.emotional_context@v1',
  userId: 'u1',
  tripId: 't1',
  fatigueIndex: 0.72,
  anxietyLevel: 0.86,
  anxietyTriggered: true,
  ambienceSignals: {
    isGoldenHour: false,
    isRomancePacingActive: false,
    weatherWindLockActive: true,
  },
  sharedMilestones: [
    {
      pastTripId: 'trip-old',
      locationName: '西峡湾',
      legacyPreferenceToken: 'EXPERIENCED_HIGH_ANXIETY_IN_WIND',
      emotionalPolarity: 'NEGATIVE_TRAUMA',
    },
  ],
  recommendedVoiceStance: {
    toneModifier: 'empathetic_reassurance',
    audioProsodyPreference: { pitch: 'medium', speedFactor: 0.85 },
  },
  proactivityGate: 'ACTIVE',
};

describe('emotional-context-client-projection.util', () => {
  it('projectEmotionalContextForClient 输出 client schema', () => {
    const out = projectEmotionalContextForClient(sample);
    expect(out?.schemaVersion).toBe('tripnara.emotional_context.client@v1');
    expect(out?.voiceToneModifier).toBe('empathetic_reassurance');
    expect(out?.proactivityGate).toBe('ACTIVE');
    expect(out?.sharedMilestones).toHaveLength(1);
  });

  it('resolveEmotionalContextFromOrchestratorState 优先 state.emotional_context', () => {
    const ctx = resolveEmotionalContextFromOrchestratorState({
      emotional_context: sample,
      metadata: {},
    });
    expect(ctx?.tripId).toBe('t1');
  });

  it('resolveEmotionalContextFromOrchestratorState 回退 metadata', () => {
    const ctx = resolveEmotionalContextFromOrchestratorState({
      metadata: { emotional_context: sample },
    });
    expect(ctx?.anxietyTriggered).toBe(true);
  });
});

describe('attachEmotionalContextToProgressPayload', () => {
  it('NARRATE 阶段附带 emotional_context', () => {
    const out = attachEmotionalContextToProgressPayload(
      { current_phase: 'NARRATE', task_id: 't' } as any,
      { emotional_context: sample },
    );
    expect(out.emotional_context?.schemaVersion).toBe('tripnara.emotional_context.client@v1');
    expect(out.emotional_context?.proactivityGate).toBe('ACTIVE');
  });

  it('非 NARRATE 阶段不附带', () => {
    const out = attachEmotionalContextToProgressPayload(
      { current_phase: 'RESEARCH' } as any,
      { emotional_context: sample },
    );
    expect(out.emotional_context).toBeUndefined();
  });
});

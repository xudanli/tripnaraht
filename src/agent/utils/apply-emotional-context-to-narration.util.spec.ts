import { applyEmotionalContextToNarration, mapEmotionalToneToNarrationVoice } from './apply-emotional-context-to-narration.util';
import type { EmotionalContext } from '../narrator/types/emotional-context.type';

const baseEmotional: EmotionalContext = {
  schemaVersion: 'tripnara.emotional_context@v1',
  userId: 'u1',
  tripId: 't1',
  fatigueIndex: 0.8,
  anxietyLevel: 0.9,
  anxietyTriggered: true,
  ambienceSignals: {
    isGoldenHour: false,
    isRomancePacingActive: false,
    weatherWindLockActive: true,
  },
  sharedMilestones: [],
  recommendedVoiceStance: {
    toneModifier: 'professional_authoritative',
    audioProsodyPreference: { pitch: 'low', speedFactor: 0.9 },
  },
  proactivityGate: 'ACTIVE',
};

describe('apply-emotional-context-to-narration.util', () => {
  it('mapEmotionalToneToNarrationVoice 映射已知语气', () => {
    expect(mapEmotionalToneToNarrationVoice('professional_authoritative')).toBe(
      'professional_authoritative',
    );
    expect(mapEmotionalToneToNarrationVoice('silent_observant')).toBeUndefined();
  });

  it('紧急 stance 覆盖 narration voice_tone_modifier', () => {
    const out = applyEmotionalContextToNarration(
      {
        user_friendly_summary: 'ok',
        day_by_day_narrative: [],
        highlights: [],
        tips: [],
        voice_tone_modifier: 'rational_frugal',
      },
      baseEmotional,
    );
    expect(out.voice_tone_modifier).toBe('professional_authoritative');
    expect(out.audio_prosody).toContain('情绪韵律');
  });
});

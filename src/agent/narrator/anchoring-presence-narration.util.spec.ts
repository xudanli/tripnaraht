import {
  buildAnchoringPresenceBlockZh,
  mergeAnchoringPresenceIntoNarration,
} from './anchoring-presence-narration.util';
import type { EmotionalContext } from './types/emotional-context.type';

const emergencyCtx: EmotionalContext = {
  schemaVersion: 'tripnara.emotional_context@v1',
  userId: 'u1',
  tripId: 't1',
  fatigueIndex: 0.3,
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

describe('anchoring-presence-narration.util', () => {
  it('非锚定模式不生成块', () => {
    expect(
      buildAnchoringPresenceBlockZh({
        ...emergencyCtx,
        anxietyTriggered: false,
        recommendedVoiceStance: {
          toneModifier: 'relaxed_buddy',
          audioProsodyPreference: { pitch: 'medium', speedFactor: 1 },
        },
      }),
    ).toBeUndefined();
  });

  it('三步式锚定块含关键句', () => {
    const block = buildAnchoringPresenceBlockZh(emergencyCtx, {
      weatherWindLockActive: true,
      offlineMapsSynced: true,
    });
    expect(block).toContain('别慌，有我在');
    expect(block).toContain('做三件事');
    expect(block).toContain('离线地图');
    expect(block).toContain('风暴/强风约束');
  });

  it('mergeAnchoringPresenceIntoNarration 注入 tips 与 summary 前缀', () => {
    const out = mergeAnchoringPresenceIntoNarration(
      { user_friendly_summary: '行程已调整。', day_by_day_narrative: [], highlights: [], tips: [] },
      emergencyCtx,
    );
    expect(out.user_friendly_summary).toMatch(/^别慌，有我在/);
    expect(out.tips?.[0]).toContain('【锚定·有我在】');
    expect(out.voice_tone_modifier).toBe('professional_authoritative');
  });
});

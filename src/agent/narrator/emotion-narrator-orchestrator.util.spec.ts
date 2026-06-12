import {
  buildEmotionalContext,
  checkIsGoldenHour,
  deriveAnxietyLevel,
  deriveFatigueIndex,
  detectUrgentKeywords,
  isEmergencyEmotionalMode,
  projectSharedMilestones,
  resolveProactivityGate,
  routeEmotionalVoiceStance,
} from './emotion-narrator-orchestrator.util';
import { FRUSTRATION_CIRCUIT_BREAKER_THRESHOLD } from '../memory/emotional-resonance/emotional-resonance.constants';
import { buildDecisionMemory } from '../memory/decision-memory/decision-memory.types';
import type { AgentMemoryContext } from '../memory/interfaces/agent-memory-context.interface';
import { EXPERIENCE_FLOW_SCHEMA_V1 } from '../../trips/decision/models/experience-flow.model';

describe('emotion-narrator-orchestrator.util', () => {
  it('detectUrgentKeywords 识别求助语义', () => {
    expect(detectUrgentKeywords('我迷路了怎么办')).toBe(true);
    expect(detectUrgentKeywords('今天天气不错')).toBe(false);
  });

  it('checkIsGoldenHour 识别黄昏窗口', () => {
    expect(checkIsGoldenHour('18:20')).toBe(true);
    expect(checkIsGoldenHour('14:00')).toBe(false);
  });

  it('deriveFatigueIndex 叠加连续驾驶时长', () => {
    expect(deriveFatigueIndex(0.3, 4 * 3600)).toBeGreaterThan(0.55);
    expect(deriveFatigueIndex(0.3, 3600)).toBeLessThan(0.5);
  });

  it('紧急模式路由 professional_authoritative stance', () => {
    const stance = routeEmotionalVoiceStance({
      isEmergencyMode: true,
      anxietyTriggered: true,
      fatigueIndex: 0.2,
    });
    expect(stance.toneModifier).toBe('professional_authoritative');
    expect(stance.audioProsodyPreference.pitch).toBe('low');
  });

  it('高疲劳路由 empathetic_reassurance', () => {
    const stance = routeEmotionalVoiceStance({
      isEmergencyMode: false,
      anxietyTriggered: false,
      fatigueIndex: 0.82,
    });
    expect(stance.toneModifier).toBe('empathetic_reassurance');
  });

  it('行程硬冲突路由 empathetic_reassurance（优先于 anxietyTriggered）', () => {
    const stance = routeEmotionalVoiceStance({
      isEmergencyMode: false,
      anxietyTriggered: true,
      fatigueIndex: 0.2,
      hasMajorItineraryConflict: true,
    });
    expect(stance.toneModifier).toBe('empathetic_reassurance');
    expect(stance.audioProsodyPreference.speedFactor).toBe(0.85);
  });

  it('anxietyTriggered 对齐 FRUSTRATION_CIRCUIT_BREAKER_THRESHOLD', () => {
    const level = deriveAnxietyLevel({
      frustrationScore: FRUSTRATION_CIRCUIT_BREAKER_THRESHOLD,
      isEmergencyMode: false,
      hasUrgentKeywords: false,
    });
    expect(level).toBeGreaterThanOrEqual(FRUSTRATION_CIRCUIT_BREAKER_THRESHOLD);
  });

  it('projectSharedMilestones 从 WDMA weather_reroute 投影', () => {
    const memory = {
      recentWorldDecisions: [
        buildDecisionMemory({
          decisionType: 'weather_reroute',
          inputs: { tripId: 'trip-is-1', locationName: '西峡湾', tags: ['WIND_LOCK'] },
          outputs: {},
          outcome: 'failed',
          rationale: ['WEATHER_WIND_LOCK triggered'],
          causedBy: ['storm'],
        }),
      ],
    } as unknown as AgentMemoryContext;

    const anchors = projectSharedMilestones(memory, 'trip-current');
    expect(anchors).toHaveLength(1);
    expect(anchors[0]?.legacyPreferenceToken).toBe('EXPERIENCED_HIGH_ANXIETY_IN_WIND');
    expect(anchors[0]?.emotionalPolarity).toBe('NEGATIVE_TRAUMA');
  });

  it('buildEmotionalContext 合成完整契约', () => {
    const ctx = buildEmotionalContext({
      userId: 'u1',
      tripId: 't1',
      experienceFlow: {
        schemaVersion: EXPERIENCE_FLOW_SCHEMA_V1,
        tempo: 'EMPATHY_RECOVERY',
        heterogeneityIndex: 0.3,
        surpriseBuffer: 0.05,
        currentFrictionCapacity: 0.15,
        narrativeTone: 'empathetic_reassurance',
      },
      userEmotionalAccount: {
        accumulated_goodwill: 0.4,
        current_tolerance_bonus: 0.2,
        frustration_score: 0.6,
      },
      realtimeState: { localTime: '18:10', continuousDrivingSeconds: 5 * 3600 },
      lastUserMessage: '风太大了有点慌',
    });

    expect(ctx.schemaVersion).toBe('tripnara.emotional_context@v1');
    expect(ctx.anxietyTriggered).toBe(true);
    expect(ctx.ambienceSignals.isGoldenHour).toBe(true);
    expect(ctx.fatigueIndex).toBeGreaterThan(0.7);
    expect(['GENTLE', 'ACTIVE']).toContain(ctx.proactivityGate);
  });

  it('resolveProactivityGate 静止 + EMPATHY_RECOVERY → SILENT', () => {
    expect(
      resolveProactivityGate({
        toneModifier: 'silent_observant',
        fatigueIndex: 0.4,
        anxietyTriggered: false,
        isEmergencyMode: false,
        experienceFlow: {
          schemaVersion: EXPERIENCE_FLOW_SCHEMA_V1,
          tempo: 'EMPATHY_RECOVERY',
          heterogeneityIndex: 0.3,
          surpriseBuffer: 0.05,
          currentFrictionCapacity: 0.2,
          narrativeTone: 'empathetic_reassurance',
        },
        stationaryMinutes: 35,
      }),
    ).toBe('SILENT');
  });

  it('isEmergencyEmotionalMode 识别 EMERGENCY meta', () => {
    expect(isEmergencyEmotionalMode({ decisionMetaMode: 'EMERGENCY' }, undefined)).toBe(true);
    expect(isEmergencyEmotionalMode({ delayMinutes: 90, speedMs: 0 }, undefined)).toBe(true);
  });
});

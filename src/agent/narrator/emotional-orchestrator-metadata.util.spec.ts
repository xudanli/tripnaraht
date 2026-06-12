import {
  mergeEmotionalClientSignalsFromRouteAndRunRequest,
  normalizeEmotionalRealtimeSignals,
  persistEmotionalContextToOrchestratorMetadata,
} from './emotional-orchestrator-metadata.util';
import type { RouteAndRunRequestDto } from '../dto/route-and-run.dto';
import type { OrchestratorState } from '../interfaces/trip-plan.interface';
import type { EmotionalContext } from './types/emotional-context.type';

const sampleContext: EmotionalContext = {
  schemaVersion: 'tripnara.emotional_context@v1',
  userId: 'u1',
  tripId: 't1',
  fatigueIndex: 0.4,
  anxietyLevel: 0.2,
  anxietyTriggered: false,
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
  proactivityGate: 'GENTLE',
};

describe('emotional-orchestrator-metadata.util', () => {
  it('normalizeEmotionalRealtimeSignals 支持 snake_case 别名', () => {
    expect(
      normalizeEmotionalRealtimeSignals({
        continuous_driving_seconds: 3600,
        local_time: '19:00',
        decision_meta_mode: 'EMERGENCY',
      }),
    ).toEqual({
      continuousDrivingSeconds: 3600,
      localTime: '19:00',
      decisionMetaMode: 'EMERGENCY',
    });
  });

  it('mergeEmotionalClientSignalsFromRouteAndRunRequest 写入 metadata', () => {
    const md = mergeEmotionalClientSignalsFromRouteAndRunRequest(
      { started_at: '2020-01-01T00:00:00.000Z', last_updated_at: '2020-01-01T00:00:00.000Z' },
      {
        request_id: 'r1',
        user_id: 'u1',
        message: 'hi',
        emotional_realtime_signals: { continuousDrivingSeconds: 7200, stationaryMinutes: 35 },
        offline_maps_synced: true,
      } as RouteAndRunRequestDto,
    ) as Record<string, unknown>;

    expect(md.emotional_realtime_signals).toEqual({
      continuousDrivingSeconds: 7200,
      stationaryMinutes: 35,
    });
    expect(md.offline_maps_synced).toBe(true);
    expect(md.started_at).toBe('2020-01-01T00:00:00.000Z');
  });

  it('mergeEmotionalClientSignalsFromRouteAndRunRequest 支持 camelCase 透传', () => {
    const md = mergeEmotionalClientSignalsFromRouteAndRunRequest(undefined, {
      request_id: 'r1',
      user_id: 'u1',
      message: 'hi',
      emotionalRealtimeSignals: { speedMs: 12.5 },
      offlineMapsSynced: false,
    } as RouteAndRunRequestDto & { emotionalRealtimeSignals: { speedMs: number }; offlineMapsSynced: boolean }) as Record<
      string,
      unknown
    >;

    expect(md.emotional_realtime_signals).toEqual({ speedMs: 12.5 });
    expect(md.offline_maps_synced).toBe(false);
  });

  it('persistEmotionalContextToOrchestratorMetadata 保留 started_at 并双写', () => {
    const state: OrchestratorState = {
      request_id: 'r1',
      plan_id: 'p1',
      plan_version: 1,
      current_step: 'NARRATE',
      evidence_registry: new Map(),
      decision_log: [],
      decision_steps: [],
      errors: [],
      metadata: {
        started_at: '2020-01-01T00:00:00.000Z',
        last_updated_at: '2020-01-01T00:00:00.000Z',
      },
    };

    persistEmotionalContextToOrchestratorMetadata(state, sampleContext);

    expect(state.emotional_context).toBe(sampleContext);
    expect((state.metadata as Record<string, unknown>).emotional_context).toBe(sampleContext);
    expect((state.metadata as Record<string, unknown>).started_at).toBe('2020-01-01T00:00:00.000Z');
    expect(typeof (state.metadata as Record<string, unknown>).last_updated_at).toBe('string');
  });
});

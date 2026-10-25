import {
  appendProactiveShadowObservationToMetadata,
  readProactiveShadowLog,
  shouldRecordProactiveShadow,
} from './build-proactive-shadow-observation.util';
import { summarizeProactiveShadowObservations } from './summarize-proactive-shadow.util';
import {
  PROACTIVE_TRIP_REPLAY_SCENARIOS,
} from './proactive-trip-replay.scenarios';
import { runProactiveTripReplay } from './proactive-trip-replay.util';
import { shouldSurfaceProactiveCard } from '../config/proactive-canary-config.util';
import { resolveProactiveCanaryConfig } from '../config/proactive-canary-config.util';

describe('Phase 4 P1 — Shadow Canary Stage 0', () => {
  it('records shadow by default when PD V1 on; never surfaces card', () => {
    expect(
      shouldRecordProactiveShadow({ PROACTIVE_DECISION_V1_ENABLED: '1' }),
    ).toBe(true);
    expect(
      shouldRecordProactiveShadow({
        PROACTIVE_DECISION_V1_ENABLED: '1',
        PROACTIVE_SHADOW_RECORD_ENABLED: '0',
      }),
    ).toBe(false);

    const cfg = resolveProactiveCanaryConfig({
      PROACTIVE_DECISION_V1_ENABLED: '1',
      PROACTIVE_CANARY_STAGE: 'SHADOW',
      PROACTIVE_CANARY_TRAFFIC_PERCENT: '100',
    });
    expect(
      shouldSurfaceProactiveCard({
        config: cfg,
        tripId: 'trip_any',
        gate: 'NOTIFY_CARD',
      }),
    ).toBe(false);
  });

  it('appends shadow log ring and summarizes would-notify rates', async () => {
    const observations = [];
    for (const scenario of PROACTIVE_TRIP_REPLAY_SCENARIOS) {
      const replay = await runProactiveTripReplay(scenario);
      expect(replay.expectationsMet).toBe(true);
      expect(replay.userVisible).toBe(false);
      expect(replay.shadow.userVisible).toBe(false);
      expect(replay.shadow.canaryStage).toBe('SHADOW');
      observations.push(replay.shadow);
    }

    let meta: Record<string, unknown> = {};
    for (const o of observations) {
      meta = appendProactiveShadowObservationToMetadata(meta, o);
    }
    const log = readProactiveShadowLog(meta);
    expect(log?.observations).toHaveLength(3);

    const summary = summarizeProactiveShadowObservations(log!.observations);
    expect(summary.totalRuns).toBe(3);
    expect(summary.wouldNotifyCount).toBeGreaterThan(0);
    expect(summary.meanQualityScore).toBeGreaterThan(0.5);
    expect(summary.byCase.CASE_CONTINUE_ACTIVITY?.runs).toBe(1);
    expect(summary.byCase.CASE_REROUTE?.runs).toBe(1);
    expect(summary.byCase.CASE_POSTPONE_ACTIVITY?.runs).toBe(1);
  });
});

describe('Phase 4 P1 — Real Trip Replay', () => {
  it('replays three Iceland self-drive golden trips with Decision Trace', async () => {
    const reynisfjara = PROACTIVE_TRIP_REPLAY_SCENARIOS.find(
      (s) => s.id === 'REPLAY_IS_REYNISFJARA_WIND',
    )!;
    const run = await runProactiveTripReplay(reynisfjara);

    expect(run.tripMode).toBe('SELF_DRIVE');
    expect(run.countryCode).toBe('IS');
    expect(run.decisionTrace.signal.windFromMps).toBe(14);
    expect(run.decisionTrace.signal.windToMps).toBe(25);
    expect(run.shadow.wouldNotify).toBe('WOULD_NOTIFY');
    expect(run.shadow.decisionTraceReplay?.signal).toBe('WIND_CHANGE');
    expect(run.shadow.quality.cardLayersOk).toBe(true);
    expect(run.shadow.quality.score).toBeGreaterThanOrEqual(0.8);
    expect(run.userVisible).toBe(false);
  });

  it('F208 replay forbids KEEP under Hard Gate', async () => {
    const scenario = PROACTIVE_TRIP_REPLAY_SCENARIOS.find(
      (s) => s.id === 'REPLAY_IS_F208_CLOSED',
    )!;
    const run = await runProactiveTripReplay(scenario);
    expect(run.expectationsMet).toBe(true);
    expect(run.synthesis.recommended.optionId).not.toBe('OPT_KEEP_ORIGINAL');
  });
});

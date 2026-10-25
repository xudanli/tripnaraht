import {
  evaluateProactiveCanaryAdvance,
  isTripInProactiveCanaryAudience,
  resolveProactiveCanaryConfig,
  shouldSurfaceProactiveCard,
  shouldSurfaceProactiveL1Passive,
  shouldSurfaceProactiveL2Interrupt,
} from './proactive-canary-config.util';

describe('PD-10 Proactive Canary Config', () => {
  it('defaults to SHADOW with threshold 0.08 and push closed', () => {
    const cfg = resolveProactiveCanaryConfig({});
    expect(cfg.stage).toBe('SHADOW');
    expect(cfg.interventionThreshold).toBe(0.08);
    expect(cfg.pushEnabled).toBe(false);
    expect(cfg.autoApplyEnabled).toBe(false);
    expect(cfg.audience.countryCode).toBe('IS');
  });

  it('L1 Passive surfaces banner path but not L2 interrupt', () => {
    const cfg = resolveProactiveCanaryConfig({
      PROACTIVE_DECISION_V1_ENABLED: '1',
      PROACTIVE_CANARY_STAGE: 'L1_PASSIVE',
      PROACTIVE_CANARY_TRAFFIC_PERCENT: '100',
    });
    expect(cfg.stage).toBe('L1_PASSIVE');
    expect(
      shouldSurfaceProactiveL1Passive({
        config: cfg,
        tripId: 'trip_any',
        gate: 'NOTIFY_CARD',
      }),
    ).toBe(true);
    expect(
      shouldSurfaceProactiveL2Interrupt({
        config: cfg,
        tripId: 'trip_any',
        gate: 'NOTIFY_CARD',
      }),
    ).toBe(false);
    expect(
      shouldSurfaceProactiveCard({
        config: cfg,
        tripId: 'trip_any',
        gate: 'NOTIFY_CARD',
      }),
    ).toBe(true);
  });

  it('never surfaces card in SHADOW even if NOTIFY_CARD', () => {
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

  it('forces SHADOW when PD V1 disabled', () => {
    const cfg = resolveProactiveCanaryConfig({
      PROACTIVE_CANARY_STAGE: 'L2_IN_APP_INTERRUPT',
    });
    expect(cfg.stage).toBe('SHADOW');
  });

  it('allowlist gates audience', () => {
    const cfg = resolveProactiveCanaryConfig({
      PROACTIVE_DECISION_V1_ENABLED: '1',
      PROACTIVE_CANARY_STAGE: 'L2_IN_APP_INTERRUPT',
      PROACTIVE_CANARY_TRIP_ALLOWLIST: 'trip_dogfood',
      PROACTIVE_CANARY_TRAFFIC_PERCENT: '0',
    });
    expect(
      isTripInProactiveCanaryAudience({ config: cfg, tripId: 'trip_dogfood' }),
    ).toBe(true);
    expect(
      isTripInProactiveCanaryAudience({ config: cfg, tripId: 'trip_other' }),
    ).toBe(false);
  });

  it('advance gate requires metric floors', () => {
    const cfg = resolveProactiveCanaryConfig({
      PROACTIVE_DECISION_V1_ENABLED: '1',
    });
    const blocked = evaluateProactiveCanaryAdvance({
      config: cfg,
      shown: 5,
      acceptRate: 0.1,
      deferRate: 0.8,
      usefulRate: 0.2,
    });
    expect(blocked.mayAdvance).toBe(false);
    expect(blocked.reasonsZh.length).toBeGreaterThan(0);

    const ok = evaluateProactiveCanaryAdvance({
      config: cfg,
      shown: 40,
      acceptRate: 0.4,
      deferRate: 0.3,
      usefulRate: 0.7,
    });
    expect(ok.mayAdvance).toBe(true);
  });

  it('downgrades forbidden PUSH stage to L2', () => {
    const cfg = resolveProactiveCanaryConfig({
      PROACTIVE_DECISION_V1_ENABLED: '1',
      PROACTIVE_CANARY_STAGE: 'PUSH',
    });
    expect(cfg.stage).toBe('L2_IN_APP_INTERRUPT');
    expect(cfg.pushEnabled).toBe(false);
  });
});

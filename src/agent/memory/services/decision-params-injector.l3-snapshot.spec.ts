import { DecisionParamsInjectorService } from './decision-params-injector.service';
import { createDefaultDecisionParams } from '../interfaces/decision-params.interface';
import type { AgentMemoryContext } from '../interfaces/agent-memory-context.interface';

describe('DecisionParamsInjectorService (L3 snapshot consistency)', () => {
  const frozenContext = {
    failurePatterns: ['fatigue_overload:1'],
    activeRouteHealthSnapshot: {
      routeDirectionId: 123,
      countryCode: 'IS',
      successRate: 0.5,
      healthScore: 0.2,
      totalRuns: 10,
      successRuns: 5,
      failureRuns: 5,
      commonFailureReasons: ['fatigue_overload'],
      commonRepairs: [],
      loadedAt: '2026-06-09T00:00:00.000Z',
    },
    routeHealthByKey: {
      '123_IS': {
        routeDirectionId: 123,
        countryCode: 'IS',
        successRate: 0.5,
        healthScore: 0.2,
        totalRuns: 10,
        successRuns: 5,
        failureRuns: 5,
        commonFailureReasons: ['fatigue_overload'],
        commonRepairs: [],
        loadedAt: '2026-06-09T00:00:00.000Z',
      },
    },
  } as Partial<AgentMemoryContext>;

  it('uses frozen snapshot for adjustRouteDirectionScore and ignores DB changes', async () => {
    const getRouteDirectionHealth = jest.fn().mockResolvedValue({
      routeDirectionId: 123,
      countryCode: 'IS',
      totalRuns: 100,
      successRuns: 99,
      failureRuns: 1,
      commonFailureReasons: [],
      commonRepairs: [],
      lastUpdated: new Date(),
    });

    const store = { get: jest.fn().mockReturnValue(frozenContext) };

    const injector = new DecisionParamsInjectorService(
      { getRouteDirectionHealth } as any,
      {} as any,
      {} as any,
      { diff: jest.fn() } as any,
      store as any,
    );

    const baseScore = 80;
    const first = await injector.adjustRouteDirectionScore(
      123,
      'IS',
      baseScore,
      createDefaultDecisionParams(),
    );

    getRouteDirectionHealth.mockResolvedValue({
      routeDirectionId: 123,
      countryCode: 'IS',
      totalRuns: 100,
      successRuns: 99,
      failureRuns: 1,
      commonFailureReasons: [],
      commonRepairs: [],
      lastUpdated: new Date(),
    });

    const second = await injector.adjustRouteDirectionScore(
      123,
      'IS',
      baseScore,
      createDefaultDecisionParams(),
    );

    expect(first).toBe(second);
    expect(getRouteDirectionHealth).not.toHaveBeenCalled();
    expect(first).toBeCloseTo(baseScore * (0.5 + 0.2 * 0.5));
  });

  it('falls back to DB when memory store is absent (legacy scripts)', async () => {
    const getRouteDirectionHealth = jest.fn().mockResolvedValue({
      routeDirectionId: 7,
      countryCode: 'NO',
      totalRuns: 2,
      successRuns: 2,
      failureRuns: 0,
      commonFailureReasons: [],
      commonRepairs: [],
      lastUpdated: new Date(),
    });

    const injector = new DecisionParamsInjectorService(
      { getRouteDirectionHealth } as any,
      {} as any,
      {} as any,
      { diff: jest.fn() } as any,
      undefined,
    );

    const out = await injector.adjustRouteDirectionScore(
      7,
      'NO',
      50,
      createDefaultDecisionParams(),
    );

    expect(getRouteDirectionHealth).toHaveBeenCalledWith(7, 'NO');
    expect(out).toBeGreaterThan(0);
  });

  it('skips DB when snapshot exists but route health key is missing', async () => {
    const getRouteDirectionHealth = jest.fn();
    const store = {
      get: jest.fn().mockReturnValue({
        routeHealthByKey: {},
        activeRouteHealthSnapshot: null,
        failurePatterns: [],
    recentTripFeedbacks: [],
      }),
    };

    const injector = new DecisionParamsInjectorService(
      { getRouteDirectionHealth } as any,
      {} as any,
      {} as any,
      { diff: jest.fn() } as any,
      store as any,
    );

    const out = await injector.adjustRouteDirectionScore(
      999,
      'IS',
      60,
      createDefaultDecisionParams(),
    );

    expect(getRouteDirectionHealth).not.toHaveBeenCalled();
    expect(out).toBe(60);
  });
});

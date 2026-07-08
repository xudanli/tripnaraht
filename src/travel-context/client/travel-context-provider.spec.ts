import { createTravelContextProvider, TravelContextViewCache } from './travel-context-provider';
import { viewCacheKey } from './travel-context-api-client';
import type { TravelContextViewEnvelope } from '../domain/travel-context.types';

describe('TravelContextViewCache', () => {
  it('stores and retrieves by contextId:view:revision', () => {
    const cache = new TravelContextViewCache();
    const envelope: TravelContextViewEnvelope = {
      contextId: 'ctx_1',
      snapshotId: 'snap_1',
      revision: 100,
      view: 'overview',
      data: { stage: 'PLANNING' },
    };
    cache.set(envelope);
    expect(cache.get('ctx_1', 'overview', 100)).toEqual(envelope);
    expect(cache.get('ctx_1', 'overview', 99)).toBeUndefined();
  });
});

describe('createTravelContextProvider', () => {
  const originalFetch = global.fetch;

  afterEach(() => {
    global.fetch = originalFetch;
  });

  it('refresh loads snapshot and updates revision', async () => {
    global.fetch = jest.fn().mockResolvedValue({
      ok: true,
      json: async () => ({
        success: true,
        data: {
          identity: { contextId: 'ctx_1', stage: 'EXPLORATION', ownerUserId: 'u1', createdAt: 'x' },
          meta: { revision: 42, snapshotId: 'snap_42', generatedAt: 'x', consistency: 'STRONG', bindings: {} },
          schemaId: 'tripnara.travel_context_snapshot@v1',
          intent: { destination: { status: 'UNKNOWN' } },
          participants: { count: 0, publicSummary: [], preferenceCoverage: { mobility: 'MISSING', privateWishes: 'MISSING' } },
          contract: { constraints: [] },
          plan: { effectivePlan: { dayCount: 0, itemCount: 0, hasEffectivePlan: false } },
          world: { facts: [], dataCompletenessScore: 0 },
          decisions: { open: [], counts: { total: 0, blocking: 0, actionable: 0 } },
          monitoring: { activeCount: 0, items: [], paused: false },
          history: { recent: [] },
        },
      }),
    }) as unknown as typeof fetch;

    const provider = createTravelContextProvider({
      contextId: 'ctx_1',
      token: 'test-token',
    });

    await provider.refresh();
    expect(provider.getState().revision).toBe(42);
    expect(provider.getState().contextId).toBe('ctx_1');
  });

  it('getView uses cache for same revision', async () => {
    const viewEnvelope: TravelContextViewEnvelope = {
      contextId: 'ctx_1',
      snapshotId: 'snap_1',
      revision: 10,
      view: 'plan',
      data: { effectivePlan: { hasEffectivePlan: true } },
      observability: { schemaVersion: 'travel-context-v1' },
    };

    global.fetch = jest
      .fn()
      .mockResolvedValueOnce({
        ok: true,
        json: async () => ({
          success: true,
          data: {
            identity: { contextId: 'ctx_1', stage: 'PLANNING', ownerUserId: 'u1', createdAt: 'x' },
            meta: { revision: 10, snapshotId: 'snap_1', generatedAt: 'x', consistency: 'STRONG', bindings: {} },
            schemaId: 'tripnara.travel_context_snapshot@v1',
            intent: { destination: { status: 'UNKNOWN' } },
            participants: { count: 0, publicSummary: [], preferenceCoverage: { mobility: 'MISSING', privateWishes: 'MISSING' } },
            contract: { constraints: [] },
            plan: { effectivePlan: { dayCount: 0, itemCount: 0, hasEffectivePlan: false } },
            world: { facts: [], dataCompletenessScore: 0 },
            decisions: { open: [], counts: { total: 0, blocking: 0, actionable: 0 } },
            monitoring: { activeCount: 0, items: [], paused: false },
            history: { recent: [] },
          },
        }),
      })
      .mockResolvedValueOnce({
        ok: true,
        json: async () => ({ success: true, data: viewEnvelope }),
      }) as unknown as typeof fetch;

    const provider = createTravelContextProvider({ contextId: 'ctx_1', token: 't' });
    await provider.refresh();
    await provider.getView('plan');
    await provider.getView('plan');

    expect(global.fetch).toHaveBeenCalledTimes(2);
    expect(viewCacheKey('ctx_1', 'plan', 10)).toBe('ctx_1:plan:10');
  });
});

import { DecisionKernelService } from './decision-kernel.service';
import { StateManagerService } from './state-manager.service';
import type { DecisionState } from './decision-state.types';

describe('DecisionKernelService commit window batching', () => {
  beforeEach(() => {
    jest.useFakeTimers();
  });

  afterEach(() => {
    jest.useRealTimers();
  });

  it('should batch two disjoint deltas into one persist/version bump', async () => {
    const stateManager = new StateManagerService(undefined as any, undefined as any);

    // in-memory persistence mock
    let stored: DecisionState = {
      requestId: 'trip-1',
      userIntent: {},
      tripState: {},
      environmentState: {},
      systemState: {
        requestId: 'trip-1',
        startedAt: new Date().toISOString(),
        lastUpdatedAt: new Date().toISOString(),
        version: 0,
      },
    } as any;

    const persistCalls: DecisionState[] = [];
    const persistence = {
      getDso: jest.fn(async () => stored),
      persistDso: jest.fn(async (_id: string, dso: DecisionState) => {
        persistCalls.push(dso);
        stored = dso;
      }),
    };

    const kernel = new DecisionKernelService(
      stateManager,
      { getReport: jest.fn(), getReportAsync: jest.fn() } as any,
      { getHints: jest.fn(), getHintsAsync: jest.fn() } as any,
      { buildContextPackage: jest.fn() } as any,
      { recordDecisionLog: jest.fn(), recordUserFeedback: jest.fn() } as any,
      undefined,
      undefined,
      undefined,
      undefined,
      undefined,
      undefined,
      undefined,
      persistence as any,
    );

    const p1 = kernel.pushDelta('trip-1', { environmentState: { countryCode: 'IS' } }, 'RESEARCH', 'RESEARCH');
    const p2 = kernel.pushDelta('trip-1', { tripState: { planVersion: 1 } }, 'PLAN_GEN', 'PLAN_GEN');

    // flush commit window (async timers)
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const advance = (jest as any).advanceTimersByTimeAsync
      ? // eslint-disable-next-line @typescript-eslint/no-explicit-any
        (jest as any).advanceTimersByTimeAsync.bind(jest)
      : async (ms: number) => {
          jest.advanceTimersByTime(ms);
          await Promise.resolve();
        };
    await advance(25);
    await Promise.all([p1, p2]);

    expect(persistence.persistDso).toHaveBeenCalledTimes(1);
    expect(persistCalls[0].systemState?.version).toBe(1);
    expect(persistCalls[0].environmentState.countryCode).toBe('IS');
    expect(persistCalls[0].tripState.planVersion).toBe(1);

    // audit payload should contain batch proof fields
    const history = persistCalls[0].history ?? [];
    const batch = history.find((h) => h.type === 'kernel_arbitration' && (h.summary ?? '').includes('commit_batch'));
    expect(batch).toBeTruthy();
    const payload = (batch as any).payload ?? {};
    expect(payload.merge_strategy).toBe('COMMIT_BATCH');
    expect(payload.tx_count).toBe(2);
    expect(payload.dso_version_before).toBe(0);
    expect(payload.dso_version_after).toBe(1);
    expect(Array.isArray(payload.touched_paths)).toBe(true);
    expect(payload.touched_paths).toEqual(expect.arrayContaining(['environmentState.countryCode', 'tripState.planVersion']));
  }, 20000);

  it('should abort on conflicting deltas and persist conflict audit without version bump', async () => {
    const stateManager = new StateManagerService(undefined as any, undefined as any);

    let stored: DecisionState = {
      requestId: 'trip-2',
      userIntent: {},
      tripState: {},
      environmentState: {},
      systemState: {
        requestId: 'trip-2',
        startedAt: new Date().toISOString(),
        lastUpdatedAt: new Date().toISOString(),
        version: 0,
      },
    } as any;

    const persistCalls: DecisionState[] = [];
    const persistence = {
      getDso: jest.fn(async () => stored),
      persistDso: jest.fn(async (_id: string, dso: DecisionState) => {
        persistCalls.push(dso);
        stored = dso;
      }),
    };

    const kernel = new DecisionKernelService(
      stateManager,
      { getReport: jest.fn(), getReportAsync: jest.fn() } as any,
      { getHints: jest.fn(), getHintsAsync: jest.fn() } as any,
      { buildContextPackage: jest.fn() } as any,
      { recordDecisionLog: jest.fn(), recordUserFeedback: jest.fn() } as any,
      undefined,
      undefined,
      undefined,
      undefined,
      undefined,
      undefined,
      undefined,
      persistence as any,
    );

    const p1 = kernel.pushDelta('trip-2', { environmentState: { countryCode: 'IS' } }, 'RESEARCH', 'RESEARCH');
    const p2 = kernel.pushDelta('trip-2', { environmentState: { countryCode: 'NO' } }, 'RESEARCH', 'RESEARCH');

    // flush commit window
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const advance = (jest as any).advanceTimersByTimeAsync
      ? // eslint-disable-next-line @typescript-eslint/no-explicit-any
        (jest as any).advanceTimersByTimeAsync.bind(jest)
      : async (ms: number) => {
          jest.advanceTimersByTime(ms);
          await Promise.resolve();
        };
    await advance(25);
    await Promise.all([p1, p2]);

    expect(persistence.persistDso).toHaveBeenCalledTimes(1);
    expect(persistCalls[0].systemState?.version).toBe(0);

    const history = persistCalls[0].history ?? [];
    const conflict = history.find((h) => h.type === 'kernel_arbitration' && (h.summary ?? '').includes('commit_batch_conflict'));
    expect(conflict).toBeTruthy();
    const payload = (conflict as any).payload ?? {};
    expect(payload.merge_strategy).toBe('COMMIT_BATCH');
    expect(payload.conflict_detected).toBe(true);
    expect(payload.conflict_resolution).toBe('ABORT');
    expect(payload.dso_version_before).toBe(0);
    expect(payload.dso_version_after).toBe(0);
    expect(payload.tx_count).toBe(2);
    expect(payload.touched_paths).toEqual(expect.arrayContaining(['environmentState.countryCode']));
  }, 20000);

  it('should write per-tx audit when version drifts and we fall back to optimistic single commits', async () => {
    const stateManager = new StateManagerService(undefined as any, undefined as any);

    let stored: DecisionState = {
      requestId: 'trip-3',
      userIntent: {},
      tripState: {},
      environmentState: {},
      systemState: {
        requestId: 'trip-3',
        startedAt: new Date().toISOString(),
        lastUpdatedAt: new Date().toISOString(),
        version: 0,
      },
    } as any;

    const persistCalls: DecisionState[] = [];
    const persistence = {
      getDso: jest.fn(async () => stored),
      persistDso: jest.fn(async (_id: string, dso: DecisionState) => {
        persistCalls.push(dso);
        stored = dso;
      }),
    };

    const kernel = new DecisionKernelService(
      stateManager,
      { getReport: jest.fn(), getReportAsync: jest.fn() } as any,
      { getHints: jest.fn(), getHintsAsync: jest.fn() } as any,
      { buildContextPackage: jest.fn() } as any,
      { recordDecisionLog: jest.fn(), recordUserFeedback: jest.fn() } as any,
      undefined,
      undefined,
      undefined,
      undefined,
      undefined,
      undefined,
      undefined,
      persistence as any,
    );

    const p1 = kernel.pushDelta('trip-3', { environmentState: { countryCode: 'IS' } }, 'RESEARCH', 'RESEARCH');
    const p2 = kernel.pushDelta('trip-3', { tripState: { planVersion: 1 } }, 'PLAN_GEN', 'PLAN_GEN');

    // simulate external commit advancing version before flush
    stored = { ...stored, systemState: { ...stored.systemState, version: 1 } as any };

    // flush commit window
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const advance = (jest as any).advanceTimersByTimeAsync
      ? // eslint-disable-next-line @typescript-eslint/no-explicit-any
        (jest as any).advanceTimersByTimeAsync.bind(jest)
      : async (ms: number) => {
          jest.advanceTimersByTime(ms);
          await Promise.resolve();
        };
    await advance(25);
    await Promise.all([p1, p2]);

    // fallback path persists per tx
    expect(persistence.persistDso).toHaveBeenCalledTimes(2);

    // each persist should contain a commit_single arbitration entry
    const h0 = persistCalls[0].history ?? [];
    const a0 = h0.find((h) => h.type === 'kernel_arbitration' && (h.summary ?? '').includes('commit_single'));
    expect(a0).toBeTruthy();
    expect((a0 as any).payload.merge_strategy).toBe('OPTIMISTIC_LOCK');

    const h1 = persistCalls[1].history ?? [];
    const a1 = h1.find((h) => h.type === 'kernel_arbitration' && (h.summary ?? '').includes('commit_single'));
    expect(a1).toBeTruthy();
    expect((a1 as any).payload.merge_strategy).toBe('OPTIMISTIC_LOCK');

    // final state should have both fields applied
    expect(stored.environmentState.countryCode).toBe('IS');
    expect(stored.tripState.planVersion).toBe(1);
    expect(stored.systemState.version).toBeGreaterThanOrEqual(2);
  }, 20000);
});


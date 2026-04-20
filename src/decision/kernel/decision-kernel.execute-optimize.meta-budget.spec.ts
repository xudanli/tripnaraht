/**
 * DecisionKernelService.executeOptimize - meta budget audit in DSO.history
 */

import { DecisionKernelService } from './decision-kernel.service';
import type { DecisionState, OptimizationHints, StateHistoryDelta } from './decision-state.types';

describe('DecisionKernelService.executeOptimize (meta_budget history)', () => {
  const makeState = (requestId = 'req-kernel-optimize'): DecisionState =>
    ({
      requestId,
      userIntent: {},
      tripState: {},
      environmentState: {},
      systemState: {
        requestId,
        startedAt: new Date().toISOString(),
        lastUpdatedAt: new Date().toISOString(),
        version: 0,
      },
    }) as DecisionState;

  const mergeMock = jest.fn((current: DecisionState, patch: Partial<DecisionState>) => ({
    ...current,
    ...patch,
    userIntent: { ...(current.userIntent ?? {}), ...(patch.userIntent ?? {}) },
    tripState: { ...(current.tripState ?? {}), ...(patch.tripState ?? {}) },
    environmentState: { ...(current.environmentState ?? {}), ...(patch.environmentState ?? {}) },
    systemState: {
      ...(current.systemState ?? ({} as any)),
      ...(patch.systemState ?? {}),
    },
  }));

  const appendHistoryDeltaMock = jest.fn(
    (current: DecisionState, delta: StateHistoryDelta, maxEntries = 50): DecisionState => {
      const entry: StateHistoryDelta = {
        ...delta,
        at: delta.at ?? new Date().toISOString(),
      };
      const base = current.history ?? [];
      const next = [...base, entry];
      const trimmed = next.length > maxEntries ? next.slice(-maxEntries) : next;
      return { ...current, history: trimmed };
    },
  );

  const makeKernel = (hints: OptimizationHints) => {
    const stateManager = {
      merge: mergeMock,
      commit: jest.fn(),
      appendHistoryDelta: appendHistoryDeltaMock,
      commitWithLock: jest.fn(),
    };
    const constraintAdapter = { getReport: jest.fn(), getReportAsync: jest.fn() };
    const optimizationAdapter = {
      getHints: jest.fn().mockReturnValue(hints),
      getHintsAsync: jest.fn().mockResolvedValue(hints),
    };
    const contextAdapter = { buildContextPackage: jest.fn() };
    const feedbackAdapter = { recordDecisionLog: jest.fn(), recordUserFeedback: jest.fn() };
    return {
      kernel: new DecisionKernelService(
        stateManager as any,
        constraintAdapter as any,
        optimizationAdapter as any,
        contextAdapter as any,
        feedbackAdapter as any,
      ),
      optimizationAdapter,
    };
  };

  beforeEach(() => {
    mergeMock.mockClear();
    appendHistoryDeltaMock.mockClear();
  });
  const prevEnv = { ...process.env };

  afterEach(() => {
    process.env = { ...prevEnv };
  });

  it('当 hints.metaDecisionAudit 存在时应写入 DSO.history(type=meta_budget)', async () => {
    const hints: OptimizationHints = {
      method: 'CGUS',
      metaDecisionAudit: 'audit:cgus:sample=80;horizon=3',
      rolloutHorizonSteps: 3,
      candidateSearchBudget: {
        maxCandidates: 12,
        repairMaxIters: 3,
        repairTopKPerCandidate: 2,
        maxNewCandidatesPerIter: 40,
        maxPoolSize: 260,
      },
      candidateSearchAudit: {
        budget: {
          maxCandidates: 12,
          repairMaxIters: 3,
          repairTopKPerCandidate: 2,
          maxNewCandidatesPerIter: 40,
          maxPoolSize: 260,
          stopWhenFeasibleCount: 12,
        },
        initialVariantCount: 10,
        iterations: [],
        finalCandidateCount: 8,
        finalFeasibleCount: 5,
        stopReason: 'COMPLETED',
      },
    };
    const { kernel, optimizationAdapter } = makeKernel(hints);
    const dso = makeState('req-opt-meta');

    const { newState } = await kernel.executeOptimize(dso);

    expect(optimizationAdapter.getHintsAsync).toHaveBeenCalled();
    expect(newState.optimizationHints?.metaDecisionAudit).toBe(hints.metaDecisionAudit);

    expect(appendHistoryDeltaMock).toHaveBeenCalled();
    const metaCalls = appendHistoryDeltaMock.mock.calls.filter((c) => c[1]?.type === 'meta_budget');
    expect(metaCalls.length).toBeGreaterThan(0);
    expect(String(metaCalls[0][1]?.summary ?? '')).toContain('OPTIMIZE_CGUS:');
    expect(String(metaCalls[0][1]?.summary ?? '')).toContain(hints.metaDecisionAudit!);
    expect((metaCalls[0][1] as any)?.payload?.phase).toBe('OPTIMIZE');
    expect((metaCalls[0][1] as any)?.payload?.candidateSearchBudget?.maxCandidates).toBe(12);
    expect((metaCalls[0][1] as any)?.payload?.candidateSearchAudit?.initialVariantCount).toBe(10);

    const last = newState.history?.[newState.history.length - 1];
    expect(last?.type).toBe('meta_budget');
    expect(String(last?.summary ?? '')).toContain('OPTIMIZE_CGUS:');
  });

  it('当 uncertaintyProfile 指示预算耗尽时应写入 fail-safe 并追加 meta_budget 审计', async () => {
    const hints: OptimizationHints = {
      method: 'CGUS',
      metaDecisionAudit: 'audit:cgus:sample=0',
    };
    const { kernel } = makeKernel(hints);
    const dso = {
      ...makeState('req-opt-exhausted'),
      uncertaintyProfile: {
        hasUncertainty: true,
        suggestedSampleSize: 0,
        rolloutTopK: 0,
        planningDepth: 1,
      } as any,
    } as DecisionState;

    const { newState } = await kernel.executeOptimize(dso);

    expect(newState.optimizationHints?.failSafeAction).toBe('ADJUST_REQUIRED');
    expect(newState.optimizationHints?.failSafeReason).toBe('META_BUDGET_EXHAUSTED');

    const last = newState.history?.[newState.history.length - 1];
    expect(last?.type).toBe('meta_budget');
    expect(String(last?.summary ?? '')).toContain('OPTIMIZE_CGUS:');
  });

  it('可通过环境变量将 fail-safe 动作切到 BLOCK，并设置最小 sampleSize 阈值', async () => {
    process.env.DECISION_OS_FAILSAFE_BUDGET_ACTION = 'BLOCK';
    process.env.DECISION_OS_FAILSAFE_BUDGET_MIN_SAMPLE_SIZE = '40';

    const hints: OptimizationHints = {
      method: 'CGUS',
      metaDecisionAudit: 'audit:cgus:sample=20',
    };
    const { kernel } = makeKernel(hints);
    const dso = {
      ...makeState('req-opt-below-min'),
      uncertaintyProfile: {
        hasUncertainty: true,
        suggestedSampleSize: 20,
      } as any,
    } as DecisionState;

    const { newState } = await kernel.executeOptimize(dso);

    expect(newState.optimizationHints?.failSafeAction).toBe('BLOCK');
    expect(String(newState.optimizationHints?.failSafeReason ?? '')).toContain('META_BUDGET_BELOW_MIN');
  });
});

/**
 * DecisionKernelService.executeResearch - belief/uncertainty evidence chain
 *
 * 专利证据链最小闭环：
 * - RESEARCH 阶段写入 uncertaintyProfile(entropy01/suggestedSampleSize/ESS)
 * - 同步写入 beliefSamples（离散粒子，weight 归一）
 */

import { DecisionKernelService } from './decision-kernel.service';
import type { DecisionState, StateHistoryDelta } from './decision-state.types';
import type { PhaseExecutorContext } from './interfaces/phase-executor.interface';
import { MetaDecisionBudgetAllocatorService } from './meta-decision-budget-allocator.service';
// (no direct imports needed from the POMDP bridge here)

describe('DecisionKernelService.executeResearch (belief + uncertainty)', () => {
  const makeState = (requestId = 'req-kernel-research'): DecisionState =>
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

  const makeContext = (requestId = 'req-kernel-research'): PhaseExecutorContext =>
    ({
      requestId,
      tripPlanRequest: {
        destination: 'JP-Tokyo',
        date_range: { start_date: '2026-07-01', end_date: '2026-07-05' },
      },
      researchData: {},
    }) as PhaseExecutorContext;

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
    harnessRuntime: {
      ...(current.harnessRuntime ?? {}),
      ...(patch.harnessRuntime ?? {}),
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

  const commitMock = jest.fn((tx: any, current: any) => {
    const merged = mergeMock(current, tx.patch);
    const prevV = current.systemState?.version ?? 0;
    return { newState: merged, newVersion: prevV + 1 };
  });

  const makeKernel = (
    researchExecutor?: { execute: jest.Mock },
    extras?: { worldModel?: any; beliefUpdate?: any; feedbackPersistence?: any },
  ) => {
    const stateManager = {
      merge: mergeMock,
      commit: commitMock,
      appendHistoryDelta: appendHistoryDeltaMock,
      commitWithLock: jest.fn(),
    };
    const constraintAdapter = { getReport: jest.fn(), getReportAsync: jest.fn() };
    const optimizationAdapter = { getHints: jest.fn(), getHintsAsync: jest.fn() };
    const contextAdapter = { buildContextPackage: jest.fn() };
    const feedbackAdapter = { recordDecisionLog: jest.fn(), recordUserFeedback: jest.fn() };
    return new DecisionKernelService(
      stateManager as any,
      constraintAdapter as any,
      optimizationAdapter as any,
      contextAdapter as any,
      feedbackAdapter as any,
      researchExecutor as any,
      undefined, // gateEvalExecutor
      undefined, // planGenExecutor
      undefined, // verifyExecutor
      undefined, // repairExecutor
      undefined, // intakeExecutor
      undefined, // narrateExecutor
      extras?.feedbackPersistence as any, // feedbackPersistence
      undefined, // replanTrigger
      extras?.worldModel as any,
      extras?.beliefUpdate as any,
      undefined, // harnessStepRunner
    );
  };

  beforeEach(() => {
    mergeMock.mockClear();
    appendHistoryDeltaMock.mockClear();
    commitMock.mockClear();
  });

  it('当 RESEARCH 写入 weatherRisk 时应生成 uncertaintyProfile 与 beliefSamples（weight 归一）', async () => {
    const researchExecutor = {
      execute: jest.fn().mockResolvedValue({
        researchData: { weatherRisk: 0.92 },
        environmentPatch: { weatherRisk: 0.92 },
      }),
    };
    const kernel = makeKernel(researchExecutor);
    const dso = makeState('req-belief');
    const ctx = makeContext('req-belief');

    const { newState } = await kernel.executeResearch(dso, ctx);

    expect(researchExecutor.execute).toHaveBeenCalled();
    expect(newState.harnessRuntime?.researchEvidenceSnapshotId).toMatch(/^research_/);
    expect(newState.harnessRuntime?.activeTraceId).toBe(`harness-req-belief`);
    expect(newState.systemState?.currentPhase).toBe('RESEARCH');
    expect(newState.uncertaintyProfile?.hasUncertainty).toBe(true);
    expect(typeof newState.uncertaintyProfile?.entropy01).toBe('number');
    expect((newState.uncertaintyProfile?.entropy01 ?? -1)).toBeGreaterThanOrEqual(0);
    expect((newState.uncertaintyProfile?.entropy01 ?? -1)).toBeLessThanOrEqual(1);
    expect((newState.uncertaintyProfile?.suggestedSampleSize ?? 0)).toBeGreaterThan(0);
    expect((newState.uncertaintyProfile?.effectiveParticleCount ?? 0)).toBeGreaterThan(0);

    const samples = newState.beliefSamples ?? [];
    expect(samples.length).toBe(newState.uncertaintyProfile?.suggestedSampleSize);
    const sumW = samples.reduce((acc, s) => acc + (s.weight ?? 0), 0);
    expect(sumW).toBeGreaterThan(0.999);
    expect(sumW).toBeLessThan(1.001);

    // 与 allocator 逻辑对齐：确保 Kernel 写入的 profile 与 finalize 一致
    const allocator = new MetaDecisionBudgetAllocatorService();
    const draft = allocator.deriveUncertaintyBudget({
      ...newState,
      environmentState: { weatherRisk: 0.92 },
    } as DecisionState);
    const expectedProfile = allocator.finalizeUncertaintyProfile(draft, samples);
    expect(newState.uncertaintyProfile?.rolloutTopK).toBe(expectedProfile.rolloutTopK);
    expect(newState.uncertaintyProfile?.planningDepth).toBe(expectedProfile.planningDepth);
    expect(newState.uncertaintyProfile?.suggestedSampleSize).toBe(expectedProfile.suggestedSampleSize);

    expect(appendHistoryDeltaMock).toHaveBeenCalled();
    const metaCalls = appendHistoryDeltaMock.mock.calls.filter((c) => c[1]?.type === 'meta_budget');
    expect(metaCalls.length).toBeGreaterThan(0);
    expect(String(metaCalls[0][1]?.summary ?? '')).toContain('RESEARCH_META_BUDGET');
    expect((metaCalls[0][1] as any)?.payload?.phase).toBe('RESEARCH');
    expect((metaCalls[0][1] as any)?.payload?.beliefRefinement).toBe('META_ALLOCATOR');
  });

  it('DECISION_OS_RESEARCH_ATOMIC=1 时应调用 commitStateUpdate 原子提交关键字段', async () => {
    const prev = process.env.DECISION_OS_RESEARCH_ATOMIC;
    process.env.DECISION_OS_RESEARCH_ATOMIC = '1';

    const researchExecutor = {
      execute: jest.fn().mockResolvedValue({
        researchData: { weatherRisk: 0.92 },
        environmentPatch: { weatherRisk: 0.92 },
      }),
    };
    const kernel = makeKernel(researchExecutor);
    const dso = makeState('req-belief-atomic');
    const ctx = makeContext('req-belief-atomic');

    const { newState } = await kernel.executeResearch(dso, ctx);

    expect(commitMock).toHaveBeenCalled();
    expect(newState.uncertaintyProfile?.hasUncertainty).toBe(true);
    expect((newState.history ?? []).some((h: any) => h.type === 'meta_budget')).toBe(true);

    if (prev !== undefined) process.env.DECISION_OS_RESEARCH_ATOMIC = prev;
    else delete process.env.DECISION_OS_RESEARCH_ATOMIC;
  });

  it('DECISION_OS_RESEARCH_ATOMIC=1 + feedbackPersistence：persist 冲突应重试并最终成功', async () => {
    const prev = process.env.DECISION_OS_RESEARCH_ATOMIC;
    process.env.DECISION_OS_RESEARCH_ATOMIC = '1';

    const researchExecutor = {
      execute: jest.fn().mockResolvedValue({
        researchData: { weatherRisk: 0.92 },
        environmentPatch: { weatherRisk: 0.92 },
      }),
    };

    const feedbackPersistence = {
      getDso: jest.fn().mockResolvedValue(makeState('req-belief-atomic-persist')),
      persistDso: jest.fn().mockRejectedValueOnce(new Error('conflict')).mockResolvedValueOnce(undefined),
    };

    const kernel = makeKernel(researchExecutor, { feedbackPersistence });
    const dso = makeState('req-belief-atomic-persist');
    const ctx = makeContext('req-belief-atomic-persist');

    const { newState } = await kernel.executeResearch(dso, ctx);

    expect(commitMock).toHaveBeenCalled();
    expect(feedbackPersistence.persistDso).toHaveBeenCalledTimes(2);
    expect(newState.uncertaintyProfile?.hasUncertainty).toBe(true);
    expect((newState.history ?? []).some((h: any) => h.type === 'kernel_arbitration')).toBe(true);

    if (prev !== undefined) process.env.DECISION_OS_RESEARCH_ATOMIC = prev;
    else delete process.env.DECISION_OS_RESEARCH_ATOMIC;
  });

  it('当 RESEARCH 提供 windSpeedMs（独立通道）且注入 BeliefUpdate 时，应写入 pomdp.windSpeedMeta 且 observationIndependence=STRONG', async () => {
    const researchExecutor = {
      execute: jest.fn().mockResolvedValue({
        researchData: {
          weatherRisk: 0.6,
          windSpeedMs: 14.2,
          windSpeedMs_meta: { source: 'failure_risk_prediction', aggregation: 'mean', sampleCount: 3 },
        },
        environmentPatch: { weatherRisk: 0.6, windSpeedMs: 14.2 },
      }),
    };

    const worldModel = {
      fromDeterministicModel: jest.fn().mockReturnValue({ stubCtx: true }),
    };
    const beliefUpdate = {
      updateBelief: jest.fn().mockImplementation(async (_ctx: any, input: any) => {
        // 返回新数组引用，以触发 Kernel 认为精炼生效
        const updatedBelief = (input.currentBelief as any[]).map((p: any, i: number) => ({
          ...p,
          weight: i === 0 ? 0.9 : 0.1,
        }));
        return {
          updatedBelief,
          effectiveParticleCount: (input.currentBelief as any[]).length,
          logNormalizationConstant: 0,
        };
      }),
    };

    const kernel = makeKernel(researchExecutor, { worldModel, beliefUpdate });
    const dso = makeState('req-belief-strong');
    const ctx = makeContext('req-belief-strong');

    await kernel.executeResearch(dso, ctx);

    const metaCalls = appendHistoryDeltaMock.mock.calls.filter((c) => c[1]?.type === 'meta_budget');
    expect(metaCalls.length).toBeGreaterThan(0);
    const payload = (metaCalls[metaCalls.length - 1][1] as any)?.payload;
    expect(payload?.beliefRefinement).toBe('POMDP');
    expect(payload?.pomdp?.observationIndependence).toBe('STRONG');
    expect(payload?.pomdp?.observationIndependenceTier).toBe('STRONG_INTERNAL');
    expect(payload?.pomdp?.windSpeedMeta).toEqual({
      source: 'failure_risk_prediction',
      aggregation: 'mean',
      sampleCount: 3,
    });
    expect(payload?.pomdp?.observedWindSpeedMs).toBe(14.2);
    expect(payload?.pomdp?.observationQuality).toBe('MEDIUM');
    expect(typeof payload?.pomdp?.weightL1Delta).toBe('number');
    expect(typeof payload?.pomdp?.weightJSDivergence).toBe('number');
    expect(payload?.pomdp?.refinementThresholds?.n).toBeGreaterThan(0);
    expect(payload?.pomdp?.observationFusionOrder?.[0]).toBe('windSpeed');
    expect(payload?.pomdp?.observationModelParams?.windSpeedVariance).toBeGreaterThan(0);
    expect(payload?.pomdp?.observationsUsed?.[0]?.variable).toBe('windSpeed');
    expect(payload?.pomdp?.observationsUsed?.[0]?.independenceTier).toBe('STRONG_INTERNAL');
    expect(payload?.pomdp?.beliefUpdateSteps?.[0]?.variable).toBe('windSpeed');
    expect(payload?.pomdp?.beliefUpdateSteps?.[0]?.independenceTier).toBe('STRONG_INTERNAL');
    expect(typeof payload?.pomdp?.entropy01Before).toBe('number');
    expect(typeof payload?.pomdp?.entropy01After).toBe('number');
    expect(typeof payload?.pomdp?.essBefore).toBe('number');
    expect(typeof payload?.pomdp?.essAfter).toBe('number');
    expect(typeof payload?.pomdp?.deltaEntropy01).toBe('number');
    expect(typeof payload?.pomdp?.deltaEss).toBe('number');
    expect(payload?.pomdp?.deltaEntropy01).toBeCloseTo(payload?.pomdp?.entropy01After - payload?.pomdp?.entropy01Before, 8);
    expect(payload?.pomdp?.deltaEss).toBeCloseTo(payload?.pomdp?.essAfter - payload?.pomdp?.essBefore, 8);
  });

  it('当 RESEARCH 提供 wind_speed_kmh（外部 forecast 形态）时，应写入 observationQuality=HIGH 且 observationIndependenceTier=STRONG_EXTERNAL', async () => {
    const researchExecutor = {
      execute: jest.fn().mockResolvedValue({
        researchData: {
          weatherRisk: 0.4,
          wind_speed_kmh: 36,
          windSpeedMs_meta: { source: 'weather_forecast', aggregation: 'p90', sampleCount: 5, quantileMethod: 'ceil-index' },
        },
        environmentPatch: { weatherRisk: 0.4, windSpeedMs: 10 },
      }),
    };

    const worldModel = {
      fromDeterministicModel: jest.fn().mockReturnValue({ stubCtx: true }),
    };
    const beliefUpdate = {
      updateBelief: jest.fn().mockImplementation(async (_ctx: any, input: any) => {
        const updatedBelief = (input.currentBelief as any[]).map((p: any, i: number) => ({
          ...p,
          weight: i === 0 ? 0.9 : 0.1,
        }));
        return {
          updatedBelief,
          effectiveParticleCount: (input.currentBelief as any[]).length,
          logNormalizationConstant: 0,
        };
      }),
    };

    const kernel = makeKernel(researchExecutor, { worldModel, beliefUpdate });
    const dso = makeState('req-belief-external');
    const ctx = makeContext('req-belief-external');

    await kernel.executeResearch(dso, ctx);

    const metaCalls = appendHistoryDeltaMock.mock.calls.filter((c) => c[1]?.type === 'meta_budget');
    expect(metaCalls.length).toBeGreaterThan(0);
    const payload = (metaCalls[metaCalls.length - 1][1] as any)?.payload;
    expect(payload?.beliefRefinement).toBe('POMDP');
    expect(payload?.pomdp?.observationIndependence).toBe('STRONG');
    expect(payload?.pomdp?.observationIndependenceTier).toBe('STRONG_EXTERNAL');
    expect(payload?.pomdp?.observationQuality).toBe('HIGH');
    expect(payload?.pomdp?.observedWindSpeedMs).toBeCloseTo(10, 5);
    expect(payload?.pomdp?.windSpeedMeta?.source).toBe('weather_forecast');
    expect(payload?.pomdp?.windSpeedMeta?.aggregation).toBe('p90');
    expect(payload?.pomdp?.windSpeedMeta?.quantileMethod).toBe('ceil-index');
    expect(payload?.pomdp?.observationsUsed?.[0]?.variable).toBe('windSpeed');
    expect(payload?.pomdp?.observationsUsed?.[0]?.independenceTier).toBe('STRONG_EXTERNAL');
    expect(payload?.pomdp?.beliefUpdateSteps?.[0]?.variable).toBe('windSpeed');
    expect(payload?.pomdp?.beliefUpdateSteps?.[0]?.independenceTier).toBe('STRONG_EXTERNAL');
  });
});


/**
 * DecisionKernelService VERIFY -> REPAIR 闭环单元测试
 */

import { DecisionKernelService } from './decision-kernel.service';
import type { DecisionState } from './decision-state.types';
import type { PhaseExecutorContext } from './interfaces/phase-executor.interface';

describe('DecisionKernelService VERIFY -> REPAIR loop', () => {
  const makeState = (requestId = 'req-vr'): DecisionState =>
    ({
      requestId,
      userIntent: {},
      environmentState: {},
      tripState: {
        planDraft: {
          request_id: requestId,
          days: [{ date: '2026-07-01', items: [{ type: 'POI', title: 'A' }] }],
        },
      },
      confidence: 0.9,
      systemState: {
        requestId,
        version: 0,
        startedAt: new Date().toISOString(),
        lastUpdatedAt: new Date().toISOString(),
      },
    }) as DecisionState;

  const makeCtx = (requestId = 'req-vr'): PhaseExecutorContext =>
    ({
      requestId,
      itinerary: {
        request_id: requestId,
        days: [{ date: '2026-07-01', items: [{ type: 'POI', title: 'A' }] }],
      },
      tripPlanRequest: {
        destination: 'JP-Osaka',
        date_range: { start_date: '2026-07-01', end_date: '2026-07-05' },
      },
      gateResult: {
        gate_result: 'ADJUST_REQUIRED',
        violations: [],
        required_adjustments: [{ action: 'REPLACE_SEGMENT', why: 'verify issues found' }],
        confidence: 0.8,
      },
      researchData: {},
    }) as PhaseExecutorContext;

  const mergeMock = jest.fn((current: DecisionState, patch: Partial<DecisionState>) => ({
    ...current,
    ...patch,
    tripState: {
      ...(current.tripState ?? {}),
      ...(patch.tripState ?? {}),
    },
    systemState: {
      ...(current.systemState ?? {}),
      ...(patch.systemState ?? {}),
    },
  }));

  const makeKernel = (deps: {
    verifyExecutor?: { execute: jest.Mock };
    repairExecutor?: { execute: jest.Mock };
  }) => {
    const stateManager = {
      merge: mergeMock,
      commit: jest.fn(),
      appendHistoryDelta: jest.fn(),
      commitWithLock: jest.fn(),
    };
    return new DecisionKernelService(
      stateManager as any,
      { getReport: jest.fn(), getReportAsync: jest.fn() } as any,
      { getHints: jest.fn(), getHintsAsync: jest.fn() } as any,
      { buildContextPackage: jest.fn() } as any,
      { recordDecisionLog: jest.fn(), recordUserFeedback: jest.fn() } as any,
      undefined,
      undefined,
      undefined,
      deps.verifyExecutor as any,
      deps.repairExecutor as any,
    );
  };

  beforeEach(() => {
    mergeMock.mockClear();
  });

  it('VERIFY 返回 issues 后，REPAIR 应可应用修复并更新 planDraft', async () => {
    const verifyExecutor = {
      execute: jest.fn().mockResolvedValue({
        issues: ['slot overlap'],
        confidenceDelta: -0.2,
      }),
    };
    const repairedItinerary = {
      request_id: 'req-vr',
      days: [{ date: '2026-07-01', items: [{ type: 'POI', title: 'A-fixed' }] }],
    };
    const repairExecutor = {
      execute: jest.fn().mockResolvedValue({
        itinerary: repairedItinerary,
        repairApplied: true,
      }),
    };
    const kernel = makeKernel({ verifyExecutor, repairExecutor });
    const dso = makeState();
    const ctx = makeCtx();

    const verifyResult = await kernel.executeVerify(dso, ctx);
    expect(verifyExecutor.execute).toHaveBeenCalledWith(dso, ctx);
    expect(verifyResult.issues).toEqual(['slot overlap']);
    expect(verifyResult.confidenceDelta).toBe(-0.2);
    expect(verifyResult.newState.confidence).toBeCloseTo(0.7); // 0.9 + (-0.2)
    expect(verifyResult.newState.systemState?.currentPhase).toBe('VERIFY');

    const repairResult = await kernel.executeRepair(verifyResult.newState, {
      ...ctx,
      itinerary: repairedItinerary,
    });
    expect(repairExecutor.execute).toHaveBeenCalled();
    expect(repairResult.repairApplied).toBe(true);
    expect(repairResult.itinerary).toEqual(repairedItinerary);
    expect(repairResult.newState.tripState?.planDraft).toEqual(repairedItinerary);
    expect(repairResult.newState.systemState?.currentPhase).toBe('REPAIR');
  });

  it('未注入 verify/repair 执行器时应安全降级', async () => {
    const kernel = makeKernel({});
    const dso = makeState('req-vr-fallback');
    const ctx = makeCtx('req-vr-fallback');

    const verifyResult = await kernel.executeVerify(dso, ctx);
    expect(verifyResult.issues).toEqual([]);
    expect(verifyResult.confidenceDelta).toBe(0);
    expect(verifyResult.newState).toBe(dso);

    const repairResult = await kernel.executeRepair(dso, ctx);
    expect(repairResult.repairApplied).toBe(false);
    expect(repairResult.newState).toBe(dso);
  });
});


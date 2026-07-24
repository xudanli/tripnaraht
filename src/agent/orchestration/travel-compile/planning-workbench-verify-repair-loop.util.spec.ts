import type { GateStatus } from '../../../skills/plan/shared/plan-state.types';
import type { PlanState } from '../../../skills/plan/shared/plan-state.types';

jest.mock('./planning-workbench-travel-compile.util', () => ({
  runPlanningWorkbenchTravelCompile: jest.fn().mockResolvedValue({
    skipped: false,
    progress: { engine: 'CTRE', status: 'partial', score: 90, counters: {} },
    verifySsotApplied: true,
  }),
}));

import { runPlanningWorkbenchTravelCompile } from './planning-workbench-travel-compile.util';
import { runPlanningWorkbenchVerifyRepairLoop } from './planning-workbench-verify-repair-loop.util';

describe('runPlanningWorkbenchVerifyRepairLoop', () => {
  const priorGate: GateStatus = { status: 'ALLOW', reasons: [], missingEvidence: [] };

  function planState(): PlanState {
    return {
      plan_id: 'plan_loop',
      plan_version: 1,
      constraints: { time: { days: 1, startDate: '2026-08-03' }, budget: {}, fitness: {} },
      itinerary: {
        tripId: 'trip_1',
        routeDirectionId: 'rd_1',
        segments: [
          {
            segmentId: 's0',
            dayIndex: 0,
            distanceKm: 0,
            ascentM: 0,
            slopePct: 0,
            metadata: { attractions: [{ name: 'Gullfoss' }] },
          },
        ],
      },
      mobility: { transferSegments: [] },
      budget: {},
      pace: {},
      gate: priorGate,
      evidence_refs: [],
      decision_log_refs: [],
      status: 'PROPOSED',
      metadata: { verify_ssot_applied: true },
    };
  }

  beforeEach(() => {
    jest.clearAllMocks();
  });

  it('skips when kernel bridge unavailable', async () => {
    const out = await runPlanningWorkbenchVerifyRepairLoop({
      request: { context: { destination: { country: 'IS' }, days: 1 }, userAction: 'generate' },
      planState: planState(),
      kernelBridge: { isVerifyAvailable: () => false } as never,
    });
    expect(out.skipped).toBe(true);
    expect(out.reason).toBe('decision_kernel_unavailable');
  });

  it('terminates clean when first verify has no conflicts', async () => {
    const kernelBridge = {
      isVerifyAvailable: () => true,
      runNativeVerifyRepairPipeline: jest.fn().mockResolvedValue({
        skipped: false,
        gateStatus: priorGate,
        metadata: {
          applied: true,
          issueCount: 0,
          fatalCount: 0,
          conflictCount: 0,
          advisoryCount: 0,
        },
        repair: { applied: false, skipped: true, reason: 'no_repairable_conflicts', appliedAt: '' },
      }),
    };

    const out = await runPlanningWorkbenchVerifyRepairLoop({
      request: { context: { destination: { country: 'IS' }, days: 1 }, userAction: 'generate' },
      planState: planState(),
      kernelBridge: kernelBridge as never,
      configService: { get: () => 'true' } as never,
    });

    expect(out.terminatedReason).toBe('clean');
    expect(out.repairCount).toBe(0);
    expect(out.rounds).toHaveLength(1);
  });

  it('runs additional verify/repair rounds until clean', async () => {
    const verifyPipeline = jest.fn().mockResolvedValue({
      skipped: false,
      gateStatus: { status: 'NEED_CONFIRM', reasons: [], missingEvidence: [] },
      metadata: {
        applied: true,
        issueCount: 1,
        fatalCount: 0,
        conflictCount: 1,
        advisoryCount: 0,
        issues: [{ code: 'TIME_WINDOW_OVERLAP', class: 'CONFLICT', message: 'overlap' }],
      },
      repair: { applied: true, segmentsUpdated: 1, itemsApplied: 1, appliedAt: '' },
    });

    const verifyOnly = jest
      .fn()
      .mockResolvedValueOnce({
        skipped: false,
        gateStatus: { status: 'NEED_CONFIRM', reasons: [], missingEvidence: [] },
        metadata: {
          applied: true,
          issueCount: 1,
          fatalCount: 0,
          conflictCount: 1,
          advisoryCount: 0,
          issues: [{ code: 'TIME_WINDOW_OVERLAP', class: 'CONFLICT', message: 'still overlap' }],
        },
      })
      .mockResolvedValueOnce({
        skipped: false,
        gateStatus: priorGate,
        metadata: {
          applied: true,
          issueCount: 0,
          fatalCount: 0,
          conflictCount: 0,
          advisoryCount: 0,
          issues: [],
        },
      });

    const repairOnly = jest.fn().mockResolvedValue({
      applied: true,
      segmentsUpdated: 1,
      itemsApplied: 1,
      appliedAt: '',
    });

    const kernelBridge = {
      isVerifyAvailable: () => true,
      runNativeVerifyRepairPipeline: verifyPipeline,
      runNativeVerifyPipeline: verifyOnly,
      runNativeRepairPipeline: repairOnly,
    };

    const out = await runPlanningWorkbenchVerifyRepairLoop({
      request: { context: { destination: { country: 'IS' }, days: 1 }, userAction: 'generate' },
      planState: planState(),
      kernelBridge: kernelBridge as never,
      configService: {
        get: (key: string) => {
          if (key === 'PLANNING_WORKBENCH_VERIFY_REPAIR_MAX_ITERATIONS') return '2';
          return 'true';
        },
      } as never,
      enableTravelCompiler: true,
    });

    expect(out.repairCount).toBe(2);
    expect(out.terminatedReason).toBe('clean');
    expect(verifyOnly).toHaveBeenCalledTimes(2);
    expect(repairOnly).toHaveBeenCalledTimes(1);
    expect(runPlanningWorkbenchTravelCompile).toHaveBeenCalledTimes(2);
  });
});

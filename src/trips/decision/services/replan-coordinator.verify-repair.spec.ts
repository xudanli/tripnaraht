/**
 * S-TD-02：Trips replan 主链上 VERIFY 失败后触发 REPAIR 的回归
 */

import { ReplanCoordinatorService } from './replan-coordinator.service';
import type { DecisionState } from '../../../decision/kernel/decision-state.types';
import type { DecisionKernelService } from '../../../decision/kernel/decision-kernel.service';
import type { PrismaService } from '../../../prisma/prisma.service';
import type { IDsoFeedbackPersistence } from '../../../decision/kernel/dso-feedback-persistence.interface';

describe('ReplanCoordinatorService VERIFY → REPAIR (S-TD-02)', () => {
  const tripId = 'trip-vr-01';

  const baseDso = (): DecisionState =>
    ({
      requestId: tripId,
      userIntent: { destination: 'IS-Reykjavik', dateRange: { startDate: '2026-07-01', endDate: '2026-07-05' } },
      tripState: {},
      environmentState: {},
      systemState: { requestId: tripId, version: 1 },
    }) as DecisionState;

  const mockTripRow = {
    destination: 'IS-Reykjavik',
    startDate: new Date('2026-07-01'),
    endDate: new Date('2026-07-05'),
  };

  function makeCoordinator(deps: {
    kernel: Partial<jest.Mocked<Pick<DecisionKernelService, keyof DecisionKernelService>>>;
    persistence: Pick<IDsoFeedbackPersistence, 'getDso' | 'persistDso'>;
  }) {
    const prisma = {
      trip: {
        findUnique: jest.fn().mockResolvedValue(mockTripRow),
      },
      tripRun: { findUnique: jest.fn() },
    } as unknown as PrismaService;

    return new ReplanCoordinatorService(
      deps.kernel as unknown as DecisionKernelService,
      prisma,
      deps.persistence as IDsoFeedbackPersistence,
      undefined,
    );
  }

  it('VERIFY 返回 issues 时应调用 executeRepair 并将最终 DSO 持久化', async () => {
    const dso0 = baseDso();
    const planItinerary = { request_id: tripId, days: [{ date: '2026-07-01', items: [] as unknown[] }] };
    const fixedItinerary = { request_id: tripId, days: [{ date: '2026-07-01', items: [{ type: 'POI', title: 'fixed' }] }] };

    const dsoAfterVerify: DecisionState = {
      ...dso0,
      systemState: { ...dso0.systemState, currentPhase: 'VERIFY' },
      confidence: 0.75,
    } as DecisionState;
    const dsoAfterRepair: DecisionState = {
      ...dsoAfterVerify,
      systemState: { ...dsoAfterVerify.systemState, currentPhase: 'REPAIR' },
      tripState: { planDraft: fixedItinerary },
    } as DecisionState;

    const executeResearch = jest.fn().mockResolvedValue({ newState: dso0, researchData: {} });
    const executeGateEval = jest.fn().mockImplementation(async () => ({
      newState: dso0,
      gateResult: { gate_result: 'ALLOW' as const, violations: [], required_adjustments: [], confidence: 1 },
      constraints: { feasible: true, violations: [] },
    }));
    const getContextPackage = jest.fn().mockResolvedValue({});
    const updateState = jest.fn().mockImplementation((s: DecisionState, p: Record<string, unknown>) => ({
      ...s,
      ...p,
      systemState: { ...s.systemState, ...(p.systemState as object) },
      tripState: { ...s.tripState, ...(p.tripState as object) },
    }));
    const executePlanGen = jest.fn().mockResolvedValue({
      newState: { ...dso0, tripState: { planDraft: planItinerary } },
      itinerary: planItinerary,
    });
    const executeVerify = jest.fn().mockResolvedValue({
      newState: dsoAfterVerify,
      issues: ['slot_conflict'],
      confidenceDelta: -0.05,
    });
    const executeRepair = jest.fn().mockResolvedValue({
      newState: dsoAfterRepair,
      itinerary: fixedItinerary,
      repairApplied: true,
    });

    const persistDso = jest.fn().mockResolvedValue(undefined);
    const getDso = jest.fn().mockResolvedValue(dso0);

    const coordinator = makeCoordinator({
      kernel: {
        executeResearch,
        executeGateEval,
        getContextPackage,
        updateState,
        executePlanGen,
        executeVerify,
        executeRepair,
      },
      persistence: { getDso, persistDso },
    });

    await coordinator.triggerReplan(tripId, 'test_verify_repair');

    expect(executeVerify).toHaveBeenCalledTimes(1);
    expect(executeRepair).toHaveBeenCalledTimes(1);
    expect(persistDso).toHaveBeenCalledWith(tripId, dsoAfterRepair);
  });

  it('VERIFY 无 issues 时不应调用 executeRepair', async () => {
    const dso0 = baseDso();
    const planItinerary = { request_id: tripId, days: [] };

    const dsoAfterVerify: DecisionState = {
      ...dso0,
      systemState: { ...dso0.systemState, currentPhase: 'VERIFY' },
    } as DecisionState;

    const executeResearch = jest.fn().mockResolvedValue({ newState: dso0, researchData: {} });
    const executeGateEval = jest.fn().mockResolvedValue({
      newState: dso0,
      gateResult: { gate_result: 'ALLOW' as const, violations: [], required_adjustments: [], confidence: 1 },
      constraints: { feasible: true, violations: [] },
    });
    const getContextPackage = jest.fn().mockResolvedValue({});
    const updateState = jest.fn().mockImplementation((s: DecisionState, p: Record<string, unknown>) => ({
      ...s,
      ...p,
      systemState: { ...s.systemState, ...(p.systemState as object) },
      tripState: { ...s.tripState, ...(p.tripState as object) },
    }));
    const executePlanGen = jest.fn().mockResolvedValue({
      newState: { ...dso0, tripState: { planDraft: planItinerary } },
      itinerary: planItinerary,
    });
    const executeVerify = jest.fn().mockResolvedValue({
      newState: dsoAfterVerify,
      issues: [],
      confidenceDelta: 0,
    });
    const executeRepair = jest.fn();

    const persistDso = jest.fn().mockResolvedValue(undefined);
    const getDso = jest.fn().mockResolvedValue(dso0);

    const coordinator = makeCoordinator({
      kernel: {
        executeResearch,
        executeGateEval,
        getContextPackage,
        updateState,
        executePlanGen,
        executeVerify,
        executeRepair,
      },
      persistence: { getDso, persistDso },
    });

    await coordinator.triggerReplan(tripId, 'test_verify_ok');

    expect(executeRepair).not.toHaveBeenCalled();
    expect(persistDso).toHaveBeenCalledWith(tripId, dsoAfterVerify);
  });
});

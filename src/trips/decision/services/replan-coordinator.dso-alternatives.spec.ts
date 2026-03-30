/**
 * T3：replan 持久化 DSO 上保留 `tripState.orchestratorAlternatives`（Kernel BLOCK 出口），并对齐 TD-03
 */

import { ReplanCoordinatorService } from './replan-coordinator.service';
import type { DecisionState } from '../../../decision/kernel/decision-state.types';
import type { DecisionKernelService } from '../../../decision/kernel/decision-kernel.service';
import type { PrismaService } from '../../../prisma/prisma.service';
import type { IDsoFeedbackPersistence } from '../../../decision/kernel/dso-feedback-persistence.interface';
import {
  alternativesReadabilityIssues,
  alternativesSatisfyBlockedGateMin,
} from '../contracts/alternatives-min-contract';

describe('ReplanCoordinatorService DSO alternatives (T3 / TD-03)', () => {
  const tripId = 'trip-dso-alt-01';

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

  const readableAlts = {
    alternative_pois: [
      {
        poi_id: 'alt-replan-1',
        name: '备选景点',
        reason: '主路线阻断时的可执行替代',
        evidence_status: 'UNVERIFIED' as const,
      },
    ],
    alternative_routes: [] as unknown[],
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

  it('GATE_EVAL 为 BLOCK 且 DSO 含 orchestratorAlternatives 时，持久化快照应仍满足 TD-03', async () => {
    const dso0 = baseDso();
    const dsoAfterGate: DecisionState = {
      ...dso0,
      tripState: {
        ...dso0.tripState,
        orchestratorAlternatives: readableAlts,
      },
      constraints: {
        feasible: false,
        violations: [{ type: 'SAFETY', severity: 'HARD', detail: 'blocked' }],
      },
      systemState: { ...dso0.systemState, currentPhase: 'GATE_EVAL' },
    } as DecisionState;

    const planItinerary = { request_id: tripId, days: [] };
    const dsoAfterVerify: DecisionState = {
      ...dsoAfterGate,
      systemState: { ...dsoAfterGate.systemState, currentPhase: 'VERIFY' },
    } as DecisionState;

    const executeResearch = jest.fn().mockResolvedValue({ newState: dso0, researchData: {} });
    const executeGateEval = jest.fn().mockResolvedValue({
      newState: dsoAfterGate,
      gateResult: {
        gate_result: 'BLOCK' as const,
        violations: [{ type: 'SAFETY', severity: 'HARD', detail: 'blocked' }],
        required_adjustments: [],
        confidence: 0.9,
      },
      constraints: dsoAfterGate.constraints,
    });
    const getContextPackage = jest.fn().mockResolvedValue({});
    const updateState = jest.fn().mockImplementation((s: DecisionState, p: Record<string, unknown>) => ({
      ...s,
      ...p,
      systemState: { ...s.systemState, ...(p.systemState as object) },
      tripState: { ...s.tripState, ...(p.tripState as object) },
    }));
    const executePlanGen = jest.fn().mockResolvedValue({
      newState: { ...dsoAfterGate, tripState: { ...dsoAfterGate.tripState, planDraft: planItinerary } },
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

    await coordinator.triggerReplan(tripId, 'test_block_alts');

    expect(persistDso).toHaveBeenCalledTimes(1);
    const persisted = persistDso.mock.calls[0][1] as DecisionState;
    const alts = persisted.tripState?.orchestratorAlternatives;
    expect(alts).toBeDefined();
    const min = alternativesSatisfyBlockedGateMin('BLOCK', alts);
    expect(min.ok).toBe(true);
    expect(alternativesReadabilityIssues(alts)).toHaveLength(0);
  });
});

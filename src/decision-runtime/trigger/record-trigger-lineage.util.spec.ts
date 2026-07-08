import {
  dispatchUserIntentIfEnabled,
  dispatchInTripDeviationIfEnabled,
  dispatchWorldEventIfEnabled,
  dispatchManualRepairIfEnabled,
  dispatchAgentRouteAndRunIfEnabled,
  recordUserIntentLineageIfEnabled,
} from './record-trigger-lineage.util';
import type { DecisionTriggerGatewayService } from './decision-trigger.gateway.service';

describe('dispatchUserIntentIfEnabled', () => {
  const originalEnv = process.env;

  afterEach(() => {
    process.env = originalEnv;
  });

  it('dispatches when gateway enabled', async () => {
    process.env = {
      ...originalEnv,
      DECISION_TRIGGER_GATEWAY_ENABLED: '1',
      DECISION_TRIGGER_LINEAGE_ENABLED: '1',
    };

    const gateway = {
      dispatch: jest.fn().mockResolvedValue({
        status: 'COMPLETED',
        runId: 'run_1',
        routeTarget: 'AGENTIC_ORCHESTRATION',
      }),
      buildRunRequest: jest.fn(),
    } as unknown as DecisionTriggerGatewayService;

    const result = await dispatchUserIntentIfEnabled(gateway, {
      tripId: 'trip-1',
      entryPointId: 'user.trip-edit',
      metadata: { intent: 'batch_itinerary_update' },
    });

    expect(gateway.dispatch).toHaveBeenCalledWith(
      expect.objectContaining({
        kind: 'USER_INTENT',
        tripId: 'trip-1',
        metadata: expect.objectContaining({
          entryPointId: 'user.trip-edit',
          eventType: 'USER_ITINERARY_EDIT',
          affectsEffectivePlan: true,
        }),
      }),
    );
    expect(result).toMatchObject({ status: 'COMPLETED' });
  });

  it('returns undefined when gateway disabled (no lineage without gateway)', async () => {
    process.env = {
      ...originalEnv,
      DECISION_TRIGGER_GATEWAY_ENABLED: '0',
      DECISION_TRIGGER_LINEAGE_ENABLED: '1',
    };

    const gateway = {
      dispatch: jest.fn(),
      buildRunRequest: jest.fn().mockReturnValue({ runId: 'run_lineage' }),
    } as unknown as DecisionTriggerGatewayService;

    const result = await dispatchUserIntentIfEnabled(gateway, {
      tripId: 'trip-1',
      entryPointId: 'user.trip-edit',
    });

    expect(gateway.dispatch).not.toHaveBeenCalled();
    expect(gateway.buildRunRequest).not.toHaveBeenCalled();
    expect(result).toBeUndefined();
  });

  it('recordUserIntentLineageIfEnabled records when gateway + lineage enabled', () => {
    process.env = {
      ...originalEnv,
      DECISION_TRIGGER_GATEWAY_ENABLED: '1',
      DECISION_TRIGGER_LINEAGE_ENABLED: '1',
    };

    const gateway = {
      buildRunRequest: jest.fn().mockReturnValue({ runId: 'run_lineage' }),
    } as unknown as DecisionTriggerGatewayService;

    const result = recordUserIntentLineageIfEnabled(gateway, {
      tripId: 'trip-1',
      entryPointId: 'user.trip-edit',
    });

    expect(result).toMatchObject({ runId: 'run_lineage' });
  });

  it('dispatchInTripDeviationIfEnabled dispatches IN_TRIP_DEVIATION', async () => {
    process.env = {
      ...originalEnv,
      DECISION_TRIGGER_GATEWAY_ENABLED: '1',
      DECISION_TRIGGER_LINEAGE_ENABLED: '1',
    };

    const gateway = {
      dispatch: jest.fn().mockResolvedValue({
        status: 'COMPLETED',
        runId: 'run_in_trip',
        routeTarget: 'CANONICAL_L2_EVALUATE',
        request: { runId: 'run_in_trip' },
      }),
      buildRunRequest: jest.fn(),
    } as unknown as DecisionTriggerGatewayService;

    const result = await dispatchInTripDeviationIfEnabled(gateway, {
      kind: 'IN_TRIP_DEVIATION',
      tripId: 'trip-1',
      source: 'INTERNAL',
      metadata: { triggerType: 'ROAD_CLOSED' },
    });

    expect(gateway.dispatch).toHaveBeenCalledWith(
      expect.objectContaining({
        kind: 'IN_TRIP_DEVIATION',
        metadata: expect.objectContaining({
          entryPointId: 'loops.in-trip-recovery',
          affectsEffectivePlan: true,
        }),
      }),
    );
    expect(result).toMatchObject({ status: 'COMPLETED' });
  });

  it('dispatchWorldEventIfEnabled dispatches WORLD_EVENT for kernel replan', async () => {
    process.env = {
      ...originalEnv,
      DECISION_TRIGGER_GATEWAY_ENABLED: '1',
      DECISION_TRIGGER_LINEAGE_ENABLED: '1',
    };

    const gateway = {
      dispatch: jest.fn().mockResolvedValue({
        status: 'COMPLETED',
        runId: 'run_kernel',
        routeTarget: 'CANONICAL_MONITORING',
        request: { runId: 'run_kernel' },
      }),
      buildRunRequest: jest.fn(),
    } as unknown as DecisionTriggerGatewayService;

    const result = await dispatchWorldEventIfEnabled(gateway, {
      kind: 'WORLD_EVENT',
      tripId: 'trip-1',
      source: 'INTERNAL',
      metadata: { reason: 'flight_cancelled' },
    });

    expect(gateway.dispatch).toHaveBeenCalledWith(
      expect.objectContaining({
        kind: 'WORLD_EVENT',
        metadata: expect.objectContaining({
          entryPointId: 'kernel.replan-coordinator',
          affectsEffectivePlan: true,
        }),
      }),
    );
    expect(result).toMatchObject({ status: 'COMPLETED' });
  });

  it('dispatchManualRepairIfEnabled dispatches MANUAL_REPAIR_REQUEST', async () => {
    process.env = {
      ...originalEnv,
      DECISION_TRIGGER_GATEWAY_ENABLED: '1',
      DECISION_TRIGGER_LINEAGE_ENABLED: '1',
    };

    const gateway = {
      dispatch: jest.fn().mockResolvedValue({
        status: 'COMPLETED',
        runId: 'run_repair',
        routeTarget: 'CANONICAL_L2_EVALUATE',
        request: { runId: 'run_repair' },
      }),
      buildRunRequest: jest.fn(),
    } as unknown as DecisionTriggerGatewayService;

    const result = await dispatchManualRepairIfEnabled(gateway, {
      tripId: 'trip-1',
      entryPointId: 'user.readiness-apply-repair',
      issueId: 'blocker_1',
    });

    expect(gateway.dispatch).toHaveBeenCalledWith(
      expect.objectContaining({
        kind: 'MANUAL_REPAIR_REQUEST',
        metadata: expect.objectContaining({
          entryPointId: 'user.readiness-apply-repair',
          issueId: 'blocker_1',
          affectsEffectivePlan: true,
        }),
      }),
    );
    expect(result).toMatchObject({ status: 'COMPLETED' });
  });

  it('dispatchAgentRouteAndRunIfEnabled dispatches advisory LEGACY_AGENT_ROUTE', async () => {
    process.env = {
      ...originalEnv,
      DECISION_TRIGGER_GATEWAY_ENABLED: '1',
      DECISION_TRIGGER_LINEAGE_ENABLED: '1',
    };

    const gateway = {
      dispatch: jest.fn().mockResolvedValue({
        status: 'COMPLETED',
        runId: 'run_agent',
        routeTarget: 'LEGACY_DECISION_ENGINE',
        request: { runId: 'run_agent' },
      }),
      buildRunRequest: jest.fn(),
    } as unknown as DecisionTriggerGatewayService;

    const result = await dispatchAgentRouteAndRunIfEnabled(gateway, {
      kind: 'LEGACY_AGENT_ROUTE',
      tripId: 'trip-1',
      source: 'AGENT_ROUTE_AND_RUN',
    });

    expect(gateway.dispatch).toHaveBeenCalledWith(
      expect.objectContaining({
        metadata: expect.objectContaining({
          entryPointId: 'agent.route-and-run',
          affectsEffectivePlan: false,
        }),
      }),
    );
    expect(result).toMatchObject({ status: 'COMPLETED' });
  });
});

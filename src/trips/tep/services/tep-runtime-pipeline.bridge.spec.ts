import type { ResolveRoadStatusChangedResult } from '../../guardian-decision-core/evidence/evidence-resolver.service';
import type { RoadStatusChangedEvent } from '../../guardian-decision-core/evidence/road-status-changed.event';
import type { DecisionHook } from '../contracts/tep-self-drive.types';
import { TepRuntimePipelineBridgeService } from './tep-runtime-pipeline.bridge';
import { TepRuntimeTriggerService } from './tep-runtime-trigger.service';

const roadHook: DecisionHook = {
  hookId: 'HOOK-ROAD-D3-1',
  targetRef: 'drive_leg_3_1',
  triggerType: 'ROAD_STATUS_CHANGE',
  sourceMetric: 'road.status',
  triggerCondition: {
    metric: 'road.status',
    operator: 'IN',
    value: ['CLOSED', 'LIMITED', 'RESTRICTED'],
  },
  leadTime: 'PT24H',
  impactScope: ['drive_leg_3_1'],
  defaultPolicy: 'BLOCK_UNTIL_RESOLVED',
  semanticKey: 'ROAD_SEGMENT_UNAVAILABLE',
};

function roadEvidence(): ResolveRoadStatusChangedResult {
  const event: RoadStatusChangedEvent = {
    eventId: 'evt_bridge_road_1',
    eventType: 'ROAD_STATUS_CHANGED',
    aggregateType: 'TRIP',
    aggregateId: 'trip_bridge_1',
    occurredAt: '2026-08-09T08:00:00.000Z',
    correlationId: 'corr_1',
    ontologyVersion: 'rfc001-0.1.0',
    payload: {
      roadId: 'F208',
      status: 'CLOSED',
      previousStatus: 'OPEN',
      sourceProvider: 'admin_injection',
    },
  };

  return {
    event,
    assertion: {
      assertionId: 'asrt_1',
      predicate: 'road.status',
      status: 'ACTIVE',
      subjectRef: { kind: 'ROUTE_SEGMENT', id: 'segment:F208' },
      payload: { status: 'CLOSED', roadId: 'F208' },
      observedAt: event.occurredAt,
      source: { provider: 'admin_injection', trustTier: 'OFFICIAL' },
    },
    snapshot: { snapshotId: 'ws_bridge_1', tripId: 'trip_bridge_1', capturedAt: event.occurredAt, assertions: [] },
    resolverVersion: 'test',
    hardClosure: true,
    supersededAssertionIds: [],
  };
}

describe('TepRuntimePipelineBridgeService', () => {
  it('maps road evidence to TEP hook observation and persists problem', async () => {
    const trigger = {
      processObservation: jest.fn(async () => ({
        matched: true,
        transitioned: true,
        hook: roadHook,
        problem: {
          problemId: 'problem_tep_hook',
          tripId: 'trip_bridge_1',
          planVersionId: 'plan_v1',
          type: 'RESOURCE_UNAVAILABLE',
          triggerEventId: 'evt_bridge_road_1',
          affectedEntityRefs: [],
          affectedPlanItemIds: [],
          worldStateSnapshotId: 'ws_bridge_1',
          detectedAt: new Date().toISOString(),
          urgency: 'HIGH',
          status: 'OPEN',
          semanticCapability: 'ROAD_SEGMENT_UNAVAILABLE',
        },
      })),
    } as unknown as TepRuntimeTriggerService;

    const planVersionStore = {
      getEffectivePlanVersionId: jest.fn(async () => 'plan_cert_301_v1'),
    } as unknown as import('../../guardian-decision-core/plan-version/plan-version.store').Rfc001PlanVersionStoreService;

    const prisma = {
      trip: { findUnique: jest.fn() },
    } as unknown as import('../../../prisma/prisma.service').PrismaService;

    const bridge = new TepRuntimePipelineBridgeService(trigger, planVersionStore, prisma);
    const result = await bridge.tryTriggerFromRoadEvidence({
      tripId: 'trip_bridge_1',
      evidence: roadEvidence(),
    });

    expect(result?.matched).toBe(true);
    expect(trigger.processObservation).toHaveBeenCalledWith(
      expect.objectContaining({
        tripId: 'trip_bridge_1',
        planVersionId: 'plan_cert_301_v1',
        triggerEventId: 'evt_bridge_road_1',
        previousObservation: { 'road.status': 'OPEN' },
        currentObservation: { 'road.status': 'CLOSED' },
      }),
    );
  });

  it('skips non-blocking road statuses', async () => {
    const trigger = { processObservation: jest.fn() } as unknown as TepRuntimeTriggerService;
    const planVersionStore = {
      getEffectivePlanVersionId: jest.fn(async () => 'plan_v1'),
    } as unknown as import('../../guardian-decision-core/plan-version/plan-version.store').Rfc001PlanVersionStoreService;
    const prisma = { trip: { findUnique: jest.fn() } } as unknown as import('../../../prisma/prisma.service').PrismaService;

    const bridge = new TepRuntimePipelineBridgeService(trigger, planVersionStore, prisma);
    const evidence = roadEvidence();
    evidence.event.payload.status = 'OPEN';
    evidence.assertion.payload.status = 'OPEN';

    const result = await bridge.tryTriggerFromRoadEvidence({
      tripId: 'trip_bridge_1',
      evidence,
    });

    expect(result).toBeNull();
    expect(trigger.processObservation).not.toHaveBeenCalled();
  });

  it('maps daylight schedule risk to TEP hook observation (IS-CERT-304)', async () => {
    const daylightHook: DecisionHook = {
      hookId: 'HOOK-DAYLIGHT-D1-1',
      targetRef: 'drive_leg_1_1',
      triggerType: 'WEATHER_THRESHOLD',
      sourceMetric: 'daylight.driveMinutesAfterCivilDusk',
      triggerCondition: {
        metric: 'daylight.driveMinutesAfterCivilDusk',
        operator: '>',
        value: 0,
        unit: 'minutes',
      },
      leadTime: 'PT6H',
      impactScope: ['drive_leg_1_1'],
      defaultPolicy: 'AUTO_SUGGEST_REPAIR',
      semanticKey: 'WEATHER_ROUTE_RISK',
    };

    const trigger = {
      processObservation: jest.fn(async () => ({
        matched: true,
        transitioned: true,
        hook: daylightHook,
        problem: {
          problemId: 'problem_tep_daylight',
          tripId: 'trip_bridge_daylight',
          planVersionId: 'plan_v1',
          type: 'SCHEDULE_RISK',
          triggerEventId: 'evt_daylight_1',
          affectedEntityRefs: [],
          affectedPlanItemIds: [],
          worldStateSnapshotId: 'ws_daylight_1',
          detectedAt: new Date().toISOString(),
          urgency: 'MEDIUM',
          status: 'OPEN',
          semanticCapability: 'WEATHER_ROUTE_RISK',
        },
      })),
    } as unknown as TepRuntimeTriggerService;

    const planVersionStore = {
      getEffectivePlanVersionId: jest.fn(async () => 'plan_cert_304_v1'),
    } as unknown as import('../../guardian-decision-core/plan-version/plan-version.store').Rfc001PlanVersionStoreService;

    const prisma = {
      trip: { findUnique: jest.fn() },
    } as unknown as import('../../../prisma/prisma.service').PrismaService;

    const bridge = new TepRuntimePipelineBridgeService(trigger, planVersionStore, prisma);
    const result = await bridge.tryTriggerFromDaylightScheduleRisk({
      tripId: 'trip_bridge_daylight',
      triggerEventId: 'evt_daylight_1',
      worldStateSnapshotId: 'ws_daylight_1',
      driveMinutesAfterCivilDusk: 30,
      previousDriveMinutesAfterCivilDusk: 0,
    });

    expect(result?.matched).toBe(true);
    expect(trigger.processObservation).toHaveBeenCalledWith(
      expect.objectContaining({
        previousObservation: {
          'daylight.driveMinutesAfterCivilDusk': 0,
          'daylight.activityMinutesAfterSunset': 0,
        },
        currentObservation: {
          'daylight.driveMinutesAfterCivilDusk': 30,
          'daylight.activityMinutesAfterSunset': 0,
        },
      }),
    );
  });
});

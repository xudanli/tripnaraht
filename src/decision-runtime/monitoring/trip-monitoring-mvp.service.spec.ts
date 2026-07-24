import { TripMonitoringMvpService } from './trip-monitoring-mvp.service';
import { RoadSegmentUnavailableRunnerService } from '../../trips/guardian-decision-core/execution/road-segment-unavailable-runner.service';
import type { PrismaService } from '../../prisma/prisma.service';
import type { WorldStateStoreService } from '../../trips/guardian-decision-core/evidence/world-state-store.service';
import type { TripContextSnapshotAssemblerService } from '../snapshot/trip-context-snapshot.assembler.service';
import { MONITORING_MVP_METADATA_KEY } from './trip-monitoring-mvp.types';

describe('TripMonitoringMvpService', () => {
  const tripId = 'trip_monitor_test';

  function buildService(opts: {
    assertions?: Array<{
      status: string;
      predicate: string;
      payload: Record<string, unknown>;
      source?: { provider?: string };
    }>;
    events?: unknown[];
    metadata?: Record<string, unknown>;
    roadRunner?: RoadSegmentUnavailableRunnerService;
  }) {
    const prisma = {
      trip: {
        findUnique: jest.fn(async () => ({
          metadata: opts.metadata ?? {},
        })),
        update: jest.fn(async ({ data }: { data: { metadata: object } }) => ({
          metadata: data.metadata,
        })),
      },
    } as unknown as PrismaService;

    const worldStore = {
      readStore: jest.fn(async () => ({
        assertions: opts.assertions ?? [],
        snapshots: [],
        events: opts.events ?? [],
      })),
    } as unknown as WorldStateStoreService;

    const snapshotAssembler = {
      resolveSnapshotRef: jest.fn(async () => ({
        snapshotId: 'snap_1',
        revision: 'cv1_no_effective_plan_0',
        constraintsVersion: 1,
      })),
    } as unknown as TripContextSnapshotAssemblerService;

    const service = new TripMonitoringMvpService(
      prisma,
      worldStore,
      snapshotAssembler,
      undefined,
      undefined,
      opts.roadRunner,
      undefined,
      opts.problemStore,
    );

    return { service, prisma, worldStore };
  }

  beforeEach(() => {
    delete process.env.DECISION_TRIGGER_GATEWAY_ENABLED;
  });

  it('returns pending items when no scan has run', async () => {
    const { service } = buildService({});
    const items = await service.listItems(tripId);
    expect(items).toHaveLength(5);
    expect(items.every((i) => i.status === 'PENDING')).toBe(true);
  });

  it('detects ACTIVE road.status CLOSED assertions as ALERT', async () => {
    const { service, prisma } = buildService({
      assertions: [
        {
          status: 'ACTIVE',
          predicate: 'road.status',
          payload: { roadId: 'F208', status: 'CLOSED' },
          source: { provider: 'admin_injection' },
        },
      ],
    });

    const result = await service.scanTrip(tripId);
    const road = result.items.find((i) => i.kind === 'ROAD_CLOSURE');
    expect(road?.status).toBe('ALERT');
    expect(road?.summary).toContain('F208');
    expect(result.activeAlertCount).toBeGreaterThanOrEqual(1);
    expect(result.dispatches.find((d) => d.kind === 'ROAD_CLOSURE')?.status).toBe('SKIPPED');

    expect(prisma.trip.update).toHaveBeenCalled();
    const updateArg = (prisma.trip.update as jest.Mock).mock.calls[0][0];
    const stored = (updateArg.data.metadata as Record<string, unknown>)[
      MONITORING_MVP_METADATA_KEY
    ] as { items: Array<{ kind: string; status: string }> };
    expect(stored.items.some((i) => i.kind === 'ROAD_CLOSURE' && i.status === 'ALERT')).toBe(true);
  });

  it('dispatches road runner when event + runner wired', async () => {
    const roadRunner = {
      runFullFromEvent: jest.fn(async () => ({
        problem: { problemId: 'problem_road_F208_test' },
        record: { decisionId: 'dec_1' },
      })),
    } as unknown as RoadSegmentUnavailableRunnerService;

    const { service } = buildService({
      assertions: [
        {
          status: 'ACTIVE',
          predicate: 'road.status',
          payload: { roadId: 'F208', status: 'CLOSED' },
          source: { provider: 'admin_injection' },
        },
      ],
      events: [
        {
          eventId: 'evt_road_1',
          eventType: 'ROAD_STATUS_CHANGED',
          aggregateType: 'TRIP',
          aggregateId: tripId,
          occurredAt: new Date().toISOString(),
          correlationId: 'corr_1',
          ontologyVersion: 'rfc001-0.1.0',
          payload: { roadId: 'F208', status: 'CLOSED', sourceProvider: 'admin_injection' },
        },
      ],
      roadRunner,
    });

    const result = await service.scanTrip(tripId);
    expect(roadRunner.runFullFromEvent).toHaveBeenCalled();
    expect(result.dispatches.find((d) => d.kind === 'ROAD_CLOSURE')?.status).toBe('COMPLETED');
    expect(result.items.find((i) => i.kind === 'ROAD_CLOSURE')?.problemId).toBe(
      'problem_road_F208_test',
    );
  });

  it('skips weather gateway dispatch when DECISION_TRIGGER_GATEWAY_ENABLED=0', async () => {
    process.env.DECISION_TRIGGER_GATEWAY_ENABLED = '0';
    const { service } = buildService({});
    const result = await service.scanTrip(tripId);
    const weatherDispatch = result.dispatches.find((d) => d.kind === 'WEATHER_HAZARD');
    expect(weatherDispatch?.status).toBe('SKIPPED');
  });
});

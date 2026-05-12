/**
 * HTTP E2E: POST /agent/rollback & /agent/rollback_to_revision (Omni-Reverse).
 */
import { INestApplication } from '@nestjs/common';
import { Test, TestingModule } from '@nestjs/testing';
import request from 'supertest';
import { AgentController } from './agent.controller';
import { AgentService } from './services/agent.service';
import { ItineraryRollbackService } from './services/itinerary-rollback.service';
import { AuditRecordService } from './services/audit-record.service';
import { PrismaService } from '../prisma/prisma.service';
import { HotspotRegistryService } from '../skills/world/services/hotspot-registry.service';
import type { ItineraryRollbackRequestDto } from './dto/itinerary-rollback.dto';

function buildRollbackPrismaMock() {
  const targetSnap = {
    days: [
      {
        items: [
          {
            id: 'a',
            start_time: '2026-06-01T10:00:00.000Z',
            status: 'PLANNED',
            metadata: {},
          },
        ],
      },
    ],
  };
  const headSnap = {
    days: [
      {
        items: [
          {
            id: 'a',
            start_time: '2026-06-01T12:00:00.000Z',
            status: 'OK',
            metadata: { resolution: { locked_by: {} } },
          },
        ],
      },
    ],
  };
  const target = {
    id: 'r-v2',
    tripId: 'trip-omni',
    userId: 'u1',
    snapshot: targetSnap,
    createdAt: new Date('2026-06-01T09:00:00.000Z'),
    kind: 'CONFIRMED',
    parentRevisionId: 'r-b',
    negotiationSessionId: 's1',
    alternativeId: 'POSTPONE_SCHEDULE',
    resolutionPatchSummary: 'POSTPONE',
    deltaCostUsd: 0,
    deltaTimeMinutes: 120,
    interruptedItems: [],
    resolutionType: 'POSTPONE_SCHEDULE',
  };
  const head = {
    id: 'r-v3',
    tripId: 'trip-omni',
    userId: 'u1',
    snapshot: headSnap,
    createdAt: new Date('2026-06-01T11:00:00.000Z'),
    kind: 'CONFIRMED',
    parentRevisionId: 'r-v2',
    negotiationSessionId: 's2',
    alternativeId: 'POSTPONE_SCHEDULE',
    resolutionPatchSummary: '+120',
    deltaCostUsd: 0,
    deltaTimeMinutes: 120,
    interruptedItems: [],
    resolutionType: 'POSTPONE_SCHEDULE',
  };

  let createData: any;
  let tripUpdateData: any;

  const tx = {
    itineraryRevision: {
      findUnique: jest.fn(async ({ where }: any) => {
        if (where?.id === 'r-v2') return target;
        return null;
      }),
      findFirst: jest.fn().mockResolvedValue(head),
      create: jest.fn(async ({ data }: any) => {
        createData = data;
        return { id: 'r-v4', ...data };
      }),
    },
    trip: {
      findUnique: jest.fn().mockResolvedValue({
        id: 'trip-omni',
        metadata: { negotiation_session_id: 'old', agent: { needs_confirmation: true } },
      }),
      update: jest.fn(async ({ data }: any) => {
        tripUpdateData = data;
        return { id: 'trip-omni', ...data };
      }),
    },
  };

  const prisma = {
    $transaction: jest.fn(async (fn: (t: typeof tx) => Promise<any>) => fn(tx)),
  };

  return { prisma, tx, getCreateData: () => createData, getTripUpdate: () => tripUpdateData };
}

describe('Agent rollback API (E2E)', () => {
  let app: INestApplication;
  let mock: ReturnType<typeof buildRollbackPrismaMock>;

  beforeAll(async () => {
    mock = buildRollbackPrismaMock();
    const audit = new AuditRecordService();
    const rollbackSvc = new ItineraryRollbackService(audit, mock.prisma as any as PrismaService);

    const agentStub: Pick<AgentService, 'rollbackItinerary'> = {
      rollbackItinerary: async (body: ItineraryRollbackRequestDto) => {
        const r = await rollbackSvc.rollbackToRevision(body.revision_id);
        return {
          itinerary: r.itinerary,
          new_revision_id: r.new_revision_id,
          trip_id: r.trip_id,
          rolled_back_from_revision_id: r.rolled_back_from_revision_id,
          target_revision_id: r.target_revision_id,
        };
      },
    };

    const moduleRef: TestingModule = await Test.createTestingModule({
      controllers: [AgentController],
      providers: [
        { provide: AgentService, useValue: agentStub },
        {
          provide: HotspotRegistryService,
          useValue: {
            listActivePairs: () => [],
            decideBucketMinutes: () => 5,
            markPolled: () => undefined,
            observeRequest: () => undefined,
            recordSnapshot: () => undefined,
          },
        },
      ],
    }).compile();

    app = moduleRef.createNestApplication();
    await app.init();
  });

  afterAll(async () => {
    if (app) await app.close();
  });

  const assertOmniReverse = (res: request.Response) => {
    expect(res.status).toBe(200);
    expect(res.body?.itinerary?.days?.[0]?.items?.[0]?.start_time).toBe('2026-06-01T10:00:00.000Z');
    expect(res.body?.itinerary?.days?.[0]?.items?.[0]?.status).toBe('PLANNED');
    expect(res.body?.new_revision_id).toBe('r-v4');
    expect(res.body?.rolled_back_from_revision_id).toBe('r-v3');
    expect(res.body?.target_revision_id).toBe('r-v2');
    const data = mock.getCreateData();
    expect(data?.kind).toBe('ROLLBACK');
    expect(data?.parentRevisionId).toBe('r-v3');
    expect(data?.deltaTimeMinutes).toBe(-120);
    expect(mock.getTripUpdate()?.status).toBe('PLANNING');
  };

  it('POST /agent/rollback: V3 → restore V2 snapshot + append ROLLBACK V4', async () => {
    const res = await request(app.getHttpServer())
      .post('/agent/rollback')
      .send({ revision_id: 'r-v2' });
    assertOmniReverse(res);
  });

  it('POST /agent/rollback_to_revision: same semantics', async () => {
    const res = await request(app.getHttpServer())
      .post('/agent/rollback_to_revision')
      .send({ revision_id: 'r-v2' });
    assertOmniReverse(res);
  });
});

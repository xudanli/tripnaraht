import { DecisionRecordStoreService } from '../../decision-semantics/persistence/decision-record.store';
import { Rfc001DecisionSemanticsProjectorService } from './rfc001-decision-semantics-projector.service';
import type { Rfc001DecisionRecord } from '../contracts/decision-record.types';
import type { PrismaService } from '../../../prisma/prisma.service';

function createMockPrisma() {
  const stores = new Map<string, Record<string, unknown>>();
  return {
    trip: {
      findUnique: jest.fn(async (args: { where: { id: string } }) => {
        const row = stores.get(args.where.id);
        if (!row) return null;
        return { metadata: row.metadata };
      }),
      update: jest.fn(async ({ where, data }: { where: { id: string }; data: { metadata?: unknown } }) => {
        const prev = stores.get(where.id) ?? {};
        stores.set(where.id, { ...prev, metadata: data.metadata ?? prev.metadata });
        return { metadata: data.metadata };
      }),
    },
    stores,
  };
}

const tripId = 'trip_proj';
const decisionId = 'dec_1';

function baseRecord(status: Rfc001DecisionRecord['recordStatus']): Rfc001DecisionRecord {
  return {
    decisionId,
    problemId: 'problem_1',
    workspaceId: 'ws_1',
    basePlanVersionId: 'plan_v17',
    worldStateSnapshotId: 'wss_1',
    preferenceSnapshotId: 'pref_1',
    consideredCandidateIds: ['cand_a', 'original'],
    rejectedCandidates: [],
    selectedCandidateId: 'cand_a',
    finalAction: 'REPLACE',
    reasonCodes: ['ROAD_CLOSED'],
    evidenceRefs: [],
    authorizationRequirement: {
      level: 'L2',
      requiresUserConfirmation: true,
    },
    ruleVersions: [],
    modelVersions: {},
    recordStatus: status,
    createdAt: '2026-06-30T10:00:00Z',
    decidedAt: '2026-06-30T10:05:00Z',
  };
}

describe('Rfc001DecisionSemanticsProjectorService', () => {
  const prevFlag = process.env.RFC001_V15_PROJECTION;

  afterEach(() => {
    if (prevFlag === undefined) delete process.env.RFC001_V15_PROJECTION;
    else process.env.RFC001_V15_PROJECTION = prevFlag;
  });

  it('PROJ-001: flag off → no metadata write', async () => {
    process.env.RFC001_V15_PROJECTION = '0';
    const mock = createMockPrisma();
    mock.stores.set(tripId, { metadata: { revision: 1 } });
    const prisma = mock as unknown as PrismaService;
    const store = new DecisionRecordStoreService(prisma);
    const projector = new Rfc001DecisionSemanticsProjectorService(store);

    const result = await projector.upsertFromRfcRecord({
      tripId,
      record: baseRecord('AUTHORIZED'),
    });

    expect(result).toBeUndefined();
    expect(mock.trip.update).not.toHaveBeenCalled();
  });

  it('PROJ-002: authorize projects APPROVED into decisionSemantics', async () => {
    process.env.RFC001_V15_PROJECTION = '1';
    const mock = createMockPrisma();
    mock.stores.set(tripId, { metadata: { revision: 1 } });
    const prisma = mock as unknown as PrismaService;
    const store = new DecisionRecordStoreService(prisma);
    const projector = new Rfc001DecisionSemanticsProjectorService(store);

    const projected = await projector.upsertFromRfcRecord({
      tripId,
      record: baseRecord('AUTHORIZED'),
    });

    expect(projected?.status).toBe('APPROVED');
    expect(projected?.reasons.some((r) => r.code === 'RFC001_LEDGER_SOURCE')).toBe(true);

    const records = await store.listRecords(tripId);
    expect(records).toHaveLength(1);
    expect(records[0].id).toBe(decisionId);
  });

  it('PROJ-003: execute upsert includes actualMutation and marks problem resolved', async () => {
    process.env.RFC001_V15_PROJECTION = '1';
    const mock = createMockPrisma();
    mock.stores.set(tripId, { metadata: { revision: 1 } });
    const prisma = mock as unknown as PrismaService;
    const store = new DecisionRecordStoreService(prisma);
    const projector = new Rfc001DecisionSemanticsProjectorService(store);

    await projector.upsertFromRfcRecord({
      tripId,
      record: {
        ...baseRecord('EFFECTIVE'),
        effectivePlanVersionId: 'plan_v18',
      },
      actualMutation: {
        mutationId: 'mut_1',
        tripId,
        operations: [
          {
            operation: 'UPDATE',
            entityType: 'JOURNEY_LEG',
            entityId: 'seg_1',
            after: { bypassRoadId: 'F26' },
            semanticEffects: [],
          },
        ],
        createdAt: '2026-06-30T10:10:00Z',
        createdBy: 'RFC001_DECISION_CORE',
        sourceDecisionId: decisionId,
        versionBefore: 'plan_v17',
      },
      semanticKey: 'ROAD_SEGMENT_UNAVAILABLE:evt_1',
      markProblemResolved: true,
    });

    const record = await store.getRecord(tripId, decisionId);
    expect(record?.status).toBe('EXECUTED');
    expect(record?.actualMutation?.operations).toHaveLength(1);

    const resolutions = await store.listProblemResolutions(tripId);
    expect(resolutions).toHaveLength(1);
    expect(resolutions[0].resolution).toBe('DECISION_EXECUTED');
  });
});

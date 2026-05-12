import { AuditRecordService } from './audit-record.service';
import { ItineraryRollbackService } from './itinerary-rollback.service';

describe('ItineraryRollbackService (Omni-Reverse)', () => {
  it('appends ROLLBACK revision: parent=head, snapshot=cleaned target, negative delta_time', async () => {
    const targetSnap = {
      days: [{ items: [{ id: 'a', start_time: '2026-06-01T10:00:00.000Z', status: 'PLANNED', metadata: { resolution: { x: 1 } } }] }],
    };
    const headSnap = {
      days: [{ items: [{ id: 'a', start_time: '2026-06-01T12:00:00.000Z', status: 'OK', metadata: { resolution: { locked_by: {} } } }] }],
    };
    const target = {
      id: 'r-v2',
      tripId: 'trip-1',
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
      tripId: 'trip-1',
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
    const prisma = {
      $transaction: jest.fn(async (fn: (tx: any) => Promise<any>) => {
        const tx = {
          itineraryRevision: {
            findUnique: jest.fn().mockResolvedValue(target),
            findFirst: jest.fn().mockResolvedValue(head),
            create: jest.fn().mockImplementation(async ({ data }: any) => {
              createData = data;
              return { id: 'r-v4', ...data };
            }),
          },
          trip: {
            findUnique: jest.fn().mockResolvedValue({
              id: 'trip-1',
              metadata: { negotiation_session_id: 's-x', agent: { needs_confirmation: true } },
            }),
            update: jest.fn().mockImplementation(async ({ data }: any) => {
              tripUpdateData = data;
              return { id: 'trip-1', ...data };
            }),
          },
        };
        return fn(tx);
      }),
    } as any;

    const svc = new ItineraryRollbackService(new AuditRecordService(), prisma);
    const out = await svc.rollbackToRevision('r-v2');

    expect(out.new_revision_id).toBe('r-v4');
    expect(out.rolled_back_from_revision_id).toBe('r-v3');
    expect(out.target_revision_id).toBe('r-v2');
    expect(createData.kind).toBe('ROLLBACK');
    expect(createData.parentRevisionId).toBe('r-v3');
    expect(createData.resolutionType).toBe('ROLLBACK');
    expect(createData.alternativeId).toBe('POSTPONE_SCHEDULE');
    expect(createData.deltaTimeMinutes).toBe(-120);
    expect(out.itinerary.days[0].items[0].status).toBe('PLANNED');
    expect(out.itinerary.days[0].items[0].metadata).toBeUndefined();
    expect(tripUpdateData.status).toBe('PLANNING');
    expect(tripUpdateData.metadata).toEqual({});
  });

  it('rollback() delegates to rollbackToRevision', async () => {
    const svc = new ItineraryRollbackService(new AuditRecordService(), {} as any);
    const spy = jest.spyOn(svc, 'rollbackToRevision').mockResolvedValue({} as any);
    await svc.rollback('rev-1');
    expect(spy).toHaveBeenCalledWith('rev-1');
    spy.mockRestore();
  });
});

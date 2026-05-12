import { AuditRecordService } from './audit-record.service';
import { ItineraryVersionService } from './itinerary-version.service';

describe('ItineraryVersionService', () => {
  const audit = new AuditRecordService();

  it('first confirm: creates BASELINE then CONFIRMED with parent chain + audit', async () => {
    const creates: any[] = [];
    const prisma = {
      itineraryRevision: {
        findFirst: jest.fn().mockResolvedValue(null),
        create: jest.fn().mockImplementation(async ({ data }: any) => {
          const id = data.kind === 'BASELINE' ? 'rev-baseline-1' : 'rev-confirmed-1';
          creates.push({ ...data, id });
          return { id, ...data };
        }),
      },
    } as any;

    const svc = new ItineraryVersionService(audit, prisma);
    const out = await svc.persistSuccessfulNegotiationConfirm({
      tripId: 'trip-1',
      userId: 'u1',
      sessionId: 'sess-1',
      alternativeId: 'UPGRADE_TO_DRIVE',
      resolutionPatchSummary: 'UPGRADE_TO_DRIVE: x',
      preItinerary: { days: [] },
      postItinerary: { days: [{ items: [] }] },
      negotiationPayload: { alternatives: [{ id: 'UPGRADE_TO_DRIVE', cost_delta_usd: 50 }] },
    });

    expect(out).not.toBeNull();
    expect(out!.baseline_revision_id).toBe('rev-baseline-1');
    expect(out!.confirmed_revision_id).toBe('rev-confirmed-1');
    expect(out!.parent_revision_id).toBe('rev-baseline-1');
    expect(out!.audit.delta_cost_usd).toBe(50);
    expect(prisma.itineraryRevision.create).toHaveBeenCalledTimes(2);
    const confirmedCall = (prisma.itineraryRevision.create as jest.Mock).mock.calls.find((c) => c[0].data.kind === 'CONFIRMED');
    expect(confirmedCall[0].data.deltaCostUsd).toBe(50);
    expect(confirmedCall[0].data.resolutionType).toBe('UPGRADE_TO_DRIVE');
  });

  it('subsequent confirm: only CONFIRMED, parent = latest; audit uses parent snapshot', async () => {
    const prisma = {
      itineraryRevision: {
        findFirst: jest.fn().mockResolvedValue({
          id: 'prev-head',
          kind: 'CONFIRMED',
          snapshot: { days: [{ items: [{ id: 'x', start_time: '2026-06-01T10:00:00.000Z' }] }] },
        }),
        create: jest.fn().mockResolvedValue({ id: 'rev-confirmed-2' }),
      },
    } as any;

    const svc = new ItineraryVersionService(audit, prisma);
    const out = await svc.persistSuccessfulNegotiationConfirm({
      tripId: 'trip-1',
      userId: 'u1',
      sessionId: 'sess-2',
      alternativeId: 'POSTPONE_SCHEDULE',
      resolutionPatchSummary: 'POSTPONE: +10',
      preItinerary: {},
      postItinerary: {
        days: [{ items: [{ id: 'x', start_time: '2026-06-01T10:10:00.000Z' }] }],
      },
      negotiationPayload: { alternatives: [{ id: 'POSTPONE_SCHEDULE', time_delta_minutes: 10, cost_delta_usd: 0 }] },
    });

    expect(out!.baseline_revision_id).toBeNull();
    expect(out!.confirmed_revision_id).toBe('rev-confirmed-2');
    expect(out!.parent_revision_id).toBe('prev-head');
    expect(out!.audit.delta_time_minutes).toBe(10);
    expect(prisma.itineraryRevision.create).toHaveBeenCalledTimes(1);
  });

  it('Narrative integrity: POSTPONE 120 minutes is written to CONFIRMED row (deltaTimeMinutes)', async () => {
    let confirmedData: any;
    const prisma = {
      itineraryRevision: {
        findFirst: jest.fn().mockResolvedValue({
          id: 'prev',
          kind: 'CONFIRMED',
          snapshot: { days: [{ items: [{ id: 'a', start_time: '2026-06-01T10:00:00.000Z', end_time: '2026-06-01T11:00:00.000Z' }] }] },
        }),
        create: jest.fn().mockImplementation(async ({ data }: any) => {
          if (data.kind !== 'BASELINE') confirmedData = data;
          return { id: 'rev-narrative', ...data };
        }),
      },
    } as any;

    const svc = new ItineraryVersionService(audit, prisma);
    const out = await svc.persistSuccessfulNegotiationConfirm({
      tripId: 'trip-narrative',
      userId: 'u1',
      sessionId: 'sess-n',
      alternativeId: 'POSTPONE_SCHEDULE',
      resolutionPatchSummary: 'POSTPONE_SCHEDULE: +120min applied',
      preItinerary: {},
      postItinerary: {
        days: [{ items: [{ id: 'a', start_time: '2026-06-01T12:00:00.000Z', end_time: '2026-06-01T13:00:00.000Z' }] }],
      },
      negotiationPayload: { alternatives: [{ id: 'POSTPONE_SCHEDULE', time_delta_minutes: 120, cost_delta_usd: 0 }] },
    });

    expect(out!.audit.delta_time_minutes).toBe(120);
    expect(confirmedData.deltaTimeMinutes).toBe(120);
    expect(confirmedData.resolutionPatchSummary).toContain('POSTPONE');
    expect(confirmedData.resolutionType).toBe('POSTPONE_SCHEDULE');
  });

  it('composeResolutionPatchSummary merges counselor narrative + reasoning tags', () => {
    const svc = new ItineraryVersionService(audit, undefined);
    const s = svc.composeResolutionPatchSummary({
      mechanicalSummary: 'POSTPONE_SCHEDULE: +10min applied',
      alternativeId: 'POSTPONE_SCHEDULE',
      negotiationPayload: {
        recommendation_summary: '我们更推荐打车升级。',
        alternatives: [{ id: 'POSTPONE_SCHEDULE', reasoning_tags: ['ROLLBACK_MEMORY', 'REAL_TIME_RISK_WARNING'] }],
      },
    });
    expect(s).toContain('POSTPONE_SCHEDULE:');
    expect(s).toContain('NARRATIVE:');
    expect(s).toContain('我们更推荐');
    expect(s).toContain('REASONING_TAGS:');
    expect(s).toContain('REAL_TIME_RISK_WARNING');
    expect(s).toContain('ROLLBACK_MEMORY');
  });

  it('applyRevisionMetadataToItinerary merges revision_id onto resolution', () => {
    const svc = new ItineraryVersionService(audit, undefined);
    const it = {
      days: [
        {
          items: [
            {
              id: 'seg1',
              metadata: {
                resolution: {
                  locked_by: { session_id: 's', alternative_id: 'UPGRADE_TO_DRIVE', resolved_at: 't' },
                  evidence_refs: [],
                },
              },
            },
          ],
        },
      ],
    };
    svc.applyRevisionMetadataToItinerary(it, { revision_id: 'R99', parent_revision_id: 'R98' });
    expect(it.days[0].items[0].metadata.resolution.revision_id).toBe('R99');
    expect(it.days[0].items[0].metadata.resolution.parent_revision_id).toBe('R98');
  });
});

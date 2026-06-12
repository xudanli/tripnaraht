import { describe, expect, it, jest } from '@jest/globals';
import { AlignmentTier3PersistenceService } from './alignment-tier3-persistence.service';

describe('AlignmentTier3PersistenceService', () => {
  it('captureAndPersist appends tuple to trip metadata', async () => {
    let storedMeta: Record<string, unknown> = {};
    const prisma = {
      $transaction: async (fn: (tx: unknown) => Promise<unknown>) =>
        fn({
          trip: {
            findUnique: async () => ({ metadata: storedMeta }),
            update: async ({ data }: { data: { metadata: Record<string, unknown> } }) => {
              storedMeta = data.metadata;
            },
          },
        }),
    };

    const svc = new AlignmentTier3PersistenceService(prisma as never);
    const parent = {
      days: [{ date: '2026-07-01', items: [{ id: 'x', type: 'POI' }] }],
    };
    const child = { days: [{ date: '2026-07-01', items: [] }] };

    const out = await svc.captureAndPersist({
      tripId: 'trip-abc',
      parentSnapshot: parent,
      childSnapshot: child,
      audit: {
        delta_cost_usd: null,
        delta_time_minutes: null,
        interrupted_items: [],
        resolution_type: 'USER_EDIT',
      },
      revisionId: 'rev-1',
      source: 'execution-closure',
    });

    expect(out.ok).toBe(true);
    expect(out.tupleId).toMatch(/^at3-/);
    expect(storedMeta.alignmentTier3V1).toBeDefined();
    expect(storedMeta.alignmentTier3Revision).toBe(1);
  });

  it('scheduleCapture does not throw when prisma missing', () => {
    const svc = new AlignmentTier3PersistenceService(undefined);
    expect(() =>
      svc.scheduleCapture({
        tripId: 't',
        parentSnapshot: {},
        childSnapshot: {},
        audit: {
          delta_cost_usd: null,
          delta_time_minutes: null,
          interrupted_items: [],
          resolution_type: 'UNKNOWN',
        },
      }),
    ).not.toThrow();
  });
});

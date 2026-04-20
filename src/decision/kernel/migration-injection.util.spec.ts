import { applyPendingMigrationsToPlanDraft } from './migration-injection.util';
import type { ItineraryLike } from './interfaces/phase-executor.interface';

describe('applyPendingMigrationsToPlanDraft', () => {
  it('moves matched node from fromDay to toDay and records applied ids', () => {
    const itin: ItineraryLike = {
      request_id: 'r1',
      days: [
        {
          date: '2026-12-15',
          items: [
            { id: 'a', type: 'POI', location_ref: { place_id: 'p-a', name: 'A' }, metadata: {} },
            { id: 'b', type: 'POI', location_ref: { place_id: 'anchor-x', name: 'B' }, metadata: {} },
          ],
        },
        { date: '2026-12-16', items: [{ id: 'c', type: 'POI', location_ref: { place_id: 'p-c', name: 'C' }, metadata: {} }] },
      ],
    };
    const m = [
      {
        id: 'm1',
        kind: 'MIGRATION_REQUEST' as const,
        fromDayDate: '2026-12-15',
        toDayDate: '2026-12-16',
        nodeId: 'anchor-x',
        reason: 'SUNSET_ANCHOR_NOT_ASSIGNABLE_ON_DAY' as const,
        createdAt: new Date().toISOString(),
      },
    ];
    const { itinerary, appliedIds } = applyPendingMigrationsToPlanDraft(itin, m);
    expect(appliedIds).toEqual(['m1']);
    const d0 = (itinerary.days as any[])[0].items as any[];
    const d1 = (itinerary.days as any[])[1].items as any[];
    expect(d0.map((x) => x.id)).toEqual(['a']);
    expect(d1.map((x) => x.id)).toEqual(['c', 'b']);
    expect(d1[1].metadata.migrationId).toBe('m1');
  });
});

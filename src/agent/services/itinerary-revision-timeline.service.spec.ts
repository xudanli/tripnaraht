import { RevisionNarratorService } from './revision-narrator.service';
import { ItineraryRevisionTimelineService } from './itinerary-revision-timeline.service';

describe('ItineraryRevisionTimelineService (Storytelling)', () => {
  it('returns 3 nodes (BASELINE + 2 CONFIRMED) in order; third narrative reflects 120min postpone', async () => {
    const rows = [
      {
        id: 'r-b',
        tripId: 'trip-story',
        userId: 'u1',
        parentRevisionId: null,
        negotiationSessionId: 's1',
        alternativeId: null,
        resolutionPatchSummary: 'BASELINE',
        snapshot: {},
        kind: 'BASELINE',
        createdAt: new Date('2026-06-01T10:00:00.000Z'),
        deltaCostUsd: null,
        deltaTimeMinutes: null,
        interruptedItems: null,
        resolutionType: null,
      },
      {
        id: 'r-c1',
        tripId: 'trip-story',
        userId: 'u1',
        parentRevisionId: 'r-b',
        negotiationSessionId: 's1',
        alternativeId: 'UPGRADE_TO_DRIVE',
        resolutionPatchSummary: 'UPGRADE_TO_DRIVE: seg -> DRIVE',
        snapshot: {},
        kind: 'CONFIRMED',
        createdAt: new Date('2026-06-01T10:05:00.000Z'),
        deltaCostUsd: 50,
        deltaTimeMinutes: null,
        interruptedItems: [],
        resolutionType: 'UPGRADE_TO_DRIVE',
      },
      {
        id: 'r-c2',
        tripId: 'trip-story',
        userId: 'u1',
        parentRevisionId: 'r-c1',
        negotiationSessionId: 's2',
        alternativeId: 'POSTPONE_SCHEDULE',
        resolutionPatchSummary: 'POSTPONE_SCHEDULE: +120min applied',
        snapshot: { days: [{ items: [{ id: 'a', name: '国立博物馆' }] }] },
        kind: 'CONFIRMED',
        createdAt: new Date('2026-06-01T10:10:00.000Z'),
        deltaCostUsd: 0,
        deltaTimeMinutes: 120,
        interruptedItems: [{ item_id: 'a', field: 'start_time' }],
        resolutionType: 'POSTPONE_SCHEDULE',
      },
    ];

    const prisma = {
      itineraryRevision: {
        findMany: jest.fn().mockResolvedValue(rows),
      },
    } as any;

    const timeline = new ItineraryRevisionTimelineService(new RevisionNarratorService(), prisma);
    const out = await timeline.listTimelineForTrip('trip-story');

    expect(out).toHaveLength(3);
    expect(out[0].interrupted_items).toEqual([]);
    expect(out[1].interrupted_items).toEqual([]);
    expect(out[0].kind).toBe('BASELINE');
    expect(out[1].resolution_type).toBe('UPGRADE_TO_DRIVE');
    expect(out[2].delta_time_minutes).toBe(120);
    expect(out[2].interrupted_items).toEqual([
      { item_id: 'a', field: 'start_time', display_name: '国立博物馆' },
    ]);
    expect(out[2].impact_summary).toContain('国立博物馆');
    expect(out[2].narrative).toContain('推迟');
    expect(out[2].narrative).toContain('120');
    expect(out[2].rollback_to_revision_id).toBe('r-c1');
  });

  it('ROLLBACK node: impact_summary uses restore wording and enriched interrupted_items', async () => {
    const snap = {
      days: [{ items: [{ id: 'p1', name: '大英博物馆' }] }],
    };
    const rows = [
      {
        id: 'r-rb',
        tripId: 'trip-rb',
        userId: 'u1',
        parentRevisionId: 'r-prev',
        negotiationSessionId: null,
        alternativeId: 'POSTPONE_SCHEDULE',
        resolutionPatchSummary: 'ROLLBACK: restore',
        snapshot: snap,
        kind: 'ROLLBACK',
        createdAt: new Date('2026-06-01T12:00:00.000Z'),
        deltaCostUsd: null,
        deltaTimeMinutes: -60,
        interruptedItems: [{ item_id: 'p1', field: 'start_time' }],
        resolutionType: 'ROLLBACK',
      },
    ];
    const prisma = { itineraryRevision: { findMany: jest.fn().mockResolvedValue(rows) } } as any;
    const timeline = new ItineraryRevisionTimelineService(new RevisionNarratorService(), prisma);
    const out = await timeline.listTimelineForTrip('trip-rb');
    expect(out).toHaveLength(1);
    expect(out[0].impact_summary).toContain('此次回滚恢复了');
    expect(out[0].impact_summary).toContain('[大英博物馆]');
    expect(out[0].interrupted_items?.[0]).toMatchObject({
      item_id: 'p1',
      field: 'start_time',
      display_name: '大英博物馆',
    });
  });
});

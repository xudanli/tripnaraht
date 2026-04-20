import { solveDayTimeline } from './itinerary-timeline.util';
import type { ItineraryDay, ItineraryItem } from '../../agent/interfaces/trip-plan.interface';

describe('solveDayTimeline feasibility', () => {
  const dayDate = '2026-04-21';

  function item(
    id: string,
    type: ItineraryItem['type'],
    start: string,
    end: string | undefined,
    dur: number,
  ): ItineraryItem {
    return {
      id,
      type,
      start_window: `${dayDate}T${start}:00.000Z`,
      end_window: end ? `${dayDate}T${end}:00.000Z` : '',
      metadata: { duration_minutes: dur },
      location_ref: { name: id, coordinates: { lat: 0, lng: 0 } },
      evidence_refs: [],
      verified: false,
    };
  }

  it('returns SOLVED when adjacent windows fit ETA', () => {
    const day: ItineraryDay = {
      date: dayDate,
      items: [item('a', 'POI', '08:00', '09:30', 90), item('b', 'POI', '10:00', '18:00', 60)],
    };
    const r = solveDayTimeline({ day, adjacentEtaMin: [15] });
    expect(r.ok).toBe(true);
    expect(r.feasibility.status).toBe('SOLVED');
  });

  it('dryRun suppresses explainLogs while preserving feasibility', () => {
    const day: ItineraryDay = {
      date: dayDate,
      items: [item('a', 'POI', '08:00', undefined, 60), item('b', 'POI', '09:00', '10:00', 90)],
    };
    const r = solveDayTimeline({ day, adjacentEtaMin: [0], dryRun: true });
    expect(r.ok).toBe(true);
    expect(r.feasibility.status).toBe('COMPRESSED');
    expect(r.explainLogs).toEqual([]);
  });

  it('returns COMPRESSED when B planned duration exceeds slot before end_window', () => {
    // 到达不违约：但 B 的 metadata 时长 > (end - arrival)，触发对 B 的软压缩
    const day: ItineraryDay = {
      date: dayDate,
      items: [item('a', 'POI', '08:00', undefined, 60), item('b', 'POI', '09:00', '10:00', 90)],
    };
    const r = solveDayTimeline({ day, adjacentEtaMin: [0] });
    expect(r.ok).toBe(true);
    expect(r.feasibility.status).toBe('COMPRESSED');
    expect(r.notes?.some((n) => n.startsWith('compressed:b:'))).toBe(true);
    expect(r.explainLogs.some((l) => l.includes('压缩'))).toBe(true);
  });

  it('caps outdoor nature POI by sunset+twilight and flags SUNSET on LIMIT', () => {
    const bNature: ItineraryItem = {
      ...item('b', 'POI', '12:00', '20:00', 60),
      metadata: { duration_minutes: 60, category: 'waterfall' },
    };
    const day: ItineraryDay = {
      date: dayDate,
      items: [item('a', 'POI', '12:00', '14:00', 120), bNature],
    };
    /** 民用暮光结束 12:30Z：一次压缩 A 后仍无法在可视窗口前抵达 B */
    const r = solveDayTimeline({
      day,
      adjacentEtaMin: [0],
      environment: { sunsetByDate: { [dayDate]: `${dayDate}T12:00:00.000Z` }, twilightBufferMin: 30 },
    });
    expect(r.ok).toBe(true);
    expect(r.feasibility.status).toBe('LIMIT_REACHED');
    expect(r.feasibility.violation).toBe('SUNSET');
    expect(r.feasibility.suggestedEscalation).toBe('REORDER_OUTDOOR');
    expect(r.notes?.some((n) => n.includes('sunset'))).toBe(true);
  });

  it('returns LIMIT_REACHED when A is at min_duration and arrival still after B end', () => {
    process.env.DECISION_REPAIR_MIN_POI_DURATION_MIN = '45';
    const day: ItineraryDay = {
      date: dayDate,
      items: [item('a', 'POI', '08:00', '09:30', 90), item('b', 'POI', '08:30', '09:05', 60)],
    };
    const r = solveDayTimeline({ day, adjacentEtaMin: [120] });
    expect(r.ok).toBe(true);
    expect(r.feasibility.status).toBe('LIMIT_REACHED');
    expect(r.feasibility.bottleneckNodeId).toBe('b');
    expect(r.feasibility.suggestedEscalation).toBe('DELETE_NODE');
    delete process.env.DECISION_REPAIR_MIN_POI_DURATION_MIN;
  });
});

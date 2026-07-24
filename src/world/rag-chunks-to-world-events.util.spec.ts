import { worldEventsFromRagChunks } from './rag-chunks-to-world-events.util';

describe('worldEventsFromRagChunks', () => {
  it('emits ROAD events for F-road structured chunks', () => {
    const events = worldEventsFromRagChunks([
      {
        id: 'c1',
        chunkId: 'c1',
        content: 'F206 is CLOSED due to storm',
        category: 'ROAD_STATUS',
        metadata: {
          structured_data: { f_road_required: { required: true, roads: ['F206'] } },
        },
      } as any,
    ]);
    expect(events.some((e) => e.kind === 'ROAD' && e.roadId === 'F206')).toBe(true);
    const road = events.find((e) => e.kind === 'ROAD') as any;
    expect(road.status).toMatch(/CLOSED/i);
  });

  it('emits WEATHER HARD for storm risk chunks', () => {
    const events = worldEventsFromRagChunks(
      [
        {
          id: 'c2',
          category: 'RISK_INFO',
          content: 'BLIZZARD warning for south coast',
          metadata: { date: '2026-06-02' },
        } as any,
      ],
      { tripDates: ['2026-06-01'] },
    );
    expect(events.some((e) => e.kind === 'WEATHER' && e.violation === 'HARD')).toBe(true);
  });
});

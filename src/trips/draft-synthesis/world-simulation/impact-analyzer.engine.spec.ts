import { analyzeWorldEventImpact } from './impact-analyzer.engine';
import type { WorldEvent } from './world-event.types';
import type { ExtractedPlanSlot } from './plan-slot-extraction';

describe('analyzeWorldEventImpact', () => {
  const slots: ExtractedPlanSlot[] = [
    { day: 1, slot: 'morning', placeId: 10 },
    { day: 1, slot: 'afternoon', placeId: 20, riskTags: ['weather_sensitive'] },
    { day: 2, slot: 'lunch', placeId: 30 },
  ];

  it('marks slots for closed POI', () => {
    const ev: WorldEvent = {
      type: 'POI_CLOSED',
      timestamp: Date.now(),
      payload: { placeId: 20 },
    };
    const r = analyzeWorldEventImpact(ev, { planSlots: slots, totalDays: 3 });
    expect(r.affectedSlots.map((s) => `${s.day}:${s.slot}`)).toContain('1:afternoon');
    expect(r.impactType).toBe('high');
  });

  it('weather targets risk-tagged outdoor slots', () => {
    const ev: WorldEvent = {
      type: 'WEATHER_CHANGE',
      timestamp: Date.now(),
      payload: { condition: 'rain', days: [1] },
    };
    const r = analyzeWorldEventImpact(ev, { planSlots: slots, totalDays: 3 });
    expect(r.affectedSlots.some((s) => s.slot === 'afternoon' && s.day === 1)).toBe(true);
  });
});

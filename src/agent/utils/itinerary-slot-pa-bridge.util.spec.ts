import { paSuggestedDaysToSlotCandidates, shouldPreferPaSlotCandidates } from './itinerary-slot-pa-bridge.util';
import type { ItinerarySlotPlacementGapResult } from '../assistants/trip-planner/interfaces/itinerary-slot-placement.interface';

describe('itinerary-slot-pa-bridge.util', () => {
  const pa: ItinerarySlotPlacementGapResult = {
    isPlacementRequested: true,
    confidence: 0.82,
    analysisPath: ['test'],
    activityAnchors: ['观鲸'],
    temporalHints: [],
    suggestedDays: [
      {
        dayNumber: 3,
        dateYmd: '2026-07-12',
        reasonZh: '当日经过米湖 → 阿克雷里，胡萨维克顺路',
        confidence: 0.82,
        sources: ['GEOGRAPHIC_PROXIMITY'],
        labelHint: '米湖 → 阿克雷里方向',
      },
    ],
  };

  it('converts PA days to slot candidates with system recommend prefix', () => {
    const c = paSuggestedDaysToSlotCandidates(pa);
    expect(c[0].label).toMatch(/D3/);
    expect(c[0].reason_zh).toMatch(/系统推荐/);
  });

  it('shouldPreferPaSlotCandidates respects confidence threshold', () => {
    expect(shouldPreferPaSlotCandidates(pa)).toBe(true);
    expect(shouldPreferPaSlotCandidates({ ...pa, confidence: 0.3, suggestedDays: [] })).toBe(false);
    expect(shouldPreferPaSlotCandidates({ ...pa, suggestedDays: [] })).toBe(false);
  });

  it('surfaces tight-schedule note instead of generic reason', () => {
    const tightPa: ItinerarySlotPlacementGapResult = {
      ...pa,
      suggestedDays: [
        {
          ...pa.suggestedDays[0],
          scheduleTight: true,
          tightScheduleNoteZh: '地理顺路，但当天已有冰川徒步等安排，行程较紧凑',
          hasFreeTimeGap: false,
        },
      ],
    };
    const c = paSuggestedDaysToSlotCandidates(tightPa);
    expect(c[0].reason_zh).toMatch(/紧凑/);
    expect(c[0].reason_zh).not.toMatch(/系统推荐：当日经过/);
    expect(c[0].schedule_tight).toBe(true);
  });
});

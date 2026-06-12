import type { ItineraryDay } from '../interfaces/trip-plan.interface';
import { buildLegEvidenceCards, mergeLegEvidenceIntoNarration } from './narrate-leg-evidence.util';

const sampleDay: ItineraryDay = {
  date: '2026-09-01',
  items: [
    {
      id: 'a',
      type: 'POI',
      start_window: '09:00',
      end_window: '11:00',
      location_ref: { name: '浅草寺', coordinates: { lat: 35.7148, lng: 139.7967 } },
      evidence_refs: [],
      verified: true,
      verification_status: 'VERIFIED',
    },
    {
      id: 'b',
      type: 'POI',
      start_window: '14:00',
      end_window: '16:00',
      location_ref: {
        name: '上野公园',
        coordinates: { lat: 35.7156, lng: 139.7745 },
      },
      metadata: { opening_hours: '05:00-23:00' },
      evidence_refs: [],
      verified: true,
      verification_status: 'VERIFIED',
    },
  ],
};

describe('narrate-leg-evidence.util', () => {
  it('buildLegEvidenceCards 生成相邻 POI 路段摘要', () => {
    const cards = buildLegEvidenceCards({ request_id: 'r1', days: [sampleDay] });
    expect(cards.length).toBeGreaterThanOrEqual(1);
    expect(cards[0].from_label).toBe('浅草寺');
    expect(cards[0].to_label).toBe('上野公园');
    expect(cards[0].distance_meters).toBeGreaterThan(0);
    expect(cards[0].summary_zh).toContain('步行');
  });

  it('带长辈时长距离路段产生 warn 提示', () => {
    const cards = buildLegEvidenceCards(
      { request_id: 'r1', days: [sampleDay] },
      { hasElderly: true },
    );
    const warn = cards.find((c) => c.severity === 'warn');
    expect(warn).toBeDefined();
    expect(warn?.pitfall_tips_zh?.some((t) => t.includes('长辈'))).toBe(true);
  });

  it('mergeLegEvidenceIntoNarration 注入 tips 与 leg_evidence_cards', () => {
    const out = mergeLegEvidenceIntoNarration(
      { user_friendly_summary: 'ok', day_by_day_narrative: [], highlights: [], tips: [] },
      { request_id: 'r1', days: [sampleDay] },
      {
        trip_plan_request: { party: { has_elderly: true } },
      } as any,
    );
    expect(out.leg_evidence_cards?.length).toBeGreaterThan(0);
    expect(out.tips?.some((t) => t.includes('[路段提示]'))).toBe(true);
  });
});

import type { ItineraryDay } from '../interfaces/trip-plan.interface';
import {
  buildHeuristicPoiPitfalls,
  buildPoiPitfallCards,
  extractPitfallLinesFromChunk,
  mergePoiPitfallIntoNarration,
  POI_PITFALL_SCHEMA,
} from './poi-pitfall-insight.util';

const museumDay: ItineraryDay = {
  date: '2026-09-01',
  items: [
    {
      id: 'm1',
      type: 'POI',
      location_ref: { name: '东京国立博物馆', place_id: 'ChIJ_museum' },
      notes: '主入口排队较长，建议从侧门团体入口进入',
      evidence_refs: [],
      verified: true,
      verification_status: 'VERIFIED',
    },
  ],
};

describe('poi-pitfall-insight.util', () => {
  it('buildHeuristicPoiPitfalls 对博物馆生成预约/入口提示', () => {
    const tips = buildHeuristicPoiPitfalls(museumDay.items[0]);
    expect(tips.some((t) => t.includes('预约') || t.includes('侧门'))).toBe(true);
  });

  it('extractPitfallLinesFromChunk 抽取含 POI 名的避坑句', () => {
    const chunk =
      '东京国立博物馆主入口高峰排队可达 40 分钟。建议官网预约时段票。侧门团体入口人流较少。';
    const lines = extractPitfallLinesFromChunk(chunk, '东京国立博物馆');
    expect(lines.length).toBeGreaterThan(0);
    expect(lines[0]).toMatch(/排队|预约|入口/);
  });

  it('buildPoiPitfallCards 合并启发式与 RAG 提示', () => {
    const cards = buildPoiPitfallCards(
      { request_id: 'r1', days: [museumDay] },
      { m1: ['RAG：闭馆前 1 小时停止入场，请预留排队时间'] },
    );
    expect(cards).toHaveLength(1);
    expect(cards[0].schema).toBe(POI_PITFALL_SCHEMA);
    expect(cards[0].source).toBe('rag_snippet');
    expect(cards[0].confidence).toBe('MEDIUM');
    expect(cards[0].tips_zh.some((t) => t.includes('RAG'))).toBe(true);
  });

  it('mergePoiPitfallIntoNarration 注入 tips 与 poi_pitfall_cards', () => {
    const cards = buildPoiPitfallCards({ request_id: 'r1', days: [museumDay] });
    const out = mergePoiPitfallIntoNarration(
      { user_friendly_summary: 'ok', day_by_day_narrative: [], highlights: [], tips: [] },
      cards,
    );
    expect(out.poi_pitfall_cards?.length).toBe(1);
    expect(out.tips?.some((t) => t.includes('[避坑·东京国立博物馆]'))).toBe(true);
  });
});

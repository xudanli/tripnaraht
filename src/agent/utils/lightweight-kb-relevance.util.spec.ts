import {
  estimateLightweightKbTopicRelevanceScore,
  isActivityBookingRagSupplementQuery,
  LIGHTWEIGHT_KB_RAG_RELEVANCE_THRESHOLD,
} from './lightweight-kb-relevance.util';

describe('lightweight-kb-relevance.util', () => {
  it('exports threshold 0.6', () => {
    expect(LIGHTWEIGHT_KB_RAG_RELEVANCE_THRESHOLD).toBe(0.6);
  });

  it('scores strong travel-KB hooks above threshold', () => {
    expect(estimateLightweightKbTopicRelevanceScore('租车需要什么保险')).toBeGreaterThanOrEqual(0.6);
    expect(estimateLightweightKbTopicRelevanceScore('冰岛碎石险值得买吗')).toBeGreaterThanOrEqual(0.6);
    expect(estimateLightweightKbTopicRelevanceScore('行前装备清单')).toBeGreaterThanOrEqual(0.6);
    expect(estimateLightweightKbTopicRelevanceScore('推荐维克附近好吃的')).toBeGreaterThanOrEqual(0.6);
  });

  it('scores encyclopedic world facts without travel hooks below threshold', () => {
    expect(estimateLightweightKbTopicRelevanceScore('法国人口多少')).toBeLessThan(0.6);
    expect(estimateLightweightKbTopicRelevanceScore('中国GDP是多少')).toBeLessThan(0.6);
  });

  it('scores thin generic consultation below threshold', () => {
    expect(estimateLightweightKbTopicRelevanceScore('要注意什么')).toBeLessThan(0.6);
  });

  it('scores destination + generic consultation at or above threshold', () => {
    expect(estimateLightweightKbTopicRelevanceScore('冰岛适合新手吗')).toBeGreaterThanOrEqual(0.6);
    expect(estimateLightweightKbTopicRelevanceScore('申根签证要注意什么')).toBeGreaterThanOrEqual(0.6);
  });

  it('treats helicopter / air sightseeing booking asks as KB-eligible (booking consult path)', () => {
    const q = '想订直升机飞越冰川的观光，能订的运营商和时段列给我。';
    expect(isActivityBookingRagSupplementQuery(q)).toBe(true);
    expect(estimateLightweightKbTopicRelevanceScore(q)).toBeGreaterThanOrEqual(LIGHTWEIGHT_KB_RAG_RELEVANCE_THRESHOLD);
  });
});

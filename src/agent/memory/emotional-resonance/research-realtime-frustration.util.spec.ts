import {
  computeRerollFrustrationBump,
  incrementRealtimeRerollCount,
  readRealtimeRerollCount,
  RESEARCH_REALTIME_REROLL_COUNT_KEY,
} from './research-realtime-frustration.util';

describe('research-realtime-frustration.util (6.3)', () => {
  it('readRealtimeRerollCount 缺省为 0', () => {
    expect(readRealtimeRerollCount(undefined)).toBe(0);
    expect(readRealtimeRerollCount({})).toBe(0);
  });

  it('incrementRealtimeRerollCount 累加并写回 research_data', () => {
    const rd: Record<string, unknown> = {};
    expect(incrementRealtimeRerollCount(rd)).toBe(1);
    expect(rd[RESEARCH_REALTIME_REROLL_COUNT_KEY]).toBe(1);
    expect(incrementRealtimeRerollCount(rd)).toBe(2);
    expect(readRealtimeRerollCount(rd)).toBe(2);
  });

  it('computeRerollFrustrationBump 分档', () => {
    expect(computeRerollFrustrationBump(0)).toBe(0);
    expect(computeRerollFrustrationBump(1)).toBe(0.05);
    expect(computeRerollFrustrationBump(2)).toBe(0.25);
    expect(computeRerollFrustrationBump(3)).toBe(0.52);
    expect(computeRerollFrustrationBump(99)).toBe(0.52);
  });
});

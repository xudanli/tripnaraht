import { decomposeUserChangeIntentLite } from './user-change-intent-decompose-lite.util';

describe('decomposeUserChangeIntentLite', () => {
  it('splits on Chinese punctuation and caps bullets', () => {
    const s = '把第一天改到下午，删掉爬山，换咖啡，酒店晚退房，博物馆若关门换隔壁';
    const b = decomposeUserChangeIntentLite(s, { maxBullets: 5, minChunkLen: 3 });
    expect(b.length).toBeGreaterThanOrEqual(3);
    expect(b.length).toBeLessThanOrEqual(5);
    expect(b.some((x) => x.includes('咖啡') || x.includes('爬山'))).toBe(true);
  });

  it('returns empty for blank', () => {
    expect(decomposeUserChangeIntentLite('   ')).toEqual([]);
    expect(decomposeUserChangeIntentLite(undefined)).toEqual([]);
  });
});

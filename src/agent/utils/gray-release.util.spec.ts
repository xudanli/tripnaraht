/**
 * 灰度发布工具单元测试（Scheme E）
 */

import { isInGrayBucket } from './gray-release.util';

describe('isInGrayBucket', () => {
  it('percent=100 应始终返回 true', () => {
    expect(isInGrayBucket('any', 100)).toBe(true);
    expect(isInGrayBucket('', 100)).toBe(true);
  });

  it('percent=0 应始终返回 false', () => {
    expect(isInGrayBucket('any', 0)).toBe(false);
    expect(isInGrayBucket('user1|req1', 0)).toBe(false);
  });

  it('相同 seed 应得到相同结果', () => {
    const seed = 'user1|req1';
    expect(isInGrayBucket(seed, 50)).toBe(isInGrayBucket(seed, 50));
  });

  it('不同 seed 在 50% 灰度下应有约一半为 true', () => {
    const results: boolean[] = [];
    for (let i = 0; i < 100; i++) {
      results.push(isInGrayBucket(`user${i}|req${i}`, 50));
    }
    const trueCount = results.filter(Boolean).length;
    expect(trueCount).toBeGreaterThan(30);
    expect(trueCount).toBeLessThan(70);
  });

  it('percent=10 时应有约 10% 为 true', () => {
    const results: boolean[] = [];
    for (let i = 0; i < 200; i++) {
      results.push(isInGrayBucket(`seed-${i}-${Math.random()}`, 10));
    }
    const trueCount = results.filter(Boolean).length;
    expect(trueCount).toBeGreaterThan(5);
    expect(trueCount).toBeLessThan(35);
  });
});

import {
  formatWishlistContextBlocksAsPromptInjection,
  isActivityRecommendationQuery,
} from './wish-prompt-injection.util';

describe('isActivityRecommendationQuery', () => {
  it('匹配活动推荐', () => {
    expect(isActivityRecommendationQuery('请推荐一些活动')).toBe(true);
  });
});

describe('formatWishlistContextBlocksAsPromptInjection', () => {
  it('拼接愿望块正文', () => {
    const text = formatWishlistContextBlocksAsPromptInjection([
      {
        key: 'WISHLIST_PRIVATE:u1',
        type: 'WISHLIST_PRIVATE',
        text: '【用户愿望 · 共 1 条】\n- [活动/5·私密] 极光',
        priority: 75,
        visibility: 'private',
        provenance: { source: 'db', identifier: 'x', timestamp: '2026-01-01T00:00:00.000Z' },
      },
    ]);
    expect(text).toContain('极光');
    expect(text).toContain('系统注入·行程愿望单');
  });
});

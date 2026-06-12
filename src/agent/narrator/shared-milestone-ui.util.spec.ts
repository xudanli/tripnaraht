import { buildSharedMilestoneUiCards } from './shared-milestone-ui.util';

describe('shared-milestone-ui.util', () => {
  it('为 WIND token 生成中文卡片', () => {
    const cards = buildSharedMilestoneUiCards([
      {
        pastTripId: 't-old',
        locationName: '西峡湾',
        legacyPreferenceToken: 'EXPERIENCED_HIGH_ANXIETY_IN_WIND',
        emotionalPolarity: 'NEGATIVE_TRAUMA',
      },
    ]);
    expect(cards[0]?.headlineZh).toContain('强风');
    expect(cards[0]?.locationName).toBe('西峡湾');
  });
});

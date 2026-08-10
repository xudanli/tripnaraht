import {
  INTENT_PROFILES,
  matchesAnyDataLookupProfile,
  matchIntentProfiles,
} from './intent-profile-registry';

describe('intent-profile-registry', () => {
  it('matches dining and supply profiles', () => {
    expect(matchIntentProfiles('推荐黄金圈附近餐厅').map((m) => m.profile.id)).toContain(
      'consult.dining',
    );
    expect(matchIntentProfiles('帮我找附近的午餐').map((m) => m.profile.id)).toContain(
      'consult.dining',
    );
    expect(
      matchIntentProfiles(
        '我的行程中？有没有特色的餐厅？然后这些餐厅有没有需要提前预定的？',
      ).map((m) => m.profile.id),
    ).toContain('consult.dining');
    expect(matchIntentProfiles('维克超市可以买到什么水果').map((m) => m.profile.id)).toContain(
      'consult.supply',
    );
    expect(matchIntentProfiles('附近能买苹果的超市吗').map((m) => m.profile.id)).toContain(
      'consult.supply.nearby',
    );
  });

  it('matches accommodation for calendar hotel recommend phrasing', () => {
    expect(
      matchIntentProfiles('可以给我推荐吗？8月19号的酒店。').map((m) => m.profile.id),
    ).toContain('consult.accommodation');
    expect(matchesAnyDataLookupProfile('可以给我推荐吗？8月19号的酒店。')).toBe(true);
  });

  it('matches crud profiles', () => {
    expect(matchIntentProfiles('第2天新增黄金瀑布').some((m) => m.profile.id === 'crud.itinerary.add')).toBe(
      true,
    );
  });

  it('exports stable profile ids', () => {
    expect(INTENT_PROFILES.length).toBeGreaterThanOrEqual(8);
    expect(matchesAnyDataLookupProfile('什么时候租车比较合适')).toBe(true);
  });

  it('matches CN activity ticket and car-rental phrasing', () => {
    expect(
      matchIntentProfiles(
        '帮我搜索康定木格措景区8月21日的门票预订信息和价格',
      ).map((m) => m.profile.id),
    ).toContain('consult.activity_ticket');
    expect(matchesAnyDataLookupProfile('木格措门票多少钱')).toBe(true);
    expect(matchesAnyDataLookupProfile('我想在康定租一辆越野车')).toBe(true);
  });
});

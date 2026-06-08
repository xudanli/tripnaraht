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
    expect(matchIntentProfiles('维克超市可以买到什么水果').map((m) => m.profile.id)).toContain(
      'consult.supply',
    );
    expect(matchIntentProfiles('附近能买苹果的超市吗').map((m) => m.profile.id)).toContain(
      'consult.supply.nearby',
    );
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
});

import {
  inferWishCategoryFromText,
  inferWishImportanceFromText,
} from './wish-voice-category.util';

describe('wish-voice-category.util', () => {
  it('infers accommodation from glass dome mention', () => {
    expect(
      inferWishCategoryFromText('想住一晚玻璃屋，从床上看极光'),
    ).toBe('accommodation');
  });

  it('infers accommodation budget from spending cap', () => {
    expect(
      inferWishCategoryFromText('住宿别超过一万五，别让大家有压力'),
    ).toBe('accommodation');
  });

  it('infers destination_route from relaxed phrasing', () => {
    expect(
      inferWishCategoryFromText('行程不要太赶，每天留点发呆时间'),
    ).toBe('destination_route');
  });

  it('boosts importance for strong phrasing', () => {
    expect(inferWishImportanceFromText('特别想去看冰河湖')).toBe(5);
    expect(inferWishImportanceFromText('如果有空可以去看看')).toBe(2);
  });
});

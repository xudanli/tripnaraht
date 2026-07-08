import { expandPlaceNameVariants } from './guide-poi-name-match.util';

describe('expandPlaceNameVariants', () => {
  it('includes CN, EN, and cathedral alias', () => {
    const variants = expandPlaceNameVariants('哈尔格林姆斯大教堂', 'Hallgrímskirkja');
    expect(variants).toEqual(
      expect.arrayContaining([
        { nameCN: '哈尔格林姆斯大教堂', nameEN: 'Hallgrímskirkja' },
        { nameCN: '哈尔格林姆斯教堂', nameEN: 'Hallgrímskirkja' },
      ]),
    );
  });

  it('deduplicates identical CN/EN fallback', () => {
    const variants = expandPlaceNameVariants('蓝湖温泉');
    expect(variants).toHaveLength(1);
    expect(variants[0]).toEqual({ nameCN: '蓝湖温泉', nameEN: '蓝湖温泉' });
  });
});

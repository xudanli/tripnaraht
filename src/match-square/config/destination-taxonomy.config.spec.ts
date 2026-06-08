import { inferDestinationTaxonomy } from './destination-taxonomy.config';

describe('inferDestinationTaxonomy', () => {
  it('matches 青甘大环 to domestic northwest', () => {
    const match = inferDestinationTaxonomy('想走一趟青甘大环，路上露营做饭');
    expect(match).toEqual({
      destinationRegionId: 'domestic_northwest',
      destinationRegionLabel: '国内 · 西北',
      destinationSubScopeId: 'qinggan_great_loop',
      destinationSubScopeLabel: '青甘大环',
      destination: '西北·青甘大环',
    });
  });

  it('matches 新疆 helicopter skiing', () => {
    const match = inferDestinationTaxonomy('打算去新疆搞一次高强度的直升机滑雪');
    expect(match?.destinationRegionId).toBe('domestic_northwest');
    expect(match?.destinationSubScopeId).toBe('xinjiang');
    expect(match?.destination).toBe('新疆');
  });

  it('matches 新西兰 skydiving', () => {
    const match = inferDestinationTaxonomy('或者新西兰高空跳伞');
    expect(match?.destinationRegionId).toBe('overseas_oceania');
    expect(match?.destinationSubScopeLabel).toBe('新西兰');
  });

  it('does not map 新西兰南岛 heli-ski to 新疆', () => {
    const text =
      '去新西兰南岛搞一次顶级的多巴胺越界：高空跳伞 + 直升机滑雪 + 荒野漂流，住南阿尔卑斯山下的顶奢 Lodge';
    const match = inferDestinationTaxonomy(text);
    expect(match?.destinationRegionId).toBe('overseas_oceania');
    expect(match?.destinationSubScopeId).toBe('new_zealand');
    expect(match?.destination).toBe('新西兰');
  });
});

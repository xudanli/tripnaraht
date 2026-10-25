import {
  hasChinaFliggyHubHint,
  resolveFliggyDestName,
  resolveFliggyHotelKeywords,
  resolveFliggyLodgingSearch,
  extractScheduleOvernightTownZh,
  resolveHotelDestHintZh,
} from './fliggy-dest.util';

describe('fliggy-dest.util', () => {
  it('maps G318 anchors to lodging hubs (not Chengdu)', () => {
    expect(
      resolveFliggyLodgingSearch({
        destination: 'China',
        naturalLanguage: '布达拉宫',
      }),
    ).toMatchObject({ destName: '拉萨' });

    expect(
      resolveFliggyLodgingSearch({
        destination: 'CN',
        itineraryPlaceName: '芒康',
      }),
    ).toMatchObject({ destName: '芒康' });

    expect(
      resolveFliggyLodgingSearch({
        destination: 'China',
        query: '林芝机场 lodging',
      }),
    ).toMatchObject({ destName: '林芝' });

    expect(
      resolveFliggyLodgingSearch({
        destination: 'China',
        naturalLanguage: '康定情歌(木格措)风景区',
      }),
    ).toMatchObject({ destName: '康定', poiName: '木格措' });

    expect(
      resolveFliggyLodgingSearch({
        query: '帮我搜索康定木格措景区8月21日的门票预订信息和价格',
      }),
    ).toMatchObject({ destName: '康定', poiName: '木格措' });

    expect(
      resolveFliggyLodgingSearch({
        destination: 'China',
        naturalLanguage: '东达山垭口',
      }),
    ).toMatchObject({ destName: '左贡' });
  });

  it('does not silently fall back to 成都 when only country is CN', () => {
    expect(
      resolveFliggyLodgingSearch({ destination: 'China', countryCode: 'CN' } as any),
    ).toBeNull();
    expect(resolveFliggyDestName({ destination: 'China' })).toBeNull();
  });

  it('extractScheduleOvernightTownZh reads arrow overnight town', () => {
    expect(
      extractScheduleOvernightTownZh('推荐酒店\n\n[日程] Day4 Day 4 · 如美/左贡 → 八宿'),
    ).toBe('八宿');
  });

  it('maps 青甘 茶卡镇 to 乌兰 (Fliggy-searchable hub)', () => {
    expect(
      resolveFliggyLodgingSearch({
        destination: 'China',
        itineraryPlaceName: '茶卡镇',
      }),
    ).toMatchObject({ destName: '乌兰', poiName: '茶卡镇' });
    expect(
      resolveFliggyLodgingSearch({
        destination: 'CN',
        naturalLanguage: '茶卡盐湖',
      }),
    ).toMatchObject({ destName: '乌兰', poiName: '茶卡盐湖' });
    expect(
      extractScheduleOvernightTownZh('推荐酒店\n\n[日程] Day1 Day 1 · 西宁→茶卡镇'),
    ).toBe('茶卡镇');
  });

  it('resolveHotelDestHintZh prefers schedule overnight town over generic fallback', () => {
    expect(
      resolveHotelDestHintZh({
        message: '推荐酒店\n\n[日程] Day1 Day 1 · 西宁→茶卡镇',
        meta: {},
      }),
    ).toBe('茶卡镇');
    expect(resolveHotelDestHintZh({ message: '推荐酒店', meta: {} })).toBe('行程过夜点');
  });

  it('maps 怒江大桥 to 左贡 lodging hub', () => {
    expect(resolveFliggyLodgingSearch({ itineraryPlaceName: '怒江大桥' })).toMatchObject({
      destName: '左贡',
    });
  });

  it('extracts city from destination / query', () => {
    expect(resolveFliggyDestName({ destination: '成都' })).toBe('成都');
    expect(resolveFliggyDestName({ query: '九寨沟门票怎么订' })).toBe('九寨沟');
    expect(resolveFliggyDestName({ destination: 'CN', placeHint: '杭州西湖' })).toBe(
      '杭州',
    );
  });

  it('strips lodging noise; short place names are not keyWords', () => {
    expect(
      resolveFliggyHotelKeywords({ query: '布达拉宫 lodging' }),
    ).toBeUndefined();
    expect(
      resolveFliggyHotelKeywords({ query: '帮我推荐宽窄巷子附近酒店' }),
    ).toBeUndefined();
  });

  it('hasChinaFliggyHubHint covers attraction hubs without arbitrary Chinese', () => {
    expect(hasChinaFliggyHubHint('九寨沟门票怎么订')).toBe(true);
    expect(hasChinaFliggyHubHint('兵马俑要提前订吗')).toBe(true); // 西安 via? 兵马俑 not in hub - check
    expect(hasChinaFliggyHubHint('蓝湖温泉')).toBe(false);
    expect(hasChinaFliggyHubHint('雷克雅未克')).toBe(false);
  });
});

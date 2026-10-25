import { isInventoryCardSyncQuery } from './inventory-card-sync-query.util';

describe('isInventoryCardSyncQuery', () => {
  it('covers hotel / car / flight / dining / activity / xhs card asks', () => {
    expect(isInventoryCardSyncQuery('推荐酒店\n\n[日程] Day4')).toBe(true);
    expect(isInventoryCardSyncQuery('租车推荐，成都双流落地')).toBe(true);
    expect(isInventoryCardSyncQuery('推荐机票 成都到拉萨')).toBe(true);
    expect(isInventoryCardSyncQuery('推荐附近餐厅')).toBe(true);
    expect(isInventoryCardSyncQuery('推荐今天的隐藏景点')).toBe(true);
    expect(isInventoryCardSyncQuery('哪些活动需要提前预订')).toBe(true);
    expect(isInventoryCardSyncQuery('看看小红书怎么说')).toBe(true);
    expect(isInventoryCardSyncQuery('八宿口碑怎么样')).toBe(true);
  });

  it('does not force sync for generic planning chat', () => {
    expect(isInventoryCardSyncQuery('帮我规划整趟川藏线')).toBe(false);
    expect(isInventoryCardSyncQuery('你好')).toBe(false);
  });
});

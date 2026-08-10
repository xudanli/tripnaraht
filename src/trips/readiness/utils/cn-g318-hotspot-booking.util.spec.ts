import {
  __resetCnHotspotBookingCacheForTests,
  buildCnG318HotspotBookingMeta,
  matchCnG318HotspotBooking,
} from './cn-g318-hotspot-booking.util';

describe('cn-g318-hotspot-booking.util', () => {
  beforeEach(() => {
    __resetCnHotspotBookingCacheForTests();
  });

  it('matches Mugecuo aliases', () => {
    expect(matchCnG318HotspotBooking('帮我搜索康定木格措景区门票')?.id).toBe(
      'cn.poi.mugecuo',
    );
    expect(matchCnG318HotspotBooking('蓝湖门票') ).toBeNull();
  });

  it('builds meta for activity_search_meta', () => {
    const meta = buildCnG318HotspotBookingMeta('木格措门票多少钱');
    expect(meta?.name_cn).toBe('木格措');
    expect(String(meta?.consult_blurb_cn ?? '')).toContain('观光车');
  });

  it('matches deepened G318 hotspots', () => {
    expect(matchCnG318HotspotBooking('布达拉宫要提前订吗')?.id).toBe(
      'cn.poi.potala',
    );
    expect(matchCnG318HotspotBooking('巴松措门票')?.id).toBe('cn.poi.basongtso');
    expect(matchCnG318HotspotBooking('大昭寺和八廓街')?.id).toBe(
      'cn.poi.jokhang',
    );
  });

  it('matches Qinggan hotspots (Mogao / Chaka / Danxia)', () => {
    expect(matchCnG318HotspotBooking('莫高窟要提前几天预约')?.id).toBe(
      'cn.poi.mogao',
    );
    expect(matchCnG318HotspotBooking('茶卡盐湖门票含小火车吗')?.id).toBe(
      'cn.poi.chaka',
    );
    expect(matchCnG318HotspotBooking('张掖七彩丹霞日落票')?.id).toBe(
      'cn.poi.danxia',
    );
    expect(matchCnG318HotspotBooking('鸣沙山月牙泉')?.id).toBe('cn.poi.mingsha');
  });

  it('prefers longer alias when multiple names hit', () => {
    // 「鸣沙山月牙泉」应优先于仅含「鸣沙山」的短匹配（同分同条）
    expect(matchCnG318HotspotBooking('敦煌鸣沙山月牙泉门票')?.id).toBe(
      'cn.poi.mingsha',
    );
  });

  it('matches Duku / Dianzang / G211 hotspots', () => {
    expect(matchCnG318HotspotBooking('九曲十八弯观景台日出')?.id).toBe(
      'cn.poi.jiuqu',
    );
    expect(matchCnG318HotspotBooking('普达措国家公园门票')?.id).toBe(
      'cn.poi.pudacuo',
    );
    expect(matchCnG318HotspotBooking('飞来寺看梅里')?.id).toBe('cn.poi.feilai');
    expect(matchCnG318HotspotBooking('镇远古镇住哪里')?.id).toBe(
      'cn.poi.zhenyuan',
    );
  });

  it('matches G219 hotspots (Guge / Tashilhunpo / Shiquanhe)', () => {
    expect(matchCnG318HotspotBooking('古格王国遗址要门票吗')?.id).toBe(
      'cn.poi.guge',
    );
    expect(matchCnG318HotspotBooking('札达古格支线')?.id).toBe('cn.poi.guge');
    expect(matchCnG318HotspotBooking('扎什伦布寺预约')?.id).toBe(
      'cn.poi.tashilhunpo',
    );
    expect(matchCnG318HotspotBooking('狮泉河补给住哪')?.id).toBe(
      'cn.poi.shiquanhe_hub',
    );
  });
});

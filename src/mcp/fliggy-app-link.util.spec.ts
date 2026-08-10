import {
  buildFliggyHotelDetailAppUrl,
  buildFliggyHotelDetailWebUrl,
  resolveFliggyOpenLinks,
  toFliggyAppWebViewDeepLink,
} from './fliggy-app-link.util';

describe('fliggy-app-link.util', () => {
  it('toFliggyAppWebViewDeepLink uses path style without http:// host', () => {
    const app = toFliggyAppWebViewDeepLink(
      'https://router.feizhu.com/multi/webview?url=https%3A%2F%2Frouter.feizhu.com%2Fws%2Fabc',
    );
    expect(app).toBe(
      'taobaotravel://router.feizhu.com/multi/webview?url=https%3A%2F%2Frouter.feizhu.com%2Fws%2Fabc',
    );
    expect(app.startsWith('taobaotravel://http://')).toBe(false);
    expect(app.startsWith('taobaotravel://hotel/detail')).toBe(false);
  });

  it('resolveFliggyOpenLinks: webUrl=官方 detailUrl，appUrl=market 详情（避中间页）', () => {
    const detail =
      'https://router.feizhu.com/multi/webview?url=https%3A%2F%2Frouter.feizhu.com%2Fws%2F3cdyB9';
    const links = resolveFliggyOpenLinks({
      shId: '78309218',
      detailOrJumpUrl: detail,
      checkInDate: '2026-08-21',
      checkOutDate: '2026-08-22',
    });
    expect(links?.webUrl).toBe(detail);
    // 有 shId 时 App 链直达 market 详情，不再包一层 feizhu 路由
    expect(links?.appUrl).toBe(
      buildFliggyHotelDetailAppUrl({
        shId: '78309218',
        checkInDate: '2026-08-21',
        checkOutDate: '2026-08-22',
      }),
    );
    expect(links?.tbOpenUrl).toMatch(/^tbopen:\/\//);
    expect(links?.tbOpenUrl).toContain(encodeURIComponent('market.m.taobao.com'));
    expect(links?.openStrategy).toBe('web');
  });

  it('resolveFliggyOpenLinks falls back to market H5 when no detailUrl', () => {
    const links = resolveFliggyOpenLinks({
      shId: '72081570',
      checkInDate: '2026-08-21',
      checkOutDate: '2026-08-22',
    });
    expect(links?.webUrl).toContain('h5-hotel-detail');
    expect(links?.webUrl).toContain('shid=72081570');
    expect(links?.appUrl).toBe(
      buildFliggyHotelDetailAppUrl({
        shId: '72081570',
        checkInDate: '2026-08-21',
        checkOutDate: '2026-08-22',
      }),
    );
  });

  it('buildFliggyHotelDetailWebUrl uses market container', () => {
    expect(buildFliggyHotelDetailWebUrl({ shId: '1' })).toContain(
      'market.m.taobao.com/app/trip/h5-hotel-detail',
    );
  });
});

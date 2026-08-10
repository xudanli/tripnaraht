import { ICELAND_ACTIVITY_BOOKING_CATALOG } from './activity-booking-catalog';

/**
 * 目录订票链应返回可打开页面。
 * - 404/410：硬失败（旧 adventures.is 深链曾踩坑）
 * - 403：部分官网拦机房 IP，浏览器通常仍可开，记为软通过
 */
describe('ICELAND_ACTIVITY_BOOKING_CATALOG urls', () => {
  jest.setTimeout(90_000);

  it('each catalog url is not 404/410', async () => {
    const results: Array<{ id: string; url: string; code: number }> = [];
    for (const entry of ICELAND_ACTIVITY_BOOKING_CATALOG) {
      let code = 0;
      try {
        const res = await fetch(entry.url, {
          method: 'GET',
          redirect: 'follow',
          headers: {
            'User-Agent':
              'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
            Accept: 'text/html',
          },
          signal: AbortSignal.timeout(25_000),
        });
        code = res.status;
      } catch {
        code = 0;
      }
      results.push({ id: entry.id, url: entry.url, code });
    }
    const hardFail = results.filter((r) => r.code === 404 || r.code === 410);
    expect(hardFail).toEqual([]);
    // 至少多数链接应对机房可达（200 或 403）
    const okish = results.filter((r) => [200, 403].includes(r.code));
    expect(okish.length).toBeGreaterThanOrEqual(2);
  });
});

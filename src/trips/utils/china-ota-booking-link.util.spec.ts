import {
  isChinaOtaMarket,
  resolveChinaActivityOtaLinks,
  resolveChinaHotelOtaLinks,
} from './china-ota-booking-link.util';

describe('china-ota-booking-link.util', () => {
  it('detects China market by country code / name', () => {
    expect(isChinaOtaMarket({ countryCode: 'CN' })).toBe(true);
    expect(isChinaOtaMarket({ countryName: 'China' })).toBe(true);
    expect(isChinaOtaMarket({ destination: '成都' })).toBe(true);
    expect(isChinaOtaMarket({ countryCode: 'IS', countryName: 'Iceland' })).toBe(
      false,
    );
  });

  it('builds hotel jump links for 携程/飞猪/去哪儿', () => {
    const links = resolveChinaHotelOtaLinks({ nameZh: '宽窄巷子附近酒店' });
    expect(links?.bookingProvider).toBe('ctrip');
    expect(links?.bookingLinks.map((c) => c.provider)).toEqual([
      'ctrip',
      'fliggy',
      'qunar',
    ]);
    expect(links?.bookingUrl).toContain('ctrip.com');
    const fliggy = links?.bookingLinks.find((c) => c.provider === 'fliggy');
    expect(fliggy?.url).toContain('fliggy.com');
    expect(fliggy?.url.startsWith('https://')).toBe(true);
    expect(fliggy?.webUrl?.startsWith('https://')).toBe(true);
    expect((fliggy as { appUrl?: string } | undefined)?.appUrl).toBeUndefined();
    expect(links?.bookingLinks.find((c) => c.provider === 'qunar')?.url).toContain(
      'qunar.com',
    );
  });

  it('builds activity jump links with ticket keyword', () => {
    const links = resolveChinaActivityOtaLinks({ nameZh: '九寨沟' });
    expect(links?.bookingUrl).toContain('ctrip.com');
    expect(decodeURIComponent(links?.bookingUrl ?? '')).toMatch(/门票/);
  });
});

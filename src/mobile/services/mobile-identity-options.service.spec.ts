import { listResidencyRegions } from '../dictionaries/identity-geo.dictionary';
import { MobileIdentityOptionsService } from './mobile-identity-options.service';

describe('identity geo options', () => {
  it('filters CN residency regions including CN-SH', () => {
    const items = listResidencyRegions('CN');
    expect(items.some((i) => i.code === 'CN-SH')).toBe(true);
    expect(items.every((i) => i.countryCode === 'CN')).toBe(true);
  });

  it('pins CN near top of nationalities', async () => {
    const countries = {
      findAll: jest.fn().mockResolvedValue({
        countries: [
          { isoCode: 'IS', nameCN: '冰岛', nameEN: 'Iceland' },
          { isoCode: 'CN', nameCN: '中国', nameEN: 'China' },
          { isoCode: 'JP', nameCN: '日本', nameEN: 'Japan' },
          { isoCode: 'ZZ', nameCN: '测试', nameEN: 'Test' },
        ],
      }),
    };
    const svc = new MobileIdentityOptionsService(countries as never);
    const list = await svc.listNationalities();
    expect(list[0]?.code).toBe('CN');
    expect(list.map((x) => x.code)).toContain('JP');
  });

  it('getOptions aggregates nationalities + regions + languages', async () => {
    const countries = {
      findAll: jest.fn().mockResolvedValue({
        countries: [{ isoCode: 'CN', nameCN: '中国', nameEN: 'China' }],
      }),
    };
    const svc = new MobileIdentityOptionsService(countries as never);
    const opts = await svc.getOptions();
    expect(opts.nationalities[0]?.code).toBe('CN');
    expect(opts.residencyRegions.some((r) => r.code === 'CN-SH')).toBe(true);
    expect(opts.preferredLanguages.some((l) => l.code === 'zh-Hans')).toBe(true);
  });
});

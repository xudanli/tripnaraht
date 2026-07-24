import { resolvePlaceDisplayName } from './place-display-name.util';

describe('resolvePlaceDisplayName', () => {
  it('prefers nameCN for zh locale', () => {
    expect(
      resolvePlaceDisplayName({ nameCN: '黑沙滩套房酒店', nameEN: 'Black Beach Suites' }),
    ).toBe('黑沙滩套房酒店');
  });

  it('falls back to nameEN when nameCN missing', () => {
    expect(resolvePlaceDisplayName({ nameEN: 'Geysir' })).toBe('Geysir');
  });

  it('prefers nameEN for en locale', () => {
    expect(
      resolvePlaceDisplayName(
        { nameCN: '盖歇尔间歇泉', nameEN: 'Geysir' },
        { locale: 'en' },
      ),
    ).toBe('Geysir');
  });
});

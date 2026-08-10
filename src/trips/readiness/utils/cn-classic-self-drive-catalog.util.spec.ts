import {
  getCnClassicRouteCatalogDetail,
  listCnClassicRouteCatalog,
} from './cn-classic-self-drive-catalog.util';

describe('cn-classic-self-drive-catalog.util', () => {
  it('lists CN classic routes with drivingThresholdPackCode', () => {
    const catalog = listCnClassicRouteCatalog();
    expect(catalog.countryCode).toBe('CN');
    expect(catalog.routes.length).toBeGreaterThanOrEqual(5);
    const g318 = catalog.routes.find((r) => r.id === 'cn.route.g318');
    expect(g318?.drivingThresholdPackCode).toBe('CN_XIZANG');
    expect(g318?.skeletonVariantIds.length).toBeGreaterThan(0);
  });

  it('filters by tier', () => {
    const classic = listCnClassicRouteCatalog({ tier: 'classic' });
    expect(classic.routes.every((r) => r.tier === 'classic')).toBe(true);
    expect(classic.routes.some((r) => r.id === 'cn.route.g318')).toBe(true);
  });

  it('returns detail with skeleton variants for bootstrap', () => {
    const detail = getCnClassicRouteCatalogDetail('cn.route.qinggan_loop');
    expect(detail?.nameCN).toMatch(/青甘/);
    expect(detail?.drivingThresholdPackCode).toBe('CN');
    expect(detail?.skeletonVariants.some((v) => v.days === 8)).toBe(true);
    expect(detail?.mustHintsCN.length).toBeGreaterThan(0);
    expect(detail?.seasonWindows.length).toBeGreaterThan(0);
    expect(detail?.wantsXizang).toBe(false);
  });

  it('returns null for unknown route', () => {
    expect(getCnClassicRouteCatalogDetail('cn.route.nope')).toBeNull();
  });
});

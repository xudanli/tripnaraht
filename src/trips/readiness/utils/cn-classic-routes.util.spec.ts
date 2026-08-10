import {
  buildCnClassicRouteFindingItems,
  classicRoutesWantSichuan,
  classicRoutesWantXizang,
  extractRequestedTripDays,
  formatCnClassicRoutePromptSupplement,
  getCnClassicRouteById,
  listCnClassicRoutes,
  matchCnClassicRoutes,
  pickCnClassicDaySkeletonVariant,
} from './cn-classic-routes.util';
import {
  CN_PACK_CHINA,
  CN_PACK_SICHUAN,
  CN_PACK_XIZANG,
  selectCnReadinessPacks,
} from './cn-regional-pack-select.util';
import type { ReadinessPack } from '../types/readiness-pack.types';

function stubPack(packId: string): ReadinessPack {
  return {
    packId,
    destinationId: packId,
    displayName: { en: packId, zh: packId },
    version: '1.0.0',
    lastReviewedAt: '2026-08-08T00:00:00.000Z',
    geo: {
      countryCode: 'CN',
      region: { en: 'CN', zh: 'CN' },
      city: { en: 'CN', zh: 'CN' },
      lat: 0,
      lng: 0,
    },
    supportedSeasons: ['summer'],
    rules: [],
    sources: [],
  } as ReadinessPack;
}

describe('cn-classic-routes.util', () => {
  it('lists seeded classic and niche routes', () => {
    const all = listCnClassicRoutes();
    expect(all.some((r) => r.id === 'cn.route.g318')).toBe(true);
    expect(all.some((r) => r.id === 'cn.route.g211')).toBe(true);
    expect(all.some((r) => r.id === 'cn.route.qinggan_loop')).toBe(true);
    expect(getCnClassicRouteById('cn.route.g318')?.nameCN).toMatch(/G318/);
  });

  it('matches G318 / 川藏 and maps to plateau packs', () => {
    const routes = matchCnClassicRoutes(['想跑一趟 318 川藏线']);
    expect(routes.map((r) => r.id)).toContain('cn.route.g318');
    expect(classicRoutesWantXizang(routes)).toBe(true);
    expect(classicRoutesWantSichuan(routes)).toBe(true);

    const packs = selectCnReadinessPacks(
      [stubPack(CN_PACK_CHINA), stubPack(CN_PACK_XIZANG), stubPack(CN_PACK_SICHUAN)],
      { destinationId: 'CN', hints: ['G318 自驾'] },
    );
    expect(packs.map((p) => p.packId)).toEqual([
      CN_PACK_CHINA,
      CN_PACK_XIZANG,
      CN_PACK_SICHUAN,
    ]);
  });

  it('matches G211 as niche corridor without forcing tibet pack', () => {
    const routes = matchCnClassicRoutes(['计划走 211 国道银榕线']);
    expect(routes.map((r) => r.id)).toContain('cn.route.g211');
    expect(classicRoutesWantXizang(routes)).toBe(false);

    const packs = selectCnReadinessPacks(
      [stubPack(CN_PACK_CHINA), stubPack(CN_PACK_XIZANG), stubPack(CN_PACK_SICHUAN)],
      { destinationId: 'CN', hints: ['G211'] },
    );
    expect(packs.map((p) => p.packId)).toEqual([CN_PACK_CHINA]);
  });

  it('matches 青甘大环线 by name or anchors', () => {
    expect(
      matchCnClassicRoutes(['青甘大环线 8 日']).map((r) => r.id),
    ).toContain('cn.route.qinggan_loop');
    expect(
      matchCnClassicRoutes(['西宁', '青海湖', '敦煌', '张掖']).map((r) => r.id),
    ).toContain('cn.route.qinggan_loop');
  });

  it('does not treat random digits as 318', () => {
    expect(matchCnClassicRoutes(['酒店订单号 131800']).map((r) => r.id)).not.toContain(
      'cn.route.g318',
    );
  });

  it('builds must-level findings for high severity routes', () => {
    const items = buildCnClassicRouteFindingItems(
      matchCnClassicRoutes(['青甘大环线']),
      'zh',
    );
    expect(items[0]?.level).toBe('must');
    expect(items[0]?.message).toMatch(/青甘/);
  });

  it('picks day skeleton by requested days', () => {
    expect(extractRequestedTripDays('青甘大环线 10 日')).toBe(10);
    const v8 = pickCnClassicDaySkeletonVariant('cn.route.qinggan_loop', 8);
    const v10 = pickCnClassicDaySkeletonVariant('cn.route.qinggan_loop', 10);
    expect(v8?.id).toBe('8d');
    expect(v10?.id).toBe('10d');
    const prompt = formatCnClassicRoutePromptSupplement(['想跑青甘大环线 8 天']);
    expect(prompt).toMatch(/D1/);
    expect(prompt).toMatch(/西宁/);
    expect(prompt).toMatch(/敦煌/);
  });

  it('has day skeletons for niche plateau corridors', () => {
    expect(pickCnClassicDaySkeletonVariant('cn.route.g219')?.days).toBe(18);
    expect(pickCnClassicDaySkeletonVariant('cn.route.g317')?.days).toBe(14);
    expect(pickCnClassicDaySkeletonVariant('cn.route.dianzang')?.days).toBe(12);
    expect(formatCnClassicRoutePromptSupplement(['滇藏线 12 日'])).toMatch(/香格里拉/);
  });
});

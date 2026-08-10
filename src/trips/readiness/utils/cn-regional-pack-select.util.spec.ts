import type { ReadinessPack } from '../types/readiness-pack.types';
import {
  CN_PACK_CHINA,
  CN_PACK_SICHUAN,
  CN_PACK_XIZANG,
  buildCnDrivingLimitFindingItem,
  collectCnContextHints,
  resolveCnDrivingLimitCity,
  selectCnReadinessPacks,
} from './cn-regional-pack-select.util';

function stubPack(packId: string): ReadinessPack {
  return {
    packId,
    destinationId: packId.replace('pack.', '').toUpperCase().replace(/\./g, '-'),
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

describe('cn-regional-pack-select.util', () => {
  const all = [
    stubPack(CN_PACK_CHINA),
    stubPack(CN_PACK_XIZANG),
    stubPack(CN_PACK_SICHUAN),
  ];

  it('keeps only national pack for generic CN', () => {
    const selected = selectCnReadinessPacks(all, {
      destinationId: 'CN',
      hints: ['上海五日自驾'],
    });
    expect(selected.map((p) => p.packId)).toEqual([CN_PACK_CHINA]);
  });

  it('adds xizang pack on tibet hints', () => {
    const selected = selectCnReadinessPacks(all, {
      destinationId: 'CN',
      hints: ['拉萨', '羊卓雍措'],
    });
    expect(selected.map((p) => p.packId)).toEqual([
      CN_PACK_CHINA,
      CN_PACK_XIZANG,
    ]);
  });

  it('adds sichuan pack on chengdu / 川西 hints', () => {
    const selected = selectCnReadinessPacks(all, {
      destinationId: 'CN-CHENGDU',
      hints: ['稻城亚丁'],
    });
    expect(selected.map((p) => p.packId)).toContain(CN_PACK_SICHUAN);
    expect(selected.map((p) => p.packId)).toContain(CN_PACK_CHINA);
  });

  it('forces regional pack from destinationId CN-XIZANG', () => {
    const selected = selectCnReadinessPacks(all, {
      destinationId: 'CN-XIZANG',
    });
    expect(selected.map((p) => p.packId)).toEqual([
      CN_PACK_CHINA,
      CN_PACK_XIZANG,
    ]);
  });

  it('resolves driving-limit city and builds finding', () => {
    expect(resolveCnDrivingLimitCity(['杭州西湖'])).toBe('杭州');
    const item = buildCnDrivingLimitFindingItem('北京', 'zh');
    expect(item?.id).toContain('北京');
    expect(item?.level).toBe('should');
    expect(item?.message).toMatch(/限行/);
  });

  it('collects hints from destination and activities', () => {
    const hints = collectCnContextHints({
      destinationId: 'CN-Beijing',
      activities: ['hiking'],
      placeNames: ['天安门'],
    });
    expect(hints).toEqual(
      expect.arrayContaining(['CN-Beijing', 'Beijing', 'hiking', '天安门']),
    );
  });
});

import { mergeAccessRulesWithOverrides } from './merge-access-rules.util';
import { ICELAND_B_TIER_ACCESS_RULES } from '../fixtures/is-b-tier.rules';
import type { PoiAccessStatusOverride } from '../interfaces/poi-access-capacity.interface';

describe('mergeAccessRulesWithOverrides', () => {
  const base = ICELAND_B_TIER_ACCESS_RULES.filter(
    (r) => r.id === 'is.skaftafell.trail_s3_spring_closure',
  );

  it('ACTIVE 覆盖替换基础 S3 关闭规则', () => {
    const override: PoiAccessStatusOverride = {
      id: 'is.skaftafell.trail_s3_closed_2026_spring',
      poiId: 'is.skaftafell',
      ruleType: 'TRAIL_RESTRICTION',
      targetResource: 'TRAIL',
      effectiveFrom: '2026-04-01T00:00:00.000Z',
      effectiveTo: '2026-06-10T23:59:59.000Z',
      status: 'ACTIVE',
      sourceAuthority: 'Vatnajökull NP',
      lastVerifiedAt: '2026-06-01T00:00:00.000Z',
      confidence: 'OFFICIAL',
      notes: 'S3 关闭至 6 月 10 日',
    };

    const merged = mergeAccessRulesWithOverrides(base, [override], '2026-05-15');
    expect(merged.some((r) => r.id === override.id)).toBe(true);
    expect(merged.some((r) => r.id === base[0].id)).toBe(false);
  });

  it('INACTIVE 覆盖抑制 PENDING 基础规则', () => {
    const dyrholaeyBase = ICELAND_B_TIER_ACCESS_RULES.filter(
      (r) => r.id === 'is.dyrholaey.bird_breeding_window',
    );
    const override: PoiAccessStatusOverride = {
      id: 'is.dyrholaey.bird_breeding_2026_confirmed_open',
      poiId: 'is.dyrholaey',
      ruleType: 'TRAIL_RESTRICTION',
      targetResource: 'VIEWPOINT',
      effectiveFrom: '2026-05-15T00:00:00.000Z',
      effectiveTo: '2026-06-20T23:59:59.000Z',
      status: 'INACTIVE',
      sourceAuthority: 'Environment Agency',
      lastVerifiedAt: '2026-05-20T00:00:00.000Z',
      confidence: 'OFFICIAL',
      notes: '当年确认开放',
    };

    const merged = mergeAccessRulesWithOverrides(
      dyrholaeyBase,
      [override],
      '2026-06-01',
    );
    expect(merged).toHaveLength(0);
  });
});

import { Test, TestingModule } from '@nestjs/testing';
import { RegionIntentResolverService } from './region-intent-resolver.service';

describe('RegionIntentResolverService (Phase 2.3)', () => {
  let svc: RegionIntentResolverService;

  beforeEach(async () => {
    const m: TestingModule = await Test.createTestingModule({
      providers: [RegionIntentResolverService],
    }).compile();
    svc = m.get(RegionIntentResolverService);
  });

  it('resolveFromText: 明确排除黄金圈时不命中 golden_circle', () => {
    const r = svc.resolveFromText(
      '2026-08-01 冰岛雷克雅未克市区一日游，步行逛市区，不含黄金圈',
    );
    expect(r.confidence).toBe(0);
    expect(r.matchedRegionId).toBeUndefined();
  });

  it('resolveFromText: 英文 without golden circle 不命中', () => {
    const r = svc.resolveFromText('One day in Reykjavik city center without Golden Circle');
    expect(r.confidence).toBe(0);
  });

  it('resolveFromText: 正常黄金圈文案仍命中', () => {
    const r = svc.resolveFromText('冰岛黄金圈一日游 从雷克雅未克出发');
    expect(r.matchedRegionId).toBe('golden_circle');
    expect(r.confidence).toBeGreaterThan(0);
  });
});

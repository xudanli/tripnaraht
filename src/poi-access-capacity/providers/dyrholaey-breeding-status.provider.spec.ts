import { DyrholaeyBreedingStatusProvider } from '../providers/dyrholaey-breeding-status.provider';
import { ICELAND_B_TIER_POI_SLUGS } from '../fixtures/is-b-tier.rules';

describe('DyrholaeyBreedingStatusProvider', () => {
  const provider = new DyrholaeyBreedingStatusProvider();

  it('loadLocalSnapshot 读取种子文件', async () => {
    const snap = await provider.loadSnapshot();
    expect(snap?.status).toBe('LIMITED');
  });

  it('toStatusOverride LIMITED → ACTIVE override', () => {
    const snap = provider.loadLocalSnapshot();
    expect(snap).toBeDefined();
    const override = provider.toStatusOverride(snap!);
    expect(override.poiId).toBe(ICELAND_B_TIER_POI_SLUGS.DYRHOlaEY);
    expect(override.status).toBe('ACTIVE');
  });
});

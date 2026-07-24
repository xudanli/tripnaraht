import {
  resolveSparseRegionProfile,
  resolvePoiSelectionMinRequired,
  SPARSE_REGION_PROFILES,
} from '../profiles/sparse-region.profile';
import { resetOpenWorldStubIdCounterForTests } from '../open-world/open-world-poi-stub.util';
import { buildDefaultPolarRegionStubs } from '../open-world/polar-region-stubs.util';
import { applySparseRegionPoiGate } from '../open-world/sparse-poi-gate.util';

describe('sparse-region.profile', () => {
  beforeEach(() => {
    resetOpenWorldStubIdCounterForTests();
  });

  it('detects Greenland by country code GL', () => {
    const profile = resolveSparseRegionProfile({ countryCode: 'GL' });
    expect(profile?.profileId).toBe('sparse_polar_greenland');
    expect(profile?.minPoiRequired).toBe(0);
    expect(profile?.freezeFillMissingSlots).toBe(true);
  });

  it('detects Greenland by ISO hint GL', () => {
    const profile = resolveSparseRegionProfile({ destinationHint: 'GL' });
    expect(profile?.regionTag).toBe('greenland');
  });

  it('detects Svalbard by hint text', () => {
    const profile = resolveSparseRegionProfile({
      destinationHint: '朗伊尔城 7 天 极光',
    });
    expect(profile?.regionTag).toBe('svalbard');
  });

  it('returns minPoiRequired=2 for dense destinations', () => {
    const gate = resolvePoiSelectionMinRequired({ countryCode: 'IS' });
    expect(gate.minPoiRequired).toBe(2);
    expect(gate.sparseProfile).toBeNull();
  });

  it('builds Disko kayak stub when user mentions kayaking', () => {
    const stubs = buildDefaultPolarRegionStubs('greenland', '迪斯科湾皮划艇看冰山');
    expect(stubs.some((s) => s.stubId === 'provisional_disco_kayak_gl')).toBe(true);
  });

  it('applySparseRegionPoiGate injects stubs for GL with empty scored', () => {
    const result = applySparseRegionPoiGate({
      scored: [],
      destinationCountry: 'GL',
      destinationHint: 'Nuuk',
      dedupe: (pois) => pois,
    });
    expect(result.sparseProfile).toEqual(SPARSE_REGION_PROFILES.greenland);
    expect(result.scored.length).toBeGreaterThan(0);
    expect(result.openWorldStubs.length).toBeGreaterThan(0);
  });
});

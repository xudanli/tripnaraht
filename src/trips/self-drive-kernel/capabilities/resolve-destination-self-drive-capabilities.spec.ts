import {
  clearDestinationSelfDriveCapabilitiesCache,
  resolveDestinationPackId,
  resolveDestinationSelfDriveCapabilities,
} from './resolve-destination-self-drive-capabilities';

describe('resolveDestinationSelfDriveCapabilities', () => {
  beforeEach(() => {
    clearDestinationSelfDriveCapabilitiesCache();
  });

  it('loads CN and IS packs with distinct capability levels', () => {
    const cn = resolveDestinationSelfDriveCapabilities('CN');
    const is = resolveDestinationSelfDriveCapabilities('IS');

    expect(cn.packId).toBe('destination.cn');
    expect(is.packId).toBe('destination.is');
    expect(cn.capabilities.altitude_risk).toBe('SUPPORTED');
    expect(cn.capabilities.live_traffic).toBe('NONE');
    expect(is.capabilities.road_status).toBe('SUPPORTED');
    expect(is.capabilities.ferry).toBe('SUPPORTED');
  });

  it('maps pack id helper', () => {
    expect(resolveDestinationPackId('中国')).toBe('destination.cn');
    expect(resolveDestinationPackId('iceland')).toBe('destination.is');
  });

  it('unknown country returns NONE capabilities without throw', () => {
    const xx = resolveDestinationSelfDriveCapabilities('XX');
    expect(xx.capabilities.road_status).toBe('NONE');
    expect(xx.version).toContain('fallback');
  });
});

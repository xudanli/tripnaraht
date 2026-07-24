import { CountryConfigService } from './country-config.service';
import * as path from 'path';
import * as fs from 'fs';

describe('CountryConfigService — region alias routing (W0)', () => {
  let service: CountryConfigService;

  beforeEach(() => {
    service = new CountryConfigService();
  });

  it('resolves NO + subregion lofoten to lofoten-road-status.json', () => {
    const region = service.resolvePhysicalDataRegion('NO', 'lofoten');
    expect(region).toBe('lofoten');
    const filePath = service.getRoadStatusPath('NO', 'lofoten');
    expect(filePath).toContain('lofoten-road-status.json');
    expect(fs.existsSync(filePath)).toBe(true);
  });

  it('does not auto-map NO to lofoten without subregion (avoid spatial mismatch)', () => {
    expect(service.resolvePhysicalDataRegion('NO')).toBe('no');
    expect(service.hasRoadStatusData('NO')).toBe(false);
    expect(service.listAvailableRegionsForCountry('NO')).toContain('lofoten');
  });

  it('resolves IS to iceland prefix', () => {
    expect(service.resolvePhysicalDataRegion('IS')).toBe('iceland');
    expect(service.getRoadStatusPath('IS')).toContain('iceland-road-status.json');
  });
});

import {
  countryHasActiveDestinationPack,
  normalizeDestinationCountryCode,
  resolveTripDestinationCountry,
} from './country-pack-registry.util';

describe('country-pack-registry.util (Phase 3)', () => {
  it('P3-REG-001: normalizes ICELAND → IS', () => {
    expect(normalizeDestinationCountryCode('ICELAND')).toBe('IS');
    expect(normalizeDestinationCountryCode('is')).toBe('IS');
  });

  it('P3-REG-002: active destination packs on disk', () => {
    expect(countryHasActiveDestinationPack('IS')).toBe(true);
    expect(countryHasActiveDestinationPack('NZ')).toBe(true);
    expect(countryHasActiveDestinationPack('JP')).toBe(false);
  });

  it('P3-REG-004: normalizes NEW ZEALAND → NZ', () => {
    expect(normalizeDestinationCountryCode('NEW ZEALAND')).toBe('NZ');
    expect(normalizeDestinationCountryCode('new_zealand')).toBe('NZ');
  });

  it('P3-REG-003: resolveTripDestinationCountry returns undefined when missing', () => {
    expect(resolveTripDestinationCountry(undefined)).toBeUndefined();
    expect(resolveTripDestinationCountry('  ')).toBeUndefined();
    expect(resolveTripDestinationCountry('NZ')).toBe('NZ');
  });
});

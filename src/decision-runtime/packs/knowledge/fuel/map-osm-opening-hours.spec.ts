import {
  mapOsmOpeningHoursToFuelOpeningMode,
  mapSelfServiceToUnattended,
} from './map-osm-opening-hours';
import { projectPlaceRowToFuelStationProfile } from './project-place-fuel-station';

describe('map-osm-opening-hours', () => {
  it('maps 24/7 to ALWAYS_OPEN', () => {
    expect(mapOsmOpeningHoursToFuelOpeningMode('24/7')).toBe('ALWAYS_OPEN');
    expect(mapOsmOpeningHoursToFuelOpeningMode('24x7')).toBe('ALWAYS_OPEN');
  });

  it('maps weekday schedules to SCHEDULED', () => {
    expect(
      mapOsmOpeningHoursToFuelOpeningMode('Mo-Sa 08:00-22:00; Su 09:00-22:00'),
    ).toBe('SCHEDULED');
  });

  it('maps missing to UNKNOWN', () => {
    expect(mapOsmOpeningHoursToFuelOpeningMode(null)).toBe('UNKNOWN');
    expect(mapOsmOpeningHoursToFuelOpeningMode('')).toBe('UNKNOWN');
  });

  it('maps self_service yes/only to unattended', () => {
    expect(mapSelfServiceToUnattended('yes')).toBe(true);
    expect(mapSelfServiceToUnattended('only')).toBe(true);
    expect(mapSelfServiceToUnattended('no')).toBe(false);
  });
});

describe('projectPlaceRowToFuelStationProfile opening hours', () => {
  it('projects OSM 24/7 into ALWAYS_OPEN (not UNKNOWN)', () => {
    const profile = projectPlaceRowToFuelStationProfile({
      id: 1,
      nameEN: 'N1 Test',
      lat: 64.15,
      lng: -21.94,
      canonicalType: 'FUEL_N1',
      openingHours: '24/7',
      selfService: 'yes',
      fuelDiesel: 'yes',
      fuelOctane95: 'yes',
    });
    expect(profile!.openingMode).toBe('ALWAYS_OPEN');
    expect(profile!.unattended).toBe(true);
    expect(profile!.fuelTypes).toEqual(['PETROL', 'DIESEL']);
    expect(profile!.reliability).toBe('PARTIALLY_VERIFIED');
  });

  it('keeps UNKNOWN when hours absent', () => {
    const profile = projectPlaceRowToFuelStationProfile({
      id: 2,
      lat: 64.15,
      lng: -21.94,
      canonicalType: 'FUEL_ORKAN',
    });
    expect(profile!.openingMode).toBe('UNKNOWN');
    expect(profile!.reliability).toBe('UNKNOWN');
  });
});

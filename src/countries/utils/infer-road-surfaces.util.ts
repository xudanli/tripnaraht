import type { RoadSurfaceForEta } from '../types/country-profile-v2.types';

export interface RoadConditionHints {
  fRoad?: boolean;
  gravelRoad?: boolean;
  mountainPass?: boolean;
  winterBlackIce?: boolean;
}

/**
 * Map corridor road hints → CountryProfile V2 ETA surface tags.
 */
export function inferRoadSurfacesFromCondition(
  condition: RoadConditionHints,
): RoadSurfaceForEta[] {
  const surfaces: RoadSurfaceForEta[] = [];
  if (condition.fRoad) {
    surfaces.push('F_ROAD');
    surfaces.push('GRAVEL');
  } else if (condition.gravelRoad) {
    surfaces.push('GRAVEL');
  }
  if (condition.mountainPass) surfaces.push('MOUNTAIN_PASS');
  if (condition.winterBlackIce) surfaces.push('WINTER_BLACK_ICE');
  return surfaces;
}

/** Default corridor hints when leg metadata is absent (IS/NZ gravel common). */
export function defaultRoadConditionForCountry(
  countryCode: string,
  overrides?: RoadConditionHints,
): RoadConditionHints {
  const cc = countryCode.toUpperCase().split(/[-_]/)[0] ?? countryCode;
  const base: RoadConditionHints =
    cc === 'IS' || cc === 'NZ'
      ? { gravelRoad: true, fRoad: false }
      : { fRoad: false, gravelRoad: false };
  return { ...base, ...overrides };
}

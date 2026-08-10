/**
 * Project Place rows → IcelandFuelStationProfile (runtime; does not write back to DB).
 */

import { ICELAND_FUEL_CANONICAL_TYPES } from '../../../../places/types/iceland-poi-categories';
import type {
  IcelandFuelRemoteness,
  IcelandFuelReliability,
  IcelandFuelStationProfile,
  IcelandFuelType,
} from './iceland-fuel.types';
import {
  mapOsmOpeningHoursToFuelOpeningMode,
  mapSelfServiceToUnattended,
} from './map-osm-opening-hours';

export interface PlaceFuelStationRow {
  id: number;
  nameEN?: string | null;
  nameCN?: string | null;
  lat: number;
  lng: number;
  canonicalType: string;
  cityNameEN?: string | null;
  /** OSM / Place metadata.openingHours */
  openingHours?: string | null;
  /** OSM self_service */
  selfService?: string | null;
  fuelDiesel?: string | null;
  fuelOctane95?: string | null;
}

const FUEL_TYPE_SET = new Set<string>(ICELAND_FUEL_CANONICAL_TYPES);

export function isPlaceFuelCanonicalType(canonicalType: string): boolean {
  return FUEL_TYPE_SET.has(canonicalType);
}

function remotenessFromCoords(lat: number, lng: number): IcelandFuelRemoteness {
  if (lat >= 63.9 && lat <= 64.3 && lng >= -22.2 && lng <= -21.5) {
    return 'URBAN';
  }
  if (lat >= 64.2 && lat <= 65.2 && lng >= -20.5 && lng <= -16.5) {
    return 'REMOTE';
  }
  return 'RURAL';
}

function paymentHints(canonicalType: string): string[] | undefined {
  switch (canonicalType) {
    case 'FUEL_N1':
      return ['CARD', 'N1_APP'];
    case 'FUEL_ORKAN':
      return ['CARD', 'ORKAN_APP'];
    case 'FUEL_OB':
      return ['CARD'];
    case 'FUEL_OLIS':
      return ['CARD', 'OLIS_APP'];
    case 'FUEL_ATLANTSOILA':
      return ['CARD'];
    default:
      return ['CARD'];
  }
}

function fuelTypesFromTags(row: PlaceFuelStationRow): IcelandFuelType[] {
  const types: IcelandFuelType[] = [];
  const diesel = row.fuelDiesel?.toLowerCase();
  const petrol = row.fuelOctane95?.toLowerCase();
  if (petrol === 'yes' || petrol === 'true') types.push('PETROL');
  if (diesel === 'yes' || diesel === 'true') types.push('DIESEL');
  if (types.length === 0) return ['PETROL', 'DIESEL'];
  return types;
}

function reliabilityForOpening(
  openingMode: ReturnType<typeof mapOsmOpeningHoursToFuelOpeningMode>,
): IcelandFuelReliability {
  if (openingMode === 'ALWAYS_OPEN') return 'PARTIALLY_VERIFIED';
  if (openingMode === 'SCHEDULED') return 'PARTIALLY_VERIFIED';
  return 'UNKNOWN';
}

/**
 * Map a Place fuel row into knowledge-pack station profile shape.
 */
export function projectPlaceRowToFuelStationProfile(
  row: PlaceFuelStationRow,
): IcelandFuelStationProfile | null {
  if (!isPlaceFuelCanonicalType(row.canonicalType)) return null;
  if (!Number.isFinite(row.lat) || !Number.isFinite(row.lng)) return null;

  const openingMode = mapOsmOpeningHoursToFuelOpeningMode(row.openingHours);
  const unattended = mapSelfServiceToUnattended(row.selfService);
  const fuelTypes = fuelTypesFromTags(row);

  return {
    poiId: `place:${row.id}`,
    name: row.nameEN || row.nameCN || `Place ${row.id}`,
    lat: row.lat,
    lng: row.lng,
    fuelTypes,
    openingMode,
    ...(unattended !== undefined ? { unattended } : {}),
    paymentSupport: paymentHints(row.canonicalType),
    remotenessLevel: remotenessFromCoords(row.lat, row.lng),
    reliability: reliabilityForOpening(openingMode),
    sourceRefs: [
      {
        kind: 'EXTERNAL',
        path: `place://${row.id}`,
        note: [
          `canonicalType=${row.canonicalType}`,
          row.openingHours ? `openingHours=${row.openingHours}` : null,
        ]
          .filter(Boolean)
          .join('; '),
      },
    ],
    corridorTags: row.cityNameEN
      ? [`place_city:${row.cityNameEN}`, `canonical:${row.canonicalType}`]
      : [`canonical:${row.canonicalType}`],
  };
}

export function projectPlaceRowsToFuelStationProfiles(
  rows: PlaceFuelStationRow[],
): IcelandFuelStationProfile[] {
  const out: IcelandFuelStationProfile[] = [];
  const seen = new Set<string>();
  for (const row of rows) {
    const profile = projectPlaceRowToFuelStationProfile(row);
    if (!profile || seen.has(profile.poiId)) continue;
    seen.add(profile.poiId);
    out.push(profile);
  }
  return out;
}

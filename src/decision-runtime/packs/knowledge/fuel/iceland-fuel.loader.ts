/**
 * Load Iceland fuel station profiles, policy, and fuel runbook from destination pack.
 */

import { existsSync, readFileSync } from 'fs';
import { join } from 'path';
import type {
  IcelandFuelPolicy,
  IcelandFuelRunbook,
  IcelandFuelStationProfile,
  IcelandFuelStationProfileBundle,
} from './iceland-fuel.types';

const IS_PACK_ROOT = 'data/destination-packs/is';

function readJson<T>(absolutePath: string): T {
  if (!existsSync(absolutePath)) {
    throw new Error(`Iceland fuel asset not found: ${absolutePath}`);
  }
  return JSON.parse(readFileSync(absolutePath, 'utf8')) as T;
}

export function resolveIsFuelAssetPath(
  packRelativePath: string,
  cwd: string = process.cwd(),
): string {
  return join(cwd, IS_PACK_ROOT, packRelativePath);
}

export function loadIcelandFuelStationProfiles(
  cwd: string = process.cwd(),
): IcelandFuelStationProfileBundle {
  return readJson<IcelandFuelStationProfileBundle>(
    resolveIsFuelAssetPath('knowledge/fuel/is-fuel-station-profiles.json', cwd),
  );
}

export function loadIcelandFuelPolicy(cwd: string = process.cwd()): IcelandFuelPolicy {
  return readJson<IcelandFuelPolicy>(
    resolveIsFuelAssetPath('knowledge/fuel/is-fuel-policy.json', cwd),
  );
}

export function loadIcelandFuelRunbook(cwd: string = process.cwd()): IcelandFuelRunbook {
  return readJson<IcelandFuelRunbook>(
    resolveIsFuelAssetPath('knowledge/runbooks/is-rb-fuel-insufficient.json', cwd),
  );
}

export function getIcelandFuelStationById(
  poiId: string,
  cwd: string = process.cwd(),
): IcelandFuelStationProfile | undefined {
  return loadIcelandFuelStationProfiles(cwd).stations.find((s) => s.poiId === poiId);
}

/** Project profiles into P-FUEL-1 poi index category FUEL (no arc distances). */
export function icelandFuelStationsAsPoiIndex(
  cwd: string = process.cwd(),
): Array<{
  id: string;
  category: 'FUEL';
  lat: number;
  lng: number;
}> {
  return loadIcelandFuelStationProfiles(cwd)
    .stations
    .filter((s) => typeof s.lat === 'number' && typeof s.lng === 'number')
    .map((s) => ({
      id: s.poiId,
      category: 'FUEL' as const,
      lat: s.lat as number,
      lng: s.lng as number,
    }));
}

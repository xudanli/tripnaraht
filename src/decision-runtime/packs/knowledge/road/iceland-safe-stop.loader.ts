/**
 * Load curated Iceland safe-stop catalog from destination pack.
 */

import { existsSync, readFileSync } from 'fs';
import { join } from 'path';
import type { IcelandSafeStop, IcelandSafeStopCatalog } from './iceland-safe-stop.types';

const IS_PACK_ROOT = 'data/destination-packs/is';
const CATALOG_REL = 'knowledge/road/is-safe-stop-catalog.json';

export function resolveIcelandSafeStopCatalogPath(
  cwd: string = process.cwd(),
): string {
  return join(cwd, IS_PACK_ROOT, CATALOG_REL);
}

export function loadIcelandSafeStopCatalog(
  cwd: string = process.cwd(),
): IcelandSafeStopCatalog {
  const path = resolveIcelandSafeStopCatalogPath(cwd);
  if (!existsSync(path)) {
    throw new Error(`Iceland safe-stop catalog not found: ${path}`);
  }
  return JSON.parse(readFileSync(path, 'utf8')) as IcelandSafeStopCatalog;
}

export function getIcelandSafeStopById(
  poiId: string,
  cwd: string = process.cwd(),
): IcelandSafeStop | undefined {
  return loadIcelandSafeStopCatalog(cwd).stops.find((s) => s.poiId === poiId);
}

/**
 * Load road segment profiles from destination pack manifests.
 */

import { existsSync, readFileSync } from 'fs';
import { join } from 'path';
import { z } from 'zod';
import type { DestinationPackManifest } from '../contracts/destination-pack.types';
import type {
  RoadSegmentProfile,
  RoadSegmentProfileBundle,
} from './road-segment-profile.types';
import { normalizeDestinationCountryCode } from '../loader/country-pack-registry.util';

const roadClass = z.enum([
  'PRIMARY',
  'SECONDARY',
  'HIGHLAND_F_ROAD',
  'LOCAL',
  'TRACK',
]);

const surfaceType = z.enum([
  'PAVED',
  'GRAVEL',
  'MIXED',
  'UNPAVED',
  'UNKNOWN',
]);

const terrainType = z.enum([
  'LOWLAND',
  'MOUNTAIN',
  'HIGHLAND',
  'COASTAL',
  'GLACIAL_RIVER',
]);

const profileSchema = z.object({
  roadId: z.string(),
  segmentId: z.string(),
  roadClass,
  surfaceType,
  terrainType,
  requires4wd: z.boolean(),
  minVehicleClass: z.string().optional(),
  hasUnbridgedRiver: z.boolean(),
  riverCrossingCount: z.number().optional(),
  typicalSpeedKph: z.number().optional(),
  winterServiceLevel: z.string().optional(),
});

const bundleSchema = z.object({
  schemaId: z.literal('tripnara.road_segment_profiles@v1'),
  countryCode: z.string(),
  version: z.string(),
  roadRegions: z.record(z.string(), z.array(z.string())),
  profiles: z.array(profileSchema),
});

function resolvePacksRoot(): string {
  return join(process.cwd(), 'data/destination-packs');
}

export function loadRoadSegmentProfileBundleFromPath(
  fullPath: string,
): RoadSegmentProfileBundle {
  if (!existsSync(fullPath)) {
    throw new Error(`Road segment profile bundle not found: ${fullPath}`);
  }
  const raw = JSON.parse(readFileSync(fullPath, 'utf8')) as unknown;
  return bundleSchema.parse(raw) as RoadSegmentProfileBundle;
}

export function loadRoadSegmentProfilesForManifest(
  manifest: DestinationPackManifest,
  options?: { countryDir?: string },
): RoadSegmentProfileBundle | null {
  const root = resolvePacksRoot();
  for (const ref of manifest.roadProfileBundles ?? []) {
    const countryDir =
      options?.countryDir ??
      join(root, manifest.scope.countries?.[0]?.toLowerCase() ?? '');
    const candidates = [
      join(countryDir, ref.path),
      join(root, ref.path),
    ].filter((p) => existsSync(p));
    if (candidates.length === 0) continue;
    return loadRoadSegmentProfileBundleFromPath(candidates[0]);
  }
  return null;
}

export function loadRoadSegmentProfilesForCountry(
  rawCountry?: string | null,
): RoadSegmentProfileBundle | null {
  const country = normalizeDestinationCountryCode(rawCountry);
  if (!country) return null;
  const cc = country.trim().toLowerCase();
  const countryDir = join(resolvePacksRoot(), cc);
  const manifestPath = join(countryDir, 'destination.pack.json');
  if (!existsSync(manifestPath)) return null;
  const manifest = JSON.parse(
    readFileSync(manifestPath, 'utf8'),
  ) as DestinationPackManifest;
  return loadRoadSegmentProfilesForManifest(manifest, { countryDir });
}

export function resolveRoadSegmentProfile(
  roadId: string,
  bundle: RoadSegmentProfileBundle,
): RoadSegmentProfile | null {
  return bundle.profiles.find((p) => p.roadId === roadId) ?? null;
}

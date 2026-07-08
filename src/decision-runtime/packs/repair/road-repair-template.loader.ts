/**
 * Load Neptune road repair templates from destination pack manifests.
 */

import { existsSync, readFileSync } from 'fs';
import { join } from 'path';
import { z } from 'zod';
import type { DestinationPackManifest } from '../contracts/destination-pack.types';
import type { RoadRepairTemplateBundle } from './road-repair-template.types';
import { normalizeDestinationCountryCode } from '../loader/country-pack-registry.util';

const experienceCategory = z.enum([
  'GLACIER',
  'WATERFALL',
  'HIGHLAND',
  'GEOTHERMAL',
  'COAST',
]);

const templateSchema = z.object({
  templateId: z.string(),
  generationMethod: z.enum([
    'ONTOLOGY_EQUIVALENCE',
    'ROUTE_REPAIR',
    'LOCAL_SUBSTITUTION',
    'TEMPLATE',
    'LLM_ASSISTED',
  ]),
  regionCodes: z.array(z.string()),
  experienceCategories: z.array(experienceCategory),
  intentRefs: z.array(z.string()),
  requiresOpenRoadIds: z.array(z.string()),
  substitutePoiId: z.string().optional(),
  routeBypassRoadId: z.string().optional(),
  estimatedIntentPreservation: z.number(),
  estimatedAddedDurationMinutes: z.number(),
  estimatedAddedCostIsk: z.number(),
  maxBudgetIsk: z.number().optional(),
  minUrgency: z.enum(['LOW', 'MEDIUM', 'HIGH', 'CRITICAL']).optional(),
});

const bundleSchema = z.object({
  schemaId: z.literal('tripnara.road_repair_templates@v1'),
  countryCode: z.string(),
  roadRegions: z.record(z.string(), z.array(z.string())),
  poiIntent: z.record(
    z.string(),
    z.object({
      intents: z.array(z.string()),
      categories: z.array(experienceCategory),
    }),
  ),
  templates: z.array(templateSchema),
});

function resolvePacksRoot(): string {
  return join(process.cwd(), 'data/destination-packs');
}

export function loadRoadRepairTemplateBundleFromPath(
  fullPath: string,
): RoadRepairTemplateBundle {
  if (!existsSync(fullPath)) {
    throw new Error(`Road repair template bundle not found: ${fullPath}`);
  }
  const raw = JSON.parse(readFileSync(fullPath, 'utf8')) as unknown;
  return bundleSchema.parse(raw) as RoadRepairTemplateBundle;
}

export function loadRoadRepairTemplatesForManifest(
  manifest: DestinationPackManifest,
  options?: { countryDir?: string },
): RoadRepairTemplateBundle | null {
  const root = resolvePacksRoot();
  for (const ref of manifest.repairTemplateBundles ?? []) {
    const countryDir =
      options?.countryDir ??
      join(root, manifest.scope.countries?.[0]?.toLowerCase() ?? '');
    const candidates = [
      join(countryDir, ref.path),
      join(root, ref.path),
    ].filter((p) => existsSync(p));
    if (candidates.length === 0) continue;
    return loadRoadRepairTemplateBundleFromPath(candidates[0]);
  }
  return null;
}

export function loadRoadRepairTemplatesForCountry(
  rawCountry?: string | null,
): RoadRepairTemplateBundle | null {
  const country = normalizeDestinationCountryCode(rawCountry);
  if (!country) return null;
  const cc = country.trim().toLowerCase();
  const countryDir = join(resolvePacksRoot(), cc);
  const manifestPath = join(countryDir, 'destination.pack.json');
  if (!existsSync(manifestPath)) return null;
  const manifest = JSON.parse(
    readFileSync(manifestPath, 'utf8'),
  ) as DestinationPackManifest;
  return loadRoadRepairTemplatesForManifest(manifest, { countryDir });
}

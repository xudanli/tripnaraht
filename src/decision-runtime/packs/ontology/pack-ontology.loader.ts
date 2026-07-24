/**
 * Load ontology mapping bundles referenced by DestinationPackManifest.
 */

import { existsSync, readFileSync } from 'fs';
import { join } from 'path';
import { z } from 'zod';
import type { DestinationPackManifest } from '../contracts/destination-pack.types';
import type {
  DestinationRoadOntologyBundle,
  DestinationRoadOntologyNode,
} from './destination-road-ontology.types';

const nodeSchema = z.object({
  ontologyNodeId: z.string().min(1),
  kind: z.enum(['Region', 'Corridor', 'Road']),
  labelZh: z.string(),
  labelEn: z.string(),
  roadRefsZh: z.string().optional(),
  roadIsKeys: z.array(z.string()).min(1),
  roadIds: z.array(z.string()).optional(),
  regionCodes: z.array(z.string()).optional(),
  segmentType: z.enum(['HIGHWAY', 'F_ROAD', 'CITY']).optional(),
  spatialSegmentId: z.string().optional(),
  messageTriggersLower: z.array(z.string()).optional(),
  tripDraftSignals: z.array(z.string()).optional(),
});

const bundleSchema = z.object({
  schemaId: z.string(),
  countryCode: z.string(),
  version: z.string(),
  nodes: z.array(nodeSchema).min(1),
  spatialSeed: z
    .object({
      pois: z.array(
        z.object({
          id: z.string(),
          name: z.string(),
          coordinates: z.object({ lat: z.number(), lng: z.number() }),
          closed: z.boolean().optional(),
        }),
      ),
      segments: z.array(
        z.object({
          id: z.string(),
          from_poi_id: z.string(),
          to_poi_id: z.string(),
          segment_type: z.enum(['HIGHWAY', 'F_ROAD', 'CITY']),
          ontologyNodeId: z.string().optional(),
          rules: z.record(z.string(), z.unknown()).optional(),
          seasonal_closures: z
            .array(
              z.object({
                start: z.string(),
                end: z.string(),
                reason: z.string().optional(),
              }),
            )
            .optional(),
          road_condition: z
            .object({
              surface: z.string().optional(),
              status: z.string().optional(),
            })
            .optional(),
        }),
      ),
    })
    .optional(),
});

function resolvePacksRoot(): string {
  return join(process.cwd(), 'data/destination-packs');
}

function loadOntologyFromPath(fullPath: string): DestinationRoadOntologyBundle {
  if (!existsSync(fullPath)) {
    throw new Error(`Ontology bundle not found: ${fullPath}`);
  }
  const raw = JSON.parse(readFileSync(fullPath, 'utf8')) as unknown;
  return bundleSchema.parse(raw) as DestinationRoadOntologyBundle;
}

export function loadOntologyBundleFile(relativePath: string): DestinationRoadOntologyBundle {
  const fullPath = join(resolvePacksRoot(), relativePath);
  return loadOntologyFromPath(fullPath);
}

export function loadOntologyForManifest(
  manifest: DestinationPackManifest,
  options?: { countryDir?: string },
): DestinationRoadOntologyBundle | null {
  const root = resolvePacksRoot();
  const refs = manifest.ontologyMappings ?? [];
  if (!refs.length) return null;

  for (const ref of refs) {
    const candidates = [
      options?.countryDir ? join(options.countryDir, ref.path) : undefined,
      join(root, ref.path),
      options?.countryDir
        ? join(root, options.countryDir.split('/').pop() ?? '', ref.path)
        : undefined,
    ].filter((p): p is string => Boolean(p));
    const fullPath = candidates.find((p) => existsSync(p));
    if (!fullPath) continue;
    return loadOntologyFromPath(fullPath);
  }
  return null;
}

export function loadCountryRoadOntology(countryCode: string): DestinationRoadOntologyBundle | null {
  const cc = countryCode.trim().toLowerCase();
  const countryDir = join(resolvePacksRoot(), cc);
  const manifestPath = join(countryDir, 'destination.pack.json');
  if (!existsSync(manifestPath)) return null;
  const manifest = JSON.parse(readFileSync(manifestPath, 'utf8')) as DestinationPackManifest;
  return loadOntologyForManifest(manifest, { countryDir });
}

export function indexOntologyNodes(
  bundle: DestinationRoadOntologyBundle,
): Map<string, DestinationRoadOntologyNode> {
  return new Map(bundle.nodes.map((n) => [n.ontologyNodeId, n]));
}

export function roadIsKeysForNode(
  bundle: DestinationRoadOntologyBundle | null | undefined,
  ontologyNodeId: string,
): readonly string[] {
  if (!bundle) return [];
  const node = bundle.nodes.find((n) => n.ontologyNodeId === ontologyNodeId);
  return node?.roadIsKeys ?? [];
}

export function regionAndCorridorNodes(
  bundle: DestinationRoadOntologyBundle,
): DestinationRoadOntologyNode[] {
  return bundle.nodes.filter((n) => n.kind === 'Region' || n.kind === 'Corridor');
}

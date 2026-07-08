/**
 * Load rule bundles referenced by DestinationPackManifest.
 */

import { existsSync, readFileSync } from 'fs';
import { join } from 'path';
import { z } from 'zod';
import type { DestinationPackRule, DestinationRuleBundle } from './destination-rule.types';
import type { DestinationPackManifest } from '../contracts/destination-pack.types';

const ruleSchema = z.object({
  ruleId: z.string(),
  semanticKey: z.string(),
  appliesWhen: z
    .object({
      country: z.string().optional(),
      activityType: z.string().optional(),
    })
    .optional(),
  conditions: z.array(
    z.object({
      field: z.string(),
      operator: z.enum(['EQ', 'NEQ', 'GTE', 'LTE', 'IN']),
      value: z.union([z.string(), z.number(), z.boolean()]).optional(),
      values: z.array(z.string()).optional(),
    }),
  ),
  result: z.object({
    verdict: z.enum(['BLOCK', 'WARNING', 'PASS', 'UNKNOWN']),
    reasonCode: z.string(),
    overridable: z.boolean(),
    constraintCode: z.string().optional(),
  }),
  whenCandidateUsesRoute: z.boolean().optional(),
});

const bundleSchema = z.object({
  schemaId: z.string(),
  rules: z.array(ruleSchema),
});

function resolvePacksRoot(): string {
  return join(process.cwd(), 'data/destination-packs');
}

export function loadRuleBundleFile(relativePath: string): DestinationRuleBundle {
  const fullPath = join(resolvePacksRoot(), relativePath);
  return loadRuleBundleFromPath(fullPath);
}

function loadRuleBundleFromPath(fullPath: string): DestinationRuleBundle {
  if (!existsSync(fullPath)) {
    throw new Error(`Rule bundle not found: ${fullPath}`);
  }
  const raw = JSON.parse(readFileSync(fullPath, 'utf8')) as unknown;
  return bundleSchema.parse(raw) as DestinationRuleBundle;
}

export function loadRulesForManifest(
  manifest: DestinationPackManifest,
  options?: { countryDir?: string },
): DestinationPackRule[] {
  const rules: DestinationPackRule[] = [];
  const root = resolvePacksRoot();
  for (const ref of manifest.ruleBundles ?? []) {
    const candidates = [
      options?.countryDir ? join(options.countryDir, ref.path) : undefined,
      join(root, ref.path),
      options?.countryDir
        ? join(root, options.countryDir.split('/').pop() ?? '', ref.path)
        : undefined,
    ].filter((p): p is string => Boolean(p));
    const fullPath = candidates.find((p) => existsSync(p));
    if (!fullPath) continue;
    const bundle = loadRuleBundleFromPath(fullPath);
    rules.push(...bundle.rules);
  }
  return rules;
}

export function loadCountryPackRules(countryCode: string): DestinationPackRule[] {
  const cc = countryCode.trim().toLowerCase();
  const countryDir = join(resolvePacksRoot(), cc);
  const manifestPath = join(countryDir, 'destination.pack.json');
  if (!existsSync(manifestPath)) return [];
  const manifest = JSON.parse(readFileSync(manifestPath, 'utf8')) as DestinationPackManifest;
  return loadRulesForManifest(manifest, { countryDir });
}

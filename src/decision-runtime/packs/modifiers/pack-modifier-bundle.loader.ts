/**
 * Load environment modifier bundles referenced by DestinationPackManifest.
 * Overlay order: Country overrides Global (RFC-002 §5).
 */

import { existsSync, readFileSync } from 'fs';
import { join } from 'path';
import { z } from 'zod';
import type { DestinationPackManifest } from '../contracts/destination-pack.types';
import type {
  ActivityLoadEnvironmentParams,
  DrivingEnvironmentParams,
  EnvironmentModifierBundle,
  EnvironmentModifierEntry,
} from './environment-modifier.types';
import { DEFAULT_ACTIVITY_LOAD_ENVIRONMENT } from './environment-modifier.types';
import { isDestinationPackRuntimeEnabled } from '../config/destination-pack.config';
import {
  DRIVING_ESTIMATION_CONFIG,
  DRIVING_SAFETY_CONFIG,
} from '../../../trips/decision/optimization/learning/guardian-persona.interface';
import { effectiveDailyLoadThresholdHours } from './apply-outdoor-load-modifiers.util';

const modifierSchema = z.object({
  modifierId: z.string(),
  domain: z.string(),
  semanticKeys: z.array(z.string()).optional(),
  parameters: z.record(z.string(), z.union([z.number(), z.string(), z.boolean()])),
});

const bundleSchema = z.object({
  schemaId: z.string(),
  modifiers: z.array(modifierSchema),
});

function resolvePacksRoot(): string {
  return join(process.cwd(), 'data/destination-packs');
}

export function loadModifierBundleFromPath(fullPath: string): EnvironmentModifierBundle {
  if (!existsSync(fullPath)) {
    throw new Error(`Modifier bundle not found: ${fullPath}`);
  }
  const raw = JSON.parse(readFileSync(fullPath, 'utf8')) as unknown;
  return bundleSchema.parse(raw) as EnvironmentModifierBundle;
}

export function loadModifiersForManifest(
  manifest: DestinationPackManifest,
  options?: { countryDir?: string },
): EnvironmentModifierEntry[] {
  const modifiers: EnvironmentModifierEntry[] = [];
  const root = resolvePacksRoot();
  for (const ref of manifest.environmentModifiers ?? []) {
    const candidates = [
      options?.countryDir ? join(options.countryDir, ref.path) : undefined,
      join(root, ref.path),
      options?.countryDir
        ? join(root, options.countryDir.split('/').pop() ?? '', ref.path)
        : undefined,
    ].filter((p): p is string => Boolean(p));
    const fullPath = candidates.find((p) => existsSync(p));
    if (!fullPath) continue;
    const bundle = loadModifierBundleFromPath(fullPath);
    modifiers.push(...bundle.modifiers);
  }
  return modifiers;
}

export function loadGlobalPackModifiers(): EnvironmentModifierEntry[] {
  const manifestPath = join(resolvePacksRoot(), 'global', 'destination.pack.json');
  if (!existsSync(manifestPath)) return [];
  const manifest = JSON.parse(readFileSync(manifestPath, 'utf8')) as DestinationPackManifest;
  return loadModifiersForManifest(manifest, {
    countryDir: join(resolvePacksRoot(), 'global'),
  });
}

export function loadCountryPackModifiers(countryCode: string): EnvironmentModifierEntry[] {
  const cc = countryCode.trim().toLowerCase();
  const countryDir = join(resolvePacksRoot(), cc);
  const manifestPath = join(countryDir, 'destination.pack.json');
  if (!existsSync(manifestPath)) return [];
  const manifest = JSON.parse(readFileSync(manifestPath, 'utf8')) as DestinationPackManifest;
  return loadModifiersForManifest(manifest, { countryDir });
}

/** Global layer first, then country — later entries override parameter keys. */
export function loadMergedPackModifiers(country?: string): EnvironmentModifierEntry[] {
  const global = loadGlobalPackModifiers();
  if (!country?.trim()) return global;
  return [...global, ...loadCountryPackModifiers(country)];
}

function readDrivingParams(modifiers: EnvironmentModifierEntry[]): Partial<DrivingEnvironmentParams> {
  const merged: Partial<DrivingEnvironmentParams> = {};
  for (const entry of modifiers.filter((m) => m.domain === 'driving')) {
    const hours = entry.parameters.baseSafeHours;
    const speed = entry.parameters.defaultSpeedKmH;
    if (typeof hours === 'number') merged.baseSafeHours = hours;
    if (typeof speed === 'number') merged.defaultSpeedKmH = speed;
  }
  return merged;
}

function readActivityLoadParams(
  modifiers: EnvironmentModifierEntry[],
): ActivityLoadEnvironmentParams {
  const merged: ActivityLoadEnvironmentParams = { ...DEFAULT_ACTIVITY_LOAD_ENVIRONMENT };
  for (const entry of modifiers.filter((m) => m.domain === 'activity')) {
    const wind = entry.parameters.windExposureMultiplier;
    const fatigue = entry.parameters.highlandFatigueFactor;
    if (typeof wind === 'number') merged.windExposureMultiplier = wind;
    if (typeof fatigue === 'number') merged.highlandFatigueFactor = fatigue;
  }
  return merged;
}

export function resolveDrivingEnvironmentForCountry(
  country?: string,
): DrivingEnvironmentParams {
  const codeDefaults: DrivingEnvironmentParams = {
    baseSafeHours: DRIVING_SAFETY_CONFIG.baseSafeHours,
    defaultSpeedKmH: DRIVING_ESTIMATION_CONFIG.defaultSpeedKmH,
  };
  if (!isDestinationPackRuntimeEnabled()) {
    return codeDefaults;
  }
  const fromPack = readDrivingParams(loadMergedPackModifiers(country));
  return {
    baseSafeHours: fromPack.baseSafeHours ?? codeDefaults.baseSafeHours,
    defaultSpeedKmH: fromPack.defaultSpeedKmH ?? codeDefaults.defaultSpeedKmH,
  };
}

export function resolveActivityLoadEnvironmentForCountry(
  country?: string,
): ActivityLoadEnvironmentParams {
  if (!isDestinationPackRuntimeEnabled() || !country?.trim()) {
    return { ...DEFAULT_ACTIVITY_LOAD_ENVIRONMENT };
  }
  return readActivityLoadParams(loadMergedPackModifiers(country));
}

/** Driving threshold after outdoor fatigue modifier (Slice 3 scan path). */
export function resolveEffectiveDailyLoadThresholdForCountry(
  country?: string,
): number {
  const driving = resolveDrivingEnvironmentForCountry(country);
  const activity = resolveActivityLoadEnvironmentForCountry(country);
  return effectiveDailyLoadThresholdHours(
    driving.baseSafeHours,
    activity.highlandFatigueFactor,
  );
}

export function listCountryDrivingModifierIds(countryCode: string): string[] {
  return loadMergedPackModifiers(countryCode)
    .filter((m) => m.domain === 'driving')
    .map((m) => m.modifierId);
}

export function listGlobalDrivingModifierIds(): string[] {
  return loadGlobalPackModifiers()
    .filter((m) => m.domain === 'driving')
    .map((m) => m.modifierId);
}

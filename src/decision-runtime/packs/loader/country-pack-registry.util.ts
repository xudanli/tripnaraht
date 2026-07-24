/**
 * RFC-002 Phase 3 — destination-agnostic country pack lookup (filesystem registry).
 */

import { existsSync, readFileSync } from 'fs';
import { join } from 'path';

export function normalizeDestinationCountryCode(
  raw?: string | null,
): string | undefined {
  const d = raw?.trim().toUpperCase();
  if (!d) return undefined;
  if (d === 'ICELAND') return 'IS';
  if (d === 'NEW ZEALAND' || d === 'NEW_ZEALAND') return 'NZ';
  return d;
}

function resolvePacksRoot(): string {
  return join(process.cwd(), 'data/destination-packs');
}

/** True when an ACTIVE (or SHADOW) country pack manifest exists on disk. */
export function countryHasActiveDestinationPack(countryCode: string): boolean {
  const cc = countryCode.trim().toLowerCase();
  if (!cc) return false;
  const manifestPath = join(resolvePacksRoot(), cc, 'destination.pack.json');
  if (!existsSync(manifestPath)) return false;
  try {
    const manifest = JSON.parse(readFileSync(manifestPath, 'utf8')) as {
      status?: string;
    };
    return manifest.status === 'ACTIVE' || manifest.status === 'SHADOW';
  } catch {
    return false;
  }
}

export function resolveTripDestinationCountry(
  raw?: string | null,
): string | undefined {
  const normalized = normalizeDestinationCountryCode(raw);
  if (!normalized) return undefined;
  return normalized;
}

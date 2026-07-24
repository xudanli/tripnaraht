/**
 * Load auditable planning-signoff bundle for M4 release gate.
 */

import { existsSync, readFileSync } from 'fs';
import { join } from 'path';
import type {
  PlanningSignoffArtifact,
  PlanningSignoffBundle,
  PlanningSignoffKind,
  PlanningSignoffManifest,
} from './types';

export const PLANNING_SIGNOFF_ROOT = join(
  process.cwd(),
  'src/decision-runtime/solver/lab/planning-signoff',
);

function readJson<T>(path: string): T | undefined {
  if (!existsSync(path)) return undefined;
  try {
    return JSON.parse(readFileSync(path, 'utf8')) as T;
  } catch {
    return undefined;
  }
}

function resolveBundleDir(root: string, preferredDate?: string): string | undefined {
  if (preferredDate) {
    const d = join(root, preferredDate);
    return existsSync(join(d, 'manifest.json')) ? d : undefined;
  }
  const current = readFileSync(join(root, 'CURRENT'), 'utf8').trim();
  if (current) {
    const d = join(root, current);
    if (existsSync(join(d, 'manifest.json'))) return d;
  }
  return undefined;
}

function loadKind(
  dir: string,
  kind: PlanningSignoffKind,
): PlanningSignoffArtifact | undefined {
  return readJson<PlanningSignoffArtifact>(join(dir, `${kind}.json`));
}

/** True when artifact is an engineering/release PASS for gate purposes. */
export function isSignoffArtifactSatisfied(
  art: PlanningSignoffArtifact | undefined,
  opts?: { allowReady?: boolean },
): boolean {
  if (!art || !art.approved) return false;
  if (art.status === 'PASS') return true;
  if (opts?.allowReady && art.status === 'READY') return true;
  return false;
}

export function loadPlanningSignoffBundle(input?: {
  root?: string;
  date?: string;
}): PlanningSignoffBundle | undefined {
  const root = input?.root ?? PLANNING_SIGNOFF_ROOT;
  let dir: string | undefined;
  try {
    dir = resolveBundleDir(root, input?.date);
  } catch {
    dir = undefined;
  }
  if (!dir) return undefined;

  const manifest = readJson<PlanningSignoffManifest>(join(dir, 'manifest.json'));
  if (!manifest) return undefined;

  return {
    root: dir,
    date: manifest.date,
    manifest,
    stability: loadKind(dir, 'stability'),
    locality: loadKind(dir, 'locality'),
    gateway: loadKind(dir, 'gateway'),
    rollback: loadKind(dir, 'rollback'),
    authority: loadKind(dir, 'authority'),
  };
}

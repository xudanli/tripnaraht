/**
 * File-backed formal shadow observation window (v2 snapshots only).
 */

import { randomUUID } from 'crypto';
import * as fs from 'fs';
import * as path from 'path';
import type {
  ExecutionRiskShadowComparison,
  ShadowMismatchAdjudication,
  ShadowObservationDataset,
  ShadowObservationSnapshot,
} from './execution-risk-shadow-compare.types';
import { DEFAULT_SHADOW_OBSERVATION_TARGETS } from './execution-risk-shadow-compare.types';
import { comparisonIdFor } from './execution-risk-cutover-gates.util';
import {
  buildCutoverBuildMetadata,
  isFormalShadowSchema,
  shadowSnapshotDedupKey,
  sourceFactVersionFromSourceKeys,
} from './execution-risk-cutover-build-metadata.util';
import type { ExecutionRiskCutoverBuildMetadata } from './execution-risk-shadow-compare.types';
import {
  assertClusterVisibilityConsistency,
  clusterVisibilityStructureValid,
} from './cluster-visibility-consistency.util';

const DEFAULT_DIR = path.join(process.cwd(), 'artifacts', 'execution-risk-staging-validation');
const DATASET_FILE = 'shadow-observation-dataset.json';
const ADJUDICATION_FILE = 'shadow-adjudications.json';
const ARCHIVE_FILE = 'shadow-observation-dataset-archived-pre-v2.json';

function readJson<T>(filePath: string, fallback: T): T {
  if (!fs.existsSync(filePath)) return fallback;
  return JSON.parse(fs.readFileSync(filePath, 'utf8')) as T;
}

function writeJson(filePath: string, data: unknown): void {
  fs.mkdirSync(path.dirname(filePath), { recursive: true });
  fs.writeFileSync(filePath, JSON.stringify(data, null, 2));
}

function emptyDataset(buildSha?: string): ShadowObservationDataset {
  return {
    schemaId: 'tripnara.execution_risk_shadow_observation@v2',
    generatedAt: new Date().toISOString(),
    observationWindowOpenedAt: new Date().toISOString(),
    activeBuildSha: buildSha,
    targets: DEFAULT_SHADOW_OBSERVATION_TARGETS,
    snapshotCount: 0,
    uniqueTripCount: 0,
    highCriticalInstanceCount: 0,
    formalSnapshots: [],
    legacySnapshotsExcluded: 0,
    adjudications: [],
    pendingAdjudicationCount: 0,
  };
}

function migrateDataset(raw: unknown, outDir: string): ShadowObservationDataset {
  if (!raw || typeof raw !== 'object') return emptyDataset();

  const obj = raw as Record<string, unknown>;
  if (obj.schemaId === 'tripnara.execution_risk_shadow_observation@v2') {
    return obj as unknown as ShadowObservationDataset;
  }

  const legacySnapshots = (obj.snapshots as ExecutionRiskShadowComparison[] | undefined) ?? [];
  writeJson(path.join(outDir, ARCHIVE_FILE), {
    archivedAt: new Date().toISOString(),
    reason: 'pre-v2 schema — excluded from formal observation window',
    snapshotCount: legacySnapshots.length,
    snapshots: legacySnapshots,
  });

  return {
    ...emptyDataset(),
    legacySnapshotsExcluded: legacySnapshots.length,
  };
}

function recomputeStats(snapshots: ShadowObservationSnapshot[], adjudications: ShadowMismatchAdjudication[]) {
  const uniqueTripCount = new Set(snapshots.map((s) => s.tripId)).size;
  const highCriticalInstanceCount = snapshots.reduce((sum, s) => {
    const c = s.comparison;
    const high =
      c.canonical.topLevel === 'STOP' ||
      c.canonical.topLevel === 'REPLAN_REQUIRED' ||
      c.legacy.topLevel === 'STOP' ||
      c.legacy.topLevel === 'REPLAN_REQUIRED';
    return sum + (high ? 1 : 0);
  }, 0);

  const pendingAdjudicationCount = snapshots.filter((s) => {
    if (!s.comparison.diverged) return false;
    const id = comparisonIdFor(s.comparison);
    return !adjudications.some((a) => a.comparisonId === id);
  }).length;

  return { uniqueTripCount, highCriticalInstanceCount, pendingAdjudicationCount };
}

export function wrapFormalShadowSnapshot(input: {
  comparison: ExecutionRiskShadowComparison;
  build?: Partial<ExecutionRiskCutoverBuildMetadata>;
  planVersionId?: string;
}): ShadowObservationSnapshot | null {
  if (!isFormalShadowSchema(input.comparison)) return null;
  if (!clusterVisibilityStructureValid(input.comparison.semanticComparison?.clusterVisibility)) {
    return null;
  }

  const cv = input.comparison.semanticComparison.clusterVisibility;
  const consistency = assertClusterVisibilityConsistency(cv);
  const capturedAt = input.comparison.comparedAt;
  const sourceFactVersion = sourceFactVersionFromSourceKeys(input.comparison.canonical.sourceKeys);
  const planVersionId = input.planVersionId ?? input.comparison.planVersionId ?? 'unknown';
  const dedupKey = shadowSnapshotDedupKey({
    tripId: input.comparison.tripId,
    sourceFactVersion,
    planVersionId,
    capturedAt,
  });

  return {
    snapshotId: randomUUID(),
    tripId: input.comparison.tripId,
    capturedAt,
    dedupKey,
    sourceFactVersion,
    planVersionId,
    build: buildCutoverBuildMetadata(input.build),
    comparison: input.comparison,
    clusterVisibilityConsistent: consistency.pass,
    clusterVisibilityViolations: consistency.violations,
  };
}

export function appendFormalShadowSnapshot(
  input: {
    comparison: ExecutionRiskShadowComparison;
    build?: Partial<ExecutionRiskCutoverBuildMetadata>;
    planVersionId?: string;
  },
  outDir = DEFAULT_DIR,
): { dataset: ShadowObservationDataset; appended: boolean; snapshot?: ShadowObservationSnapshot } {
  const formal = wrapFormalShadowSnapshot(input);
  if (!formal) {
    return { dataset: loadShadowObservationDataset(outDir) ?? emptyDataset(), appended: false };
  }

  const datasetPath = path.join(outDir, DATASET_FILE);
  const existing = migrateDataset(readJson(datasetPath, null), outDir);
  const adjudications = readJson<ShadowMismatchAdjudication[]>(path.join(outDir, ADJUDICATION_FILE), []);

  const duplicate = existing.formalSnapshots.some((s) => s.dedupKey === formal.dedupKey);
  const formalSnapshots = duplicate
    ? existing.formalSnapshots
    : [...existing.formalSnapshots, formal];

  const stats = recomputeStats(formalSnapshots, adjudications);
  const dataset: ShadowObservationDataset = {
    ...existing,
    generatedAt: new Date().toISOString(),
    activeBuildSha: formal.build.appBuildSha,
    snapshotCount: formalSnapshots.length,
    formalSnapshots,
    adjudications,
    ...stats,
  };

  writeJson(datasetPath, dataset);
  return { dataset, appended: !duplicate, snapshot: formal };
}

export function loadShadowObservationDataset(outDir = DEFAULT_DIR): ShadowObservationDataset | null {
  const datasetPath = path.join(outDir, DATASET_FILE);
  const raw = readJson<unknown>(datasetPath, null);
  if (!raw) return null;
  return migrateDataset(raw, outDir);
}

/** Append-only adjudication history — never overwrites prior records. */
export function appendShadowAdjudication(
  adjudication: Omit<ShadowMismatchAdjudication, 'adjudicationId' | 'recordedAt'> & {
    adjudicationId?: string;
    recordedAt?: string;
  },
  outDir = DEFAULT_DIR,
): ShadowMismatchAdjudication[] {
  const filePath = path.join(outDir, ADJUDICATION_FILE);
  const list = readJson<ShadowMismatchAdjudication[]>(filePath, []);
  const entry: ShadowMismatchAdjudication = {
    ...adjudication,
    adjudicationId: adjudication.adjudicationId ?? randomUUID(),
    recordedAt: adjudication.recordedAt ?? new Date().toISOString(),
  };
  list.push(entry);
  writeJson(filePath, list);

  const dataset = loadShadowObservationDataset(outDir);
  if (dataset) {
    const stats = recomputeStats(dataset.formalSnapshots, list);
    writeJson(path.join(outDir, DATASET_FILE), {
      ...dataset,
      adjudications: list,
      ...stats,
      generatedAt: new Date().toISOString(),
    });
  }

  return list;
}

export function resetShadowObservationWindow(outDir = DEFAULT_DIR, reason = 'new build / schema gate'): ShadowObservationDataset {
  const datasetPath = path.join(outDir, DATASET_FILE);
  const existing = readJson<unknown>(datasetPath, null);
  if (existing) {
    writeJson(path.join(outDir, `shadow-observation-reset-${Date.now()}.json`), {
      resetAt: new Date().toISOString(),
      reason,
      previous: existing,
    });
  }
  const fresh = emptyDataset(resolveAppBuildShaFromEnv());
  writeJson(datasetPath, fresh);
  return fresh;
}

function resolveAppBuildShaFromEnv(): string {
  return process.env.APP_BUILD_SHA ?? process.env.GIT_COMMIT_SHA ?? 'local-dev';
}

export function observationWindowReady(dataset: ShadowObservationDataset): boolean {
  return (
    dataset.uniqueTripCount >= dataset.targets.minTrips &&
    dataset.snapshotCount >= dataset.targets.minSnapshots &&
    dataset.highCriticalInstanceCount >= dataset.targets.minHighCriticalInstances &&
    dataset.pendingAdjudicationCount === 0
  );
}

// backward-compatible alias
export const appendShadowObservationSnapshot = appendFormalShadowSnapshot;

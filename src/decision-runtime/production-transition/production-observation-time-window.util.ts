/**
 * Observation time window — anchor on production-observation baseline (not selective closure alone).
 */

import * as fs from 'node:fs';
import * as path from 'node:path';

export interface ProductionObservationTimeWindowView {
  requiredDays: number;
  /** Hours since observation baseline.startedAt (primary). */
  elapsedDays: number;
  /** UTC calendar days with daily/ archive since baseline (must align with elapsed for sign-off). */
  archivedDays: number;
  timePass: boolean;
  observationStartedAt: string | null;
  selectiveClosureAt: string | null;
  selectiveClosureOverall: string | null;
  anchorSource: 'observation-baseline' | 'selective-closure-fallback';
}

function readJson<T>(filePath: string): T | null {
  try {
    return JSON.parse(fs.readFileSync(filePath, 'utf8')) as T;
  } catch {
    return null;
  }
}

function countArchivedDaysSince(
  dailyDir: string,
  startedAtMs: number,
): number {
  if (!fs.existsSync(dailyDir)) return 0;
  const startDay = new Date(startedAtMs).toISOString().slice(0, 10);
  return fs
    .readdirSync(dailyDir)
    .filter((f) => f.endsWith('.json') && f.slice(0, 10) >= startDay).length;
}

export function readProductionObservationTimeWindow(
  root = process.cwd(),
): ProductionObservationTimeWindowView {
  const minDays = Number(process.env.CANONICAL_DEFAULT_MIN_OBSERVATION_DAYS ?? '30');

  const baseline = readJson<{
    startedAt?: string;
    selectiveClosureAt?: string | null;
    selectiveClosureOverall?: string | null;
  }>(path.join(root, 'artifacts/production-observation/baseline.json'));

  const closure = readJson<{ overall?: string; generatedAt?: string }>(
    path.join(root, 'artifacts/p4-phase-status/closure.json'),
  );

  const anchorIso = baseline?.startedAt ?? closure?.generatedAt ?? null;
  const anchorAt = anchorIso ? Date.parse(anchorIso) : NaN;
  const elapsedMs = Number.isFinite(anchorAt) ? Date.now() - anchorAt : 0;
  const elapsedDays = elapsedMs / (24 * 60 * 60 * 1000);

  const archivedDays = Number.isFinite(anchorAt)
    ? countArchivedDaysSince(path.join(root, 'artifacts/production-observation/daily'), anchorAt)
    : 0;

  const selectiveReady = closure?.overall === 'CANONICAL_SELECTIVE_READY';
  const durationSatisfied = elapsedDays >= minDays && archivedDays >= minDays;

  return {
    requiredDays: minDays,
    elapsedDays,
    archivedDays,
    timePass: selectiveReady && durationSatisfied,
    observationStartedAt: baseline?.startedAt ?? null,
    selectiveClosureAt: baseline?.selectiveClosureAt ?? closure?.generatedAt ?? null,
    selectiveClosureOverall:
      baseline?.selectiveClosureOverall ?? closure?.overall ?? null,
    anchorSource: baseline?.startedAt ? 'observation-baseline' : 'selective-closure-fallback',
  };
}

/**
 * Unified production transition status — observation dual-gate + flip advisory.
 */

import 'dotenv/config';
import { execSync } from 'child_process';
import * as fs from 'fs';
import * as path from 'path';
import { resolveProductionTransitionPhase } from '../../src/decision-runtime/production-transition/production-transition-phase.catalog';

const ROOT = process.cwd();
const OUT_DIR = path.join(ROOT, 'artifacts', 'production-observation');

function log(line: string) {
  console.log(`[${new Date().toISOString()}] [production-observation:status] ${line}`);
}

function readJson<T>(rel: string): T | null {
  try {
    return JSON.parse(fs.readFileSync(path.join(ROOT, rel), 'utf8')) as T;
  } catch {
    return null;
  }
}

function main() {
  try {
    execSync('npm run production-observation:collect', { cwd: ROOT, stdio: 'inherit' });
  } catch {
    execSync('npm run production-observation:report', { cwd: ROOT, stdio: 'inherit' });
  }

  try {
    execSync('npm run p4-production-flip:advisory', { cwd: ROOT, stdio: 'pipe' });
  } catch {
    // advisory may exit 1 when gates blocked
  }

  const observation = readJson<{
    overallDisposition?: string;
    blockers?: string[];
    categories?: Record<string, { disposition?: string }>;
    timeWindow?: {
      elapsedDays?: number;
      requiredDays?: number;
      archivedDays?: number;
      observationStartedAt?: string | null;
    };
    readiness?: {
      observationDurationSatisfied?: boolean;
      observationVolumeSatisfied?: boolean;
      observationCoverageSatisfied?: boolean;
      hardRedlinesPassed?: boolean;
      observationReady?: boolean;
      disposition?: string;
      durationDetail?: string;
      coverageDetail?: string;
      volumeBlockers?: string[];
      coverageBlockers?: string[];
      redlineBlockers?: string[];
      nextActions?: string[];
    };
    phase?: ReturnType<typeof resolveProductionTransitionPhase>;
  }>('artifacts/production-observation/report.json');

  const flip = readJson<{
    readyForProductionFlip?: boolean;
    automatedGatesPass?: boolean;
    blockers?: string[];
  }>('artifacts/p4-production-flip/advisory.json');

  const readiness = observation?.readiness;
  const phase = observation?.phase ?? resolveProductionTransitionPhase();

  const historyLines = fs.existsSync(path.join(OUT_DIR, 'history.jsonl'))
    ? fs.readFileSync(path.join(OUT_DIR, 'history.jsonl'), 'utf8').trim().split('\n').length
    : 0;

  const status = {
    schemaId: 'tripnara.production_observation_status@v2',
    generatedAt: new Date().toISOString(),
    phase,
    formalState: {
      engineeringComplete: true,
      productionObservationActive: true,
      canonicalProductionAuthority: false,
      legacyDeprecated: false,
    },
    observationStartedAt: observation?.timeWindow?.observationStartedAt ?? null,
    observationDisposition: observation?.overallDisposition ?? 'unknown',
    readinessDisposition: readiness?.disposition ?? 'INCOMPLETE',
    observationDurationSatisfied: readiness?.observationDurationSatisfied ?? false,
    observationVolumeSatisfied: readiness?.observationVolumeSatisfied ?? false,
    observationCoverageSatisfied: readiness?.observationCoverageSatisfied ?? false,
    hardRedlinesPassed: readiness?.hardRedlinesPassed ?? false,
    observationReady: readiness?.observationReady ?? false,
    durationDetail: readiness?.durationDetail ?? 'unknown',
    coverageDetail: readiness?.coverageDetail ?? 'unknown',
    observationBlockers: observation?.blockers ?? [],
    volumeBlockers: readiness?.volumeBlockers ?? [],
    coverageBlockers: readiness?.coverageBlockers ?? [],
    redlineBlockers: readiness?.redlineBlockers ?? [],
    observationWindow: observation?.timeWindow
      ? `${observation.timeWindow.elapsedDays?.toFixed(1)}/${observation.timeWindow.requiredDays}d`
      : 'unknown',
    archivedDays: observation?.timeWindow?.archivedDays ?? 0,
    dailySnapshots: historyLines,
    categoryDispositions: observation?.categories ?? {},
    flipReady: flip?.readyForProductionFlip ?? false,
    flipAutomatedPass: flip?.automatedGatesPass ?? false,
    flipBlockers: flip?.blockers ?? [],
    nextMilestone: readiness?.observationReady
      ? 'tripartite-sign-off-then-10pct-flip'
      : readiness?.observationVolumeSatisfied === false
        ? 'accumulate-production-volume'
        : 'accumulate-30d-evidence',
    nextActions: readiness?.nextActions ?? [],
  };

  const outPath = path.join(OUT_DIR, 'status.json');
  fs.writeFileSync(outPath, JSON.stringify(status, null, 2));

  log(`written ${outPath}`);
  log(`phase=${phase.decisionRuntimePhase} authority=${phase.currentAuthority}`);
  log(`ready=${status.observationReady} duration=${status.observationDurationSatisfied} volume=${status.observationVolumeSatisfied}`);
  log(`${status.durationDetail}`);
  log(`flipReady=${status.flipReady} volumeBlockers=${status.volumeBlockers.length}`);
}

main();

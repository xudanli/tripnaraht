/**
 * 7-day Canonical Production Probation — post-cutover monitoring.
 *
 * Probation anchor = verify-runtime PASS + smoke PASS (not service restart time).
 *
 * Usage:
 *   npm run production-probation:status
 */

import 'dotenv/config';
import { execSync } from 'child_process';
import * as fs from 'fs';
import * as path from 'path';
import { PRODUCTION_PROBATION_DAYS, PROBATION_PASS_CRITERIA } from '../../src/decision-runtime/production-transition/production-cutover.catalog';
import { CUTOVER_ZERO_TOLERANCE_TRIGGERS } from '../../src/decision-runtime/production-transition/production-cutover.catalog';
import { resolveProductionTransitionPhase } from '../../src/decision-runtime/production-transition/production-transition-phase.catalog';
import { readProbationBaseline } from '../../src/decision-runtime/production-transition/production-cutover-probation-anchor.util';

const OUT_DIR = path.join(process.cwd(), 'artifacts', 'production-cutover');

function log(line: string) {
  console.log(`[${new Date().toISOString()}] [probation] ${line}`);
}

function readJson<T>(p: string): T | null {
  try {
    return JSON.parse(fs.readFileSync(p, 'utf8')) as T;
  } catch {
    return null;
  }
}

function main() {
  try {
    execSync('npm run production-observation:collect', { stdio: 'inherit' });
  } catch {
    execSync('npm run production-observation:report', { stdio: 'inherit' });
  }

  fs.mkdirSync(OUT_DIR, { recursive: true });

  const baseline = readProbationBaseline();
  const probationDays = baseline?.probationDays ?? PRODUCTION_PROBATION_DAYS;
  const anchorAt = baseline?.probationStartedAt
    ? Date.parse(baseline.probationStartedAt)
    : null;
  const elapsedDays = anchorAt ? (Date.now() - anchorAt) / (24 * 60 * 60 * 1000) : 0;

  const observation = readJson<{
    readiness?: {
      hardRedlinesPassed?: boolean;
      redlineBlockers?: string[];
    };
    metrics?: Array<{ metricId: string; disposition: string }>;
  }>('artifacts/production-observation/report.json');

  const redlineFail = CUTOVER_ZERO_TOLERANCE_TRIGGERS.filter((id) =>
    observation?.metrics?.some((m) => m.metricId === id && m.disposition === 'FAIL'),
  );

  const probationAnchored = baseline?.cutoverComplete === true;
  const probationPass =
    probationAnchored &&
    elapsedDays >= probationDays &&
    observation?.readiness?.hardRedlinesPassed === true &&
    redlineFail.length === 0;

  const report = {
    schemaId: 'tripnara.production_probation_status@v2',
    generatedAt: new Date().toISOString(),
    probationStartedAt: baseline?.probationStartedAt ?? null,
    probationAnchored,
    elapsedDays: Number(elapsedDays.toFixed(2)),
    probationDays,
    probationSatisfied: probationAnchored && elapsedDays >= probationDays,
    hardRedlinesPassed: observation?.readiness?.hardRedlinesPassed ?? false,
    redlineBlockers: observation?.readiness?.redlineBlockers ?? [],
    zeroToleranceTriggers: [...CUTOVER_ZERO_TOLERANCE_TRIGGERS],
    passCriteria: PROBATION_PASS_CRITERIA.map((c) => ({
      ...c,
      status:
        c.id === 'legacy-fallback'
          ? 'manual-verify'
          : observation?.readiness?.hardRedlinesPassed
            ? 'PASS'
            : 'pending',
    })),
    probationPass,
    cutoverComplete: baseline?.cutoverComplete ?? false,
    phase: resolveProductionTransitionPhase(),
    nextMilestone: !probationAnchored
      ? 'complete verify-runtime + smoke to anchor probation'
      : probationPass
        ? 'consider-constraint-default-on-batch-1'
        : elapsedDays < probationDays
          ? 'probation-monitoring'
          : 'resolve-redlines-before-constraint-default-on',
    checkpointsHours: [0.25, 1, 4, 24],
    rollback: 'npm run rollback-tier-a:legacy && restart',
  };

  const outPath = path.join(OUT_DIR, 'probation.json');
  fs.writeFileSync(outPath, JSON.stringify(report, null, 2));

  log(`written ${outPath}`);
  if (!probationAnchored) {
    log('probation not anchored — run verify-runtime + smoke first');
  } else {
    log(`probation ${elapsedDays.toFixed(1)}/${probationDays}d pass=${probationPass}`);
  }
  log(`redlines=${report.hardRedlinesPassed} phase=${report.phase.decisionRuntimePhase}`);
}

main();

/**
 * Pre-cutover gates — run BEFORE applying production-cutover.env
 *
 * Usage:
 *   npm run production-cutover:preflight
 *   npm run production-cutover:preflight -- --stage pre-cutover
 *   npm run production-cutover:preflight -- --stage post-restart
 *
 *   CUTOVER_DB_SNAPSHOT_CONFIRMED=1 CUTOVER_INFLIGHT_CLEAR_CONFIRMED=1 npm run production-cutover:preflight
 *
 * Post-restart gate (after verify-runtime + smoke):
 *   npm run production-cutover:preflight -- --stage post-restart
 */

import 'dotenv/config';
import * as fs from 'fs';
import * as path from 'path';
import {
  attachPreCutoverLiveRuntimeVerify,
  evaluateProductionCutoverPreflight,
  resolveCutoverPreflightStage,
} from '../../src/decision-runtime/production-transition/production-cutover-preflight.evaluator';

const OUT_DIR = path.join(process.cwd(), 'artifacts', 'production-cutover');

function log(line: string) {
  console.log(`[${new Date().toISOString()}] [cutover-preflight] ${line}`);
}

async function main() {
  fs.mkdirSync(OUT_DIR, { recursive: true });
  const stage = resolveCutoverPreflightStage();

  let report = evaluateProductionCutoverPreflight(process.cwd(), stage);
  if (stage === 'pre-cutover') {
    report = await attachPreCutoverLiveRuntimeVerify(report);
  }

  const outPath = path.join(OUT_DIR, `preflight-${stage}.json`);
  const legacyPath = path.join(OUT_DIR, 'preflight.json');
  fs.writeFileSync(outPath, JSON.stringify(report, null, 2));
  fs.writeFileSync(legacyPath, JSON.stringify(report, null, 2));

  log(`stage=${stage} written ${outPath}`);
  if (stage === 'pre-cutover') {
    log(`preCutoverReady=${report.preCutoverReady} runtimePosture=${report.runtimePosture}`);
  } else {
    log(`cutoverComplete=${report.cutoverComplete} probationStarted=${report.probationStarted}`);
  }
  log(`commit=${report.freezeManifest.gitCommit ?? 'n/a'}`);
  for (const item of report.items) {
    log(`  ${item.pass ? '✓' : '✗'} ${item.id}: ${item.detail}`);
  }

  const gatePass =
    stage === 'pre-cutover' ? report.preCutoverReady : report.cutoverComplete;

  if (!gatePass) {
    log(`blockers: ${report.blockers.join(', ')}`);
    process.exitCode = 1;
  }
}

main();

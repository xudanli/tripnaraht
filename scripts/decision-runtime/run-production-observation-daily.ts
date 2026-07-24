/**
 * Daily production observation snapshot — archive report + window status.
 *
 * Usage:
 *   npm run production-observation:daily
 *   DECISION_RUNTIME_BASE_URL=https://prod.example.com npm run production-observation:daily
 */

import 'dotenv/config';
import { execSync } from 'child_process';
import * as fs from 'fs';
import * as path from 'path';

const ROOT = process.cwd();
const OUT_DIR = path.join(ROOT, 'artifacts', 'production-observation');
const DAILY_DIR = path.join(OUT_DIR, 'daily');

function log(line: string) {
  console.log(`[${new Date().toISOString()}] [production-observation:daily] ${line}`);
}

function run(cmd: string) {
  execSync(cmd, { cwd: ROOT, stdio: 'inherit' });
}

function runOptional(cmd: string): boolean {
  try {
    execSync(cmd, { cwd: ROOT, stdio: 'inherit' });
    return true;
  } catch {
    return false;
  }
}

function readJson<T>(filePath: string): T | null {
  try {
    return JSON.parse(fs.readFileSync(filePath, 'utf8')) as T;
  } catch {
    return null;
  }
}

function ensureBaseline() {
  const baselinePath = path.join(OUT_DIR, 'baseline.json');
  if (fs.existsSync(baselinePath)) return;

  const closure = readJson<{ generatedAt?: string; overall?: string }>(
    path.join(ROOT, 'artifacts/p4-phase-status/closure.json'),
  );

  const baseline = {
    schemaId: 'tripnara.production_observation_baseline@v1',
    startedAt: new Date().toISOString(),
    selectiveClosureAt: closure?.generatedAt ?? null,
    selectiveClosureOverall: closure?.overall ?? null,
    profile: 'selective-observation',
    minObservationDays: Number(process.env.CANONICAL_DEFAULT_MIN_OBSERVATION_DAYS ?? '30'),
    baseUrl: process.env.DECISION_RUNTIME_BASE_URL?.trim() ?? null,
  };

  fs.writeFileSync(baselinePath, JSON.stringify(baseline, null, 2));
  log(`created baseline ${baselinePath}`);
}

function main() {
  fs.mkdirSync(DAILY_DIR, { recursive: true });
  ensureBaseline();

  run('npm run p4-observation:status');
  if (!runOptional('npm run production-observation:collect')) {
    run('npm run production-observation:report');
  }

  const day = new Date().toISOString().slice(0, 10);
  const report = readJson<Record<string, unknown>>(path.join(OUT_DIR, 'report.json'));
  const window = readJson<{ detail?: string; pass?: boolean }>(
    path.join(ROOT, 'artifacts/p4-observation-status/status.json'),
  );

  if (report) {
    const dailyPath = path.join(DAILY_DIR, `${day}.json`);
    fs.writeFileSync(dailyPath, JSON.stringify(report, null, 2));

    const historyLine = JSON.stringify({
      day,
      generatedAt: report.generatedAt,
      disposition: report.overallDisposition,
      observationWindow: window?.detail ?? null,
      blockers: report.blockers,
    });
    fs.appendFileSync(path.join(OUT_DIR, 'history.jsonl'), `${historyLine}\n`);
    log(`archived ${dailyPath}`);
  }

  log(`window: ${window?.detail ?? 'n/a'}`);
  log(`disposition: ${String(report?.overallDisposition ?? 'unknown')}`);

  if (process.env.PRODUCTION_OBSERVATION_STRICT === '1' && report?.overallDisposition === 'FAIL') {
    process.exitCode = 1;
  }
}

main();

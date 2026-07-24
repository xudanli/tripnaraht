/**
 * Week 1 production observation bundle — shadow metrics, lint, rollback drill.
 *
 * Usage:
 *   npm run production-observation:week1
 *   DECISION_RUNTIME_BASE_URL=http://localhost:3000/api npm run production-observation:week1
 */

import 'dotenv/config';
import { execSync } from 'child_process';
import * as fs from 'fs';
import * as path from 'path';

const ROOT = process.cwd();
const OUT_DIR = path.join(ROOT, 'artifacts', 'production-observation');
const METRICS_PATH = path.join(OUT_DIR, 'production-metrics.json');
const TEMPLATE_PATH = path.join(ROOT, 'config/decision-runtime/production-metrics.template.json');

function log(line: string) {
  console.log(`[${new Date().toISOString()}] [production-observation:week1] ${line}`);
}

function run(cmd: string) {
  execSync(cmd, { cwd: ROOT, stdio: 'inherit' });
}

function ensureMetricsTemplate() {
  if (fs.existsSync(METRICS_PATH)) {
    log(`metrics overlay exists: ${METRICS_PATH}`);
    return;
  }
  fs.mkdirSync(OUT_DIR, { recursive: true });
  if (fs.existsSync(TEMPLATE_PATH)) {
    fs.copyFileSync(TEMPLATE_PATH, METRICS_PATH);
    log(`seeded metrics template → ${METRICS_PATH}`);
    log('update counts from Prometheus / ledger / APM before flip sign-off');
  }
}

function main() {
  ensureMetricsTemplate();

  const steps = [
    { id: 'architecture-lint', cmd: 'npm run p5-architecture:lint' },
    {
      id: 'legacy-fallback-drill',
      cmd: `npm run p4-legacy-fallback:drill -- ${process.env.DECISION_RUNTIME_BASE_URL?.trim() || 'http://localhost:3000/api'}`,
    },
    { id: 'trigger-wiring', cmd: 'npm run trigger-wiring:status' },
    { id: 'trigger-bypass-priority', cmd: 'npm run trigger-bypass-priority' },
    { id: 'metrics-collect', cmd: 'npm run production-observation:collect' },
    { id: 'daily-snapshot', cmd: 'npm run production-observation:daily' },
  ];

  const results: Array<{ id: string; pass: boolean }> = [];
  for (const step of steps) {
    try {
      run(step.cmd);
      results.push({ id: step.id, pass: true });
    } catch {
      results.push({ id: step.id, pass: false });
      log(`FAILED: ${step.id}`);
    }
  }

  const reportPath = path.join(OUT_DIR, 'week1-checklist.json');
  fs.writeFileSync(
    reportPath,
    JSON.stringify(
      {
        schemaId: 'tripnara.production_observation_week1@v1',
        generatedAt: new Date().toISOString(),
        pass: results.every((r) => r.pass),
        steps: results,
        metricsPath: METRICS_PATH,
        next: [
          'Point production Prometheus/ledger export at production-metrics.json',
          'Run npm run production-observation:daily each day',
          'Run npm run p5-weekly-ops each week',
        ],
      },
      null,
      2,
    ),
  );

  log(`written ${reportPath}`);
  log(`pass=${results.every((r) => r.pass)} steps=${results.filter((r) => r.pass).length}/${results.length}`);

  if (!results.every((r) => r.pass)) {
    process.exitCode = 1;
  }
}

main();

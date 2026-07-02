/**
 * Rank Trigger Gateway bypass / lineage_only entries for wiring upgrades.
 *
 * Usage:
 *   npm run trigger-bypass-priority
 *   TRIGGER_BYPASS_METRICS_PATH=artifacts/trigger-bypass-priority/production-metrics.json npm run trigger-bypass-priority
 */

import 'dotenv/config';
import * as fs from 'fs';
import * as path from 'path';
import {
  evaluateTriggerBypassPriority,
  type TriggerBypassProductionMetrics,
} from '../../src/decision-runtime/production-transition/trigger-bypass-priority.evaluator';

const OUT_DIR = path.join(process.cwd(), 'artifacts', 'trigger-bypass-priority');

function log(line: string) {
  console.log(`[${new Date().toISOString()}] [trigger-bypass-priority] ${line}`);
}

function readMetrics(): TriggerBypassProductionMetrics | undefined {
  const rel =
    process.env.TRIGGER_BYPASS_METRICS_PATH?.trim() ??
    'artifacts/trigger-bypass-priority/production-metrics.json';
  const full = path.isAbsolute(rel) ? rel : path.join(process.cwd(), rel);
  try {
    return JSON.parse(fs.readFileSync(full, 'utf8')) as TriggerBypassProductionMetrics;
  } catch {
    return undefined;
  }
}

function main() {
  fs.mkdirSync(OUT_DIR, { recursive: true });

  const metrics = readMetrics();
  const report = evaluateTriggerBypassPriority(metrics);

  const outPath = path.join(OUT_DIR, 'report.json');
  fs.writeFileSync(outPath, JSON.stringify(report, null, 2));
  log(`written ${outPath}`);
  log(`bypass=${report.bypassCount} metrics=${report.metricsSource}`);
  log(`top wire targets: ${report.topWireTargets.map((t) => t.entryId).join(', ')}`);

  for (const target of report.topWireTargets) {
    log(`  #${target.rank} ${target.entryId} — ${target.label} (${target.moduleHint})`);
  }

  if (report.nextActions[0]) {
    log(`next: ${report.nextActions[0]}`);
  }
}

main();

/**
 * DB probe for cutover inflight — generates overlay scaffold (does NOT auto-confirm clearance).
 *
 * Run AFTER maintenance window + drain period.
 *
 * Usage:
 *   CUTOVER_OPERATOR=alice npm run production-cutover:inflight-db-probe
 */

import 'dotenv/config';
import * as fs from 'node:fs';
import * as path from 'node:path';
import { PrismaClient } from '@prisma/client';
import { runInflightDbProbe } from '../../src/decision-runtime/production-transition/production-cutover-inflight-db-probe.util';

const OUT_DIR = path.join(process.cwd(), 'artifacts', 'production-cutover');

function log(line: string) {
  console.log(`[${new Date().toISOString()}] [inflight-db-probe] ${line}`);
}

async function main() {
  if (!process.env.DATABASE_URL) {
    log('FAIL: DATABASE_URL required');
    process.exit(1);
  }

  fs.mkdirSync(OUT_DIR, { recursive: true });
  const prisma = new PrismaClient();

  try {
    const report = await runInflightDbProbe({
      prisma,
      operator: process.env.CUTOVER_OPERATOR,
    });

    const probePath = path.join(OUT_DIR, 'inflight-db-probe.json');
    const scaffoldPath = path.join(OUT_DIR, 'inflight-overlay.scaffold.json');

    fs.writeFileSync(probePath, JSON.stringify(report, null, 2));
    fs.writeFileSync(scaffoldPath, JSON.stringify(report.overlayScaffold, null, 2));

    log(`written ${probePath}`);
    log(`scaffold ${scaffoldPath} — review before copying to inflight-overlay.json`);
    log(`maintenance: ${report.maintenanceWindowNote}`);

    for (const probe of report.probes) {
      const mark = probe.error ? '!' : probe.value === 0 ? '✓' : '✗';
      log(
        `  ${mark} ${probe.sqlId}${probe.overlayField ? ` → ${probe.overlayField}` : ''} = ${probe.error ? probe.error : probe.value}`,
      );
    }
    for (const note of report.notes) {
      log(`  note: ${note}`);
    }

    const nonZero = report.probes.filter((p) => !p.error && p.value > 0);
    if (nonZero.length > 0) {
      log(`NON-ZERO counts detected — drain workloads before overlay`);
      for (const p of nonZero) {
        log(`  ✗ ${p.sqlId} = ${p.value}`);
      }
      process.exitCode = 1;
    }

    log('Next: add pendingQueueWriteJobs (Group B queue evidence), review scaffold, copy to inflight-overlay.json');
  } finally {
    await prisma.$disconnect();
  }
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});

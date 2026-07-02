/**
 * Reconcile stale/orphan inflight records before cutover.
 *
 * Usage:
 *   npm run production-cutover:inflight-reconcile -- --dry-run --scope authorizations
 *   CUTOVER_OPERATOR=alice npm run production-cutover:inflight-reconcile -- --apply --scope authorizations
 *   CUTOVER_OPERATOR=alice npm run production-cutover:inflight-reconcile -- --apply --scope stale-test-proposals
 */

import 'dotenv/config';
import * as fs from 'node:fs';
import * as path from 'node:path';
import { PrismaClient } from '@prisma/client';
import { classifyInflightRecords } from '../../src/decision-runtime/production-transition/production-cutover-inflight-classification.collector';
import type { ReconcileScope } from '../../src/decision-runtime/production-transition/production-cutover-inflight-classification.catalog';
import { applyInflightReconciliation } from '../../src/decision-runtime/production-transition/production-cutover-inflight-reconcile.util';

const OUT_DIR = path.join(process.cwd(), 'artifacts', 'production-cutover');

function log(line: string) {
  console.log(`[${new Date().toISOString()}] [inflight-reconcile] ${line}`);
}

function parseScope(argv: string[]): ReconcileScope {
  const idx = argv.indexOf('--scope');
  const value = idx >= 0 ? argv[idx + 1] : undefined;
  if (value === 'authorizations' || value === 'stale-test-proposals') {
    return value;
  }
  log('FAIL: --scope authorizations | stale-test-proposals required');
  process.exit(1);
}

async function main() {
  const apply = process.argv.includes('--apply');
  const dryRun = !apply;
  const scope = parseScope(process.argv);

  if (!process.env.DATABASE_URL) {
    log('FAIL: DATABASE_URL required');
    process.exit(1);
  }

  const operator = process.env.CUTOVER_OPERATOR?.trim();
  if (apply && !operator) {
    log('FAIL: CUTOVER_OPERATOR required for --apply');
    process.exit(1);
  }

  fs.mkdirSync(OUT_DIR, { recursive: true });
  const prisma = new PrismaClient();

  try {
    const classification = await classifyInflightRecords({ prisma, operator });
    const report = await applyInflightReconciliation({
      prisma,
      classification,
      operator: operator ?? 'dry-run',
      dryRun,
      scope,
    });

    const outPath = path.join(
      OUT_DIR,
      scope === 'authorizations'
        ? 'authorization-reconciliation.json'
        : 'stale-test-proposal-reconciliation.json',
    );
    fs.writeFileSync(outPath, JSON.stringify(report, null, 2));

    log(`scope=${scope} written ${outPath} dryRun=${report.dryRun} items=${report.items.length}`);
    for (const item of report.items) {
      log(
        `  ${item.applied ? '✓' : '○'} ${item.entityId.slice(0, 40)}… preserve=${item.recordStatusPreserved} → ${item.targetReconciliationStatus} (${item.targetReconciliationReason})`,
      );
    }
    for (const c of report.conflicts) {
      log(`  ✗ CONFLICT ${c.code} ${c.entityId.slice(0, 36)}… ${c.detail}`);
    }

    if (!report.pass) {
      log('FAIL: conflicts detected — no partial apply committed for failed items');
      process.exitCode = 1;
    } else if (dryRun) {
      log('Dry-run pass — re-run with --apply');
    } else {
      log('Applied — run inflight-classify + inflight-db-probe');
    }
  } finally {
    await prisma.$disconnect();
  }
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});

/**
 * Read-only classification of inflight Decision Runs / Authorizations.
 *
 * Usage:
 *   CUTOVER_OPERATOR=alice npm run production-cutover:inflight-classify
 */

import 'dotenv/config';
import * as fs from 'node:fs';
import * as path from 'node:path';
import { PrismaClient } from '@prisma/client';
import { classifyInflightRecords } from '../../src/decision-runtime/production-transition/production-cutover-inflight-classification.collector';

const OUT_DIR = path.join(process.cwd(), 'artifacts', 'production-cutover');

function log(line: string) {
  console.log(`[${new Date().toISOString()}] [inflight-classify] ${line}`);
}

async function main() {
  if (!process.env.DATABASE_URL) {
    log('FAIL: DATABASE_URL required');
    process.exit(1);
  }

  fs.mkdirSync(OUT_DIR, { recursive: true });
  const prisma = new PrismaClient();

  try {
    const report = await classifyInflightRecords({
      prisma,
      operator: process.env.CUTOVER_OPERATOR,
    });

    const classificationPath = path.join(OUT_DIR, 'inflight-record-classification.json');
    const authPath = path.join(OUT_DIR, 'authorization-reconciliation.json');

    fs.writeFileSync(classificationPath, JSON.stringify(report, null, 2));
    fs.writeFileSync(
      authPath,
      JSON.stringify(
        {
          schemaId: 'tripnara.production_cutover_authorization_reconciliation_preview@v1',
          generatedAt: report.classifiedAt,
          operator: report.operator,
          dryRun: true,
          authorizations: report.authorizations,
          pendingReconcile: report.authorizations.filter((a) => a.blocksCutover),
        },
        null,
        2,
      ),
    );

    log(`written ${classificationPath}`);
    log(`written ${authPath} (preview)`);
    log(
      `summary: active=${report.summary.trulyActive} stale=${report.summary.staleNonTerminal} awaitingHuman=${report.summary.awaitingHuman}`,
    );
    log(
      `auth: pendingExecutable=${report.summary.pendingExecutableAuthorizations} orphan=${report.summary.orphanAuthorizations}`,
    );
    log(
      `blocksCutover: runs=${report.summary.blocksCutoverDecisionRuns} auth=${report.summary.blocksCutoverAuthorizations}`,
    );

    for (const d of report.decisionRuns.filter((x) => x.blocksCutover || x.classification !== 'AWAITING_HUMAN').slice(0, 20)) {
      log(
        `  [${d.classification}] ${d.decisionId.slice(0, 40)}… status=${d.recordStatus} action=${d.recommendedAction} block=${d.blocksCutover}`,
      );
    }

    for (const step of report.nextSteps) {
      log(`next: ${step}`);
    }

    if (report.summary.blocksCutoverDecisionRuns > 0 || report.summary.blocksCutoverAuthorizations > 0) {
      process.exitCode = 1;
    }
  } finally {
    await prisma.$disconnect();
  }
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});

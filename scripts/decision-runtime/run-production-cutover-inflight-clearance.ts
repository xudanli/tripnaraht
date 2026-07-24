/**
 * Pre-cutover inflight clearance — generate artifacts/production-cutover/inflight-clearance.json
 *
 * Usage:
 *   npm run production-cutover:inflight-clearance
 *   CUTOVER_OPERATOR=alice npm run production-cutover:inflight-clearance
 *
 * Ops overlay (auditable evidence required): artifacts/production-cutover/inflight-overlay.json
 * Template: artifacts/production-cutover/inflight-overlay.template.json
 */

import 'dotenv/config';
import * as fs from 'node:fs';
import * as path from 'node:path';
import { PrismaClient } from '@prisma/client';
import {
  collectInflightClearance,
  REQUIRED_OVERLAY_FIELDS,
} from '../../src/decision-runtime/production-transition/production-cutover-inflight-clearance.collector';

const OUT_DIR = path.join(process.cwd(), 'artifacts', 'production-cutover');

function log(line: string) {
  console.log(`[${new Date().toISOString()}] [inflight-clearance] ${line}`);
}

async function main() {
  fs.mkdirSync(OUT_DIR, { recursive: true });

  const overlayPath = path.join(OUT_DIR, 'inflight-overlay.json');
  if (!fs.existsSync(overlayPath)) {
    log(`missing ${overlayPath}`);
    log(`copy inflight-overlay.template.json → inflight-overlay.json and fill evidence`);
    log(`required fields: ${REQUIRED_OVERLAY_FIELDS.join(', ')}`);
  }

  let prisma: PrismaClient | null = null;
  if (process.env.DATABASE_URL) {
    prisma = new PrismaClient();
  }

  try {
    const report = await collectInflightClearance({
      prisma,
      operator: process.env.CUTOVER_OPERATOR,
    });

    const outPath = path.join(OUT_DIR, 'inflight-clearance.json');
    fs.writeFileSync(outPath, JSON.stringify(report, null, 2));

    log(`written ${outPath}`);
    log(`principle: ${report.principle}`);
    for (const section of report.sections) {
      const mark = !section.queried ? '?' : section.count === 0 ? '✓' : '✗';
      log(`  ${mark} ${section.id}: count=${section.queried ? section.count : 'not-queried'} [${section.source}]`);
    }
    if (report.missingOverlayFields.length > 0) {
      log(`  missingOverlayEvidence: ${report.missingOverlayFields.join(', ')}`);
    }
    if (report.overlayEvidenceInvalid.length > 0) {
      log(`  invalid overlay evidence: ${report.overlayEvidenceInvalid.join(', ')}`);
    }
    for (const note of report.notes) {
      log(`  note: ${note}`);
    }
    log(`authorization: pending=${report.authorization.pendingAuthorizations} expired=${report.authorization.expiredButExecutableAuthorizations} orphan=${report.authorization.orphanAuthorizations}`);
    if (report.reconciliationArtifacts) {
      log(`reconciliationArtifacts: ${JSON.stringify(report.reconciliationArtifacts)}`);
    }
    log(`ready=${report.ready} blockers=${report.blockers.join(', ') || 'none'}`);

    if (!report.ready) {
      log('Fill inflight-overlay.json with auditable evidence; drain workloads; re-run');
      process.exitCode = 1;
    } else {
      log('ready=true — you may set CUTOVER_INFLIGHT_CLEAR_CONFIRMED=1');
    }
  } finally {
    await prisma?.$disconnect();
  }
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});

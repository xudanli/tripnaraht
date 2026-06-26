/**
 * M2/M3 Staging acceptance gate (Tier 2.3).
 *
 * Usage:
 *   DATABASE_URL=... TRAVEL_EVENT_STORE_ENABLED=true npm run gate1:acceptance
 *   npm run gate1:acceptance -- --json
 *   npm run gate1:acceptance -- --min-match-rate=95
 */
import path from 'node:path';
import { config as loadEnv } from 'dotenv';
import { NestFactory } from '@nestjs/core';
import { AppModule } from '../src/app.module';
import { Gate1RuntimeAcceptanceService } from '../src/decision-runtime/services/gate1-runtime-acceptance.service';

loadEnv({ path: path.resolve(__dirname, '..', '.env') });

function parseThresholds(args: string[]) {
  const thresholds: Partial<{
    minLinkedTripCoveragePct: number;
    minReconcileMatchRatePct: number;
    maxOutboxFailed: number;
    maxOutboxPending: number;
  }> = {};

  for (const arg of args) {
    if (arg.startsWith('--min-coverage=')) {
      thresholds.minLinkedTripCoveragePct = Number(arg.split('=')[1]);
    }
    if (arg.startsWith('--min-match-rate=')) {
      thresholds.minReconcileMatchRatePct = Number(arg.split('=')[1]);
    }
    if (arg.startsWith('--max-outbox-failed=')) {
      thresholds.maxOutboxFailed = Number(arg.split('=')[1]);
    }
    if (arg.startsWith('--max-outbox-pending=')) {
      thresholds.maxOutboxPending = Number(arg.split('=')[1]);
    }
  }

  return thresholds;
}

async function main() {
  const args = process.argv.slice(2);
  const json = args.includes('--json');

  if (!process.env.DATABASE_URL) {
    console.error('DATABASE_URL is required');
    process.exit(1);
  }

  if (/tripnara_prod|production/i.test(process.env.DATABASE_URL)) {
    console.error('Refusing production DATABASE_URL');
    process.exit(1);
  }

  const app = await NestFactory.createApplicationContext(AppModule, {
    logger: ['error', 'warn'],
  });

  try {
    const acceptance = app.get(Gate1RuntimeAcceptanceService);
    const report = await acceptance.runAcceptance(parseThresholds(args));

    if (json) {
      console.log(JSON.stringify(report, null, 2));
    } else {
      console.log('=== Gate1 Runtime Acceptance (M2/M3) ===');
      console.log(`Passed: ${report.passed ? 'YES' : 'NO'}`);
      console.log(`linkedTripId coverage: ${report.linkedTripCoverage.coveragePct}%`);
      console.log(
        `Reconcile: ${report.reconcile.matchRatePct}% (${report.reconcile.matched}/${report.reconcile.total - report.reconcile.skipped} matched)`,
      );
      if (report.outbox) {
        console.log(
          `Outbox: pending=${report.outbox.pending} failed=${report.outbox.failed} published=${report.outbox.published}`,
        );
      }
      console.log(`Gate1 travel_events: ${report.travelEvents.gate1EventCount}`);
      console.log('Flags:', report.flags);
      if (report.failures.length > 0) {
        console.log('\nFailures:');
        for (const f of report.failures) console.log(`  - ${f}`);
      }
      if (report.reconcile.mismatchedProjects.length > 0) {
        console.log('\nMismatched projects:');
        for (const p of report.reconcile.mismatchedProjects) {
          console.log(`  - ${p.title} (${p.projectId}): ${p.entities.join(', ')}`);
        }
      }
    }

    process.exit(report.passed ? 0 : 1);
  } finally {
    await app.close();
  }
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});

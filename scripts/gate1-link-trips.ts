/**
 * Gate1 linkedTripId coverage report + backfill (Tier 0.3).
 * Uses Prisma directly — no full Nest bootstrap (avoids AppModule circular deps).
 *
 * Usage:
 *   npm run gate1:link-trips              # coverage report
 *   npm run gate1:link-trips -- --backfill
 *   npm run gate1:link-trips -- --json
 *   GATE1_RUNTIME_ALLOW_PROD=1 npm run gate1:link-trips -- --backfill  # prod RDS
 */
import path from 'node:path';
import { config as loadEnv } from 'dotenv';
import { PrismaClient } from '@prisma/client';
import { Gate1LinkedTripAnchorService } from '../src/decision-runtime/services/gate1-linked-trip-anchor.service';

loadEnv({ path: path.resolve(__dirname, '..', '.env') });

function assertDatabaseAllowed(writes: boolean) {
  const url = process.env.DATABASE_URL ?? '';
  if (!url) {
    console.error('DATABASE_URL is required');
    process.exit(1);
  }
  if (
    writes &&
    /tripnara_prod|production/i.test(url) &&
    process.env.GATE1_RUNTIME_ALLOW_PROD !== '1'
  ) {
    console.error(
      'Refusing production writes. Set GATE1_RUNTIME_ALLOW_PROD=1 for --backfill on prod.',
    );
    process.exit(1);
  }
}

async function main() {
  const args = process.argv.slice(2);
  const backfill = args.includes('--backfill');
  assertDatabaseAllowed(backfill);
  const json = args.includes('--json');

  const prisma = new PrismaClient();
  const anchor = new Gate1LinkedTripAnchorService(prisma as never);

  try {
    const coverage = await anchor.getCoverageReport();

    if (backfill) {
      const results = await anchor.backfillAllMissing();
      const payload = {
        coverage: await anchor.getCoverageReport(),
        backfill: {
          total: results.length,
          linkedFromListing: results.filter((r) => r.action === 'linked_from_listing').length,
          createdTrip: results.filter((r) => r.action === 'created_trip').length,
          failed: results.filter((r) => r.action === 'failed').length,
          results,
        },
      };

      if (json) {
        console.log(JSON.stringify(payload, null, 2));
      } else {
        console.log('=== Gate1 linkedTripId Backfill ===');
        console.log(`Processed: ${payload.backfill.total}`);
        console.log(`From listing: ${payload.backfill.linkedFromListing}`);
        console.log(`Created trip: ${payload.backfill.createdTrip}`);
        console.log(`Failed: ${payload.backfill.failed}`);
        console.log('');
        console.log('=== Coverage After ===');
        console.log(
          `Coverage: ${payload.coverage.coveragePct}% (${payload.coverage.withLinkedTrip}/${payload.coverage.totalProjects})`,
        );
        console.log(`Active without trip: ${payload.coverage.activeWithoutTrip}`);
      }
      return;
    }

    if (json) {
      console.log(JSON.stringify({ coverage }, null, 2));
    } else {
      console.log('=== Gate1 linkedTripId Coverage ===');
      console.log(`Total projects: ${coverage.totalProjects}`);
      console.log(`With linkedTripId: ${coverage.withLinkedTrip}`);
      console.log(`Without linkedTripId: ${coverage.withoutLinkedTrip}`);
      console.log(`Coverage: ${coverage.coveragePct}%`);
      console.log(`Active without trip: ${coverage.activeWithoutTrip}`);
      console.log(`Inactive without trip: ${coverage.inactiveWithoutTrip}`);
      if (coverage.coveragePct < 95) {
        console.log('');
        console.log('Tip: run with --backfill to auto-link from listing or create shell Trip');
      }
    }
  } finally {
    await prisma.$disconnect();
  }
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});

/**
 * CLI: run feasibility report without HTTP (for local verification).
 * Usage: npx tsx scripts/run-feasibility-report.ts <tripId> [--validate]
 */
import { NestFactory } from '@nestjs/core';
import { AppModule } from '../src/app.module';
import { FeasibilityReportService } from '../src/trips/trip-constraint-solver/services/feasibility-report.service';

async function main() {
  const tripId = process.argv[2];
  const validate = process.argv.includes('--validate');
  if (!tripId) {
    console.error('Usage: npx tsx scripts/run-feasibility-report.ts <tripId> [--validate]');
    process.exit(1);
  }

  const app = await NestFactory.createApplicationContext(AppModule, { logger: ['error', 'warn'] });
  try {
    const svc = app.get(FeasibilityReportService);
    const report = validate
      ? await svc.validate(tripId, { forceRefreshEvidence: true })
      : await svc.getReport(tripId);
    console.log(JSON.stringify(report, null, 2));
  } finally {
    await app.close();
  }
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});

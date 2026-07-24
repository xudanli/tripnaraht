/**
 * Parse Jest JSON output and write .fault-injection-gate.json only on real 29/29 PASS.
 *
 * Usage (via npm run test:benchmark-fault-injection):
 *   npx tsx scripts/decision-runtime/write-fault-injection-gate.ts /path/to/jest-results.json
 */

import * as fs from 'node:fs/promises';
import { PrismaClient } from '@prisma/client';
import {
  writeFaultInjectionGate,
  FAULT_INJECTION_EXPECTED,
  E1_BENCHMARK_MIGRATION,
  computeDatabaseFingerprint,
} from '../../src/decision-runtime/benchmark/benchmark-fault-injection-gate.util';
import { resolveGitCommit } from '../../src/decision-runtime/benchmark/benchmark-config.util';

async function main() {
  const jestJsonPath = process.argv[2];
  if (!jestJsonPath) {
    throw new Error('Usage: write-fault-injection-gate.ts <jest-results.json>');
  }

  const raw = await fs.readFile(jestJsonPath, 'utf8');
  const report = JSON.parse(raw) as {
    numPassedTests?: number;
    numFailedTests?: number;
    numPendingTests?: number;
    numTotalTests?: number;
    testResults?: Array<{
      assertionResults?: Array<{ status: string; title?: string; failureMessages?: string[] }>;
    }>;
  };

  let skipped = report.numPendingTests ?? 0;
  let vacuous = 0;
  for (const suite of report.testResults ?? []) {
    for (const t of suite.assertionResults ?? []) {
      if (t.status === 'pending' || t.status === 'skipped') skipped += 1;
      const msg = (t.failureMessages ?? []).join(' ');
      if (t.status === 'passed' && /not ready|Deploy migration/i.test(msg + (t.title ?? ''))) {
        vacuous += 1;
      }
      if (
        t.status === 'passed' &&
        t.failureMessages == null &&
        t.title &&
        /skipped/i.test(t.title)
      ) {
        vacuous += 1;
      }
    }
  }

  const passed = report.numPassedTests ?? 0;
  const failed = report.numFailedTests ?? 0;

  if (skipped > 0 || vacuous > 0) {
    console.error(
      `Fault injection gate REJECTED: passed=${passed} failed=${failed} skipped=${skipped} vacuous=${vacuous}`,
    );
    process.exit(1);
  }

  if (failed > 0 || passed < FAULT_INJECTION_EXPECTED) {
    console.error(
      `Fault injection gate REJECTED: need ${FAULT_INJECTION_EXPECTED} passed, 0 failed; got passed=${passed} failed=${failed}`,
    );
    process.exit(1);
  }

  const prisma = new PrismaClient();
  let migrationOk = false;
  try {
    const rows = await prisma.$queryRaw<Array<{ migration_name: string }>>`
      SELECT migration_name FROM _prisma_migrations
      WHERE migration_name = ${E1_BENCHMARK_MIGRATION}
    `;
    migrationOk = rows.length > 0;
  } finally {
    await prisma.$disconnect();
  }

  if (!migrationOk) {
    console.error(`Fault injection gate REJECTED: migration ${E1_BENCHMARK_MIGRATION} not applied`);
    process.exit(1);
  }

  const gate = await writeFaultInjectionGate({
    passed,
    failed,
    skipped: 0,
    migrationVersion: E1_BENCHMARK_MIGRATION,
    gitCommit: resolveGitCommit(),
    databaseFingerprint: computeDatabaseFingerprint(),
  });

  console.log(`Fault injection gate written: ${JSON.stringify(gate, null, 2)}`);
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});

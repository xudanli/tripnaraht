#!/usr/bin/env npx tsx
/**
 * WP-TEP-16 §0 — auto-check sign-off regression table after green CI.
 *
 * Usage:
 *   DATABASE_URL=... npm run tep:signoff-autocheck              # run all checks + patch checklist
 *   DATABASE_URL=... npm run tep:signoff-autocheck -- --from-ci # after tep:pilot-ci (skip re-run)
 *   npm run tep:signoff-autocheck -- --dry-run                    # evaluate only, no file write
 */
import 'reflect-metadata';
import { join } from 'path';
import { config as loadEnv } from 'dotenv';
import {
  applySignoffResultsToChecklist,
  assertSafeSignoffDatabase,
  runAllSignoffChecks,
} from './tep-signoff-autocheck.util';

const PROJECT_ROOT = join(__dirname, '..');

function loadEnvFiles(): void {
  loadEnv({ path: join(PROJECT_ROOT, '.env') });
  loadEnv({ path: join(PROJECT_ROOT, '.env.staging'), override: true });
}

function hasFlag(name: string): boolean {
  return process.argv.includes(`--${name}`);
}

async function main(): Promise<void> {
  loadEnvFiles();
  assertSafeSignoffDatabase();

  const fromCi = hasFlag('from-ci');
  const dryRun = hasFlag('dry-run');

  const results = await runAllSignoffChecks({ fromCi });
  const failed = results.filter((r) => !r.passed && !r.skipped);
  const passed = results.filter((r) => r.passed);

  console.log(JSON.stringify({ ok: failed.length === 0, passed: passed.length, failed: failed.length, results }, null, 2));

  if (dryRun) {
    if (failed.length > 0) process.exit(1);
    return;
  }

  const { evidencePath } = applySignoffResultsToChecklist(results);
  console.log(`Updated ${join('internal-docs/product/TEP-PHASE0-SIGNOFF-CHECKLIST.md')}`);
  console.log(`Evidence: ${evidencePath}`);

  if (failed.length > 0) {
    process.exit(1);
  }
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});

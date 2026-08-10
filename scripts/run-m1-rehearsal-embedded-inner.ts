/**
 * Inner runner for M1 REHEARSAL (env already points at embedded PG).
 */
import { runM1ApplyLayerSuite } from '../src/decision-runtime/execution/authoritative-write/m1-staging-canary.harness';

async function main() {
  const { results, allPassed, paths } = await runM1ApplyLayerSuite('REHEARSAL');
  for (const r of results) {
    console.log(`[${r.passed ? 'PASS' : 'FAIL'}] ${r.caseId}: ${r.message}`);
  }
  console.log('evidence:');
  for (const p of paths) console.log(`  ${p}`);
  console.log(
    allPassed
      ? 'M1_REHEARSAL: PASS (Apply-layer only — not Staging PRODUCTION CANARY READY)'
      : 'M1_REHEARSAL: FAIL',
  );
  process.exit(allPassed ? 0 : 1);
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});

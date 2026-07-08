/**
 * Run Multi-Constraint POI Arrangement Benchmark harness gate.
 *
 * Usage:
 *   npm run harness:mcpoi-benchmark
 *   npx tsx scripts/run-mcpoi-benchmark-harness.ts --json
 */
import {
  runMcpoiBenchmarkHarnessGate,
} from '../src/trips/arrange-itinerary/harness/mcpoi-benchmark-harness.util';

const json = process.argv.includes('--json');

async function main() {
  const result = runMcpoiBenchmarkHarnessGate();

  if (json) {
    console.log(
      JSON.stringify(
        {
          ok: result.pass,
          caseCount: result.caseCount,
          passedCount: result.passedCount,
          variantGatePass: result.variantGatePass,
          errors: result.errors,
          cases: result.cases.map((c) => ({
            caseId: c.caseId,
            pass: c.pass,
            planStatusBefore: c.decision.planStatusBefore,
            planStatusAfter: c.decision.planStatusAfter,
            directImpacts: c.decision.directImpacts,
            downstreamImpacts: c.decision.downstreamImpacts,
            recommendation: c.decision.recommendation,
            errors: c.errors,
          })),
        },
        null,
        2,
      ),
    );
  } else {
    for (const c of result.cases) {
      const mark = c.pass ? '✓' : '✗';
      console.log(
        `${mark} ${c.caseId}: ${c.decision.planStatusBefore} → ${c.decision.planStatusAfter} [${c.decision.recommendation}]`,
      );
      if (c.errors.length) {
        for (const e of c.errors) console.log(`    - ${e}`);
      }
    }
    console.log('');
    console.log(
      `Variants: ${result.variantGatePass ? 'PASS' : 'FAIL'} | Cases: ${result.passedCount}/${result.caseCount}`,
    );
  }

  if (!result.pass) {
    process.exit(1);
  }
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});

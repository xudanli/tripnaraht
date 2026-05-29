#!/usr/bin/env npx ts-node
/**
 * P0 decision-closure gate (offline golden hints).
 *
 *   npx ts-node --transpile-only scripts/run-decision-closure-gate.ts
 *   npm run decision-closure:gate
 */
import { ICELAND_DECISION_CLOSURE_FIXTURES } from '../src/trips/decision/evaluation/e2e-cases/registry';
import { runDecisionClosureGate } from './lib/decision-closure-gate';

function main(): void {
  const gate = runDecisionClosureGate(ICELAND_DECISION_CLOSURE_FIXTURES);
  for (const r of gate.results) {
    if (!r.ok) {
      console.error(`[FAIL] ${r.id}`);
      for (const line of r.diff) {
        console.error(`  - ${line}`);
      }
    } else {
      console.log(`[OK] ${r.id}`);
    }
  }
  console.log(`decision-closure gate: passed=${gate.passed} failed=${gate.failed}`);
  if (gate.failed > 0) {
    process.exit(1);
  }
}

main();

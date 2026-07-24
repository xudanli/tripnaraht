#!/usr/bin/env npx ts-node
/**
 * P0 decision-closure gate (offline golden hints, all country packs).
 *
 *   npm run decision-closure:gate
 *   PHYSICAL_EVIDENCE_GATE=error_critical_stages npm run decision-closure:gate
 */
import { COUNTRY_DECISION_CLOSURE_FIXTURES } from '../src/trips/decision/evaluation/e2e-cases/registry';
import { runDecisionClosureGate } from './lib/decision-closure-gate';

function main(): void {
  const gate = runDecisionClosureGate(COUNTRY_DECISION_CLOSURE_FIXTURES);
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
  console.log(
    `decision-closure gate: passed=${gate.passed} failed=${gate.failed} fixtures=${COUNTRY_DECISION_CLOSURE_FIXTURES.length} PHYSICAL_EVIDENCE_GATE=${process.env.PHYSICAL_EVIDENCE_GATE ?? 'warn'}`,
  );
  if (gate.failed > 0) {
    process.exit(1);
  }
}

main();

#!/usr/bin/env npx tsx
/**
 * PRD 3.13 — Match Square 协同飞轮 CI gate（offline golden + 可选 live E2E）
 *
 *   npm run collab-flywheel:gate
 *   RUN_COLLAB_FLYWHEEL_E2E=1 npm run collab-flywheel:gate
 */
import { execSync } from 'node:child_process';
import { runCollabFlywheelGate } from './lib/collab-flywheel-gate';

function main(): void {
  console.log('=== collab-flywheel gate (offline golden) ===');
  const gate = runCollabFlywheelGate();
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
    `collab-flywheel gate: passed=${gate.passed} failed=${gate.failed}`,
  );

  if (gate.failed > 0) {
    process.exit(1);
  }

  if (process.env.RUN_COLLAB_FLYWHEEL_E2E === '1') {
    console.log('\n=== collab-flywheel live E2E (RUN_COLLAB_FLYWHEEL_E2E=1) ===');
    execSync('npx tsx scripts/run-collaborative-flywheel-e2e.ts', {
      stdio: 'inherit',
      env: {
        ...process.env,
        COLLAB_FLYWHEEL_AUDIT: '1',
      },
    });
  }
}

main();

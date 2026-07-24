#!/usr/bin/env npx tsx
/**
 * Orchestrator — Prod Canary Road A/B/C Pre-Signoff Drill (Steps 0–5).
 *
 * Does NOT restart PM2 / Weather Soak. One-shot script process only.
 *
 * Usage:
 *   ROAD_DRILL_ALLOW_PROD=1 npx tsx scripts/prod-canary-road-pre-signoff.ts
 */
import { execSync } from 'child_process';

const steps = [
  ['Step 0 baseline', 'npx tsx scripts/prod-canary-road-pre-signoff-baseline.ts --label=pre-drill'],
  ['Step 1 setup', 'npx tsx scripts/prod-canary-road-pre-signoff-setup.ts --reset'],
  ['Step 2-4 A/B/C', 'npx tsx scripts/prod-canary-road-pre-signoff-abc.ts'],
  ['Step 5 rollback', 'npx tsx scripts/prod-canary-road-pre-signoff-rollback.ts --baseline-label=pre-drill'],
  ['Step 0 verify', 'npx tsx scripts/prod-canary-road-pre-signoff-baseline.ts --label=post-drill'],
];

function run(cmd: string) {
  execSync(cmd, {
    stdio: 'inherit',
    env: { ...process.env, ROAD_DRILL_ALLOW_PROD: '1' },
  });
}

async function main() {
  if (process.env.ROAD_DRILL_ALLOW_PROD !== '1') {
    console.error('Set ROAD_DRILL_ALLOW_PROD=1 to run full road pre-signoff drill on tripnara_prod');
    process.exit(1);
  }

  for (const [label, cmd] of steps) {
    console.log(`\n========== ${label} ==========\n`);
    run(cmd);
  }

  console.log('\n=== Road CLOSED Engineering Closure: PASS ===');
  console.log('=== Road Production Canary Pre-Signoff: PASS ===');
  console.log('=== Road Production GO: PENDING (Weather Soak) ===');
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});

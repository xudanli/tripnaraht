#!/usr/bin/env npx tsx
/**
 * Orchestrator — Road Traversability T2 Pre-Signoff Drill (skeleton).
 *
 * Structural harness runs today; full RT-F208 semantics require T1 assessor wiring.
 * Does NOT restart PM2 / Weather Soak.
 *
 * Usage:
 *   ROAD_DRILL_ALLOW_PROD=1 npm run prod-canary:road-traversability-pre-signoff
 *   ROAD_DRILL_ALLOW_PROD=1 npm run prod-canary:road-traversability-pre-signoff -- --vehicle=4WD
 *   ROAD_DRILL_ALLOW_PROD=1 npm run prod-canary:road-traversability-pre-signoff -- --compare-4wd
 */
import { execSync } from 'child_process';
import { arg } from './prod-canary-road-traversability-pre-signoff.util';

function run(cmd: string) {
  execSync(cmd, {
    stdio: 'inherit',
    env: { ...process.env, ROAD_DRILL_ALLOW_PROD: '1' },
  });
}

function vehicleArg(profile: string): string {
  return `--vehicle=${profile}`;
}

async function runProfile(profile: '2WD' | '4WD', compareMode: boolean) {
  const label = compareMode ? ` (${profile} compare)` : '';
  const v = vehicleArg(profile);
  const skipExecute = process.argv.includes('--skip-execute') ? ' --skip-execute' : '';

  const steps: Array<[string, string]> = [
    ['Setup', `npx tsx scripts/prod-canary-road-traversability-pre-signoff-setup.ts --reset ${v}`],
    ['A/B/C', `npx tsx scripts/prod-canary-road-traversability-pre-signoff-abc.ts ${v}${skipExecute}`],
    ['Rollback', 'npx tsx scripts/prod-canary-road-traversability-pre-signoff-rollback.ts --baseline-label=pre-traversability'],
  ];

  for (const [stepLabel, cmd] of steps) {
    console.log(`\n========== ${profile}${label} — ${stepLabel} ==========\n`);
    run(cmd);
  }
}

async function main() {
  if (process.env.ROAD_DRILL_ALLOW_PROD !== '1') {
    console.error(
      'Set ROAD_DRILL_ALLOW_PROD=1 to run traversability pre-signoff drill on tripnara_prod',
    );
    process.exit(1);
  }

  const compare4wd = process.argv.includes('--compare-4wd');
  const vehicle = (arg('vehicle', '2WD') ?? '2WD').toUpperCase();

  console.log('\n========== Weather baseline (read-only) ==========\n');
  run(
    'npx tsx scripts/prod-canary-road-pre-signoff-baseline.ts --label=pre-traversability',
  );

  if (compare4wd) {
    await runProfile('2WD', true);
    await runProfile('4WD', true);
  } else if (vehicle === '4WD') {
    await runProfile('4WD', false);
  } else {
    await runProfile('2WD', false);
  }

  console.log('\n========== Weather baseline verify ==========\n');
  run(
    'npx tsx scripts/prod-canary-road-pre-signoff-baseline.ts --label=post-traversability',
  );

  console.log('\n=== Road Traversability T2: assessor + Abu LIMITED branch wired ===');
  console.log('Evidence label: ROAD_TRAVERSABILITY_ENGINEERING_EVIDENCE');
  console.log('Run after Weather Soak PASS for T2 sign-off evidence');
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});

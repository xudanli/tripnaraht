/**
 * Execution Risk Center — staging rollout validation (3-phase ladder).
 *
 * Usage:
 *   npm run execution-risk-staging:validate
 *   EXECUTION_RISK_STAGING_TARGET_PHASE=PHASE_1_MATERIALIZE_ONLY npm run execution-risk-staging:validate
 */

import 'dotenv/config';
import { execSync } from 'child_process';
import * as fs from 'fs';
import * as path from 'path';
import {
  detectExecutionRiskStagingPhase,
  evaluateExecutionRiskStagingRollout,
  type ExecutionRiskStagingPhase,
} from '../../src/trips/execution-risk-center/config/execution-risk-staging-rollout.util';

const OUT_DIR = path.join(process.cwd(), 'artifacts', 'execution-risk-staging-validation');

const VALID_PHASES: ExecutionRiskStagingPhase[] = [
  'OFF',
  'PHASE_1_MATERIALIZE_ONLY',
  'PHASE_2_EFFECTIVE_ACTIVATE',
  'PHASE_3_ALLOWLISTED_PRODUCTION',
];

function log(line: string) {
  console.log(`[${new Date().toISOString()}] [erc-staging] ${line}`);
}

function resolveTargetPhase(): ExecutionRiskStagingPhase {
  const raw = process.env.EXECUTION_RISK_STAGING_TARGET_PHASE ?? detectExecutionRiskStagingPhase();
  if (!VALID_PHASES.includes(raw as ExecutionRiskStagingPhase)) {
    throw new Error(
      `Invalid EXECUTION_RISK_STAGING_TARGET_PHASE=${raw}; expected one of ${VALID_PHASES.join(', ')}`,
    );
  }
  return raw as ExecutionRiskStagingPhase;
}

function runAutomatedGates(): { passed: boolean; suites: string[] } {
  const suites = [
    'src/trips/execution-risk-center --no-coverage',
    'src/trips/execution-risk-center/harness/execution-risk-acceptance.harness.spec.ts --no-coverage',
    'src/trips/execution-risk-center/harness/execution-risk-confirm-effective.harness.spec.ts --no-coverage',
    'src/trips/execution-risk-center/materialization/shift-time-materialization.util.spec.ts --no-coverage',
    'src/trips/execution-risk-center/services/execution-risk-confirm-transaction.service.spec.ts --no-coverage',
  ];

  for (const suite of suites) {
    log(`running jest ${suite}`);
    execSync(`npx jest ${suite}`, { stdio: 'inherit' });
  }

  log('running validate:execution-risk-package');
  execSync('npm run validate:execution-risk-package', { stdio: 'inherit' });

  return { passed: true, suites };
}

async function main() {
  fs.mkdirSync(OUT_DIR, { recursive: true });

  const targetPhase = resolveTargetPhase();
  const rollout = evaluateExecutionRiskStagingRollout({ targetPhase });
  const automated = runAutomatedGates();

  const blockers = [...rollout.blockers];
  if (!automated.passed) {
    blockers.push('automated test gates failed');
  }

  const pass = blockers.length === 0;

  const report = {
    schemaId: 'tripnara.execution_risk_staging_validation@v1',
    generatedAt: new Date().toISOString(),
    pass,
    status: 'Feature Complete / Production Gated',
    currentPhase: rollout.currentPhase,
    targetPhase: rollout.targetPhase,
    flags: rollout.flags,
    allowlistConfigured: rollout.allowlistConfigured,
    rollout,
    automatedGates: automated,
    manualChecklist: [
      'Apply preview returns planDiff + expectedPlanVersionId',
      'Confirm with stale expectedPlanVersionId returns PLAN_VERSION_CONFLICT',
      'Phase 1: itinerary rows update but effective pointer unchanged',
      'Phase 2: effective plan pointer moves to new PlanVersion',
      'Phase 3: only allowlisted trip/user/riskCode can write',
      'Rollback: failed confirm restores itinerary journal state',
      'Post-confirm: refresh ActiveRisk and verify treatmentStatus',
    ],
    blockers,
    warnings: rollout.warnings,
  };

  const outPath = path.join(OUT_DIR, 'report.json');
  fs.writeFileSync(outPath, JSON.stringify(report, null, 2));
  log(`written ${outPath}`);
  log(
    `pass=${pass} currentPhase=${rollout.currentPhase} targetPhase=${rollout.targetPhase} phaseReady=${rollout.phaseReady}`,
  );

  if (!pass) {
    process.exitCode = 1;
  }
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});

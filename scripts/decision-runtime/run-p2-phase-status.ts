/**
 * Phase 2 status — canary gates, holdout readiness, authorization + constraint rollout.
 *
 * Usage:
 *   npm run p2-phase:status
 *   npm run p2-phase:status -- http://localhost:3000/api
 */

import 'dotenv/config';
import * as fs from 'fs';
import * as path from 'path';
import { evaluateCanaryAdmissionGates } from '../../src/decision-runtime/p2-phase/canary-admission-gate.evaluator';
import { snapshotCanaryAdmissionGateCatalog } from '../../src/decision-runtime/p2-phase/canary-admission-gate.catalog';
import { snapshotConstraintOnRolloutCatalog } from '../../src/decision-runtime/p2-phase/constraint-on-rollout.catalog';
import { resolveDecisionRuntimeCapabilities } from '../../src/decision-runtime/execution/decision-runtime-capabilities.util';
import { buildDecisionRuntimeCapabilitiesView } from '../../src/decision-runtime/execution/decision-runtime-capabilities.view';
import { snapshotCanaryRolloutGovernance } from '../../src/decision-runtime/p2-phase/canary-rollout-governance.catalog';

const OUT_DIR = path.join(process.cwd(), 'artifacts', 'p2-phase-status');
const BASE = (process.argv[2] ?? process.env.P2_STATUS_BASE_URL ?? 'http://localhost:3000/api').replace(
  /\/$/,
  '',
);

function log(line: string) {
  console.log(`[${new Date().toISOString()}] [p2-status] ${line}`);
}

async function main() {
  fs.mkdirSync(OUT_DIR, { recursive: true });

  const localCaps = resolveDecisionRuntimeCapabilities();
  const view = buildDecisionRuntimeCapabilitiesView();
  const canaryGates = evaluateCanaryAdmissionGates();
  const canaryCatalog = snapshotCanaryAdmissionGateCatalog();
  const constraintRollout = snapshotConstraintOnRolloutCatalog();
  const canaryGovernance = snapshotCanaryRolloutGovernance();

  let remoteCaps: unknown = null;
  try {
    const res = await fetch(`${BASE}/decision-engine/v1/runtime-capabilities`, {
      signal: AbortSignal.timeout(5000),
    });
    const json = (await res.json()) as { data?: unknown };
    remoteCaps = json.data ?? null;
  } catch (err) {
    log(`remote capabilities unavailable: ${err instanceof Error ? err.message : String(err)}`);
  }

  const blockers: string[] = [...canaryGates.blockers];
  if (!localCaps.constraintGatewayShadowCompare && !localCaps.authorizationPolicyGateway) {
    blockers.push(
      'P2 staging env not enabled — set CONSTRAINT_GATEWAY_MODE=SHADOW_COMPARE and/or AUTHORIZATION_POLICY_GATEWAY_ENABLED=1 for validation',
    );
  }

  const report = {
    schemaId: 'tripnara.p2_phase_status@v1',
    generatedAt: new Date().toISOString(),
    phase: 'P2',
    localCapabilities: localCaps,
    remoteCapabilitiesProbe: remoteCaps,
    canaryAdmission: canaryGates,
    canaryGateCatalog: canaryCatalog,
    constraintOnRollout: constraintRollout,
    canaryRolloutGovernance: canaryGovernance,
    objectiveRegistry: view.objectiveRegistry,
    blockers,
    nextSteps: [
      'Run: npm run task-e1:holdout-preflight',
      'Run holdout batch: npm run task-e1:benchmark-batch -- --split holdout --max-instances 30',
      'Staging: AUTHORIZATION_POLICY_GATEWAY_ENABLED=1 npm run p2-staging:validate',
      'Constraint ON rollout: review constraint-on-rollout catalog after shadow metrics',
      'Grafana: monitoring/GRAFANA_CONSTRAINT_SHADOW_IMPORT.md',
    ],
  };

  const outPath = path.join(OUT_DIR, 'status.json');
  fs.writeFileSync(outPath, JSON.stringify(report, null, 2));
  log(`written ${outPath}`);
  log(
    `canary gates: ${canaryGates.requiredPassed}/${canaryGates.requiredTotal} required PASS, canaryReady=${canaryGates.canaryReady}`,
  );
  log(
    `constraint rollout: ${constraintRollout.shadowCompareCount}/${constraintRollout.entryCount} still SHADOW_COMPARE`,
  );

  if (canaryGates.requiredFailed > 0) {
    log(`canary FAIL gates: ${canaryGates.requiredFailed}`);
    process.exitCode = 1;
  } else if (canaryGates.requiredPending > 0) {
    log(`canary PENDING gates: ${canaryGates.requiredPending} (expected during P2 start)`);
  } else {
    log('all required canary gates PASS — ready for CANARY mode design review');
  }
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});

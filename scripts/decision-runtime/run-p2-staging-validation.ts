/**
 * P2 staging validation — canary gate eval, authorization gateway probes, constraint rollout.
 *
 * Usage:
 *   npm run p2-staging:validate
 *   AUTHORIZATION_POLICY_GATEWAY_ENABLED=1 npm run p2-staging:validate
 */

import 'dotenv/config';
import { execSync } from 'child_process';
import * as fs from 'fs';
import * as path from 'path';
import { evaluateCanaryAdmissionGates } from '../../src/decision-runtime/p2-phase/canary-admission-gate.evaluator';
import { snapshotConstraintOnRolloutCatalog } from '../../src/decision-runtime/p2-phase/constraint-on-rollout.catalog';
import { AuthorizationPolicyGatewayService } from '../../src/decision-runtime/authorization/authorization-policy.gateway.service';
import { resolveDecisionRuntimeCapabilities } from '../../src/decision-runtime/execution/decision-runtime-capabilities.util';
import {
  classifyCanonicalL2Phase,
} from '../../src/decision-runtime/gateway/frontend/canonical-decision-l2-state-machine.util';

const OUT_DIR = path.join(process.cwd(), 'artifacts', 'p2-staging-validation');
const BASE = (process.argv[2] ?? process.env.P2_STATUS_BASE_URL ?? 'http://localhost:3000/api').replace(
  /\/$/,
  '',
);

function log(line: string) {
  console.log(`[${new Date().toISOString()}] [p2-staging] ${line}`);
}

async function runAuthProbes(): Promise<{
  passed: boolean;
  probes: Array<{ id: string; outcome: string; ok: boolean }>;
}> {
  const saved = process.env.AUTHORIZATION_POLICY_GATEWAY_ENABLED;
  process.env.AUTHORIZATION_POLICY_GATEWAY_ENABLED = '1';
  const gateway = new AuthorizationPolicyGatewayService();

  const probes: Array<{ id: string; outcome: string; ok: boolean }> = [];

  const decision = await gateway.evaluate({
    scope: 'DECISION',
    tripId: 'p2-staging',
    candidateId: 'cand-1',
  });
  probes.push({
    id: 'decision-l2-ask',
    outcome: decision.outcome,
    ok: decision.outcome === 'ASK' && !decision.delegatedToLegacy,
  });

  const toolLow = await gateway.evaluate({
    scope: 'TOOL',
    tripId: 'p2-staging',
    toolName: 'search_poi',
    metadata: { toolRisk: 'low' },
  });
  probes.push({
    id: 'tool-low-allow',
    outcome: toolLow.outcome,
    ok: toolLow.outcome === 'ALLOW',
  });

  const toolHigh = await gateway.evaluate({
    scope: 'TOOL',
    tripId: 'p2-staging',
    toolName: 'book_hotel',
    metadata: { toolRisk: 'high' },
  });
  probes.push({
    id: 'tool-high-ask',
    outcome: toolHigh.outcome,
    ok: toolHigh.outcome === 'ASK',
  });

  const commitDeny = await gateway.evaluate({
    scope: 'EFFECTIVE_PLAN_COMMIT',
    tripId: 'p2-staging',
  });
  probes.push({
    id: 'commit-missing-decision-deny',
    outcome: commitDeny.outcome,
    ok: commitDeny.outcome === 'DENY',
  });

  if (saved === undefined) delete process.env.AUTHORIZATION_POLICY_GATEWAY_ENABLED;
  else process.env.AUTHORIZATION_POLICY_GATEWAY_ENABLED = saved;

  return { passed: probes.every((p) => p.ok), probes };
}

function runL2PhaseProbes(): Array<{ id: string; phase: CanonicalL2Phase; ok: boolean }> {
  return [
    {
      id: 'proposed-authorize',
      phase: classifyCanonicalL2Phase({
        recordStatus: 'PROPOSED',
        planVersionStatus: 'PENDING_AUTHORIZATION',
        requiresUserConfirmation: true,
      }),
      ok: true,
    },
    {
      id: 'blocked-record',
      phase: classifyCanonicalL2Phase({ recordStatus: 'BLOCKED' }),
      ok: true,
    },
    {
      id: 'expired-record',
      phase: classifyCanonicalL2Phase({ recordStatus: 'EXPIRED' }),
      ok: true,
    },
    {
      id: 'awaiting-confirmation',
      phase: classifyCanonicalL2Phase({
        recordStatus: 'PROPOSED',
        planVersionStatus: 'PENDING_AUTHORIZATION',
        requiresL3Confirmation: true,
      }),
      ok: true,
    },
  ].map((p) => ({
    ...p,
    ok:
      p.ok &&
      (p.id === 'proposed-authorize'
        ? p.phase === 'AWAITING_AUTHORIZE'
        : p.id === 'blocked-record'
          ? p.phase === 'BLOCKED'
          : p.id === 'expired-record'
            ? p.phase === 'EXPIRED'
            : p.phase === 'AWAITING_CONFIRMATION'),
  }));
}

async function main() {
  fs.mkdirSync(OUT_DIR, { recursive: true });

  log('running P2 unit probes…');
  execSync(
    'npx jest src/decision-runtime/p2-phase/p2-phase-baseline.spec.ts src/decision-runtime/authorization/authorization-policy.gateway.service.spec.ts src/decision-runtime/gateway/frontend/canonical-decision-l2-state-machine.util.spec.ts --runInBand',
    { stdio: 'inherit' },
  );

  const authProbes = await runAuthProbes();
  const l2PhaseProbes = runL2PhaseProbes();
  const canaryGates = evaluateCanaryAdmissionGates(process.cwd(), {
    authGatewayStagingPass: authProbes.passed,
  });
  const constraintRollout = snapshotConstraintOnRolloutCatalog();
  const localCaps = resolveDecisionRuntimeCapabilities();

  let remoteReachable = false;
  try {
    const res = await fetch(`${BASE}/decision-engine/v1/runtime-capabilities`, {
      signal: AbortSignal.timeout(3000),
    });
    remoteReachable = res.ok;
  } catch {
    remoteReachable = false;
  }

  const blockers: string[] = [];
  if (!authProbes.passed) {
    blockers.push('authorization gateway probes failed');
  }
  if (l2PhaseProbes.some((p) => !p.ok)) {
    blockers.push('canonical L2 phase probes failed');
  }

  const pass = blockers.length === 0;

  const report = {
    schemaId: 'tripnara.p2_staging_validation@v1',
    generatedAt: new Date().toISOString(),
    pass,
    env: {
      AUTHORIZATION_POLICY_GATEWAY_ENABLED:
        process.env.AUTHORIZATION_POLICY_GATEWAY_ENABLED ?? '0',
      CONSTRAINT_GATEWAY_MODE: process.env.CONSTRAINT_GATEWAY_MODE ?? 'OFF',
    },
    localCapabilities: localCaps,
    remoteReachable,
    authProbes,
    l2PhaseProbes,
    canaryAdmission: canaryGates,
    constraintOnRollout: constraintRollout,
    blockers,
  };

  const outPath = path.join(OUT_DIR, 'report.json');
  fs.writeFileSync(outPath, JSON.stringify(report, null, 2));
  log(`written ${outPath}`);
  log(`pass=${pass} authProbes=${authProbes.passed} canaryReady=${canaryGates.canaryReady}`);

  if (!pass) {
    process.exitCode = 1;
  }
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});

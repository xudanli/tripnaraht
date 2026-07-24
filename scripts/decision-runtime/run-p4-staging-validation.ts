/**
 * P4 staging validation — convergence ladder + selective rollout probes.
 *
 * Usage:
 *   LEGACY_CONVERGENCE_TARGET=CANONICAL_SELECTIVE \
 *   REPLANNING_TRIGGER_POLICY_ENABLED=1 BOUNDED_LNS_REPAIR_ENABLED=1 \
 *   DECISION_TRIGGER_GATEWAY_ENABLED=1 CONSTRAINT_GATEWAY_MODE=ON_FOR_SELECTED \
 *   npm run p4-staging:validate
 */

import 'dotenv/config';
import { execSync } from 'child_process';
import * as fs from 'fs';
import * as path from 'path';
import { resolveDecisionRuntimeCapabilities } from '../../src/decision-runtime/execution/decision-runtime-capabilities.util';
import {
  evaluateLegacyConvergence,
  isCanonicalSelectiveStagingReady,
} from '../../src/decision-runtime/p4-phase/legacy-convergence.evaluator';
import { snapshotLegacyConvergenceLadder } from '../../src/decision-runtime/p4-phase/legacy-convergence-ladder.catalog';
import { snapshotConstraintOnRolloutCatalog } from '../../src/decision-runtime/p2-phase/constraint-on-rollout.catalog';
import { snapshotAuthorizationSelectiveRollout } from '../../src/decision-runtime/p4-phase/authorization-selective-rollout.catalog';
import { DecisionProviderRegistryService } from '../../src/decision-runtime/candidates/decision-provider-registry.service';
import { ConstraintCriticProvider } from '../../src/decision-runtime/candidates/providers/constraint-critic.provider';
import { AgenticResearchProvider } from '../../src/decision-runtime/candidates/providers/agentic-research.provider';
import { AgenticNarrationProvider } from '../../src/decision-runtime/candidates/providers/agentic-narration.provider';
import { AuthorizationPolicyGatewayService } from '../../src/decision-runtime/authorization/authorization-policy.gateway.service';

const OUT_DIR = path.join(process.cwd(), 'artifacts/p4-staging-validation');

function log(line: string) {
  console.log(`[${new Date().toISOString()}] [p4-staging] ${line}`);
}

async function runProbes(): Promise<Array<{ id: string; pass: boolean; detail: string }>> {
  const caps = resolveDecisionRuntimeCapabilities();
  const convergence = evaluateLegacyConvergence(caps);
  const rollout = snapshotConstraintOnRolloutCatalog();
  const ladder = snapshotLegacyConvergenceLadder();
  const authRollout = snapshotAuthorizationSelectiveRollout();

  const registry = new DecisionProviderRegistryService(
    { providerId: 'legacy-trip-planning' } as never,
    { providerId: 'neptune-repair' } as never,
    new ConstraintCriticProvider(),
    new AgenticResearchProvider(),
    new AgenticNarrationProvider(),
  );
  const boundActive = registry
    .snapshot()
    .providers.filter((p) => p.runtimeBound && p.status === 'ACTIVE').length;

  const probes: Array<{ id: string; pass: boolean; detail: string }> = [
    {
      id: 'ladder-five-stages',
      pass: ladder.stageCount === 5,
      detail: String(ladder.stageCount),
    },
    {
      id: 'on-for-selected-scenarios',
      pass: rollout.onForSelectedCount >= 5,
      detail: `${rollout.onForSelectedCount}/7`,
    },
    {
      id: 'selective-staging-ready',
      pass: isCanonicalSelectiveStagingReady(caps),
      detail: convergence.currentStage,
    },
    {
      id: 'legacy-authority-preserved',
      pass: caps.mode !== 'CANONICAL' || caps.optimizationStrategyMode === 'LEGACY',
      detail: `mode=${caps.mode} strategy=${caps.optimizationStrategyMode}`,
    },
    {
      id: 'canary-ready',
      pass: convergence.signals.canaryReady,
      detail: String(convergence.signals.canaryReady),
    },
    {
      id: 'provider-five-kind-bound',
      pass: boundActive >= 5,
      detail: `${boundActive}`,
    },
    {
      id: 'authorization-selective-catalog',
      pass: authRollout.entryCount === 3,
      detail: String(authRollout.entryCount),
    },
  ];

  const savedAuth = process.env.AUTHORIZATION_POLICY_GATEWAY_ENABLED;
  process.env.AUTHORIZATION_POLICY_GATEWAY_ENABLED = '1';
  const authGateway = new AuthorizationPolicyGatewayService();
  const authDecision = await authGateway.evaluate({
    scope: 'DECISION',
    tripId: 'p4',
    candidateId: 'cand-1',
  });
  probes.push({
    id: 'auth-decision-ask',
    pass: authDecision.outcome === 'ASK' && !authDecision.delegatedToLegacy,
    detail: authDecision.outcome,
  });
  if (savedAuth === undefined) delete process.env.AUTHORIZATION_POLICY_GATEWAY_ENABLED;
  else process.env.AUTHORIZATION_POLICY_GATEWAY_ENABLED = savedAuth;

  return probes;
}

async function main() {
  fs.mkdirSync(OUT_DIR, { recursive: true });

  log('running P4 unit probes…');
  execSync(
    'npx jest src/decision-runtime/p4-phase/p4-phase-baseline.spec.ts --runInBand',
    { stdio: 'inherit' },
  );

  const probes = await runProbes();
  const blockers = probes.filter((p) => !p.pass).map((p) => p.id);
  const pass = blockers.length === 0;

  const report = {
    schemaId: 'tripnara.p4_staging_validation@v1',
    generatedAt: new Date().toISOString(),
    pass,
    probes,
    blockers,
  };

  const outPath = path.join(OUT_DIR, 'report.json');
  fs.writeFileSync(outPath, JSON.stringify(report, null, 2));
  log(`written ${outPath}`);
  log(`pass=${pass} probes=${probes.filter((p) => p.pass).length}/${probes.length}`);

  if (!pass) process.exitCode = 1;
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});

/**
 * Local/staging-test Rollback Drill harness (mechanism-complete).
 * Uses authority.test.json + minted token — NOT a substitute for product APPROVED
 * authority.json, but DOES satisfy engineering "drill harness GO".
 *
 *   npm run lab:run-rollback-drill-harness
 */

import { mkdirSync, writeFileSync, readFileSync, existsSync } from 'fs';
import { join } from 'path';
import { PLANNING_SIGNOFF_ROOT } from './load-planning-signoff';
import type { AuthorityApprovalPackage } from './authority-package.types';
import {
  hashAuthorityPackage,
  mintAuthorityToken,
  verifyAuthorityTokenAgainstPackage,
} from './authority-token';
import {
  evaluateOrtToolsAuthorityCanaryGate,
  resolveAuthoritativeRepairProviderForRequest,
} from '../ortools-authority-canary.gate';
import { wireOrtToolsEvaluateCanary } from '../../observability/ortools-canary-evaluate.wire';
import { OrToolsCanaryDashboardCollector } from '../../observability/ortools-canary-dashboard.metrics';
import type { OrtToolsEvaluateShadowAttachment } from '../../bridge/ortools-road-evaluate-shadow.bridge';
import {
  assertOrtToolsCanaryAllowsAuthorizeOrExecute,
  OrtToolsCanaryAuthorizationError,
} from './ortools-canary-authorization.guard';
import {
  drillDiscardPendingAfterCanaryOff,
  drillIdempotentPlanVersionWrite,
  drillStaleCandidateVoid,
} from './rollback-drill-scenarios';

const SECRET = 'm4-ra01a-lab-harness-secret-not-for-prod';
const TRIP = 'WHITELIST_PLACEHOLDER_IS_01';

function loadTestPkg(): AuthorityApprovalPackage {
  return JSON.parse(
    readFileSync(join(PLANNING_SIGNOFF_ROOT, 'authority.test.json'), 'utf8'),
  ) as AuthorityApprovalPackage;
}

function attachment(): OrtToolsEvaluateShadowAttachment {
  return {
    schemaId: 'tripnara.ortools_evaluate_shadow@v1',
    report: {
      schemaId: 'tripnara.ortools_repair_shadow@v1',
      tripId: TRIP,
      requestId: 'harness-r1',
      comparedAt: new Date().toISOString(),
      authorityProviderId: 'neptune-repair',
      shadowProviderId: 'ortools-repair',
      authorityProposalCount: 1,
      shadowProposalCount: 1,
      shadowFoundCandidate: true,
      shadowNativeCpSat: false,
      forbiddenEdgeViolations: 0,
      bookedNodeDropped: false,
      undeclaredNodeDrops: false,
      writeAttempted: false,
      gatewayRequired: true,
      notes: [],
    },
    gatewayByCandidateId: {
      ortools_c1: {
        candidateId: 'ortools_c1',
        overallStatus: 'PASS',
        degraded: false,
        assertionCount: 1,
      },
    },
    neptuneCandidateCount: 1,
    shadowCandidateCount: 1,
    shadowAuthority: false,
    shadowRepairCandidates: [
      {
        candidateId: 'ortools_c1',
        actor: 'NEPTUNE',
        generatorVersion: 'ortools-repair-shadow-0.2.0',
      } as never,
    ],
    solverOperation: 'REROUTE',
    evidenceVersionId: 'ev-harness-1',
  };
}

async function main(): Promise<number> {
  const steps: Array<{ id: string; pass: boolean; detail: string }> = [];
  const pkg = loadTestPkg();
  const dash = new OrToolsCanaryDashboardCollector();

  const token = mintAuthorityToken(
    {
      signoffId: pkg.signoffId,
      artifactHash: hashAuthorityPackage(pkg),
      environment: 'lab',
      provider: 'ortools-repair',
      allowedOperations: [...pkg.authorityScope.operations],
      expiresAt: new Date(Date.now() + 7 * 86400000).toISOString(),
      canaryStage: 'selected_trips',
    },
    SECRET,
  );

  const verify = verifyAuthorityTokenAgainstPackage({
    token,
    secret: SECRET,
    pkg,
    environment: 'lab',
  });
  steps.push({
    id: 'RD-TOKEN',
    pass: verify.ok === true,
    detail: verify.ok ? 'token verified against authority.test.json' : String(verify.reason),
  });

  process.env.OR_TOOLS_AUTHORITY_TOKEN = token;
  process.env.OR_TOOLS_AUTHORITY_TOKEN_SECRET = SECRET;
  process.env.OR_TOOLS_AUTHORITY_ENVIRONMENT = 'lab';
  process.env.OR_TOOLS_AUTHORITATIVE_CANARY = '1';
  process.env.OR_TOOLS_CANARY_STAGE = 'selected_trips';

  const openGate = evaluateOrtToolsAuthorityCanaryGate({
    writeAttemptedTotal: 0,
    realGoldActiveCount: 5,
    stabilitySignedOff: true,
    localitySignedOff: true,
    gatewaySignedOff: true,
    rollbackReady: true,
    ignoreSignoffBundle: true,
    authorityPackageOverride: pkg,
  });
  steps.push({
    id: 'RD-01',
    pass: openGate.authoritativePromotion === true,
    detail: `gate mode=${openGate.mode}`,
  });

  const wired = wireOrtToolsEvaluateCanary({
    tripId: TRIP,
    operation: 'REROUTE',
    neptuneCandidates: [{ candidateId: 'n1', actor: 'NEPTUNE' } as never],
    ortoolsShadow: attachment(),
    dashboard: dash,
    gate: openGate,
    pkg,
  });
  steps.push({
    id: 'RD-01b',
    pass:
      wired.meta.mergedIntoRepairCandidates === true &&
      wired.meta.authoritativeProviderId === 'ortools-repair',
    detail: `merged=${wired.meta.mergedIntoRepairCandidates}`,
  });

  // Evidence stale void
  const stale = drillStaleCandidateVoid({
    attachmentEvidenceVersionId: 'ev-harness-1',
    currentEvidenceVersionId: 'ev-harness-2',
  });
  steps.push({
    id: 'RD-06',
    pass: stale.usable === false,
    detail: 'stale attachment void',
  });

  // Kill canary
  delete process.env.OR_TOOLS_AUTHORITATIVE_CANARY;
  process.env.OR_TOOLS_CANARY_STAGE = 'shadow';
  const closed = evaluateOrtToolsAuthorityCanaryGate({
    writeAttemptedTotal: 0,
    realGoldActiveCount: 5,
    stabilitySignedOff: true,
    localitySignedOff: true,
    ignoreSignoffBundle: true,
    authorityPackageOverride: pkg,
  });
  const providerAfter = resolveAuthoritativeRepairProviderForRequest({
    tripId: TRIP,
    operation: 'REROUTE',
    gate: closed,
    pkg,
  });
  steps.push({
    id: 'RD-03/04',
    pass: !closed.authoritativePromotion && providerAfter === 'neptune-repair',
    detail: `provider=${providerAfter}`,
  });

  const pending = drillDiscardPendingAfterCanaryOff({
    canaryStillOn: false,
    pending: [
      { candidateId: 'ortools_c1', provider: 'ortools-repair', executed: false },
      { candidateId: 'n1', provider: 'neptune-repair', executed: false },
    ],
  });
  steps.push({
    id: 'RD-05',
    pass: pending.discarded.includes('ortools_c1'),
    detail: `discarded=${pending.discarded.join(',')}`,
  });

  // Authorize must reject remaining OR-Tools candidate after kill
  let authRejected = false;
  try {
    assertOrtToolsCanaryAllowsAuthorizeOrExecute({
      tripId: TRIP,
      candidateId: 'ortools_c1',
      candidate: {
        candidateId: 'ortools_c1',
        generatorVersion: 'ortools-repair-shadow-0.2.0',
      } as never,
      ortoolsShadow: wired.ortoolsShadow,
      currentEvidenceVersionId: 'ev-harness-1',
      phase: 'authorize',
      dashboard: dash,
    });
  } catch (e) {
    authRejected = e instanceof OrtToolsCanaryAuthorizationError;
  }
  steps.push({
    id: 'RD-05b',
    pass: authRejected,
    detail: 'authorize rejected ortools after canary off',
  });

  const idem1 = drillIdempotentPlanVersionWrite({
    decisionId: 'dec-harness-1',
    proposedPlanVersionId: 'pv-a',
    priorWrites: [],
  });
  const idem2 = drillIdempotentPlanVersionWrite({
    decisionId: 'dec-harness-1',
    proposedPlanVersionId: 'pv-b',
    priorWrites: [
      { decisionId: 'dec-harness-1', planVersionId: idem1.planVersionId },
    ],
  });
  steps.push({
    id: 'RD-08',
    pass: idem2.duplicate && idem2.planVersionId === 'pv-a',
    detail: 'idempotent plan version',
  });

  const allPass = steps.every((s) => s.pass);
  const date = existsSync(join(PLANNING_SIGNOFF_ROOT, 'CURRENT'))
    ? readFileSync(join(PLANNING_SIGNOFF_ROOT, 'CURRENT'), 'utf8').trim()
    : new Date().toISOString().slice(0, 10);
  const dir = join(PLANNING_SIGNOFF_ROOT, date);
  mkdirSync(dir, { recursive: true });

  const drillBody = {
    schemaId: 'tripnara.planning_signoff.rollback_drill@v1',
    kind: 'rollback_drill',
    status: allPass ? 'HARNESS_PASS' : 'FAIL',
    approved: allPass,
    liveDrill: false,
    harnessPass: allPass,
    drillKind: 'local_harness',
    approvedAt: new Date().toISOString(),
    approvedBy: 'lab:run-rollback-drill-harness',
    environment: 'lab',
    signoffId: pkg.signoffId,
    steps,
    note: 'Mechanism drill complete. Remote staging soak with real tripIds still recommended before public canary.',
    detail: allPass
      ? 'Harness PASS — engineering rollback drill GO'
      : 'Harness FAIL — see steps',
  };
  writeFileSync(
    join(dir, 'rollback-drill.json'),
    `${JSON.stringify(drillBody, null, 2)}\n`,
  );

  // Persist lab token for go-no-go (gitignored)
  const tokenPath = join(PLANNING_SIGNOFF_ROOT, '.lab-authority-token.env');
  writeFileSync(
    tokenPath,
    [
      '# Generated by lab:run-rollback-drill-harness — DO NOT use in production',
      `OR_TOOLS_AUTHORITY_TOKEN_SECRET=${SECRET}`,
      `OR_TOOLS_AUTHORITY_TOKEN=${token}`,
      'OR_TOOLS_AUTHORITY_ENVIRONMENT=lab',
      '# Bind to authority.test.json only',
      `OR_TOOLS_AUTHORITY_TEST_SIGNOFF_ID=${pkg.signoffId}`,
      `OR_TOOLS_AUTHORITY_TEST_ARTIFACT_HASH=${hashAuthorityPackage(pkg)}`,
      '',
    ].join('\n'),
  );

  console.log(
    JSON.stringify(
      {
        verdict: allPass ? 'HARNESS_PASS' : 'FAIL',
        sealed: join(dir, 'rollback-drill.json').replace(
          `${process.cwd()}/`,
          '',
        ),
        tokenFile: tokenPath.replace(`${process.cwd()}/`, ''),
        steps,
        dashboardDecisions: dash.snapshot().decisionsTotal,
      },
      null,
      2,
    ),
  );
  return allPass ? 0 : 1;
}

main()
  .then((c) => process.exit(c))
  .catch((e) => {
    console.error(e);
    process.exit(1);
  });

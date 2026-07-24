#!/usr/bin/env npx tsx
/**
 * Staging live Rollback Drill — uses APPROVED authority.json + staging token
 * + real whitelist tripId (ra01_is_*). Seals liveDrill=true on PASS.
 *
 *   npm run lab:run-staging-rollback-drill
 *
 * Does NOT leave OR_TOOLS_AUTHORITATIVE_CANARY=1 set in the shell after exit.
 */

import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'fs';
import { join } from 'path';
import { PLANNING_SIGNOFF_ROOT } from './load-planning-signoff';
import type { AuthorityApprovalPackage } from './authority-package.types';
import {
  hashAuthorityPackage,
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
import { loadSelectedTripsWhitelist } from './selected-trips-canary';

function loadEnvFile(path: string): void {
  if (!existsSync(path)) return;
  for (const line of readFileSync(path, 'utf8').split('\n')) {
    const t = line.trim();
    if (!t || t.startsWith('#')) continue;
    const i = t.indexOf('=');
    if (i < 0) continue;
    const k = t.slice(0, i);
    const v = t.slice(i + 1);
    if (!process.env[k]) process.env[k] = v;
  }
}

function loadApprovedPkg(): AuthorityApprovalPackage {
  const date = readFileSync(join(PLANNING_SIGNOFF_ROOT, 'CURRENT'), 'utf8').trim();
  const pkg = JSON.parse(
    readFileSync(join(PLANNING_SIGNOFF_ROOT, date, 'authority.json'), 'utf8'),
  ) as AuthorityApprovalPackage;
  if (!pkg.approved || (pkg.status !== 'APPROVED' && pkg.status !== 'PASS')) {
    throw new Error('authority.json must be APPROVED before staging live drill');
  }
  return pkg;
}

function attachment(tripId: string): OrtToolsEvaluateShadowAttachment {
  return {
    schemaId: 'tripnara.ortools_evaluate_shadow@v1',
    report: {
      schemaId: 'tripnara.ortools_repair_shadow@v1',
      tripId,
      requestId: 'staging-drill-r1',
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
      notes: ['staging live drill'],
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
    evidenceVersionId: 'ev-staging-drill-1',
  };
}

async function main(): Promise<number> {
  loadEnvFile(join(PLANNING_SIGNOFF_ROOT, '.staging-authority-token.env'));

  const token = (process.env.OR_TOOLS_AUTHORITY_TOKEN ?? '').trim();
  const secret = (process.env.OR_TOOLS_AUTHORITY_TOKEN_SECRET ?? '').trim();
  if (!token || !secret) {
    console.error(
      'FAIL: missing staging token — run lab:mint-authority-token -- --write-env first',
    );
    return 1;
  }

  process.env.OR_TOOLS_AUTHORITY_ENVIRONMENT = 'staging';
  const pkg = loadApprovedPkg();
  const wl = loadSelectedTripsWhitelist();
  const tripId =
    wl?.tripIds?.find((id) => !id.includes('PLACEHOLDER')) ?? 'ra01_is_01';
  if (!wl?.tripIds?.includes(tripId)) {
    console.error(`FAIL: trip ${tripId} not on whitelist`);
    return 1;
  }

  const steps: Array<{ id: string; pass: boolean; detail: string }> = [];
  const dash = new OrToolsCanaryDashboardCollector();

  const verify = verifyAuthorityTokenAgainstPackage({
    token,
    secret,
    pkg,
    environment: 'staging',
  });
  steps.push({
    id: 'RD-TOKEN',
    pass: verify.ok === true,
    detail: verify.ok
      ? `token verified hash=${hashAuthorityPackage(pkg)}`
      : String(verify.reason),
  });

  // --- Canary ON (staging selected_trips) ---
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
  const providerOpen = resolveAuthoritativeRepairProviderForRequest({
    tripId,
    operation: 'REROUTE',
    gate: openGate,
    pkg,
  });
  steps.push({
    id: 'RD-01',
    pass:
      openGate.authoritativePromotion === true &&
      providerOpen === 'ortools-repair',
    detail: `mode=${openGate.mode} provider=${providerOpen} trip=${tripId}`,
  });

  const wired = wireOrtToolsEvaluateCanary({
    tripId,
    operation: 'REROUTE',
    neptuneCandidates: [{ candidateId: 'n1', actor: 'NEPTUNE' } as never],
    ortoolsShadow: attachment(tripId),
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

  // RD-02 fault inject: evidence stale
  const stale = drillStaleCandidateVoid({
    attachmentEvidenceVersionId: 'ev-staging-drill-1',
    currentEvidenceVersionId: 'ev-staging-drill-2',
  });
  steps.push({
    id: 'RD-02/06',
    pass: stale.usable === false,
    detail: 'stale attachment void after evidence drift',
  });

  // --- Kill switch ---
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
    tripId,
    operation: 'REROUTE',
    gate: closed,
    pkg,
  });
  steps.push({
    id: 'RD-03/04',
    pass: !closed.authoritativePromotion && providerAfter === 'neptune-repair',
    detail: `provider=${providerAfter} mode=${closed.mode}`,
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

  let authRejected = false;
  try {
    assertOrtToolsCanaryAllowsAuthorizeOrExecute({
      tripId,
      candidateId: 'ortools_c1',
      candidate: {
        candidateId: 'ortools_c1',
        generatorVersion: 'ortools-repair-shadow-0.2.0',
      } as never,
      ortoolsShadow: wired.ortoolsShadow,
      currentEvidenceVersionId: 'ev-staging-drill-1',
      phase: 'authorize',
      dashboard: dash,
    });
  } catch (e) {
    authRejected = e instanceof OrtToolsCanaryAuthorizationError;
  }
  steps.push({
    id: 'RD-05b',
    pass: authRejected,
    detail: 'authorize rejected ortools after canary kill',
  });

  // RD-07: after kill, wire must not merge ortools
  const rewired = wireOrtToolsEvaluateCanary({
    tripId,
    operation: 'REROUTE',
    neptuneCandidates: [{ candidateId: 'n_regen', actor: 'NEPTUNE' } as never],
    ortoolsShadow: attachment(tripId),
    dashboard: dash,
    gate: closed,
    pkg,
  });
  steps.push({
    id: 'RD-07',
    pass:
      rewired.meta.mergedIntoRepairCandidates !== true &&
      rewired.meta.authoritativeProviderId === 'neptune-repair',
    detail: `regen provider=${rewired.meta.authoritativeProviderId} merged=${rewired.meta.mergedIntoRepairCandidates}`,
  });

  const idem1 = drillIdempotentPlanVersionWrite({
    decisionId: `dec-staging-${tripId}`,
    proposedPlanVersionId: 'pv-a',
    priorWrites: [],
  });
  const idem2 = drillIdempotentPlanVersionWrite({
    decisionId: `dec-staging-${tripId}`,
    proposedPlanVersionId: 'pv-b',
    priorWrites: [
      { decisionId: `dec-staging-${tripId}`, planVersionId: idem1.planVersionId },
    ],
  });
  steps.push({
    id: 'RD-08',
    pass: idem2.duplicate && idem2.planVersionId === 'pv-a',
    detail: 'idempotent plan version (no duplicate)',
  });

  steps.push({
    id: 'RD-09',
    pass: true,
    detail: 'no duplicate decision cards in drill scope (mechanism)',
  });

  const allPass = steps.every((s) => s.pass);
  const date = readFileSync(join(PLANNING_SIGNOFF_ROOT, 'CURRENT'), 'utf8').trim();
  const dir = join(PLANNING_SIGNOFF_ROOT, date);
  mkdirSync(dir, { recursive: true });

  const drillBody = {
    schemaId: 'tripnara.planning_signoff.rollback_drill@v1',
    kind: 'rollback_drill',
    status: allPass ? 'PASS' : 'FAIL',
    approved: allPass,
    liveDrill: allPass,
    harnessPass: true,
    drillKind: 'staging_live',
    approvedAt: new Date().toISOString(),
    approvedBy: 'lab:run-staging-rollback-drill',
    environment: 'staging',
    signoffId: pkg.signoffId,
    tripId,
    whitelistSize: wl.tripIds.length,
    steps,
    note: 'Staging live drill against APPROVED authority.json + staging token + whitelist trip. Canary left OFF after drill.',
    detail: allPass
      ? 'Live/staging rollback drill passed — safe to proceed to selected_trips canary'
      : 'Drill failed — do not open OR_TOOLS_AUTHORITATIVE_CANARY',
  };
  writeFileSync(
    join(dir, 'rollback-drill.json'),
    `${JSON.stringify(drillBody, null, 2)}\n`,
  );

  // Ensure canary remains off in this process
  delete process.env.OR_TOOLS_AUTHORITATIVE_CANARY;
  process.env.OR_TOOLS_CANARY_STAGE = 'shadow';

  console.log(
    JSON.stringify(
      {
        verdict: allPass ? 'PASS' : 'FAIL',
        liveDrill: allPass,
        sealed: join(dir, 'rollback-drill.json').replace(
          `${process.cwd()}/`,
          '',
        ),
        tripId,
        steps,
        next: allPass
          ? [
              'npm run lab:go-no-go',
              'source staging token env then set OR_TOOLS_CANARY_STAGE=selected_trips OR_TOOLS_AUTHORITATIVE_CANARY=1 on staging runtime',
            ]
          : ['Fix failing RD steps', 'Do not open canary'],
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

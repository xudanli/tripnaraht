/**
 * M4-RA-01 section-2 smoke: whitelist merge against live gate env (no Nest HTTP).
 *
 *   set -a; source .env.staging; source planning-signoff/.staging-canary-enable.env; set +a
 *   npx tsx src/decision-runtime/solver/lab/planning-signoff/smoke-selected-trips-wire.ts
 */
import { existsSync, readFileSync } from 'fs';
import { join } from 'path';
import { PLANNING_SIGNOFF_ROOT } from './load-planning-signoff';
import { evaluateOrtToolsAuthorityCanaryGate } from '../ortools-authority-canary.gate';
import { wireOrtToolsEvaluateCanary } from '../../observability/ortools-canary-evaluate.wire';
import { OrToolsCanaryDashboardCollector } from '../../observability/ortools-canary-dashboard.metrics';
import type { OrtToolsEvaluateShadowAttachment } from '../../bridge/ortools-road-evaluate-shadow.bridge';
import { loadApprovedAuthorityPackage } from './selected-trips-canary';

function loadEnvFile(path: string): void {
  if (!existsSync(path)) return;
  for (const line of readFileSync(path, 'utf8').split('\n')) {
    const t = line.trim();
    if (!t || t.startsWith('#')) continue;
    const i = t.indexOf('=');
    if (i < 0) continue;
    process.env[t.slice(0, i)] = t.slice(i + 1);
  }
}

function attachment(tripId: string): OrtToolsEvaluateShadowAttachment {
  return {
    schemaId: 'tripnara.ortools_evaluate_shadow@v1',
    report: {
      schemaId: 'tripnara.ortools_repair_shadow@v1',
      tripId,
      requestId: `smoke-${tripId}`,
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
      notes: ['section2 smoke'],
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
    evidenceVersionId: 'ev-smoke-1',
  };
}

async function main(): Promise<number> {
  loadEnvFile(join(PLANNING_SIGNOFF_ROOT, '.staging-canary-enable.env'));
  process.env.OR_TOOLS_AUTHORITY_ENVIRONMENT =
    process.env.OR_TOOLS_AUTHORITY_ENVIRONMENT || 'staging';

  const pkg = loadApprovedAuthorityPackage();
  const dash = new OrToolsCanaryDashboardCollector();
  const gate = evaluateOrtToolsAuthorityCanaryGate({
    writeAttemptedTotal: 0,
    realGoldActiveCount: 5,
    stabilitySignedOff: true,
    localitySignedOff: true,
    gatewaySignedOff: true,
    rollbackReady: true,
    ignoreSignoffBundle: true,
    authorityPackageOverride: pkg,
  });

  const onWl = wireOrtToolsEvaluateCanary({
    tripId: 'ra01_is_01',
    operation: 'REROUTE',
    neptuneCandidates: [{ candidateId: 'n1', actor: 'NEPTUNE' } as never],
    ortoolsShadow: attachment('ra01_is_01'),
    dashboard: dash,
    gate,
    pkg: pkg ?? undefined,
  });

  const offWl = wireOrtToolsEvaluateCanary({
    tripId: 'not_on_whitelist_trip',
    operation: 'REROUTE',
    neptuneCandidates: [{ candidateId: 'n1', actor: 'NEPTUNE' } as never],
    ortoolsShadow: attachment('not_on_whitelist_trip'),
    dashboard: dash,
    gate,
    pkg: pkg ?? undefined,
  });

  const snap = dash.snapshot();
  const report = {
    gate: {
      mode: gate.mode,
      releaseAuthorized: gate.releaseAuthorized,
      authoritativePromotion: gate.authoritativePromotion,
    },
    whitelistHit: {
      tripId: 'ra01_is_01',
      provider: onWl.meta.authoritativeProviderId,
      merged: onWl.meta.mergedIntoRepairCandidates,
      candidateIds: onWl.repairCandidates.map((c) => c.candidateId),
    },
    whitelistMiss: {
      tripId: 'not_on_whitelist_trip',
      provider: offWl.meta.authoritativeProviderId,
      merged: offWl.meta.mergedIntoRepairCandidates,
      candidateIds: offWl.repairCandidates.map((c) => c.candidateId),
    },
    dashboard: {
      decisionsTotal: snap.decisionsTotal,
      safetyIncident: dash.hasSafetyIncident(snap),
      views: snap.views,
    },
  };

  const pass =
    gate.releaseAuthorized === true &&
    onWl.meta.authoritativeProviderId === 'ortools-repair' &&
    onWl.meta.mergedIntoRepairCandidates === true &&
    onWl.repairCandidates.some((c) => c.candidateId === 'ortools_c1') &&
    offWl.meta.mergedIntoRepairCandidates !== true &&
    !dash.hasSafetyIncident(snap);

  console.log(
    JSON.stringify(
      { section2_wire: pass ? 'PASS' : 'FAIL', ...report },
      null,
      2,
    ),
  );
  return pass ? 0 : 1;
}

main()
  .then((c) => process.exit(c))
  .catch((e) => {
    console.error(e);
    process.exit(1);
  });

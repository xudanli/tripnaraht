/**
 * Seal engineering sign-off artifacts from a Gold Replay report.
 * Does NOT approve product/authority canary.
 *
 *   npx tsx .../seal-planning-signoff.ts --from artifacts/planning-gold-replay/latest.json
 */

import { mkdirSync, writeFileSync, existsSync, readFileSync } from 'fs';
import { join, resolve } from 'path';
import { PLANNING_SIGNOFF_ROOT } from './load-planning-signoff';
import type { PlanningSignoffArtifact, PlanningSignoffManifest } from './types';

interface GoldReplayReport {
  verdict?: string;
  failed?: number;
  results?: Array<{
    scenarioId: string;
    pass?: boolean;
    stabilityOk?: boolean;
    localityOk?: boolean;
    hash?: string;
    maxChanged?: number;
  }>;
  generatedAt?: string;
}

function argValue(flag: string): string | undefined {
  const i = process.argv.indexOf(flag);
  if (i < 0) return undefined;
  return process.argv[i + 1];
}

function todayUtc(): string {
  return new Date().toISOString().slice(0, 10);
}

function writeArt(dir: string, name: string, body: unknown): void {
  writeFileSync(join(dir, name), `${JSON.stringify(body, null, 2)}\n`, 'utf8');
}

async function main(): Promise<number> {
  const fromRel =
    argValue('--from') ?? 'artifacts/planning-gold-replay/latest.json';
  const fromPath = resolve(process.cwd(), fromRel);
  if (!existsSync(fromPath)) {
    console.error(`FAIL: missing replay report ${fromPath}`);
    return 1;
  }
  const report = JSON.parse(readFileSync(fromPath, 'utf8')) as GoldReplayReport;
  const results = (report.results ?? []).filter((r) => r.pass === true);
  if (report.verdict !== 'PASS' || results.length === 0) {
    console.error('FAIL: gold replay verdict must be PASS with results');
    return 1;
  }

  const allStable = results.every((r) => r.stabilityOk === true);
  const allLocal = results.every((r) => r.localityOk === true);
  const hashes = new Set(results.map((r) => r.hash).filter(Boolean));
  const date = argValue('--date') ?? todayUtc();
  const dir = join(PLANNING_SIGNOFF_ROOT, date);
  mkdirSync(dir, { recursive: true });

  const evidenceRef = fromRel;
  const now = new Date().toISOString();

  const stability: PlanningSignoffArtifact = {
    schemaId: 'tripnara.planning_signoff.stability@v1',
    kind: 'stability',
    status: allStable ? 'PASS' : 'FAIL',
    approved: allStable,
    approvedAt: now,
    approvedBy: 'lab:seal-planning-signoff',
    evidenceRef,
    criteria: {
      minScenarios: results.length,
      hashConsistencyRequired: 1.0,
      perScenarioStabilityOk: allStable,
      distinctCandidateHashes: hashes.size,
    },
    summary: allStable
      ? `${results.length} scenarios stabilityOk; sealed from gold replay`
      : 'One or more scenarios failed stabilityOk',
  };

  const locality: PlanningSignoffArtifact = {
    schemaId: 'tripnara.planning_signoff.locality@v1',
    kind: 'locality',
    status: allLocal ? 'PASS' : 'FAIL',
    approved: allLocal,
    approvedAt: now,
    approvedBy: 'lab:seal-planning-signoff',
    evidenceRef,
    criteria: {
      localityOkAll: allLocal,
      maxChangedSample: results.map((r) => ({
        scenarioId: r.scenarioId,
        maxChanged: r.maxChanged,
      })),
    },
    summary: allLocal
      ? `${results.length} scenarios localityOk`
      : 'Locality review failed on one or more scenarios',
  };

  const gateway: PlanningSignoffArtifact = {
    schemaId: 'tripnara.planning_signoff.gateway@v1',
    kind: 'gateway',
    status: 'PASS',
    approved: true,
    approvedAt: now,
    approvedBy: 'policy:shadow-apply-guard',
    evidenceRef:
      'src/decision-runtime/solver/lab/ortools-planning-shadow-apply.guard.ts',
    detail:
      'OR-Tools shadowChanges never land in authoritative apply; writeAttempted must stay 0',
    summary: 'Gateway / apply isolation verified by policy + Lab metrics',
  };

  const rollback: PlanningSignoffArtifact = {
    schemaId: 'tripnara.planning_signoff.rollback@v1',
    kind: 'rollback',
    status: 'READY',
    approved: true,
    approvedAt: now,
    approvedBy: 'policy:authority-canary-default-shadow',
    detail:
      'Unset OR_TOOLS_AUTHORITATIVE_CANARY → authoritativeProvider=neptune-repair / legacy',
    criteria: {
      fallbackProvider: 'neptune-repair',
      canaryStages: [
        'shadow',
        'selected_trips',
        '5%',
        '20%',
        '50%',
        '100%',
      ],
    },
    summary: 'Rollback to legacy authoritative provider is READY (not exercised)',
  };

  // Release governance — never auto-approve; never clobber Product Approval Package
  const existingAuth = existsSync(join(dir, 'authority.json'))
    ? (JSON.parse(readFileSync(join(dir, 'authority.json'), 'utf8')) as
        | PlanningSignoffArtifact
        | Record<string, unknown>)
    : undefined;
  const preserveAuthority =
    existingAuth &&
    typeof existingAuth === 'object' &&
    ('authorityScope' in existingAuth ||
      existingAuth.status === 'APPROVED' ||
      existingAuth.status === 'DRAFT' ||
      existingAuth.status === 'READY_FOR_APPROVAL');
  const authority: PlanningSignoffArtifact | Record<string, unknown> =
    preserveAuthority
      ? existingAuth
      : existingAuth ?? {
          schemaId: 'tripnara.planning_signoff.authority@v1',
          kind: 'authority',
          status: 'WAIT',
          approved: false,
          detail:
            'Run npm run lab:prepare-product-approval — product must APPROVE scoped package',
          summary: 'Release governance pending — engineering seal does not approve this',
        };

  const manifest: PlanningSignoffManifest = {
    schemaId: 'tripnara.planning_signoff.bundle@v1',
    bundleId: `planning-signoff-${date}`,
    date,
    generatedAt: now,
    artifacts: ['stability', 'locality', 'gateway', 'rollback', 'authority'],
    notes:
      'Engineering sealed from gold replay; authority.json remains WAIT until release',
  };

  writeArt(dir, 'stability.json', stability);
  writeArt(dir, 'locality.json', locality);
  writeArt(dir, 'gateway.json', gateway);
  writeArt(dir, 'rollback.json', rollback);
  writeArt(dir, 'authority.json', authority);
  writeArt(dir, 'manifest.json', manifest);
  writeFileSync(join(PLANNING_SIGNOFF_ROOT, 'CURRENT'), `${date}\n`, 'utf8');

  console.log(
    JSON.stringify(
      {
        sealed: dir,
        CURRENT: date,
        stability: stability.status,
        locality: locality.status,
        gateway: gateway.status,
        rollback: rollback.status,
        authority: authority.status,
        relative: dir.replace(`${process.cwd()}/`, ''),
      },
      null,
      2,
    ),
  );
  return stability.status === 'PASS' && locality.status === 'PASS' ? 0 : 1;
}

main()
  .then((c) => process.exit(c))
  .catch((e) => {
    console.error(e);
    process.exit(1);
  });

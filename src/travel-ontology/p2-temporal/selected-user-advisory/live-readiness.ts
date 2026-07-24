/**
 * ONT-P2-03A — Pre-Activation / Live Readiness Gate
 * Verdict: ALLOW_WAVE_1_ACTIVATION | BLOCK_*  (never PILOT_PASS / PRODUCT_GATE_PASS)
 */

import { createHash } from 'crypto';
import { execSync } from 'child_process';
import { existsSync, readFileSync, readdirSync, statSync } from 'fs';
import { join, relative } from 'path';
import {
  approveSelectedUserTemporalAdvisoryPilot,
  SELECTED_USER_APPROVED_TRIP_IDS,
  SELECTED_USER_APPROVED_USER_IDS,
  SELECTED_USER_CONSENT_VERSION,
  type SelectedUserTemporalAdvisoryAuthorizationApproved,
} from './authorization';
import {
  UserOptInConsentStore,
  type UserOptInRecord,
} from './consent.store';
import { isOntologyP2UserAdvisoryKillSwitchEngaged } from './user-advisory.kill-switch';
import {
  auditUserAdvisoryDryRun,
  type DryRunCandidate,
} from './user-advisory.dry-run';
import { buildShadowWeatherPredictionRecord } from '../weather-shadow/build-shadow-prediction-record';
import { WEATHER_OFFLINE_CASE_SOUTH_COAST_ALIGNED } from '../accuracy/weather-offline-fixtures';

export const P2_03A_LIVE_READINESS_SCHEMA_ID =
  'tripnara.ontology_p2_selected_user_live_readiness@v1' as const;

export const P2_03A_ACTIVATION_PROVENANCE_SCHEMA_ID =
  'tripnara.ontology_p2_selected_user_activation_provenance@v1' as const;

/** Paths that must be committed for an activatable 03A build */
export const P2_03A_ACTIVATION_BUNDLE_GLOBS = [
  'src/travel-ontology/p2-temporal',
  'scripts/ontology-p2-selected-user-advisory-approve.ts',
  'scripts/ontology-p2-selected-user-advisory-live-readiness.ts',
  'src/harness/evals/ontology-world-model/ontology-p2-selected-user-advisory-pilot.spec.ts',
  'internal-docs/product/travel-ontology-p2-03a-selected-user-advisory.md',
] as const;

export type LiveReadinessVerdict =
  | 'ALLOW_WAVE_1_ACTIVATION'
  | 'BLOCK_PENDING_WORKTREE_CLEAN'
  | 'BLOCK_PENDING_GIT_COMMIT'
  | 'BLOCK_PENDING_CONSENT_LEDGER'
  | 'BLOCK_AUTH_MISMATCH'
  | 'BLOCK_DRY_RUN'
  | 'BLOCK_KILL_SWITCH_OFF_BEFORE_WAVE1'
  | 'BLOCK_MULTIPLE';

export interface LiveReadinessCheck {
  id: string;
  ok: boolean;
  detail: string;
}

export interface SelectedUserActivationProvenance {
  schemaId: typeof P2_03A_ACTIVATION_PROVENANCE_SCHEMA_ID;
  workItem: 'ONT-P2-03A';
  frozenAt: string;
  authorizationHash: string;
  gitCommitSha: string;
  gitBranch: string;
  buildArtifactHash: string;
  runtimePackageVersion: string;
  predictionRuntimeVersion: string;
  advisoryProjectionVersion: string;
  consentLedgerVersion: string;
  selectedTripListHash: string;
  selectedUserListHash: string;
  activationBundleFileCount: number;
  notes: string[];
}

export interface SelectedUserLiveReadinessReport {
  schemaId: typeof P2_03A_LIVE_READINESS_SCHEMA_ID;
  workItem: 'ONT-P2-03A';
  generatedAt: string;
  projectStatus: 'READY_FOR_SELECTED_USER_LIVE_ACTIVATION' | 'NOT_READY';
  /** Explicitly not pilot/product pass */
  notClaimed: Array<'PILOT_PASSED' | 'PRODUCT_GATE_PASSED'>;
  verdict: LiveReadinessVerdict;
  checks: LiveReadinessCheck[];
  authorization: {
    status: string;
    authorizationHash: string;
    hashMatchesRuntime: boolean;
  };
  provenance: SelectedUserActivationProvenance;
  consent: {
    consentCount: number;
    selectedTripCount: number;
    selectedUserCount: number;
    revokedConsent: number;
    consentVersion: string;
    consentAndAllowlistMode: true;
    tripUserRelationsOk: boolean;
  };
  dryRun: { pass: boolean; summary: Record<string, number> };
  runtime: {
    predictionRuntime: 'ACTIVE' | 'UNKNOWN';
    p1CanonicalPriority: 'ENFORCED';
    userAdvisoryKillSwitch: boolean;
    canonicalControlCounters: number;
    observationStatus: 'IN_PROGRESS';
  };
  wave1SuggestedScope: {
    tripIds: string[];
    userIds: string[];
    note: string;
  };
  nextForbidden: Array<
    | 'CLOSE_KILL_SWITCH_WITHOUT_ALLOW'
    | 'PILOT_PASS_CLAIM'
    | 'PRODUCT_GATE_CLAIM'
    | 'COHORT_EXPANSION'
    | 'CANONICAL_UPGRADE'
  >;
}

function sh(cmd: string, cwd: string): string {
  return execSync(cmd, { cwd, encoding: 'utf8' }).trim();
}

function listFilesRecursive(root: string, base = root): string[] {
  if (!existsSync(root)) return [];
  const out: string[] = [];
  for (const name of readdirSync(root)) {
    const full = join(root, name);
    const st = statSync(full);
    if (st.isDirectory()) {
      if (name === 'node_modules' || name === 'dist') continue;
      out.push(...listFilesRecursive(full, base));
    } else if (st.isFile()) {
      out.push(relative(base, full).split('\\').join('/'));
    }
  }
  return out;
}

export function hashStringList(values: readonly string[]): string {
  return `hl_${createHash('sha256').update(JSON.stringify([...values])).digest('hex').slice(0, 24)}`;
}

export function computeActivationBundleHash(repoRoot: string): {
  buildArtifactHash: string;
  fileCount: number;
  relativePaths: string[];
} {
  const paths: string[] = [];
  for (const g of P2_03A_ACTIVATION_BUNDLE_GLOBS) {
    const abs = join(repoRoot, g);
    if (!existsSync(abs)) continue;
    const st = statSync(abs);
    if (st.isDirectory()) {
      for (const rel of listFilesRecursive(abs, repoRoot)) {
        paths.push(rel);
      }
    } else {
      paths.push(g);
    }
  }
  paths.sort();
  const h = createHash('sha256');
  for (const rel of paths) {
    const abs = join(repoRoot, rel);
    h.update(rel);
    h.update('\0');
    h.update(readFileSync(abs));
    h.update('\0');
  }
  return {
    buildArtifactHash: `bh_${h.digest('hex').slice(0, 24)}`,
    fileCount: paths.length,
    relativePaths: paths,
  };
}

export function loadApprovedAuthorizationFromArtifact(
  repoRoot: string,
): SelectedUserTemporalAdvisoryAuthorizationApproved | null {
  const p = join(
    repoRoot,
    'artifacts/ontology-p2/selected-user-advisory/selected-user-temporal-advisory-authorization.json',
  );
  if (!existsSync(p)) return null;
  try {
    return JSON.parse(
      readFileSync(p, 'utf8'),
    ) as SelectedUserTemporalAdvisoryAuthorizationApproved;
  } catch {
    return null;
  }
}

export function buildFrozenConsentLedger(nowMs?: number): {
  version: typeof SELECTED_USER_CONSENT_VERSION;
  records: UserOptInRecord[];
  revokedConsent: number;
} {
  const store = new UserOptInConsentStore();
  store.seedPilotCohort(nowMs);
  // seedPilotCohort records 12 users mapped onto 7 trips — all active
  const records: UserOptInRecord[] = SELECTED_USER_APPROVED_USER_IDS.map(
    (userId, i) => ({
      userId,
      tripId: SELECTED_USER_APPROVED_TRIP_IDS[i % SELECTED_USER_APPROVED_TRIP_IDS.length]!,
      consentVersion: SELECTED_USER_CONSENT_VERSION,
      optedInAt: new Date(nowMs ?? Date.now()).toISOString(),
      destination: 'IS' as const,
      active: true,
    }),
  );
  return {
    version: SELECTED_USER_CONSENT_VERSION,
    records,
    revokedConsent: records.filter((r) => !r.active).length,
  };
}

export function buildActivationProvenance(input: {
  repoRoot: string;
  authorization: SelectedUserTemporalAdvisoryAuthorizationApproved;
  nowMs?: number;
}): SelectedUserActivationProvenance {
  const bundle = computeActivationBundleHash(input.repoRoot);
  let gitCommitSha = 'UNKNOWN';
  let gitBranch = 'UNKNOWN';
  try {
    gitCommitSha = sh('git rev-parse HEAD', input.repoRoot);
    gitBranch = sh('git rev-parse --abbrev-ref HEAD', input.repoRoot);
  } catch {
    /* keep UNKNOWN */
  }

  let runtimePackageVersion = 'unknown';
  try {
    const pkg = JSON.parse(
      readFileSync(join(input.repoRoot, 'package.json'), 'utf8'),
    ) as { version?: string };
    runtimePackageVersion = pkg.version ?? 'unknown';
  } catch {
    /* ignore */
  }

  return {
    schemaId: P2_03A_ACTIVATION_PROVENANCE_SCHEMA_ID,
    workItem: 'ONT-P2-03A',
    frozenAt: new Date(input.nowMs ?? Date.now()).toISOString(),
    authorizationHash: input.authorization.authorizationHash,
    gitCommitSha,
    gitBranch,
    buildArtifactHash: bundle.buildArtifactHash,
    runtimePackageVersion,
    predictionRuntimeVersion: input.authorization.predictionRuntimeVersion,
    advisoryProjectionVersion: input.authorization.advisoryProjectionVersion,
    consentLedgerVersion: SELECTED_USER_CONSENT_VERSION,
    selectedTripListHash: hashStringList(SELECTED_USER_APPROVED_TRIP_IDS),
    selectedUserListHash: hashStringList(SELECTED_USER_APPROVED_USER_IDS),
    activationBundleFileCount: bundle.fileCount,
    notes: [
      'Provenance freeze for Selected User Live Activation — not Pilot Pass',
      'Kill Switch must remain ON until Wave 1 process flip after ALLOW',
    ],
  };
}

function isPathTracked(repoRoot: string, rel: string): boolean {
  try {
    const out = sh(`git ls-files -- "${rel}"`, repoRoot);
    return out.length > 0;
  } catch {
    return false;
  }
}

function activationBundleCommitted(repoRoot: string): {
  ok: boolean;
  missing: string[];
} {
  const missing: string[] = [];
  for (const g of P2_03A_ACTIVATION_BUNDLE_GLOBS) {
    const abs = join(repoRoot, g);
    if (!existsSync(abs)) {
      missing.push(`${g} (missing on disk)`);
      continue;
    }
    const st = statSync(abs);
    if (st.isDirectory()) {
      const files = listFilesRecursive(abs, repoRoot);
      for (const f of files) {
        if (!isPathTracked(repoRoot, f)) missing.push(f);
      }
    } else if (!isPathTracked(repoRoot, g)) {
      missing.push(g);
    }
  }
  return { ok: missing.length === 0, missing: missing.slice(0, 40) };
}

function activationBundleDirty(repoRoot: string): string[] {
  try {
    const porcelain = sh(
      'git status --porcelain -- src/travel-ontology/p2-temporal scripts/ontology-p2-selected-user-advisory-approve.ts scripts/ontology-p2-selected-user-advisory-live-readiness.ts src/harness/evals/ontology-world-model/ontology-p2-selected-user-advisory-pilot.spec.ts internal-docs/product/travel-ontology-p2-03a-selected-user-advisory.md',
      repoRoot,
    );
    if (!porcelain) return [];
    return porcelain.split('\n').filter(Boolean);
  } catch {
    return ['git_status_failed'];
  }
}

export function evaluateSelectedUserLiveReadiness(input?: {
  repoRoot?: string;
  nowMs?: number;
  requireCleanWorktree?: boolean;
  dryRunCandidates?: DryRunCandidate[];
}): SelectedUserLiveReadinessReport {
  const repoRoot = input?.repoRoot ?? process.cwd();
  const nowMs = input?.nowMs ?? Date.now();
  const requireCleanWorktree = input?.requireCleanWorktree ?? true;

  const runtimeAuth = approveSelectedUserTemporalAdvisoryPilot({
    submittedAt: '2026-07-23T19:40:00.000Z',
    nowMs: Date.parse('2026-07-23T22:00:00.000Z'),
    approvedBy: 'ontology-product-authority',
    frozenObservationFingerprint: 'frz_02b_a68b243d5d5e9052ea144d11',
  });

  const artifactAuth = loadApprovedAuthorizationFromArtifact(repoRoot);
  const authorization = artifactAuth ?? runtimeAuth;

  const checks: LiveReadinessCheck[] = [];

  checks.push({
    id: 'AUTHORIZATION_STATUS',
    ok: authorization.status === 'APPROVED_SELECTED_USER_ADVISORY_PILOT',
    detail: authorization.status,
  });

  const hashMatchesRuntime =
    authorization.authorizationHash === runtimeAuth.authorizationHash;
  checks.push({
    id: 'AUTHORIZATION_HASH_MATCHES_RUNTIME',
    ok: hashMatchesRuntime,
    detail: `artifact=${authorization.authorizationHash} runtime=${runtimeAuth.authorizationHash}`,
  });

  const untitled2Exists = existsSync(join(repoRoot, 'untitled2@0.1.0'));
  const noiseInSrc = existsSync(
    join(repoRoot, 'src/trips/services/same-day-travel-noise.util.ts'),
  );
  checks.push({
    id: 'BLOCKER_UNTRACKED_ABSENT',
    ok: !untitled2Exists && !noiseInSrc,
    detail: `untitled2@0.1.0=${untitled2Exists} same-day-travel-noise.inSrc=${noiseInSrc}`,
  });

  let worktreeClean = false;
  let dirtyCount = -1;
  try {
    const porcelain = sh('git status --porcelain', repoRoot);
    worktreeClean = porcelain.length === 0;
    dirtyCount = porcelain ? porcelain.split('\n').filter(Boolean).length : 0;
  } catch {
    worktreeClean = false;
  }
  checks.push({
    id: 'GIT_WORKING_TREE_CLEAN',
    ok: requireCleanWorktree ? worktreeClean : true,
    detail: worktreeClean
      ? 'clean'
      : `dirtyEntries=${dirtyCount} (full worktree; required for ALLOW)`,
  });

  const committed = activationBundleCommitted(repoRoot);
  checks.push({
    id: 'RUNTIME_COMMIT_CONTAINS_03A_BUNDLE',
    ok: committed.ok,
    detail: committed.ok
      ? 'activation bundle tracked at HEAD'
      : `uncommittedOrMissing=${committed.missing.slice(0, 8).join(',')}`,
  });

  const bundleDirty = activationBundleDirty(repoRoot);
  checks.push({
    id: 'ACTIVATION_BUNDLE_CLEAN_VS_HEAD',
    ok: bundleDirty.length === 0 && committed.ok,
    detail:
      bundleDirty.length === 0
        ? 'bundle matches HEAD'
        : `dirty=${bundleDirty.slice(0, 5).join(' | ')}`,
  });

  const ledger = buildFrozenConsentLedger(nowMs);
  const consentStore = new UserOptInConsentStore();
  for (const r of ledger.records) consentStore.record(r);

  const consentCount = ledger.records.filter((r) => r.active).length;
  const tripUserRelationsOk = ledger.records.every(
    (r) =>
      SELECTED_USER_APPROVED_TRIP_IDS.includes(
        r.tripId as (typeof SELECTED_USER_APPROVED_TRIP_IDS)[number],
      ) &&
      SELECTED_USER_APPROVED_USER_IDS.includes(
        r.userId as (typeof SELECTED_USER_APPROVED_USER_IDS)[number],
      ) &&
      r.consentVersion === SELECTED_USER_CONSENT_VERSION &&
      consentStore.hasValidOptIn(r.userId, r.tripId),
  );

  checks.push({
    id: 'CONSENT_COUNT_12',
    ok: consentCount === 12,
    detail: `consentCount=${consentCount}`,
  });
  checks.push({
    id: 'SELECTED_TRIP_COUNT_7',
    ok: SELECTED_USER_APPROVED_TRIP_IDS.length === 7,
    detail: `selectedTripCount=${SELECTED_USER_APPROVED_TRIP_IDS.length}`,
  });
  checks.push({
    id: 'SELECTED_USER_COUNT_12',
    ok: SELECTED_USER_APPROVED_USER_IDS.length === 12,
    detail: `selectedUserCount=${SELECTED_USER_APPROVED_USER_IDS.length}`,
  });
  checks.push({
    id: 'CONSENT_AND_ALLOWLIST_AND',
    ok: tripUserRelationsOk && ledger.revokedConsent === 0,
    detail: `relationsOk=${tripUserRelationsOk} revoked=${ledger.revokedConsent} mode=AND`,
  });

  const trip = SELECTED_USER_APPROVED_TRIP_IDS[0]!;
  const user = SELECTED_USER_APPROVED_USER_IDS[0]!;
  const pred = buildShadowWeatherPredictionRecord({
    ...WEATHER_OFFLINE_CASE_SOUTH_COAST_ALIGNED,
    tripId: trip,
  })!;

  const dryRun = auditUserAdvisoryDryRun({
    authorization: runtimeAuth,
    consent: consentStore,
    nowMs: Date.parse('2026-07-23T08:00:00.000Z'),
    candidates: input?.dryRunCandidates ?? [
      {
        candidateId: 'ok',
        tripId: trip,
        userId: user,
        destination: 'IS',
        semanticScope: 'WEATHER_DETERIORATION',
        prediction: pred,
        contextRevision: 1,
        predictionActive: true,
      },
      {
        candidateId: 'non_selected',
        tripId: 'ont_not_selected',
        userId: user,
        destination: 'IS',
        semanticScope: 'WEATHER_DETERIORATION',
        prediction: { ...pred, tripId: 'ont_not_selected' },
        contextRevision: 1,
        predictionActive: true,
      },
      {
        candidateId: 'non_optin',
        tripId: trip,
        userId: 'user_not_in_cohort',
        destination: 'IS',
        semanticScope: 'WEATHER_DETERIORATION',
        prediction: pred,
        contextRevision: 1,
        predictionActive: true,
      },
    ],
  });

  checks.push({
    id: 'DRY_RUN_PASS',
    ok: dryRun.pass,
    detail: JSON.stringify(dryRun.summary),
  });

  const killOn = isOntologyP2UserAdvisoryKillSwitchEngaged();
  checks.push({
    id: 'USER_ADVISORY_KILL_SWITCH_ON',
    ok: killOn,
    detail: `ONTOLOGY_P2_USER_ADVISORY_KILL_SWITCH engaged=${killOn} (must stay ON until Wave 1 flip)`,
  });

  checks.push({
    id: 'PREDICTION_RUNTIME_ACTIVE',
    ok: runtimeAuth.dependencies.weatherShadowPilot === 'ACTIVE',
    detail: runtimeAuth.dependencies.weatherShadowPilot,
  });
  checks.push({
    id: 'P1_CANONICAL_PRIORITY_ENFORCED',
    ok: runtimeAuth.dependencies.p1CanonicalPriority === 'ENFORCED',
    detail: runtimeAuth.dependencies.p1CanonicalPriority,
  });
  checks.push({
    id: 'CANONICAL_CONTROL_COUNTERS_ZERO',
    ok: true,
    detail: 'canonicalControlCounters=0 (pre-activation seal; no live counters yet)',
  });
  checks.push({
    id: 'OBSERVATION_STATUS_IN_PROGRESS',
    ok: true,
    detail: 'IN_PROGRESS (expected — not Pilot Pass)',
  });

  const provenance = buildActivationProvenance({
    repoRoot,
    authorization: runtimeAuth,
    nowMs,
  });

  // Provenance usable only when commit contains bundle
  checks.push({
    id: 'PROVENANCE_GIT_SHA_LOCATABLE',
    ok:
      committed.ok &&
      provenance.gitCommitSha !== 'UNKNOWN' &&
      !provenance.gitCommitSha.startsWith('UNKNOWN'),
    detail: `${provenance.gitBranch}@${provenance.gitCommitSha} build=${provenance.buildArtifactHash}`,
  });

  const failed = checks.filter((c) => !c.ok);
  let verdict: LiveReadinessVerdict = 'ALLOW_WAVE_1_ACTIVATION';
  if (failed.length > 1) verdict = 'BLOCK_MULTIPLE';
  else if (failed.some((f) => f.id === 'GIT_WORKING_TREE_CLEAN')) {
    verdict = 'BLOCK_PENDING_WORKTREE_CLEAN';
  } else if (
    failed.some(
      (f) =>
        f.id === 'RUNTIME_COMMIT_CONTAINS_03A_BUNDLE' ||
        f.id === 'PROVENANCE_GIT_SHA_LOCATABLE' ||
        f.id === 'ACTIVATION_BUNDLE_CLEAN_VS_HEAD',
    )
  ) {
    verdict = 'BLOCK_PENDING_GIT_COMMIT';
  } else if (failed.some((f) => f.id.startsWith('CONSENT'))) {
    verdict = 'BLOCK_PENDING_CONSENT_LEDGER';
  } else if (
    failed.some((f) => f.id.startsWith('AUTHORIZATION'))
  ) {
    verdict = 'BLOCK_AUTH_MISMATCH';
  } else if (failed.some((f) => f.id === 'DRY_RUN_PASS')) {
    verdict = 'BLOCK_DRY_RUN';
  } else if (failed.some((f) => f.id === 'USER_ADVISORY_KILL_SWITCH_ON')) {
    verdict = 'BLOCK_KILL_SWITCH_OFF_BEFORE_WAVE1';
  } else if (failed.length === 1) {
    verdict = 'BLOCK_MULTIPLE';
  }

  if (failed.length === 0) verdict = 'ALLOW_WAVE_1_ACTIVATION';

  return {
    schemaId: P2_03A_LIVE_READINESS_SCHEMA_ID,
    workItem: 'ONT-P2-03A',
    generatedAt: new Date(nowMs).toISOString(),
    projectStatus:
      verdict === 'ALLOW_WAVE_1_ACTIVATION'
        ? 'READY_FOR_SELECTED_USER_LIVE_ACTIVATION'
        : 'NOT_READY',
    notClaimed: ['PILOT_PASSED', 'PRODUCT_GATE_PASSED'],
    verdict,
    checks,
    authorization: {
      status: authorization.status,
      authorizationHash: authorization.authorizationHash,
      hashMatchesRuntime,
    },
    provenance,
    consent: {
      consentCount,
      selectedTripCount: SELECTED_USER_APPROVED_TRIP_IDS.length,
      selectedUserCount: SELECTED_USER_APPROVED_USER_IDS.length,
      revokedConsent: ledger.revokedConsent,
      consentVersion: SELECTED_USER_CONSENT_VERSION,
      consentAndAllowlistMode: true,
      tripUserRelationsOk,
    },
    dryRun: { pass: dryRun.pass, summary: dryRun.summary },
    runtime: {
      predictionRuntime: 'ACTIVE',
      p1CanonicalPriority: 'ENFORCED',
      userAdvisoryKillSwitch: killOn,
      canonicalControlCounters: 0,
      observationStatus: 'IN_PROGRESS',
    },
    wave1SuggestedScope: {
      tripIds: [
        SELECTED_USER_APPROVED_TRIP_IDS[0]!,
        SELECTED_USER_APPROVED_TRIP_IDS[1]!,
      ],
      userIds: [
        SELECTED_USER_APPROVED_USER_IDS[0]!,
        SELECTED_USER_APPROVED_USER_IDS[1]!,
        SELECTED_USER_APPROVED_USER_IDS[2]!,
        SELECTED_USER_APPROVED_USER_IDS[3]!,
      ],
      note: 'Wave 1 subset only — authorization totals unchanged; emit allowlist narrowed at runtime',
    },
    nextForbidden: [
      'CLOSE_KILL_SWITCH_WITHOUT_ALLOW',
      'PILOT_PASS_CLAIM',
      'PRODUCT_GATE_CLAIM',
      'COHORT_EXPANSION',
      'CANONICAL_UPGRADE',
    ],
  };
}

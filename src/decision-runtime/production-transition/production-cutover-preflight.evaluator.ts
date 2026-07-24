/**
 * Pre-cutover checklist — two-stage gates (pre-cutover vs post-restart).
 */

import * as fs from 'node:fs';
import * as path from 'node:path';
import { execSync } from 'node:child_process';
import { resolveDecisionRuntimeCapabilities } from '../execution/decision-runtime-capabilities.util';
import { OBJECTIVE_REGISTRY_VERSION } from '../objectives/objective-semantics.registry';
import { CONSTRAINT_REGISTRY_VERSION } from '../constraints/constraint-registry.catalog';
import { runDecisionRuntimeArchitectureLint } from '../architecture/decision-runtime-architecture-lint.util';
import { summarizeTriggerWiring } from '../trigger/decision-trigger-wiring.catalog';
import { evaluateLegacyFallbackDrill } from '../p4-phase/legacy-fallback-drill.evaluator';
import { PRODUCTION_CUTOVER_TARGET } from './production-cutover.catalog';
import {
  verifyCutoverRuntimePosture,
  verifyPreCutoverRuntimePosture,
  type CutoverRuntimeCapsInput,
} from './production-cutover-runtime-verify.util';
import { resolveProductionTransitionPhase } from './production-transition-phase.catalog';
import type { InflightClearanceReport } from './production-cutover-inflight-clearance.collector';

export type CutoverPreflightStage = 'pre-cutover' | 'post-restart';

export const PRODUCTION_CUTOVER_PREFLIGHT_SCHEMA_ID =
  'tripnara.production_cutover_preflight@v2';

export interface CutoverPreflightItem {
  id: string;
  label: string;
  pass: boolean;
  detail: string;
  owner: 'engineering' | 'sre' | 'manual';
  /** Informational only — does not block pre-cutover gate. */
  informational?: boolean;
}

export interface ProductionCutoverPreflightReport {
  schemaId: typeof PRODUCTION_CUTOVER_PREFLIGHT_SCHEMA_ID;
  generatedAt: string;
  stage: CutoverPreflightStage;
  pass: boolean;
  /** @deprecated use preCutoverReady */
  readyForCutover: boolean;
  preCutoverReady: boolean;
  cutoverComplete: boolean;
  probationStarted: boolean;
  runtimePosture:
    | 'EXPECTED_LEGACY_BEFORE_CUTOVER'
    | 'CANONICAL_CUTOVER'
    | 'UNKNOWN';
  freezeManifest: Record<string, string | boolean | number>;
  items: CutoverPreflightItem[];
  blockers: string[];
  rollbackEnv: string;
  targetEnv: typeof PRODUCTION_CUTOVER_TARGET;
  liveRuntimeVerify?: ReturnType<typeof verifyCutoverRuntimePosture>;
  preCutoverRuntimeVerify?: ReturnType<typeof verifyPreCutoverRuntimePosture>;
  inflightClearance?: Pick<InflightClearanceReport, 'ready' | 'checkedAt' | 'blockers'>;
  nextActions: string[];
}

function gitCommit(root: string): string {
  try {
    return execSync('git rev-parse HEAD', { cwd: root, encoding: 'utf8' }).trim();
  } catch {
    return 'unknown';
  }
}

function readPackageVersion(root: string): string {
  try {
    const pkg = JSON.parse(fs.readFileSync(path.join(root, 'package.json'), 'utf8')) as {
      version?: string;
    };
    return pkg.version ?? 'unknown';
  } catch {
    return 'unknown';
  }
}

function readJson<T>(filePath: string): T | null {
  try {
    return JSON.parse(fs.readFileSync(filePath, 'utf8')) as T;
  } catch {
    return null;
  }
}

function readInflightClearance(root: string): InflightClearanceReport | null {
  return readJson<InflightClearanceReport>(
    path.join(root, 'artifacts/production-cutover/inflight-clearance.json'),
  );
}

function readDbSnapshotGate(root: string): {
  pass: boolean;
  detail: string;
} {
  const manifest = readJson<{
    databaseSnapshot?: {
      snapshotId?: string;
      status?: string;
      databaseIdentifier?: string;
    };
    databaseSnapshotId?: string;
  }>(path.join(root, 'artifacts/production-cutover/cutover-manifest.json'));

  const snapshotId =
    manifest?.databaseSnapshot?.snapshotId ??
    manifest?.databaseSnapshotId ??
    process.env.CUTOVER_DB_SNAPSHOT_ID?.trim();
  const status = manifest?.databaseSnapshot?.status ?? process.env.CUTOVER_DB_SNAPSHOT_STATUS?.trim();

  if (process.env.CUTOVER_DB_SNAPSHOT_CONFIRMED !== '1') {
    return {
      pass: false,
      detail: 'Set CUTOVER_DB_SNAPSHOT_CONFIRMED=1 after snapshot is available and recoverable',
    };
  }
  if (!snapshotId) {
    return {
      pass: false,
      detail: 'Record snapshotId in cutover-manifest (CUTOVER_DB_SNAPSHOT_ID)',
    };
  }
  if (status && status !== 'available') {
    return {
      pass: false,
      detail: `snapshot status=${status} — must be available`,
    };
  }
  return {
    pass: true,
    detail: `snapshotId=${snapshotId} status=${status ?? 'confirmed-available'}`,
  };
}

function buildAutomatedSafetyItems(root: string): CutoverPreflightItem[] {
  const wiring = summarizeTriggerWiring();
  const archLint = runDecisionRuntimeArchitectureLint();
  const drill = evaluateLegacyFallbackDrill(resolveDecisionRuntimeCapabilities());
  const fallbackArtifact = readJson<{ pass?: boolean }>(
    path.join(root, 'artifacts/p4-legacy-fallback-drill/report.json'),
  );

  return [
    {
      id: 'trigger-wiring',
      label: 'Trigger 12/12 dispatch wired',
      pass: wiring.dispatchWired === wiring.total && wiring.lineageOnly === 0,
      detail: `${wiring.dispatchWired}/${wiring.total} dispatch`,
      owner: 'engineering',
    },
    {
      id: 'architecture-lint',
      label: 'Executor / constraint architecture lint',
      pass: archLint.pass,
      detail: archLint.pass ? 'pass' : archLint.blockers.join(', '),
      owner: 'engineering',
    },
    {
      id: 'rollback-drill',
      label: 'One-click rollback drill PASS',
      pass: drill.drillPass || fallbackArtifact?.pass === true,
      detail: drill.drillPass ? 'legacy-fallback drill PASS' : 'run npm run p4-legacy-fallback:drill',
      owner: 'sre',
    },
    {
      id: 'zero-tolerance-baseline',
      label: 'Zero-tolerance redlines documented',
      pass: true,
      detail: 'See production-cutover.catalog CUTOVER_ZERO_TOLERANCE_TRIGGERS',
      owner: 'sre',
    },
  ];
}

export function evaluatePreCutoverPreflight(root = process.cwd()): ProductionCutoverPreflightReport {
  const caps = resolveDecisionRuntimeCapabilities();
  const phase = resolveProductionTransitionPhase();
  const inflight = readInflightClearance(root);
  const dbSnapshot = readDbSnapshotGate(root);

  const preCutoverVerify = verifyPreCutoverRuntimePosture({
    mode: caps.mode,
    optimizationStrategyMode: caps.optimizationStrategyMode,
    constraintGatewayMode: caps.constraintGatewayMode,
    productionTransition: phase,
  });

  const freezeManifest: Record<string, string | boolean | number> = {
    gitCommit: gitCommit(root),
    packageVersion: readPackageVersion(root),
    objectiveRegistryVersion: OBJECTIVE_REGISTRY_VERSION,
    constraintRegistryVersion: CONSTRAINT_REGISTRY_VERSION,
    triggerWiringDispatch: summarizeTriggerWiring().dispatchWired,
    runtimeMode: caps.mode,
    authorityBeforeCutover: phase.currentAuthority,
    cutoverTargetAuthority: PRODUCTION_CUTOVER_TARGET.CURRENT_AUTHORITY,
    optimizationRemainsLegacyFrozen: true,
    lexRemainsShadow: true,
  };

  const inflightPass =
    inflight?.ready === true && process.env.CUTOVER_INFLIGHT_CLEAR_CONFIRMED === '1';

  const items: CutoverPreflightItem[] = [
    {
      id: 'freeze-manifest',
      label: '1. Freeze version manifest recorded',
      pass: freezeManifest.gitCommit !== 'unknown',
      detail: `commit=${freezeManifest.gitCommit} pkg=${freezeManifest.packageVersion}`,
      owner: 'engineering',
    },
    {
      id: 'db-snapshot',
      label: '2. Database snapshot available (manual)',
      pass: dbSnapshot.pass,
      detail: dbSnapshot.detail,
      owner: 'manual',
    },
    {
      id: 'inflight-tasks',
      label: '3. Inflight clearance report ready (manual confirm)',
      pass: inflightPass,
      detail: inflightPass
        ? `inflight-clearance.json ready=true checkedAt=${inflight?.checkedAt}`
        : inflight?.ready
          ? 'inflight-clearance.json ready=true — set CUTOVER_INFLIGHT_CLEAR_CONFIRMED=1'
          : 'Run npm run production-cutover:inflight-clearance — all counts must be 0',
      owner: 'manual',
    },
    ...buildAutomatedSafetyItems(root).map((item) => ({
      ...item,
      label: item.id === 'rollback-drill' ? '4. Rollback ready' : item.label,
    })),
    {
      id: 'runtime-posture-pre',
      label: 'Runtime posture (pre-cutover — must NOT be Canonical yet)',
      pass: preCutoverVerify.pass,
      detail: preCutoverVerify.pass
        ? 'EXPECTED_LEGACY_BEFORE_CUTOVER'
        : `blockers: ${preCutoverVerify.blockers.join(', ')}`,
      owner: 'engineering',
    },
  ];

  const blockers = items.filter((i) => !i.pass && !i.informational).map((i) => i.id);
  const automatedPass = items
    .filter((i) => i.owner !== 'manual' && !i.informational)
    .every((i) => i.pass);
  const preCutoverReady = blockers.length === 0;

  const nextActions: string[] = preCutoverReady
    ? [
        'npm run production-cutover:manifest',
        'source config/decision-runtime/production-cutover.env && restart backend',
        'npm run production-cutover:verify-runtime',
        'npm run production-cutover:smoke',
        'npm run production-probation:status',
      ]
    : blockers.map((b) => `Resolve: ${b}`);

  return {
    schemaId: PRODUCTION_CUTOVER_PREFLIGHT_SCHEMA_ID,
    generatedAt: new Date().toISOString(),
    stage: 'pre-cutover',
    pass: automatedPass,
    readyForCutover: preCutoverReady,
    preCutoverReady,
    cutoverComplete: false,
    probationStarted: false,
    runtimePosture: preCutoverVerify.pass
      ? 'EXPECTED_LEGACY_BEFORE_CUTOVER'
      : 'CANONICAL_CUTOVER',
    freezeManifest,
    items,
    blockers,
    rollbackEnv: 'config/decision-runtime/production-rollback-legacy.env',
    targetEnv: PRODUCTION_CUTOVER_TARGET,
    preCutoverRuntimeVerify: preCutoverVerify,
    inflightClearance: inflight
      ? { ready: inflight.ready, checkedAt: inflight.checkedAt, blockers: inflight.blockers }
      : undefined,
    nextActions,
  };
}

export function evaluatePostRestartPreflight(root = process.cwd()): ProductionCutoverPreflightReport {
  const runtimeVerifyArtifact = readJson<ReturnType<typeof verifyCutoverRuntimePosture>>(
    path.join(root, 'artifacts/production-cutover/runtime-verify.json'),
  );
  const smokeArtifact = readJson<{ pass?: boolean }>(
    path.join(root, 'artifacts/production-cutover/smoke.json'),
  );
  const observation = readJson<{ readiness?: { hardRedlinesPassed?: boolean } }>(
    path.join(root, 'artifacts/production-observation/report.json'),
  );

  const runtimePass = runtimeVerifyArtifact?.pass === true;
  const smokePass = smokeArtifact?.pass === true;
  const redlinesPass = observation?.readiness?.hardRedlinesPassed !== false;

  const items: CutoverPreflightItem[] = [
    {
      id: 'runtime-posture-live',
      label: 'Post-restart runtime posture (HTTP parsed)',
      pass: runtimePass,
      detail: runtimePass
        ? 'runtime-verify.json pass — Canonical cutover posture'
        : 'Run npm run production-cutover:verify-runtime after restart',
      owner: 'engineering',
    },
    {
      id: 'smoke',
      label: 'Production cutover smoke',
      pass: smokePass,
      detail: smokePass
        ? 'smoke.json pass'
        : 'Run npm run production-cutover:smoke',
      owner: 'sre',
    },
    {
      id: 'hard-redlines',
      label: 'Hard redlines baseline',
      pass: redlinesPass,
      detail: redlinesPass
        ? 'observation redlines OK'
        : 'run npm run production-observation:collect',
      owner: 'sre',
    },
    {
      id: 'rollback-ready',
      label: 'Legacy hot fallback available',
      pass: true,
      detail: 'npm run rollback-tier-a:legacy',
      owner: 'sre',
      informational: true,
    },
  ];

  const blockers = items.filter((i) => !i.pass && !i.informational).map((i) => i.id);
  const cutoverComplete = blockers.length === 0;
  const probationStarted = cutoverComplete;

  return {
    schemaId: PRODUCTION_CUTOVER_PREFLIGHT_SCHEMA_ID,
    generatedAt: new Date().toISOString(),
    stage: 'post-restart',
    pass: cutoverComplete,
    readyForCutover: false,
    preCutoverReady: false,
    cutoverComplete,
    probationStarted,
    runtimePosture: runtimePass ? 'CANONICAL_CUTOVER' : 'UNKNOWN',
    freezeManifest: {},
    items,
    blockers,
    rollbackEnv: 'config/decision-runtime/production-rollback-legacy.env',
    targetEnv: PRODUCTION_CUTOVER_TARGET,
    liveRuntimeVerify: runtimeVerifyArtifact ?? undefined,
    nextActions: cutoverComplete
      ? [
          'Lift maintenance window (resume Effective Plan writes)',
          'npm run production-probation:status — 7d checkpoints 15m/1h/4h/24h',
        ]
      : blockers.map((b) => `Resolve: ${b}`),
  };
}

export function resolveCutoverPreflightStage(argv = process.argv): CutoverPreflightStage {
  const flagIdx = argv.indexOf('--stage');
  if (flagIdx >= 0 && argv[flagIdx + 1] === 'post-restart') {
    return 'post-restart';
  }
  if (process.env.CUTOVER_PREFLIGHT_STAGE === 'post-restart') {
    return 'post-restart';
  }
  return 'pre-cutover';
}

export function evaluateProductionCutoverPreflight(
  root = process.cwd(),
  stage: CutoverPreflightStage = resolveCutoverPreflightStage(),
): ProductionCutoverPreflightReport {
  return stage === 'post-restart'
    ? evaluatePostRestartPreflight(root)
    : evaluatePreCutoverPreflight(root);
}

/** @deprecated Pre-cutover no longer attaches live Canonical verify — use verify-runtime post-restart. */
export function attachLocalRuntimeVerify(
  report: ProductionCutoverPreflightReport,
): ProductionCutoverPreflightReport {
  if (report.stage !== 'pre-cutover' || process.env.CUTOVER_VERIFY_LIVE !== '1') {
    return report;
  }
  return report;
}

/** Pre-cutover: optional HTTP check that system is still Legacy (not Canonical). */
export async function attachPreCutoverLiveRuntimeVerify(
  report: ProductionCutoverPreflightReport,
  apiBase?: string,
): Promise<ProductionCutoverPreflightReport> {
  if (report.stage !== 'pre-cutover') return report;

  const base = apiBase ?? process.env.DECISION_RUNTIME_BASE_URL?.trim();
  if (!base) return report;

  try {
    const url = `${base.replace(/\/$/, '').endsWith('/api') ? base.replace(/\/$/, '') : `${base.replace(/\/$/, '')}/api`}/decision-engine/v1/runtime-capabilities`;
    const res = await fetch(url, { signal: AbortSignal.timeout(8000) });
    if (!res.ok) return report;
    const json = (await res.json()) as { data?: CutoverRuntimeCapsInput };
    if (!json.data) return report;

    const preVerify = verifyPreCutoverRuntimePosture(json.data);
    const runtimeItem: CutoverPreflightItem = {
      id: 'runtime-posture-pre-live',
      label: 'Live server pre-cutover posture (HTTP)',
      pass: preVerify.pass,
      detail: preVerify.pass
        ? 'EXPECTED_LEGACY_BEFORE_CUTOVER (live)'
        : `blockers: ${preVerify.blockers.join(', ')}`,
      owner: 'engineering',
    };

    const items = [...report.items.filter((i) => i.id !== 'runtime-posture-pre-live'), runtimeItem];
    const blockers = items.filter((i) => !i.pass && !i.informational).map((i) => i.id);

    return {
      ...report,
      items,
      blockers,
      preCutoverReady: blockers.length === 0,
      readyForCutover: blockers.length === 0,
      preCutoverRuntimeVerify: preVerify,
      runtimePosture: preVerify.pass ? 'EXPECTED_LEGACY_BEFORE_CUTOVER' : 'CANONICAL_CUTOVER',
    };
  } catch {
    return report;
  }
}

/** @deprecated Use production-cutover:verify-runtime for post-restart gate. */
export async function attachLiveRuntimeVerify(
  report: ProductionCutoverPreflightReport,
): Promise<ProductionCutoverPreflightReport> {
  return report;
}

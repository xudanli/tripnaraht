/**
 * Save pre-cutover baseline manifest — run after pre-cutover gate, before applying cutover env.
 *
 * Usage:
 *   CUTOVER_OPERATOR=alice \
 *   CUTOVER_DB_SNAPSHOT_ID=snap-20260702 \
 *   CUTOVER_DB_SNAPSHOT_STATUS=available \
 *   CUTOVER_DATABASE_IDENTIFIER=prod-rds \
 *   npm run production-cutover:manifest
 */

import 'dotenv/config';
import * as crypto from 'node:crypto';
import * as fs from 'node:fs';
import * as path from 'node:path';
import { execSync } from 'node:child_process';
import { resolveProductionTransitionPhase } from '../../src/decision-runtime/production-transition/production-transition-phase.catalog';
import { resolveDecisionRuntimeCapabilities } from '../../src/decision-runtime/execution/decision-runtime-capabilities.util';
import { OBJECTIVE_REGISTRY_VERSION } from '../../src/decision-runtime/objectives/objective-semantics.registry';
import { CONSTRAINT_REGISTRY_VERSION } from '../../src/decision-runtime/constraints/constraint-registry.catalog';
import type { InflightClearanceReport } from '../../src/decision-runtime/production-transition/production-cutover-inflight-clearance.collector';

const OUT_DIR = path.join(process.cwd(), 'artifacts', 'production-cutover');
const CUTOVER_ENV = path.join(process.cwd(), 'config/decision-runtime/production-cutover.env');
const E1_MANIFEST = path.join(process.cwd(), 'artifacts/task-e1-deployment/deployment-manifest.json');

function log(line: string) {
  console.log(`[${new Date().toISOString()}] [cutover-manifest] ${line}`);
}

function sha256File(filePath: string): string {
  if (!fs.existsSync(filePath)) return 'missing';
  return crypto.createHash('sha256').update(fs.readFileSync(filePath)).digest('hex');
}

function readJson<T>(p: string): T | null {
  try {
    return JSON.parse(fs.readFileSync(p, 'utf8')) as T;
  } catch {
    return null;
  }
}

function main() {
  fs.mkdirSync(OUT_DIR, { recursive: true });

  const existing = readJson<Record<string, unknown>>(path.join(OUT_DIR, 'cutover-manifest.json'));
  const e1Manifest = readJson<Record<string, unknown>>(E1_MANIFEST);
  const inflight = readJson<InflightClearanceReport>(path.join(OUT_DIR, 'inflight-clearance.json'));

  const gitCommit = (() => {
    try {
      return execSync('git rev-parse HEAD', { encoding: 'utf8' }).trim();
    } catch {
      return 'unknown';
    }
  })();

  const caps = resolveDecisionRuntimeCapabilities();
  const phase = resolveProductionTransitionPhase();
  const snapshotId = process.env.CUTOVER_DB_SNAPSHOT_ID?.trim() || null;
  const snapshotStatus = process.env.CUTOVER_DB_SNAPSHOT_STATUS?.trim() || 'available';

  const manifest = {
    schemaId: 'tripnara.production_cutover_manifest@v2',
    recordedAt: new Date().toISOString(),
    operator: process.env.CUTOVER_OPERATOR?.trim() || 'unspecified',
    gitCommit,
    dockerImageDigest: process.env.CUTOVER_DOCKER_IMAGE_DIGEST?.trim() || null,
    packageVersion: (() => {
      try {
        return (JSON.parse(fs.readFileSync('package.json', 'utf8')) as { version?: string }).version;
      } catch {
        return 'unknown';
      }
    })(),
    schemaVersions: {
      objectiveRegistry: OBJECTIVE_REGISTRY_VERSION,
      constraintRegistry: CONSTRAINT_REGISTRY_VERSION,
      capabilities: 'tripnara.decision_runtime_capabilities@v1',
    },
    cutoverConfigHash: sha256File(CUTOVER_ENV),
    cutoverConfigPath: 'config/decision-runtime/production-cutover.env',
    databaseSnapshot: {
      snapshotId,
      status: snapshotStatus,
      databaseIdentifier: process.env.CUTOVER_DATABASE_IDENTIFIER?.trim() || null,
      recordedAt: new Date().toISOString(),
      recoveryConfirmed: process.env.CUTOVER_DB_SNAPSHOT_CONFIRMED === '1',
      createdAfterLastMigration:
        process.env.CUTOVER_SNAPSHOT_AFTER_MIGRATION_CONFIRMED === '1' || null,
    },
    /** Preserve historical E1 deployment facts — do not overwrite. */
    preMigrationBackup: e1Manifest?.preMigrationBackup ?? existing?.preMigrationBackup ?? null,
    inflightClearance: inflight
      ? {
          checkedAt: inflight.checkedAt,
          ready: inflight.ready,
          operator: inflight.operator,
        }
      : null,
    authorityBeforeCutover: phase.currentAuthority,
    runtimeModeBeforeCutover: caps.mode,
    effectivePlanCount: process.env.CUTOVER_EFFECTIVE_PLAN_COUNT?.trim() || null,
    inFlightDecisionRuns: inflight?.activeDecisionRuns ?? null,
    cutoverIntent:
      'Canonical Runtime governance ON; legacy-frozen selection authority; Lex shadow only',
  };

  const outPath = path.join(OUT_DIR, 'cutover-manifest.json');
  fs.writeFileSync(outPath, JSON.stringify(manifest, null, 2));
  log(`written ${outPath}`);
  log(`commit=${gitCommit} authority=${manifest.authorityBeforeCutover}`);
  log(`snapshot=${snapshotId ?? 'unset'} status=${snapshotStatus}`);
  log(`configHash=${manifest.cutoverConfigHash.slice(0, 12)}…`);
}

main();

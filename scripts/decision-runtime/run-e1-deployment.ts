/**
 * Task E1 — Deployment helper: backup manifest, migration, schema verification.
 *
 * Usage:
 *   npx tsx scripts/decision-runtime/run-e1-deployment.ts --record-pre-migration-skip \
 *     --database-identifier <rds-id> --operator <name>
 *
 *   npx tsx scripts/decision-runtime/run-e1-deployment.ts --record-post-migration-snapshot \
 *     --snapshot-id <id> --database-identifier <rds-id> --operator <name>
 *
 *   npx tsx scripts/decision-runtime/run-e1-deployment.ts --skip-post-migration-snapshot \
 *     --database-identifier <rds-id> --operator <name> [--reason "..."]
 *
 *   npx tsx scripts/decision-runtime/run-e1-deployment.ts --migrate
 *
 *   npx tsx scripts/decision-runtime/run-e1-deployment.ts --verify-schema
 *
 * Artifacts: artifacts/task-e1-deployment/
 */

import { execSync } from 'node:child_process';
import * as fs from 'node:fs/promises';
import * as path from 'node:path';
import { PrismaClient } from '@prisma/client';
import { E1_BENCHMARK_MIGRATION } from '../../src/decision-runtime/benchmark/benchmark-fault-injection-gate.util';
import { resolveGitCommit } from '../../src/decision-runtime/benchmark/benchmark-config.util';

const ARTIFACT_ROOT = path.join(process.cwd(), 'artifacts/task-e1-deployment');
const MANIFEST_PATH = path.join(ARTIFACT_ROOT, 'deployment-manifest.json');
const E1_MIGRATION = E1_BENCHMARK_MIGRATION;
const E0_MIGRATION = '20260701160000_shadow_review_evidence';

function log(line: string) {
  console.log(`[${new Date().toISOString()}] [e1-deploy] ${line}`);
}

function parseArgs(argv: string[]) {
  const get = (flag: string) => {
    const i = argv.indexOf(flag);
    return i >= 0 ? argv[i + 1] : undefined;
  };
  return {
    recordPreMigrationSkip: argv.includes('--record-pre-migration-skip'),
    recordPostMigrationSnapshot: argv.includes('--record-post-migration-snapshot'),
    skipPostMigrationSnapshot: argv.includes('--skip-post-migration-snapshot'),
    skipReason: get('--reason'),
    migrate: argv.includes('--migrate'),
    verifySchema: argv.includes('--verify-schema'),
    snapshotId: get('--snapshot-id'),
    databaseIdentifier: get('--database-identifier'),
    operator: get('--operator') ?? process.env.USER ?? 'unknown',
    databaseVersion: get('--database-version'),
    snapshotStatus: get('--snapshot-status') ?? 'available',
  };
}

async function writeJson(filePath: string, payload: unknown) {
  await fs.mkdir(path.dirname(filePath), { recursive: true });
  await fs.writeFile(filePath, JSON.stringify(payload, null, 2));
}

async function readManifest(): Promise<Record<string, unknown>> {
  try {
    return JSON.parse(await fs.readFile(MANIFEST_PATH, 'utf8')) as Record<string, unknown>;
  } catch {
    return {};
  }
}

function databaseVersionFromManifest(manifest: Record<string, unknown>): string | undefined {
  const pre = manifest.preMigrationBackup as { databaseVersion?: string } | undefined;
  const post = manifest.postMigrationBaselineSnapshot as { databaseVersion?: string } | undefined;
  const migration = manifest.migration as { schema?: { databaseVersion?: string } } | undefined;
  return post?.databaseVersion ?? pre?.databaseVersion ?? migration?.schema?.databaseVersion;
}

async function resolveDatabaseVersion(
  prisma: PrismaClient | null,
  manifest: Record<string, unknown>,
  explicit?: string,
): Promise<string | undefined> {
  if (explicit) return explicit;
  const cached = databaseVersionFromManifest(manifest);
  if (cached) return cached;
  if (!prisma) {
    throw new Error(
      'database version unknown — pass --database-version or ensure deployment-manifest.json has databaseVersion',
    );
  }
  return queryDatabaseVersion(prisma);
}

async function queryDatabaseVersion(prisma: PrismaClient): Promise<string | undefined> {
  const rows = await prisma.$queryRaw<Array<{ version: string }>>`SELECT version()`;
  return rows[0]?.version;
}

async function queryMigrationStatus(prisma: PrismaClient): Promise<string[]> {
  const rows = await prisma.$queryRaw<Array<{ migration_name: string }>>`
    SELECT migration_name FROM _prisma_migrations ORDER BY finished_at
  `;
  return rows.map((r) => r.migration_name);
}

async function verifySchema(prisma: PrismaClient) {
  const tables = await prisma.$queryRaw<Array<{ table_name: string }>>`
    SELECT table_name FROM information_schema.tables
    WHERE table_schema = 'public'
      AND table_name IN ('decision_benchmark_run', 'decision_benchmark_instance_execution')
  `;
  const tableNames = new Set(tables.map((t) => t.table_name));

  const cols = await prisma.$queryRaw<Array<{ column_name: string }>>`
    SELECT column_name FROM information_schema.columns
    WHERE table_schema = 'public'
      AND table_name = 'decision_benchmark_instance_execution'
      AND column_name IN ('lease_expires_at', 'locked_by', 'heartbeat_at', 'request_id', 'status')
  `;
  const colSet = new Set(cols.map((c) => c.column_name));

  const indexes = await prisma.$queryRaw<Array<{ indexdef: string }>>`
    SELECT indexdef FROM pg_indexes
    WHERE schemaname = 'public'
      AND tablename = 'decision_benchmark_instance_execution'
  `;
  const indexText = indexes.map((i) => i.indexdef).join('\n');

  const migrations = await queryMigrationStatus(prisma);
  const e1Applied = migrations.includes(E1_MIGRATION);

  return {
    verifiedAt: new Date().toISOString(),
    gitCommit: resolveGitCommit(),
    migrationVersion: E1_MIGRATION,
    e1MigrationApplied: e1Applied,
    tables: {
      decision_benchmark_run: tableNames.has('decision_benchmark_run'),
      decision_benchmark_instance_execution: tableNames.has('decision_benchmark_instance_execution'),
    },
    leaseColumns: {
      lease_expires_at: colSet.has('lease_expires_at'),
      locked_by: colSet.has('locked_by'),
      heartbeat_at: colSet.has('heartbeat_at'),
    },
    uniqueConstraints: indexText.includes('request_id'),
    statusIndex: indexText.includes('benchmark_run_id') && indexText.includes('status'),
    databaseVersion: await queryDatabaseVersion(prisma),
    appliedMigrations: migrations.filter((m) => m === E0_MIGRATION || m === E1_MIGRATION),
  };
}

async function main() {
  const opts = parseArgs(process.argv.slice(2));
  await fs.mkdir(ARTIFACT_ROOT, { recursive: true });

  const needsDb =
    opts.recordPreMigrationSkip ||
    opts.migrate ||
    opts.verifySchema ||
    (opts.recordPostMigrationSnapshot && !opts.databaseVersion) ||
    (opts.skipPostMigrationSnapshot && !opts.databaseVersion);

  let prisma: PrismaClient | null = null;
  if (needsDb) {
    const manifest = await readManifest();
    const canUseCached =
      (opts.recordPostMigrationSnapshot || opts.skipPostMigrationSnapshot) &&
      Boolean(opts.databaseVersion ?? databaseVersionFromManifest(manifest));
    if (!canUseCached || opts.recordPreMigrationSkip || opts.migrate || opts.verifySchema) {
      prisma = new PrismaClient();
    }
  }

  try {
    if (opts.recordPreMigrationSkip) {
      const p = prisma ?? new PrismaClient();
      if (!prisma) prisma = p;
      const migrationBefore = await queryMigrationStatus(p);
      const existingManifest = await readManifest();
      const dbVersion = await resolveDatabaseVersion(p, existingManifest, opts.databaseVersion);
      const manifest = {
        ...existingManifest,
        preMigrationBackup: {
          status: 'SKIPPED_BY_OPERATOR_ACK',
          backupSkipReason:
            'Operator acknowledged skip — pre-migration RDS snapshot not created before E1 migration',
          databaseIdentifier: opts.databaseIdentifier ?? 'unknown',
          databaseVersion: dbVersion,
          migrationBefore,
          acknowledgedAt: new Date().toISOString(),
          operator: opts.operator,
        },
        gitCommit: resolveGitCommit(),
      };
      await writeJson(MANIFEST_PATH, manifest);
      log(`Pre-migration skip recorded → ${MANIFEST_PATH}`);
    }

    if (opts.recordPostMigrationSnapshot) {
      if (!opts.snapshotId || !opts.databaseIdentifier) {
        throw new Error(
          '--record-post-migration-snapshot requires --snapshot-id and --database-identifier',
        );
      }
      const existingManifest = await readManifest();
      const dbVersion = await resolveDatabaseVersion(prisma, existingManifest, opts.databaseVersion);
      const manifest = {
        ...existingManifest,
        postMigrationBaselineSnapshot: {
          snapshotId: opts.snapshotId,
          databaseIdentifier: opts.databaseIdentifier,
          databaseVersion: dbVersion,
          status: opts.snapshotStatus,
          createdAt: new Date().toISOString(),
          operator: opts.operator,
          label: 'post-migration baseline snapshot (after 20260701170000_benchmark_batch_runner)',
        },
        gitCommit: resolveGitCommit(),
      };
      await writeJson(MANIFEST_PATH, manifest);
      log(`Post-migration baseline snapshot recorded → ${MANIFEST_PATH}`);
    }

    if (opts.skipPostMigrationSnapshot) {
      const existingManifest = await readManifest();
      const dbVersion = await resolveDatabaseVersion(prisma, existingManifest, opts.databaseVersion);
      const manifest = {
        ...existingManifest,
        postMigrationBaselineSnapshot: {
          status: 'SKIPPED_TEST_ENV',
          reason:
            opts.skipReason ??
            'Test environment — post-migration RDS baseline snapshot deferred',
          databaseIdentifier: opts.databaseIdentifier ?? 'unknown',
          databaseVersion: dbVersion,
          migrationVersion: E1_MIGRATION,
          acknowledgedAt: new Date().toISOString(),
          operator: opts.operator,
        },
        gitCommit: resolveGitCommit(),
      };
      await writeJson(MANIFEST_PATH, manifest);
      log(`Post-migration snapshot skip (test env) recorded → ${MANIFEST_PATH}`);
    }

    if (opts.migrate) {
      const p = prisma ?? new PrismaClient();
      if (!prisma) prisma = p;
      const statusBefore = execSync('npx prisma migrate status --schema prisma/schema.prisma', {
        encoding: 'utf8',
      });
      await fs.writeFile(path.join(ARTIFACT_ROOT, 'migration-status-before.txt'), statusBefore);

      let deployLog = '';
      try {
        deployLog = execSync('npm run task-e1:migrate', { encoding: 'utf8' });
      } catch (err: unknown) {
        const message = err instanceof Error ? err.message : String(err);
        deployLog = message;
        await fs.writeFile(path.join(ARTIFACT_ROOT, 'migration-deploy.log'), deployLog);
        throw err;
      }
      await fs.writeFile(path.join(ARTIFACT_ROOT, 'migration-deploy.log'), deployLog);

      const statusAfter = execSync('npx prisma migrate status --schema prisma/schema.prisma', {
        encoding: 'utf8',
      });
      await fs.writeFile(path.join(ARTIFACT_ROOT, 'migration-status-after.txt'), statusAfter);

      const schema = await verifySchema(p);
      await writeJson(path.join(ARTIFACT_ROOT, 'schema-verification.json'), schema);

      const manifest = {
        ...(await readManifest()),
        migration: {
          deployedAt: new Date().toISOString(),
          migrationVersion: E1_MIGRATION,
          gitCommit: resolveGitCommit(),
          schema,
        },
      };
      await writeJson(MANIFEST_PATH, manifest);
      log('Migration deploy complete');
    }

    if (opts.verifySchema) {
      const p = prisma ?? new PrismaClient();
      if (!prisma) prisma = p;
      const schema = await verifySchema(p);
      await writeJson(path.join(ARTIFACT_ROOT, 'schema-verification.json'), schema);
      log(`Schema verification → ${path.join(ARTIFACT_ROOT, 'schema-verification.json')}`);
      if (!schema.e1MigrationApplied || !schema.tables.decision_benchmark_run) {
        process.exit(1);
      }
    }

    if (
      !opts.recordPreMigrationSkip &&
      !opts.recordPostMigrationSnapshot &&
      !opts.skipPostMigrationSnapshot &&
      !opts.migrate &&
      !opts.verifySchema
    ) {
      log(
        'No action. Use --record-pre-migration-skip, --record-post-migration-snapshot, --skip-post-migration-snapshot, --migrate, or --verify-schema',
      );
    }
  } finally {
    if (prisma) await prisma.$disconnect();
  }
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});

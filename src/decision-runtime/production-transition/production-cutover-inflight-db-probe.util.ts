/**
 * Runs cutover inflight SQL probes against PostgreSQL and builds overlay scaffold.
 */

import { readFileSync, readdirSync, existsSync } from 'node:fs';
import path from 'node:path';
import type { PrismaClient } from '@prisma/client';
import type { InflightOverlayEvidence, RequiredOverlayField } from './production-cutover-inflight-clearance.collector';

export const INFLIGHT_DB_PROBE_SCHEMA_ID = 'tripnara.production_cutover_inflight_db_probe@v1';

const SQL_DIR = path.join(process.cwd(), 'scripts/decision-runtime/sql/cutover-inflight');

/** Maps overlay field → SQL file stem (without .sql). */
export const OVERLAY_FIELD_SQL_MAP: Partial<Record<RequiredOverlayField, string>> = {
  activeDecisionRuns: 'active-decision-runs-v2',
  pausedDecisionRuns: 'paused-decision-runs-v1',
  pendingAuthorizations: 'pending-authorizations-v2',
  expiredButExecutableAuthorizations: 'expired-but-executable-authorizations-v1',
  orphanAuthorizations: 'orphan-authorizations-v2',
  activeExecutions: 'active-executions-v1',
  activeRollbacks: 'active-rollbacks-v1',
  unresolvedPartialFailures: 'unresolved-partial-failures-v1',
  activeWriteLeases: 'active-benchmark-write-leases-v1',
  effectivePlanWritesLast5Minutes: 'effective-plan-writes-last-5m-v1',
  planVersionsCreatedLast5Minutes: 'plan-versions-created-last-5m-v1',
  executeRequestsLast5Minutes: 'execute-requests-last-5m-v1',
};

export interface SqlProbeResult {
  sqlId: string;
  overlayField?: RequiredOverlayField;
  value: number;
  queriedAt: string;
  error?: string;
}

export interface InflightDbProbeReport {
  schemaId: typeof INFLIGHT_DB_PROBE_SCHEMA_ID;
  probedAt: string;
  operator: string;
  maintenanceWindowNote: string;
  probes: SqlProbeResult[];
  benchmarkRuns: number;
  overlayScaffold: Partial<Record<RequiredOverlayField, InflightOverlayEvidence>>;
  queueFieldsRequireManual: RequiredOverlayField[];
  notes: string[];
}

function loadSql(sqlId: string): string | null {
  const filePath = path.join(SQL_DIR, `${sqlId}.sql`);
  if (!existsSync(filePath)) return null;
  return readFileSync(filePath, 'utf8');
}

async function runScalarQuery(prisma: PrismaClient, sql: string): Promise<number> {
  const rows = await prisma.$queryRawUnsafe<Array<{ value: bigint | number }>>(sql);
  const raw = rows[0]?.value ?? 0;
  return typeof raw === 'bigint' ? Number(raw) : Number(raw);
}

export async function runInflightDbProbe(input: {
  prisma: PrismaClient;
  operator?: string;
}): Promise<InflightDbProbeReport> {
  const operator = input.operator?.trim() || process.env.CUTOVER_OPERATOR?.trim() || 'unspecified';
  const probedAt = new Date().toISOString();
  const probes: SqlProbeResult[] = [];
  const overlayScaffold: Partial<Record<RequiredOverlayField, InflightOverlayEvidence>> = {};
  const notes: string[] = [];

  for (const [field, sqlId] of Object.entries(OVERLAY_FIELD_SQL_MAP) as Array<
    [RequiredOverlayField, string]
  >) {
    const sql = loadSql(sqlId);
    if (!sql) {
      notes.push(`missing SQL file for ${field}: ${sqlId}.sql`);
      continue;
    }
    const queryBody = sql
      .split('\n')
      .filter((line) => !line.trim().startsWith('--'))
      .join('\n')
      .trim();
    try {
      const value = await runScalarQuery(input.prisma, queryBody);
      probes.push({ sqlId, overlayField: field, value, queriedAt: probedAt });
      overlayScaffold[field] = {
        value,
        source: 'postgresql',
        checkedAt: probedAt,
        checkedBy: operator,
        evidence: `sql:${sqlId}`,
      };
    } catch (err) {
      const message = (err as Error).message;
      probes.push({ sqlId, overlayField: field, value: -1, queriedAt: probedAt, error: message });
      notes.push(`${field} query failed: ${message}`);
    }
  }

  let benchmarkRuns = -1;
  try {
    const sql = loadSql('active-benchmark-runs-v1');
    if (sql) {
      benchmarkRuns = await runScalarQuery(
        input.prisma,
        sql
          .split('\n')
          .filter((l) => !l.trim().startsWith('--'))
          .join('\n'),
      );
      probes.push({
        sqlId: 'active-benchmark-runs-v1',
        value: benchmarkRuns,
        queriedAt: probedAt,
      });
    }
  } catch (err) {
    notes.push(`benchmark runs probe failed: ${(err as Error).message}`);
  }

  if (overlayScaffold.pausedDecisionRuns?.value === 0) {
    overlayScaffold.pausedDecisionRunsAcknowledged = {
      value: true,
      source: 'not-applicable',
      checkedAt: probedAt,
      checkedBy: operator,
      evidence: 'not-applicable:pausedDecisionRuns=0',
    };
  }

  const queueFieldsRequireManual: RequiredOverlayField[] = ['pendingQueueWriteJobs'];
  notes.push(
    'pendingQueueWriteJobs requires queue-admin-console evidence (Group B) — not in PostgreSQL',
  );
  notes.push(
    'Review overlay scaffold before copying to inflight-overlay.json; do not mask non-zero counts',
  );

  return {
    schemaId: INFLIGHT_DB_PROBE_SCHEMA_ID,
    probedAt,
    operator,
    maintenanceWindowNote:
      'Run only after maintenance window + longest task drain period',
    probes,
    benchmarkRuns,
    overlayScaffold,
    queueFieldsRequireManual,
    notes,
  };
}

export function listCutoverInflightSqlFiles(): string[] {
  if (!existsSync(SQL_DIR)) return [];
  return readdirSync(SQL_DIR).filter((f) => f.endsWith('.sql'));
}

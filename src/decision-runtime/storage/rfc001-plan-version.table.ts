/**
 * P2 — RFC-001 PlanVersion / snapshots / executions table access (raw SQL).
 */

import { Injectable, Logger } from '@nestjs/common';
import { PrismaService } from '../../prisma/prisma.service';
import type { PlanVersion } from '../../trips/guardian-decision-core/contracts/plan-version.types';

type PlanVersionRow = {
  plan_version_id: string;
  trip_id: string;
  payload: unknown;
  status: string;
  effective_at: Date | null;
};

@Injectable()
export class Rfc001PlanVersionTableRepository {
  private readonly logger = new Logger(Rfc001PlanVersionTableRepository.name);

  constructor(private readonly prisma: PrismaService) {}

  async upsertVersion(version: PlanVersion): Promise<void> {
    const payload = JSON.stringify(version);
    await this.prisma.$executeRaw`
      INSERT INTO "rfc001_plan_versions" (
        "plan_version_id", "trip_id", "parent_plan_version_id", "source_decision_id",
        "created_by", "status", "materialized_plan_snapshot_ref", "operations", "metadata",
        "payload", "created_at", "effective_at", "updated_at"
      ) VALUES (
        ${version.planVersionId},
        ${version.tripId},
        ${version.parentPlanVersionId ?? null},
        ${version.sourceDecisionId ?? null},
        ${version.createdBy},
        ${version.status},
        ${version.materializedPlanSnapshotRef},
        ${JSON.stringify(version.operations ?? [])}::jsonb,
        ${version.metadata ? JSON.stringify(version.metadata) : null}::jsonb,
        ${payload}::jsonb,
        ${new Date(version.createdAt)},
        ${version.effectiveAt ? new Date(version.effectiveAt) : null},
        CURRENT_TIMESTAMP
      )
      ON CONFLICT ("plan_version_id") DO UPDATE SET
        "parent_plan_version_id" = EXCLUDED."parent_plan_version_id",
        "source_decision_id" = EXCLUDED."source_decision_id",
        "created_by" = EXCLUDED."created_by",
        "status" = EXCLUDED."status",
        "materialized_plan_snapshot_ref" = EXCLUDED."materialized_plan_snapshot_ref",
        "operations" = EXCLUDED."operations",
        "metadata" = EXCLUDED."metadata",
        "payload" = EXCLUDED."payload",
        "effective_at" = EXCLUDED."effective_at",
        "updated_at" = CURRENT_TIMESTAMP
    `;
  }

  async listVersions(tripId: string): Promise<PlanVersion[]> {
    const rows = await this.prisma.$queryRaw<PlanVersionRow[]>`
      SELECT "plan_version_id", "trip_id", "payload", "status", "effective_at"
      FROM "rfc001_plan_versions"
      WHERE "trip_id" = ${tripId}
      ORDER BY "created_at" ASC
    `;
    return rows.map((r) => this.rowToVersion(r));
  }

  async getVersion(
    tripId: string,
    planVersionId: string,
  ): Promise<PlanVersion | undefined> {
    const rows = await this.prisma.$queryRaw<PlanVersionRow[]>`
      SELECT "plan_version_id", "trip_id", "payload", "status", "effective_at"
      FROM "rfc001_plan_versions"
      WHERE "trip_id" = ${tripId} AND "plan_version_id" = ${planVersionId}
      LIMIT 1
    `;
    return rows[0] ? this.rowToVersion(rows[0]) : undefined;
  }

  async findBySourceDecision(
    tripId: string,
    decisionId: string,
  ): Promise<PlanVersion | undefined> {
    const rows = await this.prisma.$queryRaw<PlanVersionRow[]>`
      SELECT "plan_version_id", "trip_id", "payload", "status", "effective_at"
      FROM "rfc001_plan_versions"
      WHERE "trip_id" = ${tripId} AND "source_decision_id" = ${decisionId}
      LIMIT 1
    `;
    return rows[0] ? this.rowToVersion(rows[0]) : undefined;
  }

  async setEffective(tripId: string, planVersionId: string): Promise<void> {
    const now = new Date();
    await this.prisma.$executeRaw`
      UPDATE "rfc001_plan_versions"
      SET "status" = CASE
            WHEN "plan_version_id" = ${planVersionId} THEN 'EFFECTIVE'
            WHEN "status" = 'EFFECTIVE' THEN 'SUPERSEDED'
            ELSE "status"
          END,
          "effective_at" = CASE
            WHEN "plan_version_id" = ${planVersionId} THEN ${now}
            ELSE "effective_at"
          END,
          "updated_at" = CURRENT_TIMESTAMP
      WHERE "trip_id" = ${tripId}
    `;
    await this.prisma.$executeRaw`
      INSERT INTO "rfc001_trip_effective_plan" ("trip_id", "effective_plan_version_id", "updated_at")
      VALUES (${tripId}, ${planVersionId}, CURRENT_TIMESTAMP)
      ON CONFLICT ("trip_id") DO UPDATE SET
        "effective_plan_version_id" = EXCLUDED."effective_plan_version_id",
        "updated_at" = CURRENT_TIMESTAMP
    `;
  }

  async getEffectivePlanVersionId(tripId: string): Promise<string | undefined> {
    const rows = await this.prisma.$queryRaw<Array<{ effective_plan_version_id: string }>>`
      SELECT "effective_plan_version_id"
      FROM "rfc001_trip_effective_plan"
      WHERE "trip_id" = ${tripId}
      LIMIT 1
    `;
    return rows[0]?.effective_plan_version_id;
  }

  async saveSnapshot(
    tripId: string,
    snapshotRef: string,
    payload: unknown,
  ): Promise<void> {
    await this.prisma.$executeRaw`
      INSERT INTO "rfc001_plan_snapshots" ("trip_id", "snapshot_ref", "payload", "created_at")
      VALUES (${tripId}, ${snapshotRef}, ${JSON.stringify(payload)}::jsonb, CURRENT_TIMESTAMP)
      ON CONFLICT ("trip_id", "snapshot_ref") DO UPDATE SET
        "payload" = EXCLUDED."payload",
        "created_at" = CURRENT_TIMESTAMP
    `;
  }

  async listSnapshots(
    tripId: string,
  ): Promise<Array<{ snapshotRef: string; payload: unknown; createdAt: string }>> {
    const rows = await this.prisma.$queryRaw<
      Array<{ snapshot_ref: string; payload: unknown; created_at: Date }>
    >`
      SELECT "snapshot_ref", "payload", "created_at"
      FROM "rfc001_plan_snapshots"
      WHERE "trip_id" = ${tripId}
      ORDER BY "created_at" ASC
    `;
    return rows.map((r) => ({
      snapshotRef: r.snapshot_ref,
      payload: r.payload,
      createdAt: r.created_at.toISOString(),
    }));
  }

  async getExecution(
    tripId: string,
    idempotencyKey: string,
  ): Promise<{ planVersionId: string; decisionId: string; appliedAt: string } | undefined> {
    const rows = await this.prisma.$queryRaw<
      Array<{
        plan_version_id: string;
        decision_id: string;
        applied_at: Date;
      }>
    >`
      SELECT "plan_version_id", "decision_id", "applied_at"
      FROM "rfc001_plan_version_executions"
      WHERE "idempotency_key" = ${idempotencyKey} AND "trip_id" = ${tripId}
      LIMIT 1
    `;
    const r = rows[0];
    if (!r) return undefined;
    return {
      planVersionId: r.plan_version_id,
      decisionId: r.decision_id,
      appliedAt: r.applied_at.toISOString(),
    };
  }

  async recordExecution(
    tripId: string,
    idempotencyKey: string,
    entry: { planVersionId: string; decisionId: string },
  ): Promise<void> {
    await this.prisma.$executeRaw`
      INSERT INTO "rfc001_plan_version_executions" (
        "idempotency_key", "trip_id", "plan_version_id", "decision_id", "applied_at"
      ) VALUES (
        ${idempotencyKey}, ${tripId}, ${entry.planVersionId}, ${entry.decisionId}, CURRENT_TIMESTAMP
      )
      ON CONFLICT ("idempotency_key") DO NOTHING
    `;
  }

  /** Fail-open helper for dual-write paths. */
  async safeUpsertVersion(version: PlanVersion): Promise<void> {
    try {
      await this.upsertVersion(version);
    } catch (err) {
      this.logger.warn(
        `PlanVersion table upsert failed planVersionId=${version.planVersionId}: ${
          err instanceof Error ? err.message : String(err)
        }`,
      );
    }
  }

  private rowToVersion(row: PlanVersionRow): PlanVersion {
    const payload =
      typeof row.payload === 'string' ? JSON.parse(row.payload) : row.payload;
    return payload as PlanVersion;
  }
}

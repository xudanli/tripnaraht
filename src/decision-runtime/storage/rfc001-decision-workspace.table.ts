/**
 * P2 — RFC-001 DecisionWorkspace table access (short-lived staging).
 */

import { Injectable, Logger } from '@nestjs/common';
import { PrismaService } from '../../prisma/prisma.service';
import type { DecisionWorkspace } from '../../trips/guardian-decision-core/contracts/decision-workspace.types';

@Injectable()
export class Rfc001DecisionWorkspaceTableRepository {
  private readonly logger = new Logger(Rfc001DecisionWorkspaceTableRepository.name);

  constructor(private readonly prisma: PrismaService) {}

  async upsert(tripId: string, workspace: DecisionWorkspace): Promise<void> {
    await this.prisma.$executeRaw`
      INSERT INTO "rfc001_decision_workspaces" (
        "workspace_id", "trip_id", "problem_id", "base_plan_version_id",
        "world_state_snapshot_id", "preference_snapshot_id", "status", "revision",
        "payload", "created_at", "expires_at", "updated_at"
      ) VALUES (
        ${workspace.workspaceId},
        ${tripId},
        ${workspace.problemId},
        ${workspace.basePlanVersionId},
        ${workspace.worldStateSnapshotId},
        ${workspace.preferenceSnapshotId},
        ${workspace.status},
        ${workspace.revision},
        ${JSON.stringify(workspace)}::jsonb,
        ${new Date(workspace.createdAt)},
        ${workspace.expiresAt ? new Date(workspace.expiresAt) : null},
        CURRENT_TIMESTAMP
      )
      ON CONFLICT ("workspace_id") DO UPDATE SET
        "problem_id" = EXCLUDED."problem_id",
        "base_plan_version_id" = EXCLUDED."base_plan_version_id",
        "world_state_snapshot_id" = EXCLUDED."world_state_snapshot_id",
        "preference_snapshot_id" = EXCLUDED."preference_snapshot_id",
        "status" = EXCLUDED."status",
        "revision" = EXCLUDED."revision",
        "payload" = EXCLUDED."payload",
        "expires_at" = EXCLUDED."expires_at",
        "updated_at" = CURRENT_TIMESTAMP
    `;
  }

  async list(tripId: string): Promise<DecisionWorkspace[]> {
    const rows = await this.prisma.$queryRaw<Array<{ payload: unknown }>>`
      SELECT "payload" FROM "rfc001_decision_workspaces"
      WHERE "trip_id" = ${tripId}
      ORDER BY "created_at" ASC
    `;
    return rows.map((r) => r.payload as DecisionWorkspace);
  }

  async get(
    tripId: string,
    workspaceId: string,
  ): Promise<DecisionWorkspace | undefined> {
    const rows = await this.prisma.$queryRaw<Array<{ payload: unknown }>>`
      SELECT "payload" FROM "rfc001_decision_workspaces"
      WHERE "trip_id" = ${tripId} AND "workspace_id" = ${workspaceId}
      LIMIT 1
    `;
    return rows[0]?.payload as DecisionWorkspace | undefined;
  }

  async getByProblemId(
    tripId: string,
    problemId: string,
  ): Promise<DecisionWorkspace | undefined> {
    const rows = await this.prisma.$queryRaw<Array<{ payload: unknown }>>`
      SELECT "payload" FROM "rfc001_decision_workspaces"
      WHERE "trip_id" = ${tripId} AND "problem_id" = ${problemId}
      LIMIT 1
    `;
    return rows[0]?.payload as DecisionWorkspace | undefined;
  }

  async safeUpsert(tripId: string, workspace: DecisionWorkspace): Promise<void> {
    try {
      await this.upsert(tripId, workspace);
    } catch (err) {
      this.logger.warn(
        `Workspace table upsert failed workspaceId=${workspace.workspaceId}: ${
          err instanceof Error ? err.message : String(err)
        }`,
      );
    }
  }
}

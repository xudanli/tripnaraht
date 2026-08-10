/**
 * P2 — RFC-001 Decision ledger / runs / refs table access.
 */

import { Injectable, Logger } from '@nestjs/common';
import { PrismaService } from '../../prisma/prisma.service';
import type { Rfc001DecisionRecord } from '../../trips/guardian-decision-core/contracts/decision-record.types';
import type {
  Rfc001DecisionRef,
  Rfc001DecisionRun,
} from '../../trips/guardian-decision-core/persistence/rfc001-decision-ledger.store';

@Injectable()
export class Rfc001DecisionLedgerTableRepository {
  private readonly logger = new Logger(Rfc001DecisionLedgerTableRepository.name);

  constructor(private readonly prisma: PrismaService) {}

  async upsertDecision(tripId: string, record: Rfc001DecisionRecord): Promise<void> {
    await this.prisma.$executeRaw`
      INSERT INTO "rfc001_decision_records" (
        "decision_id", "trip_id", "problem_id", "workspace_id", "base_plan_version_id",
        "final_action", "record_status", "selected_candidate_id", "effective_plan_version_id",
        "payload", "created_at", "decided_at", "updated_at"
      ) VALUES (
        ${record.decisionId},
        ${tripId},
        ${record.problemId},
        ${record.workspaceId},
        ${record.basePlanVersionId},
        ${record.finalAction},
        ${record.recordStatus},
        ${record.selectedCandidateId ?? null},
        ${record.effectivePlanVersionId ?? null},
        ${JSON.stringify(record)}::jsonb,
        ${new Date(record.createdAt)},
        ${new Date(record.decidedAt)},
        CURRENT_TIMESTAMP
      )
      ON CONFLICT ("decision_id") DO UPDATE SET
        "problem_id" = EXCLUDED."problem_id",
        "workspace_id" = EXCLUDED."workspace_id",
        "base_plan_version_id" = EXCLUDED."base_plan_version_id",
        "final_action" = EXCLUDED."final_action",
        "record_status" = EXCLUDED."record_status",
        "selected_candidate_id" = EXCLUDED."selected_candidate_id",
        "effective_plan_version_id" = EXCLUDED."effective_plan_version_id",
        "payload" = EXCLUDED."payload",
        "decided_at" = EXCLUDED."decided_at",
        "updated_at" = CURRENT_TIMESTAMP
    `;
  }

  async listDecisions(tripId: string): Promise<Rfc001DecisionRecord[]> {
    const rows = await this.prisma.$queryRaw<Array<{ payload: unknown }>>`
      SELECT "payload" FROM "rfc001_decision_records"
      WHERE "trip_id" = ${tripId}
      ORDER BY "created_at" ASC
    `;
    return rows.map((r) => r.payload as Rfc001DecisionRecord);
  }

  async getDecision(
    tripId: string,
    decisionId: string,
  ): Promise<Rfc001DecisionRecord | undefined> {
    const rows = await this.prisma.$queryRaw<Array<{ payload: unknown }>>`
      SELECT "payload" FROM "rfc001_decision_records"
      WHERE "trip_id" = ${tripId} AND "decision_id" = ${decisionId}
      LIMIT 1
    `;
    return rows[0]?.payload as Rfc001DecisionRecord | undefined;
  }

  async appendRun(run: Rfc001DecisionRun): Promise<void> {
    await this.prisma.$executeRaw`
      INSERT INTO "rfc001_decision_runs" (
        "run_id", "trip_id", "problem_id", "workspace_id", "decision_id",
        "shadow_mode", "human_decision_required", "created_at"
      ) VALUES (
        ${run.runId}, ${run.tripId}, ${run.problemId}, ${run.workspaceId}, ${run.decisionId},
        ${run.shadowMode}, ${run.humanDecisionRequired}, ${new Date(run.createdAt)}
      )
      ON CONFLICT ("run_id") DO NOTHING
    `;
  }

  async listRuns(tripId: string): Promise<Rfc001DecisionRun[]> {
    const rows = await this.prisma.$queryRaw<
      Array<{
        run_id: string;
        trip_id: string;
        problem_id: string;
        workspace_id: string;
        decision_id: string;
        shadow_mode: boolean;
        human_decision_required: boolean;
        created_at: Date;
      }>
    >`
      SELECT * FROM "rfc001_decision_runs"
      WHERE "trip_id" = ${tripId}
      ORDER BY "created_at" ASC
    `;
    return rows.map((r) => ({
      runId: r.run_id,
      tripId: r.trip_id,
      problemId: r.problem_id,
      workspaceId: r.workspace_id,
      decisionId: r.decision_id,
      shadowMode: r.shadow_mode,
      humanDecisionRequired: r.human_decision_required,
      createdAt: r.created_at.toISOString(),
    }));
  }

  async getRun(tripId: string, runId: string): Promise<Rfc001DecisionRun | undefined> {
    return (await this.listRuns(tripId)).find((r) => r.runId === runId);
  }

  async setDecisionRef(tripId: string, ref: Rfc001DecisionRef): Promise<void> {
    await this.prisma.$executeRaw`
      INSERT INTO "rfc001_decision_refs" (
        "trip_id", "decision_id", "problem_id", "workspace_id", "run_id", "shadow_mode", "updated_at"
      ) VALUES (
        ${tripId}, ${ref.decisionId}, ${ref.problemId}, ${ref.workspaceId}, ${ref.runId},
        ${ref.shadowMode}, ${new Date(ref.updatedAt)}
      )
      ON CONFLICT ("trip_id") DO UPDATE SET
        "decision_id" = EXCLUDED."decision_id",
        "problem_id" = EXCLUDED."problem_id",
        "workspace_id" = EXCLUDED."workspace_id",
        "run_id" = EXCLUDED."run_id",
        "shadow_mode" = EXCLUDED."shadow_mode",
        "updated_at" = EXCLUDED."updated_at"
    `;
  }

  async getDecisionRef(tripId: string): Promise<Rfc001DecisionRef | undefined> {
    const rows = await this.prisma.$queryRaw<
      Array<{
        decision_id: string;
        problem_id: string;
        workspace_id: string;
        run_id: string;
        shadow_mode: boolean;
        updated_at: Date;
      }>
    >`
      SELECT * FROM "rfc001_decision_refs" WHERE "trip_id" = ${tripId} LIMIT 1
    `;
    const r = rows[0];
    if (!r) return undefined;
    return {
      decisionId: r.decision_id,
      problemId: r.problem_id,
      workspaceId: r.workspace_id,
      runId: r.run_id,
      shadowMode: r.shadow_mode,
      updatedAt: r.updated_at.toISOString(),
    };
  }

  async safeUpsertDecision(tripId: string, record: Rfc001DecisionRecord): Promise<void> {
    try {
      await this.upsertDecision(tripId, record);
    } catch (err) {
      this.logger.warn(
        `Decision ledger table upsert failed decisionId=${record.decisionId}: ${
          err instanceof Error ? err.message : String(err)
        }`,
      );
    }
  }

  async safeAppendRun(run: Rfc001DecisionRun): Promise<void> {
    try {
      await this.appendRun(run);
    } catch (err) {
      this.logger.warn(
        `Decision run table append failed runId=${run.runId}: ${
          err instanceof Error ? err.message : String(err)
        }`,
      );
    }
  }

  async safeSetDecisionRef(tripId: string, ref: Rfc001DecisionRef): Promise<void> {
    try {
      await this.setDecisionRef(tripId, ref);
    } catch (err) {
      this.logger.warn(
        `Decision ref table upsert failed tripId=${tripId}: ${
          err instanceof Error ? err.message : String(err)
        }`,
      );
    }
  }
}

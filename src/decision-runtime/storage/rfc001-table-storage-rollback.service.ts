/**
 * P2 — backfill / rollback between Trip.metadata and RFC-001 formal tables.
 *
 * direction:
 * - metadata_to_table: copy metadata → tables (roll-forward / repair dual-write)
 * - table_to_metadata: copy tables → metadata (rollback cutover)
 */

import { Injectable, Logger } from '@nestjs/common';
import { PrismaService } from '../../prisma/prisma.service';
import { toInputJsonValue } from '../../trips/budget-os/utils/prisma-json.util';
import { Rfc001PlanVersionTableRepository } from './rfc001-plan-version.table';
import { Rfc001DecisionLedgerTableRepository } from './rfc001-decision-ledger.table';
import { Rfc001DecisionWorkspaceTableRepository } from './rfc001-decision-workspace.table';
import { Rfc001TableStorageReconcileService } from './rfc001-table-storage-reconcile.service';
import type {
  Rfc001DecisionRef,
  StoredRfc001DecisionLedger,
  StoredRfc001DecisionRuns,
} from '../../trips/guardian-decision-core/persistence/rfc001-decision-ledger.store';
import type { StoredRfc001PlanVersions } from '../../trips/guardian-decision-core/plan-version/plan-version.store';
import type { StoredDecisionWorkspaces } from '../../trips/guardian-decision-core/workspace/decision-workspace.service';

const VERSIONS_KEY = 'rfc001PlanVersions';
const SNAPSHOTS_KEY = 'rfc001PlanSnapshots';
const EXECUTIONS_KEY = 'rfc001PlanVersionExecutions';
const LEDGER_KEY = 'rfc001DecisionLedger';
const RUNS_KEY = 'rfc001DecisionRuns';
const DECISION_REF_KEY = 'rfc001DecisionRef';
const WORKSPACES_KEY = 'rfc001DecisionWorkspaces';

export type Rfc001StorageSyncDirection = 'metadata_to_table' | 'table_to_metadata';

export interface Rfc001StorageSyncResult {
  tripId: string;
  direction: Rfc001StorageSyncDirection;
  planVersionsWritten: number;
  snapshotsWritten: number;
  executionsWritten: number;
  decisionsWritten: number;
  runsWritten: number;
  workspacesWritten: number;
  effectivePointerWritten: boolean;
  decisionRefWritten: boolean;
  error?: string;
}

@Injectable()
export class Rfc001TableStorageRollbackService {
  private readonly logger = new Logger(Rfc001TableStorageRollbackService.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly planVersions: Rfc001PlanVersionTableRepository,
    private readonly ledger: Rfc001DecisionLedgerTableRepository,
    private readonly workspaces: Rfc001DecisionWorkspaceTableRepository,
    private readonly reconcile: Rfc001TableStorageReconcileService,
  ) {}

  async syncTrip(
    tripId: string,
    direction: Rfc001StorageSyncDirection,
  ): Promise<Rfc001StorageSyncResult> {
    if (direction === 'metadata_to_table') {
      return this.metadataToTable(tripId);
    }
    return this.tableToMetadata(tripId);
  }

  async backfillFromMetadata(limit = 50): Promise<{
    total: number;
    ok: number;
    failed: number;
    results: Rfc001StorageSyncResult[];
  }> {
    const tripIds = await this.reconcile.listTripIdsWithRfc001Metadata(limit);
    const results: Rfc001StorageSyncResult[] = [];
    for (const tripId of tripIds) {
      results.push(await this.metadataToTable(tripId));
    }
    return {
      total: results.length,
      ok: results.filter((r) => !r.error).length,
      failed: results.filter((r) => Boolean(r.error)).length,
      results,
    };
  }

  private async metadataToTable(tripId: string): Promise<Rfc001StorageSyncResult> {
    const result = this.emptyResult(tripId, 'metadata_to_table');
    try {
      const meta = await this.readMeta(tripId);
      const versions = (meta[VERSIONS_KEY] as StoredRfc001PlanVersions | undefined)?.items ?? [];
      for (const v of versions) {
        await this.planVersions.upsertVersion({ ...v, tripId });
        result.planVersionsWritten += 1;
      }
      const effective =
        (meta[VERSIONS_KEY] as StoredRfc001PlanVersions | undefined)?.effectivePlanVersionId ??
        versions.find((v) => v.status === 'EFFECTIVE')?.planVersionId;
      if (effective) {
        await this.planVersions.setEffective(tripId, effective);
        result.effectivePointerWritten = true;
      }

      const snapshots =
        (
          meta[SNAPSHOTS_KEY] as
            | { items: Array<{ snapshotRef: string; payload: unknown }> }
            | undefined
        )?.items ?? [];
      for (const s of snapshots) {
        await this.planVersions.saveSnapshot(tripId, s.snapshotRef, s.payload);
        result.snapshotsWritten += 1;
      }

      const executions =
        (
          meta[EXECUTIONS_KEY] as
            | {
                keys: Record<
                  string,
                  { planVersionId: string; decisionId: string; appliedAt: string }
                >;
              }
            | undefined
        )?.keys ?? {};
      for (const [key, entry] of Object.entries(executions)) {
        await this.planVersions.recordExecution(tripId, key, {
          planVersionId: entry.planVersionId,
          decisionId: entry.decisionId,
        });
        result.executionsWritten += 1;
      }

      const decisions =
        (meta[LEDGER_KEY] as StoredRfc001DecisionLedger | undefined)?.items ?? [];
      for (const d of decisions) {
        await this.ledger.upsertDecision(tripId, d);
        result.decisionsWritten += 1;
      }

      const runs = (meta[RUNS_KEY] as StoredRfc001DecisionRuns | undefined)?.items ?? [];
      for (const r of runs) {
        await this.ledger.appendRun(r);
        result.runsWritten += 1;
      }

      const ref = meta[DECISION_REF_KEY] as Rfc001DecisionRef | undefined;
      if (ref) {
        await this.ledger.setDecisionRef(tripId, ref);
        result.decisionRefWritten = true;
      }

      const workspaces =
        (meta[WORKSPACES_KEY] as StoredDecisionWorkspaces | undefined)?.items ?? [];
      for (const w of workspaces) {
        await this.workspaces.upsert(tripId, w);
        result.workspacesWritten += 1;
      }
    } catch (err) {
      result.error = err instanceof Error ? err.message : String(err);
      this.logger.warn(`metadata→table failed tripId=${tripId}: ${result.error}`);
    }
    return result;
  }

  private async tableToMetadata(tripId: string): Promise<Rfc001StorageSyncResult> {
    const result = this.emptyResult(tripId, 'table_to_metadata');
    try {
      const meta = await this.readMeta(tripId);
      const versions = await this.planVersions.listVersions(tripId);
      const effectivePlanVersionId =
        (await this.planVersions.getEffectivePlanVersionId(tripId)) ??
        versions.find((v) => v.status === 'EFFECTIVE')?.planVersionId;
      result.planVersionsWritten = versions.length;
      result.effectivePointerWritten = Boolean(effectivePlanVersionId);

      const snapshots = await this.planVersions.listSnapshots(tripId);
      result.snapshotsWritten = snapshots.length;

      const decisions = await this.ledger.listDecisions(tripId);
      result.decisionsWritten = decisions.length;
      const runs = await this.ledger.listRuns(tripId);
      result.runsWritten = runs.length;
      const ref = await this.ledger.getDecisionRef(tripId);
      result.decisionRefWritten = Boolean(ref);
      const workspaces = await this.workspaces.list(tripId);
      result.workspacesWritten = workspaces.length;

      const next: Record<string, unknown> = {
        ...meta,
        [VERSIONS_KEY]: {
          items: versions,
          effectivePlanVersionId,
          lastUpdatedAt: new Date().toISOString(),
        },
        [SNAPSHOTS_KEY]: { items: snapshots },
        [LEDGER_KEY]: {
          items: decisions,
          lastUpdatedAt: new Date().toISOString(),
        },
        [RUNS_KEY]: {
          items: runs,
          lastUpdatedAt: new Date().toISOString(),
        },
        [WORKSPACES_KEY]: {
          items: workspaces,
          lastUpdatedAt: new Date().toISOString(),
        },
      };
      if (ref) {
        next[DECISION_REF_KEY] = ref;
      }
      await this.prisma.trip.update({
        where: { id: tripId },
        data: { metadata: toInputJsonValue(next) },
      });
    } catch (err) {
      result.error = err instanceof Error ? err.message : String(err);
      this.logger.warn(`table→metadata failed tripId=${tripId}: ${result.error}`);
    }
    return result;
  }

  private emptyResult(
    tripId: string,
    direction: Rfc001StorageSyncDirection,
  ): Rfc001StorageSyncResult {
    return {
      tripId,
      direction,
      planVersionsWritten: 0,
      snapshotsWritten: 0,
      executionsWritten: 0,
      decisionsWritten: 0,
      runsWritten: 0,
      workspacesWritten: 0,
      effectivePointerWritten: false,
      decisionRefWritten: false,
    };
  }

  private async readMeta(tripId: string): Promise<Record<string, unknown>> {
    const trip = await this.prisma.trip.findUnique({
      where: { id: tripId },
      select: { metadata: true },
    });
    return ((trip?.metadata ?? {}) as Record<string, unknown>) ?? {};
  }
}

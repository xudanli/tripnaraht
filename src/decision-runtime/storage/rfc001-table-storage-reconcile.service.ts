/**
 * P2 — reconcile Trip.metadata RFC-001 blocks vs formal tables.
 */

import { Injectable, Logger } from '@nestjs/common';
import { PrismaService } from '../../prisma/prisma.service';
import { Rfc001PlanVersionTableRepository } from './rfc001-plan-version.table';
import { Rfc001DecisionLedgerTableRepository } from './rfc001-decision-ledger.table';
import { Rfc001DecisionWorkspaceTableRepository } from './rfc001-decision-workspace.table';
import type { PlanVersion } from '../../trips/guardian-decision-core/contracts/plan-version.types';
import type { Rfc001DecisionRecord } from '../../trips/guardian-decision-core/contracts/decision-record.types';
import type { DecisionWorkspace } from '../../trips/guardian-decision-core/contracts/decision-workspace.types';
import type {
  Rfc001DecisionRef,
  Rfc001DecisionRun,
  StoredRfc001DecisionLedger,
  StoredRfc001DecisionRuns,
} from '../../trips/guardian-decision-core/persistence/rfc001-decision-ledger.store';
import type { StoredRfc001PlanVersions } from '../../trips/guardian-decision-core/plan-version/plan-version.store';
import type { StoredDecisionWorkspaces } from '../../trips/guardian-decision-core/workspace/decision-workspace.service';
import { resolveRfc001TableStorageMode } from './p2-rfc001-table-storage.config';

const VERSIONS_KEY = 'rfc001PlanVersions';
const LEDGER_KEY = 'rfc001DecisionLedger';
const RUNS_KEY = 'rfc001DecisionRuns';
const DECISION_REF_KEY = 'rfc001DecisionRef';
const WORKSPACES_KEY = 'rfc001DecisionWorkspaces';

export type Rfc001StorageDomain =
  | 'planVersions'
  | 'effectivePointer'
  | 'decisions'
  | 'runs'
  | 'decisionRef'
  | 'workspaces';

export interface Rfc001DomainDrift {
  domain: Rfc001StorageDomain;
  matched: boolean;
  metadataCount: number;
  tableCount: number;
  onlyInMetadata: string[];
  onlyInTable: string[];
  payloadMismatchIds: string[];
  detail?: string;
}

export interface Rfc001TripStorageReconcileReport {
  tripId: string;
  mode: string;
  allMatched: boolean;
  domains: Rfc001DomainDrift[];
  error?: string;
}

@Injectable()
export class Rfc001TableStorageReconcileService {
  private readonly logger = new Logger(Rfc001TableStorageReconcileService.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly planVersions: Rfc001PlanVersionTableRepository,
    private readonly ledger: Rfc001DecisionLedgerTableRepository,
    private readonly workspaces: Rfc001DecisionWorkspaceTableRepository,
  ) {}

  async reconcileTrip(tripId: string): Promise<Rfc001TripStorageReconcileReport> {
    const mode = resolveRfc001TableStorageMode();
    try {
      const meta = await this.readMeta(tripId);
      const domains: Rfc001DomainDrift[] = [
        await this.comparePlanVersions(tripId, meta),
        await this.compareEffectivePointer(tripId, meta),
        await this.compareDecisions(tripId, meta),
        await this.compareRuns(tripId, meta),
        await this.compareDecisionRef(tripId, meta),
        await this.compareWorkspaces(tripId, meta),
      ];
      return {
        tripId,
        mode,
        allMatched: domains.every((d) => d.matched),
        domains,
      };
    } catch (err) {
      const message = err instanceof Error ? err.message : String(err);
      this.logger.warn(`Reconcile failed tripId=${tripId}: ${message}`);
      return {
        tripId,
        mode,
        allMatched: false,
        domains: [],
        error: message,
      };
    }
  }

  /**
   * Scan trips that already carry RFC-001 metadata keys (capped).
   */
  async reconcileTripsWithMetadata(limit = 50): Promise<{
    scanned: number;
    matched: number;
    mismatched: number;
    errors: number;
    reports: Rfc001TripStorageReconcileReport[];
  }> {
    const tripIds = await this.listTripIdsWithRfc001Metadata(limit);
    const reports: Rfc001TripStorageReconcileReport[] = [];
    for (const tripId of tripIds) {
      reports.push(await this.reconcileTrip(tripId));
    }
    return {
      scanned: reports.length,
      matched: reports.filter((r) => r.allMatched && !r.error).length,
      mismatched: reports.filter((r) => !r.allMatched && !r.error).length,
      errors: reports.filter((r) => Boolean(r.error)).length,
      reports,
    };
  }

  async listTripIdsWithRfc001Metadata(limit = 50): Promise<string[]> {
    const rows = await this.prisma.$queryRaw<Array<{ id: string }>>`
      SELECT "id" FROM "Trip"
      WHERE "metadata" ? 'rfc001PlanVersions'
         OR "metadata" ? 'rfc001DecisionLedger'
         OR "metadata" ? 'rfc001DecisionWorkspaces'
         OR "metadata" ? 'rfc001DecisionRuns'
         OR "metadata" ? 'rfc001DecisionRef'
      ORDER BY "updatedAt" DESC
      LIMIT ${limit}
    `;
    return rows.map((r) => r.id);
  }

  private async comparePlanVersions(
    tripId: string,
    meta: Record<string, unknown>,
  ): Promise<Rfc001DomainDrift> {
    const block = meta[VERSIONS_KEY] as StoredRfc001PlanVersions | undefined;
    const metaItems = block?.items ?? [];
    let tableItems: PlanVersion[] = [];
    try {
      tableItems = await this.planVersions.listVersions(tripId);
    } catch (err) {
      return this.tableUnavailable('planVersions', metaItems.length, err);
    }
    return this.diffById(
      'planVersions',
      metaItems.map((v) => v.planVersionId),
      tableItems.map((v) => v.planVersionId),
      metaItems,
      tableItems,
      (a, b) =>
        a.planVersionId === (b as PlanVersion).planVersionId &&
        a.status === (b as PlanVersion).status &&
        a.sourceDecisionId === (b as PlanVersion).sourceDecisionId,
    );
  }

  private async compareEffectivePointer(
    tripId: string,
    meta: Record<string, unknown>,
  ): Promise<Rfc001DomainDrift> {
    const block = meta[VERSIONS_KEY] as StoredRfc001PlanVersions | undefined;
    const metaEff =
      block?.effectivePlanVersionId ??
      block?.items?.find((v) => v.status === 'EFFECTIVE')?.planVersionId;
    let tableEff: string | undefined;
    try {
      tableEff = await this.planVersions.getEffectivePlanVersionId(tripId);
    } catch (err) {
      return this.tableUnavailable('effectivePointer', metaEff ? 1 : 0, err);
    }
    const matched = (metaEff ?? null) === (tableEff ?? null);
    return {
      domain: 'effectivePointer',
      matched,
      metadataCount: metaEff ? 1 : 0,
      tableCount: tableEff ? 1 : 0,
      onlyInMetadata: metaEff && !tableEff ? [metaEff] : [],
      onlyInTable: tableEff && !metaEff ? [tableEff] : [],
      payloadMismatchIds:
        metaEff && tableEff && metaEff !== tableEff ? [metaEff, tableEff] : [],
      detail: `metadata=${metaEff ?? 'none'} table=${tableEff ?? 'none'}`,
    };
  }

  private async compareDecisions(
    tripId: string,
    meta: Record<string, unknown>,
  ): Promise<Rfc001DomainDrift> {
    const block = meta[LEDGER_KEY] as StoredRfc001DecisionLedger | undefined;
    const metaItems = block?.items ?? [];
    let tableItems: Rfc001DecisionRecord[] = [];
    try {
      tableItems = await this.ledger.listDecisions(tripId);
    } catch (err) {
      return this.tableUnavailable('decisions', metaItems.length, err);
    }
    return this.diffById(
      'decisions',
      metaItems.map((d) => d.decisionId),
      tableItems.map((d) => d.decisionId),
      metaItems,
      tableItems,
      (a, b) =>
        a.decisionId === (b as Rfc001DecisionRecord).decisionId &&
        a.recordStatus === (b as Rfc001DecisionRecord).recordStatus &&
        a.finalAction === (b as Rfc001DecisionRecord).finalAction,
    );
  }

  private async compareRuns(
    tripId: string,
    meta: Record<string, unknown>,
  ): Promise<Rfc001DomainDrift> {
    const block = meta[RUNS_KEY] as StoredRfc001DecisionRuns | undefined;
    const metaItems = block?.items ?? [];
    let tableItems: Rfc001DecisionRun[] = [];
    try {
      tableItems = await this.ledger.listRuns(tripId);
    } catch (err) {
      return this.tableUnavailable('runs', metaItems.length, err);
    }
    return this.diffById(
      'runs',
      metaItems.map((r) => r.runId),
      tableItems.map((r) => r.runId),
      metaItems,
      tableItems,
      (a, b) =>
        a.runId === (b as Rfc001DecisionRun).runId &&
        a.decisionId === (b as Rfc001DecisionRun).decisionId,
    );
  }

  private async compareDecisionRef(
    tripId: string,
    meta: Record<string, unknown>,
  ): Promise<Rfc001DomainDrift> {
    const metaRef = meta[DECISION_REF_KEY] as Rfc001DecisionRef | undefined;
    let tableRef: Rfc001DecisionRef | undefined;
    try {
      tableRef = await this.ledger.getDecisionRef(tripId);
    } catch (err) {
      return this.tableUnavailable('decisionRef', metaRef ? 1 : 0, err);
    }
    const matched =
      (metaRef?.decisionId ?? null) === (tableRef?.decisionId ?? null) &&
      (metaRef?.runId ?? null) === (tableRef?.runId ?? null);
    return {
      domain: 'decisionRef',
      matched,
      metadataCount: metaRef ? 1 : 0,
      tableCount: tableRef ? 1 : 0,
      onlyInMetadata: metaRef && !tableRef ? [metaRef.decisionId] : [],
      onlyInTable: tableRef && !metaRef ? [tableRef.decisionId] : [],
      payloadMismatchIds:
        metaRef && tableRef && !matched
          ? [metaRef.decisionId, tableRef.decisionId]
          : [],
    };
  }

  private async compareWorkspaces(
    tripId: string,
    meta: Record<string, unknown>,
  ): Promise<Rfc001DomainDrift> {
    const block = meta[WORKSPACES_KEY] as StoredDecisionWorkspaces | undefined;
    const metaItems = block?.items ?? [];
    let tableItems: DecisionWorkspace[] = [];
    try {
      tableItems = await this.workspaces.list(tripId);
    } catch (err) {
      return this.tableUnavailable('workspaces', metaItems.length, err);
    }
    return this.diffById(
      'workspaces',
      metaItems.map((w) => w.workspaceId),
      tableItems.map((w) => w.workspaceId),
      metaItems,
      tableItems,
      (a, b) =>
        a.workspaceId === (b as DecisionWorkspace).workspaceId &&
        a.status === (b as DecisionWorkspace).status &&
        a.revision === (b as DecisionWorkspace).revision,
    );
  }

  private diffById<T extends object>(
    domain: Rfc001StorageDomain,
    metaIds: string[],
    tableIds: string[],
    metaItems: T[],
    tableItems: T[],
    same: (meta: T, table: T) => boolean,
  ): Rfc001DomainDrift {
    const metaSet = new Set(metaIds);
    const tableSet = new Set(tableIds);
    const onlyInMetadata = metaIds.filter((id) => !tableSet.has(id));
    const onlyInTable = tableIds.filter((id) => !metaSet.has(id));
    const payloadMismatchIds: string[] = [];
    const tableById = new Map(tableIds.map((id, i) => [id, tableItems[i]]));
    for (let i = 0; i < metaIds.length; i++) {
      const id = metaIds[i];
      const tableItem = tableById.get(id);
      if (tableItem && !same(metaItems[i], tableItem)) {
        payloadMismatchIds.push(id);
      }
    }
    return {
      domain,
      matched:
        onlyInMetadata.length === 0 &&
        onlyInTable.length === 0 &&
        payloadMismatchIds.length === 0,
      metadataCount: metaIds.length,
      tableCount: tableIds.length,
      onlyInMetadata,
      onlyInTable,
      payloadMismatchIds,
    };
  }

  private tableUnavailable(
    domain: Rfc001StorageDomain,
    metadataCount: number,
    err: unknown,
  ): Rfc001DomainDrift {
    return {
      domain,
      matched: false,
      metadataCount,
      tableCount: 0,
      onlyInMetadata: [],
      onlyInTable: [],
      payloadMismatchIds: [],
      detail: `table unavailable: ${err instanceof Error ? err.message : String(err)}`,
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

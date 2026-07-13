import { Injectable } from '@nestjs/common';
import { randomUUID } from 'crypto';
import { PrismaService } from '../../../prisma/prisma.service';
import { toInputJsonValue } from '../../budget-os/utils/prisma-json.util';
import { Rfc001PlanVersionStoreService } from '../../guardian-decision-core/plan-version/plan-version.store';
import type { PlanVersion } from '../../guardian-decision-core/contracts/plan-version.types';
import type {
  CanonicalPlanVersionWriter,
  CreatedPlanVersion,
  DecisionLedgerEntry,
  DecisionLedgerReference,
  DecisionLedgerWriter,
  PlanDiff,
} from '../../../generated/execution-risk-contracts';
import {
  buildErcPlanVersionId,
  planDiffToPlanOperations,
} from '../utils/execution-risk-plan-diff-to-operations.util';

const ERC_LEDGER_KEY = 'executionRiskConfirmLedger';
const MAX_LEDGER_ENTRIES = 100;

interface StoredErcConfirmLedger {
  items: DecisionLedgerEntry[];
  lastUpdatedAt?: string;
}

@Injectable()
export class Rfc001ExecutionRiskWriteAdapter
  implements CanonicalPlanVersionWriter, DecisionLedgerWriter
{
  constructor(
    private readonly planVersionStore: Rfc001PlanVersionStoreService,
    private readonly prisma: PrismaService,
  ) {}

  async createFromConfirmedRecommendation(input: {
    tripId: string;
    basePlanVersionId: string;
    recommendationId: string;
    planDiff: PlanDiff;
    decisionId: string;
    idempotencyKey: string;
  }): Promise<CreatedPlanVersion> {
    const existing = await this.planVersionStore.getExecution(
      input.tripId,
      input.idempotencyKey,
    );
    if (existing) {
      return {
        planVersionId: existing.planVersionId,
        basePlanVersionId: input.basePlanVersionId,
        createdAt: existing.appliedAt,
      };
    }

    const parentId =
      (await this.planVersionStore.getEffectivePlanVersionId(input.tripId)) ??
      input.basePlanVersionId;

    const planVersionId = input.planDiff.afterPlanVersionId.startsWith('pv_preview_')
      ? buildErcPlanVersionId(input.tripId, input.decisionId)
      : input.planDiff.afterPlanVersionId;

    const version: PlanVersion = {
      planVersionId,
      tripId: input.tripId,
      parentPlanVersionId: parentId,
      createdBy: 'DECISION_CORE',
      sourceDecisionId: input.decisionId,
      operations: planDiffToPlanOperations(input.planDiff),
      materializedPlanSnapshotRef: `erc_snap_${planVersionId}`,
      status: 'PENDING_AUTHORIZATION',
      createdAt: new Date().toISOString(),
    };

    await this.planVersionStore.upsert(input.tripId, version);
    await this.planVersionStore.recordExecution(input.tripId, input.idempotencyKey, {
      planVersionId,
      decisionId: input.decisionId,
    });

    return {
      planVersionId,
      basePlanVersionId: parentId,
      createdAt: version.createdAt,
    };
  }

  async append(entry: DecisionLedgerEntry): Promise<DecisionLedgerReference> {
    const trip = await this.prisma.trip.findUnique({
      where: { id: entry.tripId },
      select: { metadata: true },
    });
    const meta = ((trip?.metadata ?? {}) as Record<string, unknown>) ?? {};
    const block = (meta[ERC_LEDGER_KEY] as StoredErcConfirmLedger | undefined) ?? { items: [] };
    const items = [...block.items, entry].slice(-MAX_LEDGER_ENTRIES);

    await this.prisma.trip.update({
      where: { id: entry.tripId },
      data: {
        metadata: toInputJsonValue({
          ...meta,
          [ERC_LEDGER_KEY]: {
            items,
            lastUpdatedAt: new Date().toISOString(),
          },
        }),
      },
    });

    return {
      ledgerRef: `erc_ledger_${entry.tripId}_${entry.entryId}`,
      entryId: entry.entryId,
    };
  }
}

export class InMemoryPlanVersionWriter implements CanonicalPlanVersionWriter {
  async createFromConfirmedRecommendation(input: {
    tripId: string;
    basePlanVersionId: string;
    recommendationId: string;
    planDiff: PlanDiff;
    decisionId: string;
    idempotencyKey: string;
  }): Promise<CreatedPlanVersion> {
    return {
      planVersionId: `pv_${input.tripId}_${randomUUID().slice(0, 8)}`,
      basePlanVersionId: input.basePlanVersionId,
      createdAt: new Date().toISOString(),
    };
  }
}

export class InMemoryDecisionLedgerWriter implements DecisionLedgerWriter {
  async append(entry: DecisionLedgerEntry): Promise<DecisionLedgerReference> {
    return {
      ledgerRef: `ledger_${entry.tripId}_${entry.entryId}`,
      entryId: entry.entryId,
    };
  }
}

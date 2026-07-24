import { Injectable, Optional } from '@nestjs/common';
import { randomUUID } from 'crypto';
import type {
  CanonicalPlanVersionWriter,
  DecisionLedgerWriter,
  PlanDiff,
} from '../../../generated/execution-risk-contracts';
import { Rfc001PlanVersionStoreService } from '../../guardian-decision-core/plan-version/plan-version.store';
import { PrismaService } from '../../../prisma/prisma.service';
import { buildAutomationBoundaryLedgerPayload } from '../utils/execution-risk-automation-boundary.util';
import { assertPlanVersionNotStale } from '../utils/execution-risk-plan-version-guard.util';
import type { ConfirmWriteResult } from './execution-risk-confirm-write.service';
import { ExecutionRiskPlanVersionActivateService } from './execution-risk-plan-version-activate.service';
import { ActiveRiskRefreshService } from './active-risk-refresh.service';
import { isExecutionRiskPostConfirmRefreshEnabled } from '../config/execution-risk-feature-flags.util';

export interface ConfirmTransactionInput {
  tripId: string;
  riskId: string;
  recommendationId: string;
  userId: string;
  planDiff: PlanDiff;
  decisionProblemId?: string;
  idempotencyKey: string;
  actionCodes?: string[];
  expectedPlanVersionId?: string;
  planWriter: CanonicalPlanVersionWriter;
  ledgerWriter: DecisionLedgerWriter;
  usesRfc001Adapter: boolean;
}

@Injectable()
export class ExecutionRiskConfirmTransactionService {
  constructor(
    @Optional() private readonly planVersionStore?: Rfc001PlanVersionStoreService,
    @Optional() private readonly planActivator?: ExecutionRiskPlanVersionActivateService,
    @Optional() private readonly activeRiskRefresh?: ActiveRiskRefreshService,
    @Optional() private readonly prisma?: PrismaService,
  ) {}

  async commit(input: ConfirmTransactionInput): Promise<ConfirmWriteResult> {
    const decisionId = input.decisionProblemId ?? `erc_decision_${input.riskId}`;
    const currentEffective = this.planVersionStore
      ? await this.planVersionStore.getEffectivePlanVersionId(input.tripId)
      : undefined;

    assertPlanVersionNotStale({
      expectedPlanVersionId: input.expectedPlanVersionId ?? input.planDiff.beforePlanVersionId,
      planDiffBeforePlanVersionId: input.planDiff.beforePlanVersionId,
      currentEffectivePlanVersionId: currentEffective,
    });

    let createdPlanVersionId: string | undefined;
    try {
      const planDiffForWriter = input.usesRfc001Adapter
        ? input.planDiff
        : {
            ...input.planDiff,
            afterPlanVersionId: input.planDiff.afterPlanVersionId.startsWith('pv_preview_')
              ? `pv_${input.tripId}_${randomUUID().slice(0, 8)}`
              : input.planDiff.afterPlanVersionId,
          };

      const created = await input.planWriter.createFromConfirmedRecommendation({
        tripId: input.tripId,
        basePlanVersionId: input.planDiff.beforePlanVersionId,
        recommendationId: input.recommendationId,
        planDiff: planDiffForWriter,
        decisionId,
        idempotencyKey: input.idempotencyKey,
      });
      createdPlanVersionId = created.planVersionId;

      const ledger = await input.ledgerWriter.append({
        entryId: randomUUID(),
        tripId: input.tripId,
        decisionId,
        recommendationId: input.recommendationId,
        planVersionId: created.planVersionId,
        recordedAt: new Date().toISOString(),
        recordedBy: input.userId,
        payload: {
          riskId: input.riskId,
          idempotencyKey: input.idempotencyKey,
          writer: input.usesRfc001Adapter
            ? 'ExecutionRiskConfirmTransactionService'
            : 'ExecutionRiskConfirmWriteService',
          ...buildAutomationBoundaryLedgerPayload({
            actionCodes: input.actionCodes ?? [],
            userConfirmed: true,
          }),
        },
      });

      const activation = await this.planActivator?.activateAfterConfirm({
        tripId: input.tripId,
        planVersionId: created.planVersionId,
        planDiff: input.planDiff,
        decisionId,
        idempotencyKey: input.idempotencyKey,
      });

      let riskRefreshSnapshotId: string | undefined;
      if (isExecutionRiskPostConfirmRefreshEnabled() && this.activeRiskRefresh) {
        const refreshed = await this.activeRiskRefresh.refreshAfterPlanConfirm({
          tripId: input.tripId,
          userId: input.userId,
          planVersionId: activation?.effectivePlanVersionId ?? created.planVersionId,
          decisionId,
          riskId: input.riskId,
        });
        riskRefreshSnapshotId = refreshed?.snapshotId;
      }

      return {
        newPlanVersionId: created.planVersionId,
        ledgerRef: ledger.ledgerRef,
        basePlanVersionId: created.basePlanVersionId,
        effectivePlanVersionId: activation?.effectivePlanVersionId,
        planActivated: activation?.activated,
        itineraryMaterialized: activation?.itineraryMaterialized,
        riskRefreshSnapshotId,
      };
    } catch (error) {
      await this.rollbackPartialCommit({
        tripId: input.tripId,
        decisionId: input.usesRfc001Adapter ? decisionId : undefined,
        planVersionId: createdPlanVersionId,
      });
      throw error;
    }
  }

  private async rollbackPartialCommit(input: {
    tripId: string;
    decisionId?: string;
    planVersionId?: string;
  }): Promise<void> {
    if (input.planVersionId && this.planVersionStore) {
      const version = await this.planVersionStore.get(input.tripId, input.planVersionId);
      if (version && version.status === 'PENDING_AUTHORIZATION') {
        await this.planVersionStore.upsert(input.tripId, {
          ...version,
          status: 'REJECTED',
        });
      }
    }
  }
}

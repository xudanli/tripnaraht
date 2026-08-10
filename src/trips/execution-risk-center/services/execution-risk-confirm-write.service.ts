import { Injectable, Optional } from '@nestjs/common';
import { randomUUID } from 'crypto';
import type { PlanDiff } from '../../../generated/execution-risk-contracts';
import {
  isExecutionRiskConfirmWriteEnabled,
  isExecutionRiskRfc001WriteAdapterEnabled,
} from '../config/execution-risk-feature-flags.util';
import { isExecutionRiskWriteAllowlisted } from '../config/execution-risk-write-allowlist.util';
import { buildAutomationBoundaryLedgerPayload } from '../utils/execution-risk-automation-boundary.util';
import { ExecutionRiskConfirmTransactionService } from './execution-risk-confirm-transaction.service';
import {
  InMemoryDecisionLedgerWriter,
  InMemoryPlanVersionWriter,
  Rfc001ExecutionRiskWriteAdapter,
} from '../adapters/rfc001-execution-risk-write.adapter';
import { ExecutionRiskPlanVersionActivateService } from './execution-risk-plan-version-activate.service';
import type {
  CanonicalPlanVersionWriter,
  DecisionLedgerWriter,
} from '../../../generated/execution-risk-contracts';

export interface ConfirmWriteResult {
  newPlanVersionId: string;
  ledgerRef: string;
  basePlanVersionId: string;
  effectivePlanVersionId?: string;
  planActivated?: boolean;
  itineraryMaterialized?: boolean;
  riskRefreshSnapshotId?: string;
}

@Injectable()
export class ExecutionRiskConfirmWriteService {
  private readonly planWriter: CanonicalPlanVersionWriter;
  private readonly ledgerWriter: DecisionLedgerWriter;

  constructor(
    @Optional() private readonly rfc001Adapter?: Rfc001ExecutionRiskWriteAdapter,
    @Optional() private readonly planActivator?: ExecutionRiskPlanVersionActivateService,
    @Optional() private readonly confirmTransaction?: ExecutionRiskConfirmTransactionService,
  ) {
    const useRfc001 = isExecutionRiskRfc001WriteAdapterEnabled() && Boolean(this.rfc001Adapter);
    if (useRfc001) {
      this.planWriter = this.rfc001Adapter!;
      this.ledgerWriter = this.rfc001Adapter!;
    } else {
      this.planWriter = new InMemoryPlanVersionWriter();
      this.ledgerWriter = new InMemoryDecisionLedgerWriter();
    }
  }

  isWriteEnabled(): boolean {
    return isExecutionRiskConfirmWriteEnabled();
  }

  usesRfc001Adapter(): boolean {
    return isExecutionRiskRfc001WriteAdapterEnabled() && Boolean(this.rfc001Adapter);
  }

  async commitConfirmedRecommendation(input: {
    tripId: string;
    riskId: string;
    recommendationId: string;
    userId: string;
    planDiff: PlanDiff;
    decisionProblemId?: string;
    idempotencyKey: string;
    actionCodes?: string[];
    riskCode?: string;
    expectedPlanVersionId?: string;
  }): Promise<ConfirmWriteResult | null> {
    if (!this.isWriteEnabled()) return null;

    // Agent Harness P0-1 W3 / C10：确认写是 AE 入口，禁止 assertDirect 误挡（物化走 Rfc001 runWithAuthority）

    if (
      !isExecutionRiskWriteAllowlisted({
        tripId: input.tripId,
        userId: input.userId,
        riskCode: input.riskCode,
      })
    ) {
      return null;
    }

    if (this.confirmTransaction) {
      return this.confirmTransaction.commit({
        ...input,
        planWriter: this.planWriter,
        ledgerWriter: this.ledgerWriter,
        usesRfc001Adapter: this.usesRfc001Adapter(),
      });
    }

    const decisionId = input.decisionProblemId ?? `erc_decision_${input.riskId}`;
    const planDiffForWriter = this.usesRfc001Adapter()
      ? input.planDiff
      : {
          ...input.planDiff,
          afterPlanVersionId: input.planDiff.afterPlanVersionId.startsWith('pv_preview_')
            ? `pv_${input.tripId}_${randomUUID().slice(0, 8)}`
            : input.planDiff.afterPlanVersionId,
        };

    const created = await this.planWriter.createFromConfirmedRecommendation({
      tripId: input.tripId,
      basePlanVersionId: input.planDiff.beforePlanVersionId,
      recommendationId: input.recommendationId,
      planDiff: planDiffForWriter,
      decisionId,
      idempotencyKey: input.idempotencyKey,
    });

    const ledger = await this.ledgerWriter.append({
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
        writer: this.usesRfc001Adapter()
          ? 'Rfc001ExecutionRiskWriteAdapter'
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

    return {
      newPlanVersionId: created.planVersionId,
      ledgerRef: ledger.ledgerRef,
      basePlanVersionId: created.basePlanVersionId,
      effectivePlanVersionId: activation?.effectivePlanVersionId,
      planActivated: activation?.activated,
      itineraryMaterialized: activation?.itineraryMaterialized,
    };
  }
}

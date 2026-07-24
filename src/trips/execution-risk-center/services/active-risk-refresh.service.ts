import { Injectable } from '@nestjs/common';
import { randomUUID } from 'crypto';
import { PrismaService } from '../../../prisma/prisma.service';
import { toInputJsonValue } from '../../budget-os/utils/prisma-json.util';
import {
  RiskRefreshTriggerType,
  type ActiveRiskRefreshService as ActiveRiskRefreshPort,
  type RiskRefreshResult,
} from '../../../generated/execution-risk-contracts';
import { ActiveRiskAggregationService } from './active-risk-aggregation.service';
import { buildExecutionRiskClusters } from '../utils/execution-risk-cluster.util';
import { isExecutionRiskPostConfirmRefreshEnabled } from '../config/execution-risk-feature-flags.util';
import {
  EXECUTION_RISK_ACTIVE_SNAPSHOT_KEY,
  type ExecutionRiskActiveSnapshot,
} from '../knowledge/active-risk-snapshot.types';

@Injectable()
export class ActiveRiskRefreshService implements ActiveRiskRefreshPort {
  constructor(
    private readonly aggregation: ActiveRiskAggregationService,
    private readonly prisma: PrismaService,
  ) {}

  async refresh(input: {
    tripId: string;
    triggerType: RiskRefreshTriggerType;
    triggerRef?: string;
    expectedPlanVersionId?: string;
    refreshedBy?: string;
  }): Promise<RiskRefreshResult> {
    const userId = input.refreshedBy ?? 'system:execution-risk-refresh';
    const activeRisks = await this.aggregation.snapshotActiveRisks(input.tripId, userId);
    const clusters = buildExecutionRiskClusters(activeRisks);
    const planVersionId = input.expectedPlanVersionId ?? `pv_${input.tripId}_current`;
    const refreshedAt = new Date().toISOString();
    const snapshotId = `ers_${randomUUID().slice(0, 12)}`;

    const snapshot: ExecutionRiskActiveSnapshot = {
      snapshotId,
      tripId: input.tripId,
      planVersionId,
      refreshedAt,
      triggerType: input.triggerType,
      triggerRef: input.triggerRef,
      activeRiskCount: activeRisks.length,
      clusterCount: clusters.length,
      activeRisks,
    };

    const trip = await this.prisma.trip.findUnique({
      where: { id: input.tripId },
      select: { metadata: true },
    });
    const meta = { ...((trip?.metadata ?? {}) as Record<string, unknown>) };
    meta[EXECUTION_RISK_ACTIVE_SNAPSHOT_KEY] = snapshot;

    await this.prisma.trip.update({
      where: { id: input.tripId },
      data: { metadata: toInputJsonValue(meta) },
    });

    return {
      tripId: input.tripId,
      snapshotId,
      planVersionId,
      refreshedAt,
      activeRiskCount: activeRisks.length,
      clusterCount: clusters.length,
    };
  }

  async refreshAfterPlanConfirm(input: {
    tripId: string;
    userId: string;
    planVersionId: string;
    decisionId: string;
    riskId?: string;
  }): Promise<RiskRefreshResult | null> {
    if (!isExecutionRiskPostConfirmRefreshEnabled()) return null;
    return this.refresh({
      tripId: input.tripId,
      triggerType: RiskRefreshTriggerType.PLAN_VERSION_CHANGED,
      triggerRef: input.decisionId,
      expectedPlanVersionId: input.planVersionId,
      refreshedBy: input.userId,
    });
  }
}

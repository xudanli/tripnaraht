import { Injectable } from '@nestjs/common';
import { PrismaService } from '../../../prisma/prisma.service';
import type {
  ActiveRisk as ContractActiveRisk,
  ActiveRiskQueryService as ActiveRiskQueryPort,
} from '../../../generated/execution-risk-contracts';
import { readExecutionRiskActiveSnapshot } from '../knowledge/active-risk-snapshot.types';
import { ActiveRiskAggregationService } from './active-risk-aggregation.service';
import { isExecutionRiskSnapshotQueryEnabled } from '../config/execution-risk-feature-flags.util';

@Injectable()
export class ActiveRiskQueryService implements ActiveRiskQueryPort {
  constructor(
    private readonly prisma: PrismaService,
    private readonly aggregation: ActiveRiskAggregationService,
  ) {}

  async listCurrentRisks(
    tripId: string,
    opts?: { planVersionId?: string },
  ): Promise<ContractActiveRisk[]> {
    if (isExecutionRiskSnapshotQueryEnabled()) {
      const trip = await this.prisma.trip.findUnique({
        where: { id: tripId },
        select: { metadata: true },
      });
      const snapshot = readExecutionRiskActiveSnapshot(
        (trip?.metadata ?? {}) as Record<string, unknown>,
      );
      if (snapshot) {
        if (opts?.planVersionId && snapshot.planVersionId !== opts.planVersionId) {
          return [];
        }
        return snapshot.activeRisks as unknown as ContractActiveRisk[];
      }
    }

    const risks = await this.aggregation.snapshotActiveRisks(
      tripId,
      'system:active-risk-query',
    );
    return risks as unknown as ContractActiveRisk[];
  }
}

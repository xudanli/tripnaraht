/**
 * Admin 旅行决策合同只读投影：复用约束控制台 SSOT，不校验行程成员。
 * 默认轻量读（跳过 planning-conflicts / 风险聚合），避免 Admin 详情页被可行性重算拖死。
 */

import { Injectable, NotFoundException } from '@nestjs/common';
import { PrismaService } from '../../prisma/prisma.service';
import { TripConstraintRegistryService } from '../trip-constraint-solver/services/trip-constraint-registry.service';
import type { ListTripConstraintsQueryDto } from '../trip-constraint-solver/dto/trip-constraint.dto';
import {
  ADMIN_TRIP_DECISION_CONTRACT_SCHEMA_ID,
  type AdminTripDecisionContractView,
} from '../dto/admin-trip-decision-contract.dto';

@Injectable()
export class AdminTripDecisionContractService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly registry: TripConstraintRegistryService,
  ) {}

  async getDecisionContract(
    tripId: string,
    query: ListTripConstraintsQueryDto = {},
  ): Promise<AdminTripDecisionContractView> {
    const trip = await this.prisma.trip.findUnique({
      where: { id: tripId },
      include: {
        TripCollaborator: { select: { userId: true, role: true } },
      },
    });

    if (!trip) {
      throw new NotFoundException(`行程 ID ${tripId} 不存在`);
    }

    const contextUserId =
      trip.TripCollaborator.find((c) => c.role === 'OWNER')?.userId ??
      trip.TripCollaborator[0]?.userId ??
      null;

    const { meta, items, contract } = await this.registry.listLightweight(
      tripId,
      contextUserId ?? 'admin-readonly',
      query,
    );

    return {
      schemaId: ADMIN_TRIP_DECISION_CONTRACT_SCHEMA_ID,
      tripId,
      capturedAt: new Date().toISOString(),
      contextUserId,
      degraded: {
        planningConflictsSkipped: true,
        riskActivationSkipped: true,
      },
      meta,
      items,
      contract,
    };
  }
}

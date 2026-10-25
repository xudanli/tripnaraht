/**
 * Admin 行程旅行决策合同投影 — 与 GET /trips/:tripId/constraints 同构，免成员校验。
 * schemaId: tripnara.admin_trip_decision_contract@v1
 */

import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import type {
  TripConstraint,
  TripConstraintsListMeta,
} from '../trip-constraint-solver/types/trip-constraint.types';
import type { TravelDecisionContract } from '../trip-constraint-solver/types/travel-decision-contract.types';

export const ADMIN_TRIP_DECISION_CONTRACT_SCHEMA_ID =
  'tripnara.admin_trip_decision_contract@v1' as const;

export interface AdminTripDecisionContractDegraded {
  /** 未跑 planning-conflicts / 可行性重算 */
  planningConflictsSkipped: boolean;
  /** 未聚合执行风险绑定的约束激活 */
  riskActivationSkipped: boolean;
}

export interface AdminTripDecisionContractView {
  schemaId: typeof ADMIN_TRIP_DECISION_CONTRACT_SCHEMA_ID;
  tripId: string;
  capturedAt: string;
  /** 组装愿望/风险上下文时使用的用户（优先 OWNER） */
  contextUserId: string | null;
  /** 轻量读降级说明（Admin 默认跳过慢路径） */
  degraded: AdminTripDecisionContractDegraded;
  meta: TripConstraintsListMeta;
  items: TripConstraint[];
  contract: TravelDecisionContract;
}

export class AdminTripDecisionContractResponseDto {
  @ApiProperty({ example: ADMIN_TRIP_DECISION_CONTRACT_SCHEMA_ID })
  schemaId!: typeof ADMIN_TRIP_DECISION_CONTRACT_SCHEMA_ID;

  @ApiProperty()
  tripId!: string;

  @ApiProperty({ description: 'ISO 捕获时间' })
  capturedAt!: string;

  @ApiPropertyOptional({
    nullable: true,
    description: '愿望/风险上下文用户（优先 OWNER）；无协作者时为 null',
  })
  contextUserId!: string | null;

  @ApiProperty({
    description: '降级标记：默认跳过 planning-conflicts 与风险聚合以保证可读延迟',
  })
  degraded!: AdminTripDecisionContractDegraded;

  @ApiProperty({ description: '与 GET /trips/:tripId/constraints 的 meta 同构（含 7+2 sections）' })
  meta!: TripConstraintsListMeta;

  @ApiProperty({ description: '约束卡片列表', type: 'array' })
  items!: TripConstraint[];

  @ApiProperty({
    description: '旅行决策合同 SSOT（schemaId: tripnara.travel_decision_contract@v1）',
  })
  contract!: TravelDecisionContract;
}

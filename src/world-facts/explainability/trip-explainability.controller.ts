import { Controller, Get, Param } from '@nestjs/common';
import { ApiOperation, ApiTags } from '@nestjs/swagger';
import { Public } from '../../auth/decorators/public.decorator';
import { successResponse } from '../../common/dto/standard-response.dto';
import { TripExplainabilityService } from './trip-explainability.service';

/**
 * 行程级 Explainability（聚合视图，非 history 原始导出）。
 * 上线前应鉴权 + 限流；仅 trip 成员或管理员可调。
 */
@ApiTags('trips-explainability')
@Public()
@Controller('trips')
export class TripExplainabilityController {
  constructor(private readonly tripExplainability: TripExplainabilityService) {}

  @Get(':tripId/explainability')
  @ApiOperation({
    summary: '行程决策因子摘要（WorldFact Resolver 聚合）',
    description:
      '返回人类可读的因果因子与 derivedFromFactIds；不包含 Planner/Gate 推理，不含原始 fact history dump。',
  })
  async getTripExplainability(@Param('tripId') tripId: string) {
    const payload = await this.tripExplainability.buildTripExplainability({ tripId });
    return successResponse(payload);
  }
}

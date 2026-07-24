import { Controller, Get, Param } from '@nestjs/common';
import { ApiOperation, ApiParam, ApiTags } from '@nestjs/swagger';
import { Public } from '../../../auth/decorators/public.decorator';
import { successResponse } from '../../../common/dto/standard-response.dto';
import { PlanObjectProjectionService } from '../services/plan-object-projection.service';

@ApiTags('plan-objects')
@Public()
@Controller('trips/:tripId')
export class PlanObjectsController {
  constructor(private readonly projection: PlanObjectProjectionService) {}

  @Get('plan-objects')
  @ApiOperation({
    summary: '规划对象投影（Phase 4）',
    description:
      '从 itinerary / accommodation / lunch_strategy 投影 PlanObject 读模型。' +
      '需 PLAN_OBJECT_PROJECTION_ENABLED=1。不改变正式热路径。',
  })
  @ApiParam({ name: 'tripId', description: '行程 ID' })
  async getPlanObjects(@Param('tripId') tripId: string) {
    const data = await this.projection.buildProjection(tripId);
    return successResponse(data);
  }
}

import { Controller, Get, Param, ParseIntPipe, Query, UseGuards } from '@nestjs/common';
import { ApiOperation, ApiQuery, ApiTags } from '@nestjs/swagger';
import { Public } from '../auth/decorators/public.decorator';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';
import {
  CurrentUser,
  CurrentUserPayload,
} from '../auth/decorators/current-user.decorator';
import { successResponse } from '../common/dto/standard-response.dto';
import { HikingReadinessAuditService } from './hiking-readiness-audit.service';
import { HikingRouteReadinessService } from './hiking-route-readiness.service';

@ApiTags('Hiking Readiness (Phase 2)')
@Controller('readiness')
export class HikingReadinessController {
  constructor(
    private readonly audit: HikingReadinessAuditService,
    private readonly routeReadiness: HikingRouteReadinessService,
  ) {}

  @Public()
  @Get('trip/:id/hiking-audit')
  @ApiOperation({
    summary: '徒步行前审计卡',
    description:
      '合并 terrain 阈值、FactsToReadiness 徒步 must 项与样板间装备清单。返回 tripPlannedDays 与路线 routeSuggestedDays 对比。行程 metadata 可设 routeDirectionId 或 routeDirectionName。',
  })
  @ApiQuery({ name: 'longestHike', required: false, type: Number })
  async getHikingAudit(
    @Param('id') tripId: string,
    @Query('longestHike') longestHike?: string,
  ) {
    const hikeLevel =
      longestHike != null && longestHike !== ''
        ? Math.min(4, Math.max(0, parseInt(longestHike, 10)))
        : undefined;
    const result = await this.audit.auditTrip(tripId, { longestHike: hikeLevel });
    return successResponse(result);
  }

  @Public()
  @UseGuards(JwtAuthGuard)
  @Get('route-directions/:id')
  @ApiOperation({ summary: '路线级 Readiness 分数（P2）' })
  @ApiQuery({ name: 'longestHike', required: false, type: Number })
  @ApiQuery({
    name: 'plannedDate',
    required: false,
    description: '计划徒步日 YYYY-MM-DD（归因/日志，不改变评分算法）',
  })
  @ApiQuery({
    name: 'hikePlanId',
    required: false,
    description: '关联 HikePlan UUID（归因/日志）',
  })
  async getRouteReadiness(
    @Param('id', ParseIntPipe) routeDirectionId: number,
    @Query('longestHike') longestHike?: string,
    @Query('plannedDate') plannedDate?: string,
    @Query('hikePlanId') hikePlanId?: string,
    @CurrentUser() user?: CurrentUserPayload,
  ) {
    const hikeLevel =
      longestHike != null && longestHike !== ''
        ? Math.min(4, Math.max(0, parseInt(longestHike, 10)))
        : undefined;
    const data = await this.routeReadiness.evaluateRoute(routeDirectionId, {
      longestHike: hikeLevel,
      userId: user?.userId,
      plannedDate,
      hikePlanId,
    });
    return successResponse(data);
  }
}

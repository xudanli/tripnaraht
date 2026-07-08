import {
  Controller,
  Get,
  Param,
  Post,
  Query,
  UnauthorizedException,
} from '@nestjs/common';
import { ApiOperation, ApiParam, ApiQuery, ApiTags } from '@nestjs/swagger';
import { Public } from '../../auth/decorators/public.decorator';
import { CurrentUser, CurrentUserPayload } from '../../auth/decorators/current-user.decorator';
import {
  ErrorCode,
  errorResponse,
  successResponse,
} from '../../common/dto/standard-response.dto';
import { ConstraintSolverAccessService } from '../../trips/trip-constraint-solver/services/constraint-solver-access.service';
import { TripMonitoringMvpService } from './trip-monitoring-mvp.service';
import { MonitoringAutoTriggerService } from './monitoring-auto-trigger.service';

@ApiTags('trip-monitoring')
@Public()
@Controller('trips/:tripId/monitoring')
export class TripMonitoringController {
  constructor(
    private readonly monitoring: TripMonitoringMvpService,
    private readonly autoTrigger: MonitoringAutoTriggerService,
    private readonly access: ConstraintSolverAccessService,
  ) {}

  @Get('items')
  @ApiOperation({ summary: 'Monitoring MVP — 当前监控项（上次 scan 结果或 pending）' })
  async listItems(@Param('tripId') tripId: string, @CurrentUser() user?: CurrentUserPayload) {
    try {
      await this.assertMember(tripId, user);
      const items = await this.monitoring.listItems(tripId);
      return successResponse({ tripId, items, activeCount: items.filter((i) => i.status === 'ALERT').length });
    } catch (e) {
      return this.handleError(e);
    }
  }

  @Post('scan')
  @ApiOperation({
    summary: 'Monitoring MVP — 扫描 5 类变量（道路/天气/…）并写回 metadata',
    description: '无需 request body；若客户端发送 JSON，请使用 {} 而非 null。',
  })
  @ApiQuery({ name: 'dayIndex', required: false, description: '天气扫描 dayIndex（0-based）' })
  async scan(
    @Param('tripId') tripId: string,
    @Query('dayIndex') dayIndex?: string,
    @CurrentUser() user?: CurrentUserPayload,
  ) {
    try {
      await this.assertMember(tripId, user);
      const parsedDay = dayIndex != null && dayIndex !== '' ? Number(dayIndex) : undefined;
      const data = await this.monitoring.scanTrip(tripId, {
        dayIndex: Number.isFinite(parsedDay) ? parsedDay : undefined,
      });
      return successResponse(data);
    } catch (e) {
      return this.handleError(e);
    }
  }

  private async assertMember(tripId: string, user?: CurrentUserPayload) {
    const userId = this.access.resolveUserId(user);
    await this.access.assertTripMember(tripId, userId);
  }

  private handleError(e: unknown) {
    if (e instanceof UnauthorizedException) {
      return errorResponse(ErrorCode.UNAUTHORIZED, e.message);
    }
    const message = e instanceof Error ? e.message : String(e);
    return errorResponse(ErrorCode.INTERNAL_ERROR, message);
  }
}

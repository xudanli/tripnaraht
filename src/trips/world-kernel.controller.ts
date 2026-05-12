import { Controller, Get, Param, Query } from '@nestjs/common';
import { ApiOperation, ApiResponse, ApiTags } from '@nestjs/swagger';
import { Public } from '../auth/decorators/public.decorator';
import { successResponse } from '../common/dto/standard-response.dto';
import { ApiSuccessResponseDto } from '../common/dto/api-response.dto';
import { WorldKernelService } from './services/world-kernel.service';
import { WorldBusEventLogService } from './services/world-bus-event-log.service';

/**
 * 只读观测：全局世界 / 行程级 WorldState / 城市孪生（内存态）。
 * 与 {@link TripsController} 同为开发期 @Public；上线前应改为鉴权 + 限流。
 */
@ApiTags('trips-world')
@Public()
@Controller('trips/world')
export class WorldKernelController {
  constructor(
    private readonly worldKernel: WorldKernelService,
    private readonly worldBusEventLog: WorldBusEventLogService,
  ) {}

  @Get('global')
  @ApiOperation({ summary: '只读：GlobalWorldState（自治世界编排器快照）' })
  @ApiResponse({ status: 200, description: '成功', type: ApiSuccessResponseDto })
  getGlobal() {
    return successResponse(this.worldKernel.queryGlobal());
  }

  @Get('trip/:tripId')
  @ApiOperation({ summary: '只读：单行程 WorldState（世界模拟层）' })
  @ApiResponse({ status: 200, description: '成功', type: ApiSuccessResponseDto })
  getTripWorld(@Param('tripId') tripId: string) {
    return successResponse(this.worldKernel.queryTrip(tripId));
  }

  @Get('twin/:cityId')
  @ApiOperation({ summary: '只读：城市数字孪生 + 流评分' })
  @ApiResponse({ status: 200, description: '成功', type: ApiSuccessResponseDto })
  getTwin(@Param('cityId') cityId: string) {
    const twin = this.worldKernel.queryTwin(cityId);
    const flow = this.worldKernel.evaluateTwinFlow(cityId);
    return successResponse({ cityId, twin: twin ?? null, flow: flow ?? null });
  }

  @Get('events')
  @ApiOperation({
    summary: '只读：近期世界总线事件（append-only 日志，按 recordedAt 倒序）',
  })
  @ApiResponse({ status: 200, description: '成功', type: ApiSuccessResponseDto })
  async getRecentBusEvents(
    @Query('limit') limitStr?: string,
    @Query('kind') kind?: string,
    @Query('cityKey') cityKey?: string,
  ) {
    const parsed = parseInt(limitStr || '50', 10);
    const limit = Number.isFinite(parsed) ? parsed : 50;
    const rows = await this.worldBusEventLog.recent({ limit, kind, cityKey });
    return successResponse({ events: rows });
  }
}

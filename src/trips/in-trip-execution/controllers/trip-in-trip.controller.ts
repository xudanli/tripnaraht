import {
  Controller,
  Get,
  Param,
  Post,
  Body,
  UnauthorizedException,
  BadRequestException,
  ForbiddenException,
  NotFoundException,
  ServiceUnavailableException,
} from '@nestjs/common';
import { ApiOperation, ApiParam, ApiTags } from '@nestjs/swagger';
import { Public } from '../../../auth/decorators/public.decorator';
import { CurrentUser, CurrentUserPayload } from '../../../auth/decorators/current-user.decorator';
import {
  ErrorCode,
  errorResponse,
  successResponse,
} from '../../../common/dto/standard-response.dto';
import { AnchorHandoffService } from '../services/anchor-handoff.service';
import { InTripAccessService } from '../services/in-trip-access.service';
import { InTripMorningPackService } from '../services/in-trip-morning-pack.service';
import { InTripOfflineSyncService } from '../services/in-trip-offline-sync.service';
import { TripTodayService } from '../services/trip-today.service';
import { CoverageMapService } from '../../readiness/services/coverage-map.service';
import type { OfflineSyncRequest } from '../types/in-trip-offline.types';
import { resolveInTripRuntimePolicy } from '../utils/in-trip-runtime-policy.util';

@ApiTags('trip-in-trip-execution')
@Public()
@Controller('trips/:tripId/in-trip')
export class TripInTripController {
  constructor(
    private readonly access: InTripAccessService,
    private readonly anchorHandoff: AnchorHandoffService,
    private readonly today: TripTodayService,
    private readonly morningPack: InTripMorningPackService,
    private readonly offlineSync: InTripOfflineSyncService,
    private readonly coverageMap: CoverageMapService,
  ) {}

  @Get('anchor-snapshot')
  @ApiOperation({ summary: '获取行中锚点快照（脱敏摘要）' })
  @ApiParam({ name: 'tripId', description: '行程 ID' })
  async getAnchorSnapshot(
    @Param('tripId') tripId: string,
    @CurrentUser() user?: CurrentUserPayload,
  ) {
    try {
      const userId = this.resolveUserId(user);
      await this.access.assertTripMember(tripId, userId);
      const snapshot = await this.anchorHandoff.getSnapshot(tripId);
      if (!snapshot) {
        return errorResponse(ErrorCode.NOT_FOUND, '锚点快照尚未物化');
      }
      return successResponse(this.anchorHandoff.toPublicSnapshot(snapshot));
    } catch (e) {
      return this.handleError(e);
    }
  }

  @Post('anchor-snapshot/verify')
  @ApiOperation({ summary: '校验行前→行中移交就绪状态' })
  async verifyHandoff(
    @Param('tripId') tripId: string,
    @CurrentUser() user?: CurrentUserPayload,
  ) {
    try {
      const userId = this.resolveUserId(user);
      await this.access.assertTripMember(tripId, userId);
      const verify = await this.anchorHandoff.verifyHandoffReadiness(tripId, userId);
      return successResponse(verify);
    } catch (e) {
      return this.handleError(e);
    }
  }

  @Post('anchor-snapshot/materialize')
  @ApiOperation({ summary: '物化锚点快照（管理/调试；正常由 PLANNING→TRAVELING 自动触发）' })
  async materializeHandoff(
    @Param('tripId') tripId: string,
    @CurrentUser() user?: CurrentUserPayload,
  ) {
    try {
      const userId = this.resolveUserId(user);
      await this.access.assertOrganizer(tripId, userId);
      const result = await this.anchorHandoff.materialize(tripId, userId);
      return successResponse(result);
    } catch (e) {
      return this.handleError(e);
    }
  }

  @Get('today')
  @ApiOperation({ summary: '今日概览仪表盘（行中首屏聚合）' })
  async getToday(
    @Param('tripId') tripId: string,
    @CurrentUser() user?: CurrentUserPayload,
  ) {
    try {
      const userId = this.resolveUserId(user);
      return successResponse(await this.today.getToday(tripId, userId));
    } catch (e) {
      return this.handleError(e);
    }
  }

  @Get('readiness/today')
  @ApiOperation({ summary: '今日就绪（行中可执行度，仅当日 POI/路段）' })
  async getTodayReadiness(
    @Param('tripId') tripId: string,
    @CurrentUser() user?: CurrentUserPayload,
  ) {
    try {
      const userId = this.resolveUserId(user);
      await this.access.assertInTripPhase(tripId);
      await this.access.assertTripMember(tripId, userId);
      return successResponse(await this.coverageMap.getTodayReadinessScore(tripId));
    } catch (e) {
      return this.handleError(e);
    }
  }

  @Get('offline/morning-pack')
  @ApiOperation({ summary: '晨间离线同步包（TRAVELING 时）' })
  async getMorningPack(
    @Param('tripId') tripId: string,
    @CurrentUser() user?: CurrentUserPayload,
  ) {
    try {
      const userId = this.resolveUserId(user);
      await this.access.assertTripMember(tripId, userId);
      const pack = await this.morningPack.buildForTrip(tripId, userId);
      if (!pack) {
        return errorResponse(ErrorCode.BUSINESS_ERROR, '行中晨间包仅在 TRAVELING 且模块启用时可用');
      }
      return successResponse(pack);
    } catch (e) {
      return this.handleError(e);
    }
  }

  @Post('offline/sync')
  @ApiOperation({ summary: '联网后同步离线写操作队列' })
  async syncOffline(
    @Param('tripId') tripId: string,
    @Body() body: OfflineSyncRequest,
    @CurrentUser() user?: CurrentUserPayload,
  ) {
    try {
      const userId = this.resolveUserId(user);
      const result = await this.offlineSync.sync(tripId, userId, body);
      return successResponse(result);
    } catch (e) {
      return this.handleError(e);
    }
  }

  @Get('runtime-policy')
  @ApiOperation({ summary: '客户端省电 / 流量 / 同步策略' })
  async getRuntimePolicy() {
    return successResponse(resolveInTripRuntimePolicy());
  }

  private resolveUserId(user?: CurrentUserPayload): string {
    const id = user?.userId?.trim();
    if (id) return id;
    if (process.env.NODE_ENV !== 'production') return 'anonymous-dev-user';
    throw new UnauthorizedException('需要登录');
  }

  private handleError(e: unknown) {
    if (e instanceof UnauthorizedException) {
      return errorResponse(ErrorCode.UNAUTHORIZED, e.message);
    }
    if (e instanceof ForbiddenException) {
      return errorResponse(ErrorCode.FORBIDDEN, e.message);
    }
    if (e instanceof NotFoundException) {
      return errorResponse(ErrorCode.NOT_FOUND, e.message);
    }
    if (e instanceof BadRequestException) {
      const resp = e.getResponse();
      if (typeof resp === 'object' && resp !== null && 'missing' in resp) {
        return errorResponse(ErrorCode.VALIDATION_ERROR, (resp as { message?: string }).message ?? e.message, resp as Record<string, unknown>);
      }
      return errorResponse(ErrorCode.VALIDATION_ERROR, e.message);
    }
    if (e instanceof ServiceUnavailableException) {
      return errorResponse(ErrorCode.BUSINESS_ERROR, e.message);
    }
    throw e;
  }
}

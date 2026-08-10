import {
  BadRequestException,
  ConflictException,
  Controller,
  ForbiddenException,
  Get,
  NotFoundException,
  Param,
  Query,
  UnauthorizedException,
} from '@nestjs/common';
import { ApiOperation, ApiParam, ApiQuery, ApiTags } from '@nestjs/swagger';
import { Public } from '../../../auth/decorators/public.decorator';
import {
  CurrentUser,
  CurrentUserPayload,
} from '../../../auth/decorators/current-user.decorator';
import {
  ErrorCode,
  errorResponse,
  successResponse,
} from '../../../common/dto/standard-response.dto';
import { ConstraintSolverAccessService } from '../../trip-constraint-solver/services/constraint-solver-access.service';
import { SelfDriveKernelService } from '../services/self-drive-kernel.service';

@ApiTags('self-drive-kernel')
@Public()
@Controller('trips/:tripId/self-drive')
export class SelfDriveController {
  constructor(
    private readonly access: ConstraintSolverAccessService,
    private readonly kernel: SelfDriveKernelService,
  ) {}

  private parseDayIndex(raw?: string): number | undefined {
    if (raw == null || raw === '') return undefined;
    const n = Number(raw);
    if (!Number.isFinite(n) || n < 1) {
      throw new BadRequestException('dayIndex must be a positive integer');
    }
    return Math.floor(n);
  }

  @Get('context')
  @ApiOperation({
    summary: 'Self-Drive Context（统一自驾上下文）',
    description:
      'Kernel 聚合上下文：route segments / capabilities / advisories / roadEvidence。国家差异仅体现在 Pack 与证据，不改变响应形状。',
  })
  @ApiParam({ name: 'tripId' })
  @ApiQuery({ name: 'dayIndex', required: false })
  @ApiQuery({ name: 'date', required: false, description: 'YYYY-MM-DD' })
  async getContext(
    @Param('tripId') tripId: string,
    @Query('dayIndex') dayIndex?: string,
    @Query('date') date?: string,
    @CurrentUser() user?: CurrentUserPayload,
  ) {
    try {
      const userId = this.access.resolveUserId(user);
      const bundle = await this.kernel.getBundleForTrip(tripId, userId, {
        dayIndex: this.parseDayIndex(dayIndex),
        localDate: date,
      });
      return successResponse(bundle.context);
    } catch (e) {
      return this.handleError(e);
    }
  }

  @Get('readiness')
  @ApiOperation({
    summary: 'Self-Drive Readiness（可执行性轻量）',
    description: 'capabilities + executability verdict + vehicleRoadFit + drivingLoad',
  })
  async getReadiness(
    @Param('tripId') tripId: string,
    @Query('dayIndex') dayIndex?: string,
    @Query('date') date?: string,
    @CurrentUser() user?: CurrentUserPayload,
  ) {
    try {
      const userId = this.access.resolveUserId(user);
      const { context, engines } = await this.kernel.getBundleForTrip(tripId, userId, {
        dayIndex: this.parseDayIndex(dayIndex),
        localDate: date,
      });
      return successResponse({
        schemaId: 'tripnara.self_drive_readiness@v1',
        destinationPackId: context.destinationPackId,
        countryCode: context.countryCode,
        capabilities: context.capabilities,
        executability: engines.executability,
        vehicleRoadFit: engines.vehicleRoadFit,
        drivingLoad: engines.drivingLoad,
        evaluatedAt: engines.evaluatedAt,
      });
    } catch (e) {
      return this.handleError(e);
    }
  }

  @Get('daily-drive')
  @ApiOperation({
    summary: 'Self-Drive Daily Drive（今日驾驶产品投影）',
    description: '国家无关：status / drive / criticalSegments / advisories / recommendation',
  })
  async getDailyDrive(
    @Param('tripId') tripId: string,
    @Query('dayIndex') dayIndex?: string,
    @Query('date') date?: string,
    @CurrentUser() user?: CurrentUserPayload,
  ) {
    try {
      const userId = this.access.resolveUserId(user);
      const { dailyDrive } = await this.kernel.getBundleForTrip(tripId, userId, {
        dayIndex: this.parseDayIndex(dayIndex),
        localDate: date,
      });
      return successResponse(dailyDrive);
    } catch (e) {
      return this.handleError(e);
    }
  }

  @Get('road-segments')
  @ApiOperation({ summary: '今日路段（含 critical）' })
  async getRoadSegments(
    @Param('tripId') tripId: string,
    @Query('dayIndex') dayIndex?: string,
    @Query('date') date?: string,
    @CurrentUser() user?: CurrentUserPayload,
  ) {
    try {
      const userId = this.access.resolveUserId(user);
      const { context } = await this.kernel.getBundleForTrip(tripId, userId, {
        dayIndex: this.parseDayIndex(dayIndex),
        localDate: date,
      });
      return successResponse({
        schemaId: 'tripnara.self_drive_road_segments@v1',
        corridorId: context.route.corridorId,
        dayIndex: context.route.dayIndex,
        segments: context.route.segments,
        criticalSegments: context.route.criticalSegments,
      });
    } catch (e) {
      return this.handleError(e);
    }
  }

  @Get('advisories')
  @ApiOperation({ summary: '统一 DriveAdvisory 列表' })
  async getAdvisories(
    @Param('tripId') tripId: string,
    @Query('dayIndex') dayIndex?: string,
    @Query('date') date?: string,
    @CurrentUser() user?: CurrentUserPayload,
  ) {
    try {
      const userId = this.access.resolveUserId(user);
      const { context, engines } = await this.kernel.getBundleForTrip(tripId, userId, {
        dayIndex: this.parseDayIndex(dayIndex),
        localDate: date,
      });
      return successResponse({
        schemaId: 'tripnara.self_drive_advisories@v1',
        advisories: engines.advisories,
        destinationPackId: context.destinationPackId,
      });
    } catch (e) {
      return this.handleError(e);
    }
  }

  @Get('evidence')
  @ApiOperation({
    summary: '归一路况证据 RoadStatusEvidence',
    description: 'CN 季节窗多为 freshness=PARTIAL；不得单独支撑强阻断',
  })
  async getEvidence(
    @Param('tripId') tripId: string,
    @Query('dayIndex') dayIndex?: string,
    @Query('date') date?: string,
    @CurrentUser() user?: CurrentUserPayload,
  ) {
    try {
      const userId = this.access.resolveUserId(user);
      const { context } = await this.kernel.getBundleForTrip(tripId, userId, {
        dayIndex: this.parseDayIndex(dayIndex),
        localDate: date,
      });
      return successResponse({
        schemaId: 'tripnara.self_drive_evidence@v1',
        roadEvidence: context.roadEvidence,
        evidenceRefs: context.evidence,
      });
    } catch (e) {
      return this.handleError(e);
    }
  }

  @Get('alternatives')
  @ApiOperation({
    summary: '恢复 / 调整建议（Recovery Engine）',
    description: '统一动作枚举；国家只影响触发原因，不影响动作集合形状',
  })
  async getAlternatives(
    @Param('tripId') tripId: string,
    @Query('dayIndex') dayIndex?: string,
    @Query('date') date?: string,
    @CurrentUser() user?: CurrentUserPayload,
  ) {
    try {
      const userId = this.access.resolveUserId(user);
      const { engines } = await this.kernel.getBundleForTrip(tripId, userId, {
        dayIndex: this.parseDayIndex(dayIndex),
        localDate: date,
      });
      return successResponse({
        schemaId: 'tripnara.self_drive_alternatives@v1',
        executability: engines.executability,
        runtimeMonitor: engines.runtimeMonitor,
        recommendedActions: engines.recovery.recommendedActions,
      });
    } catch (e) {
      return this.handleError(e);
    }
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
      return errorResponse(ErrorCode.VALIDATION_ERROR, e.message);
    }
    if (e instanceof ConflictException) {
      return errorResponse(ErrorCode.CONFLICT, e.message);
    }
    const message = e instanceof Error ? e.message : 'Self-drive kernel error';
    return errorResponse(ErrorCode.INTERNAL_ERROR, message);
  }
}

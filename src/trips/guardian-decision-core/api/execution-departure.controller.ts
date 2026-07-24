/**
 * Slice 3 E1 — POST /api/trips/:tripId/execution/departure-slip
 */

import {
  Body,
  Controller,
  ForbiddenException,
  Get,
  Param,
  Post,
  UnauthorizedException,
} from '@nestjs/common';
import { ApiOperation, ApiParam, ApiProperty, ApiTags } from '@nestjs/swagger';
import { IsBoolean, IsIn, IsOptional, IsString } from 'class-validator';
import { Public } from '../../../auth/decorators/public.decorator';
import {
  CurrentUser,
  CurrentUserPayload,
} from '../../../auth/decorators/current-user.decorator';
import {
  errorResponse,
  ErrorCode,
  successResponse,
} from '../../../common/dto/standard-response.dto';
import type { ExecutionDepartureSource } from '../contracts/execution-slip.types';
import { ExecutionDepartureSlipService } from '../services/execution-departure-slip.service';
import { ExecutionSlipShadowMetricsService } from '../shadow/execution-slip-shadow-metrics.service';

class DepartureSlipRequestDto {
  @ApiProperty()
  @IsString()
  activityId!: string;

  @ApiProperty()
  @IsString()
  observedAt!: string;

  @ApiProperty()
  @IsBoolean()
  stillAtPoi!: boolean;

  @ApiProperty({ enum: ['USER_REPORT', 'MOBILE_PRESENCE', 'SYSTEM_INFERENCE'] })
  @IsIn(['USER_REPORT', 'MOBILE_PRESENCE', 'SYSTEM_INFERENCE'])
  source!: ExecutionDepartureSource;

  @ApiProperty({ required: false })
  @IsOptional()
  @IsString()
  idempotencyKey?: string;
}

@ApiTags('execution-slip')
@Public()
@Controller('trips/:tripId/execution')
export class ExecutionDepartureController {
  constructor(
    private readonly slipService: ExecutionDepartureSlipService,
    private readonly shadowMetrics: ExecutionSlipShadowMetricsService,
  ) {}

  @Post('departure-slip')
  @ApiOperation({ summary: '记录执行偏差观测（用户仍在 POI / 我晚了）' })
  @ApiParam({ name: 'tripId', description: '行程 ID' })
  async recordDepartureSlip(
    @Param('tripId') tripId: string,
    @Body() body: DepartureSlipRequestDto,
    @CurrentUser() user?: CurrentUserPayload,
  ) {
    try {
      const userId = user?.userId;
      if (!userId) {
        throw new UnauthorizedException('需要登录');
      }
      const result = await this.slipService.recordDepartureSlip(
        tripId,
        userId,
        body,
      );
      return successResponse(result);
    } catch (e) {
      if (e instanceof UnauthorizedException) {
        return errorResponse(ErrorCode.UNAUTHORIZED, e.message);
      }
      if (e instanceof ForbiddenException) {
        return errorResponse(ErrorCode.FORBIDDEN, e.message);
      }
      throw e;
    }
  }

  @Get('shadow-metrics')
  @ApiOperation({ summary: 'Execution slip shadow counters (Sprint 4 observation)' })
  getShadowMetrics() {
    return successResponse(this.shadowMetrics.snapshot());
  }
}

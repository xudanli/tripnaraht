/**
 * Shadow divergence dashboards + event query.
 * Enable: OPTIMIZATION_SHADOW_OBSERVABILITY_ENABLED=1 (default on when metrics not disabled)
 */

import {
  Controller,
  Get,
  HttpCode,
  HttpStatus,
  NotFoundException,
  Optional,
  Param,
  Query,
} from '@nestjs/common';
import { ApiOperation, ApiTags } from '@nestjs/swagger';
import { Public } from '../../auth/decorators/public.decorator';
import { successResponse, errorResponse, ErrorCode } from '../../common/dto/standard-response.dto';
import { ShadowObservabilityService } from './shadow-observability.service';

export function isShadowObservabilityEnabled(): boolean {
  const raw = process.env.OPTIMIZATION_SHADOW_OBSERVABILITY_ENABLED?.trim().toLowerCase();
  if (raw === '0' || raw === 'false' || raw === 'no') return false;
  return process.env.OPTIMIZATION_SHADOW_METRICS_DISABLED !== '1';
}

@ApiTags('decision-engine')
@Controller('decision-engine/v1/shadow-observability')
export class ShadowObservabilityAdminController {
  constructor(
    @Optional() private readonly shadowObservability?: ShadowObservabilityService,
  ) {}

  @Public()
  @Get('dashboard')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({ summary: 'Shadow observability dashboard (4-panel metrics snapshot)' })
  getDashboard(@Query('limit') limit?: string) {
    if (!isShadowObservabilityEnabled()) {
      return errorResponse(
        ErrorCode.BUSINESS_ERROR,
        'Shadow observability disabled',
      );
    }
    if (!this.shadowObservability) {
      return errorResponse(ErrorCode.INTERNAL_ERROR, 'ShadowObservabilityService unavailable');
    }
    const n = Math.min(Math.max(Number(limit) || 20, 1), 100);
    return successResponse(this.shadowObservability.getDashboard(n));
  }

  @Public()
  @Get('events')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({ summary: 'Recent shadow divergence events' })
  getRecentEvents(
    @Query('limit') limit?: string,
    @Query('decisionRunId') decisionRunId?: string,
    @Query('tripId') tripId?: string,
  ) {
    if (!isShadowObservabilityEnabled()) {
      return errorResponse(ErrorCode.BUSINESS_ERROR, 'Shadow observability disabled');
    }
    if (!this.shadowObservability) {
      return errorResponse(ErrorCode.INTERNAL_ERROR, 'ShadowObservabilityService unavailable');
    }
    const n = Math.min(Math.max(Number(limit) || 50, 1), 200);
    const events =
      decisionRunId || tripId
        ? this.shadowObservability.getRecentEventsFiltered({
            limit: n,
            decisionRunId: decisionRunId?.trim() || undefined,
            tripId: tripId?.trim() || undefined,
          })
        : this.shadowObservability.getRecentEvents(n);
    return successResponse({ events });
  }

  @Public()
  @Get('events/:comparisonId')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({ summary: 'Single shadow divergence event by comparisonId' })
  getEvent(@Param('comparisonId') comparisonId: string) {
    if (!isShadowObservabilityEnabled()) {
      return errorResponse(ErrorCode.BUSINESS_ERROR, 'Shadow observability disabled');
    }
    if (!this.shadowObservability) {
      return errorResponse(ErrorCode.INTERNAL_ERROR, 'ShadowObservabilityService unavailable');
    }
    const event = this.shadowObservability.getEvent(comparisonId);
    if (!event) {
      throw new NotFoundException(`Shadow event not found: ${comparisonId}`);
    }
    return successResponse(event);
  }
}

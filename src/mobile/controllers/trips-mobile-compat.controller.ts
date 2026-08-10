/**
 * Compatibility aliases for clients that call /api/trips/:tripId/...
 * instead of the canonical /api/mobile/trips/:tripId/... paths.
 *
 * Canonical:
 *   GET /api/mobile/trips/:tripId/spatial-route
 *   GET /api/mobile/trips/:tripId/planning/route-blueprint
 *   GET /api/mobile/trips/:tripId/execution/overview-dashboard
 */

import {
  Controller,
  Get,
  Param,
  Query,
  UnauthorizedException,
  NotFoundException,
  ForbiddenException,
  BadRequestException,
  ConflictException,
} from '@nestjs/common';
import { ApiOperation, ApiQuery, ApiTags } from '@nestjs/swagger';
import { Public } from '../../auth/decorators/public.decorator';
import { CurrentUser, CurrentUserPayload } from '../../auth/decorators/current-user.decorator';
import { randomUUID } from 'crypto';
import { ErrorCode } from '../../common/dto/standard-response.dto';
import {
  buildMobileEnvelopeMeta,
  mobileErrorResponse,
  mobileSuccessResponse,
} from '../utils/mobile-envelope.util';
import { ConstraintSolverAccessService } from '../../trips/trip-constraint-solver/services/constraint-solver-access.service';
import { MobilePlanningService } from '../services/mobile-planning.service';
import { MobileSpatialRouteService } from '../services/mobile-spatial-route.service';
import { MobileOverviewDashboardService } from '../services/mobile-overview-dashboard.service';

@ApiTags('trips-mobile-compat')
@Public()
@Controller('trips/:tripId')
export class TripsMobileCompatController {
  constructor(
    private readonly planning: MobilePlanningService,
    private readonly spatial: MobileSpatialRouteService,
    private readonly overviewDashboard: MobileOverviewDashboardService,
    private readonly access: ConstraintSolverAccessService,
  ) {}

  @Get('spatial-route')
  @ApiOperation({
    summary:
      '[compat] 同 GET /api/mobile/trips/:tripId/spatial-route（请尽快改用 mobile 前缀）',
  })
  async getSpatialRoute(
    @Param('tripId') tripId: string,
    @Query('dayIndex') dayIndexRaw?: string,
    @CurrentUser() user?: CurrentUserPayload,
  ) {
    return this.run(tripId, user, () =>
      this.spatial.getSpatialRoute(tripId, this.access.resolveUserId(user), {
        dayIndex: this.parseOptionalInt(dayIndexRaw),
      }),
    );
  }

  @Get('route-blueprint')
  @ApiOperation({
    summary:
      '[compat] 同 GET /api/mobile/trips/:tripId/planning/route-blueprint',
  })
  async getRouteBlueprint(
    @Param('tripId') tripId: string,
    @Query('locale') locale?: string,
    @Query('focusDayNumber') focusDayRaw?: string,
    @CurrentUser() user?: CurrentUserPayload,
  ) {
    return this.run(tripId, user, () =>
      this.planning.getRouteBlueprint(tripId, this.access.resolveUserId(user), {
        locale,
        focusDayNumber: this.parseOptionalInt(focusDayRaw),
      }),
    );
  }

  @Get('execution/overview')
  @ApiOperation({
    summary:
      '[compat] 同 GET /api/mobile/trips/:tripId/execution/overview-dashboard',
  })
  @ApiQuery({ name: 'lite', required: false, type: Boolean })
  @ApiQuery({ name: 'dayIndex', required: false, type: Number })
  async getExecutionOverview(
    @Param('tripId') tripId: string,
    @Query('lite') lite?: string,
    @Query('dayIndex') dayIndex?: string,
    @CurrentUser() user?: CurrentUserPayload,
  ) {
    const parsedDay = dayIndex != null ? Number(dayIndex) : undefined;
    const useLite = !(lite === '0' || lite === 'false');
    return this.run(tripId, user, () =>
      this.overviewDashboard.getOverviewDashboard(
        tripId,
        this.access.resolveUserId(user),
        {
          lite: useLite,
          dayIndex: Number.isFinite(parsedDay) ? parsedDay : undefined,
        },
      ),
    );
  }

  private parseOptionalInt(raw?: string): number | undefined {
    if (raw == null || raw === '') return undefined;
    const n = Number(raw);
    return Number.isFinite(n) ? n : undefined;
  }

  private async run<T>(
    tripId: string,
    user: CurrentUserPayload | undefined,
    fn: () => Promise<T>,
  ) {
    const requestId = randomUUID();
    try {
      this.access.resolveUserId(user);
      const data = await fn();
      return mobileSuccessResponse(data, buildMobileEnvelopeMeta(tripId, data, requestId));
    } catch (e) {
      return this.handleError(e, tripId, requestId);
    }
  }

  private handleError(e: unknown, tripId: string, requestId: string) {
    const meta = buildMobileEnvelopeMeta(tripId, undefined, requestId);
    if (e instanceof UnauthorizedException) {
      return mobileErrorResponse(ErrorCode.UNAUTHORIZED, e.message, meta);
    }
    if (e instanceof ForbiddenException) {
      return mobileErrorResponse(ErrorCode.FORBIDDEN, e.message, meta);
    }
    if (e instanceof NotFoundException) {
      const resp = e.getResponse();
      if (typeof resp === 'object' && resp !== null) {
        const row = resp as { code?: string; message?: string };
        return mobileErrorResponse(row.code ?? ErrorCode.NOT_FOUND, row.message ?? e.message, meta);
      }
      return mobileErrorResponse(ErrorCode.NOT_FOUND, e.message, meta);
    }
    if (e instanceof BadRequestException) {
      const resp = e.getResponse();
      if (typeof resp === 'object' && resp !== null) {
        const row = resp as { code?: string; message?: string };
        return mobileErrorResponse(
          row.code ?? ErrorCode.VALIDATION_ERROR,
          row.message ?? e.message,
          meta,
        );
      }
      return mobileErrorResponse(ErrorCode.VALIDATION_ERROR, e.message, meta);
    }
    if (e instanceof ConflictException) {
      return mobileErrorResponse('CONTEXT_VERSION_CONFLICT', e.message, meta);
    }
    const message = e instanceof Error ? e.message : String(e);
    return mobileErrorResponse(ErrorCode.INTERNAL_ERROR, message, meta);
  }
}

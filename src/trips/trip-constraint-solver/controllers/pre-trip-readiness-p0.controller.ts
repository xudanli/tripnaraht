import {
  Body,
  Controller,
  HttpCode,
  HttpStatus,
  Param,
  Post,
  NotImplementedException,
  BadRequestException,
  NotFoundException,
  ForbiddenException,
  UnauthorizedException,
} from '@nestjs/common';
import { ApiOperation, ApiTags } from '@nestjs/swagger';
import { Public } from '../../../auth/decorators/public.decorator';
import { CurrentUser, CurrentUserPayload } from '../../../auth/decorators/current-user.decorator';
import {
  ErrorCode,
  errorResponse,
  successResponse,
} from '../../../common/dto/standard-response.dto';
import { ConstraintSolverAccessService } from '../services/constraint-solver-access.service';
import { TripReservationEvidenceService } from '../../../poi-access-capacity/services/trip-reservation-evidence.service';
import { ExperienceRegretBoundService } from '../services/experience-regret-bound.service';
import { FeasibilityReportService } from '../services/feasibility-report.service';
import type { TripReservationEvidenceInput } from '../../../poi-access-capacity/utils/trip-reservation-evidence.util';
import type { ExperienceRegretConfirmInput } from '../utils/experience-regret-bound.util';

@ApiTags('pre-trip-readiness-p0')
@Public()
@Controller('trips/:tripId')
export class PreTripReadinessP0Controller {
  constructor(
    private readonly access: ConstraintSolverAccessService,
    private readonly reservationEvidence: TripReservationEvidenceService,
    private readonly regretBound: ExperienceRegretBoundService,
    private readonly feasibility: FeasibilityReportService,
  ) {}

  @Post('reservation-evidence')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({ summary: '提交 POI 预约凭证（Readiness P0）' })
  async postReservationEvidence(
    @Param('tripId') tripId: string,
    @Body() body: TripReservationEvidenceInput,
    @CurrentUser() user?: CurrentUserPayload,
  ) {
    try {
      const userId = this.access.resolveUserId(user);
      await this.access.assertTripMember(tripId, userId);
      if (body.attachmentId && !body.confirmationCode) {
        throw new NotImplementedException('附件上传 M1 未就绪');
      }
      const data = await this.reservationEvidence.upsertEvidence(tripId, userId, body);
      const report = await this.feasibility.getReport(tripId);
      return successResponse({ ...data, readinessHint: { reportVerdict: report.verdict.status } });
    } catch (e) {
      return this.handleError(e);
    }
  }

  @Post('experience-regret-bound/confirm')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({ summary: '确认体验遗憾底线（Readiness P0）' })
  async confirmExperienceRegretBound(
    @Param('tripId') tripId: string,
    @Body() body: ExperienceRegretConfirmInput,
    @CurrentUser() user?: CurrentUserPayload,
  ) {
    try {
      const userId = this.access.resolveUserId(user);
      await this.access.assertTripMember(tripId, userId);
      const data = await this.regretBound.confirmBound(tripId, userId, body);
      const report = await this.feasibility.getReport(tripId);
      return successResponse({
        ...data,
        gateExecute: report.gateExecute,
        canStartExecute: report.canStartExecute,
      });
    } catch (e) {
      return this.handleError(e);
    }
  }

  private handleError(e: unknown) {
    if (e instanceof NotImplementedException) {
      return errorResponse(ErrorCode.BUSINESS_ERROR, e.message, { status: 501 });
    }
    if (e instanceof NotFoundException) {
      return errorResponse(ErrorCode.NOT_FOUND, e.message);
    }
    if (e instanceof BadRequestException) {
      return errorResponse(ErrorCode.BAD_REQUEST, e.message);
    }
    if (e instanceof ForbiddenException) {
      return errorResponse(ErrorCode.FORBIDDEN, e.message);
    }
    if (e instanceof UnauthorizedException) {
      return errorResponse(ErrorCode.UNAUTHORIZED, e.message);
    }
    throw e;
  }
}

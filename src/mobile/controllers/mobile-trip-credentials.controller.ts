import {
  BadRequestException,
  Controller,
  ForbiddenException,
  Get,
  NotFoundException,
  Param,
  UnauthorizedException,
} from '@nestjs/common';
import { ApiOperation, ApiTags } from '@nestjs/swagger';
import { randomUUID } from 'crypto';
import { Public } from '../../auth/decorators/public.decorator';
import { CurrentUser, CurrentUserPayload } from '../../auth/decorators/current-user.decorator';
import { ErrorCode } from '../../common/dto/standard-response.dto';
import { ConstraintSolverAccessService } from '../../trips/trip-constraint-solver/services/constraint-solver-access.service';
import { mobileErrorResponse, mobileSuccessResponse } from '../utils/mobile-envelope.util';
import { MobileCredentialStatusService } from '../services/mobile-credential-status.service';

/**
 * Must use the same `mobile/trips/:tripId` prefix as MobileExecutionController /
 * MobilePlanningController. A sibling `@Controller('mobile/trips')` route is
 * shadowed by those routers and surfaces as Nest "Cannot GET".
 */
@ApiTags('mobile-trip-credentials')
@Public()
@Controller('mobile/trips/:tripId')
export class MobileTripCredentialsController {
  constructor(
    private readonly credentialStatus: MobileCredentialStatusService,
    private readonly access: ConstraintSolverAccessService,
  ) {}

  @Get('members/:memberId/credential-status')
  @ApiOperation({ summary: '组织者只读：成员证件完成态（无原图/号码）' })
  async getCredentialStatus(
    @Param('tripId') tripId: string,
    @Param('memberId') memberId: string,
    @CurrentUser() user?: CurrentUserPayload,
  ) {
    const requestId = randomUUID();
    const meta = { requestId, tripId, serverTime: new Date().toISOString() };
    try {
      const userId = this.access.resolveUserId(user);
      const data = await this.credentialStatus.getMemberCredentialStatus(
        userId,
        tripId,
        memberId,
      );
      return mobileSuccessResponse(data, meta);
    } catch (e) {
      if (e instanceof UnauthorizedException) {
        return mobileErrorResponse(ErrorCode.UNAUTHORIZED, e.message, meta);
      }
      if (e instanceof ForbiddenException) {
        return mobileErrorResponse(ErrorCode.FORBIDDEN, e.message, meta);
      }
      if (e instanceof NotFoundException) {
        return mobileErrorResponse(ErrorCode.NOT_FOUND, e.message, meta);
      }
      if (e instanceof BadRequestException) {
        return mobileErrorResponse(ErrorCode.VALIDATION_ERROR, e.message, meta);
      }
      const message = e instanceof Error ? e.message : String(e);
      return mobileErrorResponse(ErrorCode.INTERNAL_ERROR, message, meta);
    }
  }
}

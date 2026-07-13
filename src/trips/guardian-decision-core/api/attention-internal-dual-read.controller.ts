/**
 * Slice 4 Internal Dual-Read — internal-only side-by-side queue comparison endpoint.
 */

import {
  Controller,
  ForbiddenException,
  Get,
  Param,
  UnauthorizedException,
} from '@nestjs/common';
import { ApiOperation, ApiParam, ApiTags } from '@nestjs/swagger';
import { Public } from '../../../auth/decorators/public.decorator';
import { CurrentUser, CurrentUserPayload } from '../../../auth/decorators/current-user.decorator';
import {
  ErrorCode,
  errorResponse,
  successResponse,
} from '../../../common/dto/standard-response.dto';
import { ConstraintSolverAccessService } from '../../trip-constraint-solver/services/constraint-solver-access.service';
import { AttentionInternalDualReadService } from '../attention/attention-internal-dual-read.service';

@ApiTags('internal-attention')
@Public()
@Controller('trips/:tripId/internal')
export class AttentionInternalDualReadController {
  constructor(
    private readonly dualRead: AttentionInternalDualReadService,
    private readonly access: ConstraintSolverAccessService,
  ) {}

  @Get('attention-dual-read')
  @ApiOperation({
    summary: 'Slice 4 Internal Dual-Read — current queue vs Attention Primary projection',
    description:
      'Internal accounts + canary trips only. Does not replace decision-queue or enable Primary SSO.',
  })
  @ApiParam({ name: 'tripId', description: '行程 ID（须在 allowlist）' })
  async getAttentionDualRead(
    @Param('tripId') tripId: string,
    @CurrentUser() user?: CurrentUserPayload,
  ) {
    try {
      if (!user?.userId) {
        throw new UnauthorizedException('Authentication required');
      }
      const userId = this.access.resolveUserId(user);
      await this.access.assertTripMember(tripId, userId);
      this.dualRead.assertEligible(tripId, user);
      const data = await this.dualRead.getDualRead(tripId, user);
      return successResponse(data);
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
    const message = e instanceof Error ? e.message : 'Internal dual-read failed';
    return errorResponse(ErrorCode.INTERNAL_ERROR, message);
  }
}

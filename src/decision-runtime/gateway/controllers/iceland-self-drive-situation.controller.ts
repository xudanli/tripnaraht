/**
 * Dedicated BFF: GET /api/trips/:tripId/iceland-self-drive-situation
 * Client pack: tripnara.iceland.self_drive_situation.client@v1
 */

import {
  Controller,
  ForbiddenException,
  Get,
  NotFoundException,
  Param,
  UnauthorizedException,
} from '@nestjs/common';
import { ApiOperation, ApiTags } from '@nestjs/swagger';
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
import { ConstraintSolverAccessService } from '../../../trips/trip-constraint-solver/services/constraint-solver-access.service';
import { IcelandSelfDriveSituationProductService } from '../services/iceland-self-drive-situation-product.service';

@ApiTags('iceland-self-drive-situation')
@Public()
@Controller('trips/:tripId/iceland-self-drive-situation')
export class IcelandSelfDriveSituationController {
  constructor(
    private readonly product: IcelandSelfDriveSituationProductService,
    private readonly access: ConstraintSolverAccessService,
  ) {}

  @Get()
  @ApiOperation({
    summary:
      'Iceland self-drive situation client projection (gate, vehicle×road, weather causalChain)',
  })
  async get(
    @Param('tripId') tripId: string,
    @CurrentUser() user?: CurrentUserPayload,
  ) {
    try {
      await this.assertMember(tripId, user);
      return successResponse(await this.product.get(tripId));
    } catch (e) {
      return this.handleError(e);
    }
  }

  private async assertMember(
    tripId: string,
    user?: CurrentUserPayload,
  ): Promise<void> {
    const userId = this.access.resolveUserId(user);
    await this.access.assertTripMember(tripId, userId);
  }

  private handleError(e: unknown) {
    if (e instanceof UnauthorizedException) {
      return errorResponse(ErrorCode.UNAUTHORIZED, e.message);
    }
    if (e instanceof ForbiddenException) {
      return errorResponse(ErrorCode.FORBIDDEN, e.message);
    }
    if (e instanceof NotFoundException) {
      const raw = e.getResponse();
      if (typeof raw === 'object' && raw !== null) {
        const obj = raw as { code?: string; message?: string | string[] };
        const code =
          typeof obj.code === 'string' && obj.code.length > 0
            ? obj.code
            : ErrorCode.NOT_FOUND;
        const message = Array.isArray(obj.message)
          ? obj.message.join(', ')
          : typeof obj.message === 'string'
            ? obj.message
            : e.message;
        return errorResponse(code, message);
      }
      return errorResponse(ErrorCode.NOT_FOUND, e.message);
    }
    throw e;
  }
}

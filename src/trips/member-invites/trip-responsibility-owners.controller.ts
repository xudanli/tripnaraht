import {
  Body,
  Controller,
  Get,
  Param,
  Patch,
  UnauthorizedException,
  NotFoundException,
  ForbiddenException,
} from '@nestjs/common';
import { ApiOperation, ApiParam, ApiTags } from '@nestjs/swagger';
import { Public } from '../../auth/decorators/public.decorator';
import { CurrentUser, CurrentUserPayload } from '../../auth/decorators/current-user.decorator';
import {
  ErrorCode,
  errorResponse,
  successResponse,
} from '../../common/dto/standard-response.dto';
import { PatchTripResponsibilityOwnersDto } from './dto/trip-responsibility-owners.dto';
import { TripResponsibilityOwnersService } from './services/trip-responsibility-owners.service';

@ApiTags('trip-responsibility-owners')
@Public()
@Controller('trips/:tripId/responsibility-owners')
export class TripResponsibilityOwnersController {
  constructor(
    private readonly ownersService: TripResponsibilityOwnersService,
  ) {}

  @Get()
  @ApiOperation({ summary: '读取行程责任分配 SSOT（需登录）' })
  @ApiParam({ name: 'tripId', description: '行程 ID' })
  async getOwners(
    @Param('tripId') tripId: string,
    @CurrentUser() user?: CurrentUserPayload,
  ) {
    try {
      return successResponse(
        await this.ownersService.getOwners(tripId, this.resolveUserId(user)),
      );
    } catch (e) {
      return this.handleError(e);
    }
  }

  @Patch()
  @ApiOperation({ summary: '更新行程责任分配（顾问/OWNER）' })
  @ApiParam({ name: 'tripId', description: '行程 ID' })
  async patchOwners(
    @Param('tripId') tripId: string,
    @Body() body: PatchTripResponsibilityOwnersDto,
    @CurrentUser() user?: CurrentUserPayload,
  ) {
    try {
      return successResponse(
        await this.ownersService.patchOwners(
          tripId,
          this.resolveUserId(user),
          body,
        ),
      );
    } catch (e) {
      return this.handleError(e);
    }
  }

  private resolveUserId(user?: CurrentUserPayload): string {
    if (!user?.userId) {
      throw new UnauthorizedException('需要登录');
    }
    return user.userId;
  }

  private handleError(e: unknown) {
    if (e instanceof UnauthorizedException) {
      return errorResponse(ErrorCode.UNAUTHORIZED, e.message);
    }
    if (e instanceof NotFoundException) {
      return errorResponse(ErrorCode.NOT_FOUND, e.message);
    }
    if (e instanceof ForbiddenException) {
      return errorResponse(ErrorCode.FORBIDDEN, e.message);
    }
    throw e;
  }
}

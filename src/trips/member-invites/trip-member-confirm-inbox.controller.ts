import {
  Controller,
  Get,
  Param,
  UnauthorizedException,
  NotFoundException,
  ForbiddenException,
} from '@nestjs/common';
import { ApiOperation, ApiParam, ApiTags } from '@nestjs/swagger';
import { CurrentUser, CurrentUserPayload } from '../../auth/decorators/current-user.decorator';
import {
  ErrorCode,
  errorResponse,
  successResponse,
} from '../../common/dto/standard-response.dto';
import { MemberConfirmInboxService } from './services/member-confirm-inbox.service';

@ApiTags('trip-member-confirm-inbox')
@Controller('trips')
export class TripMemberConfirmInboxController {
  constructor(private readonly inboxService: MemberConfirmInboxService) {}

  @Get('member-invites/:code/confirm-inbox')
  @ApiOperation({ summary: '成员确认 inbox（按邀请码）' })
  @ApiParam({ name: 'code', description: '邀请码' })
  async getByInviteCode(
    @Param('code') code: string,
    @CurrentUser() user?: CurrentUserPayload,
  ) {
    try {
      return successResponse(
        await this.inboxService.getInboxByInviteCode(
          code,
          this.resolveUserId(user),
        ),
      );
    } catch (e) {
      return this.handleError(e);
    }
  }

  @Get(':tripId/members/me/confirm-inbox')
  @ApiOperation({ summary: '成员确认 inbox（当前登录成员）' })
  @ApiParam({ name: 'tripId', description: '行程 ID' })
  async getForCurrentMember(
    @Param('tripId') tripId: string,
    @CurrentUser() user?: CurrentUserPayload,
  ) {
    try {
      return successResponse(
        await this.inboxService.getInboxForTrip(
          tripId,
          this.resolveUserId(user),
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

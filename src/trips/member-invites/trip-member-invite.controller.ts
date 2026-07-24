import {
  Body,
  Controller,
  Get,
  HttpCode,
  HttpStatus,
  Param,
  Post,
  Put,
  UnauthorizedException,
  BadRequestException,
  NotFoundException,
  ForbiddenException,
  ConflictException,
} from '@nestjs/common';
import { ApiOperation, ApiParam, ApiTags } from '@nestjs/swagger';
import { Public } from '../../auth/decorators/public.decorator';
import { CurrentUser, CurrentUserPayload } from '../../auth/decorators/current-user.decorator';
import {
  ErrorCode,
  errorResponse,
  successResponse,
} from '../../common/dto/standard-response.dto';
import { SaveMemberOnboardingDraftDto } from './dto/trip-member-invite.dto';
import { TripMemberInviteService } from './services/trip-member-invite.service';

@ApiTags('trip-member-invites')
@Controller('trips/member-invites')
export class TripMemberInviteController {
  constructor(private readonly inviteService: TripMemberInviteService) {}

  @Public()
  @Get(':code')
  @ApiOperation({ summary: '成员邀请预览（公开）' })
  @ApiParam({ name: 'code', description: '邀请码' })
  async getPreview(@Param('code') code: string) {
    try {
      return successResponse(await this.inviteService.getPreview(code));
    } catch (e) {
      return this.handleError(e);
    }
  }

  @Post(':code/accept')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({ summary: '接受成员邀请（需登录）' })
  @ApiParam({ name: 'code', description: '邀请码' })
  async accept(
    @Param('code') code: string,
    @CurrentUser() user?: CurrentUserPayload,
  ) {
    try {
      return successResponse(
        await this.inviteService.accept(code, this.resolveUserId(user)),
      );
    } catch (e) {
      return this.handleError(e);
    }
  }

  @Get(':code/onboarding')
  @ApiOperation({ summary: '读取成员入职草稿（需登录）' })
  @ApiParam({ name: 'code', description: '邀请码' })
  async getOnboarding(
    @Param('code') code: string,
    @CurrentUser() user?: CurrentUserPayload,
  ) {
    try {
      return successResponse(
        await this.inviteService.getOnboarding(code, this.resolveUserId(user)),
      );
    } catch (e) {
      return this.handleError(e);
    }
  }

  @Put(':code/onboarding')
  @ApiOperation({ summary: '分步保存成员入职草稿（需登录）' })
  @ApiParam({ name: 'code', description: '邀请码' })
  async saveOnboarding(
    @Param('code') code: string,
    @Body() body: SaveMemberOnboardingDraftDto,
    @CurrentUser() user?: CurrentUserPayload,
  ) {
    try {
      return successResponse(
        await this.inviteService.saveOnboarding(
          code,
          this.resolveUserId(user),
          body,
        ),
      );
    } catch (e) {
      return this.handleError(e);
    }
  }

  @Post(':code/onboarding/submit')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({ summary: '提交成员入职问卷（需登录）' })
  @ApiParam({ name: 'code', description: '邀请码' })
  async submitOnboarding(
    @Param('code') code: string,
    @CurrentUser() user?: CurrentUserPayload,
  ) {
    try {
      return successResponse(
        await this.inviteService.submitOnboarding(
          code,
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
    if (e instanceof BadRequestException) {
      return errorResponse(ErrorCode.VALIDATION_ERROR, e.message);
    }
    if (e instanceof NotFoundException) {
      return errorResponse(ErrorCode.NOT_FOUND, e.message);
    }
    if (e instanceof ForbiddenException) {
      return errorResponse(ErrorCode.FORBIDDEN, e.message);
    }
    if (e instanceof ConflictException) {
      return errorResponse(ErrorCode.BUSINESS_ERROR, e.message);
    }
    throw e;
  }
}

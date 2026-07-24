import {
  Body,
  Controller,
  Get,
  HttpCode,
  HttpStatus,
  Param,
  Post,
  UnauthorizedException,
  BadRequestException,
  NotFoundException,
  ForbiddenException,
} from '@nestjs/common';
import { ApiBody, ApiOperation, ApiParam, ApiTags } from '@nestjs/swagger';
import { Public } from '../../auth/decorators/public.decorator';
import { CurrentUser, CurrentUserPayload } from '../../auth/decorators/current-user.decorator';
import {
  ErrorCode,
  errorResponse,
  successResponse,
} from '../../common/dto/standard-response.dto';
import { ActivityFavoriteService } from './services/activity-favorite.service';
import type { SetActivityFavoriteDto } from './dto/activity-favorite.dto';

@ApiTags('trip-activity-favorites')
@Public()
@Controller('trips/:tripId/activity-favorites')
export class ActivityFavoritesController {
  constructor(private readonly favoriteService: ActivityFavoriteService) {}

  @Get()
  @ApiOperation({ summary: '活动 Tab · 当前用户收藏列表' })
  @ApiParam({ name: 'tripId' })
  async list(
    @Param('tripId') tripId: string,
    @CurrentUser() user?: CurrentUserPayload,
  ) {
    try {
      return successResponse(
        await this.favoriteService.listFavorites(tripId, this.resolveUserId(user)),
      );
    } catch (e) {
      return this.handleError(e);
    }
  }

  @Post()
  @HttpCode(HttpStatus.OK)
  @ApiOperation({ summary: '活动 Tab · 设置/取消收藏' })
  @ApiParam({ name: 'tripId' })
  @ApiBody({
    schema: {
      type: 'object',
      properties: {
        itineraryItemId: { type: 'string' },
        placeId: { type: 'number' },
        favorited: { type: 'boolean' },
      },
      required: ['favorited'],
    },
  })
  async setFavorite(
    @Param('tripId') tripId: string,
    @Body() body: SetActivityFavoriteDto,
    @CurrentUser() user?: CurrentUserPayload,
  ) {
    try {
      if (typeof body.favorited !== 'boolean') {
        throw new BadRequestException('favorited 必须为 boolean');
      }
      return successResponse(
        await this.favoriteService.setFavorite(tripId, this.resolveUserId(user), body),
      );
    } catch (e) {
      return this.handleError(e);
    }
  }

  private resolveUserId(user?: CurrentUserPayload): string {
    if (user?.userId) return user.userId;
    if (process.env.NODE_ENV !== 'production') return 'anonymous-dev-user';
    throw new UnauthorizedException('未认证或 token 无效');
  }

  private handleError(e: unknown) {
    if (
      e instanceof UnauthorizedException ||
      e instanceof BadRequestException ||
      e instanceof NotFoundException ||
      e instanceof ForbiddenException
    ) {
      throw e;
    }
    const message = e instanceof Error ? e.message : String(e);
    return errorResponse(ErrorCode.INTERNAL_ERROR, message);
  }
}

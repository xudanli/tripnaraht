import {
  Controller,
  Delete,
  Get,
  Param,
  ParseIntPipe,
  Put,
  UseGuards,
} from '@nestjs/common';
import { ApiBearerAuth, ApiOperation, ApiTags } from '@nestjs/swagger';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';
import {
  CurrentUser,
  CurrentUserPayload,
} from '../auth/decorators/current-user.decorator';
import { successResponse } from '../common/dto/standard-response.dto';
import { HikingTrailBookmarksService } from './hiking-trail-bookmarks.service';

@ApiTags('Hiking Trail Bookmarks (F3)')
@ApiBearerAuth()
@UseGuards(JwtAuthGuard)
@Controller('hiking/trail-bookmarks')
export class HikingTrailBookmarksController {
  constructor(private readonly bookmarks: HikingTrailBookmarksService) {}

  @Get()
  @ApiOperation({ summary: '当前用户收藏的徒步路线' })
  async list(@CurrentUser() user: CurrentUserPayload) {
    return successResponse(await this.bookmarks.list(user.userId));
  }

  @Put(':routeDirectionId')
  @ApiOperation({ summary: '收藏路线' })
  async put(
    @CurrentUser() user: CurrentUserPayload,
    @Param('routeDirectionId', ParseIntPipe) routeDirectionId: number,
  ) {
    return successResponse(
      await this.bookmarks.bookmark(user.userId, routeDirectionId),
    );
  }

  @Delete(':routeDirectionId')
  @ApiOperation({ summary: '取消收藏' })
  async remove(
    @CurrentUser() user: CurrentUserPayload,
    @Param('routeDirectionId', ParseIntPipe) routeDirectionId: number,
  ) {
    return successResponse(
      await this.bookmarks.remove(user.userId, routeDirectionId),
    );
  }
}

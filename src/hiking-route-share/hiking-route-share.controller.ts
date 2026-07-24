import {
  BadRequestException,
  Body,
  Controller,
  Get,
  NotFoundException,
  Param,
  ParseIntPipe,
  Post,
  UseGuards,
} from '@nestjs/common';
import { ApiOperation, ApiParam, ApiTags } from '@nestjs/swagger';
import { Public } from '../auth/decorators/public.decorator';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';
import {
  CurrentUser,
  CurrentUserPayload,
} from '../auth/decorators/current-user.decorator';
import { successResponse, errorResponse, ErrorCode } from '../common/dto/standard-response.dto';
import { HikingRouteShareService } from './hiking-route-share.service';
import { CreateRouteDirectionShareDto } from './dto/route-direction-share.dto';

@ApiTags('Hiking Route Share')
@Controller()
export class HikingRouteShareController {
  constructor(private readonly shareService: HikingRouteShareService) {}

  @UseGuards(JwtAuthGuard)
  @Post('hiking/route-directions/:routeDirectionId/share')
  @ApiOperation({ summary: '创建徒步路线分享链接' })
  @ApiParam({ name: 'routeDirectionId', type: Number })
  async createShare(
    @Param('routeDirectionId', ParseIntPipe) routeDirectionId: number,
    @Body() dto: CreateRouteDirectionShareDto,
    @CurrentUser() user: CurrentUserPayload,
  ) {
    try {
      const data = await this.shareService.createShare(
        user.userId,
        routeDirectionId,
        dto,
      );
      return successResponse(data);
    } catch (error: unknown) {
      if (error instanceof NotFoundException) {
        return errorResponse(ErrorCode.NOT_FOUND, error.message);
      }
      throw error;
    }
  }

  @Public()
  @Get('hiking/route-directions/shared/:shareToken')
  @ApiOperation({ summary: '通过分享 token 获取徒步路线（公开）' })
  @ApiParam({ name: 'shareToken', type: String })
  async getSharedRoute(@Param('shareToken') shareToken: string) {
    try {
      const data = await this.shareService.getByShareToken(shareToken);
      return successResponse(data);
    } catch (error: unknown) {
      if (error instanceof NotFoundException) {
        return errorResponse(ErrorCode.NOT_FOUND, error.message);
      }
      if (error instanceof BadRequestException) {
        return errorResponse(ErrorCode.VALIDATION_ERROR, error.message);
      }
      throw error;
    }
  }
}

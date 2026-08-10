import {
  BadRequestException,
  Body,
  ConflictException,
  Controller,
  Delete,
  ForbiddenException,
  Get,
  HttpCode,
  HttpException,
  HttpStatus,
  NotFoundException,
  Param,
  Patch,
  Post,
  UnauthorizedException,
} from '@nestjs/common';
import {
  ApiBearerAuth,
  ApiOperation,
  ApiParam,
  ApiTags,
} from '@nestjs/swagger';
import { Public } from '../../auth/decorators/public.decorator';
import { CurrentUser, CurrentUserPayload } from '../../auth/decorators/current-user.decorator';
import {
  ErrorCode,
  errorResponse,
  successResponse,
} from '../../common/dto/standard-response.dto';
import {
  CreateMyPackingListItemDto,
  UpdateMyPackingListItemDto,
} from './dto/team-tasks.dto';
import { TeamTasksService } from './services/team-tasks.service';

@ApiTags('trip-my-packing-list')
@ApiBearerAuth()
@Public()
@Controller('trips/:tripId/my-packing-list')
export class MyPackingListController {
  constructor(private readonly tasks: TeamTasksService) {}

  @Get()
  @ApiOperation({ summary: '当前用户个人打包勾选清单' })
  @ApiParam({ name: 'tripId' })
  async list(
    @Param('tripId') tripId: string,
    @CurrentUser() user?: CurrentUserPayload,
  ) {
    try {
      const data = await this.tasks.getMyPackingList(
        tripId,
        this.resolveUserId(user),
      );
      return successResponse(data);
    } catch (e) {
      return this.handleErrorOrThrow(e);
    }
  }

  @Post('items')
  @HttpCode(HttpStatus.CREATED)
  @ApiOperation({ summary: '手动新增一项个人打包' })
  async createItem(
    @Param('tripId') tripId: string,
    @Body() body: CreateMyPackingListItemDto,
    @CurrentUser() user?: CurrentUserPayload,
  ) {
    try {
      const data = await this.tasks.createMyPackingListItem(
        tripId,
        this.resolveUserId(user),
        body,
      );
      return successResponse(data);
    } catch (e) {
      return this.handleErrorOrThrow(e);
    }
  }

  @Patch('items/:id')
  @ApiOperation({ summary: '勾选 / 取消个人打包项' })
  async updateItem(
    @Param('tripId') tripId: string,
    @Param('id') id: string,
    @Body() body: UpdateMyPackingListItemDto,
    @CurrentUser() user?: CurrentUserPayload,
  ) {
    try {
      const data = await this.tasks.updateMyPackingListItem(
        tripId,
        this.resolveUserId(user),
        id,
        body,
      );
      return successResponse(data);
    } catch (e) {
      return this.handleErrorOrThrow(e);
    }
  }

  @Delete('items/:id')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({ summary: '删除一项个人打包' })
  async deleteItem(
    @Param('tripId') tripId: string,
    @Param('id') id: string,
    @CurrentUser() user?: CurrentUserPayload,
  ) {
    try {
      const data = await this.tasks.deleteMyPackingListItem(
        tripId,
        this.resolveUserId(user),
        id,
      );
      return successResponse(data);
    } catch (e) {
      return this.handleErrorOrThrow(e);
    }
  }

  private resolveUserId(user?: CurrentUserPayload): string {
    if (user?.userId) return user.userId;
    if (process.env.NODE_ENV !== 'production') return 'anonymous-dev-user';
    throw new UnauthorizedException('未认证或 token 无效');
  }

  private handleErrorOrThrow(e: unknown) {
    if (
      e instanceof UnauthorizedException ||
      e instanceof ForbiddenException ||
      e instanceof NotFoundException ||
      e instanceof BadRequestException ||
      e instanceof ConflictException ||
      e instanceof HttpException
    ) {
      throw e;
    }
    const message = e instanceof Error ? e.message : String(e);
    return errorResponse(ErrorCode.INTERNAL_ERROR, message);
  }
}

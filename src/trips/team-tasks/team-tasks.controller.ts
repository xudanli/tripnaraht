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
  Query,
  Res,
  UnauthorizedException,
} from '@nestjs/common';
import {
  ApiBearerAuth,
  ApiOperation,
  ApiParam,
  ApiQuery,
  ApiResponse,
  ApiTags,
} from '@nestjs/swagger';
import { Public } from '../../auth/decorators/public.decorator';
import { CurrentUser, CurrentUserPayload } from '../../auth/decorators/current-user.decorator';
import {
  ErrorCode,
  errorResponse,
  successResponse,
} from '../../common/dto/standard-response.dto';
import { ApiSuccessResponseDto } from '../../common/dto/api-response.dto';
import {
  CreateTeamTaskDto,
  FromPackingTemplateDto,
  FromReadinessDto,
  RemindTeamTasksDto,
  UpdateTeamTaskDto,
} from './dto/team-tasks.dto';
import { TeamTasksService } from './services/team-tasks.service';
import type { TeamTaskListScope } from './types/team-tasks.types';

@ApiTags('trip-team-tasks')
@ApiBearerAuth()
@Public()
@Controller('trips/:tripId/team-tasks')
export class TeamTasksController {
  constructor(private readonly tasks: TeamTasksService) {}

  @Get()
  @ApiOperation({ summary: '团队任务列表 + 统计' })
  @ApiParam({ name: 'tripId' })
  @ApiQuery({
    name: 'scope',
    required: false,
    enum: ['all', 'mine', 'open'],
  })
  @ApiQuery({
    name: 'sourceType',
    required: false,
    description: '可选过滤，如 itinerary_item',
  })
  @ApiQuery({
    name: 'refId',
    required: false,
    description: '可选过滤，配合 sourceType（如 itineraryItemId）',
  })
  @ApiResponse({ status: 200, type: ApiSuccessResponseDto })
  async list(
    @Param('tripId') tripId: string,
    @Query('scope') scope: TeamTaskListScope = 'all',
    @Query('sourceType') sourceType?: string,
    @Query('refId') refId?: string,
    @CurrentUser() user?: CurrentUserPayload,
  ) {
    try {
      const normalized = this.normalizeScope(scope);
      const data = await this.tasks.listTasks(
        tripId,
        this.resolveUserId(user),
        normalized,
        {
          ...(sourceType ? { sourceType } : {}),
          ...(refId ? { refId } : {}),
        },
      );
      return successResponse(data);
    } catch (e) {
      return this.handleErrorOrThrow(e);
    }
  }

  @Post()
  @ApiOperation({
    summary: '新建团队任务（itinerary_item 同源去重时幂等返回已有任务）',
  })
  async create(
    @Param('tripId') tripId: string,
    @Body() body: CreateTeamTaskDto,
    @CurrentUser() user?: CurrentUserPayload,
    @Res({ passthrough: true }) res?: { status: (code: number) => void },
  ) {
    try {
      const result = await this.tasks.createTask(
        tripId,
        this.resolveUserId(user),
        body,
      );
      res?.status(result.created ? HttpStatus.CREATED : HttpStatus.OK);
      return successResponse(result.task);
    } catch (e) {
      return this.handleErrorOrThrow(e);
    }
  }

  @Post('from-packing-template')
  @HttpCode(HttpStatus.CREATED)
  @ApiOperation({ summary: '按打包模板批量生成任务或个人清单' })
  async fromPackingTemplate(
    @Param('tripId') tripId: string,
    @Body() body: FromPackingTemplateDto,
    @CurrentUser() user?: CurrentUserPayload,
  ) {
    try {
      const data = await this.tasks.createFromPackingTemplate(
        tripId,
        this.resolveUserId(user),
        body,
      );
      return successResponse(data);
    } catch (e) {
      return this.handleErrorOrThrow(e);
    }
  }

  @Post('from-readiness')
  @HttpCode(HttpStatus.CREATED)
  @ApiOperation({ summary: '从准备报告认领为任务' })
  async fromReadiness(
    @Param('tripId') tripId: string,
    @Body() body: FromReadinessDto,
    @CurrentUser() user?: CurrentUserPayload,
  ) {
    try {
      const data = await this.tasks.createFromReadiness(
        tripId,
        this.resolveUserId(user),
        body,
      );
      return successResponse(data);
    } catch (e) {
      return this.handleErrorOrThrow(e);
    }
  }

  @Post('remind')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({ summary: '提醒有待办的成员' })
  async remind(
    @Param('tripId') tripId: string,
    @Body() body: RemindTeamTasksDto,
    @CurrentUser() user?: CurrentUserPayload,
  ) {
    try {
      const data = await this.tasks.remindMembers(
        tripId,
        this.resolveUserId(user),
        body,
      );
      return successResponse(data);
    } catch (e) {
      return this.handleErrorOrThrow(e);
    }
  }

  @Post(':taskId/claim')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({ summary: '领取任务' })
  async claim(
    @Param('tripId') tripId: string,
    @Param('taskId') taskId: string,
    @CurrentUser() user?: CurrentUserPayload,
  ) {
    try {
      const data = await this.tasks.claimTask(
        tripId,
        taskId,
        this.resolveUserId(user),
      );
      return successResponse(data);
    } catch (e) {
      return this.handleErrorOrThrow(e);
    }
  }

  @Post(':taskId/complete')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({ summary: '标记任务完成' })
  async complete(
    @Param('tripId') tripId: string,
    @Param('taskId') taskId: string,
    @CurrentUser() user?: CurrentUserPayload,
  ) {
    try {
      const data = await this.tasks.completeTask(
        tripId,
        taskId,
        this.resolveUserId(user),
      );
      return successResponse(data);
    } catch (e) {
      return this.handleErrorOrThrow(e);
    }
  }

  @Post(':taskId/reopen')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({ summary: '重新打开已完成任务（done → claimed）' })
  async reopen(
    @Param('tripId') tripId: string,
    @Param('taskId') taskId: string,
    @CurrentUser() user?: CurrentUserPayload,
  ) {
    try {
      const data = await this.tasks.reopenTask(
        tripId,
        taskId,
        this.resolveUserId(user),
      );
      return successResponse(data);
    } catch (e) {
      return this.handleErrorOrThrow(e);
    }
  }

  @Patch(':taskId')
  @ApiOperation({ summary: '更新任务（标题 / 负责人 / 截止 / 备注）' })
  async update(
    @Param('tripId') tripId: string,
    @Param('taskId') taskId: string,
    @Body() body: UpdateTeamTaskDto,
    @CurrentUser() user?: CurrentUserPayload,
  ) {
    try {
      const data = await this.tasks.updateTask(
        tripId,
        taskId,
        this.resolveUserId(user),
        body,
      );
      return successResponse(data);
    } catch (e) {
      return this.handleErrorOrThrow(e);
    }
  }

  @Delete(':taskId')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({ summary: '取消任务（软删 → cancelled）' })
  async remove(
    @Param('tripId') tripId: string,
    @Param('taskId') taskId: string,
    @CurrentUser() user?: CurrentUserPayload,
  ) {
    try {
      const data = await this.tasks.deleteTask(
        tripId,
        taskId,
        this.resolveUserId(user),
      );
      return successResponse(data);
    } catch (e) {
      return this.handleErrorOrThrow(e);
    }
  }

  private normalizeScope(scope?: string): TeamTaskListScope {
    if (scope === 'mine' || scope === 'open' || scope === 'all') return scope;
    if (!scope) return 'all';
    throw new BadRequestException({
      code: ErrorCode.VALIDATION_ERROR,
      message: 'scope 须为 all | mine | open',
    });
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

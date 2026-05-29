/**
 * Planning Workbench Admin API
 *
 * @Public 跳过全局 JwtAuthGuard；鉴权由 AdminStrictAuthGuard（管理员 JWT 或 x-admin-god-key）。
 */
import { Controller, Get, Logger, Param, Query, UseGuards } from '@nestjs/common';
import {
  ApiBearerAuth,
  ApiHeader,
  ApiOperation,
  ApiParam,
  ApiQuery,
  ApiResponse,
  ApiTags,
} from '@nestjs/swagger';
import { Public } from '../auth/decorators/public.decorator';
import { AdminStrictAuthGuard } from '../admin/guards/admin-strict-auth.guard';
import { successResponse, errorResponse, ErrorCode } from '../common/dto/standard-response.dto';
import { ApiSuccessResponseDto, ApiErrorResponseDto } from '../common/dto/api-response.dto';
import { PlanningWorkbenchAdminService } from './services/planning-workbench-admin.service';

@ApiTags('planning-workbench-admin')
@Controller('planning-workbench/admin')
@Public()
@UseGuards(AdminStrictAuthGuard)
@ApiBearerAuth()
@ApiHeader({
  name: 'x-admin-god-key',
  required: false,
  description: 'Optional when ADMIN_GOD_API_KEY is set (alternative to Bearer admin JWT)',
})
export class PlanningWorkbenchAdminController {
  private readonly logger = new Logger(PlanningWorkbenchAdminController.name);

  constructor(private readonly planningWorkbenchAdminService: PlanningWorkbenchAdminService) {}

  @Get('sessions')
  @ApiOperation({
    summary: '获取规划会话列表（管理接口）',
    description: '获取规划会话列表，支持分页、筛选、排序。需要管理员鉴权。',
  })
  @ApiQuery({ name: 'page', required: false, type: Number })
  @ApiQuery({ name: 'limit', required: false, type: Number })
  @ApiQuery({ name: 'tripId', required: false, type: String })
  @ApiQuery({ name: 'userId', required: false, type: String })
  @ApiQuery({ name: 'status', required: false, enum: ['DRAFT', 'PROPOSED', 'NEED_CONFIRM', 'LOCKED'] })
  @ApiQuery({ name: 'startDate', required: false, type: String })
  @ApiQuery({ name: 'endDate', required: false, type: String })
  @ApiQuery({ name: 'sortBy', required: false, type: String })
  @ApiQuery({ name: 'sortOrder', required: false, enum: ['asc', 'desc'] })
  @ApiResponse({ status: 200, description: '成功返回会话列表', type: ApiSuccessResponseDto })
  @ApiResponse({ status: 401, description: '未授权', type: ApiErrorResponseDto })
  async getAdminSessions(@Query() query: Record<string, string | undefined>) {
    try {
      const result = await this.planningWorkbenchAdminService.getSessions({
        tripId: query.tripId,
        userId: query.userId,
        status: query.status as 'DRAFT' | 'PROPOSED' | 'NEED_CONFIRM' | 'LOCKED' | undefined,
        startDate: query.startDate ? new Date(query.startDate) : undefined,
        endDate: query.endDate ? new Date(query.endDate) : undefined,
        page: query.page ? parseInt(query.page, 10) : undefined,
        limit: query.limit ? parseInt(query.limit, 10) : undefined,
        sortBy: query.sortBy,
        sortOrder: query.sortOrder as 'asc' | 'desc' | undefined,
      });
      return successResponse(result);
    } catch (error: unknown) {
      const message = error instanceof Error ? error.message : String(error);
      this.logger.error(`获取会话列表失败: ${message}`, error instanceof Error ? error.stack : undefined);
      return errorResponse(ErrorCode.INTERNAL_ERROR, message);
    }
  }

  @Get('sessions/stats')
  @ApiOperation({
    summary: '获取会话统计（管理接口）',
    description: '获取规划会话的统计信息，包括成功率、平均时长等。需要管理员鉴权。',
  })
  @ApiQuery({ name: 'startDate', required: false, type: String })
  @ApiQuery({ name: 'endDate', required: false, type: String })
  @ApiResponse({ status: 200, description: '成功返回会话统计', type: ApiSuccessResponseDto })
  @ApiResponse({ status: 401, description: '未授权', type: ApiErrorResponseDto })
  async getAdminSessionStats(@Query() query: Record<string, string | undefined>) {
    try {
      const stats = await this.planningWorkbenchAdminService.getSessionStats({
        startDate: query.startDate ? new Date(query.startDate) : undefined,
        endDate: query.endDate ? new Date(query.endDate) : undefined,
      });
      return successResponse(stats);
    } catch (error: unknown) {
      const message = error instanceof Error ? error.message : String(error);
      this.logger.error(`获取会话统计失败: ${message}`, error instanceof Error ? error.stack : undefined);
      return errorResponse(ErrorCode.INTERNAL_ERROR, message);
    }
  }

  @Get('sessions/:id')
  @ApiOperation({
    summary: '获取规划会话详情（管理接口）',
    description: '获取单个规划会话的详细信息。需要管理员鉴权。',
  })
  @ApiParam({ name: 'id', description: '会话ID（PlanningPlan ID）' })
  @ApiResponse({ status: 200, description: '成功返回会话详情', type: ApiSuccessResponseDto })
  @ApiResponse({ status: 404, description: '会话不存在', type: ApiErrorResponseDto })
  @ApiResponse({ status: 401, description: '未授权', type: ApiErrorResponseDto })
  async getAdminSessionDetail(@Param('id') id: string) {
    try {
      const session = await this.planningWorkbenchAdminService.getSessionById(id);
      if (!session) {
        return errorResponse(ErrorCode.NOT_FOUND, `会话 ${id} 不存在`);
      }
      return successResponse(session);
    } catch (error: unknown) {
      const message = error instanceof Error ? error.message : String(error);
      this.logger.error(`获取会话详情失败: ${message}`, error instanceof Error ? error.stack : undefined);
      return errorResponse(ErrorCode.INTERNAL_ERROR, message);
    }
  }

  @Get('plans')
  @ApiOperation({
    summary: '获取规划方案列表（管理接口）',
    description: '获取规划方案列表，支持分页、筛选。需要管理员鉴权。',
  })
  @ApiQuery({ name: 'page', required: false, type: Number })
  @ApiQuery({ name: 'limit', required: false, type: Number })
  @ApiQuery({ name: 'tripId', required: false, type: String })
  @ApiQuery({ name: 'sessionId', required: false, type: String, description: '同 PlanningPlan.id' })
  @ApiQuery({ name: 'userId', required: false, type: String })
  @ApiQuery({ name: 'status', required: false, enum: ['DRAFT', 'PROPOSED', 'NEED_CONFIRM', 'LOCKED'] })
  @ApiQuery({ name: 'sortBy', required: false, type: String })
  @ApiQuery({ name: 'sortOrder', required: false, enum: ['asc', 'desc'] })
  @ApiResponse({ status: 200, description: '成功返回方案列表', type: ApiSuccessResponseDto })
  @ApiResponse({ status: 401, description: '未授权', type: ApiErrorResponseDto })
  async getAdminPlans(@Query() query: Record<string, string | undefined>) {
    try {
      const result = await this.planningWorkbenchAdminService.getPlans({
        tripId: query.tripId,
        sessionId: query.sessionId,
        userId: query.userId,
        status: query.status as 'DRAFT' | 'PROPOSED' | 'NEED_CONFIRM' | 'LOCKED' | undefined,
        page: query.page ? parseInt(query.page, 10) : undefined,
        limit: query.limit ? parseInt(query.limit, 10) : undefined,
        sortBy: query.sortBy,
        sortOrder: query.sortOrder as 'asc' | 'desc' | undefined,
      });
      return successResponse(result);
    } catch (error: unknown) {
      const message = error instanceof Error ? error.message : String(error);
      this.logger.error(`获取方案列表失败: ${message}`, error instanceof Error ? error.stack : undefined);
      return errorResponse(ErrorCode.INTERNAL_ERROR, message);
    }
  }

  @Get('plans/:id')
  @ApiOperation({
    summary: '获取规划方案详情（管理接口）',
    description: '获取单个规划方案的详细信息。需要管理员鉴权。',
  })
  @ApiParam({ name: 'id', description: '方案ID（PlanningPlan ID）' })
  @ApiResponse({ status: 200, description: '成功返回方案详情', type: ApiSuccessResponseDto })
  @ApiResponse({ status: 404, description: '方案不存在', type: ApiErrorResponseDto })
  @ApiResponse({ status: 401, description: '未授权', type: ApiErrorResponseDto })
  async getAdminPlanDetail(@Param('id') id: string) {
    try {
      const plan = await this.planningWorkbenchAdminService.getPlanById(id);
      if (!plan) {
        return errorResponse(ErrorCode.NOT_FOUND, `方案 ${id} 不存在`);
      }
      return successResponse(plan);
    } catch (error: unknown) {
      const message = error instanceof Error ? error.message : String(error);
      this.logger.error(`获取方案详情失败: ${message}`, error instanceof Error ? error.stack : undefined);
      return errorResponse(ErrorCode.INTERNAL_ERROR, message);
    }
  }
}

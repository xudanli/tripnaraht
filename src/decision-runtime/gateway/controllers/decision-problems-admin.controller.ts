/**
 * Admin：决策问题聚合（同日交通偏紧等）— /api/decision/admin/decision-problems*
 */

import { Controller, Get, Logger, Param, Post, Query } from '@nestjs/common';
import { ApiOperation, ApiQuery, ApiTags } from '@nestjs/swagger';
import { Public } from '../../../auth/decorators/public.decorator';
import {
  ErrorCode,
  errorResponse,
  successResponse,
} from '../../../common/dto/standard-response.dto';
import { DecisionProblemsAdminService } from '../services/decision-problems-admin.service';
import { DecisionProblemMaterializerService } from '../services/decision-problem-materializer.service';

@ApiTags('decision-admin-problems')
@Controller('decision/admin/decision-problems')
@Public()
export class DecisionProblemsAdminController {
  private readonly logger = new Logger(DecisionProblemsAdminController.name);

  constructor(
    private readonly adminProblems: DecisionProblemsAdminService,
    private readonly materializer: DecisionProblemMaterializerService,
  ) {}

  @Get()
  @ApiOperation({
    summary: 'Admin 聚合：行程决策问题列表（含同日交通偏紧）',
    description:
      '优先读 decision_problem_projections 物化表。' +
      ' 推荐：sameDayTravelOnly=true；tripId 限定单行程。',
  })
  @ApiQuery({ name: 'tripId', required: false })
  @ApiQuery({ name: 'page', required: false, type: Number })
  @ApiQuery({ name: 'limit', required: false, type: Number })
  @ApiQuery({
    name: 'scanTrips',
    required: false,
    type: Number,
    description: '投影为空时后台预热行程数',
  })
  @ApiQuery({ name: 'sameDayTravelOnly', required: false, description: 'true|1 仅同日交通偏紧类' })
  @ApiQuery({ name: 'q', required: false, description: '标题/行程关键词' })
  async list(
    @Query('tripId') tripId?: string,
    @Query('page') page?: string,
    @Query('limit') limit?: string,
    @Query('scanTrips') scanTrips?: string,
    @Query('sameDayTravelOnly') sameDayTravelOnly?: string,
    @Query('q') q?: string,
  ) {
    try {
      const data = await this.adminProblems.listProblems({
        tripId,
        page: page ? Number(page) : undefined,
        limit: limit ? Number(limit) : undefined,
        scanTrips: scanTrips ? Number(scanTrips) : undefined,
        sameDayTravelOnly:
          sameDayTravelOnly === '1' ||
          sameDayTravelOnly === 'true' ||
          sameDayTravelOnly === 'yes',
        q,
      });
      return successResponse(data);
    } catch (error: any) {
      this.logger.error(`list decision-problems failed: ${error?.message}`, error?.stack);
      return errorResponse(ErrorCode.INTERNAL_ERROR, error?.message ?? 'failed');
    }
  }

  @Post('refresh')
  @ApiOperation({ summary: 'Admin：强制物化刷新指定行程' })
  @ApiQuery({ name: 'tripId', required: true })
  async refresh(@Query('tripId') tripId?: string) {
    try {
      if (!tripId?.trim()) {
        return errorResponse(ErrorCode.BAD_REQUEST, 'tripId required');
      }
      const view = await this.materializer.refreshTrip(tripId.trim());
      return successResponse({
        tripId: tripId.trim(),
        problemCount: view?.items.length ?? 0,
      });
    } catch (error: any) {
      this.logger.error(`refresh failed: ${error?.message}`, error?.stack);
      return errorResponse(ErrorCode.INTERNAL_ERROR, error?.message ?? 'failed');
    }
  }

  @Get(':tripId/:problemId/options')
  @ApiOperation({ summary: 'Admin：决策问题候选方案' })
  async options(
    @Param('tripId') tripId: string,
    @Param('problemId') problemId: string,
  ) {
    try {
      const data = await this.adminProblems.getOptions(tripId, problemId);
      return successResponse(data);
    } catch (error: any) {
      this.logger.error(`options failed: ${error?.message}`, error?.stack);
      return errorResponse(ErrorCode.INTERNAL_ERROR, error?.message ?? 'failed');
    }
  }

  @Get(':tripId/:problemId/causal-trace')
  @ApiOperation({ summary: 'Admin：决策问题因果链回放' })
  async causalTrace(
    @Param('tripId') tripId: string,
    @Param('problemId') problemId: string,
  ) {
    try {
      const data = await this.adminProblems.getCausalTrace(tripId, problemId);
      return successResponse(data);
    } catch (error: any) {
      this.logger.error(`causal-trace failed: ${error?.message}`, error?.stack);
      return errorResponse(ErrorCode.INTERNAL_ERROR, error?.message ?? 'failed');
    }
  }

  @Get(':tripId/:problemId')
  @ApiOperation({ summary: 'Admin：决策问题详情' })
  async detail(
    @Param('tripId') tripId: string,
    @Param('problemId') problemId: string,
  ) {
    try {
      const data = await this.adminProblems.getProblemDetail(tripId, problemId);
      return successResponse(data);
    } catch (error: any) {
      this.logger.error(`detail failed: ${error?.message}`, error?.stack);
      return errorResponse(ErrorCode.INTERNAL_ERROR, error?.message ?? 'failed');
    }
  }
}

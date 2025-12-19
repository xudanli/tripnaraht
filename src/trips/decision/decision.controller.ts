// src/trips/decision/decision.controller.ts

/**
 * Decision Controller
 * 
 * 决策层 API 接口
 */

import {
  Controller,
  Post,
  Get,
  Body,
  HttpCode,
  HttpStatus,
  Logger,
} from '@nestjs/common';
import {
  ApiTags,
  ApiOperation,
  ApiResponse,
  ApiBody,
} from '@nestjs/swagger';
import { TripDecisionEngineService } from './trip-decision-engine.service';
import { ConstraintChecker } from './constraints/constraint-checker';
import { ExplainabilityService } from './explainability/explainability.service';
import { LearningService } from './learning/learning.service';
import { EvaluationService } from './evaluation/evaluation.service';
import { AdvancedConstraintsService } from './constraints/advanced-constraints.service';
import { MonitoringService } from './monitoring/monitoring.service';
import { DecisionCacheService } from './performance/cache.service';
import { BatchProcessingService } from './performance/batch.service';
import {
  GeneratePlanRequestDto,
  GeneratePlanResponseDto,
  RepairPlanRequestDto,
  ExplainPlanRequestDto,
  ExplainPlanResponseDto,
  LearnFromLogsRequestDto,
  LearnFromLogsResponseDto,
  EvaluatePlanRequestDto,
  EvaluatePlanResponseDto,
  CheckAdvancedConstraintsRequestDto,
  MonitoringMetricsResponseDto,
} from './dto/decision.dto';
import { successResponse, errorResponse, ErrorCode } from '../../common/dto/standard-response.dto';
import { ApiSuccessResponseDto, ApiErrorResponseDto } from '../../common/dto/api-response.dto';

@ApiTags('decision')
@Controller('decision')
export class DecisionController {
  private readonly logger = new Logger(DecisionController.name);

  constructor(
    private readonly decisionEngine: TripDecisionEngineService,
    private readonly constraintChecker: ConstraintChecker,
    private readonly explainabilityService: ExplainabilityService,
    private readonly learningService: LearningService,
    private readonly evaluationService: EvaluationService,
    private readonly advancedConstraintsService: AdvancedConstraintsService,
    private readonly monitoringService: MonitoringService,
    private readonly cacheService: DecisionCacheService,
    private readonly batchService: BatchProcessingService,
  ) {}

  @Post('generate-plan')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({
    summary: '生成旅行计划',
    description: '使用 Abu + Dr.Dre 策略生成初始旅行计划。系统会根据世界状态（目的地、偏好、预算等）生成可执行的计划。',
  })
  @ApiBody({ type: GeneratePlanRequestDto })
  @ApiResponse({
    status: 200,
    description: '计划生成成功',
    type: GeneratePlanResponseDto,
  })
  @ApiResponse({
    status: 400,
    description: '请求参数错误',
    type: ApiErrorResponseDto,
  })
  async generatePlan(@Body() dto: GeneratePlanRequestDto) {
    try {
      if (!dto || !dto.state) {
        return errorResponse(ErrorCode.VALIDATION_ERROR, 'state is required');
      }
      if (!dto.state.context) {
        return errorResponse(ErrorCode.VALIDATION_ERROR, 'state.context is required');
      }

      const startTime = Date.now();
      const { plan, log } = await this.decisionEngine.generatePlan(dto.state);
      const generationTime = Date.now() - startTime;

      // 记录监控
      const constraintResult = this.constraintChecker.checkPlan(
        dto.state,
        plan
      );
      const metrics = this.evaluationService.evaluatePlan(
        dto.state,
        plan,
        constraintResult
      );
      this.monitoringService.recordPlanGeneration(log, generationTime, metrics);

      return successResponse({ plan, log });
    } catch (error: any) {
      this.logger.error('Failed to generate plan:', error);
      return errorResponse(ErrorCode.INTERNAL_ERROR, error.message);
    }
  }

  @Post('repair-plan')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({
    summary: '修复旅行计划',
    description: '使用 Neptune 策略修复计划。当世界状态变化（天气、开放时间等）时，最小改动修复计划。',
  })
  @ApiBody({ type: RepairPlanRequestDto })
  @ApiResponse({
    status: 200,
    description: '计划修复成功',
    type: GeneratePlanResponseDto,
  })
  async repairPlan(@Body() dto: RepairPlanRequestDto) {
    try {
      if (!dto || !dto.state || !dto.plan) {
        return errorResponse(ErrorCode.VALIDATION_ERROR, 'state and plan are required');
      }
      if (!dto.state.context) {
        return errorResponse(ErrorCode.VALIDATION_ERROR, 'state.context is required');
      }

      const startTime = Date.now();
      const { plan, log } = this.decisionEngine.repairPlan(
        dto.state,
        dto.plan,
        dto.trigger as any
      );
      const repairTime = Date.now() - startTime;

      // 记录监控
      const constraintResult = this.constraintChecker.checkPlan(
        dto.state,
        plan
      );
      const metrics = this.evaluationService.evaluatePlan(
        dto.state,
        plan,
        constraintResult
      );
      this.monitoringService.recordPlanRepair(log, repairTime, metrics);

      return successResponse({ plan, log });
    } catch (error: any) {
      this.logger.error('Failed to repair plan:', error);
      return errorResponse(ErrorCode.INTERNAL_ERROR, error.message);
    }
  }

  @Post('check-constraints')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({
    summary: '校验计划约束',
    description: '检查计划是否违反约束（时间窗、连通性、预算、体力、天气等）。',
  })
  @ApiBody({
    schema: {
      type: 'object',
      properties: {
        state: { type: 'object' },
        plan: { type: 'object' },
      },
    },
  })
  @ApiResponse({
    status: 200,
    description: '约束检查完成',
  })
  async checkConstraints(
    @Body() body: { state: any; plan: any }
  ) {
    try {
      const result = this.constraintChecker.checkPlan(body.state, body.plan);
      return successResponse(result);
    } catch (error: any) {
      this.logger.error('Failed to check constraints:', error);
      return errorResponse(ErrorCode.INTERNAL_ERROR, error.message);
    }
  }

  @Post('explain-plan')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({
    summary: '解释计划',
    description: '生成计划的可解释性信息，包括为什么这样排、使用的策略、决策原因等。用于前端展示。',
  })
  @ApiBody({ type: ExplainPlanRequestDto })
  @ApiResponse({
    status: 200,
    description: '计划解释生成成功',
    type: ExplainPlanResponseDto,
  })
  async explainPlan(@Body() dto: ExplainPlanRequestDto) {
    try {
      const explanation = this.explainabilityService.explainPlan(
        dto.plan,
        dto.log,
        dto.violations
      );
      return successResponse({ explanation });
    } catch (error: any) {
      this.logger.error('Failed to explain plan:', error);
      return errorResponse(ErrorCode.INTERNAL_ERROR, error.message);
    }
  }

  @Post('learn-from-logs')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({
    summary: '从决策日志中学习',
    description: '分析决策日志，识别模式，生成策略调整建议。',
  })
  @ApiBody({ type: LearnFromLogsRequestDto })
  @ApiResponse({
    status: 200,
    description: '学习完成',
    type: LearnFromLogsResponseDto,
  })
  async learnFromLogs(@Body() dto: LearnFromLogsRequestDto) {
    try {
      const result = this.learningService.learnFromLogs(
        dto.logs,
        dto.userFeedback
      );
      return successResponse({ result });
    } catch (error: any) {
      this.logger.error('Failed to learn from logs:', error);
      return errorResponse(ErrorCode.INTERNAL_ERROR, error.message);
    }
  }

  @Post('evaluate-plan')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({
    summary: '评估计划指标',
    description: '计算计划的可执行率、稳定性、体验指标、成本指标等。',
  })
  @ApiBody({ type: EvaluatePlanRequestDto })
  @ApiResponse({
    status: 200,
    description: '评估完成',
    type: EvaluatePlanResponseDto,
  })
  async evaluatePlan(@Body() dto: EvaluatePlanRequestDto) {
    try {
      const metrics = this.evaluationService.evaluatePlan(
        dto.state,
        dto.plan,
        dto.constraintResult,
        dto.diff
      );
      return successResponse({ metrics });
    } catch (error: any) {
      this.logger.error('Failed to evaluate plan:', error);
      return errorResponse(ErrorCode.INTERNAL_ERROR, error.message);
    }
  }

  @Post('check-advanced-constraints')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({
    summary: '检查高级约束',
    description: '检查计划是否违反互斥组、依赖关系等高级约束。',
  })
  @ApiBody({ type: CheckAdvancedConstraintsRequestDto })
  @ApiResponse({
    status: 200,
    description: '高级约束检查完成',
  })
  async checkAdvancedConstraints(
    @Body() dto: CheckAdvancedConstraintsRequestDto
  ) {
    try {
      const mutexViolations =
        this.advancedConstraintsService.checkMutexGroups(
          dto.plan,
          dto.constraints
        );
      const dependencyViolations =
        this.advancedConstraintsService.checkDependencies(
          dto.plan,
          dto.constraints
        );

      return successResponse({
        mutexViolations,
        dependencyViolations,
      });
    } catch (error: any) {
      this.logger.error('Failed to check advanced constraints:', error);
      return errorResponse(ErrorCode.INTERNAL_ERROR, error.message);
    }
  }

  @Get('monitoring/metrics')
  @ApiOperation({
    summary: '获取监控指标',
    description: '获取实时性能指标、质量指标、使用统计和告警信息。',
  })
  @ApiResponse({
    status: 200,
    description: '监控指标获取成功',
    type: MonitoringMetricsResponseDto,
  })
  async getMonitoringMetrics() {
    try {
      const metrics = this.monitoringService.getMetrics();
      const alerts = this.monitoringService.getAlerts();

      return successResponse({ metrics, alerts });
    } catch (error: any) {
      this.logger.error('Failed to get monitoring metrics:', error);
      return errorResponse(ErrorCode.INTERNAL_ERROR, error.message);
    }
  }

  @Get('monitoring/alerts')
  @ApiOperation({
    summary: '获取告警列表',
    description: '获取所有告警或指定级别的告警。',
  })
  @ApiResponse({
    status: 200,
    description: '告警列表获取成功',
  })
  async getAlerts(@Body() body?: { level?: string }) {
    try {
      const alerts = this.monitoringService.getAlerts(
        body?.level as any
      );
      return successResponse({ alerts });
    } catch (error: any) {
      this.logger.error('Failed to get alerts:', error);
      return errorResponse(ErrorCode.INTERNAL_ERROR, error.message);
    }
  }
}


// src/trips/decision/decision-engine.controller.ts

/**
 * 决策引擎 API 控制器
 *
 * 统一入口：/api/decision-engine/v1/*
 * 封装 TripDecisionEngine、StrategyOrchestrator、ConstraintEngine、Explainability 等能力
 *
 * 参考: docs/DECISION_ENGINE_API_PRD.md
 */

import {
  Controller,
  Post,
  Get,
  Body,
  Logger,
  Optional,
  HttpCode,
  HttpStatus,
} from '@nestjs/common';
import { ApiTags, ApiOperation, ApiResponse, ApiBody } from '@nestjs/swagger';
import { TripDecisionEngineService } from './trip-decision-engine.service';
import { StrategyOrchestratorService } from './services/strategy-orchestrator.service';
import { ConstraintEngineService } from './constraints/constraint-engine.service';
import { ExplainabilityService } from './explainability/explainability.service';
import { MultiPlanGenerator } from './services/multi-plan-generator.service';
import { WorldModelContext, RoutePlanDraft } from './shared/world-model.types';
import { TripWorldState } from './world-model';
import { TripPlan } from './plan-model';
import { successResponse, errorResponse, ErrorCode } from '../../common/dto/standard-response.dto';
import { Public } from '../../auth/decorators/public.decorator';
import {
  GeneratePlanRequestDto,
  RepairPlanRequestDto,
  ValidateSafetyRequestDto,
  CheckConstraintsRequestDto,
  GenerateMultiplePlansRequestDto,
  ExplainPlanRequestDto,
  AdjustPacingRequestDto,
  ReplaceNodesRequestDto,
} from './dto/decision-engine-api.dto';

@ApiTags('decision-engine')
@Controller('decision-engine/v1')
export class DecisionEngineController {
  private readonly logger = new Logger(DecisionEngineController.name);

  constructor(
    private readonly decisionEngine: TripDecisionEngineService,
    @Optional() private readonly strategyOrchestrator?: StrategyOrchestratorService,
    @Optional() private readonly constraintEngine?: ConstraintEngineService,
    @Optional() private readonly explainabilityService?: ExplainabilityService,
    @Optional() private readonly multiPlanGenerator?: MultiPlanGenerator,
  ) {}

  @Get('health')
  @Public()
  @ApiOperation({ summary: '健康检查', description: '决策引擎服务可用性检查' })
  @ApiResponse({ status: 200, description: '服务正常' })
  health() {
    return successResponse({
      status: 'ok',
      service: 'decision-engine',
      version: '1.0',
      capabilities: {
        generatePlan: true,
        repairPlan: true,
        validateSafety: !!this.strategyOrchestrator,
        checkConstraints: !!this.constraintEngine,
        explainPlan: !!this.explainabilityService,
        generateMultiplePlans: !!this.multiPlanGenerator,
      },
    });
  }

  @Post('generate-plan')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({ summary: '生成计划', description: '根据世界状态生成行程计划' })
  @ApiBody({ type: GeneratePlanRequestDto })
  @ApiResponse({ status: 200, description: '生成成功' })
  async generatePlan(@Body() body: GeneratePlanRequestDto) {
    try {
      if (!body.state?.context) {
        return errorResponse(ErrorCode.VALIDATION_ERROR, 'state.context 是必需的');
      }
      const { plan, log } = await this.decisionEngine.generatePlan(
        body.state as TripWorldState,
        body.requestId,
      );
      return successResponse({ plan, log });
    } catch (error: any) {
      this.logger.error(`generatePlan 失败: ${error.message}`, error.stack);
      return errorResponse(ErrorCode.INTERNAL_ERROR, error.message);
    }
  }

  @Post('repair-plan')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({ summary: '修复计划', description: '天气/闭馆等变化时最小改动修复' })
  @ApiBody({ type: RepairPlanRequestDto })
  @ApiResponse({ status: 200, description: '修复成功' })
  async repairPlan(@Body() body: RepairPlanRequestDto) {
    try {
      if (!body.state?.context) {
        return errorResponse(ErrorCode.VALIDATION_ERROR, 'state.context 是必需的');
      }
      if (!body.plan?.days) {
        return errorResponse(ErrorCode.VALIDATION_ERROR, 'plan.days 是必需的');
      }
      const trigger = (body.trigger || 'signal_update') as any;
      const { plan, log } = await this.decisionEngine.repairPlan(
        body.state as TripWorldState,
        body.plan as TripPlan,
        trigger,
      );
      return successResponse({ plan, log });
    } catch (error: any) {
      this.logger.error(`repairPlan 失败: ${error.message}`, error.stack);
      return errorResponse(ErrorCode.INTERNAL_ERROR, error.message);
    }
  }

  @Post('validate-safety')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({ summary: '安全校验', description: 'Abu 策略校验物理安全、危险区域' })
  @ApiBody({ type: ValidateSafetyRequestDto })
  @ApiResponse({ status: 200, description: '校验完成' })
  async validateSafety(@Body() body: ValidateSafetyRequestDto) {
    try {
      if (!this.strategyOrchestrator) {
        return errorResponse(ErrorCode.INTERNAL_ERROR, 'StrategyOrchestrator 不可用');
      }
      if (!body.tripId) {
        return errorResponse(ErrorCode.VALIDATION_ERROR, 'tripId 是必需的');
      }
      if (!body.plan) {
        return errorResponse(ErrorCode.VALIDATION_ERROR, 'plan 是必需的');
      }
      if (!body.worldContext) {
        return errorResponse(ErrorCode.VALIDATION_ERROR, 'worldContext 是必需的');
      }
      const planWithTripId = {
        ...body.plan,
        tripId: body.plan.tripId || body.tripId,
      } as RoutePlanDraft;
      const result = await this.strategyOrchestrator.run(
        body.worldContext as WorldModelContext,
        planWithTripId,
      );
      return successResponse({
        allowed: result.allowed,
        violations: result.allowed ? [] : (result.logs || []).filter((l: any) => l.persona === 'ABU'),
        alternativeRoutes: [],
        message: result.allowed ? '行程通过安全校验' : '行程包含安全违规项',
      });
    } catch (error: any) {
      this.logger.error(`validateSafety 失败: ${error.message}`, error.stack);
      return errorResponse(ErrorCode.INTERNAL_ERROR, error.message);
    }
  }

  @Post('check-constraints')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({ summary: '约束校验', description: '检查计划是否满足约束' })
  @ApiBody({ type: CheckConstraintsRequestDto })
  @ApiResponse({ status: 200, description: '校验完成' })
  async checkConstraints(@Body() body: CheckConstraintsRequestDto) {
    try {
      if (!body.state?.context) {
        return errorResponse(ErrorCode.VALIDATION_ERROR, 'state.context 是必需的');
      }
      if (!body.plan?.days) {
        return errorResponse(ErrorCode.VALIDATION_ERROR, 'plan.days 是必需的');
      }
      if (!this.constraintEngine) {
        return successResponse({
          feasible: true,
          violations: [],
          infeasibilityExplanation: null,
          rawCheckResult: { violations: [], isValid: true, summary: { errorCount: 0, warningCount: 0, infoCount: 0 } },
        });
      }
      const result = await this.constraintEngine.isFeasible(
        body.state as TripWorldState,
        body.plan as TripPlan,
      );
      return successResponse({
        feasible: result.feasible,
        violations: result.violations,
        infeasibilityExplanation: result.infeasibilityExplanation,
      });
    } catch (error: any) {
      this.logger.error(`checkConstraints 失败: ${error.message}`, error.stack);
      return errorResponse(ErrorCode.INTERNAL_ERROR, error.message);
    }
  }

  @Post('generate-multiple-plans')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({ summary: '多方案生成', description: '生成 2–N 个不同权衡方案' })
  @ApiBody({ type: GenerateMultiplePlansRequestDto })
  @ApiResponse({ status: 200, description: '生成成功' })
  async generateMultiplePlans(@Body() body: GenerateMultiplePlansRequestDto) {
    try {
      if (!body.state?.context) {
        return errorResponse(ErrorCode.VALIDATION_ERROR, 'state.context 是必需的');
      }
      if (!this.decisionEngine.generateMultiplePlans) {
        return errorResponse(ErrorCode.INTERNAL_ERROR, '多方案生成能力不可用');
      }
      const { variants, log } = await this.decisionEngine.generateMultiplePlans(
        body.state as TripWorldState,
        body.requestId,
      );
      return successResponse({ variants, log });
    } catch (error: any) {
      this.logger.error(`generateMultiplePlans 失败: ${error.message}`, error.stack);
      return errorResponse(ErrorCode.INTERNAL_ERROR, error.message);
    }
  }

  @Post('explain-plan')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({ summary: '决策解释', description: '返回计划的可解释 UI 数据' })
  @ApiBody({ type: ExplainPlanRequestDto })
  @ApiResponse({ status: 200, description: '解释成功' })
  async explainPlan(@Body() body: ExplainPlanRequestDto) {
    try {
      if (!body.plan?.days) {
        return errorResponse(ErrorCode.VALIDATION_ERROR, 'plan.days 是必需的');
      }
      if (!body.log) {
        return errorResponse(ErrorCode.VALIDATION_ERROR, 'log 是必需的');
      }
      if (!this.explainabilityService) {
        return successResponse({
          summary: '决策解释服务不可用',
          whyThisPlan: [],
          slots: [],
          violations: body.violations || [],
        });
      }
      const explanation = this.explainabilityService.explainPlan(
        body.plan as TripPlan,
        body.log as any,
        body.violations as any[],
      );
      return successResponse(explanation);
    } catch (error: any) {
      this.logger.error(`explainPlan 失败: ${error.message}`, error.stack);
      return errorResponse(ErrorCode.INTERNAL_ERROR, error.message);
    }
  }

  @Post('adjust-pacing')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({ summary: '节奏调整', description: 'Dr.Dre 策略调整行程节奏' })
  @ApiBody({ type: AdjustPacingRequestDto })
  @ApiResponse({ status: 200, description: '调整完成' })
  async adjustPacing(@Body() body: AdjustPacingRequestDto) {
    try {
      if (!this.strategyOrchestrator) {
        return errorResponse(ErrorCode.INTERNAL_ERROR, 'StrategyOrchestrator 不可用');
      }
      if (!body.tripId || !body.plan || !body.worldContext) {
        return errorResponse(ErrorCode.VALIDATION_ERROR, 'tripId、plan、worldContext 是必需的');
      }
      const planWithTripId = {
        ...body.plan,
        tripId: body.plan.tripId || body.tripId,
      } as RoutePlanDraft;
      const result = await this.strategyOrchestrator.run(
        body.worldContext as WorldModelContext,
        planWithTripId,
      );
      if (result.plan && result.finalAction === 'ADJUST') {
        return successResponse({
          success: true,
          adjustedPlan: result.plan,
          changes: (result.logs || []).filter((l: any) => l.persona === 'DR_DRE'),
          message: '行程节奏已自动调整',
        });
      }
      return successResponse({
        success: false,
        message: '行程节奏无需调整',
      });
    } catch (error: any) {
      this.logger.error(`adjustPacing 失败: ${error.message}`, error.stack);
      return errorResponse(ErrorCode.INTERNAL_ERROR, error.message);
    }
  }

  @Post('replace-nodes')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({ summary: '节点替换', description: 'Neptune 策略替换不可用节点' })
  @ApiBody({ type: ReplaceNodesRequestDto })
  @ApiResponse({ status: 200, description: '替换完成' })
  async replaceNodes(@Body() body: ReplaceNodesRequestDto) {
    try {
      if (!this.strategyOrchestrator) {
        return errorResponse(ErrorCode.INTERNAL_ERROR, 'StrategyOrchestrator 不可用');
      }
      if (!body.tripId || !body.plan || !body.worldContext || !body.unavailableNodes?.length) {
        return errorResponse(ErrorCode.VALIDATION_ERROR, 'tripId、plan、worldContext、unavailableNodes 是必需的');
      }
      const planWithTripId = {
        ...body.plan,
        tripId: body.plan.tripId || body.tripId,
      } as RoutePlanDraft;
      const updatedPlan: RoutePlanDraft = {
        ...planWithTripId,
        segments: (planWithTripId.segments || []).map((segment: any) => {
          const unavailable = body.unavailableNodes.find((u) => u.nodeId === segment.segmentId);
          return unavailable
            ? {
                ...segment,
                metadata: {
                  ...segment.metadata,
                  status: 'UNAVAILABLE',
                  reason: unavailable.reason,
                },
              }
            : segment;
        }),
      };
      const result = await this.strategyOrchestrator.run(
        body.worldContext as WorldModelContext,
        updatedPlan,
      );
      if (result.plan && result.finalAction === 'REPLACE') {
        return successResponse({
          success: true,
          replacedPlan: result.plan,
          replacements: (result.logs || []).filter((l: any) => l.persona === 'NEPTUNE'),
          message: '路线节点已自动替换',
        });
      }
      return successResponse({
        success: false,
        message: '无法找到合适的替换节点',
      });
    } catch (error: any) {
      this.logger.error(`replaceNodes 失败: ${error.message}`, error.stack);
      return errorResponse(ErrorCode.INTERNAL_ERROR, error.message);
    }
  }
}

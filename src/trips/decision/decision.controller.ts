// src/trips/decision/decision.controller.ts
import { Controller, Post, Get, Body, Param, Query, Logger } from '@nestjs/common';
import { ApiTags, ApiOperation, ApiResponse, ApiParam, ApiBody } from '@nestjs/swagger';
import { TripDecisionEngineService } from './trip-decision-engine.service';
import { StrategyOrchestratorService } from './services/strategy-orchestrator.service';
import { WorldModelContext, RoutePlanDraft } from './shared/world-model.types';
import { successResponse, errorResponse, ErrorCode } from '../../common/dto/standard-response.dto';
import { ApiSuccessResponseDto, ApiErrorResponseDto } from '../../common/dto/api-response.dto';

@ApiTags('decision')
@Controller('decision')
export class DecisionController {
  private readonly logger = new Logger(DecisionController.name);

  constructor(
    private readonly decisionEngine: TripDecisionEngineService,
    private readonly strategyOrchestrator: StrategyOrchestratorService
  ) {}

  @Post('validate-safety')
  @ApiOperation({
    summary: '安全规则校验行程',
    description: '使用 Abu 策略校验行程中的物理安全违规项，识别危险区域并生成备选路线',
  })
  @ApiBody({
    schema: {
      type: 'object',
      required: ['tripId', 'plan'],
      properties: {
        tripId: { type: 'string', description: '行程 ID' },
        plan: { type: 'object', description: '路线计划草案' },
        worldContext: { type: 'object', description: '世界模型上下文' },
      },
    },
  })
  @ApiResponse({
    status: 200,
    description: '校验完成',
    type: ApiSuccessResponseDto,
  })
  async validateSafety(
    @Body() body: {
      tripId: string;
      plan: RoutePlanDraft;
      worldContext: WorldModelContext;
    }
  ) {
    try {
      // 使用 StrategyOrchestrator 执行 Abu 校验
      const result = await this.strategyOrchestrator.run(body.worldContext, body.plan);

      if (!result.allowed) {
        // 生成备选路线建议
        const alternativeRoutes = await this.generateAlternativeRoutes(
          body.worldContext,
          body.plan,
          result.logs
        );

        return successResponse({
          allowed: false,
          violations: result.logs.filter(log => log.persona === 'ABU'),
          alternativeRoutes,
          message: '行程包含安全违规项，已生成备选路线',
        });
      }

      return successResponse({
        allowed: true,
        violations: [],
        message: '行程通过安全校验',
      });
    } catch (error: any) {
      this.logger.error(`安全校验失败: ${error.message}`, error.stack);
      return errorResponse(ErrorCode.INTERNAL_ERROR, error.message);
    }
  }

  @Post('adjust-pacing')
  @ApiOperation({
    summary: '行程节奏智能调整',
    description: '使用 Dr.Dre 策略调整行程节奏，拆分密集活动并插入缓冲时间',
  })
  @ApiBody({
    schema: {
      type: 'object',
      required: ['tripId', 'plan', 'worldContext'],
      properties: {
        tripId: { type: 'string', description: '行程 ID' },
        plan: { type: 'object', description: '路线计划草案' },
        worldContext: { type: 'object', description: '世界模型上下文' },
      },
    },
  })
  @ApiResponse({
    status: 200,
    description: '节奏调整完成',
    type: ApiSuccessResponseDto,
  })
  async adjustPacing(
    @Body() body: {
      tripId: string;
      plan: RoutePlanDraft;
      worldContext: WorldModelContext;
    }
  ) {
    try {
      // 使用 StrategyOrchestrator 执行 Dr.Dre 调整
      const result = await this.strategyOrchestrator.run(body.worldContext, body.plan);

      if (result.plan && result.finalAction === 'ADJUST') {
        return successResponse({
          success: true,
          adjustedPlan: result.plan,
          changes: result.logs.filter(log => log.persona === 'DR_DRE'),
          message: '行程节奏已自动调整，已拆分密集活动并插入缓冲时间',
        });
      }

      return successResponse({
        success: false,
        message: '行程节奏无需调整',
      });
    } catch (error: any) {
      this.logger.error(`节奏调整失败: ${error.message}`, error.stack);
      return errorResponse(ErrorCode.INTERNAL_ERROR, error.message);
    }
  }

  @Post('replace-nodes')
  @ApiOperation({
    summary: '路线节点智能替换',
    description: '使用 Neptune 策略替换不可用的路线节点，保持路线哲学不变',
  })
  @ApiBody({
    schema: {
      type: 'object',
      required: ['tripId', 'plan', 'worldContext', 'unavailableNodes'],
      properties: {
        tripId: { type: 'string', description: '行程 ID' },
        plan: { type: 'object', description: '路线计划草案' },
        worldContext: { type: 'object', description: '世界模型上下文' },
        unavailableNodes: {
          type: 'array',
          description: '不可用的节点列表',
          items: {
            type: 'object',
            properties: {
              nodeId: { type: 'string' },
              reason: { type: 'string' },
            },
          },
        },
      },
    },
  })
  @ApiResponse({
    status: 200,
    description: '节点替换完成',
    type: ApiSuccessResponseDto,
  })
  async replaceNodes(
    @Body() body: {
      tripId: string;
      plan: RoutePlanDraft;
      worldContext: WorldModelContext;
      unavailableNodes: Array<{ nodeId: string; reason: string }>;
    }
  ) {
    try {
      // 标记不可用节点（通过 metadata）
      const updatedPlan: RoutePlanDraft = {
        ...body.plan,
        segments: body.plan.segments.map(segment => {
          const unavailable = body.unavailableNodes.find(u => u.nodeId === segment.segmentId);
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

      // 使用 StrategyOrchestrator 执行 Neptune 替换
      const result = await this.strategyOrchestrator.run(body.worldContext, updatedPlan);

      if (result.plan && result.finalAction === 'REPLACE') {
        return successResponse({
          success: true,
          replacedPlan: result.plan,
          replacements: result.logs.filter(log => log.persona === 'NEPTUNE'),
          message: '路线节点已自动替换，保持路线核心风格不变',
        });
      }

      return successResponse({
        success: false,
        message: '无法找到合适的替换节点',
      });
    } catch (error: any) {
      this.logger.error(`节点替换失败: ${error.message}`, error.stack);
      return errorResponse(ErrorCode.INTERNAL_ERROR, error.message);
    }
  }

  /**
   * 生成备选路线
   */
  private async generateAlternativeRoutes(
    worldContext: WorldModelContext,
    originalPlan: RoutePlanDraft,
    violationLogs: any[]
  ): Promise<Array<{
    description: string;
    plan: RoutePlanDraft;
    reason: string;
  }>> {
    // TODO: 实现备选路线生成逻辑
    // 这里简化处理，实际应该调用 Neptune 策略生成绕开危险区域的路线
    return [];
    }
  }

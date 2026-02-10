// src/agent/trip-detail.controller.ts
/**
 * Trip Detail Controller
 * 
 * 行程详情页 API 接口
 */

import { Controller, Get, Post, Body, Param, Query, HttpCode, HttpStatus } from '@nestjs/common';
import { ApiTags, ApiOperation, ApiResponse, ApiBody, ApiParam, ApiQuery } from '@nestjs/swagger';
import { TripDetailAgentService, TripDetailAgentRequest, TripDetailAgentResponse } from './services/trip-detail-agent.service';
import { successResponse, errorResponse, ErrorCode } from '../common/dto/standard-response.dto';
import { Public } from '../auth/decorators/public.decorator';

@ApiTags('trip-detail')
@Controller('trip-detail')
export class TripDetailController {
  constructor(
    private readonly tripDetailAgent: TripDetailAgentService,
  ) {}

  /**
   * 执行行程详情页流程
   */
  @Public()
  @Post('execute')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({
    summary: '执行行程详情页流程',
    description: `
行程详情页的 Agent，负责"理解与掌控旅行现状"。

支持的操作：
- get_status: 理解当前状态
- get_health: 分析健康度
- explain_decisions: 解释决策
- show_evidence: 展示证据
- get_full: 获取完整信息
    `.trim(),
  })
  @ApiBody({
    description: '行程详情页请求',
    schema: {
      type: 'object',
      properties: {
        tripId: { type: 'string' },
        action: {
          type: 'string',
          enum: ['get_status', 'get_health', 'explain_decisions', 'show_evidence', 'get_full'],
        },
        decisionId: { type: 'string' },
        evidenceRefs: { type: 'array', items: { type: 'string' } },
      },
      required: ['tripId', 'action'],
    },
  })
  @ApiResponse({
    status: 200,
    description: '执行成功',
  })
  async execute(@Body() request: TripDetailAgentRequest) {
    try {
      const result = await this.tripDetailAgent.execute(request);
      return successResponse(result);
    } catch (error: any) {
      return errorResponse(ErrorCode.INTERNAL_ERROR, error.message);
    }
  }

  /**
   * 获取行程状态（GET 方式）
   */
  @Public()
  @Get(':tripId/status')
  @ApiOperation({
    summary: '获取行程状态',
    description: '理解当前行程状态（规划中/进行中/已完成）',
  })
  @ApiParam({ name: 'tripId', description: '行程 ID' })
  @ApiResponse({
    status: 200,
    description: '获取成功',
  })
  async getStatus(@Param('tripId') tripId: string) {
    try {
      const result = await this.tripDetailAgent.execute({
        tripId,
        action: 'get_status',
      });
      return successResponse(result.uiOutput.status);
    } catch (error: any) {
      return errorResponse(ErrorCode.INTERNAL_ERROR, error.message);
    }
  }

  /**
   * 获取健康度指标的详细解释
   * 
   * 支持维度：schedule, budget, pace, feasibility
   * 
   * 注意：此路由必须放在 :tripId/health 之前，因为 NestJS 按顺序匹配路由
   */
  @Public()
  @Get(':tripId/metrics/:dimension/explanation')
  @ApiOperation({
    summary: '获取健康度指标的详细解释',
    description: '获取指定健康度维度（schedule/budget/pace/feasibility）的详细解释，包括计算方法、理想范围、改进建议等',
  })
  @ApiParam({ 
    name: 'tripId', 
    description: '行程 ID',
    example: 'f3626ff1-7a9b-46d9-8b8b-7f53a14583b1'
  })
  @ApiParam({ 
    name: 'dimension', 
    description: '健康度维度',
    enum: ['schedule', 'budget', 'pace', 'feasibility'],
    example: 'pace'
  })
  @ApiResponse({
    status: 200,
    description: '获取成功',
  })
  async getMetricExplanation(
    @Param('tripId') tripId: string,
    @Param('dimension') dimension: 'schedule' | 'budget' | 'pace' | 'feasibility'
  ) {
    try {
      // 获取健康度数据
      const result = await this.tripDetailAgent.execute({
        tripId,
        action: 'get_health',
      });

      const health = result.uiOutput.health;
      if (!health) {
        return errorResponse(ErrorCode.NOT_FOUND, '健康度数据不存在');
      }

      const dimensionData = health.dimensions[dimension];
      if (!dimensionData) {
        return errorResponse(ErrorCode.VALIDATION_ERROR, `无效的维度: ${dimension}`);
      }

      // 维度权重定义（来自文档：.claude/product-decisions/trip-detail-page-key-decisions.md）
      // 优先使用维度数据中的 weight，如果不存在则使用文档定义的权重
      const defaultWeights: Record<string, number> = {
        schedule: 0.30,    // 时间安排最重要
        budget: 0.25,      // 预算次重要
        pace: 0.25,        // 节奏同样重要
        feasibility: 0.20  // 可达性相对次要（因为可以调整）
      };

      // 计算 weight 和 contribution
      // weight: 每个维度的权重（优先从维度数据获取，否则使用文档定义的权重）
      const dimensionWeight = (dimensionData as any).weight || defaultWeights[dimension] || 0.25;
      
      // contribution: 该维度对总体健康度的贡献（score * weight）
      // 注意：整体健康度使用加权平均，contribution 反映该维度对总体健康度的实际贡献
      const contribution = dimensionData.score * dimensionWeight;

      // 生成解释信息
      const explanation = this.generateMetricExplanation(
        dimension, 
        dimensionData, 
        health.overall,
        dimensionWeight,
        contribution
      );

      return successResponse(explanation);
    } catch (error: any) {
      return errorResponse(ErrorCode.INTERNAL_ERROR, error.message);
    }
  }

  /**
   * 获取行程健康度（GET 方式）
   */
  @Public()
  @Get(':tripId/health')
  @ApiOperation({
    summary: '获取行程健康度',
    description: '分析行程健康度（时间、预算、节奏、可达性）',
  })
  @ApiParam({ name: 'tripId', description: '行程 ID' })
  @ApiResponse({
    status: 200,
    description: '获取成功',
  })
  async getHealth(@Param('tripId') tripId: string) {
    try {
      const result = await this.tripDetailAgent.execute({
        tripId,
        action: 'get_health',
      });
      return successResponse(result.uiOutput.health);
    } catch (error: any) {
      return errorResponse(ErrorCode.INTERNAL_ERROR, error.message);
    }
  }

  /**
   * 生成指标解释
   */
  private generateMetricExplanation(
    dimension: 'schedule' | 'budget' | 'pace' | 'feasibility',
    dimensionData: {
      status: 'healthy' | 'warning' | 'critical';
      score: number;
      issues: string[];
    },
    overallStatus: 'healthy' | 'warning' | 'critical',
    weight: number = 0.25,
    contribution: number = 0
  ) {
    const dimensionNames = {
      schedule: '时间安排',
      budget: '预算',
      pace: '节奏',
      feasibility: '行程可行性',
    };

    // 映射关系：metricName -> displayName
    const displayNames = {
      schedule: '时间灵活性',
      budget: '预算控制',
      pace: '节奏合理性',
      feasibility: '可达性',
    };

    const dimensionDescriptions = {
      schedule: '评估行程的时间安排是否合理，包括时间冲突、可用时间窗等',
      budget: '评估行程预算是否充足，是否存在超支风险',
      pace: '评估行程节奏是否合适，包括疲劳度、活动密度等',
      feasibility: '评估行程是否可行，包括交通可达性、路线合理性等',
    };

    const calculationMethods = {
      schedule: '基础分100分，时间窗不足每天扣10分',
      budget: '基础分100分，超支>20%扣50分，>10%扣30分',
      pace: '基础分100分，疲劳分>85扣40分，>70扣20分',
      feasibility: '基础分100分，每段不可达扣30分',
    };

    const idealRanges = {
      schedule: '70-100分（健康），50-69分（警告），0-49分（严重）',
      budget: '70-100分（健康），50-69分（警告），0-49分（严重）',
      pace: '70-100分（健康），50-69分（警告），0-49分（严重）',
      feasibility: '70-100分（健康），50-69分（警告），0-49分（严重）',
    };

    // 生成改进建议
    const suggestions: string[] = [];
    if (dimensionData.status === 'critical' || dimensionData.status === 'warning') {
      if (dimension === 'schedule') {
        suggestions.push('增加可用时间窗');
        suggestions.push('减少每日活动数量');
        suggestions.push('调整活动时间安排');
      } else if (dimension === 'budget') {
        suggestions.push('调整预算分配');
        suggestions.push('选择更经济的选项');
        suggestions.push('减少非必要支出');
      } else if (dimension === 'pace') {
        suggestions.push('增加休息时间');
        suggestions.push('减少高强度活动');
        suggestions.push('调整活动顺序');
      } else if (dimension === 'feasibility') {
        suggestions.push('检查交通路线');
        suggestions.push('调整目的地顺序');
        suggestions.push('增加替代方案');
      }
    }

    return {
      // 添加 metricName 和 displayName（必需字段）
      metricName: dimension,
      displayName: displayNames[dimension],
      // 保留原有字段以保持向后兼容
      dimension,
      dimensionName: dimensionNames[dimension],
      description: dimensionDescriptions[dimension],
      definition: dimensionDescriptions[dimension], // 添加 definition 字段
      currentScore: dimensionData.score,
      currentStatus: dimensionData.status,
      overallStatus,
      calculationMethod: calculationMethods[dimension],
      calculation: {
        method: calculationMethods[dimension],
        score: dimensionData.score,
      },
      idealRange: idealRanges[dimension],
      currentState: {
        score: dimensionData.score,
        status: dimensionData.status,
        issues: dimensionData.issues,
      },
      issues: dimensionData.issues,
      suggestions,
      impact: dimensionData.status === 'critical' ? 'high' : dimensionData.status === 'warning' ? 'medium' : 'low',
      // 添加 weight 和 contribution
      weight: weight,
      contribution: contribution,
      lastUpdated: new Date().toISOString(),
    };
  }
}

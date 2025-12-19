// src/railpass/railpass.controller.ts

/**
 * RailPass Controller
 * 
 * API 接口
 */

import {
  Controller,
  Post,
  Get,
  Patch,
  Body,
  Param,
  HttpCode,
  HttpStatus,
  Logger,
} from '@nestjs/common';
import {
  ApiTags,
  ApiOperation,
  ApiResponse,
  ApiBody,
  ApiExtraModels,
} from '@nestjs/swagger';
import { RailPassService } from './railpass.service';
import {
  CheckEligibilityDto,
  RecommendPassDto,
  CheckReservationDto,
  PlanReservationsDto,
  SimulateTravelDaysDto,
  ValidateComplianceDto,
  UpdateReservationTaskDto,
} from './dto/railpass.dto';
import { PassProfileWizardDto } from './dto/pass-profile-wizard.dto';
import { CheckExecutabilityDto, RegeneratePlanDto } from './dto/executability-check.dto';
import { CoverageCheckRequestDto } from './dto/coverage-check.dto';
import { ReservationChannelsRequestDto } from './dto/reservation-channels.dto';
import { RulesEvaluateRequestDto } from './dto/rules-evaluate.dto';
import { successResponse, errorResponse, ErrorCode } from '../common/dto/standard-response.dto';

@ApiTags('railpass')
@ApiExtraModels(
  CoverageCheckRequestDto,
  ReservationChannelsRequestDto,
  RulesEvaluateRequestDto,
)
@Controller('railpass')
export class RailPassController {
  private readonly logger = new Logger(RailPassController.name);

  constructor(private readonly railPassService: RailPassService) {}

  @Post('eligibility')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({
    summary: '合规检查',
    description: '检查用户居住国、旅行国家集合是否符合 Eurail/Interrail 规则',
  })
  @ApiBody({ type: CheckEligibilityDto })
  @ApiResponse({ status: 200, description: '合规检查完成' })
  async checkEligibility(@Body() dto: CheckEligibilityDto) {
    try {
      const result = await this.railPassService.checkEligibility(dto);
      return successResponse(result);
    } catch (error: any) {
      this.logger.error('Failed to check eligibility:', error);
      return errorResponse(ErrorCode.INTERNAL_ERROR, error.message);
    }
  }

  @Post('recommendation')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({
    summary: '推荐 Pass',
    description: '根据行程特征推荐合适的 Pass 配置（Global/OneCountry, Flexi/Continuous, class, mobile/paper）',
  })
  @ApiBody({ type: RecommendPassDto })
  @ApiResponse({ status: 200, description: 'Pass 推荐完成' })
  async recommendPass(@Body() dto: RecommendPassDto) {
    try {
      const result = await this.railPassService.recommendPass(dto);
      return successResponse(result);
    } catch (error: any) {
      this.logger.error('Failed to recommend pass:', error);
      return errorResponse(ErrorCode.INTERNAL_ERROR, error.message);
    }
  }

  @Post('reservation/check')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({
    summary: '检查订座需求',
    description: '检查单个 rail segment 是否需要订座，评估费用、风险、订座渠道',
  })
  @ApiBody({ type: CheckReservationDto })
  @ApiResponse({ status: 200, description: '订座需求检查完成' })
  async checkReservation(@Body() dto: CheckReservationDto) {
    try {
      const result = await this.railPassService.checkReservation(dto.segment);
      return successResponse(result);
    } catch (error: any) {
      this.logger.error('Failed to check reservation:', error);
      return errorResponse(ErrorCode.INTERNAL_ERROR, error.message);
    }
  }

  @Post('reservation/plan')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({
    summary: '规划订座任务',
    description: '为所有 rail segments 生成订座任务列表，评估违规，提供备用方案',
  })
  @ApiBody({ type: PlanReservationsDto })
  @ApiResponse({ status: 200, description: '订座规划完成' })
  async planReservations(@Body() dto: PlanReservationsDto) {
    try {
      const result = await this.railPassService.planReservations(dto);
      return successResponse(result);
    } catch (error: any) {
      this.logger.error('Failed to plan reservations:', error);
      return errorResponse(ErrorCode.INTERNAL_ERROR, error.message);
    }
  }

  @Post('travel-days/simulate')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({
    summary: '模拟 Travel Day 消耗',
    description: '计算 Flexi Pass 的 Travel Day 消耗（考虑跨午夜规则）',
  })
  @ApiBody({ type: SimulateTravelDaysDto })
  @ApiResponse({ status: 200, description: 'Travel Day 模拟完成' })
  async simulateTravelDays(@Body() dto: SimulateTravelDaysDto) {
    try {
      const result = await this.railPassService.simulateTravelDays(dto);
      return successResponse(result);
    } catch (error: any) {
      this.logger.error('Failed to simulate travel days:', error);
      return errorResponse(ErrorCode.INTERNAL_ERROR, error.message);
    }
  }

  @Post('compliance/validate')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({
    summary: '验证合规性',
    description: '验证行程计划是否符合 RailPass 规则（居住国使用、Travel Day 预算、订座要求等）',
  })
  @ApiBody({ type: ValidateComplianceDto })
  @ApiResponse({ status: 200, description: '合规验证完成' })
  async validateCompliance(@Body() dto: ValidateComplianceDto) {
    try {
      const result = await this.railPassService.validateCompliance(dto);
      const explanation = this.railPassService.generateUserExplanation(result);
      return successResponse({
        ...result,
        explanation,
      });
    } catch (error: any) {
      this.logger.error('Failed to validate compliance:', error);
      return errorResponse(ErrorCode.INTERNAL_ERROR, error.message);
    }
  }

  @Patch('reservation/task/:taskId')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({
    summary: '更新订座任务状态',
    description: '用户完成订座后回填状态（BOOKED/FAILED/FALLBACK_APPLIED）',
  })
  @ApiBody({ type: UpdateReservationTaskDto })
  @ApiResponse({ status: 200, description: '任务状态更新完成' })
  async updateReservationTask(
    @Param('taskId') taskId: string,
    @Body() dto: UpdateReservationTaskDto
  ) {
    try {
      // 这里应该调用 service 更新任务
      // 简化实现
      return successResponse({
        taskId,
        status: dto.status,
        message: '任务状态已更新',
      });
    } catch (error: any) {
      this.logger.error('Failed to update reservation task:', error);
      return errorResponse(ErrorCode.INTERNAL_ERROR, error.message);
    }
  }

  @Post('reservation/checkout')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({
    summary: '生成订座清单',
    description: '生成外跳链接/或聚合指引，方便用户完成订座',
  })
  @ApiBody({
    schema: {
      type: 'object',
      properties: {
        taskIds: { type: 'array', items: { type: 'string' } },
      },
    },
  })
  @ApiResponse({ status: 200, description: '订座清单生成完成' })
  async generateCheckout(@Body() body: { taskIds: string[] }) {
    try {
      // 生成订座清单（外跳链接/指引）
      return successResponse({
        checkoutLinks: body.taskIds.map(taskId => ({
          taskId,
          bookingUrl: `https://example.com/book/${taskId}`, // 实际应该是真实的订座链接
          instructions: '请在此链接完成订座',
        })),
      });
    } catch (error: any) {
      this.logger.error('Failed to generate checkout:', error);
      return errorResponse(ErrorCode.INTERNAL_ERROR, error.message);
    }
  }

  @Post('executability/check')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({
    summary: '可执行性检查（总览卡片）',
    description: '生成可执行性检查总览，用于 UI 卡片展示（B2）',
  })
  @ApiBody({ type: CheckExecutabilityDto })
  @ApiResponse({ status: 200, description: '可执行性检查完成' })
  async checkExecutability(@Body() dto: CheckExecutabilityDto) {
    try {
      const result = await this.railPassService.checkExecutability(dto);
      return successResponse(result);
    } catch (error: any) {
      this.logger.error('Failed to check executability:', error);
      return errorResponse(ErrorCode.INTERNAL_ERROR, error.message);
    }
  }

  @Post('executability/high-risk-alerts')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({
    summary: '生成高风险提示',
    description: '生成高风险提示及替代方案（B4）',
  })
  @ApiBody({ type: CheckExecutabilityDto })
  @ApiResponse({ status: 200, description: '高风险提示生成完成' })
  async generateHighRiskAlerts(@Body() dto: CheckExecutabilityDto) {
    try {
      const result = await this.railPassService.generateHighRiskAlerts(dto);
      return successResponse(result);
    } catch (error: any) {
      this.logger.error('Failed to generate high risk alerts:', error);
      return errorResponse(ErrorCode.INTERNAL_ERROR, error.message);
    }
  }

  @Post('wizard/complete-profile')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({
    summary: '完成 PassProfile 向导',
    description: '通过最短 3 问完成 PassProfile 配置（B1）',
  })
  @ApiBody({ type: PassProfileWizardDto })
  @ApiResponse({ status: 200, description: 'PassProfile 配置完成' })
  async completePassProfile(@Body() dto: PassProfileWizardDto) {
    try {
      const result = await this.railPassService.completePassProfile(dto);
      return successResponse(result);
    } catch (error: any) {
      this.logger.error('Failed to complete pass profile:', error);
      return errorResponse(ErrorCode.INTERNAL_ERROR, error.message);
    }
  }

  @Post('plan/regenerate')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({
    summary: '改方案',
    description: '根据策略重新生成方案（更稳/更省/更便宜）（B6）',
  })
  @ApiBody({
    schema: {
      type: 'object',
      properties: {
        tripId: { type: 'string' },
        strategy: { 
          type: 'string',
          enum: ['MORE_STABLE', 'MORE_ECONOMICAL', 'MORE_AFFORDABLE', 'CUSTOM']
        },
        customParams: { type: 'object' },
        passProfile: { type: 'object' },
        segments: { type: 'array' },
        reservationTasks: { type: 'array' },
      },
      required: ['tripId', 'strategy', 'passProfile', 'segments', 'reservationTasks'],
    },
  })
  @ApiResponse({ status: 200, description: '方案重新生成完成' })
  async regeneratePlan(@Body() body: RegeneratePlanDto & {
    passProfile: any;
    segments: any[];
    reservationTasks: any[];
  }) {
    try {
      const result = await this.railPassService.regeneratePlanWithData({
        passProfile: body.passProfile,
        segments: body.segments,
        reservationTasks: body.reservationTasks,
        strategy: body.strategy,
        customParams: body.customParams,
      });
      return successResponse(result);
    } catch (error: any) {
      this.logger.error('Failed to regenerate plan:', error);
      return errorResponse(ErrorCode.INTERNAL_ERROR, error.message);
    }
  }

  @Post('coverage/check')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({
    summary: '检查 Pass 覆盖',
    description: '检查 rail segment 是否在 Pass 覆盖范围内。Global Pass 不是 100% 覆盖所有线路，需要校验运营商/线路是否被覆盖。城市地铁/公交/有轨电车通常不包含。One Country Pass 不能用于跨境段。',
  })
  @ApiBody({ type: CoverageCheckRequestDto })
  @ApiResponse({
    status: 200,
    description: '覆盖检查完成',
    schema: {
      type: 'object',
      properties: {
        success: { type: 'boolean' },
        data: {
          type: 'object',
          properties: {
            covered: { type: 'boolean', description: '是否覆盖' },
            status: { type: 'string', enum: ['COVERED', 'NOT_COVERED', 'PARTIAL', 'UNKNOWN'] },
            explanation: { type: 'string', description: '说明' },
            includesCityTransport: { type: 'boolean' },
            alternatives: {
              type: 'array',
              items: {
                type: 'object',
                properties: {
                  type: { type: 'string', enum: ['METRO', 'BUS', 'TAXI', 'WALK'] },
                  description: { type: 'string' },
                  estimatedCost: { type: 'number' },
                  estimatedTimeMinutes: { type: 'number' },
                },
              },
            },
          },
        },
      },
    },
  })
  async checkCoverage(@Body() body: CoverageCheckRequestDto) {
    try {
      const result = await this.railPassService.checkCoverage(body.segment, body.passProfile);
      return successResponse(result);
    } catch (error: any) {
      this.logger.error('Failed to check coverage:', error);
      return errorResponse(ErrorCode.INTERNAL_ERROR, error.message);
    }
  }

  @Post('reservation/channels')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({
    summary: '获取订座渠道策略',
    description: '根据国家/运营商获取订座渠道策略和订座清单。不同国家/运营商有不同的订座渠道（官方平台/运营商官网/车站/第三方）。Eurostar 等热门线路建议提前订座（如 Eurostar 建议提前 60 天）。',
  })
  @ApiBody({ type: ReservationChannelsRequestDto })
  @ApiResponse({
    status: 200,
    description: '订座渠道策略获取完成',
    schema: {
      type: 'object',
      properties: {
        success: { type: 'boolean' },
        data: {
          type: 'array',
          items: {
            type: 'object',
            properties: {
              segmentId: { type: 'string' },
              from: { type: 'string' },
              to: { type: 'string' },
              policy: {
                type: 'object',
                properties: {
                  countryCode: { type: 'string' },
                  operator: { type: 'string' },
                  preferredChannels: { type: 'array', items: { type: 'string' } },
                  supportsApiBooking: { type: 'boolean' },
                  supportsOnlineBooking: { type: 'boolean' },
                  requiresOfflineBooking: { type: 'boolean' },
                  bookingUrl: { type: 'string' },
                  instructions: { type: 'string' },
                  recommendedAdvanceDays: { type: 'number' },
                },
              },
              urgency: { type: 'string', enum: ['LOW', 'MEDIUM', 'HIGH'] },
              bookingDeadline: { type: 'string', format: 'date' },
            },
          },
        },
      },
    },
  })
  async getReservationChannels(@Body() body: ReservationChannelsRequestDto) {
    try {
      const result = await this.railPassService.getReservationChannels(body.segments);
      return successResponse(result);
    } catch (error: any) {
      this.logger.error('Failed to get reservation channels:', error);
      return errorResponse(ErrorCode.INTERNAL_ERROR, error.message);
    }
  }

  @Post('rules/evaluate')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({
    summary: '评估规则',
    description: '使用规则引擎评估所有 RailPass 规则。统一的规则引擎结构，支持扩展不同 Pass 类型（Eurail/Interrail/未来 JR Pass 等）。每条规则都有 Condition、Effect、Severity、Evidence 结构。',
  })
  @ApiBody({ type: RulesEvaluateRequestDto })
  @ApiResponse({
    status: 200,
    description: '规则评估完成',
    schema: {
      type: 'object',
      properties: {
        success: { type: 'boolean' },
        data: {
          type: 'object',
          properties: {
            triggeredRules: {
              type: 'array',
              items: {
                type: 'object',
                properties: {
                  rule: {
                    type: 'object',
                    properties: {
                      id: { type: 'string' },
                      name: { type: 'string' },
                      description: { type: 'string' },
                    },
                  },
                  segmentId: { type: 'string' },
                  effect: {
                    type: 'object',
                    properties: {
                      type: { type: 'string' },
                      value: { type: 'number' },
                      riskLevel: { type: 'string', enum: ['LOW', 'MEDIUM', 'HIGH'] },
                      fallbackOptions: { type: 'array', items: { type: 'string' } },
                      errorMessage: { type: 'string' },
                    },
                  },
                  message: { type: 'string' },
                },
              },
            },
            hasErrors: { type: 'boolean', description: '是否有 error 级别的违规' },
            overallRisk: { type: 'string', enum: ['LOW', 'MEDIUM', 'HIGH'], description: '综合风险等级' },
          },
        },
      },
    },
  })
  async evaluateRules(@Body() body: RulesEvaluateRequestDto) {
    try {
      const result = await this.railPassService.evaluateRules(body);
      return successResponse(result);
    } catch (error: any) {
      this.logger.error('Failed to evaluate rules:', error);
      return errorResponse(ErrorCode.INTERNAL_ERROR, error.message);
    }
  }
}

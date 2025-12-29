// src/trips/readiness/readiness.controller.ts

/**
 * Readiness Controller
 * 
 * 准备度检查 API 接口
 */

import {
  Controller,
  Post,
  Get,
  Body,
  Query,
  HttpCode,
  HttpStatus,
  Logger,
} from '@nestjs/common';
import {
  ApiTags,
  ApiOperation,
  ApiResponse,
  ApiBody,
  ApiQuery,
} from '@nestjs/swagger';
import { ReadinessService } from './services/readiness.service';
import { CapabilityPackEvaluatorService } from './services/capability-pack-evaluator.service';
import {
  highAltitudePack,
  sparseSupplyPack,
  seasonalRoadPack,
  permitCheckpointPack,
  emergencyPack,
} from './packs';
import { TripContext } from './types/trip-context.types';
import { ReadinessCheckResult } from './types/readiness-findings.types';
import { successResponse, errorResponse, ErrorCode } from '../../common/dto/standard-response.dto';
import { ApiSuccessResponseDto, ApiErrorResponseDto } from '../../common/dto/api-response.dto';

export class CheckReadinessDto {
  destinationId!: string;
  traveler?: {
    nationality?: string;
    residencyCountry?: string;
    tags?: string[];
    budgetLevel?: 'low' | 'medium' | 'high';
    riskTolerance?: 'low' | 'medium' | 'high';
  };
  trip?: {
    startDate?: string;
    endDate?: string;
  };
  itinerary?: {
    countries?: string[];
    activities?: string[];
    season?: string;
    region?: string;
    hasSeaCrossing?: boolean;
    hasAuroraActivity?: boolean;
    vehicleType?: string;
    routeLength?: number;
  };
  geo?: {
    lat?: number;
    lng?: number;
    enhanceWithGeo?: boolean;
  };
}

@ApiTags('readiness')
@Controller('readiness')
export class ReadinessController {
  private readonly logger = new Logger(ReadinessController.name);

  constructor(
    private readonly readinessService: ReadinessService,
    private readonly capabilityEvaluator: CapabilityPackEvaluatorService
  ) {}

  @Post('check')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({
    summary: '检查旅行准备度',
    description: '基于目的地和行程信息，检查旅行准备度并返回 must/should/optional 清单',
  })
  @ApiBody({ type: CheckReadinessDto })
  @ApiResponse({
    status: 200,
    description: '成功返回准备度检查结果',
    type: ApiSuccessResponseDto,
  })
  @ApiResponse({
    status: 400,
    description: '请求参数错误',
    type: ApiErrorResponseDto,
  })
  async checkReadiness(@Body() dto: CheckReadinessDto): Promise<any> {
    try {
      const context: TripContext = {
        traveler: dto.traveler || {},
        trip: dto.trip || {},
        itinerary: {
          countries: dto.itinerary?.countries || [],
          activities: dto.itinerary?.activities || [],
          season: dto.itinerary?.season,
        },
        geo: dto.geo?.lat && dto.geo?.lng ? {
          latitude: dto.geo.lat,
        } : undefined,
      };

      const result = await this.readinessService.checkFromDestination(
        dto.destinationId,
        context,
        {
          enhanceWithGeo: dto.geo?.enhanceWithGeo ?? true,
          geoLat: dto.geo?.lat,
          geoLng: dto.geo?.lng,
        }
      );

      return successResponse(result);
    } catch (error) {
      const err = error as Error;
      this.logger.error(`Failed to check readiness: ${err.message}`, err.stack);
      return errorResponse('READINESS_CHECK_FAILED', err.message);
    }
  }

  @Get('capability-packs')
  @ApiOperation({
    summary: '获取能力包列表',
    description: '返回所有可用的能力包信息',
  })
  @ApiResponse({
    status: 200,
    description: '成功返回能力包列表',
    type: ApiSuccessResponseDto,
  })
  async getCapabilityPacks(): Promise<any> {
    try {
      const packs = [
        {
          type: highAltitudePack.type,
          displayName: highAltitudePack.displayName,
          description: highAltitudePack.metadata?.description,
        },
        {
          type: sparseSupplyPack.type,
          displayName: sparseSupplyPack.displayName,
          description: sparseSupplyPack.metadata?.description,
        },
        {
          type: seasonalRoadPack.type,
          displayName: seasonalRoadPack.displayName,
          description: seasonalRoadPack.metadata?.description,
        },
        {
          type: permitCheckpointPack.type,
          displayName: permitCheckpointPack.displayName,
          description: permitCheckpointPack.metadata?.description,
        },
        {
          type: emergencyPack.type,
          displayName: emergencyPack.displayName,
          description: emergencyPack.metadata?.description,
        },
      ];

      return successResponse({ packs });
    } catch (error) {
      const err = error as Error;
      this.logger.error(`Failed to get capability packs: ${err.message}`, err.stack);
      return errorResponse('GET_CAPABILITY_PACKS_FAILED', err.message);
    }
  }

  @Post('capability-packs/evaluate')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({
    summary: '评估能力包',
    description: '评估哪些能力包应该被触发',
  })
  @ApiBody({ type: CheckReadinessDto })
  @ApiResponse({
    status: 200,
    description: '成功返回能力包评估结果',
    type: ApiSuccessResponseDto,
  })
  async evaluateCapabilityPacks(@Body() dto: CheckReadinessDto): Promise<any> {
    try {
      const context: TripContext = {
        traveler: dto.traveler || {},
        trip: dto.trip || {},
        itinerary: {
          countries: dto.itinerary?.countries || [],
          activities: dto.itinerary?.activities || [],
          season: dto.itinerary?.season,
        },
        geo: dto.geo?.lat && dto.geo?.lng ? {
          latitude: dto.geo.lat,
        } : undefined,
      };

      const allPacks = [
        highAltitudePack,
        sparseSupplyPack,
        seasonalRoadPack,
        permitCheckpointPack,
        emergencyPack,
      ];

      const results = allPacks.map(pack =>
        this.capabilityEvaluator.evaluatePack(pack, context)
      );

      const triggeredPacks = results.filter(r => r.triggered);

      return successResponse({
        total: allPacks.length,
        triggered: triggeredPacks.length,
        results: triggeredPacks,
      });
    } catch (error) {
      const err = error as Error;
      this.logger.error(`Failed to evaluate capability packs: ${err.message}`, err.stack);
      return errorResponse('EVALUATE_CAPABILITY_PACKS_FAILED', err.message);
    }
  }

  @Get('personalized-checklist')
  @ApiOperation({
    summary: '获取个性化准备清单（故事6.1）',
    description: '获取适配行程的准备事项清单，按 blocker/must/should/optional 分类，包含截止时间和办理渠道',
  })
  @ApiQuery({ name: 'tripId', description: '行程 ID', required: true })
  @ApiResponse({
    status: 200,
    description: '成功返回个性化准备清单',
    type: ApiSuccessResponseDto,
  })
  async getPersonalizedChecklist(@Query('tripId') tripId: string): Promise<any> {
    try {
      // 从行程获取上下文
      const result = await this.readinessService.checkFromDestination(tripId, {
        traveler: {},
        trip: {},
        itinerary: {
          countries: [],
        },
      });

      // 转换为个性化清单格式
      const checklist = {
        blocker: result.findings.flatMap(f => f.blockers.map(b => ({
          message: b.message,
          tasks: b.tasks || [],
          deadline: undefined, // ReadinessFindingItem 没有 deadline 字段
          channel: undefined, // ReadinessFindingItem 没有 channel 字段
        }))),
        must: result.findings.flatMap(f => f.must.map(m => ({
          message: m.message,
          tasks: m.tasks || [],
          deadline: undefined,
          channel: undefined,
        }))),
        should: result.findings.flatMap(f => f.should.map(s => ({
          message: s.message,
          tasks: s.tasks || [],
          deadline: undefined,
          channel: undefined,
        }))),
        optional: result.findings.flatMap(f => f.optional.map(o => ({
          message: o.message,
          tasks: o.tasks || [],
          deadline: undefined,
          channel: undefined,
        }))),
      };

      return successResponse({
        tripId,
        checklist,
        summary: {
          totalBlockers: checklist.blocker.length,
          totalMust: checklist.must.length,
          totalShould: checklist.should.length,
          totalOptional: checklist.optional.length,
        },
      });
    } catch (error) {
      const err = error as Error;
      this.logger.error(`Failed to get personalized checklist: ${err.message}`, err.stack);
      return errorResponse(ErrorCode.INTERNAL_ERROR, err.message);
    }
  }

  @Get('risk-warnings')
  @ApiOperation({
    summary: '行程潜在风险预警（故事6.2）',
    description: '提前知晓行程中的潜在风险，提供应对措施和救援信息',
  })
  @ApiQuery({ name: 'tripId', description: '行程 ID', required: true })
  @ApiResponse({
    status: 200,
    description: '成功返回风险预警',
    type: ApiSuccessResponseDto,
  })
  async getRiskWarnings(@Query('tripId') tripId: string): Promise<any> {
    try {
      // 从行程获取上下文
      const result = await this.readinessService.checkFromDestination(tripId, {
        traveler: {},
        trip: {},
        itinerary: {
          countries: [],
        },
      });

      // 提取风险信息
      const risks = result.findings.flatMap(f => f.risks.map(r => ({
        type: r.type,
        severity: r.severity,
        message: r.summary,
        mitigation: r.mitigations || [],
        emergencyContacts: [], // Risk 对象没有 emergencyContacts 字段
      })));

      return successResponse({
        tripId,
        risks,
        summary: {
          totalRisks: risks.length,
          highSeverity: risks.filter(r => r.severity === 'high').length,
          mediumSeverity: risks.filter(r => r.severity === 'medium').length,
          lowSeverity: risks.filter(r => r.severity === 'low').length,
        },
      });
    } catch (error) {
      const err = error as Error;
      this.logger.error(`Failed to get risk warnings: ${err.message}`, err.stack);
      return errorResponse(ErrorCode.INTERNAL_ERROR, err.message);
    }
  }
}


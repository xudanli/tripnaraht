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
  Param,
  HttpCode,
  HttpStatus,
  Logger,
  NotFoundException,
} from '@nestjs/common';
import {
  ApiTags,
  ApiOperation,
  ApiResponse,
  ApiBody,
  ApiQuery,
  ApiParam,
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
import { PrismaService } from '../../prisma/prisma.service';
import { DateTime } from 'luxon';
import { Public } from '../../auth/decorators/public.decorator';

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
    private readonly capabilityEvaluator: CapabilityPackEvaluatorService,
    private readonly prisma: PrismaService
  ) {}

  @Public()
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

  @Public()
  @Get('trip/:id')
  @ApiOperation({
    summary: '根据行程ID检查准备度',
    description: '基于行程ID获取行程信息并检查准备度，返回 must/should/optional 清单',
  })
  @ApiParam({ name: 'id', description: '行程 ID (UUID)', example: 'd125c30f-44ab-4a9e-9970-b899fccdc3d8' })
  @ApiResponse({
    status: 200,
    description: '成功返回准备度检查结果',
    type: ApiSuccessResponseDto,
  })
  @ApiResponse({
    status: 404,
    description: '行程不存在',
    type: ApiErrorResponseDto,
  })
  async getTripReadiness(@Param('id') tripId: string): Promise<any> {
    try {
      // 查询行程信息
      const trip = await this.prisma.trip.findUnique({
        where: { id: tripId },
        include: {
          TripDay: {
            include: {
              ItineraryItem: {
                include: {
                  Place: true,
                },
              },
            },
            orderBy: { date: 'asc' },
          },
        },
      });

      if (!trip) {
        throw new NotFoundException(`行程 ID ${tripId} 不存在`);
      }

      // 从行程提取上下文信息
      const startDate = DateTime.fromJSDate(trip.startDate).toISODate();
      const endDate = DateTime.fromJSDate(trip.endDate).toISODate();

      // 提取活动类型
      const activitySet = new Set<string>();
      for (const day of trip.TripDay) {
        for (const item of day.ItineraryItem) {
          if (item.Place) {
            const category = item.Place.category?.toLowerCase() || '';
            if (category.includes('hiking') || category.includes('trail')) {
              activitySet.add('hiking');
            }
            if (category.includes('tour') || category.includes('activity')) {
              activitySet.add('tour');
            }
            if (category.includes('sightseeing') || category.includes('attraction')) {
              activitySet.add('sightseeing');
            }
            // 从名称推断特殊活动
            const name = (item.Place.nameEN || item.Place.nameCN || '').toLowerCase();
            if (name.includes('snowmobile') || name.includes('雪地摩托')) {
              activitySet.add('snowmobile');
            }
            if (name.includes('dog') && (name.includes('sled') || name.includes('拉'))) {
              activitySet.add('dog_sled');
            }
            if (name.includes('boat') || name.includes('船')) {
              activitySet.add('boat_tour');
            }
            if (name.includes('wildlife') || name.includes('野生动物')) {
              activitySet.add('wildlife');
            }
          }
        }
      }

      // 推断季节
      let season: string | undefined;
      if (startDate) {
        const month = new Date(startDate + 'T00:00:00Z').getUTCMonth() + 1;
        if (month >= 12 || month <= 2) {
          season = 'winter';
        } else if (month >= 6 && month <= 8) {
          season = 'summer';
        } else {
          season = 'shoulder';
        }
      }

      // 构建上下文
      const metadata = trip.metadata as any || {};
      const preferences = metadata.preferences || {};
      const context: TripContext = {
        traveler: {
          nationality: 'CN', // 默认值，实际应该从用户信息获取
          budgetLevel: preferences.budgetLevel || 'medium',
          riskTolerance: preferences.riskTolerance || 'medium',
        },
        trip: {
          startDate,
          endDate,
        },
        itinerary: {
          countries: [trip.destination],
          activities: Array.from(activitySet).length > 0 ? Array.from(activitySet) : undefined,
          season,
        },
      };

      // 获取第一个行程项的位置用于地理特征增强
      // Place.location 是 PostGIS geography 类型，需要从 metadata 或其他方式获取坐标
      // 暂时不获取坐标，如果后续需要可以从 metadata 中解析
      const firstItem = trip.TripDay[0]?.ItineraryItem[0];
      const geoLat = undefined; // TODO: 从 Place.metadata 或通过 PostGIS 查询获取
      const geoLng = undefined; // TODO: 从 Place.metadata 或通过 PostGIS 查询获取

      // 调用准备度检查
      const result = await this.readinessService.checkFromDestination(
        trip.destination,
        context,
        {
          enhanceWithGeo: !!(geoLat && geoLng),
          geoLat,
          geoLng,
        }
      );

      return successResponse(result);
    } catch (error) {
      const err = error as Error;
      if (err instanceof NotFoundException) {
        this.logger.error(`Trip not found: ${tripId}`);
        return errorResponse(ErrorCode.NOT_FOUND, err.message);
      }
      this.logger.error(`Failed to check trip readiness: ${err.message}`, err.stack);
      return errorResponse('READINESS_CHECK_FAILED', err.message);
    }
  }

  @Public()
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

  @Public()
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

  @Public()
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

  @Public()
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


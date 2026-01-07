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
import { UsersService } from '../../users/users.service';
import { CurrentUser, CurrentUserPayload } from '../../auth/decorators/current-user.decorator';
import { ChecklistStatusService } from './services/checklist-status.service';
import { FindingMarksService } from './services/finding-marks.service';
import { PackingListService } from './services/packing-list.service';
import { SolutionService } from './services/solution.service';
import {
  UpdateChecklistStatusDto,
  ChecklistStatusResponseDto,
  GetChecklistStatusResponseDto,
} from './dto/checklist-status.dto';
import {
  MarkNotApplicableDto,
  MarkNotApplicableResponseDto,
  AddToLaterDto,
  AddToLaterResponseDto,
  GetNotApplicableResponseDto,
  GetLaterResponseDto,
} from './dto/finding-mark.dto';
import {
  GeneratePackingListDto,
  GeneratePackingListResponseDto,
  GetPackingListResponseDto,
  UpdatePackingListItemDto,
  UpdatePackingListItemResponseDto,
} from './dto/packing-list.dto';
import { GetSolutionsResponseDto } from './dto/solution.dto';
import { Delete, Put } from '@nestjs/common';

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
    private readonly capabilityPackEvaluator: CapabilityPackEvaluatorService,
    private readonly prisma: PrismaService,
    private readonly usersService: UsersService,
    private readonly checklistStatusService: ChecklistStatusService,
    private readonly findingMarksService: FindingMarksService,
    private readonly packingListService: PackingListService,
    private readonly solutionService: SolutionService,
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
          lang: (dto as any).lang || 'en',
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
    description: '基于行程ID获取行程信息并检查准备度，返回 must/should/optional 清单。如果提供了用户认证信息，会自动从用户偏好接口获取国籍、居住国等信息。',
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
  async getTripReadiness(
    @Param('id') tripId: string,
    @Query('lang') lang?: 'en' | 'zh',
    @CurrentUser() user?: CurrentUserPayload,
  ): Promise<any> {
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

      // 提取活动类型和 POI 标准类型
      const activitySet = new Set<string>();
      const poiCanonicalTypeSet = new Set<string>();
      const coordinates: Array<{ lat: number; lng: number }> = [];
      
      for (const day of trip.TripDay) {
        for (const item of day.ItineraryItem) {
          if (item.Place) {
            // 尝试提取坐标
            const coords = this.extractPlaceCoordinates(item.Place);
            if (coords) {
              coordinates.push(coords);
            }
            // 从 metadata 提取 canonicalType
            const placeMetadata = item.Place.metadata as any || {};
            const canonicalType = placeMetadata.canonicalType;
            if (canonicalType) {
              poiCanonicalTypeSet.add(canonicalType);
            }

            // 从 canonicalType 映射活动类型
            if (canonicalType) {
              // 自然景观相关
              if (canonicalType.includes('GLACIER') || canonicalType.includes('VOLCANO')) {
                activitySet.add('hiking');
                activitySet.add('outdoor');
                activitySet.add('nature');
              }
              if (canonicalType.includes('VOLCANO')) {
                activitySet.add('volcano');
              }
              if (canonicalType.includes('GEYSER') || canonicalType.includes('HOT_SPRING') || canonicalType === 'SPA_POOL') {
                activitySet.add('geothermal');
                activitySet.add('hot_springs');
              }
              if (canonicalType === 'TRAILHEAD') {
                activitySet.add('hiking');
                activitySet.add('outdoor');
              }
              if (canonicalType === 'ATTRACTION_NATURE_BEACH') {
                activitySet.add('beach');
                activitySet.add('coastal');
              }
              if (canonicalType === 'CAMPING') {
                activitySet.add('camping');
              }
              if (canonicalType === 'FUEL_STATION') {
                activitySet.add('driving');
              }
            }

            // 从 category 推断活动类型（作为补充）
            const category = item.Place.category?.toLowerCase() || '';
            if (category.includes('hiking') || category.includes('trail')) {
              activitySet.add('hiking');
              activitySet.add('outdoor');
            }
            if (category.includes('tour') || category.includes('activity')) {
              activitySet.add('tour');
            }
            if (category.includes('sightseeing') || category.includes('attraction')) {
              activitySet.add('sightseeing');
            }
            if (category.includes('nature') || category.includes('natural')) {
              activitySet.add('nature');
              activitySet.add('outdoor');
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
            if (name.includes('volcano') || name.includes('火山')) {
              activitySet.add('volcano');
            }
            if (name.includes('glacier') || name.includes('冰川')) {
              activitySet.add('hiking');
              activitySet.add('outdoor');
            }
            if (name.includes('geothermal') || name.includes('地热') || name.includes('温泉')) {
              activitySet.add('geothermal');
              activitySet.add('hot_springs');
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

      // 获取用户偏好信息（如果用户已认证）
      let userProfile = null;
      if (user?.userId) {
        try {
          userProfile = await this.usersService.getProfile(user.userId);
        } catch (error) {
          this.logger.warn(`Failed to get user profile for userId ${user.userId}: ${error}`);
          // 继续使用默认值
        }
      }

      // 构建上下文
      const metadata = trip.metadata as any || {};
      const preferences = metadata.preferences || {};
      const userPreferences = userProfile?.preferences || {};
      
      // 优先使用用户偏好中的信息，其次使用行程metadata中的偏好，最后使用默认值
      const context: TripContext = {
        traveler: {
          nationality: userPreferences.nationality || 'CN', // 从用户偏好获取，默认 CN
          residencyCountry: userPreferences.residencyCountry || undefined,
          tags: userPreferences.tags || undefined,
          budgetLevel: preferences.budgetLevel || userPreferences.travelPreferences?.budget?.toLowerCase() || 'medium',
          riskTolerance: preferences.riskTolerance || 'medium',
        },
        trip: {
          startDate: startDate || undefined,
          endDate: endDate || undefined,
        },
        itinerary: {
          countries: [trip.destination],
          activities: Array.from(activitySet).length > 0 ? Array.from(activitySet) : undefined,
          season,
          poiCanonicalTypes: Array.from(poiCanonicalTypeSet).length > 0 ? Array.from(poiCanonicalTypeSet) : undefined,
          hasRemoteAreas: this.inferHasRemoteAreas(activitySet, poiCanonicalTypeSet),
          requires4x4: this.inferRequires4x4(activitySet, poiCanonicalTypeSet),
        },
      };

      // 获取第一个行程项的位置用于地理特征增强
      // 优先使用第一个有坐标的行程点
      const geoLat = coordinates.length > 0 ? coordinates[0].lat : undefined;
      const geoLng = coordinates.length > 0 ? coordinates[0].lng : undefined;

      // 调用准备度检查（支持多语言）
      const result = await this.readinessService.checkFromDestination(
        trip.destination,
        context,
        {
          enhanceWithGeo: !!(geoLat && geoLng),
          geoLat,
          geoLng,
          lang: lang || 'en',
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
        this.capabilityPackEvaluator.evaluatePack(pack, context)
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
  async getPersonalizedChecklist(
    @Query('tripId') tripId: string,
    @Query('lang') lang?: 'en' | 'zh',
  ): Promise<any> {
    try {
      // 从行程获取上下文
      const result = await this.readinessService.checkFromDestination(tripId, {
        traveler: {},
        trip: {},
        itinerary: {
          countries: [],
        },
      }, {
        lang: lang || 'en',
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
  async getRiskWarnings(
    @Query('tripId') tripId: string,
    @Query('lang') lang?: 'en' | 'zh',
  ): Promise<any> {
    try {
      // 从行程获取上下文
      const result = await this.readinessService.checkFromDestination(tripId, {
        traveler: {},
        trip: {},
        itinerary: {
          countries: [],
        },
      }, {
        lang: lang || 'en',
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

  // ==================== 检查清单状态接口 ====================

  @Public()
  @Put('trip/:tripId/checklist/status')
  @ApiOperation({
    summary: '批量保存勾选状态',
    description: '保存用户勾选的 must 项状态到后端，支持跨设备同步',
  })
  @ApiParam({ name: 'tripId', description: '行程 ID' })
  @ApiBody({ type: UpdateChecklistStatusDto })
  @ApiResponse({
    status: 200,
    description: '成功保存勾选状态',
    type: ApiSuccessResponseDto,
  })
  async updateChecklistStatus(
    @Param('tripId') tripId: string,
    @Body() dto: UpdateChecklistStatusDto,
  ): Promise<any> {
    try {
      const result = await this.checklistStatusService.updateChecklistStatus(tripId, dto);
      return successResponse(result);
    } catch (error) {
      const err = error as Error;
      this.logger.error(`Failed to update checklist status: ${err.message}`, err.stack);
      return errorResponse(ErrorCode.INTERNAL_ERROR, err.message);
    }
  }

  @Public()
  @Get('trip/:tripId/checklist/status')
  @ApiOperation({
    summary: '获取勾选状态',
    description: '获取行程的检查清单勾选状态',
  })
  @ApiParam({ name: 'tripId', description: '行程 ID' })
  @ApiResponse({
    status: 200,
    description: '成功返回勾选状态',
    type: ApiSuccessResponseDto,
  })
  async getChecklistStatus(@Param('tripId') tripId: string): Promise<any> {
    try {
      const result = await this.checklistStatusService.getChecklistStatus(tripId);
      return successResponse(result);
    } catch (error) {
      const err = error as Error;
      this.logger.error(`Failed to get checklist status: ${err.message}`, err.stack);
      return errorResponse(ErrorCode.INTERNAL_ERROR, err.message);
    }
  }

  // ==================== 解决方案接口 ====================

  @Public()
  @Get('trip/:tripId/blockers/:blockerId/solutions')
  @ApiOperation({
    summary: '获取阻塞项修复方案',
    description: '获取指定阻塞项的修复方案列表',
  })
  @ApiParam({ name: 'tripId', description: '行程 ID' })
  @ApiParam({ name: 'blockerId', description: '阻塞项 ID' })
  @ApiResponse({
    status: 200,
    description: '成功返回解决方案列表',
    type: ApiSuccessResponseDto,
  })
  async getSolutions(
    @Param('tripId') tripId: string,
    @Param('blockerId') blockerId: string,
  ): Promise<any> {
    try {
      const result = await this.solutionService.getSolutions(tripId, blockerId);
      return successResponse(result);
    } catch (error) {
      const err = error as Error;
      this.logger.error(`Failed to get solutions: ${err.message}`, err.stack);
      return errorResponse(ErrorCode.INTERNAL_ERROR, err.message);
    }
  }

  // ==================== 标记不适用接口 ====================

  @Public()
  @Post('trip/:tripId/findings/:findingId/mark-not-applicable')
  @ApiOperation({
    summary: '标记项为不适用',
    description: '将某个阻塞项或 must 项标记为"不适用"',
  })
  @ApiParam({ name: 'tripId', description: '行程 ID' })
  @ApiParam({ name: 'findingId', description: 'Finding 项 ID' })
  @ApiBody({ type: MarkNotApplicableDto })
  @ApiResponse({
    status: 200,
    description: '成功标记为不适用',
    type: ApiSuccessResponseDto,
  })
  async markNotApplicable(
    @Param('tripId') tripId: string,
    @Param('findingId') findingId: string,
    @Body() dto: MarkNotApplicableDto,
  ): Promise<any> {
    try {
      const result = await this.findingMarksService.markNotApplicable(tripId, findingId, dto);
      return successResponse(result);
    } catch (error) {
      const err = error as Error;
      this.logger.error(`Failed to mark not applicable: ${err.message}`, err.stack);
      return errorResponse(ErrorCode.INTERNAL_ERROR, err.message);
    }
  }

  @Public()
  @Delete('trip/:tripId/findings/:findingId/mark-not-applicable')
  @ApiOperation({
    summary: '取消标记不适用',
    description: '取消某个项的"不适用"标记',
  })
  @ApiParam({ name: 'tripId', description: '行程 ID' })
  @ApiParam({ name: 'findingId', description: 'Finding 项 ID' })
  @ApiResponse({
    status: 200,
    description: '成功取消标记',
    type: ApiSuccessResponseDto,
  })
  async unmarkNotApplicable(
    @Param('tripId') tripId: string,
    @Param('findingId') findingId: string,
  ): Promise<any> {
    try {
      const result = await this.findingMarksService.unmarkNotApplicable(tripId, findingId);
      return successResponse(result);
    } catch (error) {
      const err = error as Error;
      this.logger.error(`Failed to unmark not applicable: ${err.message}`, err.stack);
      return errorResponse(ErrorCode.INTERNAL_ERROR, err.message);
    }
  }

  @Public()
  @Get('trip/:tripId/findings/not-applicable')
  @ApiOperation({
    summary: '获取不适用项列表',
    description: '获取所有标记为"不适用"的项',
  })
  @ApiParam({ name: 'tripId', description: '行程 ID' })
  @ApiResponse({
    status: 200,
    description: '成功返回不适用项列表',
    type: ApiSuccessResponseDto,
  })
  async getNotApplicableItems(@Param('tripId') tripId: string): Promise<any> {
    try {
      const result = await this.findingMarksService.getNotApplicableItems(tripId);
      return successResponse(result);
    } catch (error) {
      const err = error as Error;
      this.logger.error(`Failed to get not applicable items: ${err.message}`, err.stack);
      return errorResponse(ErrorCode.INTERNAL_ERROR, err.message);
    }
  }

  // ==================== 稍后处理接口 ====================

  @Public()
  @Post('trip/:tripId/findings/:findingId/add-to-later')
  @ApiOperation({
    summary: '添加到稍后处理',
    description: '将某个阻塞项或 must 项添加到"稍后处理"列表',
  })
  @ApiParam({ name: 'tripId', description: '行程 ID' })
  @ApiParam({ name: 'findingId', description: 'Finding 项 ID' })
  @ApiBody({ type: AddToLaterDto })
  @ApiResponse({
    status: 200,
    description: '成功添加到稍后处理',
    type: ApiSuccessResponseDto,
  })
  async addToLater(
    @Param('tripId') tripId: string,
    @Param('findingId') findingId: string,
    @Body() dto: AddToLaterDto,
  ): Promise<any> {
    try {
      const result = await this.findingMarksService.addToLater(tripId, findingId, dto);
      return successResponse(result);
    } catch (error) {
      const err = error as Error;
      this.logger.error(`Failed to add to later: ${err.message}`, err.stack);
      return errorResponse(ErrorCode.INTERNAL_ERROR, err.message);
    }
  }

  @Public()
  @Delete('trip/:tripId/findings/:findingId/remove-from-later')
  @ApiOperation({
    summary: '从稍后处理移除',
    description: '从"稍后处理"列表中移除某个项',
  })
  @ApiParam({ name: 'tripId', description: '行程 ID' })
  @ApiParam({ name: 'findingId', description: 'Finding 项 ID' })
  @ApiResponse({
    status: 200,
    description: '成功从稍后处理移除',
    type: ApiSuccessResponseDto,
  })
  async removeFromLater(
    @Param('tripId') tripId: string,
    @Param('findingId') findingId: string,
  ): Promise<any> {
    try {
      const result = await this.findingMarksService.removeFromLater(tripId, findingId);
      return successResponse(result);
    } catch (error) {
      const err = error as Error;
      this.logger.error(`Failed to remove from later: ${err.message}`, err.stack);
      return errorResponse(ErrorCode.INTERNAL_ERROR, err.message);
    }
  }

  @Public()
  @Get('trip/:tripId/findings/later')
  @ApiOperation({
    summary: '获取稍后处理列表',
    description: '获取所有添加到"稍后处理"的项',
  })
  @ApiParam({ name: 'tripId', description: '行程 ID' })
  @ApiResponse({
    status: 200,
    description: '成功返回稍后处理列表',
    type: ApiSuccessResponseDto,
  })
  async getLaterItems(@Param('tripId') tripId: string): Promise<any> {
    try {
      const result = await this.findingMarksService.getLaterItems(tripId);
      return successResponse(result);
    } catch (error) {
      const err = error as Error;
      this.logger.error(`Failed to get later items: ${err.message}`, err.stack);
      return errorResponse(ErrorCode.INTERNAL_ERROR, err.message);
    }
  }

  // ==================== 打包清单接口 ====================

  @Public()
  @Post('trip/:tripId/packing-list/generate')
  @ApiOperation({
    summary: '生成打包清单',
    description: '根据准备度检查结果生成个性化的打包清单',
  })
  @ApiParam({ name: 'tripId', description: '行程 ID' })
  @ApiBody({ type: GeneratePackingListDto })
  @ApiResponse({
    status: 200,
    description: '成功生成打包清单',
    type: ApiSuccessResponseDto,
  })
  async generatePackingList(
    @Param('tripId') tripId: string,
    @Body() dto: GeneratePackingListDto,
  ): Promise<any> {
    try {
      const result = await this.packingListService.generatePackingList(tripId, dto);
      return successResponse(result);
    } catch (error) {
      const err = error as Error;
      this.logger.error(`Failed to generate packing list: ${err.message}`, err.stack);
      return errorResponse(ErrorCode.INTERNAL_ERROR, err.message);
    }
  }

  @Public()
  @Get('trip/:tripId/packing-list')
  @ApiOperation({
    summary: '获取打包清单',
    description: '获取行程的打包清单',
  })
  @ApiParam({ name: 'tripId', description: '行程 ID' })
  @ApiResponse({
    status: 200,
    description: '成功返回打包清单',
    type: ApiSuccessResponseDto,
  })
  async getPackingList(@Param('tripId') tripId: string): Promise<any> {
    try {
      const result = await this.packingListService.getPackingList(tripId);
      return successResponse(result);
    } catch (error) {
      const err = error as Error;
      this.logger.error(`Failed to get packing list: ${err.message}`, err.stack);
      return errorResponse(ErrorCode.INTERNAL_ERROR, err.message);
    }
  }

  @Public()
  @Put('trip/:tripId/packing-list/items/:itemId')
  @ApiOperation({
    summary: '更新打包清单项状态',
    description: '更新打包清单项的勾选状态、数量或备注',
  })
  @ApiParam({ name: 'tripId', description: '行程 ID' })
  @ApiParam({ name: 'itemId', description: '打包清单项 ID' })
  @ApiBody({ type: UpdatePackingListItemDto })
  @ApiResponse({
    status: 200,
    description: '成功更新打包清单项',
    type: ApiSuccessResponseDto,
  })
  async updatePackingListItem(
    @Param('tripId') tripId: string,
    @Param('itemId') itemId: string,
    @Body() dto: UpdatePackingListItemDto,
  ): Promise<any> {
    try {
      const result = await this.packingListService.updatePackingListItem(tripId, itemId, dto);
      return successResponse(result);
    } catch (error) {
      const err = error as Error;
      this.logger.error(`Failed to update packing list item: ${err.message}`, err.stack);
      return errorResponse(ErrorCode.INTERNAL_ERROR, err.message);
    }
  }

  /**
   * 从 Place 提取坐标
   * 优先从 metadata 中获取，其次从 PostGIS location 字段提取
   */
  private extractPlaceCoordinates(place: any): { lat: number; lng: number } | null {
    // 方法1: 从 metadata 中获取坐标
    const metadata = (place.metadata as any) || {};
    if (metadata.lat && metadata.lng) {
      return { lat: metadata.lat, lng: metadata.lng };
    }
    if (metadata.coordinates && Array.isArray(metadata.coordinates)) {
      return { lat: metadata.coordinates[1], lng: metadata.coordinates[0] };
    }

    // 方法2: 从 PostGIS location 字段提取
    const location = place.location;
    if (location) {
      // 如果 location 是字符串格式 (POINT(lng lat))
      if (typeof location === 'string') {
        const match = location.match(/POINT\(([^)]+)\)/);
        if (match) {
          const [lng, lat] = match[1].split(/\s+/).map(parseFloat);
          return { lat, lng };
        }
      }
      // 如果 location 是对象格式
      if (typeof location === 'object') {
        if (location.coordinates && Array.isArray(location.coordinates)) {
          return { lng: location.coordinates[0], lat: location.coordinates[1] };
        }
        if (location.lat && location.lng) {
          return { lat: location.lat, lng: location.lng };
        }
      }
    }

    return null;
  }

  /**
   * 推断行程是否包含偏远地区
   * 
   * 判断依据：
   * 1. 活动类型包含 remote, highlands, f-roads
   * 2. POI 类型包含 TRAILHEAD, CAMPING（暗示偏远）
   * 3. 活动类型包含 hiking, camping, backcountry（可能偏远）
   */
  private inferHasRemoteAreas(
    activitySet: Set<string>,
    poiCanonicalTypeSet: Set<string>
  ): boolean {
    // 检查活动类型
    const remoteActivities = ['remote', 'highlands', 'f-roads', 'backcountry', 'wilderness'];
    for (const activity of activitySet) {
      if (remoteActivities.some(ra => activity.toLowerCase().includes(ra))) {
        return true;
      }
    }

    // 检查 POI 类型（暗示偏远地区）
    const remotePoiTypes = [
      'TRAILHEAD',        // 徒步起点（通常在偏远地区）
      'CAMPING',          // 露营地（可能在偏远地区）
      'ATTRACTION_NATURE_GLACIER',  // 冰川（通常偏远）
      'ATTRACTION_NATURE_VOLCANO', // 火山（可能偏远）
    ];
    for (const poiType of poiCanonicalTypeSet) {
      if (remotePoiTypes.some(rpt => poiType.includes(rpt))) {
        // 如果同时有 hiking 或 camping 活动，更可能是偏远地区
        const hasHikingOrCamping = Array.from(activitySet).some(a => 
          a.includes('hiking') || a.includes('camping') || a.includes('outdoor')
        );
        if (hasHikingOrCamping) {
          return true;
        }
      }
    }

    return false;
  }

  /**
   * 推断行程是否需要 4x4 车辆
   * 
   * 判断依据：
   * 1. 活动类型明确包含 highlands, f-roads, off-road
   * 2. POI 类型暗示需要越野（如偏远地区的 TRAILHEAD）
   * 3. 活动类型包含 driving 且同时有偏远地区特征
   */
  private inferRequires4x4(
    activitySet: Set<string>,
    poiCanonicalTypeSet: Set<string>
  ): boolean {
    // 检查活动类型（明确需要4x4）
    const fourWheelDriveActivities = ['highlands', 'f-roads', 'off-road', '4x4'];
    for (const activity of activitySet) {
      if (fourWheelDriveActivities.some(fwda => activity.toLowerCase().includes(fwda))) {
        return true;
      }
    }

    // 检查是否有 driving 活动 + 偏远地区特征
    const hasDriving = Array.from(activitySet).some(a => a.includes('driving'));
    if (hasDriving) {
      // 如果有 TRAILHEAD 或偏远地区的 POI，可能需要4x4
      const hasRemotePoi = Array.from(poiCanonicalTypeSet).some(pt => 
        pt.includes('TRAILHEAD') || pt.includes('CAMPING')
      );
      if (hasRemotePoi) {
        // 进一步检查：如果有 hiking 或 outdoor 活动，更可能需要4x4
        const hasOutdoorActivity = Array.from(activitySet).some(a =>
          a.includes('hiking') || a.includes('outdoor') || a.includes('nature')
        );
        if (hasOutdoorActivity) {
          return true;
        }
      }
    }

    return false;
  }
}


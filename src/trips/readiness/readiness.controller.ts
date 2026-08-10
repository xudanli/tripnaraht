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
  BadRequestException,
  Delete,
  Put,
} from '@nestjs/common';
import { ModuleRef } from '@nestjs/core';
import { IsOptional, IsString, ValidateNested, IsArray, IsNumber, IsBoolean } from 'class-validator';
import { Type } from 'class-transformer';
import {
  ApiTags,
  ApiOperation,
  ApiResponse,
  ApiBody,
  ApiQuery,
  ApiParam,
  ApiExtraModels,
  getSchemaPath,
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
import { ReadinessCheckResult, ReadinessFindingItem } from './types/readiness-findings.types';
import { successResponse, errorResponse, ErrorCode } from '../../common/dto/standard-response.dto';
import { mapWriteChainBlockedToErrorResponse } from '../../decision-runtime/execution/effective-plan-write-chain-blocked.util';
import { ApiSuccessResponseDto, ApiErrorResponseDto } from '../../common/dto/api-response.dto';
import { PrismaService } from '../../prisma/prisma.service';
import { DateTime } from 'luxon';
import { Public } from '../../auth/decorators/public.decorator';
import { UsersService } from '../../users/users.service';
import { CurrentUser, CurrentUserPayload } from '../../auth/decorators/current-user.decorator';
import { ChecklistStatusService } from './services/checklist-status.service';
import { FindingMarksService } from './services/finding-marks.service';
import { PackingListService } from './services/packing-list.service';
import { PackingTemplateService } from './services/packing-template.service';
import { SolutionService } from './services/solution.service';
import { ReadinessAIService } from './services/readiness-ai.service';
import { ReadinessFeatureFlagsService } from './services/readiness-feature-flags.service';
import { CapabilityPackChecklistService, AddFromCapabilityPackRequest } from './services/capability-pack-checklist.service';
import { RiskTypeMapperService } from './services/risk-type-mapper.service';
import { TripReadinessWeatherForecastService } from './services/trip-readiness-weather-forecast.service';
import { TripDependencyImpactService } from './services/trip-dependency-impact.service';
import { ReadinessCausalPreanalysisService } from './services/readiness-causal-preanalysis.service';
import { buildReadinessCascadeUiHints } from './utils/readiness-causal-preanalysis.util';
import { collectTripPlaceNameHints } from './utils/collect-trip-place-hints.util';
import { CascadeUiHintDto } from '../../travel-cognition/dto/travel-runtime-api.dto';
import { CoverageMapService } from './services/coverage-map.service';
import { ReadinessAutoRepairService } from './services/readiness-auto-repair.service';
import { ReadinessRepairService } from './services/readiness-repair.service';
import { dispatchManualRepairFromModule } from '../../decision-runtime/trigger/record-trigger-lineage-from-module.util';
import { resolveDecisionRunId } from '../../decision-runtime/trigger/record-trigger-lineage.util';
import { UpdateChecklistStatusDto } from './dto/checklist-status.dto';
import {
  MarkNotApplicableDto,
  AddToLaterDto,
} from './dto/finding-mark.dto';
import {
  GeneratePackingListDto,
  UpdatePackingListItemDto,
} from './dto/packing-list.dto';
import { Param as ParamDecorator } from '@nestjs/common';
import { TripConflictsService } from '../services/trip-conflicts.service';
import { ConflictType } from '../dto/trip-conflicts.dto';
import { PackStorageService } from './storage/pack-storage.service';
import { GetReadinessPacksQueryDto, ReadinessPackListResponseDto, CreateReadinessPackDto, UpdateReadinessPackDto } from './dto/admin-pack.dto';
import { UserDecisionService } from './services/user-decision.service';
import { ReadinessToConstraintsCompiler } from './compilers/readiness-to-constraints.compiler';
import { serializePackForAdmin } from './utils/pack-serializer.util';
import { deserializePackFromAdmin } from './utils/pack-deserializer.util';
import type { TripWorldState } from '../decision/world-model';
import { EcoIdentityLedgerPersistenceService } from '../decision/services/eco-identity-ledger-persistence.service';
import { applyPrismaTripIdToWorldState } from '../execution-closure-persistence/apply-prisma-trip-id-to-world-state';
import {
  inferPlaceIdsForHazardType,
  formatMustItinerarySuffix,
  type TripPlaceRef,
} from './utils/itinerary-readiness-context.util';
import {
  buildTripPlaceRefsFromPrismaTrip,
  enrichFindingsRisksForTrip,
  resolveRiskFieldsForApi,
} from './utils/trip-risk-enrichment.util';
import { getLocalizedText } from './utils/i18n.utils';
import { filterRisksForTripPhase, isActionableLiveRisk, getTripReadinessPhase, getDaysUntilTripStart, ACTIONABLE_READINESS_HORIZON_DAYS, type RelevanceFilterableRisk } from './utils/trip-readiness-relevance.util';
import {
  isPlanFeasibilityBlockerId,
  resolveRepairTargetIssueId,
} from '../trip-constraint-solver/utils/repair-authority.util';
import type { FeasibilityReportService } from '../trip-constraint-solver/services/feasibility-report.service';

class TravelerDto {
  @IsOptional()
  @IsString()
  nationality?: string;

  @IsOptional()
  @IsString()
  residencyCountry?: string;

  @IsOptional()
  @IsArray()
  tags?: string[];

  @IsOptional()
  @IsString()
  budgetLevel?: 'low' | 'medium' | 'high';

  @IsOptional()
  @IsString()
  riskTolerance?: 'low' | 'medium' | 'high';
}

class TripDto {
  @IsOptional()
  @IsString()
  startDate?: string;

  @IsOptional()
  @IsString()
  endDate?: string;
}

class ItineraryDto {
  @IsOptional()
  @IsArray()
  countries?: string[];

  @IsOptional()
  @IsArray()
  activities?: string[];

  @IsOptional()
  @IsString()
  season?: string;

  @IsOptional()
  @IsString()
  region?: string;

  @IsOptional()
  @IsBoolean()
  hasSeaCrossing?: boolean;

  @IsOptional()
  @IsBoolean()
  hasAuroraActivity?: boolean;

  @IsOptional()
  @IsString()
  vehicleType?: string;

  @IsOptional()
  @IsNumber()
  routeLength?: number;
}

class MountainsDto {
  @IsOptional()
  @IsBoolean()
  inMountain?: boolean;

  @IsOptional()
  @IsNumber()
  mountainElevationAvg?: number;

  @IsOptional()
  @IsNumber()
  terrainComplexity?: number;

  @IsOptional()
  @IsBoolean()
  hasMountainPass?: boolean;
}

class RoadsDto {
  @IsOptional()
  @IsBoolean()
  nearRoad?: boolean;

  @IsOptional()
  @IsNumber()
  roadDensityScore?: number;

  @IsOptional()
  @IsBoolean()
  hasMountainPass?: boolean;
}

class SafetyDto {
  @IsOptional()
  @IsBoolean()
  hasHospital?: boolean;

  @IsOptional()
  @IsBoolean()
  hasPolice?: boolean;
}

class SupplyDto {
  @IsOptional()
  @IsBoolean()
  hasFuel?: boolean;

  @IsOptional()
  @IsBoolean()
  hasSupermarket?: boolean;
}

class PoisDto {
  @IsOptional()
  @IsNumber()
  supplyDensity?: number;

  @IsOptional()
  @IsBoolean()
  hasCheckpoint?: boolean;

  @IsOptional()
  @ValidateNested()
  @Type(() => SafetyDto)
  safety?: SafetyDto;

  @IsOptional()
  @ValidateNested()
  @Type(() => SupplyDto)
  supply?: SupplyDto;
}

class GeoDto {
  @IsOptional()
  @IsNumber()
  lat?: number;

  @IsOptional()
  @IsNumber()
  lng?: number;

  @IsOptional()
  @IsBoolean()
  enhanceWithGeo?: boolean;

  @IsOptional()
  @ValidateNested()
  @Type(() => MountainsDto)
  mountains?: MountainsDto;

  @IsOptional()
  @ValidateNested()
  @Type(() => RoadsDto)
  roads?: RoadsDto;

  @IsOptional()
  @ValidateNested()
  @Type(() => PoisDto)
  pois?: PoisDto;
}

export class CheckReadinessDto {
  @IsString()
  destinationId!: string;

  @IsOptional()
  @ValidateNested()
  @Type(() => TravelerDto)
  traveler?: TravelerDto;

  @IsOptional()
  @ValidateNested()
  @Type(() => TripDto)
  trip?: TripDto;

  @IsOptional()
  @ValidateNested()
  @Type(() => ItineraryDto)
  itinerary?: ItineraryDto;

  @IsOptional()
  @ValidateNested()
  @Type(() => GeoDto)
  geo?: GeoDto;
}

@ApiTags('readiness')
@ApiExtraModels(CascadeUiHintDto)
@Controller('readiness')
export class ReadinessController {
  private readonly logger = new Logger(ReadinessController.name);

  private tripConflictsService?: TripConflictsService;

  constructor(
    private readonly readinessService: ReadinessService,
    private readonly capabilityPackEvaluator: CapabilityPackEvaluatorService,
    private readonly prisma: PrismaService,
    private readonly usersService: UsersService,
    private readonly checklistStatusService: ChecklistStatusService,
    private readonly findingMarksService: FindingMarksService,
    private readonly packingListService: PackingListService,
    private readonly packingTemplateService: PackingTemplateService,
    private readonly solutionService: SolutionService,
    private readonly packStorageService: PackStorageService,
    private readonly readinessAIService: ReadinessAIService,
    private readonly featureFlagsService: ReadinessFeatureFlagsService,
    private readonly capabilityPackChecklistService: CapabilityPackChecklistService,
    private readonly userDecisionService: UserDecisionService,
    private readonly constraintsCompiler: ReadinessToConstraintsCompiler,
    private readonly coverageMapService: CoverageMapService,
    private readonly readinessAutoRepairService: ReadinessAutoRepairService,
    private readonly readinessRepairService: ReadinessRepairService,
    private readonly riskTypeMapperService: RiskTypeMapperService,
    private readonly tripReadinessWeatherForecastService: TripReadinessWeatherForecastService,
    private readonly tripDependencyImpactService: TripDependencyImpactService,
    private readonly causalPreanalysisService: ReadinessCausalPreanalysisService,
    private readonly moduleRef: ModuleRef,
  ) {
    // ⚠️ 使用懒加载避免循环依赖死锁
    // TripConflictsService / DecisionTriggerGatewayService 在需要时通过 ModuleRef 获取
  }

  /**
   * 懒加载获取 TripConflictsService
   * 避免在构造函数中注入，防止循环依赖死锁
   */
  private getTripConflictsService(): TripConflictsService | null {
    if (!this.tripConflictsService) {
      try {
        this.tripConflictsService = this.moduleRef.get(TripConflictsService, { strict: false });
      } catch (error) {
        this.logger.warn('无法获取 TripConflictsService，时间冲突检查功能将不可用');
        return null;
      }
    }
    return this.tripConflictsService || null;
  }

  private getFeasibilityReportService(): FeasibilityReportService | undefined {
    try {
      const { FeasibilityReportService: Svc } = require('../trip-constraint-solver/services/feasibility-report.service') as {
        FeasibilityReportService: new (...args: never[]) => FeasibilityReportService;
      };
      return this.moduleRef.get(Svc, { strict: false });
    } catch {
      return undefined;
    }
  }

  /**
   * Minimal `TripWorldState` for `extractTripContext` / AI：用 `applyPrismaTripIdToWorldState` 绑定 Prisma 行程 id，再尝试从 DB hydrate ECO 账本。
   */
  private async prepareTripWorldStateForAi(params: {
    tripId: string;
    destination: string;
    startDate: string;
    durationDays: number;
  }): Promise<TripWorldState> {
    const state: TripWorldState = {
      context: {
        destination: params.destination,
        startDate: params.startDate,
        durationDays: params.durationDays,
        preferences: { intents: {}, pace: 'moderate', riskTolerance: 'medium' },
      },
      candidatesByDate: {},
      signals: { lastUpdatedAt: new Date().toISOString() },
    };
    applyPrismaTripIdToWorldState(state, params.tripId);
    try {
      const svc = this.moduleRef.get(EcoIdentityLedgerPersistenceService, { strict: false });
      await svc.hydrateWorldStateIfNeeded(state);
    } catch {
      // Ledger service absent in minimal/test graphs — AI path still works without prior ledger.
    }
    return state;
  }

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
                  Place: { include: { City: true } },
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
      const placeNames = collectTripPlaceNameHints(trip.TripDay);

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
      let result = await this.readinessService.checkFromDestination(
        trip.destination,
        context,
        {
          enhanceWithGeo: !!(geoLat && geoLng),
          geoLat,
          geoLng,
          lang: lang || 'en',
          placeNames,
        }
      );

      // 🆕 增强风险信息 / 必须项：附着本行程 POI（天、名称），避免 Pack 级泛泛描述
      if (result.findings && result.findings.length > 0) {
        const poiMap = new Map<number, { name: string; nameCN?: string; day: number }>();
        const tripPlaceRefs: TripPlaceRef[] = [];
        try {
          if (trip.TripDay) {
            const seenPlace = new Set<number>();
            trip.TripDay.forEach((day, dayIndex) => {
              day.ItineraryItem?.forEach((item) => {
                if (item.Place) {
                  const placeId = item.Place.id;
                  if (!seenPlace.has(placeId)) {
                    seenPlace.add(placeId);
                    const md = (item.Place.metadata as Record<string, unknown>) || {};
                    const canonicalType =
                      typeof md.canonicalType === 'string' ? md.canonicalType : undefined;
                    const nameEN = item.Place.nameEN || undefined;
                    const nameCN = item.Place.nameCN ?? undefined;
                    const name = nameEN || nameCN || `POI ${placeId}`;
                    poiMap.set(placeId, {
                      name,
                      nameCN,
                      day: dayIndex + 1,
                    });
                    tripPlaceRefs.push({
                      placeId,
                      day: dayIndex + 1,
                      name,
                      nameCN,
                      canonicalType,
                      category: item.Place.category || '',
                    });
                  }
                }
              });
            });
          }
        } catch (poiError) {
          this.logger.warn(`构建POI映射失败，风险信息将不包含POI详情: ${(poiError as Error).message}`);
        }

        const effectiveLang = lang || 'zh';

        result.findings = result.findings.map((finding: any) => {
          if (finding.risks && finding.risks.length > 0) {
            finding.risks = finding.risks.map((r: any) => {
              let poiIds: number[] = [];
              if (r.affectedPois?.length) {
                poiIds = r.affectedPois
                  .map((poiId: unknown) => {
                    if (poiId != null && typeof poiId === 'object' && 'id' in (poiId as object)) {
                      const id = (poiId as { id?: string | number }).id;
                      return typeof id === 'number' ? id : parseInt(String(id), 10);
                    }
                    return typeof poiId === 'number' ? poiId : parseInt(String(poiId), 10);
                  })
                  .filter((n: number) => !Number.isNaN(n));
              } else {
                poiIds = inferPlaceIdsForHazardType(String(r.type || ''), tripPlaceRefs);
              }

              const baseRisk: any = {
                ...r,
                sourceType: 'readiness',
                severity: (r.severity || 'medium') as 'high' | 'medium' | 'low',
                affectedPois: poiIds.map((poiIdNum: number) => {
                  const poiInfo = poiMap.get(poiIdNum);
                  if (poiInfo) {
                    return {
                      id: poiIdNum.toString(),
                      name: poiInfo.name,
                      nameCN: poiInfo.nameCN,
                      day: poiInfo.day,
                    };
                  }
                  return {
                    id: poiIdNum.toString(),
                    name: `POI ${poiIdNum}`,
                    day: undefined,
                  };
                }),
              };
              return this.riskTypeMapperService.enhanceRisk(baseRisk, effectiveLang);
            });
          }

          if (finding.must?.length) {
            finding.must = finding.must.map((item: ReadinessFindingItem) => {
              const suffix = formatMustItinerarySuffix(tripPlaceRefs, effectiveLang);
              if (!suffix) return item;
              const ordered = tripPlaceRefs.length === 1 ? tripPlaceRefs[0] : undefined;
              return {
                ...item,
                message: `${item.message}${suffix}`,
                ...(ordered
                  ? {
                      tripScope: {
                        kind: 'poi' as const,
                        day: ordered.day,
                        fromPoi: { id: String(ordered.placeId), name: ordered.name },
                      },
                    }
                  : {}),
              };
            });
          }

          return finding;
        });
      }

      // 与 GET .../score 对齐：将覆盖地图 high severity 缺口写入对应 findings[].blockers（稳定 id：coverage-gap:*）
      result = await this.coverageMapService.mergeHighSeverityCoverageGapBlockersIntoTripReadiness(
        tripId,
        trip.destination ?? '',
        result,
      );

      result = await this.coverageMapService.mergePoiAccessFindingsIntoTripReadiness(
        tripId,
        trip.destination ?? '',
        result,
      );

      // 与 /score、/insight 对齐：卡片可展示覆盖地图分数与行程级 must/blockers
      let coverage: Awaited<ReturnType<CoverageMapService['getReadinessScore']>> | undefined;
      try {
        coverage = await this.coverageMapService.getReadinessScore(tripId);
      } catch (scoreError) {
        this.logger.warn(
          `getTripReadiness: coverage score skipped: ${(scoreError as Error).message}`,
        );
      }

      const coverageSummary = coverage?.summary;
      const coverageScore = coverage?.score;
      let tripReadinessStatus: 'block' | 'warn' | 'pass' = 'pass';
      if ((coverageSummary?.blockers ?? 0) > 0) {
        tripReadinessStatus = 'block';
      } else if ((coverageSummary?.must ?? 0) > 0 || (coverageScore?.overall ?? 100) < 70) {
        tripReadinessStatus = 'warn';
      }

      const readinessPhase = getTripReadinessPhase(trip.startDate, {
        endDate: trip.endDate,
        status: trip.status,
      });
      const daysUntilStart = getDaysUntilTripStart(trip.startDate);
      let deferredLiveRiskCount = 0;

      if (readinessPhase === 'planning' && result.findings?.length) {
        result.findings = result.findings.map((finding: any) => {
          if (!finding.risks?.length) return finding;
          const before = finding.risks.length;
          const risks = finding.risks.filter((r: RelevanceFilterableRisk) => !isActionableLiveRisk(r));
          deferredLiveRiskCount += before - risks.length;
          return { ...finding, risks };
        });
      }

      let coverageRisks = coverage?.risks;
      if (readinessPhase === 'planning' && coverageRisks?.length) {
        const before = coverageRisks.length;
        coverageRisks = coverageRisks.filter((r) => !isActionableLiveRisk(r));
        deferredLiveRiskCount += before - coverageRisks.length;
      }

      const phaseHint =
        readinessPhase === 'planning'
          ? (lang === 'en'
              ? `Trip starts in ${daysUntilStart} days. Live road and weather alerts appear within ${ACTIONABLE_READINESS_HORIZON_DAYS} days of departure.`
              : `行程尚早（${daysUntilStart} 天后出发）。实时路况与逐日天气将在出发前 ${ACTIONABLE_READINESS_HORIZON_DAYS} 天内显示。`)
          : readinessPhase === 'in_trip'
            ? (lang === 'en'
                ? 'In-trip: use GET /api/trips/:id/in-trip/readiness/today for day-scoped execution readiness.'
                : '行中请使用 GET /api/trips/:id/in-trip/readiness/today 查看「今日就绪」。')
            : undefined;

      return successResponse({
        ...result,
        tripReadinessStatus,
        readinessPhase,
        daysUntilStart,
        deferredLiveRiskCount: deferredLiveRiskCount || undefined,
        phaseHint,
        coverage: coverage
          ? {
              score: coverage.score,
              summary: coverage.summary,
              findings: coverage.findings,
              risks: coverageRisks,
              calculatedAt: coverage.calculatedAt,
            }
          : undefined,
      });
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
    description: '评估哪些能力包应该被触发。支持自动获取目的地地理特征（P2增强）',
  })
  @ApiBody({ type: CheckReadinessDto })
  @ApiQuery({ name: 'autoEnhanceGeo', description: '是否自动获取目的地地理特征', required: false, type: Boolean })
  @ApiResponse({
    status: 200,
    description: '成功返回能力包评估结果',
    type: ApiSuccessResponseDto,
  })
  async evaluateCapabilityPacks(
    @Body() dto: CheckReadinessDto,
    @Query('autoEnhanceGeo') autoEnhanceGeo?: string,
  ): Promise<any> {
    try {
      let geoData = dto.geo ? {
        latitude: dto.geo.lat,
        longitude: dto.geo.lng,
        mountains: dto.geo.mountains,
        roads: dto.geo.roads,
        pois: dto.geo.pois,
      } : undefined;

      // P2: 自动获取目的地地理特征（如果请求且 geo 未提供）
      let geoEnhanced = false;
      if (autoEnhanceGeo === 'true' && dto.destinationId && (!dto.geo || dto.geo.enhanceWithGeo)) {
        try {
          // 尝试从 GeoFactsService 获取地理特征
          const geoFacts = await this.readinessService.getGeoFactsForDestination(dto.destinationId);
          if (geoFacts) {
            geoData = {
              ...geoData,
              latitude: geoFacts.latitude || geoData?.latitude,
              longitude: geoFacts.longitude || geoData?.longitude,
              mountains: geoFacts.mountains || geoData?.mountains,
              roads: geoFacts.roads || geoData?.roads,
              pois: geoFacts.pois || geoData?.pois,
            };
            geoEnhanced = true;
          }
        } catch (geoError) {
          this.logger.warn(`Failed to auto-enhance geo for ${dto.destinationId}: ${(geoError as Error).message}`);
        }
      }

      // 自动计算季节（如果未提供）
      let season = dto.itinerary?.season;
      if (!season && dto.trip?.startDate) {
        const startDate = new Date(dto.trip.startDate);
        const month = startDate.getMonth() + 1; // 1-12
        if (month >= 12 || month <= 2) {
          season = 'winter';
        } else if (month >= 3 && month <= 5) {
          season = 'spring';
        } else if (month >= 6 && month <= 8) {
          season = 'summer';
        } else {
          season = 'autumn';
        }
        this.logger.debug(`Auto-calculated season from trip date: ${season}`);
      }

      // 如果是冰岛且 geoData 不完整，添加默认的冰岛特征
      if (dto.destinationId === 'IS' || dto.itinerary?.countries?.includes('IS')) {
        // 确保 geoData 已初始化
        const icelandGeo = geoData || ({} as any);
        
        // 冰岛默认有山区和季节性道路
        if (!icelandGeo.mountains) {
          icelandGeo.mountains = {
            inMountain: true,
            hasMountainPass: true,
          };
        }
        if (!icelandGeo.roads) {
          icelandGeo.roads = {
            hasMountainPass: true,
            roadDensityScore: 0.15, // 冰岛道路密度较低（触发 emergency pack 需要 < 0.2）
          };
        }
        if (!icelandGeo.pois) {
          icelandGeo.pois = {
            supplyDensity: 0.15, // 冰岛补给点密度较低
            hasCheckpoint: false,
          };
        }
        // 冰岛安全设施（偏远地区医院稀少）
        if (!icelandGeo.pois.safety) {
          icelandGeo.pois.safety = {
            hasHospital: false,
            hasPolice: false,
          };
        }
        
        geoData = icelandGeo;
        this.logger.debug(`Enhanced Iceland geo data: mountains=${JSON.stringify(icelandGeo.mountains)}, roads=${JSON.stringify(icelandGeo.roads)}, pois=${JSON.stringify(icelandGeo.pois)}`);
      }

      const context: TripContext = {
        traveler: dto.traveler || {},
        trip: dto.trip || {},
        itinerary: {
          countries: dto.itinerary?.countries || [],
          activities: dto.itinerary?.activities || [],
          season: season,
          routeLength: dto.itinerary?.routeLength,
        },
        geo: geoData,
      };

      const allPacks = [
        highAltitudePack,
        sparseSupplyPack,
        seasonalRoadPack,
        permitCheckpointPack,
        emergencyPack,
      ];

      // P2: 增强评估结果，包含触发原因
      const results = allPacks.map(pack => {
        const result = this.capabilityPackEvaluator.evaluatePack(pack, context);
        
        // 生成触发原因
        let triggerReason: string | undefined;
        if (result.triggered) {
          triggerReason = this.generateTriggerReason(pack, context);
        }
        
        return {
          ...result,
          triggerReason,
        };
      });

      const triggeredPacks = results.filter(r => r.triggered);

      return successResponse({
        total: allPacks.length,
        triggered: triggeredPacks.length,
        results: triggeredPacks,
        // P2: 返回是否使用了自动地理增强
        geoEnhanced,
        // P2: 返回实际使用的上下文（用于调试）
        context: {
          hasGeo: !!geoData,
          hasTraveler: Object.keys(dto.traveler || {}).length > 0,
          itinerary: {
            countries: context.itinerary.countries,
            activities: context.itinerary.activities,
            season: context.itinerary.season,
            routeLength: context.itinerary.routeLength,
          },
        },
      });
    } catch (error) {
      const err = error as Error;
      this.logger.error(`Failed to evaluate capability packs: ${err.message}`, err.stack);
      return errorResponse('EVALUATE_CAPABILITY_PACKS_FAILED', err.message);
    }
  }

  /**
   * P2: 生成触发原因
   */
  private generateTriggerReason(pack: any, context: TripContext): string {
    const reasons: string[] = [];
    
    switch (pack.type) {
      case 'high_altitude':
        if (context.geo?.mountains?.mountainElevationAvg) {
          reasons.push(`平均海拔约 ${context.geo.mountains.mountainElevationAvg} 米`);
        }
        break;
      case 'sparse_supply': {
        if (context.itinerary.routeLength) {
          reasons.push(`全程约 ${context.itinerary.routeLength} 公里`);
        }
        const sparseParts: string[] = [];
        if (context.geo?.pois?.supplyDensity !== undefined && context.geo.pois.supplyDensity < 0.3) {
          sparseParts.push('沿途加油站/超市较少');
        }
        if (context.geo?.roads?.roadDensityScore !== undefined && context.geo.roads.roadDensityScore < 0.4) {
          sparseParts.push('部分路段较偏远');
        }
        if (sparseParts.length > 0) {
          reasons.push(sparseParts.join('，'));
        }
        break;
      }
      case 'seasonal_road':
        if (context.itinerary.season === 'winter') {
          reasons.push('冬季自驾');
        }
        if (context.geo?.mountains?.inMountain) {
          reasons.push('途经山区/高地');
        }
        break;
      case 'permit_checkpoint':
        if (context.geo?.pois?.hasCheckpoint) {
          reasons.push('途经检查站或许可区域');
        }
        break;
      case 'emergency':
        if (context.geo?.roads?.roadDensityScore !== undefined && context.geo.roads.roadDensityScore < 0.2) {
          reasons.push('路线较偏远');
        }
        if (context.geo?.pois?.safety?.hasHospital === false) {
          reasons.push('附近医疗点较远');
        }
        break;
    }
    
    return reasons.length > 0 ? reasons.join('；') : '符合本行程特征';
  }

  // ==================== P0: 能力包规则同步到准备清单 ====================

  @Public()
  @Post('trip/:tripId/checklist/add-from-capability-pack')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({
    summary: '从能力包添加规则到准备清单',
    description: '将能力包评估结果中的规则添加到行程的准备清单中',
  })
  @ApiParam({ name: 'tripId', description: '行程 ID' })
  @ApiBody({
    schema: {
      type: 'object',
      properties: {
        packType: { type: 'string', description: '能力包类型', example: 'seasonal_road' },
        rules: {
          type: 'array',
          items: {
            type: 'object',
            properties: {
              id: { type: 'string', example: 'rule.seasonal.night.driving' },
              level: { type: 'string', enum: ['blocker', 'must', 'should', 'optional'] },
              message: { type: 'string' },
              category: { type: 'string' },
              tasks: { type: 'array' },
            },
          },
        },
      },
    },
  })
  @ApiResponse({
    status: 200,
    description: '成功添加规则到准备清单',
    type: ApiSuccessResponseDto,
  })
  async addFromCapabilityPack(
    @Param('tripId') tripId: string,
    @Body() dto: AddFromCapabilityPackRequest,
  ): Promise<any> {
    try {
      const result = await this.capabilityPackChecklistService.addFromCapabilityPack(tripId, dto);
      return successResponse(result);
    } catch (error) {
      const err = error as Error;
      this.logger.error(`Failed to add from capability pack: ${err.message}`, err.stack);
      return errorResponse('ADD_FROM_CAPABILITY_PACK_FAILED', err.message);
    }
  }

  @Public()
  @Get('trip/:tripId/checklist/capability-pack-items')
  @ApiOperation({
    summary: '获取能力包清单项',
    description: '获取行程中从能力包添加的准备清单项',
  })
  @ApiParam({ name: 'tripId', description: '行程 ID' })
  @ApiQuery({ name: 'packType', description: '能力包类型（可选，用于筛选）', required: false })
  @ApiResponse({
    status: 200,
    description: '成功返回能力包清单项',
    type: ApiSuccessResponseDto,
  })
  async getCapabilityPackItems(
    @Param('tripId') tripId: string,
    @Query('packType') packType?: string,
  ): Promise<any> {
    try {
      const items = await this.capabilityPackChecklistService.getCapabilityPackItems(tripId, packType);
      const grouped = await this.capabilityPackChecklistService.getItemsGroupedByLevel(tripId);
      return successResponse({
        items,
        grouped,
        total: items.length,
      });
    } catch (error) {
      const err = error as Error;
      this.logger.error(`Failed to get capability pack items: ${err.message}`, err.stack);
      return errorResponse('GET_CAPABILITY_PACK_ITEMS_FAILED', err.message);
    }
  }

  @Public()
  @Put('trip/:tripId/checklist/capability-pack-items/:itemId/status')
  @ApiOperation({
    summary: '更新能力包清单项状态',
    description: '更新能力包清单项的勾选状态',
  })
  @ApiParam({ name: 'tripId', description: '行程 ID' })
  @ApiParam({ name: 'itemId', description: '清单项 ID' })
  @ApiBody({
    schema: {
      type: 'object',
      properties: {
        checked: { type: 'boolean', description: '是否已完成' },
      },
    },
  })
  @ApiResponse({
    status: 200,
    description: '成功更新状态',
    type: ApiSuccessResponseDto,
  })
  async updateCapabilityPackItemStatus(
    @Param('tripId') tripId: string,
    @Param('itemId') itemId: string,
    @Body() dto: { checked: boolean },
  ): Promise<any> {
    try {
      const item = await this.capabilityPackChecklistService.updateItemStatus(tripId, itemId, dto.checked);
      return successResponse(item);
    } catch (error) {
      const err = error as Error;
      this.logger.error(`Failed to update capability pack item status: ${err.message}`, err.stack);
      return errorResponse('UPDATE_CAPABILITY_PACK_ITEM_STATUS_FAILED', err.message);
    }
  }

  @Public()
  @Delete('trip/:tripId/checklist/capability-pack-items/:itemId')
  @ApiOperation({
    summary: '删除能力包清单项',
    description: '从准备清单中删除指定的能力包清单项',
  })
  @ApiParam({ name: 'tripId', description: '行程 ID' })
  @ApiParam({ name: 'itemId', description: '清单项 ID' })
  @ApiResponse({
    status: 200,
    description: '成功删除',
    type: ApiSuccessResponseDto,
  })
  async removeCapabilityPackItem(
    @Param('tripId') tripId: string,
    @Param('itemId') itemId: string,
  ): Promise<any> {
    try {
      const result = await this.capabilityPackChecklistService.removeItem(tripId, itemId);
      return successResponse(result);
    } catch (error) {
      const err = error as Error;
      this.logger.error(`Failed to remove capability pack item: ${err.message}`, err.stack);
      return errorResponse('REMOVE_CAPABILITY_PACK_ITEM_FAILED', err.message);
    }
  }

  @Public()
  @Get('personalized-checklist')
  @ApiOperation({
    summary: '获取个性化准备清单（故事6.1）',
    description: '获取适配行程的准备事项清单，按 blocker/must/should/optional 分类，包含截止时间和办理渠道',
  })
  @ApiQuery({ name: 'tripId', description: '行程 ID', required: true })
  @ApiQuery({ name: 'lang', description: '语言', required: false, enum: ['en', 'zh'] })
  @ApiQuery({ name: 'userId', description: '用户 ID（可选，用于个性化）', required: false })
  @ApiResponse({
    status: 200,
    description: '成功返回个性化准备清单',
    type: ApiSuccessResponseDto,
  })
  async getPersonalizedChecklist(
    @Query('tripId') tripId: string,
    @Query('lang') lang?: 'en' | 'zh',
    @Query('userId') userId?: string,
    @CurrentUser() currentUser?: CurrentUserPayload,
  ): Promise<any> {
    try {
      // 获取用户 ID（优先使用 currentUser，其次使用 query 参数）
      const effectiveUserId = currentUser?.userId || userId;

      // 从行程获取上下文
      const baseResult = await this.readinessService.checkFromDestination(tripId, {
        traveler: {},
        trip: {},
        itinerary: {
          countries: [],
        },
      }, {
        lang: lang || 'en',
      });

      // 提取 Trip Context（用于 AI 增强）
      const trip = await this.prisma.trip.findUnique({
        where: { id: tripId },
      });

      if (!trip) {
        throw new NotFoundException(`行程 ID ${tripId} 不存在`);
      }

      // 计算行程天数
      const startDate = new Date(trip.startDate);
      const endDate = new Date(trip.endDate);
      const durationDays = Math.ceil((endDate.getTime() - startDate.getTime()) / (1000 * 60 * 60 * 24)) + 1;

      // 获取用户画像（如果提供了 userId）
      let userProfileData = null;
      if (effectiveUserId) {
        userProfileData = await this.prisma.userProfile.findUnique({
          where: { userId: effectiveUserId },
        });
      }

      const tripWorldState = await this.prepareTripWorldStateForAi({
        tripId,
        destination: trip.destination || '',
        startDate: trip.startDate.toISOString().split('T')[0],
        durationDays,
      });
      const tripContext = this.readinessService.extractTripContext(tripWorldState);

      // 构建用户画像
      const userProfile = effectiveUserId
        ? await this.extractUserProfile(effectiveUserId, userProfileData)
        : undefined;

      // 检查是否启用 AI 增强
      const aiEnabled =
        effectiveUserId &&
        (await this.featureFlagsService.isAIEnhancementEnabled(
          effectiveUserId,
          'readiness_ai_enhancement',
        ));

      // AI 增强（如果启用）
      let enhancedResult = baseResult;
      if (aiEnabled && userProfile) {
        try {
          enhancedResult = await this.readinessAIService.enhancePersonalizedChecklist(
            baseResult,
            userProfile,
            tripContext,
            { enableAI: true },
          );
        } catch (error) {
          this.logger.warn('AI enhancement failed, using base result', error);
          // 降级到基础结果
        }
      }

      // 转换为个性化清单格式（带 AI 增强）
      const checklist = this.buildChecklistWithEnhancements(enhancedResult);

      return successResponse({
        tripId,
        checklist,
        summary: {
          totalBlockers: checklist.blocker.length,
          totalMust: checklist.must.length,
          totalShould: checklist.should.length,
          totalOptional: checklist.optional.length,
        },
        aiEnhanced: aiEnabled && !!(enhancedResult as any).aiEnhancements,
        failedFeatures: (enhancedResult as any).failedFeatures || [],
      });
    } catch (error) {
      const err = error as Error;
      this.logger.error(`Failed to get personalized checklist: ${err.message}`, err.stack);
      return errorResponse(ErrorCode.INTERNAL_ERROR, err.message);
    }
  }

  /**
   * 提取用户画像
   */
  private async extractUserProfile(
    userId: string,
    userProfile?: any,
  ): Promise<import('./types/ai-enhanced.types').UserProfile> {
    const profile: import('./types/ai-enhanced.types').UserProfile = {
      userId,
    };

    if (userProfile?.preferences) {
      const prefs = userProfile.preferences as any;
      profile.budgetLevel = prefs.budgetLevel;
      profile.riskTolerance = prefs.riskTolerance;
      profile.tags = prefs.tags;
      profile.nationality = prefs.nationality;
      profile.residencyCountry = prefs.residencyCountry;
    }

    return profile;
  }

  /**
   * 构建带 AI 增强的清单
   */
  private buildChecklistWithEnhancements(result: import('./types/readiness-findings.types').ReadinessCheckResult & { aiEnhancements?: any; failedFeatures?: string[] }) {
    const enhancements = result.aiEnhancements || {};
    const deadlinesMap = new Map<string, import('./types/ai-enhanced.types').DeadlineEnhancement>();
    const channelsMap = new Map<string, import('./types/ai-enhanced.types').ChannelEnhancement>();
    const rankingsMap = new Map<string, import('./types/ai-enhanced.types').RankingEnhancement>();

    // 构建映射
    enhancements.deadlines?.forEach((d: any) => deadlinesMap.set(d.itemId, d));
    enhancements.channels?.forEach((c: any) => channelsMap.set(c.itemId, c));
    enhancements.rankings?.forEach((r: any) => rankingsMap.set(r.itemId, r));

    // 构建清单项
    const buildItem = (item: any) => {
      const deadline = deadlinesMap.get(item.id);
      const channel = channelsMap.get(item.id);
      const ranking = rankingsMap.get(item.id);

      return {
        id: item.id,
        message: item.message,
        tasks: item.tasks || [],
        deadline: deadline?.deadline,
        channel: channel?.channels?.[0]?.name || channel?.channels?.[0]?.url,
        channelDetails: channel?.channels,
        personalizedRank: ranking?.personalizedRank,
        rankingReasoning: ranking?.reasoning,
      };
    };

    return {
      blocker: result.findings.flatMap((f) => f.blockers.map(buildItem)),
      must: result.findings.flatMap((f) => f.must.map(buildItem)),
      should: result.findings.flatMap((f) => f.should.map(buildItem)),
      optional: result.findings.flatMap((f) => f.optional.map(buildItem)),
    };
  }

  @Public()
  @Get('trip/:tripId/weather-forecast')
  @ApiOperation({
    summary: '行程逐日天气预报',
    description: '基于行程 POI 坐标调用 Open-Meteo 逐日预报（最多 16 天窗口）',
  })
  @ApiParam({ name: 'tripId', description: '行程 ID' })
  @ApiQuery({ name: 'lang', required: false, enum: ['en', 'zh'] })
  async getTripWeatherForecast(
    @Param('tripId') tripId: string,
    @Query('lang') lang?: 'en' | 'zh',
  ): Promise<any> {
    try {
      const trip = await this.prisma.trip.findUnique({
        where: { id: tripId },
        include: {
          TripDay: {
            include: {
              ItineraryItem: {
                include: {
                  Place: {
                    select: {
                      id: true,
                      metadata: true,
                    },
                  },
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

      const effectiveLang = lang || 'zh';
      const bundle = await this.tripReadinessWeatherForecastService.buildForecastRisksForTrip(
        trip,
        effectiveLang,
      );

      return successResponse({
        tripId,
        summary: bundle.summary,
        forecastDays: bundle.risks[0]?.forecastDays || [],
        risk: bundle.risks[0]
          ? this.riskTypeMapperService.enhanceRisk(
              {
                ...bundle.risks[0],
                mitigation: bundle.risks[0].mitigations,
                affectedPois: [],
              },
              effectiveLang,
            )
          : null,
      });
    } catch (error) {
      const err = error as Error;
      if (err instanceof NotFoundException) {
        throw err;
      }
      this.logger.error(`Failed to get trip weather forecast: ${err.message}`, err.stack);
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
  @ApiQuery({ name: 'lang', description: '语言', required: false, enum: ['en', 'zh'] })
  @ApiQuery({ name: 'userId', description: '用户 ID（可选，用于个性化）', required: false })
  @ApiQuery({ name: 'includeCapabilityPackHazards', description: '是否包含能力包风险', required: false, type: Boolean })
  @ApiResponse({
    status: 200,
    description: '成功返回风险预警',
    type: ApiSuccessResponseDto,
  })
  async getRiskWarnings(
    @Query('tripId') tripId: string,
    @Query('lang') lang?: 'en' | 'zh',
    @Query('userId') userId?: string,
    @Query('includeCapabilityPackHazards') includeCapabilityPackHazards?: string,
    @CurrentUser() currentUser?: CurrentUserPayload,
  ): Promise<any> {
    try {
      // 获取用户 ID（优先使用 currentUser，其次使用 query 参数）
      const effectiveUserId = currentUser?.userId || userId;

      // 获取行程信息（包含POI信息，用于增强风险信息）
      const trip = await this.prisma.trip.findUnique({
        where: { id: tripId },
        include: {
          TripDay: {
            include: {
              ItineraryItem: {
                include: {
                  Place: {
                    select: {
                      id: true,
                      nameCN: true,
                      nameEN: true,
                      category: true,
                      metadata: true,
                    },
                  },
                },
                orderBy: { startTime: 'asc' },
              },
            },
            orderBy: { date: 'asc' },
          },
        },
      });

      if (!trip) {
        throw new NotFoundException(`行程 ID ${tripId} 不存在`);
      }

      // 计算行程天数
      const startDate = new Date(trip.startDate);
      const endDate = new Date(trip.endDate);
      const durationDays = Math.ceil((endDate.getTime() - startDate.getTime()) / (1000 * 60 * 60 * 24)) + 1;

      // 获取用户画像（如果提供了 userId）
      let userProfileData = null;
      if (effectiveUserId) {
        userProfileData = await this.prisma.userProfile.findUnique({
          where: { userId: effectiveUserId },
        });
      }

      // 从行程获取上下文
      let baseResult;
      try {
        baseResult = await this.readinessService.checkFromDestination(
          trip.destination,
          {
            traveler: {},
            trip: {},
            itinerary: {
              countries: [],
            },
          },
          {
            lang: lang || 'zh',
          },
        );
      } catch (readinessError) {
        this.logger.error(`准备度检查失败: ${(readinessError as Error).message}`, (readinessError as Error).stack);
        // 如果准备度检查失败，返回空结果而不是500错误
        baseResult = {
          findings: [],
          summary: {
            totalBlockers: 0,
            totalMust: 0,
            totalShould: 0,
            totalOptional: 0,
            totalRisks: 0,
          },
        };
      }

      const tripWorldState = await this.prepareTripWorldStateForAi({
        tripId,
        destination: trip.destination || '',
        startDate: trip.startDate.toISOString().split('T')[0],
        durationDays,
      });
      const tripContext = this.readinessService.extractTripContext(tripWorldState);

      // 构建用户画像
      const userProfile = effectiveUserId
        ? await this.extractUserProfile(effectiveUserId, userProfileData)
        : undefined;

      // 检查是否启用 AI 增强
      const aiEnabled =
        effectiveUserId &&
        (await this.featureFlagsService.isAIEnhancementEnabled(
          effectiveUserId,
          'readiness_ai_enhancement',
        ));

      // AI 增强（如果启用）
      let riskEnhancements: import('./types/ai-enhanced.types').RiskAIEnhancements = {};
      if (aiEnabled && userProfile) {
        try {
          riskEnhancements = await this.readinessAIService.enhanceRiskWarnings(
            baseResult,
            userProfile,
            tripContext,
            { enableAI: true },
          );
        } catch (error) {
          this.logger.warn('Risk AI enhancement failed, using base result', error);
          // 降级到基础结果
        }
      }

      // 与 GET /readiness/trip/:id 对齐：Pack 风险附着行程 POI + 真实 hazard 文案
      const effectiveLang = lang || 'zh';
      const { poiMap, tripPlaceRefs } = buildTripPlaceRefsFromPrismaTrip(trip);
      if (baseResult.findings?.length) {
        baseResult.findings = enrichFindingsRisksForTrip(
          baseResult.findings as any,
          poiMap,
          tripPlaceRefs,
          effectiveLang,
          this.riskTypeMapperService,
        ) as any;
      }

      // 构建风险映射
      const severityMap = new Map<string, string>();
      const mitigationMap = new Map<string, string[]>();
      const emergencyContactsMap = new Map<string, any[]>();

      riskEnhancements.severityAssessments?.forEach((s) => {
        severityMap.set(s.riskId, s.assessedSeverity);
      });
      riskEnhancements.mitigations?.forEach((m) => {
        mitigationMap.set(m.riskId, m.personalizedMitigations);
      });
      riskEnhancements.emergencyContacts?.forEach((e) => {
        emergencyContactsMap.set(e.riskId, e.contacts);
      });

      // 🆕 收集所有 Pack 的官方来源（用于去重）
      const packSourcesMap = new Map<string, any>();
      
      // 提取风险信息（带 AI 增强）
      let riskIndex = 0;
      const risks = (baseResult.findings || []).flatMap((f) =>
        (f.risks || []).map((r) => {
          const riskId = `${f.destinationId || 'unknown'}-${f.packId || 'unknown'}-risk-${riskIndex++}`;
          const alreadyEnhanced = !!(r as any).typeLabel;
          if (alreadyEnhanced) {
            return {
              ...(r as any),
              id: (r as any).id || riskId,
              emergencyContacts: emergencyContactsMap.get(riskId) || [],
            };
          }

          const resolved = resolveRiskFieldsForApi(r as any, effectiveLang);
          const enhancedSeverity = severityMap.get(riskId) || r.severity || 'medium';
          const enhancedMitigations =
            mitigationMap.get(riskId) || resolved.mitigations.length > 0
              ? mitigationMap.get(riskId) || resolved.mitigations
              : r.mitigations || [];
          const enhancedContacts = emergencyContactsMap.get(riskId) || [];
          const riskSources = (r as any).sources || [];
          riskSources.forEach((source: any) => {
            if (source.sourceId && !packSourcesMap.has(source.sourceId)) {
              packSourcesMap.set(source.sourceId, source);
            }
          });

          return {
            id: riskId,
            type: r.type || 'unknown',
            severity: enhancedSeverity,
            originalSeverity: r.severity || 'medium',
            message: resolved.message,
            summary: resolved.summary,
            mitigation: enhancedMitigations,
            mitigations: enhancedMitigations,
            emergencyContacts: enhancedContacts,
            affectedPois: [],
            sources: riskSources.length > 0 ? riskSources : undefined,
          };
        }),
      );

      // 获取时间冲突并转换为风险
      try {
        const tripConflictsService = this.getTripConflictsService();
        if (!tripConflictsService) {
          this.logger.warn('TripConflictsService 未注入，跳过时间冲突检查');
        } else {
          const conflictsResult = await tripConflictsService.getConflicts(tripId);
          const timeConflicts = conflictsResult.conflicts.filter(
            (c) => c.type === ConflictType.TIME_CONFLICT,
          );

          // 将时间冲突转换为风险格式
          const conflictRisks = timeConflicts.map((conflict) => ({
            id: `conflict-${conflict.id}`,
            type: 'logistics_remote' as const,
            severity: conflict.severity.toLowerCase() as 'high' | 'medium' | 'low',
            originalSeverity: conflict.severity.toLowerCase() as 'high' | 'medium' | 'low',
            message: conflict.description,
            summary: conflict.description, // 添加summary字段
            mitigation: conflict.suggestions?.map((s) => s.description) || [],
            emergencyContacts: [],
        affectedPois: [],
        sources: {},
          }));

          // 将时间冲突风险添加到风险列表中
          risks.push(...conflictRisks);
        }
      } catch (conflictError) {
        // 如果获取冲突失败，记录日志但不影响主流程
        this.logger.warn(
          `Failed to get time conflicts for trip ${tripId}: ${(conflictError as Error).message}`,
        );
      }

      // P1: 包含能力包风险（如果请求）
      if (includeCapabilityPackHazards === 'true') {
        try {
          const capabilityPackItems = await this.capabilityPackChecklistService.getCapabilityPackItems(tripId);
          
          // 获取唯一的能力包类型
          const packTypes = [...new Set((capabilityPackItems || []).map(item => item.sourcePackType).filter(Boolean))];
          
          // 从能力包定义中获取 hazards
          const allPacks = [
            highAltitudePack,
            sparseSupplyPack,
            seasonalRoadPack,
            permitCheckpointPack,
            emergencyPack,
          ];

          for (const packType of packTypes) {
            const pack = allPacks.find(p => p.type === packType);
            if (pack?.hazards) {
              const packHazards = pack.hazards.map((h, idx) => ({
                id: `capability-pack-${packType}-hazard-${idx}`,
                type: h.type as any,
                severity: h.severity as 'high' | 'medium' | 'low',
                originalSeverity: h.severity as 'high' | 'medium' | 'low',
                message: getLocalizedText(h.summary as any, effectiveLang),
                summary: getLocalizedText(h.summary as any, effectiveLang),
                mitigation: (h.mitigations || []).map((m: any) => getLocalizedText(m, effectiveLang)),
                emergencyContacts: [] as any[],
                // P1 新增：标记来源
                sourceType: 'capability_pack' as const,
                sourcePackType: packType,
              }));
              risks.push(...(packHazards as any[]));
            }
          }
        } catch (capabilityError) {
          this.logger.warn(
            `Failed to get capability pack hazards for trip ${tripId}: ${(capabilityError as Error).message}`,
          );
        }
      }

      // 能力包/冲突等未走路程 enrich 的项，再做一次增强
      const enhancedRisks = risks.map((r) => {
        if ((r as any).typeLabel) {
          return r;
        }
        const riskAny = r as any;
        let affectedPois = riskAny.affectedPois || [];
        if (!affectedPois.length && r.type) {
          const poiIds = inferPlaceIdsForHazardType(String(r.type), tripPlaceRefs);
          affectedPois = poiIds.map((poiIdNum) => {
            const poiInfo = poiMap.get(poiIdNum);
            if (poiInfo) {
              return {
                id: poiIdNum.toString(),
                name: poiInfo.name,
                nameCN: poiInfo.nameCN,
                day: poiInfo.day,
              };
            }
            return { id: String(poiIdNum), name: `POI ${poiIdNum}`, day: undefined };
          });
        }
        const baseRisk: any = {
          ...r,
          sourceType: riskAny.sourceType || 'readiness',
          severity: (riskAny.severity || r.severity) as 'high' | 'medium' | 'low',
          affectedPois: affectedPois.map((poi: any) => {
            if (poi && typeof poi === 'object' && poi.name) return poi;
            const poiIdNum = typeof poi === 'string' ? parseInt(poi, 10) : poi;
            const poiInfo = poiMap.get(poiIdNum);
            if (poiInfo) {
              return {
                id: poiIdNum.toString(),
                name: poiInfo.name,
                nameCN: poiInfo.nameCN,
                day: poiInfo.day,
              };
            }
            return { id: String(poiIdNum), name: `POI ${poiIdNum}`, day: undefined };
          }),
        };
        return this.riskTypeMapperService.enhanceRisk(baseRisk, effectiveLang);
      });

      // Open-Meteo 逐日预报：替换 Pack 占位天气风险
      const forecastBundle = await this.tripReadinessWeatherForecastService.buildForecastRisksForTrip(
        trip,
        effectiveLang,
      );
      const forecastEnhanced = forecastBundle.risks.map((r) =>
        this.riskTypeMapperService.enhanceRisk(
          {
            ...r,
            mitigation: r.mitigations,
            affectedPois: [],
          } as Parameters<RiskTypeMapperService['enhanceRisk']>[0],
          effectiveLang,
        ),
      );
      const mergedRisks = this.tripReadinessWeatherForecastService.mergeForecastIntoRisks(
        enhancedRisks,
        forecastEnhanced,
      );

      const { risks: phaseFilteredRisks, phaseInfo } = filterRisksForTripPhase(
        mergedRisks,
        trip.startDate,
      );
      const effectiveLangForHint = effectiveLang === 'zh' ? 'zh' : 'en';

      // 🆕 按分类分组风险
      const risksByCategory = this.riskTypeMapperService.groupRisksByCategory(phaseFilteredRisks);

      // 🆕 提取 Pack 级别的官方来源（所有风险共享）
      const packSources = Array.from(packSourcesMap.values());

      return successResponse({
        tripId,
        risks: phaseFilteredRisks,
        risksByCategory, // 🆕 按分类分组
        packSources, // 🆕 Pack 级别的官方来源
        weatherForecast: forecastBundle.summary,
        readinessPhase: phaseInfo.phase,
        daysUntilStart: phaseInfo.daysUntilStart,
        deferredLiveRiskCount: phaseInfo.deferredLiveRiskCount,
        phaseHint: phaseInfo.phaseHint[effectiveLangForHint] || phaseInfo.phaseHint.zh,
        summary: {
          totalRisks: phaseFilteredRisks.length,
          highSeverity: phaseFilteredRisks.filter((r: { severity?: string }) => r.severity === 'high').length,
          mediumSeverity: phaseFilteredRisks.filter((r: { severity?: string }) => r.severity === 'medium').length,
          lowSeverity: phaseFilteredRisks.filter((r: { severity?: string }) => r.severity === 'low').length,
          byCategory: { // 🆕 按分类统计
            weather: risksByCategory.weather?.length || 0,
            terrain: risksByCategory.terrain?.length || 0,
            safety: risksByCategory.safety?.length || 0,
            logistics: risksByCategory.logistics?.length || 0,
            other: risksByCategory.other?.length || 0,
          },
        },
        aiEnhanced: aiEnabled && Object.keys(riskEnhancements).length > 0,
      });
    } catch (error) {
      const err = error as Error;
      this.logger.error(`Failed to get risk warnings: ${err.message}`, err.stack);
      return errorResponse(ErrorCode.INTERNAL_ERROR, err.message);
    }
  }

  // ==================== 覆盖地图接口 ====================

  @Public()
  @Get('trip/:tripId/coverage-map')
  @ApiOperation({
    summary: '获取行程覆盖地图数据',
    description: '获取行程的地图覆盖数据，用于前端渲染覆盖地图。包含 POI 覆盖状态、路段信息、覆盖缺口等。',
  })
  @ApiParam({ name: 'tripId', description: '行程 ID (UUID)', example: 'ed69d9c5-660f-4549-bf03-85654e972403' })
  @ApiResponse({
    status: 200,
    description: '成功返回覆盖地图数据',
    schema: {
      type: 'object',
      properties: {
        success: { type: 'boolean', example: true },
        data: {
          type: 'object',
          properties: {
            tripId: { type: 'string' },
            bounds: {
              type: 'object',
              properties: {
                northeast: { type: 'object', properties: { lat: { type: 'number' }, lng: { type: 'number' } } },
                southwest: { type: 'object', properties: { lat: { type: 'number' }, lng: { type: 'number' } } },
              },
            },
            center: { type: 'object', properties: { lat: { type: 'number' }, lng: { type: 'number' } } },
            zoom: { type: 'number' },
            pois: { type: 'array', items: { type: 'object' } },
            segments: { type: 'array', items: { type: 'object' } },
            gaps: { type: 'array', items: { type: 'object' } },
            summary: {
              type: 'object',
              properties: {
                totalPois: { type: 'number' },
                coveredPois: { type: 'number' },
                partialPois: { type: 'number' },
                uncoveredPois: { type: 'number' },
                totalSegments: { type: 'number' },
                coveredSegments: { type: 'number' },
                warningSegments: { type: 'number' },
                blockedSegments: { type: 'number' },
                totalGaps: { type: 'number' },
                coverageRate: { type: 'number' },
              },
            },
          },
        },
      },
    },
  })
  @ApiResponse({
    status: 404,
    description: '行程不存在',
    type: ApiErrorResponseDto,
  })
  async getCoverageMap(@Param('tripId') tripId: string): Promise<any> {
    try {
      const result = await this.coverageMapService.getCoverageMap(tripId);
      return successResponse(result);
    } catch (error) {
      const err = error as Error;
      if (err instanceof NotFoundException) {
        this.logger.error(`Trip not found for coverage map: ${tripId}`);
        return errorResponse(ErrorCode.NOT_FOUND, err.message);
      }
      this.logger.error(`Failed to get coverage map: ${err.message}`, err.stack);
      return errorResponse(ErrorCode.INTERNAL_ERROR, err.message);
    }
  }

  @Public()
  @Get('trip/:tripId/score')
  @ApiOperation({
    summary: '获取行程准备度分数',
    description:
      '【C 端已弃用】请改用 GET /api/trips/:tripId/feasibility-report。B 端/Agent 仍可使用本接口。',
    deprecated: true,
  })
  @ApiParam({ name: 'tripId', description: '行程 ID (UUID)', example: 'ed69d9c5-660f-4549-bf03-85654e972403' })
  @ApiResponse({
    status: 200,
    description: '成功返回准备度分数',
    schema: {
      type: 'object',
      properties: {
        success: { type: 'boolean', example: true },
        data: {
          type: 'object',
          properties: {
            tripId: { type: 'string' },
            score: {
              type: 'object',
              properties: {
                overall: { type: 'number', example: 78 },
                evidenceCoverage: { type: 'number', example: 45 },
                scheduleFeasibility: { type: 'number', example: 85 },
                transportCertainty: { type: 'number', example: 70 },
                safetyRisk: { type: 'number', example: 90 },
                buffers: { type: 'number', example: 65 },
              },
            },
            findings: { type: 'array', items: { type: 'object' } },
            risks: { type: 'array', items: { type: 'object' } },
            summary: {
              type: 'object',
              properties: {
                totalFindings: { type: 'number' },
                blockers: { type: 'number' },
                must: { type: 'number', description: '🆕 统一字段命名：必须项数量（对应 must）' },
                should: { type: 'number', description: '🆕 统一字段命名：建议项数量（对应 should）' },
                warnings: { type: 'number', description: '@deprecated 使用 must 替代，向后兼容保留' },
                suggestions: { type: 'number', description: '@deprecated 使用 should 替代，向后兼容保留' },
                highRisks: { type: 'number' },
                mediumRisks: { type: 'number' },
                lowRisks: { type: 'number' },
              },
            },
            calculatedAt: { type: 'string' },
            causalPreAnalysis: {
              type: 'object',
              description: '级联影响预分析（NonTransactionalReplanResult）',
            },
            cascadeUiHints: {
              type: 'array',
              description: '级联影响 UI 卡片（含 netImpactMinutes / cascadeConfidence 等）',
              items: { $ref: getSchemaPath(CascadeUiHintDto) },
            },
          },
        },
      },
    },
  })
  @ApiResponse({
    status: 404,
    description: '行程不存在',
    type: ApiErrorResponseDto,
  })
  async getReadinessScore(@Param('tripId') tripId: string): Promise<any> {
    try {
      const result = await this.coverageMapService.getReadinessScore(tripId);
      return successResponse(result);
    } catch (error) {
      const err = error as Error;
      if (err instanceof NotFoundException) {
        this.logger.error(`Trip not found for readiness score: ${tripId}`);
        return errorResponse(ErrorCode.NOT_FOUND, err.message);
      }
      this.logger.error(`Failed to get readiness score: ${err.message}`, err.stack);
      return errorResponse(ErrorCode.INTERNAL_ERROR, err.message);
    }
  }

  @Public()
  @Post('trip/:tripId/dependency-impact/analyze')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({
    summary: '分析事实变化的级联影响（非交易型重规划）',
    description:
      '基于 EvidenceEnvelope（FLIGHT_STATUS / ROAD / WEATHER 等）与行程依赖链输出影响节点与调整建议；不执行预订/改签。',
  })
  @ApiParam({ name: 'tripId', description: '行程 ID (UUID)' })
  @ApiBody({
    schema: {
      type: 'object',
      properties: {
        trigger: { type: 'object', description: 'EvidenceEnvelope（推荐）' },
        flightEvidence: { type: 'object', description: 'EvidenceEnvelope<FlightStatusValue>（兼容旧字段）' },
        locale: { type: 'string', enum: ['zh', 'en'] },
      },
    },
  })
  async analyzeDependencyImpact(
    @Param('tripId') tripId: string,
    @Body()
    body: {
      trigger?: Record<string, unknown>;
      flightEvidence?: Record<string, unknown>;
      locale?: 'zh' | 'en';
    },
  ): Promise<any> {
    try {
      const result = await this.tripDependencyImpactService.analyzeForTrip(tripId, {
        trigger: body.trigger as any,
        flightEvidence: body.flightEvidence as any,
        locale: body.locale,
      });
      return successResponse(result);
    } catch (error) {
      const err = error as Error;
      if (err instanceof NotFoundException) {
        return errorResponse(ErrorCode.NOT_FOUND, err.message);
      }
      this.logger.error(`Failed to analyze dependency impact: ${err.message}`, err.stack);
      return errorResponse(ErrorCode.INTERNAL_ERROR, err.message);
    }
  }

  @Public()
  @Post('repair-options')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({
    summary: '获取阻塞项修复选项',
    description:
      '【C 端已弃用】请改用 GET /api/trips/:tripId/feasibility-report/issues/:issueId/repair-options。Agent/B 端仍可使用 blockerId 调用本接口。',
    deprecated: true,
  })
  @ApiBody({
    schema: {
      type: 'object',
      required: ['tripId', 'blockerId'],
      properties: {
        tripId: { type: 'string', description: '行程 ID', example: 'ed69d9c5-660f-4549-bf03-85654e972403' },
        blockerId: { type: 'string', description: '阻塞项 ID', example: 'finding-1' },
      },
    },
  })
  @ApiResponse({
    status: 200,
    description: '成功返回修复选项',
    schema: {
      type: 'object',
      properties: {
        success: { type: 'boolean', example: true },
        data: {
          type: 'object',
          properties: {
            blockerId: { type: 'string', example: 'finding-1' },
            blockerMessage: { type: 'string', example: '斯卡夫塔山国家公园缺少证据覆盖' },
            options: {
              type: 'array',
              items: {
                type: 'object',
                properties: {
                  id: { type: 'string', example: 'option-1' },
                  title: { type: 'string', example: '查询天气预报' },
                  description: { type: 'string', example: '获取该地点的天气信息' },
                  cost: { type: 'number', example: 0 },
                  impact: { type: 'string', enum: ['high', 'medium', 'low'], example: 'medium' },
                  timeEstimate: { type: 'string', example: '2分钟' },
                },
              },
            },
            dependencyImpact: {
              type: 'object',
              description: '级联影响分析（与 causalPreAnalysis 同形）',
            },
            causalPreAnalysis: {
              type: 'object',
              description: '级联影响预分析（NonTransactionalReplanResult）',
            },
            cascadeUiHints: {
              type: 'array',
              description: '级联影响 UI 卡片',
              items: { $ref: getSchemaPath(CascadeUiHintDto) },
            },
          },
        },
      },
    },
  })
  @ApiResponse({
    status: 404,
    description: '行程不存在',
    type: ApiErrorResponseDto,
  })
  async getRepairOptions(@Body() body: { tripId: string; blockerId: string }): Promise<any> {
    try {
      const { tripId, blockerId } = body;
      const feasibility = this.getFeasibilityReportService();
      if (feasibility && isPlanFeasibilityBlockerId(blockerId)) {
        const issueId = resolveRepairTargetIssueId(blockerId);
        try {
          const result = await feasibility.getRepairOptions(tripId, issueId);
          return successResponse(result);
        } catch (error) {
          const err = error as Error;
          if (!(err instanceof NotFoundException)) {
            throw err;
          }
        }
      }
      const result = await this.coverageMapService.getRepairOptions(tripId, blockerId);
      return successResponse(result);
    } catch (error) {
      const err = error as Error;
      if (err instanceof NotFoundException) {
        this.logger.error(`Trip not found for repair options: ${body.tripId}`);
        return errorResponse(ErrorCode.NOT_FOUND, err.message);
      }
      this.logger.error(`Failed to get repair options: ${err.message}`, err.stack);
      return errorResponse(ErrorCode.INTERNAL_ERROR, err.message);
    }
  }

  @Public()
  @Post('auto-repair')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({
    summary: '自动修复准备度阻塞项',
    description:
      '批量处理阻塞项：先刷新证据（冰岛行程拉取天气/路况），再按修复选项自动执行。单 blockerId 时走 ReadinessRepairService（legacy C 端路径，已弃用）。',
    deprecated: false,
  })
  @ApiBody({
    schema: {
      type: 'object',
      required: ['tripId'],
      properties: {
        tripId: { type: 'string' },
        blockerIds: { type: 'array', items: { type: 'string' } },
        maxActions: { type: 'number', example: 5 },
        blockerId: { type: 'string', description: 'legacy 单阻塞项修复（C 端已弃用）' },
        executeDecision: { type: 'boolean' },
        persistDecision: { type: 'boolean' },
      },
    },
  })
  async autoRepair(
    @Body()
    body: {
      tripId: string;
      blockerIds?: string[];
      maxActions?: number;
      blockerId?: string;
      executeDecision?: boolean;
      persistDecision?: boolean;
    },
  ): Promise<any> {
    try {
      if (body.blockerId && !body.blockerIds?.length) {
        if (isPlanFeasibilityBlockerId(body.blockerId)) {
          throw new BadRequestException(
            '单阻塞项 auto-repair 已弃用：方案类请使用 POST /api/trips/:tripId/feasibility-report/issues/:issueId/apply-repair',
          );
        }
        const result = await this.readinessRepairService.autoRepair({
          tripId: body.tripId,
          blockerId: body.blockerId,
          executeDecision: body.executeDecision,
          persistDecision: body.persistDecision,
        });
        return successResponse(result);
      }
      const result = await this.readinessAutoRepairService.autoRepair(body.tripId, {
        blockerIds: body.blockerIds,
        maxActions: body.maxActions,
      });
      return successResponse(result);
    } catch (error) {
      const err = error as Error;
      if (err instanceof NotFoundException) {
        return errorResponse(ErrorCode.NOT_FOUND, err.message);
      }
      if (err instanceof BadRequestException) {
        return errorResponse(ErrorCode.VALIDATION_ERROR, err.message);
      }
      this.logger.error(`Failed to auto-repair: ${err.message}`, err.stack);
      return errorResponse(ErrorCode.INTERNAL_ERROR, err.message);
    }
  }

  @Public()
  @Post('apply-repair')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({
    summary: '应用阻塞项修复',
    description:
      '【C 端已弃用】方案类修复请改用 POST /api/trips/:tripId/feasibility-report/issues/:issueId/apply-repair。本接口仅保留出发准备域（勾选/标记/刷新）。',
    deprecated: true,
  })
  @ApiBody({
    schema: {
      type: 'object',
      required: ['tripId', 'blockerId', 'optionId'],
      properties: {
        tripId: { type: 'string' },
        blockerId: { type: 'string' },
        optionId: { type: 'string' },
        reason: { type: 'string' },
        executeDecision: {
          type: 'boolean',
          description: '计划类修复是否直接调用 /api/decision-engine/v1/repair-plan',
        },
        persistDecision: {
          type: 'boolean',
          description: 'executeDecision=true 时是否写回 ItineraryItem，默认 true',
        },
        runGuardianNegotiation: {
          type: 'boolean',
          description: '是否运行三人格 pre/post 博弈，默认 true',
        },
        forceDecisionRepair: {
          type: 'boolean',
          description: '跳过 pre_repair 低共识 REJECT 门控',
        },
      },
    },
  })
  async applyRepair(
    @Body()
    body: {
      tripId: string;
      blockerId: string;
      optionId: string;
      reason?: string;
      executeDecision?: boolean;
      persistDecision?: boolean;
      runGuardianNegotiation?: boolean;
      forceDecisionRepair?: boolean;
    },
    @CurrentUser() user?: CurrentUserPayload,
  ): Promise<any> {
    try {
      const feasibility = this.getFeasibilityReportService();
      if (feasibility && isPlanFeasibilityBlockerId(body.blockerId)) {
        const issueId = resolveRepairTargetIssueId(body.blockerId);
        const report = await feasibility.getReport(body.tripId);
        const issue = report.issues.find(
          (i) => i.id === issueId || i.prerequisiteId === body.blockerId,
        );
        if (issue) {
          const dispatched = await dispatchManualRepairFromModule(this.moduleRef, {
            tripId: body.tripId,
            userId: user?.userId,
            entryPointId: 'user.readiness-apply-repair.proxy-feasibility',
            issueId: issue.id,
            metadata: {
              repairOptionId: body.optionId,
              intent: 'manual_repair',
              executeDecision: body.executeDecision,
            },
          });
          const decisionRunId = resolveDecisionRunId(dispatched);
          const result = await feasibility.applyRepair(
            body.tripId,
            issue.id,
            {
              optionId: body.optionId,
              reason: body.reason,
              executeDecision: body.executeDecision,
              persistDecision: body.persistDecision,
              runGuardianNegotiation: body.runGuardianNegotiation,
              forceDecisionRepair: body.forceDecisionRepair,
            },
            user?.userId,
          );
          return successResponse({
            ...result,
            ...(decisionRunId ? { decisionRunId } : {}),
            repairAuthority: 'feasibility',
            proxiedFrom: 'readiness.apply-repair',
          });
        }
      }

      const dispatched = await dispatchManualRepairFromModule(this.moduleRef, {
        tripId: body.tripId,
        userId: user?.userId,
        entryPointId: 'user.readiness-apply-repair',
        issueId: body.blockerId,
        metadata: {
          repairOptionId: body.optionId,
          intent: 'manual_repair',
          executeDecision: body.executeDecision,
        },
      });
      const decisionRunId = resolveDecisionRunId(dispatched);
      const result = await this.readinessRepairService.applyRepair({
        ...body,
        repairAuthority: 'readiness_prep',
      });
      return successResponse({
        ...result,
        ...(decisionRunId ? { decisionRunId } : {}),
      });
    } catch (error) {
      const writeChain = mapWriteChainBlockedToErrorResponse(error);
      if (writeChain) return writeChain;
      const err = error as Error;
      if (err instanceof NotFoundException) {
        return errorResponse(ErrorCode.NOT_FOUND, err.message);
      }
      if (err instanceof BadRequestException) {
        return errorResponse(ErrorCode.VALIDATION_ERROR, err.message);
      }
      this.logger.error(`Failed to apply repair: ${err.message}`, err.stack);
      return errorResponse(ErrorCode.INTERNAL_ERROR, err.message);
    }
  }

  @Public()
  @Get('trip/:tripId/cascade-impact')
  @ApiOperation({
    summary: '获取级联影响预分析快照',
    description: '读取 trip.metadata.readinessCausalPreAnalysis（repair-options / apply-repair / score 刷新后写入）',
  })
  @ApiParam({ name: 'tripId', description: '行程 ID (UUID)' })
  @ApiResponse({
    status: 200,
    description: '成功返回级联影响快照与 UI 卡片',
    schema: {
      type: 'object',
      properties: {
        success: { type: 'boolean', example: true },
        data: {
          type: 'object',
          properties: {
            tripId: { type: 'string' },
            causalPreAnalysis: { type: 'object', description: 'NonTransactionalReplanResult' },
            cascadeUiHints: {
              type: 'array',
              items: { $ref: getSchemaPath(CascadeUiHintDto) },
            },
            updatedAt: { type: 'string', format: 'date-time' },
          },
        },
      },
    },
  })
  async getCascadeImpact(@Param('tripId') tripId: string): Promise<any> {
    try {
      const snapshot = await this.causalPreanalysisService.loadSnapshot(tripId);
      const causalPreAnalysis = snapshot?.latest;
      return successResponse({
        tripId,
        causalPreAnalysis,
        cascadeUiHints: buildReadinessCascadeUiHints(causalPreAnalysis),
        updatedAt: snapshot?.updatedAt,
      });
    } catch (error) {
      const err = error as Error;
      this.logger.error(`Failed to get cascade impact: ${err.message}`, err.stack);
      return errorResponse(ErrorCode.INTERNAL_ERROR, err.message);
    }
  }

  @Public()
  @Get('trip/:tripId/guardian-negotiation')
  @ApiOperation({
    summary: '获取三人格博弈快照',
    description: '读取 trip.metadata.readinessGuardianNegotiation（apply-repair / 决策修复后写入）',
  })
  @ApiResponse({ status: 200, description: '返回 pre/post 协商快照；无记录时 snapshot 为 null' })
  async getGuardianNegotiation(@Param('tripId') tripId: string): Promise<any> {
    try {
      const snapshot = await this.readinessRepairService.getGuardianNegotiation(tripId);
      return successResponse({ tripId, snapshot });
    } catch (error) {
      const err = error as Error;
      if (err instanceof NotFoundException) {
        return errorResponse(ErrorCode.NOT_FOUND, err.message);
      }
      this.logger.error(`Failed to get guardian negotiation: ${err.message}`, err.stack);
      return errorResponse(ErrorCode.INTERNAL_ERROR, err.message);
    }
  }

  @Public()
  @Post('refresh-evidence')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({
    summary: '刷新准备度证据',
    description:
      '为冰岛行程批量拉取区域天气/路况并写入 POI metadata。【C 端已弃用】请改用 POST /api/trips/:tripId/feasibility-report/validate。Agent 仍可使用。',
    deprecated: true,
  })
  @ApiBody({
    schema: {
      type: 'object',
      required: ['tripId'],
      properties: {
        tripId: { type: 'string' },
      },
    },
  })
  async refreshEvidence(@Body() body: { tripId: string }): Promise<any> {
    try {
      const result = await this.readinessRepairService.refreshEvidence(body.tripId);
      return successResponse(result);
    } catch (error) {
      const err = error as Error;
      if (err instanceof NotFoundException) {
        return errorResponse(ErrorCode.NOT_FOUND, err.message);
      }
      this.logger.error(`Failed to refresh evidence: ${err.message}`, err.stack);
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
  @ApiQuery({ name: 'userId', description: '用户 ID（可选，用于个性化）', required: false })
  @ApiResponse({
    status: 200,
    description: '成功生成打包清单',
    type: ApiSuccessResponseDto,
  })
  async generatePackingList(
    @Param('tripId') tripId: string,
    @Body() dto: GeneratePackingListDto,
    @Query('userId') userId?: string,
    @CurrentUser() currentUser?: CurrentUserPayload,
  ): Promise<any> {
    try {
      // 获取用户 ID（优先使用 currentUser，其次使用 query 参数）
      const effectiveUserId = currentUser?.userId || userId;

      // 生成基础打包清单
      const baseResult = await this.packingListService.generatePackingList(tripId, dto);

      // 获取行程信息
      const trip = await this.prisma.trip.findUnique({
        where: { id: tripId },
      });

      if (!trip) {
        throw new NotFoundException(`行程 ID ${tripId} 不存在`);
      }

      // 计算行程天数
      const startDate = new Date(trip.startDate);
      const endDate = new Date(trip.endDate);
      const durationDays = Math.ceil((endDate.getTime() - startDate.getTime()) / (1000 * 60 * 60 * 24)) + 1;

      // 获取用户画像（如果提供了 userId）
      let userProfileData = null;
      if (effectiveUserId) {
        userProfileData = await this.prisma.userProfile.findUnique({
          where: { userId: effectiveUserId },
        });
      }

      const tripWorldState = await this.prepareTripWorldStateForAi({
        tripId,
        destination: trip.destination || '',
        startDate: trip.startDate.toISOString().split('T')[0],
        durationDays,
      });
      const tripContext = this.readinessService.extractTripContext(tripWorldState);

      // 构建用户画像
      const userProfile = effectiveUserId
        ? await this.extractUserProfile(effectiveUserId, userProfileData)
        : undefined;

      // 检查是否启用 AI 增强
      const aiEnabled =
        effectiveUserId &&
        (await this.featureFlagsService.isAIEnhancementEnabled(
          effectiveUserId,
          'readiness_ai_enhancement',
        ));

      // AI 增强（如果启用）
      let enhancedItems = baseResult.items;
      if (aiEnabled && userProfile && baseResult.items.length > 0) {
        try {
          const enhancements = await this.readinessAIService.enhancePackingList(
            baseResult.items.map((item) => ({
              id: item.id,
              name: item.name,
              category: item.category,
              quantity: item.quantity,
              priority: item.priority,
            })),
            userProfile,
            tripContext,
            durationDays,
            { enableAI: true },
          );

          // 应用增强结果
          if (enhancements.itemEnhancements) {
            const enhancementMap = new Map<string, any>();
            enhancements.itemEnhancements.forEach((enh) => {
              enhancementMap.set(enh.itemId, enh);
            });

            // 更新现有物品
            enhancedItems = baseResult.items.map((item) => {
              const enh = enhancementMap.get(item.id);
              if (enh) {
                return {
                  ...item,
                  quantity: enh.recommendedQuantity ?? item.quantity,
                  reason: enh.reason ?? item.reason,
                };
              }
              return item;
            });

            // 添加新推荐的物品
            enhancements.itemEnhancements.forEach((enh) => {
              if (enh.itemId.startsWith('recommended-')) {
                enhancedItems.push({
                  id: enh.itemId,
                  name: (enh as any).name || '推荐物品',
                  category: (enh as any).category || 'other',
                  quantity: enh.recommendedQuantity || 1,
                  unit: '件',
                  priority: 'optional' as const,
                  reason: enh.reason,
                  checked: false,
                });
              }
            });
          }
        } catch (error) {
          this.logger.warn('Packing list AI enhancement failed, using base result', error);
          // 降级到基础结果
        }
      }

      return successResponse({
        ...baseResult,
        items: enhancedItems,
        aiEnhanced: aiEnabled && enhancedItems !== baseResult.items,
      });
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

  // ==================== 打包清单辅助接口 ====================

  @Public()
  @Get('packing-order-steps')
  @ApiOperation({
    summary: '获取打包顺序步骤',
    description: '获取推荐的打包顺序步骤，帮助用户有序打包',
  })
  @ApiResponse({
    status: 200,
    description: '成功返回打包顺序步骤',
    type: ApiSuccessResponseDto,
  })
  async getPackingOrderSteps(): Promise<any> {
    try {
      const steps = this.packingTemplateService.getPackingOrderSteps();
      return successResponse(steps);
    } catch (error) {
      const err = error as Error;
      this.logger.error(`Failed to get packing order steps: ${err.message}`, err.stack);
      return errorResponse(ErrorCode.INTERNAL_ERROR, err.message);
    }
  }

  @Public()
  @Get('pre-departure-checklist')
  @ApiOperation({
    summary: '获取出发前检查清单',
    description: '获取出发前24小时的最终检查清单',
  })
  @ApiResponse({
    status: 200,
    description: '成功返回出发前检查清单',
    type: ApiSuccessResponseDto,
  })
  async getPreDepartureChecklist(): Promise<any> {
    try {
      const checklist = this.packingTemplateService.getPreDepartureChecklist();
      return successResponse(checklist);
    } catch (error) {
      const err = error as Error;
      this.logger.error(`Failed to get pre-departure checklist: ${err.message}`, err.stack);
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

  // ==================== Pack管理接口 ====================

  @Public()
  @Get('admin/packs')
  @ApiOperation({
    summary: '获取准备度Pack列表（管理接口）',
    description: '获取准备度Pack列表，支持分页、筛选、搜索。需要管理员权限。',
  })
  @ApiQuery({ name: 'page', required: false, type: Number, description: '页码', example: 1 })
  @ApiQuery({ name: 'limit', required: false, type: Number, description: '每页数量', example: 20 })
  @ApiQuery({ name: 'countryCode', required: false, type: String, description: '国家代码筛选' })
  @ApiQuery({ name: 'destinationId', required: false, type: String, description: '目的地ID筛选' })
  @ApiQuery({ name: 'isActive', required: false, type: Boolean, description: '是否激活' })
  @ApiQuery({ name: 'search', required: false, type: String, description: '搜索关键词' })
  @ApiResponse({
    status: 200,
    description: '成功返回Pack列表',
    type: ApiSuccessResponseDto,
  })
  async getReadinessPacks(@Query() query: GetReadinessPacksQueryDto): Promise<any> {
    try {
      const page = query.page || 1;
      const limit = query.limit || 20;
      const skip = (page - 1) * limit;

      const where: any = {};

      if (query.countryCode) {
        where.countryCode = query.countryCode;
      }

      if (query.destinationId) {
        where.destinationId = query.destinationId;
      }

      if (query.isActive !== undefined) {
        where.isActive = query.isActive;
      }

      if (query.search) {
        where.OR = [
          { packId: { contains: query.search, mode: 'insensitive' } },
          { displayName: { contains: query.search, mode: 'insensitive' } },
          { displayNameEN: { contains: query.search, mode: 'insensitive' } },
          { displayNameCN: { contains: query.search, mode: 'insensitive' } },
          { regionCN: { contains: query.search, mode: 'insensitive' } },
          { cityCN: { contains: query.search, mode: 'insensitive' } },
        ];
      }

      const [packs, total] = await Promise.all([
        this.prisma.readinessPack.findMany({
          where,
          skip,
          take: limit,
          orderBy: { updatedAt: 'desc' },
          select: {
            id: true,
            packId: true,
            destinationId: true,
            displayName: true,
            displayNameEN: true,
            displayNameCN: true,
            version: true,
            lastReviewedAt: true,
            countryCode: true,
            region: true,
            regionEN: true,
            regionCN: true,
            city: true,
            cityEN: true,
            cityCN: true,
            isActive: true,
            createdAt: true,
            updatedAt: true,
          },
        }),
        this.prisma.readinessPack.count({ where }),
      ]);

      const result: ReadinessPackListResponseDto = {
        packs: packs as any,
        total,
        page,
        limit,
        totalPages: Math.ceil(total / limit),
      };

      return successResponse(result);
    } catch (error) {
      const err = error as Error;
      this.logger.error(`Failed to get readiness packs: ${err.message}`, err.stack);
      return errorResponse(ErrorCode.INTERNAL_ERROR, err.message);
    }
  }

  @Public()
  @Get('admin/packs/:id')
  @ApiOperation({
    summary: '获取准备度Pack详情（管理接口）',
    description: '根据Pack ID获取完整的Pack数据，包含打包模板和指南。需要管理员权限。',
  })
  @ApiParam({ name: 'id', description: 'Pack ID（packId）', type: String })
  @ApiQuery({ name: 'includePacking', required: false, type: Boolean, description: '是否包含打包模板和指南，默认 true' })
  @ApiResponse({
    status: 200,
    description: '成功返回Pack详情',
    type: ApiSuccessResponseDto,
  })
  @ApiResponse({
    status: 404,
    description: 'Pack不存在',
    type: ApiErrorResponseDto,
  })
  async getReadinessPackById(
    @ParamDecorator('id') packId: string,
    @Query('includePacking') includePacking?: string,
  ): Promise<any> {
    try {
      // 默认包含打包数据，除非明确指定不包含
      const shouldIncludePacking = includePacking !== 'false';
      const pack = await this.packStorageService.loadPack(packId, shouldIncludePacking);
      if (!pack) {
        throw new NotFoundException(`Readiness pack not found: ${packId}`);
      }

      // 获取数据库记录以获取元数据
      const record = await this.prisma.readinessPack.findUnique({
        where: { packId },
      });

      // 🆕 序列化 Pack 用于管理界面显示（提供友好的格式）
      const serializedPack = serializePackForAdmin(pack, 'zh');

      return successResponse({
        ...serializedPack,
        id: record?.id,
        isActive: record?.isActive,
        createdAt: record?.createdAt,
        updatedAt: record?.updatedAt,
        // 🆕 同时提供原始数据供编辑使用
        _raw: pack, // 原始 Pack 对象（包含完整的 LocalizedString）
      });
    } catch (error) {
      const err = error as Error;
      if (err instanceof NotFoundException) {
        return errorResponse(ErrorCode.NOT_FOUND, err.message);
      }
      this.logger.error(`Failed to get readiness pack: ${err.message}`, err.stack);
      return errorResponse(ErrorCode.INTERNAL_ERROR, err.message);
    }
  }

  @Public()
  @Post('admin/packs')
  @ApiOperation({
    summary: '创建准备度Pack（管理接口）',
    description: '创建新的准备度Pack。需要管理员权限。',
  })
  @ApiBody({ type: CreateReadinessPackDto })
  @ApiResponse({
    status: 201,
    description: '成功创建Pack',
    type: ApiSuccessResponseDto,
  })
  @ApiResponse({
    status: 400,
    description: '输入数据验证失败',
    type: ApiErrorResponseDto,
  })
  async createReadinessPack(@Body() dto: CreateReadinessPackDto): Promise<any> {
    try {
      // 🆕 反序列化前端传来的数据（处理 messageRaw、titleRaw 等字段）
      const deserializedPack = deserializePackFromAdmin(dto.pack);
      
      const saveSuccess = await this.packStorageService.savePack(deserializedPack);
      if (!saveSuccess) {
        return errorResponse(ErrorCode.INTERNAL_ERROR, 'Failed to save pack');
      }

      const pack = await this.packStorageService.loadPack(deserializedPack.packId);
      if (!pack) {
        return errorResponse(ErrorCode.INTERNAL_ERROR, 'Failed to load pack after creation');
      }
      
      // 🆕 返回序列化后的数据（包含友好的显示格式）
      const serializedPack = serializePackForAdmin(pack, 'zh');
      const record = await this.prisma.readinessPack.findUnique({
        where: { packId: pack.packId },
      });

      return successResponse({
        ...serializedPack,
        id: record?.id,
        isActive: record?.isActive,
        createdAt: record?.createdAt,
        updatedAt: record?.updatedAt,
        _raw: pack, // 原始 Pack 对象
      });
    } catch (error) {
      const err = error as Error;
      this.logger.error(`Failed to create readiness pack: ${err.message}`, err.stack);
      return errorResponse(ErrorCode.INTERNAL_ERROR, err.message);
    }
  }

  @Public()
  @Put('admin/packs/:id')
  @ApiOperation({
    summary: '更新准备度Pack（管理接口）',
    description: '更新准备度Pack数据或状态。需要管理员权限。',
  })
  @ApiParam({ name: 'id', description: 'Pack ID（packId）', type: String })
  @ApiBody({ type: UpdateReadinessPackDto })
  @ApiResponse({
    status: 200,
    description: '成功更新Pack',
    type: ApiSuccessResponseDto,
  })
  @ApiResponse({
    status: 404,
    description: 'Pack不存在',
    type: ApiErrorResponseDto,
  })
  async updateReadinessPack(
    @ParamDecorator('id') packId: string,
    @Body() dto: UpdateReadinessPackDto,
  ): Promise<any> {
    try {
      const existing = await this.prisma.readinessPack.findUnique({
        where: { packId },
      });

      if (!existing) {
        throw new NotFoundException(`Readiness pack not found: ${packId}`);
      }

      // 如果提供了pack数据，更新pack
      if (dto.pack) {
        // 🆕 反序列化前端传来的数据（处理 messageRaw、titleRaw 等字段）
        const deserializedPack = deserializePackFromAdmin(dto.pack);
        
        const success = await this.packStorageService.savePack(deserializedPack);
        if (!success) {
          return errorResponse(ErrorCode.INTERNAL_ERROR, 'Failed to update pack');
        }
      }

      // 如果提供了isActive，更新状态
      if (dto.isActive !== undefined) {
        await this.prisma.readinessPack.update({
          where: { packId },
          data: { isActive: dto.isActive },
        });
      }

      const pack = await this.packStorageService.loadPack(packId);
      if (!pack) {
        return errorResponse(ErrorCode.INTERNAL_ERROR, 'Failed to load pack after update');
      }
      
      // 🆕 返回序列化后的数据（包含友好的显示格式）
      const serializedPack = serializePackForAdmin(pack, 'zh');
      const record = await this.prisma.readinessPack.findUnique({
        where: { packId },
      });

      return successResponse({
        ...serializedPack,
        id: record?.id,
        isActive: record?.isActive,
        createdAt: record?.createdAt,
        updatedAt: record?.updatedAt,
        _raw: pack, // 原始 Pack 对象
      });
    } catch (error) {
      const err = error as Error;
      if (err instanceof NotFoundException) {
        return errorResponse(ErrorCode.NOT_FOUND, err.message);
      }
      this.logger.error(`Failed to update readiness pack: ${err.message}`, err.stack);
      return errorResponse(ErrorCode.INTERNAL_ERROR, err.message);
    }
  }

  @Public()
  @Delete('admin/packs/:id')
  @ApiOperation({
    summary: '删除准备度Pack（管理接口）',
    description: '软删除准备度Pack（设置isActive=false）。需要管理员权限。',
  })
  @ApiParam({ name: 'id', description: 'Pack ID（packId）', type: String })
  @ApiResponse({
    status: 200,
    description: '成功删除Pack',
    type: ApiSuccessResponseDto,
  })
  @ApiResponse({
    status: 404,
    description: 'Pack不存在',
    type: ApiErrorResponseDto,
  })
  async deleteReadinessPack(@ParamDecorator('id') packId: string): Promise<any> {
    try {
      const existing = await this.prisma.readinessPack.findUnique({
        where: { packId },
      });

      if (!existing) {
        throw new NotFoundException(`Readiness pack not found: ${packId}`);
      }

      await this.prisma.readinessPack.update({
        where: { packId },
        data: { isActive: false },
      });

      return successResponse({ message: 'Pack deleted successfully' });
    } catch (error) {
      const err = error as Error;
      if (err instanceof NotFoundException) {
        return errorResponse(ErrorCode.NOT_FOUND, err.message);
      }
      this.logger.error(`Failed to delete readiness pack: ${err.message}`, err.stack);
      return errorResponse(ErrorCode.INTERNAL_ERROR, err.message);
    }
  }

  @Public()
  /**
   * 获取规则的用户决策问题列表（包含分组和进度信息）
   */
  @Get('trips/:tripId/decisions/:ruleId/questions')
  @ApiOperation({ summary: '获取规则的用户决策问题列表' })
  @ApiParam({ name: 'tripId', description: '行程ID' })
  @ApiParam({ name: 'ruleId', description: '规则ID' })
  @ApiResponse({
    status: 200,
    description: '成功返回问题列表',
    type: ApiSuccessResponseDto,
  })
  @ApiResponse({
    status: 404,
    description: '行程或规则不存在',
    type: ApiErrorResponseDto,
  })
  async getUserDecisionQuestions(
    @ParamDecorator('tripId') tripId: string,
    @ParamDecorator('ruleId') ruleId: string,
    @Query('answeredQuestionIds') answeredQuestionIds?: string, // 逗号分隔的已回答问题ID列表
  ): Promise<any> {
    try {
      // 1. 验证行程存在
      const trip = await this.prisma.trip.findUnique({
        where: { id: tripId },
        select: {
          id: true,
          destination: true,
        },
      });

      if (!trip) {
        throw new NotFoundException(`行程 ${tripId} 不存在`);
      }

      // 2. 加载 Pack 和规则
      const pack = await this.packStorageService.findPackByDestination(trip.destination);
      if (!pack) {
        throw new NotFoundException(`未找到目的地 ${trip.destination} 的准备度 Pack`);
      }

      const rule = pack.rules.find(r => r.id === ruleId);
      if (!rule) {
        throw new NotFoundException(`规则 ${ruleId} 不存在`);
      }

      // 3. 验证规则是否需要用户决策
      if (!this.userDecisionService.requiresUserDecision(rule)) {
        return errorResponse(
          ErrorCode.BUSINESS_ERROR,
          `规则 ${ruleId} 不需要用户决策`,
        );
      }

      // 4. 解析已回答的问题ID列表
      const answeredIds = answeredQuestionIds
        ? answeredQuestionIds.split(',').map(id => id.trim()).filter(id => id.length > 0)
        : [];

      // 5. 获取问题分组和进度信息
      const questionGroups = this.userDecisionService.getQuestionGroups(rule, answeredIds);
      const nextQuestion = this.userDecisionService.getNextQuestion(rule, answeredIds);

      // 6. 返回结果
      return successResponse({
        ruleId,
        questions: rule.then.userDecision?.questions || [],
        groups: questionGroups.groups,
        progress: {
          answered: questionGroups.answeredQuestions,
          total: questionGroups.totalQuestions,
          percentage: Math.round(questionGroups.overallProgress * 100),
        },
        currentGroupIndex: questionGroups.currentGroupIndex,
        nextQuestion: nextQuestion || undefined,
      });
    } catch (error: any) {
      this.logger.error(`获取用户决策问题失败: ${error?.message}`, error?.stack);
      if (error instanceof NotFoundException) {
        throw error;
      }
      return errorResponse(ErrorCode.INTERNAL_ERROR, `获取用户决策问题失败: ${error?.message}`);
    }
  }

  @Post('trips/:tripId/decisions/:ruleId/answer')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({
    summary: '回答用户决策问题',
    description: '用户回答准备度规则中的决策问题，系统根据回答评估决策分支并返回更新后的准备度检查结果。',
  })
  @ApiParam({ name: 'tripId', description: '行程ID', type: String })
  @ApiParam({ name: 'ruleId', description: '规则ID', type: String })
  @ApiBody({
    schema: {
      type: 'object',
      properties: {
        answers: {
          type: 'object',
          description: '用户回答（questionId -> answer）',
          example: {
            'q1': true,
            'q2': 'option1',
            'q3': ['option1', 'option2'],
            'q4': 100000,
          },
        },
      },
      required: ['answers'],
    },
  })
  @ApiResponse({
    status: 200,
    description: '成功处理用户回答',
    type: ApiSuccessResponseDto,
  })
  @ApiResponse({
    status: 404,
    description: '行程或规则不存在',
    type: ApiErrorResponseDto,
  })
  async answerUserDecision(
    @ParamDecorator('tripId') tripId: string,
    @ParamDecorator('ruleId') ruleId: string,
    @Body() body: { answers: Record<string, any> },
  ): Promise<any> {
    try {
      // 1. 验证行程存在
      const trip = await this.prisma.trip.findUnique({
        where: { id: tripId },
        select: {
          id: true,
          destination: true,
        },
      });

      if (!trip) {
        throw new NotFoundException(`行程 ${tripId} 不存在`);
      }

      // 2. 加载 Pack 和规则
      const pack = await this.packStorageService.findPackByDestination(trip.destination);
      if (!pack) {
        throw new NotFoundException(`未找到目的地 ${trip.destination} 的准备度 Pack`);
      }

      const rule = pack.rules.find(r => r.id === ruleId);
      if (!rule) {
        throw new NotFoundException(`规则 ${ruleId} 不存在`);
      }

      // 3. 验证规则是否需要用户决策
      if (!this.userDecisionService.requiresUserDecision(rule)) {
        return errorResponse(
          ErrorCode.BUSINESS_ERROR,
          `规则 ${ruleId} 不需要用户决策`,
        );
      }

      // 4. 处理用户决策
      const decisionResult = await this.userDecisionService.processUserDecision(
        rule,
        body.answers,
      );

      // 5. 保存用户决策到数据库
      try {
        // 检查是否已存在该行程和规则的决策记录
        const existingDecision = await (this.prisma as any).tripReadinessDecision.findUnique({
          where: {
            tripId_ruleId: {
              tripId: tripId,
              ruleId: ruleId,
            },
          },
        });

        const decisionData = {
          tripId,
          ruleId,
          packId: pack.packId,
          userId: undefined, // 可以从 request 中提取
          answers: body.answers,
          decisionResult: {
            updatedAction: decisionResult.updatedAction,
            blockTrip: decisionResult.blockTrip,
            nextQuestions: decisionResult.nextQuestions,
            matchedBranch: decisionResult.matchedBranch,
          },
          matchedBranchId: (decisionResult.matchedBranch as any)?.id || undefined,
          blockTrip: decisionResult.blockTrip,
          updatedAction: decisionResult.updatedAction,
          category: rule.category,
          severity: rule.severity,
          level: decisionResult.updatedAction.level,
        };

        if (existingDecision) {
          // 更新现有记录
          await (this.prisma as any).tripReadinessDecision.update({
            where: {
              id: existingDecision.id,
            },
            data: decisionData,
          });
          this.logger.debug(`更新行程 ${tripId} 规则 ${ruleId} 的用户决策记录`);
        } else {
          // 创建新记录
          await (this.prisma as any).tripReadinessDecision.create({
            data: decisionData,
          });
          this.logger.debug(`创建行程 ${tripId} 规则 ${ruleId} 的用户决策记录`);
        }
      } catch (error: any) {
        // 如果数据库操作失败，记录日志但不影响主流程
        this.logger.warn(`保存用户决策到数据库失败: ${error?.message}`, error?.stack);
        // 仍然记录到日志作为备份
        this.logger.log(`行程 ${tripId} 回答规则 ${ruleId} 的问题: ${JSON.stringify(body.answers)}`);
      }

      // 6. 完整重新评估准备在 GATE_EVAL 阶段进行；此处仅返回更新后的 finding

      // 7. 将 Action 转换为 ReadinessFindingItem
      const findingItem: ReadinessFindingItem = {
        id: rule.id,
        category: rule.category,
        severity: rule.severity,
        level: decisionResult.updatedAction.level,
        message: typeof decisionResult.updatedAction.message === 'string' 
          ? decisionResult.updatedAction.message 
          : decisionResult.updatedAction.message.en || decisionResult.updatedAction.message.zh || '',
        tasks: decisionResult.updatedAction.tasks,
        evidence: rule.evidence?.map(e => ({
          sourceId: e.sourceId,
          sectionId: e.sectionId,
          quote: e.quote,
        })),
      };

      // 8. 编译约束（如果 blockTrip = true）
      let constraints: any[] = [];
      if (decisionResult.blockTrip || decisionResult.updatedAction.level === 'blocker') {
        // 创建一个临时的 ReadinessCheckResult
        const tempResult: ReadinessCheckResult = {
          findings: [
            {
              destinationId: pack.destinationId,
              packId: pack.packId,
              packVersion: pack.version,
              blockers: decisionResult.blockTrip ? [findingItem] : [],
              must: decisionResult.updatedAction.level === 'must' ? [findingItem] : [],
              should: decisionResult.updatedAction.level === 'should' ? [findingItem] : [],
              optional: decisionResult.updatedAction.level === 'optional' ? [findingItem] : [],
              risks: [],
            },
          ],
          summary: {
            totalBlockers: decisionResult.blockTrip ? 1 : 0,
            totalMust: decisionResult.updatedAction.level === 'must' ? 1 : 0,
            totalShould: decisionResult.updatedAction.level === 'should' ? 1 : 0,
            totalOptional: decisionResult.updatedAction.level === 'optional' ? 1 : 0,
            totalRisks: 0,
          },
        };
        constraints = await this.constraintsCompiler.compile(tempResult);
      }

      // 8. 获取问题分组和进度信息
      const answeredQuestionIds = Object.keys(body.answers);
      const questionGroups = this.userDecisionService.getQuestionGroups(rule, answeredQuestionIds);
      const nextQuestion = this.userDecisionService.getNextQuestion(rule, answeredQuestionIds);

      // 9. 返回结果
      return successResponse({
        updatedFinding: {
          id: ruleId,
          level: decisionResult.updatedAction.level,
          message: decisionResult.updatedAction.message,
          tasks: decisionResult.updatedAction.tasks,
          blockTrip: decisionResult.blockTrip,
        },
        gateResult: decisionResult.blockTrip ? 'BLOCK' : decisionResult.updatedAction.level === 'must' ? 'ADJUST_REQUIRED' : 'ALLOW',
        constraints,
        nextQuestions: decisionResult.nextQuestions || [],
        // 新增：问题分组和进度信息
        questionGroups: questionGroups.groups,
        progress: {
          answered: questionGroups.answeredQuestions,
          total: questionGroups.totalQuestions,
          percentage: Math.round(questionGroups.overallProgress * 100),
        },
        currentGroupIndex: questionGroups.currentGroupIndex,
        nextQuestion: nextQuestion || undefined,
      });
    } catch (error) {
      const err = error as Error;
      if (err instanceof NotFoundException) {
        return errorResponse(ErrorCode.NOT_FOUND, err.message);
      }
      this.logger.error(`处理用户决策失败: ${err.message}`, err.stack);
      return errorResponse(ErrorCode.INTERNAL_ERROR, err.message);
    }
  }

}


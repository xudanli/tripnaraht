// src/trips/trips.service.ts
import { Injectable, BadRequestException, NotFoundException, ForbiddenException, Logger, Optional, Inject } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import { Place } from '@prisma/client';
import { resolveTripRevision } from './trip-constraint-solver/utils/trip-revision.util';
import { bumpConstraintsVersion } from './trip-constraint-solver/utils/constraints-metadata.util';
import { mergeSeededTripConstraints, ensureSegmentDistanceConstraints } from './trip-constraint-solver/utils/segment-distance-threshold.util';
import { UserAutomationTemplateStore } from '../decision-runtime/authorization/user-automation-template.store';
import { bootstrapTripMetadataWithUserAutomationTemplate } from '../decision-runtime/authorization/automation-user-template-bootstrap.util';
import {
  CreateTripDto,
  MobilityTag,
  TripPace,
  TRIP_SUPPORTED_CURRENCIES,
  type TripSupportedCurrency,
} from './dto/create-trip.dto';
import { TripStatus, normalizeTripStatus } from './dto/trip-status.dto';
import { DateTime } from 'luxon';
import { PacingCalculator } from './utils/pacing-calculator.util';
import { FlightPriceService } from './services/flight-price.service';
import { ScheduleConverterService } from './services/schedule-converter.service';
import { ActionHistoryService } from './services/action-history.service';
import { TripRevisionBumpService } from './services/trip-revision-bump.service';
import { DayScheduleResult } from '../planning-policy/interfaces/scheduler.interface';
import { randomUUID } from 'crypto';
import { assertDirectEffectivePlanWriteBlocked } from '../decision-runtime/execution/effective-plan-write-chain-blocked.util';
import { ProjectMembershipService } from '../identity-governance/services/project-membership.service';
import { PersonaAlertDto, GetPersonaAlertsQueryDto, PersonaType, AlertSeverity } from './dto/persona-alerts.dto';
import { DecisionLogEntryDto, DecisionLogResponseDto, DecisionSource } from './dto/decision-log.dto';
import { TaskDto, TaskPriority, TaskCategory } from './dto/tasks.dto';
import { PipelineStatusResponseDto, PipelineStageDto, PipelineStageStatus } from './dto/pipeline-status.dto';
import { DecisionLogStorageService } from './decision/services/decision-log-storage.service';
import { TripDraftService } from './services/trip-draft.service';
import { SaveTripDraftDto } from './dto/trip-draft.dto';
import { 
  EvidenceItemDto, 
  EvidenceListResponseDto, 
  GetEvidenceQueryDto, 
  EvidenceType, 
  UpdateEvidenceRequestDto,
  UpdateEvidenceResponseDto,
  BatchUpdateEvidenceRequestDto,
  BatchUpdateEvidenceResponseDto,
  EvidenceStatus,
  EvidenceSeverity
} from './dto/evidence.dto';
import { AttentionItemDto, AttentionQueueResponseDto, GetAttentionQueueQueryDto, AttentionItemType, AttentionSeverity, AttentionStatus } from './dto/attention-queue.dto';
import { projectActiveSosAttentionItems } from './utils/sos-attention.util';
import { toPlaceResponseDto } from './dto/place-response.dto';
import { resolvePlaceCoordinates } from '../places/utils/place-coordinates.util';
import { resolveEffectiveIcelandPlaceCoordinates } from '../places/utils/iceland-canonical-poi-coords.util';
import {
  pickNextItineraryItemForStop,
  resolveCurrentItemId,
  resolveTripStateDayContext,
} from './utils/trip-state.util';
import { resolvePlaceDisplayName } from '../places/utils/place-display-name.util';
import { buildSyntheticPlaceForRestItineraryItem } from '../itinerary-items/utils/rest-itinerary-item-display.util';
import { EvidenceManagementService } from './services/evidence-management.service';
import { EvidenceFilteringService } from './services/evidence-filtering.service';
import { EvidenceCompletenessChecker, EvidenceCompletenessResult } from './services/evidence-completeness-checker.service';
import { EvidenceTriggerService, EvidenceTriggerResult } from './services/evidence-trigger.service';
import { EvidencePriorityFilter, EvidenceGroupBy, EvidenceSortBy } from './dto/evidence.dto';
import { OpeningHoursUtil } from '../common/utils/opening-hours.util';
import { resolveTripTimezone } from '../common/utils/destination-timezone.util';
import {
  CONSULTATION_DAY_SKELETON_FOOTER_ZH,
  CONSULTATION_NAMED_DRAFT_APPENDIX_FOOTER_ZH,
  CONSULTATION_TRIP_METADATA_ONLY_FOOTER_ZH,
  buildBriefItineraryLinesFromTripDays,
  formatConsultationTripDaySkeletonLines,
  formatTripPromptSummaryForConsultation,
} from './utils/trip-prompt-summary.util';
import {
  resolveActivityFocusWorldState,
  resolveTripDayWorldState,
} from './utils/resolve-trip-day-world-state.util';
import {
  buildNarrativeThemeBanner,
  isNarrativeThemeBannerEnabled,
} from './narrative-engine/utils/narrative-theme-banner.util';
import { BookingComIntegrationService } from '../mcp/booking-com-integration.service';
import { RouteDirectionsService } from '../route-directions/route-directions.service';
import {
  mergeTripMetadata,
  assertMetadataSizeLimit,
  validateHikingMetadataFields,
  validateHikingSegmentHikePlanRefs,
} from './utils/embedded-hiking-trip-metadata.util';
import { cascadeDeleteTripHikePlansWhenTableExists } from './utils/hike-plan-cascade-delete.util';
import {
  isExecutableScheduleReady,
  isRouteEstablishedForTrip,
  isTripGeneratingItems,
  needsGenerationProgressBackfill,
  resolveEffectiveGenerationProgress,
  resolveTripContentMode,
  type TripGenerationProgress,
} from './utils/trip-content-mode.util';
import {
  buildHikingDayCardsForTrip,
  readHikingTrailSegments,
} from './utils/hiking-day-schedule.util';
import { DSO_FEEDBACK_PERSISTENCE } from '../decision/kernel/dso-feedback-persistence.interface';
import type { IDsoFeedbackPersistence } from '../decision/kernel/dso-feedback-persistence.interface';
import type { DecisionState } from '../decision/kernel/decision-state.types';
import { projectPersonaAlertsForAudience } from './utils/persona-alert-bff.projection';
import { pickLatestGuardianPresentationFromLogs } from './utils/guardian-user-facing.projection.util';
import { extractGuardianNegotiationSnapshot } from './readiness/utils/readiness-guardian-negotiation.util';
import { FeasibilityReportService } from './trip-constraint-solver/services/feasibility-report.service';
import { ItineraryItemsService } from '../itinerary-items/itinerary-items.service';
import {
  attachDisplaySortIndices,
  sortItineraryItemsForDayDisplay,
} from '../itinerary-items/utils/itinerary-day-display-order.util';
import { TripLifecycleValidatorService, extractTripContext } from './services/trip-lifecycle-validator.service';
import { DecisionEventEmitter } from './decision/optimization/events/decision-events';
import { TripOutcomeOrchestratorService } from './services/trip-outcome-orchestrator.service';
import { AnchorHandoffService } from './in-trip-execution/services/anchor-handoff.service';
import { PostTripSummaryService } from './in-trip-execution/services/post-trip-summary.service';

@Injectable()
export class TripsService {
  private readonly logger = new Logger(TripsService.name);

  /**
   * 验证 UUID 格式
   * UUID 格式: xxxxxxxx-xxxx-xxxx-xxxx-xxxxxxxxxxxx (8-4-4-4-12 十六进制字符)
   */
  private isValidUUID(uuid: string): boolean {
    if (!uuid || typeof uuid !== 'string') {
      return false;
    }
    const uuidRegex = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
    return uuidRegex.test(uuid.trim());
  }

  /**
   * 检查行程是否需要租车
   * 
   * 判断条件：
   * 1. 路线距离较长（>100km）
   * 2. 路线经过偏远地区（公共交通不发达）
   * 3. 用户明确指定需要租车（通过 metadata）
   * 4. 路线类型为"自驾"或"road trip"
   * 
   * @param dto 创建行程的输入数据（可选）
   * @param countryCode 目的地国家代码（可选）
   * @param tripId 行程 ID（可选，用于查询已有行程）
   * @returns 是否需要租车
   */
  async checkCarRentalNeeds(
    dto?: CreateTripDto,
    countryCode?: string,
    tripId?: string,
  ): Promise<boolean> {
    // 如果提供了 tripId，从数据库查询
    if (tripId) {
      try {
        // 简化处理：检查 trip metadata 中是否有租车需求标记
        const trip = await this.prisma.trip.findUnique({
          where: { id: tripId },
        });

        if (trip) {
          const metadata = (trip.metadata as any) || {};
          if (metadata.needsCarRental === true) {
            return true;
          }
        }
      } catch (error: any) {
        this.logger.warn(`Failed to check car rental needs for trip ${tripId}: ${error.message}`);
      }
    }

    // 如果提供了 dto，从 DTO 中检查
    if (dto) {
      // 检查 DTO 中是否有 metadata 字段（可选）
      const metadata = (dto as any).metadata || {};
      if (metadata.needsCarRental === true) {
        return true;
      }
      
      // 检查目的地国家（某些国家更适合自驾）
      if (countryCode) {
        const carRentalFriendlyCountries = ['US', 'CA', 'AU', 'NZ', 'IS', 'NO', 'SE', 'FI'];
        if (carRentalFriendlyCountries.includes(countryCode.toUpperCase())) {
          // 这些国家通常更适合自驾，但不一定需要
          // 这里只是提示，实际决策应该基于路线
        }
      }
    }

    return false;
  }

  /**
   * 估算租车成本
   * 
   * 注意：此方法需要在路线规划完成后调用，因为需要 RoutePlanDraft
   * 
   * @param tripId 行程 ID
   * @returns 租车成本估算（如果不需要租车或无法估算，返回 0）
   */
  async estimateCarRentalCost(tripId: string): Promise<number> {
    if (!this.bookingComIntegration) {
      this.logger.debug('BookingComIntegrationService not available, skipping car rental cost estimation');
      return 0;
    }

    const needsCarRental = await this.checkCarRentalNeeds(undefined, undefined, tripId);
    if (!needsCarRental) {
      return 0;
    }

    try {
      // 获取行程信息
      const trip = await this.prisma.trip.findUnique({
        where: { id: tripId },
      });

      if (!trip) {
        return 0;
      }

      // 构建简化的 RoutePlanDraft（用于成本估算）
      // 注意：这里需要从 RouteDirection 和 TripDay 构建 RoutePlanDraft
      // 简化处理：如果无法构建，返回 0
      // 实际应用中，应该在路线规划完成后调用此方法
      // 此时可以调用 bookingComIntegration.estimateCarRentalCost(plan, world)

      this.logger.debug(`Car rental cost estimation for trip ${tripId} requires RoutePlanDraft, skipping for now`);
      return 0;
    } catch (error: any) {
      this.logger.warn(`Car rental cost estimation failed: ${error.message}`);
      return 0;
    }
  }

  constructor(
    private prisma: PrismaService,
    private flightPriceService: FlightPriceService,
    private scheduleConverter: ScheduleConverterService,
    private actionHistory: ActionHistoryService,
    private decisionLogStorage: DecisionLogStorageService,
    private tripDraftService: TripDraftService,
    private evidenceManagement: EvidenceManagementService,
    private evidenceFiltering: EvidenceFilteringService,
    private evidenceCompletenessChecker: EvidenceCompletenessChecker,
    private evidenceTrigger: EvidenceTriggerService,
    private tripLifecycleValidator: TripLifecycleValidatorService,
    private decisionEventEmitter: DecisionEventEmitter,
    private bookingComIntegration?: BookingComIntegrationService,
    @Optional() private routeDirectionsService?: RouteDirectionsService,
    @Optional() @Inject(DSO_FEEDBACK_PERSISTENCE) private dsoFeedbackPersistence?: IDsoFeedbackPersistence,
    @Optional() private itineraryItemsService?: ItineraryItemsService,
    @Optional() private tripOutcomeOrchestrator?: TripOutcomeOrchestratorService,
    @Optional() private anchorHandoff?: AnchorHandoffService,
    @Optional() private postTripSummary?: PostTripSummaryService,
    @Optional() private readonly tripRevisionBump?: TripRevisionBumpService,
    @Optional() private readonly projectMembership?: ProjectMembershipService,
    @Optional() private readonly feasibilityReport?: FeasibilityReportService,
    @Optional() private readonly userAutomationTemplateStore?: UserAutomationTemplateStore,
  ) {}

  /**
   * 创建行程
   * 
   * 核心功能：
   * 1. 计算行程天数
   * 2. 木桶效应计算（Pacing Strategy）
   * 3. 预算切分（Budget Strategy）
   * 4. 自动创建 TripDay 记录
   * 5. 创建 TripCollaborator 记录关联创建者
   * 
   * @param dto 创建行程的输入数据
   * @param userId 创建者用户ID（必需）
   * @returns 创建成功的 Trip 对象
   */
  async create(dto: CreateTripDto, userId: string) {
    // ============================================
    // 步骤 0: 验证目的地国家代码和 Place 数据
    // ============================================
    // 规范化国家代码（转换为大写）
    const normalizedCountryCode = dto.destination.toUpperCase().trim();

    // 验证国家代码格式（ISO 3166-1 alpha-2：2个大写字母）
    if (!/^[A-Z]{2}$/.test(normalizedCountryCode)) {
      throw new BadRequestException(
        `无效的目的地国家代码: ${dto.destination}。必须是 ISO 3166-1 alpha-2 格式（2个大写字母，如 JP、IS、US）`
      );
    }

    // 验证该国家是否有 City 数据（至少一个城市）
    // 这样后续添加行程项时才能关联到 Place
    const cityCount = await this.prisma.city.count({
      where: { countryCode: normalizedCountryCode },
    });

    if (cityCount === 0) {
      throw new NotFoundException(
        `目的地国家 ${normalizedCountryCode} 没有城市数据。系统暂不支持该目的地，或该国家尚未导入城市数据。`
      );
    }

    // 验证该国家是否有 RouteDirection 数据（Should-Exist Gate 前置，与 TripNARA 范式一致）
    if (this.routeDirectionsService) {
      try {
        const { active } = await this.routeDirectionsService.findRouteDirectionsByCountry(normalizedCountryCode);
        if (!active || active.length === 0) {
          throw new NotFoundException(
            `目的地 ${normalizedCountryCode} 暂无可用路线方向，暂不支持行程规划。请联系运营或稍后再试。`
          );
        }
      } catch (error: any) {
        if (error instanceof NotFoundException) {
          throw error;
        }
        this.logger.warn(`RouteDirection 校验失败，跳过（允许创建）: ${error?.message}`);
      }
    }

    // ============================================
    // 步骤 1: 计算行程天数
    // ============================================
    const start = DateTime.fromISO(dto.startDate);
    const end = DateTime.fromISO(dto.endDate);

    // 验证日期有效性
    if (!start.isValid) {
      throw new BadRequestException(`无效的开始日期: ${dto.startDate}`);
    }
    if (!end.isValid) {
      throw new BadRequestException(`无效的结束日期: ${dto.endDate}`);
    }
    if (end <= start) {
      throw new BadRequestException('结束日期必须晚于开始日期');
    }

    // 计算天数（包含首尾两天）
    const durationDays = Math.floor(end.diff(start, 'days').days) + 1;

    if (durationDays < 1) {
      throw new BadRequestException('行程天数必须至少为 1 天');
  }

    // ============================================
    // 步骤 2: 🧠 策略一：木桶效应计算 (Pacing Strategy)
    // ============================================
    // 使用新的双轴模型 + 木桶效应算法
    // 根据团队中最弱的成员决定整体节奏
    let pacingConfig = PacingCalculator.calculateShortestStave(dto.travelers);

    // 处理节奏配置（如果用户指定了 pace）
    if (dto.pace) {
      const paceToActivities: Record<TripPace, number> = {
        [TripPace.RELAXED]: 3,
        [TripPace.STANDARD]: 5,
        [TripPace.TIGHT]: 7,
      };
      pacingConfig = {
        ...pacingConfig,
        level: dto.pace,
        maxDailyActivities: paceToActivities[dto.pace],
      };
    }

    // ============================================
    // 步骤 3: 🧠 策略二：预算切分 (Budget Strategy)
    // ============================================
    // 从估算数据库查询机票+签证费用（保守估算：使用旺季价格）
    // 使用规范化后的国家代码
    const estimatedFlightVisa = await this.flightPriceService.getEstimatedCost(
      normalizedCountryCode,
      undefined, // 暂时不指定出发城市，后续可以从 DTO 中获取
      true // 使用保守估算（旺季价格）
    );
    
    // 检查是否需要租车并估算租车成本
    const estimatedCarRentalCost = 0;
    const needsCarRental = await this.checkCarRentalNeeds(dto, normalizedCountryCode);
    if (needsCarRental && this.bookingComIntegration) {
      try {
        // 简化处理：使用默认坐标估算（实际应用中应该从 RouteDirection 获取）
        // 这里暂时跳过，因为需要 RoutePlanDraft，在行程创建时还没有生成
        // 租车成本估算将在行程规划完成后进行
        this.logger.debug('Trip may need car rental, cost estimation will be done after route planning');
      } catch (error: any) {
        this.logger.warn(`Car rental cost estimation failed: ${error.message}`);
      }
    }
    
    const remainingBudget = dto.totalBudget - estimatedFlightVisa - estimatedCarRentalCost;
    const dailyBudget = remainingBudget / durationDays;
    
    // 根据每日预算推导酒店档次
    // 这个逻辑可以根据实际需求调整
    let hotelTier = '3-Star';
    if (dailyBudget > 3000) {
      hotelTier = '5-Star';
    } else if (dailyBudget > 1500) {
      hotelTier = '4-Star';
  }

    const budgetConfig = {
      totalBudget: dto.totalBudget, // 使用 totalBudget 保持一致性
      currency: dto.currency || 'CNY',
      estimated_flight_visa: estimatedFlightVisa,
      remaining_for_ground: remainingBudget,
      daily_budget: Math.round(dailyBudget),
      hotel_tier_recommendation: hotelTier,
      travelers: dto.travelers.map(t => ({
        type: t.type,
        mobilityTag: t.mobilityTag,
      })), // 保存旅行者信息，用于时间价值计算
    };

    // ============================================
    // 步骤 3.5: 处理偏好和约束（新增）
    // ============================================
    // 将用户的偏好和约束存入 metadata
    const metadata: Record<string, any> = {};
    
    if (dto.preferences && dto.preferences.length > 0) {
      metadata.preferences = dto.preferences;
    }
    
    if (dto.mustPlaces && dto.mustPlaces.length > 0 || dto.avoidPlaces && dto.avoidPlaces.length > 0) {
      metadata.constraints = {
        mustPlaces: dto.mustPlaces || [],
        avoidPlaces: dto.avoidPlaces || [],
      };
    }

    if (dto.metadata && typeof dto.metadata === 'object') {
      Object.assign(metadata, dto.metadata);
      validateHikingMetadataFields(metadata, {
        startDate: start.toJSDate(),
        endDate: end.toJSDate(),
      });
      assertMetadataSizeLimit(metadata);
    }

    ensureSegmentDistanceConstraints(normalizedCountryCode, metadata);

    if (userId && this.userAutomationTemplateStore) {
      const userTemplate = await this.userAutomationTemplateStore.get(userId);
      Object.assign(
        metadata,
        bootstrapTripMetadataWithUserAutomationTemplate(metadata, userTemplate),
      );
    }

    // ============================================
    // 步骤 4: 写入数据库 (使用 Transaction 保证原子性)
    // ============================================
    // 生成行程名称（如果未提供，使用默认名称）
    const tripName = dto.name?.trim() || this.generateDefaultTripName({
      destination: normalizedCountryCode,
      startDate: dto.startDate,
    });

    // 使用事务确保 Trip 和 TripDay 要么全部创建成功，要么全部失败
    const result = await this.prisma.$transaction(async (tx) => {
      // A. 创建 Trip 主记录
      // 使用规范化后的国家代码
      const trip = await tx.trip.create({
        data: {
          id: randomUUID(),
          name: tripName, // 新增：行程名称
          destination: normalizedCountryCode,
          startDate: start.toJSDate(),
          endDate: end.toJSDate(),
          status: dto.status || TripStatus.PLANNING, // 使用传入的状态或默认值
          budgetConfig: budgetConfig as any,
          pacingConfig: pacingConfig as any,
          metadata: Object.keys(metadata).length > 0 ? metadata as any : undefined, // 存储偏好和约束
          updatedAt: new Date(),
        } as any, // Use UncheckedCreateInput to allow direct field assignment
      });

      // B. 自动生成每一天的容器 (TripDay)
      // 为每一天创建一个空的行程容器，后续可以添加具体的活动
      const tripDays = [];
      for (let i = 0; i < durationDays; i++) {
        const dayDate = start.plus({ days: i });
        const tripDay = await tx.tripDay.create({
          data: {
            id: randomUUID(),
            date: dayDate.toJSDate(),
            tripId: trip.id,
          } as any, // Use UncheckedCreateInput to allow direct foreign key assignment
        });
        tripDays.push(tripDay);
      }

      // C. 创建 TripCollaborator 记录，关联创建者
      if (userId) {
        await tx.tripCollaborator.create({
          data: {
            id: randomUUID(),
            tripId: trip.id,
            userId: userId,
            role: 'OWNER', // 创建者默认为 OWNER 角色
            updatedAt: new Date(),
          } as any,
        });
        if (this.projectMembership) {
          await this.projectMembership.syncFromCollaborator(trip.id, userId, 'OWNER', tx);
        }
      }

      // 返回完整的 Trip 对象（包含关联的 TripDay）
      return {
        ...trip,
        days: tripDays,
        // 返回处理后的配置（便于前端使用）
        processedConfig: {
          pacingConfig: pacingConfig,
          budgetConfig: budgetConfig,
          metadata: Object.keys(metadata).length > 0 ? metadata : undefined,
        },
      };
    });

    if (dto.metadata && typeof dto.metadata === 'object') {
      await validateHikingSegmentHikePlanRefs(result.id, metadata, this.prisma);
    }

    // 专利实施例：写入初始 DSO 到 Trip.metadata，供 REPLAN/反馈/世界模型推送使用
    if (this.dsoFeedbackPersistence) {
      try {
        const origin = (dto as any).metadata?.origin as string | undefined;
        const initialDso = this.buildInitialDsoFromCreateDto(result.id, dto, origin);
        await this.dsoFeedbackPersistence.persistDso(result.id, initialDso);
      } catch (e: unknown) {
        this.logger.warn(`[TripsService.create] 初始 DSO 持久化失败: ${(e as Error)?.message}`);
      }
    }

    return result;
  }

  private buildInitialDsoFromCreateDto(
    tripId: string,
    dto: CreateTripDto,
    origin?: string,
  ): DecisionState {
    const start = dto.startDate?.includes('T') ? dto.startDate.slice(0, 10) : dto.startDate;
    const end = dto.endDate?.includes('T') ? dto.endDate.slice(0, 10) : dto.endDate;
    const days = start && end
      ? Math.ceil((new Date(end).getTime() - new Date(start).getTime()) / 86400000) + 1
      : 1;
    return {
      requestId: tripId,
      userIntent: {
        destination: dto.destination,
        origin,
        dateRange: start && end ? { startDate: start, endDate: end } : undefined,
        days,
        budget: dto.totalBudget,
        party: { count: dto.travelers?.length ?? 1 },
        preferences: dto.preferences?.length ? { tags: dto.preferences } : undefined,
      },
      tripState: {},
      environmentState: {},
      systemState: { requestId: tripId, version: 1 },
    };
  }

  /**
   * 从草案创建行程
   */
  async createFromDraft(dto: SaveTripDraftDto, userId: string) {
    const draft = dto.draft;

    // 验证草案数据
    if (!draft.draftDays || draft.draftDays.length === 0) {
      throw new BadRequestException('草案数据为空');
    }

    // 构建 CreateTripDto（需要从草案中提取或使用默认值）
    // 这里简化处理，实际应该让用户提供这些信息
    const createTripDto: CreateTripDto = {
      destination: draft.destination,
      startDate: draft.startDate || draft.draftDays[0].date,
      endDate: draft.endDate || draft.draftDays[draft.draftDays.length - 1].date,
      totalBudget: 20000, // 默认预算
      travelers: [{ type: 'ADULT', mobilityTag: MobilityTag.CITY_POTATO }], // 默认旅行者
    };

    // 创建 Trip（使用现有方法）
    const trip = await this.create(createTripDto, userId);

    // 批量创建 ItineraryItem
    const itemsCount = await this.tripDraftService.createItineraryItemsFromDraft(
      trip.id,
      draft,
      dto.userEdits
    );

    // 返回完整的 Trip（包含行程项）
    return {
      ...trip,
      itemsCount,
    };
  }

  /**
   * 查找所有行程
   * 
   * @param userId 当前用户 ID（可选，用于判断是否已收藏）
   */
  async findAll(userId?: string) {
    // 如果提供了 userId，只返回该用户作为协作者的行程
    const where = userId
      ? {
          TripCollaborator: {
            some: {
              userId: userId,
            },
          },
        }
      : {};

    const trips = await this.prisma.trip.findMany({
      where,
      include: {
        TripDay: {
          include: {
            ItineraryItem: true,
          },
        },
        // 查询收藏统计
        _count: {
          select: {
            TripCollection: true,
          },
        },
        // 如果提供了 userId，查询当前用户是否已收藏
        ...(userId ? {
          TripCollection: {
            where: { userId },
            select: { id: true },
          },
        } : {}),
      },
      orderBy: {
        createdAt: 'desc',
      },
    });

    // 为每个行程添加 isCollected 字段，并清理内部字段
    return trips.map((trip: any) => {
      const { _count, TripCollection, ...tripData } = trip;
      return {
        ...tripData,
        isCollected: userId ? (TripCollection?.length > 0) : false,
        collectionCount: _count?.TripCollection || 0,
      };
    });
  }

  /**
   * 根据 ID 查找单个行程（全景视图）
   * 
   * 返回完整的行程树形结构：
   * - Trip
   *   - Days (按日期排序)
   *     - Items (按时间排序)
   *       - Place (地点详情)
   * 
   * 同时包含数据增强（统计信息、点赞收藏状态）
   * 
   * @param id 行程 ID
   * @param userId 当前用户 ID（可选，用于判断是否已点赞/收藏）
   */
  async findOne(id: string, userId?: string) {
    // Hard guard: prevent Prisma from seeing null/undefined id
    if (!id || typeof id !== 'string' || !id.trim()) {
      throw new BadRequestException('tripId is required');
    }

    // 如果提供了 userId，验证用户是否有权限访问该行程
    if (userId) {
      const collaborator = await this.prisma.tripCollaborator.findUnique({
        where: {
          tripId_userId: {
            tripId: id,
            userId: userId,
          },
        },
      });

      if (!collaborator) {
        throw new NotFoundException(`行程 ID ${id} 不存在或您没有权限访问`);
      }
    }

    const trip = await this.prisma.trip.findUnique({
      where: { id },
      include: {
        // 第一层：关联查询所有的 Days
        TripDay: {
          orderBy: { date: 'asc' }, // 按日期排序
          include: {
            // 第二层：关联查询每天下面的 Items
            ItineraryItem: {
              // 🆕 统一按 startTime 排序（移除 order 排序）
              orderBy: {
                startTime: 'asc', // 按时间轴排序 (9点在10点前)
              },
              include: {
                // 第三层：关联查询 Item 对应的地点详情 (如果有)
                // P0 必须返回：id, nameCN, nameEN, category, address, rating, metadata(openingHours)
                // P1 推荐返回：metadata.price, metadata.priceLevel, metadata.tags
                // P2 可选返回：metadata.phone, metadata.website
                Place: {
                  select: {
                    id: true,
                    nameCN: true,
                    nameEN: true,
                    category: true,
                    address: true,
                    rating: true,
                    metadata: true,
                    description: true,
                    physicalMetadata: true,
                  },
                },
              }
            }
          }
        },
        // 查询点赞和收藏统计
        _count: {
          select: {
            TripLike: true,
            TripCollection: true,
          },
        },
        // 如果提供了 userId，查询当前用户是否已点赞/收藏
        ...(userId ? {
          TripLike: {
            where: { userId },
            select: { id: true },
          },
          TripCollection: {
            where: { userId },
            select: { id: true },
          },
        } : {}),
      }
    });

    if (!trip) {
      throw new NotFoundException(`行程 ID ${id} 不存在`);
    }

    // 数据增强 (Data Enrichment)
    // 计算统计信息、进度状态等
    return await this.enrichTripData(trip, userId);
  }

  /**
   * 轻量行程摘要（不经 enrichTripData），供咨询类 prompt 注入。
   * 默认附带各日类型骨架；`include_named_draft_appendix` 为 true 时再附加按日 Place/备注速览
   * （工作台 `active_trip_summary`、住宿+餐饮、进度复盘、路况/装备/徒步/租车等需锚定 POI 的咨询）。
   */
  async getTripPromptSummaryForConsultation(
    id: string,
    _userId?: string,
    opts?: {
      include_day_skeleton?: boolean;
      include_named_draft_appendix?: boolean;
      /** 1-based DayN；注入日焦点 World State，对齐 UI theme 与入库 items */
      focus_day_index?: number | null;
      activity_hint?: string | null;
    },
  ): Promise<string | null> {
    if (!id || typeof id !== 'string' || !id.trim()) {
      return null;
    }
    const trimmed = id.trim();
    const includeDaySkeleton = opts?.include_day_skeleton !== false;
    const includeNamedDraft = opts?.include_named_draft_appendix === true;

    const trip = await this.prisma.trip.findUnique({
      where: { id: trimmed },
      select: {
        name: true,
        destination: true,
        startDate: true,
        endDate: true,
        status: true,
        metadata: true,
        ...(includeDaySkeleton
          ? {
              TripDay: {
                orderBy: { date: 'asc' as const },
                select: {
                  date: true,
                  ItineraryItem: {
                    orderBy: { order: 'asc' as const },
                    select: {
                      type: true,
                      note: true,
                      Place: { select: { nameCN: true, nameEN: true } },
                    },
                  },
                },
              },
            }
          : {}),
      },
    });
    if (!trip) {
      return null;
    }

    const { TripDay: tripDays, metadata, ...tripMeta } = trip as typeof trip & {
      metadata?: unknown;
      TripDay?: Array<{
        date: Date;
        ItineraryItem: Array<{
          type: string;
          note: string | null;
          Place: { nameCN: string | null; nameEN: string | null } | null;
        }>;
      }>;
    };
    const metaObj =
      metadata && typeof metadata === 'object' && !Array.isArray(metadata)
        ? (metadata as Record<string, unknown>)
        : {};
    const dayThemesRaw = metaObj.dayThemes;
    const dayThemes =
      dayThemesRaw && typeof dayThemesRaw === 'object' && !Array.isArray(dayThemesRaw)
        ? Object.fromEntries(
            Object.entries(dayThemesRaw as Record<string, unknown>).filter(
              (e): e is [string, string] => typeof e[1] === 'string',
            ),
          )
        : null;
    const base = formatTripPromptSummaryForConsultation(trimmed, tripMeta);
    if (!includeDaySkeleton) {
      return `${base}${CONSULTATION_TRIP_METADATA_ONLY_FOOTER_ZH}`;
    }
    const skeleton = formatConsultationTripDaySkeletonLines(tripDays ?? [], {
      startDate: tripMeta.startDate,
      dayThemes,
    });
    let body = `${base}\n\n【按日骨架（仅日程项类型与数量，不含景点库名称/坐标）】\n${skeleton}${CONSULTATION_DAY_SKELETON_FOOTER_ZH}`;
    if (includeNamedDraft) {
      const brief = buildBriefItineraryLinesFromTripDays(tripDays ?? [], {
        startDate: tripMeta.startDate,
        dayThemes,
      }).join('\n');
      body += `\n\n【草案地点速览（Place 登记名或备注；供你对照用户所述路段）】\n${brief}${CONSULTATION_NAMED_DRAFT_APPENDIX_FOOTER_ZH}`;
    }
    const focusDay =
      opts?.focus_day_index != null && Number(opts.focus_day_index) > 0
        ? Number(opts.focus_day_index)
        : undefined;
    if (focusDay && tripDays) {
      const resolution = resolveTripDayWorldState({
        requestedDay: focusDay,
        startDate: tripMeta.startDate,
        days: tripDays,
        dayThemes,
        activityHint: opts?.activity_hint,
      });
      body += `\n\n${resolution.promptBlockZh}`;
    } else if (opts?.activity_hint && tripDays) {
      const activityFocus = resolveActivityFocusWorldState({
        startDate: tripMeta.startDate,
        days: tripDays,
        dayThemes,
        activityHint: opts.activity_hint,
      });
      if (activityFocus) body += `\n\n${activityFocus.promptBlockZh}`;
    }
    return body;
  }

  /**
   * 验证状态转换是否合法
   *
   * 使用 TripLifecycleValidatorService 进行正向验证
   *
   * @param currentStatus 当前状态
   * @param newStatus 新状态
   * @param context Trip 上下文（可选）
   * @throws BadRequestException 如果状态转换不合法
   */
  private validateStatusTransition(
    tripId: string,
    currentStatus: string | null,
    newStatus: TripStatus,
    context?: any,
    userId?: string,
  ): void {
    this.tripLifecycleValidator.validateTransitionOrThrow(
      currentStatus,
      newStatus,
      context,
      { tripId, userId },
    );
  }

  /**
   * 更新行程基本信息
   * 
   * @param id 行程 ID
   * @param dto 更新数据（部分字段）
   * @returns 更新后的行程
   */
  async update(id: string, dto: Partial<CreateTripDto>, userId?: string) {
    // 验证行程存在
    const existingTrip = await this.prisma.trip.findUnique({
      where: { id },
    });

    if (!existingTrip) {
      throw new NotFoundException(`行程 ID ${id} 不存在`);
    }

    // 构建更新数据
    const updateData: any = {};

    if (dto.destination !== undefined) {
      updateData.destination = dto.destination.toUpperCase().trim();
    }

    if (dto.startDate !== undefined) {
      updateData.startDate = new Date(dto.startDate);
    }

    if (dto.endDate !== undefined) {
      updateData.endDate = new Date(dto.endDate);
    }

    // totalBudget / currency → budgetConfig 对称 merge（只改其一不清除另一项）
    if (dto.totalBudget !== undefined || dto.currency !== undefined) {
      const existingBudgetConfig =
        existingTrip.budgetConfig && typeof existingTrip.budgetConfig === 'object'
          ? { ...(existingTrip.budgetConfig as Record<string, unknown>) }
          : {};
      const budgetPatch: Record<string, unknown> = { ...existingBudgetConfig };

      if (dto.totalBudget !== undefined) {
        budgetPatch.totalBudget = dto.totalBudget;
      }

      if (dto.currency !== undefined) {
        const currency = String(dto.currency).trim().toUpperCase();
        if (
          !(TRIP_SUPPORTED_CURRENCIES as readonly string[]).includes(currency)
        ) {
          throw new BadRequestException(
            `currency 必须是有效的 ISO 4217 货币代码（支持: ${TRIP_SUPPORTED_CURRENCIES.join(', ')}）`,
          );
        }
        budgetPatch.currency = currency as TripSupportedCurrency;
      }

      updateData.budgetConfig = budgetPatch;
    }

    // 合并 metadata：支持 travelers 与任意 metadata 字段（如 teamId）
    const hasTravelers = dto.travelers !== undefined;
    const dtoWithMeta = dto as { metadata?: Record<string, unknown> };
    const hasMeta = dtoWithMeta.metadata !== undefined && typeof dtoWithMeta.metadata === 'object';
    if (hasTravelers || hasMeta) {
      const existing = (existingTrip.metadata as Record<string, unknown>) || {};
      const patch: Record<string, unknown> = {
        ...(hasTravelers ? { travelers: dto.travelers } : {}),
        ...(hasMeta ? dtoWithMeta.metadata! : {}),
      };
      const merged = mergeTripMetadata(existing, patch);
      const nextStart =
        updateData.startDate ?? existingTrip.startDate;
      const nextEnd = updateData.endDate ?? existingTrip.endDate;
      validateHikingMetadataFields(merged, {
        startDate: nextStart,
        endDate: nextEnd,
      });
      await validateHikingSegmentHikePlanRefs(id, merged, this.prisma);
      assertMetadataSizeLimit(merged);
      updateData.metadata = merged;
    }

    const constraintsTouched =
      dto.startDate !== undefined ||
      dto.endDate !== undefined ||
      dto.totalBudget !== undefined ||
      dto.currency !== undefined ||
      hasTravelers;
    if (constraintsTouched) {
      const base = (updateData.metadata ?? existingTrip.metadata ?? {}) as Record<string, unknown>;
      updateData.metadata = bumpConstraintsVersion(base);
    }

    // 处理状态更新
    let statusChanged = false;
    let previousStatus: string | null = null;
    let newStatus: string | null = null;

    if (dto.status !== undefined) {
      // 使用合并后的 Trip 上下文，允许同一次更新补齐条件并推进状态
      const tripContext = extractTripContext({
        ...existingTrip,
        ...updateData,
      });

      // 验证状态转换
      this.validateStatusTransition(
        id,
        existingTrip.status,
        dto.status,
        tripContext,
        userId,
      );

      // 归一化当前状态和新状态，用于比较实际变化
      const normalizedCurrent = normalizeTripStatus(existingTrip.status);
      const normalizedNew = normalizeTripStatus(dto.status);

      statusChanged = normalizedCurrent !== normalizedNew;
      previousStatus = existingTrip.status || TripStatus.DRAFT;
      newStatus = dto.status;
      updateData.status = dto.status;
    }

    // 处理名称更新
    if (dto.name !== undefined) {
      const trimmedName = dto.name.trim();
      if (trimmedName.length === 0) {
        // 如果名称为空字符串，生成默认名称
        const { generateDefaultTripName } = require('./utils/trip-name.util');
        updateData.name = generateDefaultTripName({
          destination: existingTrip.destination,
          startDate: existingTrip.startDate,
        });
      } else {
        updateData.name = trimmedName;
      }
    }

    // 如果更新了日期，需要重新计算天数
    if (dto.startDate || dto.endDate) {
      const startDate = dto.startDate ? new Date(dto.startDate) : existingTrip.startDate;
      const endDate = dto.endDate ? new Date(dto.endDate) : existingTrip.endDate;
      
      if (startDate > endDate) {
        throw new BadRequestException('开始日期不能晚于结束日期');
      }
    }

    // 如果 startDate 平移，需要同步平移 TripDay.date（以及 ItineraryItem.startTime/endTime）
    const oldStartDay = DateTime.fromJSDate(existingTrip.startDate, { zone: 'utc' }).startOf('day');
    const nextStartDate = (updateData.startDate as Date | undefined) ?? existingTrip.startDate;
    const newStartDay = DateTime.fromJSDate(nextStartDate, { zone: 'utc' }).startOf('day');
    const rawDeltaDays = newStartDay.diff(oldStartDay, 'days').days;
    const deltaDays = Math.round(rawDeltaDays);

    const updatedTrip = await this.prisma.$transaction(async (tx) => {
      // 1) 更新 Trip 本身
      await tx.trip.update({
        where: { id },
        data: updateData,
      });

      // 2) 如有平移，更新 TripDay 与 ItineraryItem
      if (deltaDays !== 0) {
        const days = await tx.tripDay.findMany({
          where: { tripId: id },
          include: { ItineraryItem: true },
        });

        for (const day of days) {
          const shiftedDayDate = DateTime.fromJSDate(day.date, { zone: 'utc' })
            .plus({ days: deltaDays })
            .toJSDate();

          await tx.tripDay.update({
            where: { id: day.id },
            data: { date: shiftedDayDate },
          });

          for (const item of day.ItineraryItem) {
            const startTime = item.startTime
              ? DateTime.fromJSDate(item.startTime, { zone: 'utc' }).plus({ days: deltaDays }).toJSDate()
              : undefined;
            const endTime = item.endTime
              ? DateTime.fromJSDate(item.endTime, { zone: 'utc' }).plus({ days: deltaDays }).toJSDate()
              : undefined;

            // 只在字段存在时更新，避免把 null/undefined 写回去改变语义
            const itemUpdateData: Record<string, Date> = {};
            if (startTime) itemUpdateData.startTime = startTime;
            if (endTime) itemUpdateData.endTime = endTime;

            if (Object.keys(itemUpdateData).length > 0) {
              await tx.itineraryItem.update({
                where: { id: item.id },
                data: itemUpdateData,
              });
            }
          }
        }
      }

      // 3) 重新读取（带关联）用于返回
      const tripWithDays = await tx.trip.findUnique({
        where: { id },
        include: {
          TripDay: {
            include: { ItineraryItem: true },
          },
        },
      });

      if (!tripWithDays) {
        throw new NotFoundException(`行程 ID ${id} 不存在`);
      }

      return tripWithDays;
    });

    if (deltaDays !== 0) {
      await this.bumpTripRevisionIfAvailable(id);
    }

    if (statusChanged && previousStatus && newStatus) {
      try {
        this.decisionEventEmitter.tripStateChanged(
          id,
          previousStatus,
          newStatus,
          userId,
        );
      } catch (eventError) {
        this.logger.warn(
          `[TripLifecycle] Failed to emit TRIP_STATE_CHANGED event for trip ${id}: ${eventError}`,
        );
      }

      if (this.anchorHandoff && normalizeTripStatus(newStatus) === TripStatus.TRAVELING) {
        void this.anchorHandoff.materializeOnTransition(id, userId).catch((err: unknown) => {
          const msg = err instanceof Error ? err.message : String(err);
          this.logger.warn(`[InTripHandoff] transition hook failed for trip ${id}: ${msg}`);
        });
      }

      if (this.postTripSummary && normalizeTripStatus(newStatus) === TripStatus.COMPLETED) {
        void this.postTripSummary.onTripCompleted(id).catch((err: unknown) => {
          const msg = err instanceof Error ? err.message : String(err);
          this.logger.warn(`[PostTripSummary] transition hook failed for trip ${id}: ${msg}`);
        });
      }

      // Trigger outcome calculation when trip completes
      if (this.tripOutcomeOrchestrator && normalizeTripStatus(newStatus) === TripStatus.COMPLETED) {
        try {
          this.tripOutcomeOrchestrator.handleStatusTransition(
            id,
            TripStatus.COMPLETED,
            { trip: updatedTrip },
          ).catch(err => {
            this.logger.error(`[TripOutcome] Failed to calculate outcome for trip ${id}: ${err}`);
          });
        } catch (outcomeError) {
          this.logger.warn(
            `[TripOutcome] Failed to trigger outcome calculation for trip ${id}: ${outcomeError}`,
          );
        }
      }
    }

    return await this.enrichTripData(updatedTrip);
  }

  /**
   * 数据增强：为行程添加统计信息和状态
   * 
   * 功能：
   * - 计算总天数、总活动数
   * - 判断行程状态（规划中/进行中/已完成）
   * - 计算预算使用情况
   * - Pipeline状态、活跃提醒数量、待完成任务数量
   * - 其他可扩展的统计信息
   * 
   * @param trip 原始行程数据
   * @returns 增强后的行程数据
   */
  private async enrichTripData(trip: any, userId?: string) {
    let totalItems = 0;
    let totalActivities = 0;
    let totalMeals = 0;
    let totalRest = 0;
    let totalTransit = 0;
    const now = new Date();

    // 遍历所有日期，统计信息
    trip.TripDay.forEach((day: any) => {
      totalItems += day.ItineraryItem.length;
      
      day.ItineraryItem.forEach((item: any) => {
        switch (item.type) {
          case 'ACTIVITY':
            totalActivities++;
            break;
          case 'MEAL_ANCHOR':
          case 'MEAL_FLOATING':
            totalMeals++;
            break;
          case 'REST':
            totalRest++;
            break;
          case 'TRANSIT':
            totalTransit++;
            break;
        }
      });
    });

    // 判断行程状态
    // 优先使用数据库中的 status，如果没有则根据日期自动计算
    let status: TripStatus;
    if (trip.status && Object.values(TripStatus).includes(trip.status as TripStatus)) {
      // 使用数据库中的状态
      status = trip.status as TripStatus;
    } else {
      // 根据日期自动计算状态
      if (trip.startDate && trip.endDate) {
        const startDate = new Date(trip.startDate);
        const endDate = new Date(trip.endDate);
        
        if (now < startDate) {
          status = TripStatus.PLANNING; // 规划中
        } else if (now >= startDate && now <= endDate) {
          status = TripStatus.IN_PROGRESS; // 进行中
        } else {
          status = TripStatus.COMPLETED; // 已完成
        }
      } else {
        status = TripStatus.PLANNING; // 默认状态
      }
    }

    // 计算已安排的天数（有活动的天数）
    const daysWithActivities = trip.TripDay.filter((day: any) => day.ItineraryItem.length > 0).length;

    // 计算预算使用情况（如果有预算配置）
    const budgetConfig = trip.budgetConfig as any;
    let budgetStats = null;
    if (budgetConfig) {
      // 这里可以扩展：根据已安排的活动估算费用
      // 目前只返回预算配置
      budgetStats = {
        total: budgetConfig.total,
        currency: budgetConfig.currency || 'CNY',
        daily_budget: budgetConfig.daily_budget,
        hotel_tier_recommendation: budgetConfig.hotel_tier_recommendation,
        // 可以添加：estimated_spent, remaining_budget 等
      };
    }

    // 获取额外的统计信息（异步）
    let activeAlertsCount = 0;
    let pendingTasksCount = 0;
    let pipelineStatus = null;

    try {
      // 直接查询决策日志，避免递归调用
      const decisionLogs = await this.decisionLogStorage.queryLogs({
        tripId: trip.id,
        limit: 50,
      });
      activeAlertsCount = decisionLogs.length;

      // 基于行程状态计算待完成任务数量（简化版，不调用getTasks避免递归）
      // 检查是否有需要设置的最大驾驶时长偏好
      if (!trip.pacingConfig || !(trip.pacingConfig as any).maxDrivingHours) {
        pendingTasksCount++;
      }

      // 检查是否有密集的行程
      const denseDays = trip.TripDay.filter((day: any) => day.ItineraryItem.length > 8);
      pendingTasksCount += denseDays.length;

      // 检查是否有安全相关的提醒
      const safetyAlerts = decisionLogs.filter(
        log => log.persona === 'ABU' && log.action === 'REJECT'
      );
      pendingTasksCount += safetyAlerts.length;

      // Pipeline状态（简化版）
      const tripMetadata = trip.metadata ?? {};
      const daysWithItems = trip.TripDay.filter((day: any) => day.ItineraryItem.length > 0).length;
      const totalDays = trip.TripDay.length;
      const routeEstablished = isRouteEstablishedForTrip(tripMetadata, totalItems);
      const scheduleReady = isExecutableScheduleReady(
        tripMetadata,
        totalItems,
        daysWithItems,
        totalDays,
      );

      pipelineStatus = {
        stages: [
          {
            id: '1',
            name: '明确旅行目标',
            status: trip.destination && trip.startDate && trip.endDate ? 'completed' : 'pending',
          },
          {
            id: '2',
            name: '判断路线是否成立',
            status: routeEstablished ? 'completed' : 'in-progress',
          },
          {
            id: '3',
            name: '生成可执行日程',
            status: scheduleReady
              ? 'completed'
              : totalItems > 0
                ? 'in-progress'
                : 'pending',
          },
          {
            id: '4',
            name: '风险评估与缓冲',
            status: safetyAlerts.length > 0 ? 'risk' : (totalItems > 0 ? 'in-progress' : 'pending'),
          },
          {
            id: '5',
            name: 'Plan B 备选系统',
            status: 'pending',
          },
          {
            id: '6',
            name: '行前准备清单',
            status: 'pending',
          },
        ],
      };
    } catch (error) {
      // 如果获取失败，不影响主流程，使用默认值
      console.error('Failed to enrich trip data:', error);
    }

    // 计算点赞和收藏状态
    const likeCount = trip._count?.TripLike || 0;
    const isLiked = userId ? (trip.TripLike?.length > 0) : false;
    const isCollected = userId ? (trip.TripCollection?.length > 0) : false;

    // 移除内部使用的字段，避免暴露给前端
    const { _count, TripLike: _tripLike, TripCollection: _tripCollection, ...tripData } = trip;

    // 转换 Place 数据为规范化格式
    // P0 必须返回：id, nameCN, nameEN, category, address, rating, metadata.openingHours
    // P1 推荐返回：metadata.price, metadata.priceLevel, metadata.tags
    // P2 可选返回：metadata.phone, metadata.website
    // 🆕 同时添加 crossDayInfo 跨天信息
    // 🆕 从 metadata.dayThemes 提取主题并添加到 TripDay
    // 🆕 从 note 字段解析 isRequired 标记
    const metadata = tripData.metadata as any || {};
    const dayThemes = metadata.dayThemes || {};

    // ===== 坐标补齐（用于路线距离/疲劳/节奏评估）=====
    // Trip 详情接口默认只 select Place.metadata 等字段，不含 PostGIS geography 的经纬度。
    // 这里批量从 Place.location 提取 lat/lng，并注入到返回的 Place 中：
    // - place.location: {lat,lng}（与 /places/:id 对齐）
    // - place.metadata.coordinates: {lat,lng}（与历史下游/评估脚本对齐）
    const placeIds: number[] = [];
    try {
      for (const day of tripData.TripDay ?? []) {
        for (const item of day?.ItineraryItem ?? []) {
          const pid = item?.Place?.id;
          if (typeof pid === 'number' && Number.isFinite(pid)) placeIds.push(pid);
        }
      }
    } catch {
      // ignore
    }
    const uniquePlaceIds = [...new Set(placeIds)].filter((n) => Number.isInteger(n) && n > 0);
    const locationMap = new Map<number, { lat: number; lng: number }>();
    if (uniquePlaceIds.length > 0) {
      try {
        const locationResults = await this.prisma.$queryRaw<Array<{ id: number; lat: number; lng: number }>>`
          SELECT
            id,
            ST_Y(location::geometry) as lat,
            ST_X(location::geometry) as lng
          FROM "Place"
          WHERE id = ANY(${uniquePlaceIds}::int[]) AND location IS NOT NULL
        `;
        for (const r of locationResults ?? []) {
          if (typeof r?.id !== 'number') continue;
          const lat = Number((r as any).lat);
          const lng = Number((r as any).lng);
          if (Number.isFinite(lat) && Number.isFinite(lng)) {
            locationMap.set(r.id, { lat, lng });
          }
        }
      } catch (e: any) {
        this.logger.debug(`[Trip] 批量提取 Place 坐标失败: ${e?.message ?? String(e)}`);
      }
    }
    
    const hikingDayCards = buildHikingDayCardsForTrip(tripData.metadata, tripData.TripDay ?? []);

    const transformedTripDays = await Promise.all(
      (tripData.TripDay ?? []).map(async (day: any, index: number) => {
      const dayNumber = index + 1;
      const theme = dayThemes[dayNumber] || day.theme || null;

      const checkoutItems =
        this.itineraryItemsService && day.id
          ? await this.itineraryItemsService.findCheckoutDisplayItemsForTripDay(day.id)
          : [];

      const mapItem = (item: any) => {
        const isRequired = item.note?.includes('[必游]') || false;
        const placeDto = item.Place ? toPlaceResponseDto(item.Place) : null;
        const syntheticPlace = !placeDto ? buildSyntheticPlaceForRestItineraryItem(item) : null;
        const resolvedPlace = placeDto ?? syntheticPlace;
        if (placeDto && typeof placeDto.id === 'number') {
          const coords = locationMap.get(placeDto.id);
          if (coords) {
            (placeDto as any).location = coords;
            const meta = ((placeDto as any).metadata ?? {}) as Record<string, unknown>;
            (placeDto as any).metadata = { ...meta, coordinates: coords };
          }
        }
        return {
          ...item,
          Place: resolvedPlace,
          placeName:
            resolvedPlace?.displayName ??
            resolvePlaceDisplayName(resolvedPlace) ??
            (typeof item.note === 'string' ? item.note.split('\n')[0]?.trim() : undefined),
          crossDayInfo: this.calculateCrossDayInfo(item, day.date),
          isRequired,
        };
      };

      const sortedItems = attachDisplaySortIndices(
        sortItineraryItemsForDayDisplay([
          ...checkoutItems.map(mapItem),
          ...(day.ItineraryItem ?? []).map(mapItem),
        ]),
      );

      return {
        ...day,
        theme: theme,
        ItineraryItem: sortedItems,
        hikingDayCard: hikingDayCards[index] ?? { kind: null },
      };
    }),
    );

    const tripContentMode = resolveTripContentMode(tripData.metadata, totalItems);
    const generationProgress = resolveEffectiveGenerationProgress(tripData.metadata, totalItems);
    const generatingItems = isTripGeneratingItems(tripData.metadata, totalItems);

    if (generationProgress && needsGenerationProgressBackfill(tripData.metadata)) {
      void this.backfillGenerationProgress(trip.id, tripData.metadata, generationProgress);
    }

    const revisionInfo = resolveTripRevision({
      updatedAt: trip.updatedAt ?? new Date(),
      metadata: trip.metadata,
    });

    return {
      ...tripData,
      TripDay: transformedTripDays,
      revision: revisionInfo.revision,
      revisionLabel: revisionInfo.revisionLabel,
      // 叙事主题 Banner（Trip 详情页顶部展示，需 NARRATIVE_THEME_V1=true）
      ...(isNarrativeThemeBannerEnabled()
        ? { narrativeThemeBanner: buildNarrativeThemeBanner(tripData.metadata) }
        : {}),
      // 添加状态字段（优先使用数据库中的状态）
      status: status,
      // 添加点赞和收藏字段
      isLiked,
      isCollected,
      likeCount,
      tripContentMode,
      generationProgress,
      generatingItems,
      hikingTrailSegments: readHikingTrailSegments(tripData.metadata),
      stats: {
        totalDays: trip.TripDay.length,
        daysWithActivities: daysWithActivities,
        totalItems: totalItems,
        totalActivities: totalActivities,
        totalMeals: totalMeals,
        totalRest: totalRest,
        totalTransit: totalTransit,
        progress: status, // 保持向后兼容，使用 status 值
        budgetStats: budgetStats,
      },
      pipelineStatus,
      activeAlertsCount,
      pendingTasksCount,
    };
  }

  private async backfillGenerationProgress(
    tripId: string,
    metadata: unknown,
    generationProgress: TripGenerationProgress,
  ): Promise<void> {
    try {
      const prev =
        metadata && typeof metadata === 'object' && !Array.isArray(metadata)
          ? (metadata as Record<string, unknown>)
          : {};
      await this.prisma.trip.update({
        where: { id: tripId },
        data: {
          metadata: {
            ...prev,
            generationProgress,
          } as any,
          updatedAt: new Date(),
        },
      });
      this.logger.debug(`[Trip] backfilled generationProgress trip=${tripId} stage=${generationProgress.stage}`);
    } catch (error: any) {
      this.logger.warn(`[Trip] generationProgress backfill failed trip=${tripId}: ${error?.message}`);
    }
  }

  /**
   * 🆕 计算行程项的跨天信息
   */
  private calculateCrossDayInfo(item: any, _tripDayDate: Date): {
    isCrossDay: boolean;
    crossDays: number;
    isCheckoutItem: boolean;
    displayMode: 'checkin' | 'checkout' | 'normal';
    timeLabels: { start: string; end: string };
  } {
    const startDate = DateTime.fromJSDate(new Date(item.startTime), { zone: 'utc' });
    const endDate = DateTime.fromJSDate(new Date(item.endTime), { zone: 'utc' });

    // 计算跨天数
    const startDay = startDate.startOf('day');
    const endDay = endDate.startOf('day');
    const crossDays = Math.floor(endDay.diff(startDay, 'days').days);

    const isCrossDay = crossDays > 0;
    const isCheckoutItem =
      item._isCheckoutItem === true ||
      item.crossDayInfo?.isCheckoutItem === true ||
      item.crossDayInfo?.displayMode === 'checkout';

    // 时间标签
    const timeLabels = this.getTimeLabelsForType(item.type, isCheckoutItem);

    return {
      isCrossDay,
      crossDays,
      isCheckoutItem,
      displayMode: isCheckoutItem ? 'checkout' : isCrossDay ? 'checkin' : 'normal',
      timeLabels,
    };
  }

  /**
   * 🆕 根据类型获取时间标签
   */
  private getTimeLabelsForType(itemType: string, isCheckoutItem: boolean): { start: string; end: string } {
    if (isCheckoutItem) {
      return { start: '退房时间', end: '' };
    }
    
    switch (itemType) {
      case 'REST':
        return { start: '入住时间', end: '退房时间' };
      case 'MEAL_ANCHOR':
      case 'MEAL_FLOATING':
        return { start: '用餐时间', end: '结束时间' };
      case 'TRANSIT':
        return { start: '出发时间', end: '到达时间' };
      default:
        return { start: '开始时间', end: '结束时间' };
    }
  }

  /**
   * 获取行程当前状态
   * 
   * @param tripId 行程 ID
   * @param nowISO 当前时间（ISO 格式，可选，默认使用服务器时间）
   * @returns 行程当前状态
   */
  async getTripState(tripId: string, nowISO?: string) {
    const trip = await this.prisma.trip.findUnique({
      where: { id: tripId },
      include: {
        TripDay: {
          include: {
            ItineraryItem: {
              include: {
                Place: true,
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

    const now = nowISO ? DateTime.fromISO(nowISO) : DateTime.now();
    const meta = (trip.metadata ?? {}) as Record<string, unknown>;
    const delayMinutes = typeof meta.inTripDelayMinutes === 'number' ? meta.inTripDelayMinutes : 0;
    const timezone =
      typeof meta.timezone === 'string' && meta.timezone.length > 0 ? meta.timezone : 'Asia/Tokyo';
    const tripStatus = normalizeTripStatus(trip.status);

    let currentDayId: string | null = null;
    let currentItemId: string | null = null;
    let nextStop: any = null;

    const { day: targetDay, effectiveNow } = resolveTripStateDayContext({
      tripDays: trip.TripDay,
      startDate: trip.startDate,
      endDate: trip.endDate,
      now,
      tripStatus,
    });

    if (targetDay) {
      currentDayId = targetDay.id;
      currentItemId = resolveCurrentItemId(targetDay.ItineraryItem, effectiveNow);
      const nextItem = pickNextItineraryItemForStop(
        targetDay.ItineraryItem,
        effectiveNow,
        currentItemId,
      );
      if (nextItem?.startTime) {
        nextStop = await this.buildNextStopInfo(
          nextItem,
          DateTime.fromJSDate(nextItem.startTime),
          delayMinutes,
        );
      }
    }

    return {
      currentDayId,
      currentItemId,
      nextStop,
      eta: nextStop?.estimatedArrivalTime ?? undefined,
      timezone,
      now: now.toISO(),
    };
  }

  /**
   * 构建 nextStop 信息，包含完整的 Place 信息
   */
  private async buildNextStopInfo(item: any, startTime: DateTime, delayMinutes = 0) {
    let place = item.Place as Place | null;
    if (!place && item.placeId) {
      place = await this.prisma.place.findUnique({ where: { id: item.placeId } });
    }

    if (!place) {
      const estimatedArrival = startTime.plus({ minutes: Math.max(0, delayMinutes) });
      return {
        itemId: item.id,
        placeId: item.placeId,
        placeName: '未知地点',
        startTime: startTime.toISO(),
        estimatedArrivalTime: estimatedArrival.toISO(),
      };
    }

    let postgisCoords: { lat: number; lng: number } | null = null;
    try {
      const locationResult = await this.prisma.$queryRaw<Array<{ lat: number; lng: number }>>`
        SELECT 
          ST_Y(location::geometry) as lat,
          ST_X(location::geometry) as lng
        FROM "Place"
        WHERE id = ${place.id} AND location IS NOT NULL
      `;
      if (locationResult.length > 0 && locationResult[0].lat != null && locationResult[0].lng != null) {
        postgisCoords = {
          lat: Number(locationResult[0].lat),
          lng: Number(locationResult[0].lng),
        };
      }
    } catch (error: any) {
      this.logger.debug(`[buildNextStopInfo] PostGIS 查询失败: Place ${place.id}, error: ${error.message}`);
    }

    const resolved = resolvePlaceCoordinates(place, postgisCoords);
    const effective = resolveEffectiveIcelandPlaceCoordinates({
      id: place.id,
      nameEN: place.nameEN,
      nameCN: place.nameCN,
      metadata: place.metadata,
      lat: resolved?.lat ?? null,
      lng: resolved?.lng ?? null,
    });
    const latitude = effective?.lat ?? resolved?.lat;
    const longitude = effective?.lng ?? resolved?.lng;

    // 提取营业时间
    const metadata = (place.metadata as any) || {};
    let businessHours: any = undefined;
    
    if (metadata.openingHours || metadata.opening_hours) {
      const openingHours = metadata.openingHours || metadata.opening_hours;
      const timezone = metadata.timezone || 'Asia/Tokyo';
      
      // 尝试获取今天的营业时间
      let todayHours: any = OpeningHoursUtil.getTodayHours(metadata, timezone);
      
      // 确保 todayHours 是字符串类型（双重保护）
      if (typeof todayHours !== 'string') {
        if (Array.isArray(todayHours) && todayHours.length > 0) {
          todayHours = typeof todayHours[0] === 'string' ? todayHours[0] : String(todayHours[0]);
        } else {
          todayHours = String(todayHours);
        }
      }
      
      // 再次确保是字符串类型（防止类型转换失败）
      todayHours = String(todayHours) as string;
      
      // 解析营业时间字符串（格式：HH:mm-HH:mm）
      // 使用 try-catch 保护，防止意外错误
      try {
        if (todayHours && todayHours !== 'Closed' && todayHours !== 'undefined' && todayHours !== 'null' && typeof todayHours === 'string') {
          const parts = todayHours.split('-');
          if (parts.length >= 2) {
            businessHours = {
              open: parts[0]?.trim(),
              close: parts[1]?.trim(),
              timezone: timezone,
              raw: openingHours, // 保留原始数据
            };
          } else {
            // 如果格式不正确，只保存原始数据
            businessHours = {
              timezone: timezone,
              raw: openingHours,
              formatted: todayHours, // 保存格式化后的字符串
            };
          }
        } else {
          // 如果无法解析，只保存原始数据
          businessHours = {
            timezone: timezone,
            raw: openingHours,
          };
        }
      } catch (error: any) {
        // 如果解析失败，只保存原始数据，不抛出错误
        this.logger.warn(`无法解析营业时间: ${error.message}, todayHours类型: ${typeof todayHours}, 值: ${todayHours}`);
        businessHours = {
          timezone: timezone,
          raw: openingHours,
        };
      }
    }

    // 记录坐标提取结果（用于调试）
    if (!latitude || !longitude) {
      const metadata = (place.metadata as any) || {};
      this.logger.warn(
        `[buildNextStopInfo] Place ${place.id} (${place.nameEN || place.nameCN}) 无法提取坐标: ` +
        `postgis=${!!postgisCoords}, ` +
        `metadata.lat=${metadata.lat || 'N/A'}, ` +
        `metadata.lng=${metadata.lng || 'N/A'}, ` +
        `metadata.coordinates=${metadata.coordinates ? JSON.stringify(metadata.coordinates) : 'N/A'}`
      );
    } else {
      this.logger.debug(`[buildNextStopInfo] Place ${place.id} 坐标提取成功: lat=${latitude}, lng=${longitude}`);
    }

    const estimatedArrival = startTime.plus({ minutes: Math.max(0, delayMinutes) });

    return {
      itemId: item.id,
      placeId: item.placeId,
      placeName: resolvePlaceDisplayName(place, { fallback: '未知地点' }),
      startTime: startTime.toISO(),
      estimatedArrivalTime: estimatedArrival.toISO(),
      Place: {
        id: place.id,
        nameEN: place.nameEN || undefined,
        nameCN: place.nameCN || undefined,
        latitude: latitude ?? null,        // 必需字段，确保字段存在（即使为 null）
        longitude: longitude ?? null,      // 必需字段，确保字段存在（即使为 null）
        address: place.address || undefined,
        category: place.category || undefined,
        rating: place.rating || undefined,
        businessHours: businessHours,
        metadata: place.metadata || undefined,
        // 兼容字段：如果标准字段不存在，提供兼容字段
        ...(latitude && longitude ? {} : {
          lat: latitude ?? null,
          lng: longitude ?? null,
        }),
      },
    };
  }

  /**
   * 获取指定日期的 Schedule
   * 
   * @param tripId 行程 ID
   * @param dateISO 日期（YYYY-MM-DD）
   * @returns Schedule 或 null
   */
  async getSchedule(tripId: string, dateISO: string) {
    const trip = await this.prisma.trip.findUnique({
      where: { id: tripId },
      include: {
        TripDay: true,
      },
    });

    if (!trip) {
      throw new NotFoundException(`行程 ID ${tripId} 不存在`);
    }

    const date = DateTime.fromISO(dateISO);
    const tripDay = trip.TripDay.find(day => {
      const dayDate = DateTime.fromJSDate(day.date);
      return dayDate.hasSame(date, 'day');
    });

    if (!tripDay) {
      return {
        date: dateISO,
        schedule: null,
        persisted: false,
      };
    }

    const schedule = await this.scheduleConverter.loadScheduleFromDatabase(
      tripDay.id,
      dateISO,
      resolveTripTimezone({ destination: trip.destination, metadata: trip.metadata }),
    );

    return {
      date: dateISO,
      schedule,
      persisted: schedule !== null,
    };
  }

  /**
   * 保存指定日期的 Schedule
   * 
   * @param tripId 行程 ID
   * @param dateISO 日期（YYYY-MM-DD）
   * @param schedule DayScheduleResult
   */
  async saveSchedule(tripId: string, dateISO: string, scheduleOrBody: DayScheduleResult | unknown) {
    // Agent Harness P0-1 W2 / C17：全日 rebuild 须走写链
    assertDirectEffectivePlanWriteBlocked('trips.saveSchedule');

    const schedule = this.scheduleConverter.normalizeDaySchedulePayload(scheduleOrBody, dateISO);

    const trip = await this.prisma.trip.findUnique({
      where: { id: tripId },
      include: {
        TripDay: true,
      },
    });

    if (!trip) {
      throw new NotFoundException(`行程 ID ${tripId} 不存在`);
    }

    const date = DateTime.fromISO(dateISO);
    let tripDay = trip.TripDay.find(day => {
      const dayDate = DateTime.fromJSDate(day.date);
      return dayDate.hasSame(date, 'day');
    });

    // 如果不存在该日期，创建一个新的 TripDay
    if (!tripDay) {
      tripDay = await this.prisma.tripDay.create({
        data: {
          id: randomUUID(),
          date: date.toJSDate(),
          tripId: trip.id,
        } as any,
      });
    }

    // 保存 Schedule 到数据库
    await this.scheduleConverter.saveScheduleToDatabase(
      tripId,
      tripDay.id,
      schedule,
      dateISO
    );

    await this.bumpTripRevisionIfAvailable(tripId);

    return {
      date: dateISO,
      schedule,
      persisted: true,
    };
  }

  /**
   * 获取操作历史
   * 
   * @param tripId 行程 ID
   * @param dateISO 日期（可选）
   * @returns 操作历史列表
   */
  async getActionHistory(tripId: string, dateISO?: string) {
    return this.actionHistory.getActionHistory(tripId, dateISO);
  }

  /**
   * 撤销操作
   * 
   * @param tripId 行程 ID
   * @param dateISO 日期
   * @returns 撤销后的 Schedule
   */
  async undoAction(tripId: string, dateISO: string) {
    return this.actionHistory.undoAction(tripId, dateISO);
  }

  /**
   * 重做操作
   * 
   * @param tripId 行程 ID
   * @param dateISO 日期
   * @returns 重做后的 Schedule
   */
  async redoAction(tripId: string, dateISO: string) {
    return this.actionHistory.redoAction(tripId, dateISO);
  }

  /**
   * 删除行程
   * 
   * 删除整个行程及其所有关联数据：
   * - TripDay（行程日期）
   * - ItineraryItem（行程项，通过 TripDay 级联删除）
   * - TripCollaborator（协作者）
   * - TripCollection（收藏）
   * - TripLike（点赞）
   * - TripShare（分享）
   * 
   * @param id 行程 ID
   * @param confirmText 确认文字（必须匹配目的地国家代码）
   * @returns 删除结果
   */
  async remove(id: string, confirmText: string) {
    // 验证行程存在
    const trip = await this.prisma.trip.findUnique({
      where: { id },
    });

    if (!trip) {
      throw new NotFoundException(`行程 ID ${id} 不存在`);
    }

    // 验证确认文字（必须匹配目的地国家代码，不区分大小写）
    if (confirmText.trim().toUpperCase() !== trip.destination.toUpperCase()) {
      throw new BadRequestException(
        `确认文字不匹配。请输入目的地国家代码"${trip.destination}"来确认删除。`
      );
    }

    // HikePlan 须在事务外删除：表不存在时 PG 会 abort 整个 transaction (25P02)
    await cascadeDeleteTripHikePlansWhenTableExists(this.prisma, id);

    // 使用事务删除，确保数据一致性
    // 注意：Prisma 中部分关联已设置了 onDelete: Cascade（如 TripCollaborator、TripCollection、TripLike、TripShare）
    // 但 TripDay、ItineraryItem 和 TripOfflinePack 没有设置级联删除，需要手动删除
    await this.prisma.$transaction(async (tx) => {
      // 1. 先获取所有 TripDay ID
      const tripDays = await tx.tripDay.findMany({
        where: { tripId: id },
        select: { id: true },
      });
      const tripDayIds = tripDays.map(day => day.id);

      // 2. 删除所有 ItineraryItem（如果存在 TripDay）
      if (tripDayIds.length > 0) {
        await tx.itineraryItem.deleteMany({
          where: { tripDayId: { in: tripDayIds } },
        });
      }

      // 3. 删除所有 TripDay
      await tx.tripDay.deleteMany({
        where: { tripId: id },
      });

      // 4. 删除 TripOfflinePack（如果存在）
      await tx.tripOfflinePack.deleteMany({
        where: { tripId: id },
      });

      // 5. 删除 Trip（其他已设置级联删除的关联会自动删除）
      await tx.trip.delete({
        where: { id },
      });
    });

    return { message: '行程删除成功' };
  }

  /**
   * 获取三人格提醒（Persona Alerts）— C 端 BFF 人话投影
   */
  async getPersonaAlerts(
    tripId: string,
    query: GetPersonaAlertsQueryDto = {},
  ): Promise<PersonaAlertDto[]> {
    const trip = await this.prisma.trip.findUnique({
      where: { id: tripId },
    });

    if (!trip) {
      throw new NotFoundException(`行程 ID ${tripId} 不存在`);
    }

    const audience = query.audience ?? 'user';
    const limit = query.limit ?? 20;

    const decisionLogs = await this.decisionLogStorage.queryLogs({
      tripId,
      limit: 50,
    });

    let feasibilityIssues: Awaited<
      ReturnType<FeasibilityReportService['getReport']>
    >['issues'] = [];
    const guardianNegotiation = extractGuardianNegotiationSnapshot(trip.metadata);
    const guardianPresentation = pickLatestGuardianPresentationFromLogs(decisionLogs);

    if (this.feasibilityReport) {
      try {
        const report = await this.feasibilityReport.getReport(tripId);
        feasibilityIssues = report.issues ?? [];
      } catch (err) {
        this.logger.debug(
          `Persona alerts: feasibility report skipped for ${tripId}: ${(err as Error).message}`,
        );
      }
    }

    return projectPersonaAlertsForAudience({
      decisionLogs,
      feasibilityIssues,
      guardianPresentation,
      guardianNegotiation,
      options: {
        audience,
        limit,
        phase: query.phase,
      },
    });
  }

  /**
   * 获取行程证据列表
   */
  async getEvidence(tripId: string, query: GetEvidenceQueryDto): Promise<EvidenceListResponseDto> {
    // 验证行程存在
    const trip = await this.prisma.trip.findUnique({
      where: { id: tripId },
      include: {
        TripDay: {
          include: {
            ItineraryItem: {
              include: {
                Place: true,
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

    const limit = query.limit || 50;
    const offset = query.offset || 0;

    // 从决策日志中提取证据引用
    const decisionLogs = await this.decisionLogStorage.queryLogs({
      tripId,
      limit: 100,
    });

    const evidenceItems: EvidenceItemDto[] = [];

    // 处理决策日志中的证据引用（过滤掉"无风险"的条目）
    for (const log of decisionLogs) {
      // 跳过"无风险"的条目
      if (this.isNoRiskEntry(log)) {
        continue;
      }

      if (log.evidenceRefs && log.evidenceRefs.length > 0) {
        for (const evidenceRef of log.evidenceRefs) {
          evidenceItems.push({
            id: `ev-${evidenceRef}-${log.timestamp}`,
            type: EvidenceType.OTHER,
            title: '决策证据',
            description: log.explanation,
            source: `决策日志 (${log.persona})`,
            timestamp: log.timestamp,
            metadata: {
              decisionSource: log.decisionSource,
              action: log.action,
              reasonCodes: log.reasonCodes,
              evidenceRef,
            },
          });
        }
      }
    }

    evidenceItems.push(...this.buildPlaceMetadataEvidenceItems(trip));

    // 应用类型过滤
    let filteredItems = evidenceItems;
    if (query.type) {
      filteredItems = filteredItems.filter(item => item.type === query.type);
    }

    // 排序：风险优先（closed > unknown > open），同级别按时间倒序
    filteredItems.sort((a, b) => {
      const riskOrder = (status: string) => (status === 'closed' ? 0 : status === 'unknown' ? 1 : 2);
      const aRisk = (a.metadata?.currentStatus as string) || '';
      const bRisk = (b.metadata?.currentStatus as string) || '';
      if (aRisk !== bRisk) return riskOrder(aRisk) - riskOrder(bRisk);
      return new Date(b.timestamp).getTime() - new Date(a.timestamp).getTime();
    });

    // 🆕 从Trip.metadata中读取证据状态并添加到证据项中
    const metadata = trip.metadata as any || {};
    const evidenceStatus = metadata.evidenceStatus || {};
    
    // 创建Place映射（用于证据增强）
    const placeMap = new Map<number, Place>();
    for (const tripDay of trip.TripDay) {
      for (const item of tripDay.ItineraryItem) {
        if (item.Place) {
          placeMap.set(item.Place.id, item.Place);
        }
      }
    }
    
    // 先添加状态信息
    const itemsWithStatus = filteredItems.map(item => {
      const statusInfo = evidenceStatus[item.id];
      if (statusInfo) {
        return {
          ...item,
          status: statusInfo.status as EvidenceStatus,
          userNote: statusInfo.userNote,
          acknowledgedAt: statusInfo.acknowledgedAt,
          resolvedAt: statusInfo.resolvedAt,
          dismissedAt: statusInfo.dismissedAt,
        };
      }
      return {
        ...item,
        status: EvidenceStatus.NEW, // 默认为NEW
      };
    });

    // 🆕 P0修复：增强证据项（添加freshness、confidence、qualityScore）
    const enrichedItems = await this.evidenceManagement.enrichEvidenceItems(
      itemsWithStatus,
      placeMap,
    );

    // 🆕 P1修复：应用过滤和排序
    const priority = query.priority || EvidencePriorityFilter.ALL;
    const groupBy = query.groupBy || EvidenceGroupBy.NONE;
    const sortBy = query.sortBy || EvidenceSortBy.TIME;
    
    // 获取当前天数（用于相关性排序）
    const currentDay = query.day;
    
    const filteredAndSorted = this.evidenceFiltering.filterAndSort(
      enrichedItems,
      priority,
      groupBy,
      sortBy,
      currentDay,
    );

    // 分页
    const total = filteredAndSorted.length;
    const paginatedItems = filteredAndSorted.slice(offset, offset + limit);

    return {
      items: paginatedItems,
      total,
      limit,
      offset,
    };
  }

  private buildPlaceMetadataEvidenceItems(trip: any): EvidenceItemDto[] {
    const items: EvidenceItemDto[] = [];
    const seen = new Set<string>();

    const addEvidence = (item: EvidenceItemDto) => {
      if (seen.has(item.id)) return;
      seen.add(item.id);
      items.push(item);
    };

    const getDayNumber = (tripDay: any, index: number) => {
      if (!trip.startDate || !tripDay.date) return index + 1;
      const start = DateTime.fromJSDate(new Date(trip.startDate)).startOf('day');
      const day = DateTime.fromJSDate(new Date(tripDay.date)).startOf('day');
      const diff = Math.round(day.diff(start, 'days').days);
      return Number.isFinite(diff) ? diff + 1 : index + 1;
    };

    for (let dayIndex = 0; dayIndex < (trip.TripDay || []).length; dayIndex++) {
      const tripDay = trip.TripDay[dayIndex];
      const dayNumber = getDayNumber(tripDay, dayIndex);

      for (const itineraryItem of tripDay.ItineraryItem || []) {
        const place = itineraryItem.Place;
        if (!place) continue;

        const metadata = place.metadata || {};
        const placeName = place.nameCN || place.nameEN || `POI ${place.id}`;
        const affectedItemIds = [itineraryItem.id].filter(Boolean);
        const common = {
          poiId: String(place.id),
          day: dayNumber,
          affectedItemIds,
        };

        const weather = metadata.weatherInfo || metadata.weather;
        if (weather) {
          const timestamp =
            metadata.weatherFetchedAt ||
            weather.lastUpdated ||
            weather.updatedAt ||
            new Date().toISOString();
          const condition = weather.condition || weather.text || weather.summary || '已获取天气信息';
          const temperature =
            typeof weather.temperature === 'number'
              ? `，温度 ${weather.temperature}°C`
              : '';
          const wind =
            typeof weather.windSpeed === 'number'
              ? `，风速 ${Math.round(weather.windSpeed * 10) / 10}`
              : '';
          const hasAlert = Array.isArray(weather.alerts) && weather.alerts.length > 0;
          addEvidence({
            id: `ev-place-${place.id}-weather-${itineraryItem.id}`,
            type: EvidenceType.WEATHER,
            title: `${placeName}天气`,
            description: `${condition}${temperature}${wind}`,
            source: weather.source || metadata.weatherSource || 'weather',
            timestamp,
            severity: hasAlert ? EvidenceSeverity.HIGH : EvidenceSeverity.LOW,
            metadata: {
              ...common,
              evidenceSource: 'place.metadata.weather',
              weather,
            },
            ...common,
          });
        }

        const roadStatus = metadata.roadStatus || metadata.road_status;
        if (roadStatus || typeof metadata.roadClosure === 'boolean') {
          const isClosed =
            roadStatus?.isOpen === false ||
            roadStatus?.status === 'closed' ||
            metadata.roadClosure === true;
          const timestamp =
            metadata.roadStatusFetchedAt ||
            roadStatus?.lastUpdated ||
            roadStatus?.updatedAt ||
            new Date().toISOString();
          addEvidence({
            id: `ev-place-${place.id}-road-${itineraryItem.id}`,
            type: EvidenceType.ROAD_CLOSURE,
            title: `${placeName}路况`,
            description: roadStatus?.reason || (isClosed ? '存在道路封闭风险' : '道路状态已获取'),
            source: roadStatus?.source || 'road.is',
            timestamp,
            severity: isClosed ? EvidenceSeverity.HIGH : EvidenceSeverity.LOW,
            metadata: {
              ...common,
              evidenceSource: 'place.metadata.roadStatus',
              currentStatus: isClosed ? 'closed' : 'open',
              roadStatus,
              roadClosure: metadata.roadClosure,
            },
            ...common,
          });
        }

        const openingHours =
          metadata.openingHours_v1 ||
          metadata.openingHours ||
          metadata.opening_hours ||
          metadata.basic?.openingHours ||
          metadata.visit_info?.opening_hours;
        if (openingHours) {
          const timestamp =
            metadata.openingHoursFetchedAt ||
            metadata.openingHoursUpdatedAt ||
            openingHours.updatedAt ||
            openingHours.lastUpdated ||
            new Date().toISOString();
          const source = openingHours.source || metadata.openingHoursSource || 'opening_hours';
          const todayHours =
            typeof openingHours === 'string'
              ? openingHours
              : openingHours.osmFormat ||
                openingHours.notes ||
                metadata.basic?.openingHours ||
                '营业时间已获取';
          addEvidence({
            id: `ev-place-${place.id}-opening-hours-${itineraryItem.id}`,
            type: EvidenceType.OPENING_HOURS,
            title: `${placeName}营业时间`,
            description: todayHours,
            source,
            timestamp,
            severity: EvidenceSeverity.LOW,
            metadata: {
              ...common,
              evidenceSource: 'place.metadata.openingHours',
              currentStatus: 'unknown',
              todayHours,
              openingHours,
              timezone: openingHours.timezone || metadata.timezone,
            },
            ...common,
          });
        }

        const booking =
          metadata.bookingConfirmation ||
          metadata.reservation ||
          metadata.booking ||
          metadata.booking_notes;
        if (booking) {
          const timestamp =
            booking.updatedAt ||
            booking.confirmedAt ||
            metadata.bookingFetchedAt ||
            new Date().toISOString();
          addEvidence({
            id: `ev-place-${place.id}-booking-${itineraryItem.id}`,
            type: EvidenceType.BOOKING,
            title: `${placeName}预订信息`,
            description:
              typeof booking === 'string'
                ? booking
                : booking.note || booking.status || '已获取预订相关信息',
            source: booking.source || 'booking',
            timestamp,
            severity: EvidenceSeverity.MEDIUM,
            metadata: {
              ...common,
              evidenceSource: 'place.metadata.booking',
              booking,
            },
            ...common,
          });
        }
      }
    }

    return items;
  }

  /**
   * 检查行程的证据完整性
   * 
   * @param tripId 行程ID
   * @returns 完整性检查结果
   */
  async checkEvidenceCompleteness(tripId: string): Promise<EvidenceCompletenessResult> {
    // 验证行程存在
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
        },
      },
    });

    if (!trip) {
      throw new NotFoundException(`行程 ID ${tripId} 不存在`);
    }

    // 收集所有Place
    const places: Place[] = [];
    for (const tripDay of trip.TripDay) {
      for (const item of tripDay.ItineraryItem) {
        if (item.Place) {
          places.push(item.Place);
        }
      }
    }

    // 获取现有证据
    const evidenceResult = await this.getEvidence(tripId, { limit: 1000 });
    const existingEvidence = evidenceResult.items.map(item => ({
      poiId: item.poiId,
      type: item.type,
    }));

    // 检查完整性
    return this.evidenceCompletenessChecker.checkCompleteness(
      places,
      existingEvidence,
      trip.startDate?.toISOString(),
    );
  }

  /**
   * 获取证据获取建议（智能触发）
   * 
   * @param tripId 行程ID
   * @returns 触发检查结果
   */
  async getEvidenceFetchSuggestions(tripId: string): Promise<EvidenceTriggerResult> {
    return this.evidenceTrigger.checkAndSuggest(tripId);
  }

  /**
   * 检查是否应该自动触发证据获取
   * 
   * @param tripId 行程ID
   * @param threshold 完整性阈值（默认0.7）
   * @returns 是否应该触发
   */
  async shouldAutoTriggerEvidenceFetch(tripId: string, threshold: number = 0.7): Promise<boolean> {
    return this.evidenceTrigger.shouldAutoTrigger(tripId, threshold);
  }

  /**
   * 验证用户是否有权限修改行程的证据
   */
  private async validateEvidenceAccess(tripId: string, userId?: string): Promise<void> {
    // 验证行程存在
    const trip = await this.prisma.trip.findUnique({
      where: { id: tripId },
      include: {
        TripCollaborator: true,
      },
    });

    if (!trip) {
      throw new NotFoundException(`行程 ID ${tripId} 不存在`);
    }

    // 如果没有提供userId，跳过权限检查（临时方案，用于测试）
    if (!userId) {
      this.logger.warn(`未提供userId，跳过权限检查（仅用于测试）`);
      return;
    }

    // 验证用户权限（只有OWNER和EDITOR可以修改）
    const collaborator = trip.TripCollaborator?.find(
      (c) => c.userId === userId && (c.role === 'OWNER' || c.role === 'EDITOR')
    );

    if (!collaborator) {
      throw new ForbiddenException('无权修改该行程的证据，只有OWNER和EDITOR可以修改');
    }
  }

  /**
   * 验证证据状态转换是否合法
   */
  private validateEvidenceStatusTransition(currentStatus: string | undefined, newStatus: EvidenceStatus): boolean {
    // 状态转换矩阵
    const ALLOWED_TRANSITIONS: Record<string, EvidenceStatus[]> = {
      [EvidenceStatus.NEW]: [EvidenceStatus.ACKNOWLEDGED, EvidenceStatus.RESOLVED, EvidenceStatus.DISMISSED],
      [EvidenceStatus.ACKNOWLEDGED]: [EvidenceStatus.RESOLVED, EvidenceStatus.DISMISSED],
      [EvidenceStatus.RESOLVED]: [], // 已解决不能回退
      [EvidenceStatus.DISMISSED]: [EvidenceStatus.ACKNOWLEDGED], // 可以重新关注
    };

    // 如果没有当前状态，默认为NEW
    const current = currentStatus || EvidenceStatus.NEW;
    const allowed = ALLOWED_TRANSITIONS[current] || [];
    return allowed.includes(newStatus);
  }

  /**
   * 获取证据状态（从Trip.metadata中读取）
   * 兼容旧格式 ev-place-{id}-opening-hours（现为 ev-place-{id}-day-{day}-opening-hours）
   */
  private getEvidenceStatus(trip: any, evidenceId: string): EvidenceStatus | undefined {
    const metadata = trip.metadata as any || {};
    const evidenceStatus = metadata.evidenceStatus || {};
    let status = evidenceStatus[evidenceId]?.status;
    if (!status && evidenceId.includes('-day-') && evidenceId.endsWith('-opening-hours')) {
      const legacyId = evidenceId.replace(/-day-\d+-opening-hours$/, '-opening-hours');
      status = evidenceStatus[legacyId]?.status;
    }
    return status;
  }

  /**
   * 更新证据状态（保存到Trip.metadata）
   */
  private async updateEvidenceStatus(
    tripId: string,
    evidenceId: string,
    status: EvidenceStatus,
    userNote?: string,
    userId?: string
  ): Promise<void> {
    const trip = await this.prisma.trip.findUnique({
      where: { id: tripId },
    });

    if (!trip) {
      throw new NotFoundException(`行程 ID ${tripId} 不存在`);
    }

    const metadata = trip.metadata as any || {};
    const evidenceStatus = metadata.evidenceStatus || {};
    const now = new Date().toISOString();

    // 更新证据状态
    evidenceStatus[evidenceId] = {
      status,
      updatedAt: now,
      ...(userNote && { userNote }),
      ...(status === EvidenceStatus.ACKNOWLEDGED && { acknowledgedAt: now }),
      ...(status === EvidenceStatus.RESOLVED && { resolvedAt: now }),
      ...(status === EvidenceStatus.DISMISSED && {
        dismissedAt: now,
        dismissedBy: userId,
      }),
    };

    // 更新Trip的metadata
    await this.prisma.trip.update({
      where: { id: tripId },
      data: {
        metadata: {
          ...metadata,
          evidenceStatus,
        } as any,
      },
    });
  }

  /**
   * 更新单个证据项的状态和备注
   */
  async updateEvidence(
    tripId: string,
    evidenceId: string,
    dto: UpdateEvidenceRequestDto,
    userId?: string
  ): Promise<UpdateEvidenceResponseDto> {
    // 1. 验证权限
    await this.validateEvidenceAccess(tripId, userId);

    // 2. 验证行程存在并获取当前证据状态
    const trip = await this.prisma.trip.findUnique({
      where: { id: tripId },
    });

    if (!trip) {
      throw new NotFoundException(`行程 ID ${tripId} 不存在`);
    }

    // 3. 验证证据是否存在（通过getEvidence方法检查）
    const evidenceQuery: GetEvidenceQueryDto = { limit: 1000 }; // 获取所有证据
    const evidenceList = await this.getEvidence(tripId, evidenceQuery);
    const evidence = evidenceList.items.find((item) => item.id === evidenceId);

    if (!evidence) {
      throw new NotFoundException(`证据项 ${evidenceId} 不存在`);
    }

    // 4. 验证状态转换（如果提供了status）
    if (dto.status) {
      const currentStatus = this.getEvidenceStatus(trip, evidenceId);
      if (!this.validateEvidenceStatusTransition(currentStatus, dto.status)) {
        throw new BadRequestException(
          `不允许的状态转换：${currentStatus || EvidenceStatus.NEW} → ${dto.status}`
        );
      }
    }

    // 5. 应用业务规则（自动设置时间戳）
    const status = dto.status || this.getEvidenceStatus(trip, evidenceId) || EvidenceStatus.NEW;

    // 6. 更新证据状态
    await this.updateEvidenceStatus(tripId, evidenceId, status, dto.userNote, userId);

    // 7. 返回更新结果
    return {
      evidenceId,
      status,
      updatedAt: new Date().toISOString(),
      userNote: dto.userNote,
    };
  }

  /**
   * 批量更新证据项的状态和备注
   */
  async batchUpdateEvidence(
    tripId: string,
    dto: BatchUpdateEvidenceRequestDto,
    userId?: string
  ): Promise<BatchUpdateEvidenceResponseDto> {
    // 1. 验证权限
    await this.validateEvidenceAccess(tripId, userId);

    // 2. 验证批量限制
    if (dto.updates.length > 100) {
      throw new BadRequestException('批量更新最多支持100个证据项');
    }

    // 3. 验证行程存在
    const trip = await this.prisma.trip.findUnique({
      where: { id: tripId },
    });

    if (!trip) {
      throw new NotFoundException(`行程 ID ${tripId} 不存在`);
    }

    // 4. 获取所有证据（用于验证evidenceId是否存在）
    const evidenceQuery: GetEvidenceQueryDto = { limit: 1000 };
    const evidenceList = await this.getEvidence(tripId, evidenceQuery);
    const evidenceMap = new Map(evidenceList.items.map((item) => [item.id, item]));

    // 5. 批量更新（使用事务）
    const errors: Array<{ evidenceId: string; error: string }> = [];
    let updatedCount = 0;

    for (const update of dto.updates) {
      try {
        // 验证证据是否存在
        if (!evidenceMap.has(update.evidenceId)) {
          errors.push({
            evidenceId: update.evidenceId,
            error: '证据项不存在',
          });
          continue;
        }

        // 验证状态转换（如果提供了status）
        if (update.status) {
          const currentStatus = this.getEvidenceStatus(trip, update.evidenceId);
          if (!this.validateEvidenceStatusTransition(currentStatus, update.status)) {
            errors.push({
              evidenceId: update.evidenceId,
              error: `不允许的状态转换：${currentStatus || EvidenceStatus.NEW} → ${update.status}`,
            });
            continue;
          }
        }

        // 更新证据状态
        const status = update.status || this.getEvidenceStatus(trip, update.evidenceId) || EvidenceStatus.NEW;
        await this.updateEvidenceStatus(tripId, update.evidenceId, status, update.userNote, userId);
        updatedCount++;
      } catch (error: any) {
        errors.push({
          evidenceId: update.evidenceId,
          error: error.message || '更新失败',
        });
      }
    }

    return {
      updated: updatedCount,
      failed: errors.length,
      errors: errors.length > 0 ? errors : undefined,
    };
  }

  /**
   * 获取关注队列
   */
  async getAttentionQueue(query: GetAttentionQueueQueryDto): Promise<AttentionQueueResponseDto> {
    const limit = query.limit || 20;
    const offset = query.offset || 0;

    const attentionItems: AttentionItemDto[] = [];

    // 如果指定了 tripId，只获取该行程的关注项
    if (query.tripId) {
      // 验证 tripId 格式（UUID 格式）
      const uuidRegex = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
      if (!uuidRegex.test(query.tripId)) {
        // tripId 格式不正确，返回空结果而不是抛出错误
        // 这可能是前端错误传递了路由路径（如 "attention-queue"）作为 tripId
        this.logger.warn(`无效的 tripId 格式: ${query.tripId}，返回空结果`);
        return {
          items: [],
          total: 0,
          limit,
          offset,
        };
      }
      
      try {
        const [alerts, tripRow] = await Promise.all([
          this.getPersonaAlerts(query.tripId),
          this.prisma.trip.findUnique({
            where: { id: query.tripId },
            select: { metadata: true },
          }),
        ]);

        attentionItems.push(...projectActiveSosAttentionItems(query.tripId, tripRow?.metadata));
      
        // 将 Persona Alerts 转换为 Attention Items
        for (const alert of alerts) {
          // 映射严重程度
          let severity: AttentionSeverity;
          if (alert.severity === AlertSeverity.WARNING) {
            severity = AttentionSeverity.HIGH;
          } else if (alert.severity === AlertSeverity.INFO) {
            severity = AttentionSeverity.MEDIUM;
          } else {
            severity = AttentionSeverity.LOW;
          }

          // 映射类型
          let type: AttentionItemType;
          if (alert.persona === PersonaType.ABU) {
            type = AttentionItemType.SAFETY_RISK;
          } else if (alert.persona === PersonaType.DR_DRE) {
            type = AttentionItemType.SCHEDULE_CONFLICT;
          } else {
            type = AttentionItemType.OTHER;
          }

          attentionItems.push({
            id: alert.id,
            type,
            title: alert.title,
            description: alert.message,
            tripId: query.tripId,
            severity,
            createdAt: alert.createdAt,
            status: AttentionStatus.NEW,
            metadata: {
              ...alert.metadata,
              persona: alert.persona,
            },
          });
        }
      } catch (error: any) {
        // 如果行程不存在，返回空结果而不是抛出错误
        // 这允许前端在 tripId 无效时仍然能正常显示（空列表）
        if (error instanceof NotFoundException) {
          this.logger.warn(`行程 ID ${query.tripId} 不存在，返回空关注队列`);
          return {
            items: [],
            total: 0,
            limit,
            offset,
          };
        }
        // 其他错误继续抛出
        throw error;
      }
    } else {
      // 全局关注队列：获取所有行程的 Persona Alerts
      // 这里简化处理，实际应该查询所有相关行程
      // 为了性能考虑，可以限制查询的行程数量
      const trips = await this.prisma.trip.findMany({
        take: 10, // 限制查询数量
        orderBy: { updatedAt: 'desc' },
        select: { id: true },
      });

      for (const trip of trips) {
        try {
          const alerts = await this.getPersonaAlerts(trip.id);
          
          for (const alert of alerts) {
            let severity: AttentionSeverity;
            if (alert.severity === AlertSeverity.WARNING) {
              severity = AttentionSeverity.HIGH;
            } else if (alert.severity === AlertSeverity.INFO) {
              severity = AttentionSeverity.MEDIUM;
            } else {
              severity = AttentionSeverity.LOW;
            }

            let type: AttentionItemType;
            if (alert.persona === PersonaType.ABU) {
              type = AttentionItemType.SAFETY_RISK;
            } else if (alert.persona === PersonaType.DR_DRE) {
              type = AttentionItemType.SCHEDULE_CONFLICT;
            } else {
              type = AttentionItemType.OTHER;
            }

            attentionItems.push({
              id: `${trip.id}-${alert.id}`,
              type,
              title: alert.title,
              description: alert.message,
              tripId: trip.id,
              severity,
              createdAt: alert.createdAt,
              status: AttentionStatus.NEW,
              metadata: {
                ...alert.metadata,
                persona: alert.persona,
                actionUrl: `/dashboard/trips/${trip.id}`,
              },
            });
          }
        } catch (error) {
          // 跳过错误的行程
          continue;
        }
      }
    }

    // 应用过滤
    let filteredItems = attentionItems;
    if (query.severity) {
      filteredItems = filteredItems.filter(item => item.severity === query.severity);
    }
    if (query.type) {
      filteredItems = filteredItems.filter(item => item.type === query.type);
    }

    // 排序（按严重程度和时间）
    const severityOrder: Record<AttentionSeverity, number> = {
      [AttentionSeverity.CRITICAL]: 4,
      [AttentionSeverity.HIGH]: 3,
      [AttentionSeverity.MEDIUM]: 2,
      [AttentionSeverity.LOW]: 1,
    };

    filteredItems.sort((a, b) => {
      const severityDiff = severityOrder[b.severity] - severityOrder[a.severity];
      if (severityDiff !== 0) return severityDiff;
      return new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime();
    });

    // 分页
    const total = filteredItems.length;
    const paginatedItems = filteredItems.slice(offset, offset + limit);

    return {
      items: paginatedItems,
      total,
      limit,
      offset,
    };
  }

  /**
   * 获取决策记录/透明日志（Decision Log）
   * 
   * @param tripId 行程 ID
   * @param limit 返回记录数量，默认 10
   * @param offset 偏移量，默认 0
   * @returns 决策记录响应
   */
  async getDecisionLog(tripId: string, limit: number = 10, offset: number = 0): Promise<DecisionLogResponseDto> {
    // 验证行程存在
    const trip = await this.prisma.trip.findUnique({
      where: { id: tripId },
    });

    if (!trip) {
      throw new NotFoundException(`行程 ID ${tripId} 不存在`);
    }

    // 查询所有决策日志（用于过滤和分页）
    const allLogs = await this.prisma.decisionLog.findMany({
      where: { tripId },
      orderBy: { timestamp: 'desc' },
    });

    // 过滤掉"无风险"的条目
    const filteredLogs = allLogs.filter(log => !this.isNoRiskEntry(log));

    // 计算过滤后的总数
    const total = filteredLogs.length;

    // 应用分页
    const paginatedLogs = filteredLogs.slice(offset, offset + limit);

    // 转换为DTO格式
    const items: DecisionLogEntryDto[] = paginatedLogs.map(log => ({
      id: log.id,
      date: log.timestamp.toISOString(),
      description: log.explanation,
      source: log.decisionSource as DecisionSource,
      persona: log.persona as any,
      action: log.action,
      metadata: {
        reasonCodes: log.reasonCodes,
        evidenceRefs: log.evidenceRefs,
        ...(log.metadata as Record<string, any> || {}),
      },
    }));

    return {
      items,
      total,
      limit,
      offset,
    };
  }

  /**
   * 根据目的地国家代码推断时区（用于营业时间计算）
   */
  private inferTimezoneFromDestination(destination: string | null | undefined): string | null {
    if (!destination) return null;
    const code = (destination || '').toUpperCase();
    const map: Record<string, string> = {
      IS: 'Atlantic/Reykjavik',
      NO: 'Europe/Oslo',
      JP: 'Asia/Tokyo',
      CN: 'Asia/Shanghai',
      US: 'America/New_York',
      GL: 'America/Godthab',
      SJ: 'Arctic/Longyearbyen',
      AR: 'America/Argentina/Buenos_Aires',
      TH: 'Asia/Bangkok',
      CH: 'Europe/Zurich',
      AT: 'Europe/Vienna',
      IT: 'Europe/Rome',
      FR: 'Europe/Paris',
    };
    return map[code] || null;
  }

  /**
   * 判断是否是"无风险"的条目（不需要显示的条目）
   * 
   * 无风险条目的特征：
   * - action 为 ALLOW
   * - explanation 包含"未发现"、"无需"、"均在可接受范围内"、"允许继续"等关键词
   */
  private isNoRiskEntry(log: any): boolean {
    // 如果不是 ALLOW 动作，肯定是有风险的
    if (log.action !== 'ALLOW') {
      return false;
    }

    const explanation = log.explanation || '';
    const noRiskKeywords = [
      '未发现',
      '无需',
      '均在可接受范围内',
      '允许继续',
      '无问题',
      '没有问题',
      '未发现问题',
    ];

    // 如果解释中包含"无风险"关键词，则认为是无风险条目
    return noRiskKeywords.some(keyword => explanation.includes(keyword));
  }

  /**
   * 幻觉检测、反馈回传等为编排/模型管线日志，不是「安全/节奏/修复」维度的可执行建议。
   */
  /**
   * 过滤不应出现在「优化建议」中的编排日志：
   * - 幻觉/反馈/NARRATE 等审计码
   * - OPTIMIZE（CGUS/Monte Carlo 内部效用与置信区间）
   * - POI_SELECTION（候选点筛选统计，多次运行还会重复）
   */
  private shouldOmitPersonaAlertForEndUser(log: {
    reasonCodes?: string[];
    metadata?: Record<string, unknown>;
  }): boolean {
    const codes = log.reasonCodes || [];
    const omitCodes = new Set([
      'HALLUCINATION_DETECTION',
      'FEEDBACK',
      'FEEDBACK_RECEIVED',
      'FEEDBACK_PERSIST',
      'NARRATE',
    ]);
    if (codes.some((c) => omitCodes.has(String(c).trim()))) {
      return true;
    }

    const internalPipelineSteps = new Set(['OPTIMIZE', 'POI_SELECTION']);
    if (codes.some((c) => internalPipelineSteps.has(String(c).trim()))) {
      return true;
    }

    const rr = log.metadata?.route_and_run as { step?: string } | undefined;
    const step = typeof rr?.step === 'string' ? rr.step.trim() : '';
    if (step && internalPipelineSteps.has(step)) {
      return true;
    }

    return false;
  }

  /**
   * 获取今日重点任务（Today's Tasks）
   * 
   * @param tripId 行程 ID
   * @returns 任务列表
   */
  async getTasks(
    tripId: string,
    preload?: {
      trip?: {
        id: string;
        pacingConfig?: unknown;
        TripDay: Array<{ ItineraryItem: unknown[] }>;
      };
      personaAlerts?: PersonaAlertDto[];
    },
  ): Promise<TaskDto[]> {
    const trip =
      preload?.trip ??
      (await this.prisma.trip.findUnique({
        where: { id: tripId },
        include: {
          TripDay: {
            include: {
              ItineraryItem: true,
            },
          },
        },
      }));

    if (!trip) {
      throw new NotFoundException(`行程 ID ${tripId} 不存在`);
    }

    const tasks: TaskDto[] = [];
    // 1. 检查是否设置了最大驾驶时长偏好
    if (!trip.pacingConfig || !(trip.pacingConfig as any).maxDrivingHours) {
      tasks.push({
        id: `task-preference-1`,
        text: '确认你能接受的最长驾驶时长',
        completed: false,
        priority: TaskPriority.HIGH,
        category: TaskCategory.PREFERENCE,
        route: `/dashboard/trips/${tripId}`,
        metadata: {
          relatedField: 'maxDrivingHours',
        },
      });
    }

    // 2. 检查是否有密集的行程需要调整
    for (let i = 0; i < trip.TripDay.length; i++) {
      const day = trip.TripDay[i];
      if (day.ItineraryItem.length > 8) {
        tasks.push({
          id: `task-schedule-${i + 1}`,
          text: `选择第 ${i + 1} 天住宿位置偏好`,
          completed: false,
          priority: TaskPriority.MEDIUM,
          category: TaskCategory.SCHEDULE,
          route: `/dashboard/trips/${tripId}/schedule`,
          metadata: {
            day: i + 1,
          },
        });
      }
    }

    // 3. 检查是否有安全相关的提醒
    const alerts = preload?.personaAlerts ?? (await this.getPersonaAlerts(tripId));
    const safetyAlerts = alerts.filter(a => a.persona === PersonaType.ABU && a.severity === AlertSeverity.WARNING);
    
    for (const alert of safetyAlerts) {
      if (alert.metadata?.roadId) {
        tasks.push({
          id: `task-safety-${alert.id}`,
          text: `查看 ${alert.metadata.roadId} 道路通行建议`,
          completed: false,
          priority: TaskPriority.HIGH,
          category: TaskCategory.SAFETY,
          route: `/dashboard/trips/${tripId}/decision`,
          metadata: {
            roadId: alert.metadata.roadId,
            alertId: alert.id,
          },
        });
      }
    }

    return tasks;
  }

  /**
   * 更新任务状态
   * 
   * @param tripId 行程 ID
   * @param taskId 任务 ID
   * @param completed 是否已完成
   * @returns 更新后的任务
   */
  async updateTaskStatus(tripId: string, taskId: string, completed: boolean): Promise<TaskDto> {
    // 验证行程存在
    const trip = await this.prisma.trip.findUnique({
      where: { id: tripId },
    });

    if (!trip) {
      throw new NotFoundException(`行程 ID ${tripId} 不存在`);
    }

    // 获取所有任务
    const tasks = await this.getTasks(tripId);
    const task = tasks.find(t => t.id === taskId);

    if (!task) {
      throw new NotFoundException(`任务 ID ${taskId} 不存在`);
    }

    // 更新任务状态
    task.completed = completed;

    // TODO: 如果需要持久化任务状态，可以在这里保存到数据库
    // 当前实现是基于实时计算，所以直接返回更新后的任务

    return task;
  }

  /**
   * 获取工作流 Pipeline 状态
   * 
   * @param tripId 行程 ID
   * @returns Pipeline 状态
   */
  async getPipelineStatus(
    tripId: string,
    preload?: {
      trip?: {
        id: string;
        destination?: string | null;
        startDate?: Date | null;
        endDate?: Date | null;
        createdAt?: Date | null;
        updatedAt?: Date | null;
        metadata?: unknown;
        TripDay: Array<{ ItineraryItem: unknown[] }>;
      };
      personaAlerts?: PersonaAlertDto[];
    },
  ): Promise<PipelineStatusResponseDto> {
    const trip =
      preload?.trip ??
      (await this.prisma.trip.findUnique({
        where: { id: tripId },
        include: {
          TripDay: {
            include: {
              ItineraryItem: true,
            },
          },
        },
      }));

    if (!trip) {
      throw new NotFoundException(`行程 ID ${tripId} 不存在`);
    }

    const stages: PipelineStageDto[] = [];
    stages.push({
      id: '1',
      name: '明确旅行目标',
      status: trip.destination && trip.startDate && trip.endDate ? PipelineStageStatus.COMPLETED : PipelineStageStatus.PENDING,
      completedAt: trip.createdAt?.toISOString(),
    });

    const totalItems = trip.TripDay.reduce((sum, day) => sum + day.ItineraryItem.length, 0);
    const daysWithItems = trip.TripDay.filter(day => day.ItineraryItem.length > 0).length;
    const totalDays = trip.TripDay.length;
    const metadata = (trip.metadata as Record<string, unknown>) || {};
    const stage3Completed = isExecutableScheduleReady(
      metadata,
      totalItems,
      daysWithItems,
      totalDays,
    );

    // 阶段2: 判断路线是否成立（含搭子徒步骨架、routeDirectionName）
    const stage2Completed = isRouteEstablishedForTrip(metadata, totalItems) || stage3Completed;
    stages.push({
      id: '2',
      name: '判断路线是否成立',
      status: stage2Completed ? PipelineStageStatus.COMPLETED : PipelineStageStatus.IN_PROGRESS,
      completedAt: stage2Completed ? trip.updatedAt?.toISOString() : undefined,
    });

    // 阶段3: 生成可执行日程
    let stage3Status = PipelineStageStatus.PENDING;
    let stage3Summary = '';

    const contentMode = resolveTripContentMode(metadata, totalItems);
    const effectiveProgress = resolveEffectiveGenerationProgress(metadata, totalItems);

    if (stage3Completed) {
      stage3Status = PipelineStageStatus.COMPLETED;
      if (contentMode === 'hiking_primary' || contentMode === 'mixed') {
        stage3Summary = effectiveProgress?.message ?? '徒步骨架已就绪';
      } else if (contentMode === 'skeleton_only') {
        stage3Summary = effectiveProgress?.message ?? '成团骨架已创建，待补充日程';
      } else if (totalItems > 0) {
        const denseDays = trip.TripDay.filter(day => day.ItineraryItem.length > 8);
        stage3Summary = `建议驾驶时长：每天 3–5 小时\n`;
        stage3Summary += `已安排活动：${totalItems} 个（${daysWithItems}/${totalDays} 天）\n`;
        stage3Summary += denseDays.length > 0
          ? `🚨 第 ${denseDays.map((_, idx) => trip.TripDay.indexOf(denseDays[idx]) + 1).join('、')} 天稍紧张`
          : `疲劳指数：中`;
      }
    } else if (totalItems > 0) {
      stage3Status = PipelineStageStatus.IN_PROGRESS;
      const denseDays = trip.TripDay.filter(day => day.ItineraryItem.length > 8);
      stage3Summary = `已安排活动：${totalItems} 个（${daysWithItems}/${totalDays} 天）`;
      if (denseDays.length > 0) {
        stage3Summary += `\n🚨 第 ${denseDays.map((_, idx) => trip.TripDay.indexOf(denseDays[idx]) + 1).join('、')} 天稍紧张`;
      }
    } else if (isTripGeneratingItems(metadata, totalItems)) {
      stage3Status = PipelineStageStatus.IN_PROGRESS;
      stage3Summary = effectiveProgress?.message ?? '正在生成行程项...';
    }
    
    stages.push({
      id: '3',
      name: '生成可执行日程',
      status: stage3Status,
      summary: stage3Summary || undefined,
      completedAt: stage3Status === PipelineStageStatus.COMPLETED ? trip.updatedAt?.toISOString() : undefined,
    });

    // 阶段4: 风险评估与缓冲
    let alerts: PersonaAlertDto[] = preload?.personaAlerts ?? [];
    if (!preload?.personaAlerts) {
      try {
        alerts = await this.getPersonaAlerts(tripId);
      } catch (error: any) {
        this.logger.warn(`获取 Persona Alerts 失败: ${error.message}`);
        alerts = [];
      }
    }
    const riskAlerts = alerts.filter(a => a.severity === AlertSeverity.WARNING);
    const stage4Completed = totalItems > 0 && riskAlerts.length === 0;
    const stage4Status = riskAlerts.length > 0
      ? PipelineStageStatus.RISK
      : totalItems > 0
        ? (stage4Completed ? PipelineStageStatus.COMPLETED : PipelineStageStatus.IN_PROGRESS)
        : PipelineStageStatus.PENDING;
    
    stages.push({
      id: '4',
      name: '风险评估与缓冲',
      status: stage4Status,
      completedAt: stage4Completed ? trip.updatedAt?.toISOString() : undefined,
    });

    // 阶段5: Plan B 备选系统（阶段3、4完成后视为已就绪）
    const stage5Completed = stage3Status === PipelineStageStatus.COMPLETED && stage4Status === PipelineStageStatus.COMPLETED;
    const planBFromMeta = !!(metadata.planAlternatives ?? metadata.planBReady);
    stages.push({
      id: '5',
      name: 'Plan B 备选系统',
      status: (stage5Completed || planBFromMeta) ? PipelineStageStatus.COMPLETED : PipelineStageStatus.PENDING,
      completedAt: (stage5Completed || planBFromMeta) ? trip.updatedAt?.toISOString() : undefined,
    });

    // 阶段6: 行前准备清单
    const now = new Date();
    const startDate = trip.startDate ? new Date(trip.startDate) : null;
    const daysUntilTrip = startDate
      ? Math.ceil((startDate.getTime() - now.getTime()) / (1000 * 60 * 60 * 24))
      : 0;
    
    let stage6Status = PipelineStageStatus.PENDING;
    if (daysUntilTrip <= 0) {
      stage6Status = PipelineStageStatus.COMPLETED; // 行程已开始，清单阶段结束
    } else if (daysUntilTrip <= 7) {
      // 7 天内：检查是否有准备度决策记录
      try {
        const readinessCount = await this.prisma.tripReadinessDecision.count({
          where: { tripId },
        });
        stage6Status = readinessCount > 0 ? PipelineStageStatus.COMPLETED : PipelineStageStatus.IN_PROGRESS;
      } catch {
        stage6Status = PipelineStageStatus.IN_PROGRESS;
      }
    }
    
    stages.push({
      id: '6',
      name: '行前准备清单',
      status: stage6Status,
      completedAt: stage6Status === PipelineStageStatus.COMPLETED ? trip.updatedAt?.toISOString() : undefined,
    });

    return { stages };
  }

  /**
   * 获取行程列表（管理接口）
   */
  async findAllAdmin(query: any) {
    const page = query.page || 1;
    const limit = Math.min(query.limit || 20, 100); // 最大100
    const skip = (page - 1) * limit;

    const where: any = {};

    // 状态筛选
    if (query.status) {
      where.status = query.status;
    }

    // 目的地筛选
    if (query.destination) {
      where.destination = query.destination.toUpperCase();
    }

    // 开始日期范围
    if (query.startDateFrom || query.startDateTo) {
      where.startDate = {};
      if (query.startDateFrom) {
        where.startDate.gte = new Date(query.startDateFrom);
      }
      if (query.startDateTo) {
        where.startDate.lte = new Date(query.startDateTo);
      }
    }

    // 创建时间范围
    if (query.createdAtFrom || query.createdAtTo) {
      where.createdAt = {};
      if (query.createdAtFrom) {
        where.createdAt.gte = new Date(query.createdAtFrom);
      }
      if (query.createdAtTo) {
        where.createdAt.lte = new Date(query.createdAtTo);
      }
    }

    // 用户筛选
    if (query.userId) {
      where.TripCollaborator = {
        some: {
          userId: query.userId,
          role: 'OWNER', // 只查询创建者
        },
      };
    }

    // 搜索功能（目的地、用户邮箱）
    if (query.search) {
      const searchTerm = query.search.toLowerCase();
      where.OR = [
        { destination: { contains: searchTerm, mode: 'insensitive' } },
        {
          TripCollaborator: {
            some: {
              role: 'OWNER',
              User: {
                OR: [
                  { email: { contains: searchTerm, mode: 'insensitive' } },
                  { displayName: { contains: searchTerm, mode: 'insensitive' } },
                ],
              },
            },
          },
        },
      ];
    }

    // 排序
    const sortBy = query.sortBy || 'createdAt';
    const sortOrder = query.sortOrder || 'desc';
    const orderBy: any = {};
    orderBy[sortBy] = sortOrder;

    // 查询数据
    const [trips, total] = await Promise.all([
      this.prisma.trip.findMany({
        where,
        skip,
        take: limit,
        orderBy,
        include: {
          TripCollaborator: {
            where: { role: 'OWNER' },
            take: 1,
          },
          TripDay: {
            include: {
              ItineraryItem: true,
            },
          },
          _count: {
            select: {
              TripDay: true,
              TripCollection: true,
              TripLike: true,
              TripShare: true,
              TripCollaborator: true,
            },
          },
        },
      }),
      this.prisma.trip.count({ where }),
    ]);

    // 格式化数据
    const items = trips.map((trip: any) => {
      const ownerCollaborator = trip.TripCollaborator?.[0] || null;
      // 如果需要用户信息，需要通过 userId 单独查询
      const owner = ownerCollaborator ? {
        userId: ownerCollaborator.userId,
        role: ownerCollaborator.role,
      } : null;
      const daysCount = trip._count.TripDay || 0;
      const itemsCount = trip.TripDay?.reduce((sum: number, day: any) => sum + (day.ItineraryItem?.length || 0), 0) || 0;

      return {
        id: trip.id,
        destination: trip.destination,
        startDate: trip.startDate,
        endDate: trip.endDate,
        status: trip.status,
        durationDays: Math.ceil((new Date(trip.endDate).getTime() - new Date(trip.startDate).getTime()) / (1000 * 60 * 60 * 24)) + 1,
        budgetConfig: trip.budgetConfig,
        pacingConfig: trip.pacingConfig,
        createdAt: trip.createdAt,
        updatedAt: trip.updatedAt,
        owner: owner ? {
          userId: owner.userId,
          role: owner.role,
        } : null,
        stats: {
          daysCount,
          itemsCount,
          collaboratorsCount: trip._count.TripCollaborator || 0,
          likesCount: trip._count.TripLike || 0,
          collectionsCount: trip._count.TripCollection || 0,
          sharesCount: trip._count.TripShare || 0,
        },
      };
    });

    return {
      items,
      pagination: {
        page,
        limit,
        total,
        totalPages: Math.ceil(total / limit),
      },
    };
  }

  /**
   * 获取行程统计信息（管理接口）
   */
  async getAdminStats(query: any) {
    const startDate = query.startDate ? new Date(query.startDate) : null;
    const endDate = query.endDate ? new Date(query.endDate) : null;
    const destination = query.destination?.toUpperCase();

    const where: any = {};
    if (startDate || endDate) {
      where.createdAt = {};
      if (startDate) where.createdAt.gte = startDate;
      if (endDate) where.createdAt.lte = endDate;
    }
    if (destination) {
      where.destination = destination;
    }

    // 总体统计
    const [totalTrips, planningTrips, inProgressTrips, completedTrips, cancelledTrips] = await Promise.all([
      this.prisma.trip.count({ where }),
      this.prisma.trip.count({ where: { ...where, status: 'PLANNING' } }),
      this.prisma.trip.count({ where: { ...where, status: 'IN_PROGRESS' } }),
      this.prisma.trip.count({ where: { ...where, status: 'COMPLETED' } }),
      this.prisma.trip.count({ where: { ...where, status: 'CANCELLED' } }),
    ]);

    // 按状态统计
    const byStatus = {
      PLANNING: { count: planningTrips, percentage: totalTrips > 0 ? (planningTrips / totalTrips) * 100 : 0 },
      IN_PROGRESS: { count: inProgressTrips, percentage: totalTrips > 0 ? (inProgressTrips / totalTrips) * 100 : 0 },
      COMPLETED: { count: completedTrips, percentage: totalTrips > 0 ? (completedTrips / totalTrips) * 100 : 0 },
      CANCELLED: { count: cancelledTrips, percentage: totalTrips > 0 ? (cancelledTrips / totalTrips) * 100 : 0 },
    };

    // 按目的地统计
    const destinations = await this.prisma.trip.groupBy({
      by: ['destination'],
      where,
      _count: true,
    });

    const byDestination: Record<string, { count: number; percentage: number }> = {};
    destinations.forEach((d) => {
      byDestination[d.destination] = {
        count: d._count,
        percentage: totalTrips > 0 ? (d._count / totalTrips) * 100 : 0,
      };
    });

    // 时间范围统计
    const now = new Date();
    const last7Days = new Date(now.getTime() - 7 * 24 * 60 * 60 * 1000);
    const last30Days = new Date(now.getTime() - 30 * 24 * 60 * 60 * 1000);
    const last90Days = new Date(now.getTime() - 90 * 24 * 60 * 60 * 1000);
    const lastYear = new Date(now.getTime() - 365 * 24 * 60 * 60 * 1000);

    const [last7DaysCount, last30DaysCount, last90DaysCount, lastYearCount] = await Promise.all([
      this.prisma.trip.count({ where: { ...where, createdAt: { gte: last7Days } } }),
      this.prisma.trip.count({ where: { ...where, createdAt: { gte: last30Days } } }),
      this.prisma.trip.count({ where: { ...where, createdAt: { gte: last90Days } } }),
      this.prisma.trip.count({ where: { ...where, createdAt: { gte: lastYear } } }),
    ]);

    const [last7DaysNew, last30DaysNew, last90DaysNew, lastYearNew] = await Promise.all([
      this.prisma.trip.count({ where: { createdAt: { gte: last7Days } } }),
      this.prisma.trip.count({ where: { createdAt: { gte: last30Days } } }),
      this.prisma.trip.count({ where: { createdAt: { gte: last90Days } } }),
      this.prisma.trip.count({ where: { createdAt: { gte: lastYear } } }),
    ]);

    // 用户参与度统计
    const tripsWithDays = await this.prisma.trip.findMany({
      where,
      include: {
        TripDay: {
          include: {
            ItineraryItem: true,
          },
        },
        TripCollaborator: true,
        TripLike: true,
        TripCollection: true,
        TripShare: true,
      },
    });

    const totalDays = tripsWithDays.reduce((sum, t) => sum + t.TripDay.length, 0);
    const totalItems = tripsWithDays.reduce((sum, t) => sum + t.TripDay.reduce((s, d) => s + d.ItineraryItem.length, 0), 0);
    const totalCollaborators = tripsWithDays.reduce((sum, t) => sum + t.TripCollaborator.length, 0);
    const totalLikes = tripsWithDays.reduce((sum, t) => sum + t.TripLike.length, 0);
    const totalCollections = tripsWithDays.reduce((sum, t) => sum + t.TripCollection.length, 0);
    const totalShares = tripsWithDays.reduce((sum, t) => sum + t.TripShare.length, 0);

    // 预算统计
    const tripsWithBudget = await this.prisma.trip.findMany({
      where,
      select: {
        budgetConfig: true,
      },
    });

    const budgets = tripsWithBudget
      .map((t: any) => t.budgetConfig?.totalBudget)
      .filter((b: any) => typeof b === 'number') as number[];

    const avgBudget = budgets.length > 0 ? budgets.reduce((a, b) => a + b, 0) / budgets.length : 0;
    const sortedBudgets = [...budgets].sort((a, b) => a - b);
    const medianBudget = sortedBudgets.length > 0
      ? sortedBudgets[Math.floor(sortedBudgets.length / 2)]
      : 0;
    const totalBudget = budgets.reduce((a, b) => a + b, 0);

    // 预算分布
    const budgetDistribution: Record<string, number> = {
      '0-5000': 0,
      '5000-10000': 0,
      '10000-20000': 0,
      '20000-50000': 0,
      '50000+': 0,
    };

    budgets.forEach((budget) => {
      if (budget < 5000) budgetDistribution['0-5000']++;
      else if (budget < 10000) budgetDistribution['5000-10000']++;
      else if (budget < 20000) budgetDistribution['10000-20000']++;
      else if (budget < 50000) budgetDistribution['20000-50000']++;
      else budgetDistribution['50000+']++;
    });

    return {
      summary: {
        totalTrips,
        activeTrips: inProgressTrips,
        completedTrips,
        cancelledTrips,
        planningTrips,
      },
      byStatus,
      byDestination,
      byTimeRange: {
        last7Days: { count: last7DaysCount, newTrips: last7DaysNew },
        last30Days: { count: last30DaysCount, newTrips: last30DaysNew },
        last90Days: { count: last90DaysCount, newTrips: last90DaysNew },
        lastYear: { count: lastYearCount, newTrips: lastYearNew },
      },
      engagement: {
        avgDaysPerTrip: totalTrips > 0 ? totalDays / totalTrips : 0,
        avgItemsPerTrip: totalTrips > 0 ? totalItems / totalTrips : 0,
        avgCollaboratorsPerTrip: totalTrips > 0 ? totalCollaborators / totalTrips : 0,
        totalLikes,
        totalCollections,
        totalShares,
      },
      budget: {
        avgBudget,
        medianBudget,
        totalBudget,
        budgetDistribution,
      },
      trends: {
        newTripsByMonth: [], // TODO: 实现按月统计
        completionRateByMonth: [], // TODO: 实现完成率统计
      },
    };
  }

  /**
   * 获取行程详情（管理视图）
   */
  async findOneAdmin(id: string) {
    const trip = await this.prisma.trip.findUnique({
      where: { id },
      include: {
        TripCollaborator: true,
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
                  },
                },
              },
              orderBy: {
                startTime: 'asc',
              },
            },
          },
          orderBy: {
            date: 'asc',
          },
        },
        TripLike: true,
        TripCollection: true,
        TripShare: true,
      },
    });

    if (!trip) {
      throw new NotFoundException(`行程 ID ${id} 不存在`);
    }

    const ownerCollaborator = trip.TripCollaborator.find((c: any) => c.role === 'OWNER') || null;

    // 如果需要用户详细信息，需要通过 userId 单独查询
    let ownerUser = null;
    if (ownerCollaborator && this.isValidUUID(ownerCollaborator.userId)) {
      try {
        ownerUser = await this.prisma.user.findUnique({
          where: { id: ownerCollaborator.userId },
          select: {
            id: true,
            email: true,
            displayName: true,
            avatarUrl: true,
          },
        });
      } catch (error) {
        // 忽略错误，继续处理
        this.logger.warn(`查询用户信息失败: ${ownerCollaborator.userId}`, error);
      }
    }

    // 获取所有协作用户信息
    const collaboratorUserIds = trip.TripCollaborator
      .filter((c: any) => c.role !== 'OWNER')
      .map((c: any) => c.userId)
      .filter((id: string) => this.isValidUUID(id));
    
    const collaboratorUsers = collaboratorUserIds.length > 0
      ? await this.prisma.user.findMany({
          where: { id: { in: collaboratorUserIds } },
          select: {
            id: true,
            email: true,
            displayName: true,
          },
        })
      : [];

    const collaboratorUserMap = new Map(collaboratorUsers.map(u => [u.id, u]));

    // 获取点赞和收藏用户信息
    const likeUserIds = trip.TripLike.map((l: any) => l.userId).filter((id: string) => this.isValidUUID(id));
    const collectionUserIds = trip.TripCollection.map((c: any) => c.userId).filter((id: string) => this.isValidUUID(id));
    const allUserIds = [...new Set([...likeUserIds, ...collectionUserIds])];
    
    const socialUsers = allUserIds.length > 0
      ? await this.prisma.user.findMany({
          where: { id: { in: allUserIds } },
          select: {
            id: true,
            email: true,
            displayName: true,
          },
        })
      : [];

    const socialUserMap = new Map(socialUsers.map(u => [u.id, u]));

    return {
      id: trip.id,
      destination: trip.destination,
      startDate: trip.startDate,
      endDate: trip.endDate,
      status: trip.status,
      durationDays: Math.ceil((new Date(trip.endDate).getTime() - new Date(trip.startDate).getTime()) / (1000 * 60 * 60 * 24)) + 1,
      budgetConfig: trip.budgetConfig,
      pacingConfig: trip.pacingConfig,
      metadata: trip.metadata,
      createdAt: trip.createdAt,
      updatedAt: trip.updatedAt,
      owner: ownerUser ? {
        userId: ownerUser.id,
        email: ownerUser.email,
        displayName: ownerUser.displayName,
        avatarUrl: ownerUser.avatarUrl,
      } : (ownerCollaborator ? {
        userId: ownerCollaborator.userId,
        role: ownerCollaborator.role,
      } : null),
      collaborators: trip.TripCollaborator
        .filter((c: any) => c.role !== 'OWNER')
        .map((c: any) => {
          const user = collaboratorUserMap.get(c.userId);
          return {
            userId: c.userId,
            email: user?.email || null,
            displayName: user?.displayName || null,
            role: c.role,
            createdAt: c.createdAt,
          };
        }),
      days: trip.TripDay.map((day: any) => ({
        id: day.id,
        date: day.date,
        itemsCount: day.ItineraryItem.length,
        items: day.ItineraryItem.map((item: any) => ({
          id: item.id,
          startTime: item.startTime,
          endTime: item.endTime,
          type: item.type,
          place: item.Place ? {
            id: item.Place.id,
            nameCN: item.Place.nameCN,
            nameEN: item.Place.nameEN,
            displayName: resolvePlaceDisplayName(item.Place, { fallback: '行程点' }),
            category: item.Place.category,
          } : null,
        })),
      })),
      stats: {
        daysCount: trip.TripDay.length,
        itemsCount: trip.TripDay.reduce((sum, d) => sum + d.ItineraryItem.length, 0),
        collaboratorsCount: trip.TripCollaborator.length,
        likesCount: trip.TripLike.length,
        collectionsCount: trip.TripCollection.length,
        sharesCount: trip.TripShare.length,
      },
      social: {
        likes: trip.TripLike.map((like: any) => {
          const user = socialUserMap.get(like.userId);
          return {
            userId: like.userId,
            email: user?.email || null,
            displayName: user?.displayName || null,
            createdAt: like.createdAt,
          };
        }),
        collections: trip.TripCollection.map((col: any) => {
          const user = socialUserMap.get(col.userId);
          return {
            userId: col.userId,
            email: user?.email || null,
            displayName: user?.displayName || null,
            createdAt: col.createdAt,
          };
        }),
        shares: trip.TripShare.map((share: any) => ({
          id: share.id,
          shareToken: share.shareToken,
          permission: share.permission,
          expiresAt: share.expiresAt,
          createdAt: share.createdAt,
        })),
      },
      decisionLogs: {
        total: 0, // TODO: 从决策日志表查询
        recent: [], // TODO: 获取最近的决策日志
      },
    };
  }

  /**
   * 批量操作
   */
  async batchOperation(body: any) {
    const { action, tripIds, params } = body;
    const errors: Array<{ tripId: string; error: string }> = [];
    let successCount = 0;

    for (const tripId of tripIds) {
      try {
        if (action === 'DELETE') {
          await this.remove(tripId, 'CONFIRM'); // 简化版，实际应该需要确认
          successCount++;
        } else if (action === 'UPDATE_STATUS' && params?.status) {
          await this.update(tripId, { status: params.status });
          successCount++;
        } else {
          errors.push({ tripId, error: '不支持的操作或缺少参数' });
        }
      } catch (error: any) {
        errors.push({ tripId, error: error.message || '操作失败' });
      }
    }

    return {
      action,
      total: tripIds.length,
      success: successCount,
      failed: errors.length,
      errors: errors.length > 0 ? errors : undefined,
    };
  }

  /**
   * 导出行程数据
   */
  async exportTrip(id: string, format: string = 'json') {
    const trip = await this.findOneAdmin(id);

    if (format === 'csv') {
      // TODO: 实现 CSV 导出
      throw new BadRequestException('CSV 导出功能暂未实现');
    }

    return trip;
  }

  /**
   * 生成默认行程名称
   * 格式：{目的地名称} {开始日期}
   * 例如：冰岛 2025-06-01
   */
  private async bumpTripRevisionIfAvailable(tripId: string): Promise<void> {
    if (!this.tripRevisionBump) return;
    try {
      await this.tripRevisionBump.bump(tripId);
    } catch (error) {
      this.logger.warn(
        `bump trip revision failed trip=${tripId}: ${(error as Error).message}`,
      );
    }
  }

  private generateDefaultTripName(params: {
    destination: string;
    startDate: string;
  }): string {
    const { generateDefaultTripName } = require('./utils/trip-name.util');
    return generateDefaultTripName(params);
  }

  /**
   * 从国家代码获取目的地名称（中文）
   */
  private getDestinationName(countryCode: string): string {
    const { getDestinationName } = require('./utils/trip-name.util');
    return getDestinationName(countryCode);
  }
}

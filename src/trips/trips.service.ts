// src/trips/trips.service.ts
import { Injectable, BadRequestException, NotFoundException, Logger } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import { CreateTripDto, MobilityTag } from './dto/create-trip.dto';
import { TripStatus } from './dto/trip-status.dto';
import { DateTime } from 'luxon';
import { PacingCalculator } from './utils/pacing-calculator.util';
import { FlightPriceService } from './services/flight-price.service';
import { ScheduleConverterService } from './services/schedule-converter.service';
import { ActionHistoryService } from './services/action-history.service';
import { DayScheduleResult } from '../planning-policy/interfaces/scheduler.interface';
import { randomUUID } from 'crypto';
import { PersonaAlertDto, PersonaType, AlertSeverity } from './dto/persona-alerts.dto';
import { DecisionLogEntryDto, DecisionLogResponseDto, DecisionSource } from './dto/decision-log.dto';
import { TaskDto, TaskPriority, TaskCategory } from './dto/tasks.dto';
import { PipelineStatusResponseDto, PipelineStageDto, PipelineStageStatus } from './dto/pipeline-status.dto';
import { DecisionLogStorageService } from './decision/services/decision-log-storage.service';
import { TripDraftService } from './services/trip-draft.service';
import { SaveTripDraftDto, TripDraftResponseDto } from './dto/trip-draft.dto';
import { EvidenceItemDto, EvidenceListResponseDto, GetEvidenceQueryDto, EvidenceType, EvidenceSeverity } from './dto/evidence.dto';
import { AttentionItemDto, AttentionQueueResponseDto, GetAttentionQueueQueryDto, AttentionItemType, AttentionSeverity, AttentionStatus } from './dto/attention-queue.dto';

@Injectable()
export class TripsService {
  private readonly logger = new Logger(TripsService.name);

  constructor(
    private prisma: PrismaService,
    private flightPriceService: FlightPriceService,
    private scheduleConverter: ScheduleConverterService,
    private actionHistory: ActionHistoryService,
    private decisionLogStorage: DecisionLogStorageService,
    private tripDraftService: TripDraftService
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
    const pacingConfig = PacingCalculator.calculateShortestStave(dto.travelers);

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
    
    const remainingBudget = dto.totalBudget - estimatedFlightVisa;
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
      currency: 'CNY', // 人民币
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
    // 步骤 4: 写入数据库 (使用 Transaction 保证原子性)
    // ============================================
    // 使用事务确保 Trip 和 TripDay 要么全部创建成功，要么全部失败
    return this.prisma.$transaction(async (tx) => {
      // A. 创建 Trip 主记录
      // 使用规范化后的国家代码
      const trip = await tx.trip.create({
        data: {
          id: randomUUID(),
          destination: normalizedCountryCode,
          startDate: start.toJSDate(),
          endDate: end.toJSDate(),
          status: dto.status || TripStatus.PLANNING, // 使用传入的状态或默认值
          budgetConfig: budgetConfig as any,
          pacingConfig: pacingConfig as any,
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
      }

      // 返回完整的 Trip 对象（包含关联的 TripDay）
      return {
        ...trip,
        days: tripDays,
      };
    });
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
              orderBy: { startTime: 'asc' }, // 按时间轴排序 (9点在10点前)
              include: {
                // 第三层：关联查询 Item 对应的地点详情 (如果有)
                Place: {
                  // 使用 include 返回所有字段，包括 nameEN
                  // 前端需要：name, nameEN, category, location, metadata, physicalMetadata, rating
                }
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
   * 验证状态转换是否合法
   * 
   * @param currentStatus 当前状态
   * @param newStatus 新状态
   * @throws BadRequestException 如果状态转换不合法
   */
  private validateStatusTransition(currentStatus: string | null, newStatus: TripStatus): void {
    // 如果当前状态为空，允许设置为任何状态
    if (!currentStatus) {
      return;
    }

    // 已取消的行程不能改回其他状态
    if (currentStatus === TripStatus.CANCELLED) {
      throw new BadRequestException('已取消的行程不能修改状态');
    }

    // 已完成的行程不能改回规划中或进行中
    if (currentStatus === TripStatus.COMPLETED && 
        (newStatus === TripStatus.PLANNING || newStatus === TripStatus.IN_PROGRESS)) {
      throw new BadRequestException('已完成的行程不能改回规划中或进行中状态');
    }

    // 其他状态转换都是允许的
  }

  /**
   * 更新行程基本信息
   * 
   * @param id 行程 ID
   * @param dto 更新数据（部分字段）
   * @returns 更新后的行程
   */
  async update(id: string, dto: Partial<CreateTripDto>) {
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

    if (dto.totalBudget !== undefined) {
      // 更新预算配置（存储在 budgetConfig 中）
      const existingBudgetConfig = (existingTrip.budgetConfig as any) || {};
      updateData.budgetConfig = {
        ...existingBudgetConfig,
        totalBudget: dto.totalBudget,
      };
    }

    if (dto.travelers !== undefined) {
      // 更新旅行者信息（存储在 metadata 中）
      const existingMetadata = (existingTrip.metadata as any) || {};
      updateData.metadata = {
        ...existingMetadata,
        travelers: dto.travelers,
      };
    }

    // 处理状态更新
    if (dto.status !== undefined) {
      // 验证状态转换
      this.validateStatusTransition(existingTrip.status, dto.status);
      updateData.status = dto.status;
    }

    // 如果更新了日期，需要重新计算天数
    if (dto.startDate || dto.endDate) {
      const startDate = dto.startDate ? new Date(dto.startDate) : existingTrip.startDate;
      const endDate = dto.endDate ? new Date(dto.endDate) : existingTrip.endDate;
      
      if (startDate > endDate) {
        throw new BadRequestException('开始日期不能晚于结束日期');
      }

      // 计算天数（包含开始和结束日期）
      const start = DateTime.fromJSDate(startDate).startOf('day');
      const end = DateTime.fromJSDate(endDate).startOf('day');
      const durationDays = end.diff(start, 'days').days + 1;

      updateData.durationDays = Math.round(durationDays);
    }

    // 执行更新
    const updatedTrip = await this.prisma.trip.update({
      where: { id },
      data: updateData,
      include: {
        TripDay: {
          include: {
            ItineraryItem: true,
          },
        },
      },
    });

    // 返回增强后的数据
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
      const hasRoute = trip.metadata && (trip.metadata as any).routeDirectionId;
      const totalItems = trip.TripDay.reduce((sum: number, day: any) => sum + day.ItineraryItem.length, 0);
      
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
            status: hasRoute ? 'completed' : 'in-progress',
          },
          {
            id: '3',
            name: '生成可执行日程',
            status: totalItems > 0 ? 'in-progress' : 'pending',
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
    const { _count, TripLike, TripCollection, ...tripData } = trip;

    return {
      ...tripData,
      // 添加状态字段（优先使用数据库中的状态）
      status: status,
      // 添加点赞和收藏字段
      isLiked,
      isCollected,
      likeCount,
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
    const timezone = 'Asia/Tokyo'; // TODO: 从 trip 或 city 获取时区

    // 找到当前日期
    let currentDayId: string | null = null;
    let currentItemId: string | null = null;
    let nextStop: any = null;

    for (const day of trip.TripDay) {
      const dayDate = DateTime.fromJSDate(day.date);
      if (dayDate.hasSame(now, 'day')) {
        currentDayId = day.id;

        // 找到当前或下一个行程项
        for (const item of day.ItineraryItem) {
          if (!item.startTime || !item.endTime) continue;

          const startTime = DateTime.fromJSDate(item.startTime);
          const endTime = DateTime.fromJSDate(item.endTime);

          if (now >= startTime && now <= endTime) {
            // 当前正在进行的项
            currentItemId = item.id;
          } else if (now < startTime && !nextStop) {
            // 下一个项
            nextStop = {
              itemId: item.id,
              placeId: item.placeId,
              placeName: item.Place?.nameEN || item.Place?.nameCN || '未知地点',
              startTime: startTime.toISO(),
              estimatedArrivalTime: startTime.toISO(),
            };
            break;
          }
        }

        // 如果没找到当前项，找第一个未来的项
        if (!currentItemId && !nextStop && day.ItineraryItem.length > 0) {
          const firstItem = day.ItineraryItem.find(item => item.startTime && DateTime.fromJSDate(item.startTime) > now);
          if (firstItem && firstItem.startTime) {
            const startTime = DateTime.fromJSDate(firstItem.startTime);
            nextStop = {
              itemId: firstItem.id,
              placeId: firstItem.placeId,
              placeName: firstItem.Place?.nameEN || firstItem.Place?.nameCN || '未知地点',
              startTime: startTime.toISO(),
              estimatedArrivalTime: startTime.toISO(),
            };
          }
        }

        break;
      }
    }

    return {
      currentDayId,
      currentItemId,
      nextStop,
      timezone,
      now: now.toISO(),
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
      dateISO
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
  async saveSchedule(tripId: string, dateISO: string, schedule: DayScheduleResult) {
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
   * 获取三人格提醒（Persona Alerts）
   * 
   * @param tripId 行程 ID
   * @returns 提醒列表
   */
  async getPersonaAlerts(tripId: string): Promise<PersonaAlertDto[]> {
    // 验证行程存在
    const trip = await this.prisma.trip.findUnique({
      where: { id: tripId },
    });

    if (!trip) {
      throw new NotFoundException(`行程 ID ${tripId} 不存在`);
    }

    // 从决策日志中获取最近的提醒
    const decisionLogs = await this.decisionLogStorage.queryLogs({
      tripId,
      limit: 50,
    });

    // 将决策日志转换为提醒
    const alerts: PersonaAlertDto[] = [];
    const personaNames: Record<string, string> = {
      ABU: 'Abu',
      DR_DRE: 'Dr.Dre',
      NEPTUNE: 'Neptune',
    };

    const personaTitles: Record<string, string> = {
      ABU: '安全守护者 Abu（北极熊 🐻‍❄️）',
      DR_DRE: '节奏设计师 Dr.Dre（牧羊犬 🐕）',
      NEPTUNE: '空间魔法师 Neptune（海獭 🦦）',
    };

    // 根据决策日志生成提醒（过滤掉"无风险"的条目）
    for (const log of decisionLogs) {
      // 跳过"无风险"的条目
      if (this.isNoRiskEntry(log)) {
        continue;
      }

      const severity = log.action === 'REJECT' ? AlertSeverity.WARNING :
                       log.action === 'ADJUST' ? AlertSeverity.INFO :
                       AlertSeverity.SUCCESS;

      // 生成提醒消息（基于explanation和reasonCodes）
      let message = log.explanation;
      if (log.reasonCodes && log.reasonCodes.length > 0) {
        message += `\n相关原因：${log.reasonCodes.join('、')}`;
      }

      alerts.push({
        id: `alert-${log.timestamp}`,
        persona: log.persona as PersonaType,
        name: personaNames[log.persona] || log.persona,
        title: personaTitles[log.persona] || log.persona,
        message,
        severity,
        createdAt: log.timestamp,
        metadata: {
          decisionSource: log.decisionSource,
          action: log.action,
          reasonCodes: log.reasonCodes,
        },
      });
    }

    // 如果没有决策日志，生成基于行程状态的默认提醒
    if (alerts.length === 0) {
      // 基于行程数据生成一些基础提醒
      const tripDays = await this.prisma.tripDay.findMany({
        where: { tripId },
        include: {
          ItineraryItem: {
            orderBy: { startTime: 'asc' },
          },
        },
        orderBy: { date: 'asc' },
      });

      // 检查是否有过于密集的行程
      for (let i = 0; i < tripDays.length; i++) {
        const day = tripDays[i];
        const itemCount = day.ItineraryItem.length;
        
        if (itemCount > 8) {
          alerts.push({
            id: `alert-day-${i + 1}`,
            persona: PersonaType.DR_DRE,
            name: personaNames[PersonaType.DR_DRE],
            title: personaTitles[PersonaType.DR_DRE],
            message: `第 ${i + 1} 天行程稍密集\n如果你想更轻松，我建议拆成两天\n这样会舒服一点`,
            severity: AlertSeverity.INFO,
            createdAt: new Date().toISOString(),
            metadata: {
              day: i + 1,
              suggestion: 'SPLIT_DAY',
              itemCount,
            },
          });
        }
      }
    }

    return alerts.sort((a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime());
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

    // 从行程项中提取 Place 的营业时间等证据
    let dayIndex = 0;
    for (const tripDay of trip.TripDay) {
      dayIndex++;
      
      // 如果指定了 day 过滤，跳过不匹配的天数
      if (query.day && dayIndex !== query.day) {
        continue;
      }

      for (const item of tripDay.ItineraryItem) {
        if (item.Place) {
          const place = item.Place;
          const metadata = place.metadata as any;

          // 提取营业时间证据
          if (metadata?.openingHours) {
            const openingHours = metadata.openingHours;
            const hoursStr = typeof openingHours === 'string' 
              ? openingHours 
              : JSON.stringify(openingHours);

            evidenceItems.push({
              id: `ev-place-${place.id}-opening-hours`,
              type: EvidenceType.OPENING_HOURS,
              title: '营业时间',
              description: `${place.nameCN || place.nameEN} 营业时间：${hoursStr}`,
              source: 'Google Places API',
              timestamp: place.updatedAt?.toISOString() || new Date().toISOString(),
              poiId: place.id.toString(),
              day: dayIndex,
              severity: EvidenceSeverity.LOW,
              metadata: {
                placeId: place.id,
                openingHours: metadata.openingHours,
              },
            });
          }

          // 提取评分证据
          if (place.rating) {
            evidenceItems.push({
              id: `ev-place-${place.id}-rating`,
              type: EvidenceType.OTHER,
              title: '地点评分',
              description: `${place.nameCN || place.nameEN} 评分：${place.rating}`,
              source: 'Google Places API',
              timestamp: place.updatedAt?.toISOString() || new Date().toISOString(),
              poiId: place.id.toString(),
              day: dayIndex,
              severity: EvidenceSeverity.LOW,
              metadata: {
                placeId: place.id,
                rating: place.rating,
              },
            });
          }
        }
      }
    }

    // 应用类型过滤
    let filteredItems = evidenceItems;
    if (query.type) {
      filteredItems = filteredItems.filter(item => item.type === query.type);
    }

    // 排序（按时间倒序）
    filteredItems.sort((a, b) => new Date(b.timestamp).getTime() - new Date(a.timestamp).getTime());

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
        const alerts = await this.getPersonaAlerts(query.tripId);
      
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
   * 获取今日重点任务（Today's Tasks）
   * 
   * @param tripId 行程 ID
   * @returns 任务列表
   */
  async getTasks(tripId: string): Promise<TaskDto[]> {
    // 验证行程存在
    const trip = await this.prisma.trip.findUnique({
      where: { id: tripId },
      include: {
        TripDay: {
          include: {
            ItineraryItem: true,
          },
        },
      },
    });

    if (!trip) {
      throw new NotFoundException(`行程 ID ${tripId} 不存在`);
    }

    const tasks: TaskDto[] = [];

    // 基于行程状态生成任务
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
    const alerts = await this.getPersonaAlerts(tripId);
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
  async getPipelineStatus(tripId: string): Promise<PipelineStatusResponseDto> {
    // 验证行程存在
    const trip = await this.prisma.trip.findUnique({
      where: { id: tripId },
      include: {
        TripDay: {
          include: {
            ItineraryItem: true,
          },
        },
      },
    });

    if (!trip) {
      throw new NotFoundException(`行程 ID ${tripId} 不存在`);
    }

    const stages: PipelineStageDto[] = [];

    // 阶段1: 明确旅行目标
    stages.push({
      id: '1',
      name: '明确旅行目标',
      status: trip.destination && trip.startDate && trip.endDate ? PipelineStageStatus.COMPLETED : PipelineStageStatus.PENDING,
      completedAt: trip.createdAt?.toISOString(),
    });

    // 阶段2: 判断路线是否成立
    const hasRoute = trip.metadata && (trip.metadata as any).routeDirectionId;
    stages.push({
      id: '2',
      name: '判断路线是否成立',
      status: hasRoute ? PipelineStageStatus.COMPLETED : PipelineStageStatus.IN_PROGRESS,
    });

    // 阶段3: 生成可执行日程
    const totalItems = trip.TripDay.reduce((sum, day) => sum + day.ItineraryItem.length, 0);
    const daysWithItems = trip.TripDay.filter(day => day.ItineraryItem.length > 0).length;
    
    let stage3Status = PipelineStageStatus.PENDING;
    let stage3Summary = '';
    
    if (totalItems > 0) {
      stage3Status = PipelineStageStatus.IN_PROGRESS;
      
      // 计算平均每日活动数
      const avgItemsPerDay = totalItems / trip.TripDay.length;
      
      // 检查是否有密集的行程
      const denseDays = trip.TripDay.filter(day => day.ItineraryItem.length > 8);
      
      stage3Summary = `建议驾驶时长：每天 3–5 小时\n`;
      stage3Summary += `已安排活动：${totalItems} 个（${daysWithItems}/${trip.TripDay.length} 天）\n`;
      
      if (denseDays.length > 0) {
        stage3Summary += `🚨 第 ${denseDays.map((_, idx) => trip.TripDay.indexOf(denseDays[idx]) + 1).join('、')} 天稍紧张`;
      } else {
        stage3Summary += `疲劳指数：中`;
      }
    }
    
    stages.push({
      id: '3',
      name: '生成可执行日程',
      status: stage3Status,
      summary: stage3Summary || undefined,
    });

    // 阶段4: 风险评估与缓冲
    const alerts = await this.getPersonaAlerts(tripId);
    const riskAlerts = alerts.filter(a => a.severity === AlertSeverity.WARNING);
    
    stages.push({
      id: '4',
      name: '风险评估与缓冲',
      status: riskAlerts.length > 0 ? PipelineStageStatus.RISK : (totalItems > 0 ? PipelineStageStatus.IN_PROGRESS : PipelineStageStatus.PENDING),
    });

    // 阶段5: Plan B 备选系统
    stages.push({
      id: '5',
      name: 'Plan B 备选系统',
      status: PipelineStageStatus.PENDING,
    });

    // 阶段6: 行前准备清单
    const now = new Date();
    const startDate = new Date(trip.startDate);
    const daysUntilTrip = Math.ceil((startDate.getTime() - now.getTime()) / (1000 * 60 * 60 * 24));
    
    stages.push({
      id: '6',
      name: '行前准备清单',
      status: daysUntilTrip <= 7 && daysUntilTrip > 0 ? PipelineStageStatus.IN_PROGRESS : PipelineStageStatus.PENDING,
    });

    return { stages };
  }
}

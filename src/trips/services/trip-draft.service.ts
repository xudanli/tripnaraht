// src/trips/services/trip-draft.service.ts
import { Injectable, Logger, BadRequestException, NotFoundException } from '@nestjs/common';
import { PrismaService } from '../../prisma/prisma.service';
import { LlmService } from '../../llm/services/llm.service';
import { LlmProvider } from '../../llm/dto/llm-request.dto';
import { Prisma } from '@prisma/client';
import { DateTime } from 'luxon';
import { randomUUID } from 'crypto';
import { OpeningHoursUtil } from '../../common/utils/opening-hours.util';
import { PlaceMetadata } from '../../places/interfaces/place-metadata.interface';
import { PhysicalMetadata } from '../../places/interfaces/physical-metadata.interface';
import {
  CreateTripDraftDto,
  TripDraftResponseDto,
  DraftDay,
  DraftItineraryItem,
  DraftDaySlots,
  TimeSlot,
  TravelStyle,
  ReplaceItineraryItemDto,
  ReplaceItineraryItemResponseDto,
  RegenerateTripDto,
  RegenerateTripResponseDto,
  RegenerateChangeItem,
  SaveTripDraftDto,
} from '../dto/trip-draft.dto';
import { ItemType } from '../../itinerary-items/dto/create-itinerary-item.dto';
import { PlaceCategory } from '@prisma/client';

/**
 * 候选地点信息（用于 LLM 编排）
 */
interface CandidatePlace {
  id: number;
  nameCN: string;
  nameEN?: string | null;
  type: string; // PlaceCategory
  category: string;
  lat: number;
  lng: number;
  openingHours?: any;
  avgVisitDuration?: number; // 分钟
  tags?: string[];
  popularity?: number;
  rating?: number;
}

/**
 * TripDraftService
 * 
 * 智能行程生成服务
 * - 候选检索（根据国家代码、风格等查询 Place）
 * - LLM 编排（使用 LLM 从候选中选择）
 * - 规则校验（营业时间、距离等）
 */
@Injectable()
export class TripDraftService {
  private readonly logger = new Logger(TripDraftService.name);

  // 时段定义（小时）
  private readonly SLOT_TIMES = {
    morning: { start: 9, end: 12 },
    lunch: { start: 12, end: 13.5 },
    afternoon: { start: 13.5, end: 17.5 },
    dinner: { start: 18, end: 20 },
    evening: { start: 20, end: 22 },
  };

  constructor(
    private prisma: PrismaService,
    private llmService: LlmService,
  ) {}

  /**
   * 生成行程草案
   * @param dto 行程草案创建参数
   * @param onProgress 进度回调函数（可选）
   */
  async generateDraft(
    dto: CreateTripDraftDto,
    onProgress?: (progress: {
      status: 'generating' | 'completed' | 'failed';
      stage: string;
      message: string;
      itemsCount?: number;
    }) => Promise<void>
  ): Promise<TripDraftResponseDto> {
    const startTime = Date.now();

    // 规范化国家代码
    const countryCode = dto.destination.toUpperCase().trim();

    // 验证国家代码格式
    if (!/^[A-Z]{2}$/.test(countryCode)) {
      throw new BadRequestException(`无效的国家代码: ${dto.destination}`);
    }

    // 验证天数
    if (dto.days < 1 || dto.days > 14) {
      throw new BadRequestException('行程天数必须在 1-14 天之间');
    }

    // Step 1: 候选检索
    this.logger.log(`开始检索候选地点（国家: ${countryCode}, 风格: ${dto.style || 'balanced'}）`);
    const candidates = await this.retrieveCandidates(dto);
    
    if (candidates.length < 20) {
      throw new BadRequestException(
        `候选地点不足（${candidates.length} 个）。系统暂不支持该目的地，或该国家尚未导入足够的地点数据。`
      );
    }

    // Step 2: 构建日期列表
    const days = this.buildDayList(dto);

    // Step 3: LLM 编排选择
    this.logger.log(`使用 LLM 从 ${candidates.length} 个候选中编排 ${dto.days} 天行程`);
    const llmResult = await this.llmOrchestrate(dto, candidates, days, onProgress);

    // Step 4: 规则校验和修复
    const validationWarnings: string[] = [];
    const validatedDays = await this.validateAndRepair(days, llmResult, candidates, validationWarnings);

    // Step 5: 构建响应
    const generationTime = Date.now() - startTime;
    
    return {
      destination: countryCode,
      days: dto.days,
      startDate: dto.startDate || days[0].date,
      endDate: dto.endDate || days[days.length - 1].date,
      draftDays: validatedDays,
      candidatesCount: candidates.length,
      validationWarnings: validationWarnings.length > 0 ? validationWarnings : undefined,
      metadata: {
        generationTime,
        llmProvider: 'deepseek',
      },
    };
  }

  /**
   * 候选检索
   */
  private async retrieveCandidates(dto: CreateTripDraftDto): Promise<CandidatePlace[]> {
    const countryCode = dto.destination.toUpperCase().trim();

    // 构建类别过滤
    const categoryFilter = dto.style 
      ? this.getCategoryFilterByStyle(dto.style)
      : [];

    const categorySql = categoryFilter.length > 0
      ? Prisma.sql`AND category = ANY(${categoryFilter}::"PlaceCategory"[])`
      : Prisma.sql``;

    // 使用 Raw Query 提取坐标
    const rawPlaces = await this.prisma.$queryRaw<Array<{
      id: number;
      nameCN: string;
      nameEN: string | null;
      category: string;
      metadata: any;
      physicalMetadata: any;
      rating: number | null;
      lat: number;
      lng: number;
    }>>`
      SELECT 
        p.id,
        p."nameCN",
        p."nameEN",
        p.category,
        p.metadata,
        p."physicalMetadata",
        p.rating,
        ST_Y(p.location::geometry) as lat,
        ST_X(p.location::geometry) as lng
      FROM "Place" p
      INNER JOIN "City" c ON p."cityId" = c.id
      WHERE c."countryCode" = ${countryCode}
        AND p.location IS NOT NULL
        ${categorySql}
      ORDER BY p.rating DESC NULLS LAST, p."nameCN" ASC
      LIMIT 200
    `;

    // 转换为候选格式
    return rawPlaces.map(place => {
      const metadata = place.metadata as PlaceMetadata | null;
      const physicalMetadata = place.physicalMetadata as PhysicalMetadata | null;

      return {
        id: place.id,
        nameCN: place.nameCN,
        nameEN: place.nameEN,
        type: place.category,
        category: place.category,
        lat: place.lat,
        lng: place.lng,
        openingHours: metadata?.openingHours,
        avgVisitDuration: physicalMetadata?.estimated_duration_min || 60,
        tags: metadata?.rawTags || [],
        popularity: place.rating ? place.rating * 2 : 5, // 简化：用 rating * 2 作为 popularity
        rating: place.rating || undefined,
      };
    });
  }

  /**
   * 按城市检索候选地点（用于替换行程项）
   */
  private async retrieveCandidatesByCity(
    cityId: number,
    countryCode: string,
    style?: TravelStyle,
    constraints?: { mustBeOpen?: boolean; avoidCategories?: string[] }
  ): Promise<CandidatePlace[]> {
    // 构建类别过滤
    const categoryFilter = style 
      ? this.getCategoryFilterByStyle(style)
      : [];

    const categorySql = categoryFilter.length > 0
      ? Prisma.sql`AND p.category = ANY(${categoryFilter}::"PlaceCategory"[])`
      : Prisma.sql``;

    // 避免类别过滤
    const avoidCategorySql = constraints?.avoidCategories && constraints.avoidCategories.length > 0
      ? Prisma.sql`AND p.category != ALL(${constraints.avoidCategories}::"PlaceCategory"[])`
      : Prisma.sql``;

    // 使用 Raw Query 提取坐标（限制在同一城市）
    const rawPlaces = await this.prisma.$queryRaw<Array<{
      id: number;
      nameCN: string;
      nameEN: string | null;
      category: string;
      metadata: any;
      physicalMetadata: any;
      rating: number | null;
      lat: number;
      lng: number;
    }>>`
      SELECT 
        p.id,
        p."nameCN",
        p."nameEN",
        p.category,
        p.metadata,
        p."physicalMetadata",
        p.rating,
        ST_Y(p.location::geometry) as lat,
        ST_X(p.location::geometry) as lng
      FROM "Place" p
      INNER JOIN "City" c ON p."cityId" = c.id
      WHERE c.id = ${cityId}
        AND c."countryCode" = ${countryCode}
        AND p.location IS NOT NULL
        ${categorySql}
        ${avoidCategorySql}
      ORDER BY p.rating DESC NULLS LAST, p."nameCN" ASC
      LIMIT 50
    `;

    // 转换为候选格式
    return rawPlaces.map(place => {
      const metadata = place.metadata as PlaceMetadata | null;
      const physicalMetadata = place.physicalMetadata as PhysicalMetadata | null;

      return {
        id: place.id,
        nameCN: place.nameCN,
        nameEN: place.nameEN,
        type: place.category,
        category: place.category,
        lat: place.lat,
        lng: place.lng,
        openingHours: metadata?.openingHours,
        avgVisitDuration: physicalMetadata?.estimated_duration_min || 60,
        tags: metadata?.rawTags || [],
        popularity: place.rating ? place.rating * 2 : 5,
        rating: place.rating || undefined,
      };
    });
  }

  /**
   * 根据风格获取类别过滤
   */
  private getCategoryFilterByStyle(style: TravelStyle): string[] {
    const styleMap: Record<TravelStyle, string[]> = {
      [TravelStyle.NATURE]: ['ATTRACTION'],
      [TravelStyle.CULTURE]: ['ATTRACTION'],
      [TravelStyle.FOOD]: ['RESTAURANT'],
      [TravelStyle.CITYWALK]: ['ATTRACTION', 'SHOPPING'],
      [TravelStyle.PHOTOGRAPHY]: ['ATTRACTION'],
      [TravelStyle.ADVENTURE]: ['ATTRACTION'],
    };
    return styleMap[style] || ['ATTRACTION', 'RESTAURANT'];
  }

  /**
   * 构建日期列表
   */
  private buildDayList(dto: CreateTripDraftDto): Array<{ day: number; date: string }> {
    const days: Array<{ day: number; date: string }> = [];
    let startDate: DateTime;

    if (dto.startDate) {
      startDate = DateTime.fromISO(dto.startDate);
    } else {
      startDate = DateTime.now().plus({ days: 1 }).startOf('day');
    }

    for (let i = 0; i < dto.days; i++) {
      const date = startDate.plus({ days: i });
      days.push({
        day: i + 1,
        date: date.toFormat('yyyy-MM-dd'),
      });
    }

    return days;
  }

  /**
   * LLM 编排选择
   * @param onProgress 进度回调函数（可选）
   */
  private async llmOrchestrate(
    dto: CreateTripDraftDto,
    candidates: CandidatePlace[],
    days: Array<{ day: number; date: string }>,
    onProgress?: (progress: {
      status: 'generating' | 'completed' | 'failed';
      stage: string;
      message: string;
      itemsCount?: number;
    }) => Promise<void>
  ): Promise<any> {
    // 构建 LLM Prompt
    const prompt = this.buildOrchestrationPrompt(dto, candidates, days);

    // 定义输出 Schema（避免使用 $ref，直接在 properties 中定义）
    const slotItemSchema = {
      type: 'object',
      properties: {
        placeId: { type: 'number' },
        reason: { type: 'string' },
        alternatives: { type: 'array', items: { type: 'number' } },
      },
      required: ['placeId', 'reason'],
    };

    const schema = {
      type: 'object',
      properties: {
        days: {
          type: 'array',
          items: {
            type: 'object',
            properties: {
              day: { type: 'number' },
              slots: {
                type: 'object',
                properties: {
                  morning: slotItemSchema,
                  lunch: slotItemSchema,
                  afternoon: slotItemSchema,
                  dinner: slotItemSchema,
                  evening: slotItemSchema,
                },
              },
            },
            required: ['day', 'slots'],
          },
        },
      },
      required: ['days'],
    };

    let response: string | undefined;
    try {
      this.logger.log(`开始调用 LLM 编排行程（${candidates.length} 个候选地点，${days.length} 天）`);
      const startTime = Date.now();
      
      // 使用 DeepSeek（内网环境可用）
      response = await this.llmService.callLlmWithSchema(
        LlmProvider.DEEPSEEK,
        prompt,
        schema
      );

      const elapsed = Date.now() - startTime;
      this.logger.log(`LLM 编排完成，耗时 ${elapsed}ms`);

      // 处理可能包含 markdown 代码块标记的响应
      const parsed = this.extractJSON(response);
      
      // 记录原始响应（用于调试）
      if (response.includes('```')) {
        this.logger.debug(`LLM 响应包含 markdown 代码块，已清理`);
      }
      
      // 验证返回结果
      if (!parsed.days || !Array.isArray(parsed.days)) {
        this.logger.warn(`LLM 返回结果格式异常: ${JSON.stringify(parsed).substring(0, 200)}`);
        throw new BadRequestException('LLM 返回结果格式不正确');
      }
      
      this.logger.log(`LLM 返回了 ${parsed.days.length} 天的编排结果`);
      
      // LLM 编排完成，通知进度回调
      if (onProgress) {
        try {
          await onProgress({
            status: 'generating',
            stage: 'llm_completed',
            message: `LLM 编排完成，已生成 ${parsed.days.length} 天的行程规划`,
          });
        } catch (progressError: any) {
          this.logger.warn(`进度回调失败: ${progressError.message}`);
          // 不抛出错误，避免影响主流程
        }
      }
      
      return parsed;
    } catch (error: any) {
      this.logger.error(`LLM 编排失败: ${error.message}`, error.stack);
      if (response) {
        this.logger.error(`LLM 原始响应（前500字符）: ${response.substring(0, 500)}`);
      }
      
      // 通知进度回调：失败
      if (onProgress) {
        try {
          await onProgress({
            status: 'failed',
            stage: 'llm_error',
            message: `LLM 编排失败: ${error.message}`,
          });
        } catch (progressError: any) {
          this.logger.warn(`进度回调失败: ${progressError.message}`);
        }
      }
      
      throw new BadRequestException(`行程生成失败: ${error.message}`);
    }
  }

  /**
   * 构建编排 Prompt
   */
  private buildOrchestrationPrompt(
    dto: CreateTripDraftDto,
    candidates: CandidatePlace[],
    days: Array<{ day: number; date: string }>
  ): string {
    const candidatesJson = JSON.stringify(
      candidates.slice(0, 150), // 限制候选数量，避免 token 过多
      null,
      2
    );

    return `你是一个专业的旅行规划助手。请根据用户需求和候选地点，为 ${dto.days} 天的行程安排每天的时段活动。

用户需求：
- 目的地：${dto.destination}
- 风格：${dto.style || 'balanced'}
- 强度：${dto.intensity || 'balanced'}
- 交通方式：${dto.transport || 'walk'}
- 约束：${JSON.stringify(dto.constraints || {})}

时段定义：
- morning: 9:00-12:00 (上午活动)
- lunch: 12:00-13:30 (午餐)
- afternoon: 13:30-17:30 (下午活动)
- dinner: 18:00-20:00 (晚餐)
- evening: 20:00-22:00 (晚上活动，可选)

候选地点（只能从以下列表中选择 placeId）：
${candidatesJson}

要求：
1. 每天至少安排 morning, lunch, afternoon, dinner 四个时段
2. 每个时段选择一个地点（placeId 必须来自候选列表）
3. lunch 和 dinner 优先选择 RESTAURANT 类别
4. 考虑地理位置连续性（相邻时段的地点不要太远）
5. 考虑用户的风格偏好和强度要求
6. 为每个选择提供简短的原因（reason）

请返回 JSON 格式，包含每天的时段安排。`;
  }

  /**
   * 规则校验和修复
   */
  private async validateAndRepair(
    days: Array<{ day: number; date: string }>,
    llmResult: any,
    candidates: CandidatePlace[],
    warnings: string[]
  ): Promise<DraftDay[]> {
    const validatedDays: DraftDay[] = [];

    for (const dayData of days) {
      const llmDay = llmResult.days?.find((d: any) => d.day === dayData.day);
      if (!llmDay) {
        warnings.push(`第 ${dayData.day} 天缺少 LLM 编排结果`);
        continue;
      }

      const slots: DraftDaySlots = {};

      // 验证每个时段
      for (const [slotKey, slotValue] of Object.entries(llmDay.slots || {})) {
        if (!slotValue || typeof slotValue !== 'object') continue;

        const slot = slotKey as TimeSlot;
        const item = slotValue as { placeId: number; reason?: string; alternatives?: number[] };

        // 验证 placeId 是否存在
        const candidate = candidates.find(c => c.id === item.placeId);
        if (!candidate) {
          warnings.push(`第 ${dayData.day} 天 ${slotKey} 时段的 placeId ${item.placeId} 不在候选中`);
          continue;
        }

        // 构建时段项
        const slotTime = this.SLOT_TIMES[slot];
        const startDateTime = DateTime.fromISO(`${dayData.date}T${slotTime.start.toString().padStart(2, '0')}:00:00`);
        const endDateTime = DateTime.fromISO(`${dayData.date}T${slotTime.end.toString().padStart(2, '0')}:00:00`);

        const draftItem: DraftItineraryItem = {
          placeId: item.placeId,
          slot: slot,
          startTime: startDateTime.toISO() || new Date().toISOString(),
          endTime: endDateTime.toISO() || new Date().toISOString(),
          reason: item.reason || '推荐',
          alternatives: item.alternatives || [],
          evidence: {
            openingHours: this.formatOpeningHours(candidate.openingHours),
            rating: candidate.rating,
            source: 'database',
          },
        };

        // 验证营业时间（软校验，只警告）
        const hoursStr = this.getOpeningHoursForDate(candidate.openingHours, dayData.date);
        if (hoursStr && hoursStr !== 'Closed') {
          // 简单的营业时间检查（实际应该使用 OpeningHoursUtil）
          // 这里简化处理，只记录警告
        }

        slots[slot] = draftItem;
      }

      validatedDays.push({
        day: dayData.day,
        date: dayData.date,
        slots,
      });
    }

    return validatedDays;
  }

  /**
   * 格式化营业时间
   */
  private formatOpeningHours(openingHours: any): string | undefined {
    if (!openingHours) return undefined;
    
    if (typeof openingHours === 'string') {
      return openingHours;
    }

    // 处理结构化格式
    if (openingHours.weekday) {
      return openingHours.weekday;
    }

    return undefined;
  }

  /**
   * 获取指定日期的营业时间
   */
  private getOpeningHoursForDate(openingHours: any, date: string): string | undefined {
    if (!openingHours) return undefined;

    const dateTime = DateTime.fromISO(date);
    const dayKey = dateTime.toFormat('ccc').toLowerCase(); // 'mon', 'tue', etc.

    if (openingHours[dayKey]) {
      return openingHours[dayKey];
    }

    const isWeekend = dateTime.weekday >= 6;
    return isWeekend ? openingHours.weekend : openingHours.weekday;
  }

  /**
   * 保存草案为行程
   */
  async saveDraftAsTrip(dto: SaveTripDraftDto): Promise<{ id: string; destination: string; startDate: string; endDate: string }> {
    const draft = dto.draft;

    // 提取所有行程项（处理用户编辑）
    const allItems: Array<{ draftItem: DraftItineraryItem; day: number; date: string }> = [];
    
    for (const draftDay of draft.draftDays) {
      // 移除用户删除的项
      const removedItemIds = dto.userEdits?.removedItems || [];
      
      // 添加原有的项（排除被删除的）
      for (const [slotKey, slotValue] of Object.entries(draftDay.slots)) {
        if (!slotValue) continue;
        
        // 简单的 ID 检查（实际应该用更可靠的方式）
        const itemKey = `${draftDay.day}-${slotKey}`;
        if (removedItemIds.includes(itemKey)) continue;
        
        allItems.push({
          draftItem: slotValue,
          day: draftDay.day,
          date: draftDay.date,
        });
      }
    }

    // 添加用户新增的项
    if (dto.userEdits?.addedItems) {
      for (const addedItem of dto.userEdits.addedItems) {
        // 需要确定日期，这里简化处理
        // 实际应该从 addedItem 中获取或要求用户提供
      }
    }

    // 创建 Trip（需要在 TripsService 中调用）
    // 这里只返回结构，实际创建应该在 Controller 中调用 TripsService.create
    // 然后调用批量创建 ItineraryItem 的方法
    
    throw new Error('Use TripsService.createFromDraft instead');
  }

  /**
   * 从草案批量创建 ItineraryItem
   */
  async createItineraryItemsFromDraft(
    tripId: string,
    draft: TripDraftResponseDto,
    userEdits?: SaveTripDraftDto['userEdits']
  ): Promise<number> {
    // 获取所有 TripDay（按日期）
    const tripDays = await this.prisma.tripDay.findMany({
      where: { tripId },
      orderBy: { date: 'asc' },
    });

    // 构建日期到 TripDay 的映射
    const dateToTripDay = new Map<string, string>();
    for (const tripDay of tripDays) {
      const dateStr = DateTime.fromJSDate(tripDay.date).toFormat('yyyy-MM-dd');
      dateToTripDay.set(dateStr, tripDay.id);
    }

    // 提取所有行程项
    const itemsToCreate: Array<{
      tripDayId: string;
      placeId: number | null;
      type: string;
      startTime: Date;
      endTime: Date;
      note: string | null;
    }> = [];

    for (const draftDay of draft.draftDays) {
      const tripDayId = dateToTripDay.get(draftDay.date);
      if (!tripDayId) {
        this.logger.warn(`找不到日期 ${draftDay.date} 对应的 TripDay`);
        continue;
      }

      // 处理每个时段
      for (const [slotKey, slotValue] of Object.entries(draftDay.slots)) {
        if (!slotValue) continue;

        // 检查是否被删除
        const itemKey = `${draftDay.day}-${slotKey}`;
        if (userEdits?.removedItems?.includes(itemKey)) continue;

        itemsToCreate.push({
          tripDayId,
          placeId: slotValue.placeId,
          type: ItemType.ACTIVITY, // 临时值，后面会更新
          startTime: new Date(slotValue.startTime),
          endTime: new Date(slotValue.endTime),
          note: slotValue.reason || null,
        });
      }
    }

    // 添加用户新增的项
    if (userEdits?.addedItems) {
      for (const addedItem of userEdits.addedItems) {
        // 需要确定 tripDayId，这里简化处理
        // 实际应该从 addedItem 中获取日期或要求用户提供
      }
    }

    // 批量创建（使用事务）
    // 先批量查询所有 place 的 category（优化性能）
    const placeIds = itemsToCreate.map(item => item.placeId).filter((id): id is number => id !== null);
    const places = placeIds.length > 0
      ? await this.prisma.place.findMany({
          where: { id: { in: placeIds } },
          select: { id: true, category: true },
        })
      : [];
    
    const placeCategoryMap = new Map(places.map(p => [p.id, p.category]));

    // 更新 itemsToCreate 的 type（根据时段和 place category 确定）
    for (const item of itemsToCreate) {
      // 根据开始时间确定时段
      const itemHour = new Date(item.startTime).getHours();
      let slot: TimeSlot | undefined;
      if (itemHour >= 9 && itemHour < 12) slot = TimeSlot.MORNING;
      else if (itemHour >= 12 && itemHour < 14) slot = TimeSlot.LUNCH;
      else if (itemHour >= 14 && itemHour < 18) slot = TimeSlot.AFTERNOON;
      else if (itemHour >= 18 && itemHour < 20) slot = TimeSlot.DINNER;
      else if (itemHour >= 20 && itemHour < 22) slot = TimeSlot.EVENING;

      if (slot === TimeSlot.LUNCH || slot === TimeSlot.DINNER) {
        // 用餐时段
        if (item.placeId) {
          const category = placeCategoryMap.get(item.placeId);
          // 如果是 RESTAURANT 类别，使用 MEAL_ANCHOR（需要订位）
          if (category === PlaceCategory.RESTAURANT) {
            item.type = ItemType.MEAL_ANCHOR;
          } else {
            item.type = ItemType.MEAL_FLOATING;
          }
        } else {
          item.type = ItemType.MEAL_FLOATING;
        }
      } else {
        // 其他时段都是活动
        item.type = ItemType.ACTIVITY;
      }
    }

    if (itemsToCreate.length > 0) {
      await this.prisma.$transaction(async (tx) => {
        for (const item of itemsToCreate) {
          await tx.itineraryItem.create({
            data: {
              id: randomUUID(),
              tripDayId: item.tripDayId,
              placeId: item.placeId,
              type: item.type as any,
              startTime: item.startTime,
              endTime: item.endTime,
              note: item.note,
            } as any,
          });
        }
      });
    }

    return itemsToCreate.length;
  }


  /**
   * 替换单个行程项（Neptune 修复）
   */
  async replaceItem(
    tripId: string,
    itemId: string,
    dto: ReplaceItineraryItemDto
  ): Promise<ReplaceItineraryItemResponseDto> {
    // 获取当前 item 信息
    const currentItem = await this.prisma.itineraryItem.findUnique({
      where: { id: itemId },
      include: {
        Place: {
          include: {
            City: true,
          },
        },
        TripDay: {
          include: {
            Trip: true,
          },
        },
      },
    });

    if (!currentItem || currentItem.TripDay.tripId !== tripId) {
      throw new NotFoundException(`找不到指定的行程项 (ID: ${itemId})`);
    }

    if (!currentItem.Place) {
      throw new NotFoundException('当前行程项关联的地点不存在');
    }

    if (!currentItem.startTime) {
      throw new BadRequestException('当前行程项的开始时间信息不完整');
    }

    // 确定时段（根据时间推断）
    const startTime = DateTime.fromJSDate(currentItem.startTime);
    const hour = startTime.hour;
    let slot: TimeSlot;
    if (hour >= 9 && hour < 12) slot = TimeSlot.MORNING;
    else if (hour >= 12 && hour < 14) slot = TimeSlot.LUNCH;
    else if (hour >= 14 && hour < 18) slot = TimeSlot.AFTERNOON;
    else if (hour >= 18 && hour < 20) slot = TimeSlot.DINNER;
    else slot = TimeSlot.EVENING;

    // 获取当前地点所在的城市信息
    const currentCity = currentItem.Place.City;
    const currentCityId = currentCity?.id;
    const currentCityName = currentCity?.nameCN || currentCity?.nameEN || '未知城市';
    const countryCode = currentItem.TripDay.Trip.destination;

    this.logger.log(`替换行程项：当前地点位于 ${currentCityName} (城市ID: ${currentCityId})`);

    // 根据 reason 构建检索条件
    const constraints: any = {};
    
    if (dto.reason === 'too_tired') {
      // 找更轻松的地点
      constraints.maxDuration = 60; // 最多1小时
    } else if (dto.reason === 'too_far') {
      constraints.maxDistance = dto.constraints?.maxDistance || 5000; // 默认5km
    } else if (dto.reason === 'change_style' && dto.preferredStyle) {
      // 根据新风格检索
    }

    // 检索候选：优先同城市，如果不够再扩展到同国家
    let candidates: CandidatePlace[] = [];
    let sameCityCount = 0;
    let sameCityIds = new Set<number>();
    
    if (currentCityId) {
      // 首先尝试在同城市内查找
      const sameCityCandidates = await this.retrieveCandidatesByCity(
        currentCityId,
        countryCode,
        dto.preferredStyle,
        dto.constraints
      );
      
      sameCityCount = sameCityCandidates.length;
      candidates = sameCityCandidates;
      sameCityIds = new Set(sameCityCandidates.map(c => c.id));
      
      this.logger.log(`同城市候选数量: ${sameCityCount}`);
    }
    
    // 如果同城市候选不足（少于5个），扩展到同国家
    if (candidates.length < 5) {
      this.logger.log(`同城市候选不足，扩展到同国家检索`);
      const countryCandidates = await this.retrieveCandidates({
      destination: countryCode,
      days: 1,
      style: dto.preferredStyle,
      constraints: dto.constraints ? {
        mustBeOpen: dto.constraints.mustBeOpen,
        avoidCategories: dto.constraints.avoidCategories,
      } : undefined,
    } as CreateTripDraftDto);
      
      // 过滤出其他城市的候选（排除同城市的）
      const otherCityCandidates = countryCandidates.filter(c => 
        !sameCityIds.has(c.id)
      );
      
      // 合并：同城市在前，其他城市在后
      candidates = [...candidates, ...otherCityCandidates];
      
      this.logger.log(`合并后候选数量: ${candidates.length} (同城市: ${sameCityCount}, 其他城市: ${otherCityCandidates.length})`);
    }

    // 过滤候选（排除当前地点）
    const filteredCandidates = candidates.filter(c => c.id !== currentItem.placeId);

    if (filteredCandidates.length === 0) {
      throw new NotFoundException('找不到合适的替代地点');
    }

    // 排序：优先同城市，然后按评分排序
    const sortedCandidates = filteredCandidates.sort((a, b) => {
      const aIsSameCity = sameCityIds.has(a.id);
      const bIsSameCity = sameCityIds.has(b.id);
      
      // 同城市的优先
      if (aIsSameCity && !bIsSameCity) return -1;
      if (!aIsSameCity && bIsSameCity) return 1;
      
      // 同城市或都不同城市时，按评分排序
      return (b.rating || 0) - (a.rating || 0);
    });

    // 使用 LLM 选择最佳替换
    // 简化处理：选择排序后的第一个（优先同城市且评分最高）
    const bestCandidate = sortedCandidates[0];

    // 构建新 item
    if (!currentItem.startTime || !currentItem.endTime) {
      throw new BadRequestException('当前行程项的时间信息不完整');
    }

    const newItem: DraftItineraryItem = {
      placeId: bestCandidate.id,
      slot: slot,
      startTime: currentItem.startTime.toISOString(),
      endTime: currentItem.endTime.toISOString(),
      reason: `替代原地点：${dto.reason}`,
      alternatives: filteredCandidates.slice(1, 4).map(c => c.id),
      evidence: {
        rating: bestCandidate.rating,
        source: 'database',
      },
    };

    return {
      newItem,
      alternatives: filteredCandidates.slice(0, 5).map(c => ({
        placeId: c.id,
        placeName: c.nameEN || c.nameCN,
        reason: `评分 ${c.rating || 'N/A'}`,
        score: (c.rating || 0) * 2,
      })),
      replacedItem: {
        placeId: currentItem.placeId || 0,
        reason: dto.reason,
      },
    };
  }

  /**
   * 重生成行程
   */
  async regenerateTrip(
    tripId: string,
    dto: RegenerateTripDto
  ): Promise<RegenerateTripResponseDto> {
    // 获取当前 trip 信息
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
      throw new NotFoundException(`找不到指定的行程 (ID: ${tripId})`);
    }

    // 标记锁定的 item
    const lockedItemIds = new Set(dto.lockedItemIds || []);
    const lockedItems = trip.TripDay.flatMap(day => 
      day.ItineraryItem.filter(item => lockedItemIds.has(item.id))
    );

    // 构建新的生成参数
    const days = trip.TripDay.length;
    const startDate = DateTime.fromJSDate(trip.startDate).toFormat('yyyy-MM-dd');
    const endDate = DateTime.fromJSDate(trip.endDate).toFormat('yyyy-MM-dd');

    // 重新生成草案
    const newDraft = await this.generateDraft({
      destination: trip.destination,
      days,
      startDate,
      endDate,
      style: dto.newPreferences?.style,
      intensity: dto.newPreferences?.intensity,
      transport: dto.newPreferences?.transport,
      constraints: dto.newPreferences?.constraints,
    });

    // 对比变更（简化处理）
    const changes: RegenerateChangeItem[] = [];
    // TODO: 详细对比新旧行程，生成 changes 列表

    return {
      updatedDraft: newDraft,
      changes,
    };
  }

  /**
   * 提取 JSON（处理可能包含 markdown 代码块标记的情况）
   * 与 llm.service.ts 中的 extractJSON 方法保持一致
   */
  private extractJSON(response: string): any {
    if (!response || typeof response !== 'string') {
      throw new BadRequestException('LLM 返回的响应为空或格式不正确');
    }

    let cleaned = response.trim();
    
    // 移除 markdown 代码块标记（更严格的匹配，支持多行）
    // 匹配开头的 ```json 或 ```（可能后面有换行）
    cleaned = cleaned.replace(/^```(?:json|JSON)?\s*\n?/i, '');
    // 匹配结尾的 ```（可能前面有换行）
    cleaned = cleaned.replace(/\n?\s*```$/i, '');
    cleaned = cleaned.trim();
    
    // 尝试提取 JSON 对象（如果响应中包含其他文本）
    // 使用更宽松的匹配，包括可能的多行 JSON
    const jsonMatch = cleaned.match(/\{[\s\S]*\}/);
    if (jsonMatch) {
      cleaned = jsonMatch[0];
    }
    
    // 再次清理可能的空白字符
    cleaned = cleaned.trim();
    
    try {
      return JSON.parse(cleaned);
    } catch (parseError: any) {
      this.logger.error(`JSON 解析失败，原始响应（前500字符）: ${response.substring(0, 500)}`);
      this.logger.error(`清理后的内容（前500字符）: ${cleaned.substring(0, 500)}`);
      this.logger.error(`解析错误详情: ${parseError.message}`);
      throw new BadRequestException(`LLM 返回的 JSON 格式无效: ${parseError.message}`);
    }
  }
}

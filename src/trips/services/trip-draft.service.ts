// src/trips/services/trip-draft.service.ts
import { Injectable, Logger, BadRequestException, NotFoundException } from '@nestjs/common';
import { PrismaService } from '../../prisma/prisma.service';
import { LlmService } from '../../llm/services/llm.service';
import { LlmProvider } from '../../llm/dto/llm-request.dto';
import { Prisma } from '@prisma/client';
import { DateTime } from 'luxon';
import { randomUUID } from 'crypto';
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
import type { ContextBlock } from '../../agent/context-engine/types/context-package.types';
import {
  CandidateRetrievalEngine,
  type CandidatePlace,
} from './candidate-retrieval.engine';
import { ConstraintEngine } from './constraint.engine';
import { RouteOptimizationEngine } from './route-optimization.engine';
import { FatiguePredictionEngine } from './fatigue-prediction.engine';
import { PacingEngine } from './pacing.engine';

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
    private candidateEngine: CandidateRetrievalEngine,
    private constraintEngine: ConstraintEngine,
    private routeEngine: RouteOptimizationEngine,
    private fatigueEngine: FatiguePredictionEngine,
    private pacingEngine: PacingEngine,
  ) {}

  /**
   * 生成行程草案
   * @param dto 行程草案创建参数
   * @param onProgress 进度回调函数（可选）
   * @param contextBlocks 上下文块（可选，来自 ContextEngineerService，用于增强 LLM 编排）
   */
  async generateDraft(
    dto: CreateTripDraftDto,
    onProgress?: (progress: {
      status: 'generating' | 'completed' | 'failed';
      stage: string;
      message: string;
      itemsCount?: number;
    }) => Promise<void>,
    contextBlocks?: ContextBlock[]
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

    // Step 1: 候选检索（TripNara 多阶段检索引擎）
    this.logger.log(`开始检索候选地点（国家: ${countryCode}, 风格: ${dto.style || 'balanced'}）`);
    const candidates = await this.candidateEngine.retrieve(dto);
    
    if (candidates.length < 20) {
      throw new BadRequestException(
        `候选地点不足（${candidates.length} 个）。系统暂不支持该目的地，或该国家尚未导入足够的地点数据。`
      );
    }

    // Step 2: 构建日期列表
    const days = this.buildDayList(dto);

    // Step 3: 编排选择（TripNara Phase 4+5: 算法优先，否则 LLM）
    let llmResult: { days: any[] };
    if (dto.useAlgorithmicDraft) {
      this.logger.log(`使用路径优化引擎编排 ${dto.days} 天行程（算法模式）`);
      if (onProgress) {
        await onProgress({
          status: 'generating',
          stage: 'route_optimization',
          message: '正在优化路线...',
        });
      }
      llmResult = await this.routeEngine.optimize(candidates, days, dto);
    } else {
      this.logger.log(`使用 LLM 从 ${candidates.length} 个候选中编排 ${dto.days} 天行程${contextBlocks?.length ? `（含 ${contextBlocks.length} 个上下文块）` : ''}`);
      llmResult = await this.llmOrchestrate(dto, candidates, days, onProgress, contextBlocks);
    }

    // Step 4: 规则校验和修复
    const validationWarnings: string[] = [];
    const validatedDays = await this.validateAndRepair(days, llmResult, candidates, validationWarnings, {
      intensity: dto.intensity,
      transport: dto.transport,
    });

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
        llmProvider: dto.useAlgorithmicDraft ? 'algorithm' : 'deepseek',
      },
    };
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
   * 获取替换项的路线锚点（前后行程项的中点），用于「距离太远」时筛选更近的替代
   */
  private async getRouteAnchorForItem(
    tripDayId: string,
    itemId: string
  ): Promise<{ lat: number; lng: number } | null> {
    const items = await this.prisma.$queryRaw<Array<{ id: string; placeId: number | null }>>`
      SELECT ii.id, ii."placeId"
      FROM "ItineraryItem" ii
      WHERE ii."tripDayId" = ${tripDayId}
      ORDER BY ii."startTime" ASC NULLS LAST
    `;
    const idx = items.findIndex(i => i.id === itemId);
    if (idx < 0) return null;

    const prevPlaceId = idx > 0 ? items[idx - 1].placeId : null;
    const nextPlaceId = idx < items.length - 1 ? items[idx + 1].placeId : null;
    const placeIds = [prevPlaceId, nextPlaceId].filter((id): id is number => id != null);
    if (placeIds.length === 0) return null;

    const coords = await this.prisma.$queryRaw<Array<{ lat: number; lng: number }>>`
      SELECT ST_Y(location::geometry)::float as lat, ST_X(location::geometry)::float as lng
      FROM "Place"
      WHERE id IN (${Prisma.join(placeIds)}) AND location IS NOT NULL
    `;
    if (coords.length === 0) return null;
    const lat = coords.reduce((s, c) => s + c.lat, 0) / coords.length;
    const lng = coords.reduce((s, c) => s + c.lng, 0) / coords.length;
    return { lat, lng };
  }

  /** Haversine 距离（米） */
  private haversineMeters(lat1: number, lng1: number, lat2: number, lng2: number): number {
    const R = 6371000;
    const dLat = ((lat2 - lat1) * Math.PI) / 180;
    const dLng = ((lng2 - lng1) * Math.PI) / 180;
    const a =
      Math.sin(dLat / 2) ** 2 +
      Math.cos((lat1 * Math.PI) / 180) *
        Math.cos((lat2 * Math.PI) / 180) *
        Math.sin(dLng / 2) ** 2;
    const c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
    return R * c;
  }

  /**
   * 根据风格获取类别过滤
   * 
   * 注意：默认情况下包含 ATTRACTION 和 RESTAURANT，但不包含 HOTEL
   * HOTEL 需要单独处理（因为酒店是住宿地点，不是游玩地点）
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
    // 默认包含景点和餐厅，但不包含酒店（酒店需要单独推荐）
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
    }) => Promise<void>,
    contextBlocks?: ContextBlock[]
  ): Promise<any> {
    // 构建 LLM Prompt（可选注入 Context 上下文）
    const prompt = this.buildOrchestrationPrompt(dto, candidates, days, contextBlocks);

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
   * @param contextBlocks 可选，来自 ContextEngineerService 的上下文块（签证、道路规则、安全、天气等）
   */
  private buildOrchestrationPrompt(
    dto: CreateTripDraftDto,
    candidates: CandidatePlace[],
    days: Array<{ day: number; date: string }>,
    contextBlocks?: ContextBlock[]
  ): string {
    const candidatesJson = JSON.stringify(
      candidates.slice(0, 150), // 限制候选数量，避免 token 过多
      null,
      2
    );

    const contextSection =
      contextBlocks && contextBlocks.length > 0
        ? `## 目的地相关上下文（供参考）
${contextBlocks
  .filter((b) => b.visibility === 'public')
  .sort((a, b) => b.priority - a.priority)
  .map((b) => `### ${b.key}\n${b.text}`)
  .join('\n\n')}

---
`
        : '';

    const userPlanSection =
      dto.userInput || dto.cities?.length || dto.mustHavePois?.length || dto.dayAllocation?.length
        ? `
用户原始描述：${dto.userInput || '（无）'}
${dto.cities?.length ? `- 指定城市：${dto.cities.join('、')}` : ''}
${dto.mustHavePois?.length ? `- 必含景点（优先安排）：${dto.mustHavePois.join('、')}` : ''}
${dto.dayAllocation?.length ? `- 城市天数分配：${dto.dayAllocation.map((a) => `${a.city}${a.days}天`).join('，')}` : ''}
`
        : '';

    return `${contextSection}你是一个专业的旅行规划助手。请根据用户需求和候选地点，为 ${dto.days} 天的行程安排每天的时段活动。
${userPlanSection}
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
3. **每天内不能重复选择同一个地点（同一个 placeId 在同一天只能出现一次）**
4. **整个行程中，同一个地点最多出现 2 次（允许跨天重复，但不应过度）**
5. **餐厅（RESTAURANT 类别）在同一天内不能重复（午餐和晚餐不能选择同一家餐厅，除非只有一家餐厅可选）**
6. **lunch 和 dinner 时段必须选择 RESTAURANT 类别的地点（确保包含具体的餐厅）**
7. 考虑地理位置连续性（相邻时段的地点不要太远）
8. 考虑用户的风格偏好和强度要求
9. 为每个选择提供简短的原因（reason）

注意：
- **候选列表中包含餐厅（RESTAURANT），lunch 和 dinner 时段必须从 RESTAURANT 类别中选择**
- **酒店（HOTEL）不在候选列表中，因为酒店是住宿地点，需要根据行程中的景点位置单独推荐**

请返回 JSON 格式，包含每天的时段安排。`;
  }

  /**
   * 规则校验和修复
   */
  private async validateAndRepair(
    days: Array<{ day: number; date: string }>,
    llmResult: any,
    candidates: CandidatePlace[],
    warnings: string[],
    options?: { intensity?: string; transport?: import('../dto/trip-draft.dto').TransportMode }
  ): Promise<DraftDay[]> {
    const validatedDays: DraftDay[] = [];
    
    // 🆕 记录每天使用的 placeId（用于去重）
    const dailyPlaceIds = new Map<number, Set<number>>(); // day -> Set<placeId>
    const globalPlaceIds = new Map<number, number>(); // placeId -> count
    const dailyRestaurantIds = new Map<number, Set<number>>(); // day -> Set<restaurant placeId>（用于餐厅去重）

    for (const dayData of days) {
      const llmDay = llmResult.days?.find((d: any) => d.day === dayData.day);
      if (!llmDay) {
        warnings.push(`第 ${dayData.day} 天缺少 LLM 编排结果`);
        continue;
      }

      const slots: DraftDaySlots = {};
      const dayPlaceIds = new Set<number>(); // 记录当天使用的 placeId
      const dayRestaurantIds = new Set<number>(); // 记录当天使用的餐厅 placeId

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

        // 🆕 检查当天是否已使用该 placeId
        if (dayPlaceIds.has(item.placeId)) {
          warnings.push(`第 ${dayData.day} 天 ${slotKey} 时段重复选择了地点 ${item.placeId}（${candidate.nameCN}），已跳过`);
          continue; // 跳过重复项
        }

        // 🆕 检查餐厅重复（午餐和晚餐时段）
        const isRestaurant = candidate.category === 'RESTAURANT';
        const isMealSlot = slot === TimeSlot.LUNCH || slot === TimeSlot.DINNER;
        
        if (isRestaurant && isMealSlot && dayRestaurantIds.has(item.placeId)) {
          // 特殊情况：如果当天只有一家餐厅候选，允许重复
          const restaurantCandidates = candidates.filter(c => c.category === 'RESTAURANT');
          if (restaurantCandidates.length > 1) {
            warnings.push(`第 ${dayData.day} 天 ${slotKey} 时段重复选择了餐厅 ${item.placeId}（${candidate.nameCN}），已跳过`);
            continue; // 跳过重复餐厅（除非只有一家）
          } else {
            warnings.push(`第 ${dayData.day} 天 ${slotKey} 时段重复选择餐厅 ${item.placeId}（${candidate.nameCN}），但当天只有一家餐厅候选，允许重复`);
          }
        }

        // 🆕 检查全局重复次数（允许跨天重复，但限制次数）
        const globalCount = globalPlaceIds.get(item.placeId) || 0;
        if (globalCount >= 2) {
          warnings.push(`地点 ${item.placeId}（${candidate.nameCN}）在整个行程中已出现 ${globalCount} 次，跳过重复`);
          continue; // 跳过过度重复项
        }

        // 记录已使用的 placeId
        dayPlaceIds.add(item.placeId);
        globalPlaceIds.set(item.placeId, globalCount + 1);
        
        if (isRestaurant) {
          dayRestaurantIds.add(item.placeId);
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

      dailyPlaceIds.set(dayData.day, dayPlaceIds);
      dailyRestaurantIds.set(dayData.day, dayRestaurantIds);

      // TripNara Phase 3: 地理约束（同一天 cluster/District 不超过 2 个）检查与修复
      const slotMap = Object.fromEntries(
        Object.entries(slots).map(([k, v]) => [k, { placeId: v.placeId }]),
      );
      const hasDistrictData = Object.values(slots).some((s) => {
        const c = candidates.find((x) => x.id === s.placeId);
        return c?.districtId != null;
      });
      if (hasDistrictData) {
        const districtResult = this.constraintEngine.checkDistrictConstraint(slotMap, candidates);
        if (!districtResult.ok && districtResult.excessDistrictIds.length > 0) {
          const keepDistrictIds = districtResult.districtIds.filter(
            (id) => !districtResult.excessDistrictIds.includes(id),
          );
          for (const [slotKey, draftItem] of Object.entries(slots)) {
            const c = candidates.find((x) => x.id === draftItem.placeId);
            if (c?.districtId != null && districtResult.excessDistrictIds.includes(c.districtId)) {
              const isMeal = slotKey === 'lunch' || slotKey === 'dinner';
              const replacement = this.constraintEngine.suggestReplacementFromDistricts(
                draftItem.placeId,
                districtResult.excessDistrictIds,
                keepDistrictIds,
                candidates,
                isMeal ? 'RESTAURANT' : undefined,
              );
              if (replacement && !dayPlaceIds.has(replacement)) {
                const oldId = draftItem.placeId;
                dayPlaceIds.delete(oldId);
                dayPlaceIds.add(replacement);
                globalPlaceIds.set(oldId, (globalPlaceIds.get(oldId) ?? 1) - 1);
                globalPlaceIds.set(replacement, (globalPlaceIds.get(replacement) ?? 0) + 1);
                if (c.category === 'RESTAURANT') dayRestaurantIds.delete(oldId);
                const repCandidate = candidates.find((x) => x.id === replacement);
                if (repCandidate?.category === 'RESTAURANT') dayRestaurantIds.add(replacement);
                draftItem.placeId = replacement;
                draftItem.reason = (draftItem.reason || '') + ' [District约束修复]';
                warnings.push(`第 ${dayData.day} 天 ${slotKey} 时段因 District 约束将 ${oldId} 替换为 ${replacement}`);
              }
            }
          }
        }
      } else {
        const clusterResult = this.constraintEngine.checkClusterConstraint(slotMap, candidates);
        if (!clusterResult.ok && clusterResult.excessClusterIds.length > 0) {
          for (const [slotKey, draftItem] of Object.entries(slots)) {
            const c = candidates.find((x) => x.id === draftItem.placeId);
            if (c?.clusterId !== undefined && clusterResult.excessClusterIds.includes(c.clusterId)) {
              const isMeal = slotKey === 'lunch' || slotKey === 'dinner';
              const replacement = this.constraintEngine.suggestReplacementFromClusters(
                draftItem.placeId,
                clusterResult.excessClusterIds,
                clusterResult.clusterIds.filter((id) => !clusterResult.excessClusterIds.includes(id)),
                candidates,
                isMeal ? 'RESTAURANT' : undefined,
              );
              if (replacement && !dayPlaceIds.has(replacement)) {
                const oldId = draftItem.placeId;
                dayPlaceIds.delete(oldId);
                dayPlaceIds.add(replacement);
                globalPlaceIds.set(oldId, (globalPlaceIds.get(oldId) ?? 1) - 1);
                globalPlaceIds.set(replacement, (globalPlaceIds.get(replacement) ?? 0) + 1);
                if (c.category === 'RESTAURANT') dayRestaurantIds.delete(oldId);
                const repCandidate = candidates.find((x) => x.id === replacement);
                if (repCandidate?.category === 'RESTAURANT') dayRestaurantIds.add(replacement);
                draftItem.placeId = replacement;
                draftItem.reason = (draftItem.reason || '') + ' [cluster约束修复]';
                warnings.push(`第 ${dayData.day} 天 ${slotKey} 时段因 cluster 约束将 ${oldId} 替换为 ${replacement}`);
              }
            }
          }
        }
      }

      // TripNara Phase 3: 距离约束检查（按交通方式：步行 5km，公交 30km，自驾 150km）
      const distViolations = this.constraintEngine.checkDistanceConstraint(
        slotMap,
        candidates,
        options?.transport,
      );
      const maxDistKm = options?.transport === 'car' ? 150 : options?.transport === 'transit' ? 30 : 5;
      for (const v of distViolations) {
        warnings.push(
          `第 ${dayData.day} 天 ${v.slotA}→${v.slotB} 距离 ${v.distanceKm}km 超过 ${maxDistKm}km，建议优化路线`,
        );
      }

      // TripNara Phase A: 疲劳预测检查（按交通方式与强度）
      const fatigueResult = this.fatigueEngine.compute(slotMap, candidates, options?.transport);
      const maxFatigue = this.fatigueEngine.getMaxScoreForIntensity(options?.intensity);
      if (fatigueResult.score > maxFatigue) {
        warnings.push(
          `第 ${dayData.day} 天疲劳分 ${fatigueResult.score.toFixed(1)} 超过限制 ${maxFatigue}（强度=${options?.intensity || 'balanced'}），步行约 ${fatigueResult.walkingDistanceKm}km，${fatigueResult.placeCount} 个地点`,
        );
      }

      // TripNara Phase A: 节奏约束检查（连续 museum ≤ 1，连续 attraction ≤ 2）
      const pacingViolations = this.pacingEngine.check(slotMap, candidates);
      for (const pv of pacingViolations) {
        warnings.push(`第 ${dayData.day} 天 ${pv.slot} 时段：${pv.message}`);
      }
      
      // 🆕 检查去重后某天是否缺少行程项，如果缺少则尝试填充
      const slotCount = Object.keys(slots).length;
      if (slotCount < 3) {
        warnings.push(`第 ${dayData.day} 天去重后只有 ${slotCount} 个行程项，尝试从候选列表填充`);
        await this.fillMissingSlots(dayData, slots, candidates, dayPlaceIds, dayRestaurantIds, warnings);
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
   * 🆕 填充缺失的时段（去重后某天行程项不足时调用）
   */
  private async fillMissingSlots(
    dayData: { day: number; date: string },
    slots: DraftDaySlots,
    candidates: CandidatePlace[],
    dayPlaceIds: Set<number>,
    dayRestaurantIds: Set<number>,
    warnings: string[]
  ): Promise<void> {
    const requiredSlots: TimeSlot[] = [TimeSlot.MORNING, TimeSlot.LUNCH, TimeSlot.AFTERNOON, TimeSlot.DINNER];
    const missingSlots = requiredSlots.filter(slot => !slots[slot]);

    if (missingSlots.length === 0) return;

    for (const slot of missingSlots) {
      const isMealSlot = slot === TimeSlot.LUNCH || slot === TimeSlot.DINNER;
      
      // 过滤候选：排除已使用的，优先选择餐厅（如果是用餐时段）
      const filteredCandidates = candidates.filter(c => {
        if (dayPlaceIds.has(c.id)) return false; // 排除已使用的
        
        // 用餐时段优先选择餐厅
        if (isMealSlot) {
          if (c.category === 'RESTAURANT') {
            // 检查餐厅是否已使用（除非只有一家）
            if (dayRestaurantIds.has(c.id)) {
              const restaurantCandidates = candidates.filter(c => c.category === 'RESTAURANT');
              return restaurantCandidates.length === 1; // 只有一家时允许重复
            }
            return true;
          }
          return false; // 用餐时段只选择餐厅
        }
        
        // 非用餐时段排除餐厅
        return c.category !== 'RESTAURANT';
      });

      if (filteredCandidates.length === 0) {
        warnings.push(`第 ${dayData.day} 天 ${slot} 时段无法找到合适的候选地点`);
        continue;
      }

      // 按评分和地理位置排序（简化：只按评分）
      filteredCandidates.sort((a, b) => {
        const ratingA = a.rating || 0;
        const ratingB = b.rating || 0;
        return ratingB - ratingA;
      });

      const bestCandidate = filteredCandidates[0];
      const slotTime = this.SLOT_TIMES[slot];
      const startDateTime = DateTime.fromISO(`${dayData.date}T${slotTime.start.toString().padStart(2, '0')}:00:00`);
      const endDateTime = DateTime.fromISO(`${dayData.date}T${slotTime.end.toString().padStart(2, '0')}:00:00`);

      slots[slot] = {
        placeId: bestCandidate.id,
        slot: slot,
        startTime: startDateTime.toISO() || new Date().toISOString(),
        endTime: endDateTime.toISO() || new Date().toISOString(),
        reason: `自动填充：${bestCandidate.nameCN}`,
        alternatives: filteredCandidates.slice(1, 4).map(c => c.id),
        evidence: {
          openingHours: this.formatOpeningHours(bestCandidate.openingHours),
          rating: bestCandidate.rating,
          source: 'database',
        },
      };

      dayPlaceIds.add(bestCandidate.id);
      if (bestCandidate.category === 'RESTAURANT') {
        dayRestaurantIds.add(bestCandidate.id);
      }

      warnings.push(`第 ${dayData.day} 天 ${slot} 时段已自动填充：${bestCandidate.nameCN}`);
    }
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
      for (const _addedItem of dto.userEdits.addedItems) {
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

    // 🆕 二次去重检查（兜底）：记录每天已创建的 placeId
    const dailyPlaceIds = new Map<number, Set<number>>(); // day -> Set<placeId>

    for (const draftDay of draft.draftDays) {
      const tripDayId = dateToTripDay.get(draftDay.date);
      if (!tripDayId) {
        this.logger.warn(`找不到日期 ${draftDay.date} 对应的 TripDay`);
        continue;
      }

      const dayPlaceIds = new Set<number>(); // 记录当天已创建的 placeId

      // 处理每个时段
      for (const [slotKey, slotValue] of Object.entries(draftDay.slots)) {
        if (!slotValue) continue;

        // 检查是否被删除
        const itemKey = `${draftDay.day}-${slotKey}`;
        if (userEdits?.removedItems?.includes(itemKey)) continue;

        // 🆕 二次去重检查（兜底）
        if (dayPlaceIds.has(slotValue.placeId)) {
          this.logger.warn(`跳过重复项：第 ${draftDay.day} 天 ${slotKey} 时段，placeId ${slotValue.placeId}`);
          continue;
        }

        dayPlaceIds.add(slotValue.placeId);

        itemsToCreate.push({
          tripDayId,
          placeId: slotValue.placeId,
          type: ItemType.ACTIVITY, // 临时值，后面会更新
          startTime: new Date(slotValue.startTime),
          endTime: new Date(slotValue.endTime),
          note: slotValue.reason || null,
        });
      }

      dailyPlaceIds.set(draftDay.day, dayPlaceIds);
    }

    // 添加用户新增的项
    if (userEdits?.addedItems) {
      for (const _addedItem of userEdits.addedItems) {
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

    // 🆕 酒店去重：每天最多保留一个住宿项（HOTEL 类别 → REST 类型）
    const filteredItemsToCreate: typeof itemsToCreate = [];
    const hotelAddedPerDay = new Map<string, boolean>();
    for (const item of itemsToCreate) {
      const category = item.placeId ? placeCategoryMap.get(item.placeId) : null;
      if (category === PlaceCategory.HOTEL) {
        const alreadyHasHotel = hotelAddedPerDay.get(item.tripDayId);
        if (alreadyHasHotel) {
          this.logger.warn(`跳过重复酒店：tripDayId=${item.tripDayId}, placeId=${item.placeId}`);
          continue;
        }
        hotelAddedPerDay.set(item.tripDayId, true);
      }
      filteredItemsToCreate.push(item);
    }
    itemsToCreate.length = 0;
    itemsToCreate.push(...filteredItemsToCreate);

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
      // 🆕 按 tripDayId 分组，为每个 day 的 items 设置递增的 order
      const itemsByDay = new Map<string, typeof itemsToCreate>();
      for (const item of itemsToCreate) {
        if (!itemsByDay.has(item.tripDayId)) {
          itemsByDay.set(item.tripDayId, []);
        }
        itemsByDay.get(item.tripDayId)!.push(item);
      }

      await this.prisma.$transaction(async (tx) => {
        for (const [tripDayId, dayItems] of itemsByDay.entries()) {
          // 查询当天最大的 order 值
          const maxOrderItem = await tx.itineraryItem.findFirst({
            where: { tripDayId },
            orderBy: { order: 'desc' },
            select: { order: true },
          });
          const baseOrder = maxOrderItem?.order !== null && maxOrderItem?.order !== undefined 
            ? maxOrderItem.order + 1 
            : 1;

          // 按 startTime 排序，确保顺序正确
          dayItems.sort((a, b) => a.startTime.getTime() - b.startTime.getTime());

          // 创建 items，设置递增的 order
          for (let i = 0; i < dayItems.length; i++) {
            const item = dayItems[i];
            await tx.itineraryItem.create({
              data: {
                id: randomUUID(),
                tripDayId: item.tripDayId,
                placeId: item.placeId,
                type: item.type as any,
                startTime: item.startTime,
                endTime: item.endTime,
                note: item.note,
                order: baseOrder + i, // 🆕 设置显示顺序
              } as any,
            });
          }
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
      constraints.maxDistance = dto.constraints?.maxDistance ?? 50000; // 默认 50km（米）
    } else if (dto.reason === 'change_style' && dto.preferredStyle) {
      // 根据新风格检索
    }

    // 距离太远时：获取 route anchor（前后行程项的中点），用于过滤和排序
    let routeAnchor: { lat: number; lng: number } | null = null;
    if (dto.reason === 'too_far') {
      routeAnchor = await this.getRouteAnchorForItem(currentItem.tripDayId, itemId);
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
      const countryCandidates = await this.candidateEngine.retrieve({
        destination: countryCode,
        days: 1,
        style: dto.preferredStyle,
      });
      
      // 过滤出其他城市的候选（排除同城市的）
      const otherCityCandidates = countryCandidates.filter(c => 
        !sameCityIds.has(c.id)
      );
      
      // 合并：同城市在前，其他城市在后
      candidates = [...candidates, ...otherCityCandidates];
      
      this.logger.log(`合并后候选数量: ${candidates.length} (同城市: ${sameCityCount}, 其他城市: ${otherCityCandidates.length})`);
    }

    // 获取当日行程中已有的 placeId，排除重复
    const existingPlaceIds = await this.prisma.itineraryItem.findMany({
      where: { tripDayId: currentItem.tripDayId },
      select: { placeId: true },
    }).then(items => new Set(items.map(i => i.placeId).filter((id): id is number => id != null)));

    // 过滤候选：同类型 + 排除当前地点 + 排除当日已有
    const originalCategory = currentItem.Place.category;
    let filteredCandidates = candidates.filter(
      c =>
        c.category === originalCategory &&
        c.id !== currentItem.placeId &&
        !existingPlaceIds.has(c.id)
    );

    // 距离太远时：仅保留在 route anchor 附近（maxDistance 米内）的候选，并按距离排序
    if (dto.reason === 'too_far' && routeAnchor && constraints.maxDistance) {
      const maxDistM = constraints.maxDistance;
      filteredCandidates = filteredCandidates
        .map(c => ({
          ...c,
          _distToRoute: this.haversineMeters(routeAnchor!.lat, routeAnchor!.lng, c.lat, c.lng),
        }))
        .filter(c => c._distToRoute <= maxDistM)
        .sort((a, b) => a._distToRoute - b._distToRoute);
      this.logger.log(`距离太远：过滤后候选 ${filteredCandidates.length} 个（距路线 ${maxDistM / 1000}km 内）`);
    }

    if (filteredCandidates.length === 0) {
      throw new NotFoundException(
        dto.reason === 'too_far'
          ? '附近没有找到同类型的更近替代地点，可尝试放宽距离限制'
          : `找不到同类型（${originalCategory}）的替代地点`
      );
    }

    // 排序：距离太远时已按距离排；否则优先同城市，然后按评分排序
    const sortedCandidates =
      dto.reason === 'too_far' && routeAnchor
        ? filteredCandidates
        : filteredCandidates.sort((a, b) => {
            const aIsSameCity = sameCityIds.has(a.id);
            const bIsSameCity = sameCityIds.has(b.id);
            if (aIsSameCity && !bIsSameCity) return -1;
            if (!aIsSameCity && bIsSameCity) return 1;
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

// @ts-nocheck
// src/route-directions/route-directions.service.ts
import { Injectable, Logger, NotFoundException } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import { Prisma } from '@prisma/client';
import { randomUUID } from 'crypto';
import { CreateRouteDirectionDto } from './dto/create-route-direction.dto';
import { CreateRouteTemplateDto } from './dto/create-route-template.dto';
import { UpdateRouteTemplateDto } from './dto/update-route-template.dto';
import { QueryRouteDirectionDto } from './dto/query-route-direction.dto';
import { ImportCountryPackDto, ImportCountryPackResultDto } from './dto/import-country-pack.dto';
import { RouteDirectionData, RouteTemplateData, DayPlan } from './interfaces/route-direction.interface';
import { CreateTripFromTemplateDto } from './dto/create-trip-from-template.dto';

@Injectable()
export class RouteDirectionsService {
  private readonly logger = new Logger(RouteDirectionsService.name);

  constructor(private prisma: PrismaService) {}

  /**
   * 创建路线方向
   */
  async createRouteDirection(
    dto: CreateRouteDirectionDto,
  ): Promise<any> {
    const data: any = {
      countryCode: dto.countryCode,
      name: dto.name,
      nameCN: dto.nameCN,
      nameEN: dto.nameEN,
      description: dto.description,
      tags: dto.tags,
      regions: dto.regions || [],
      entryHubs: dto.entryHubs || [],
      seasonality: dto.seasonality as Prisma.InputJsonValue,
      constraints: dto.constraints as Prisma.InputJsonValue,
      riskProfile: dto.riskProfile as Prisma.InputJsonValue,
      signaturePois: dto.signaturePois as Prisma.InputJsonValue,
      itinerarySkeleton: dto.itinerarySkeleton as Prisma.InputJsonValue,
      metadata: dto.metadata as Prisma.InputJsonValue,
      isActive: dto.isActive ?? true,
      // 灰度与开关字段
      status: dto.status || 'active',
      version: dto.version,
      rolloutPercent: dto.rolloutPercent ?? 100,
      audienceFilter: dto.audienceFilter as Prisma.InputJsonValue,
    };

    return (this.prisma.routeDirection.create({
      data: { ...data, uuid: randomUUID(), updatedAt: new Date() } as any,
      // templates relation does not exist in Prisma schema
    }) as any);
  }

  /**
   * 创建路线模板
   */
  async createRouteTemplate(
    dto: CreateRouteTemplateDto,
  ): Promise<any> {
    // 验证路线方向是否存在
    const routeDirection = await this.prisma.routeDirection.findUnique({
      where: { id: dto.routeDirectionId },
    });

    if (!routeDirection) {
      throw new NotFoundException(
        `Route direction with ID ${dto.routeDirectionId} not found`,
      );
    }

    const data: any = {
      routeDirection: {
        connect: { id: dto.routeDirectionId },
      },
      durationDays: dto.durationDays,
      name: dto.name,
      nameCN: dto.nameCN,
      nameEN: dto.nameEN,
      dayPlans: dto.dayPlans as Prisma.InputJsonValue,
      defaultPacePreference: dto.defaultPacePreference,
      metadata: dto.metadata as Prisma.InputJsonValue,
      isActive: dto.isActive ?? true,
    };

    return (this.prisma as any).routeTemplate.create({
      data,
      include: { routeDirection: true },
    });
  }

  /**
   * 查询路线方向
   */
  async findRouteDirections(
    query: QueryRouteDirectionDto,
  ): Promise<Prisma.RouteDirectionGetPayload<{ include: { templates: true } }>[]> {
    const where: Prisma.RouteDirectionWhereInput = {};

    if (query.countryCode) {
      where.countryCode = query.countryCode;
    }

    if (query.tag) {
      where.tags = { has: query.tag };
    }

    if (query.tags && query.tags.length > 0) {
      where.tags = { hasEvery: query.tags };
    }

    if (query.isActive !== undefined) {
      where.isActive = query.isActive;
    }

    // 季节性筛选（使用原始 SQL，因为 Prisma 不支持 JSONB 数组查询）
    // 注意：这里先不筛选月份，后续在内存中过滤，或者使用原始 SQL
    // 为了简化，暂时移除月份筛选，后续可以优化

    return (this.prisma.routeDirection.findMany as any)({
      where,
      // templates relation does not exist in Prisma schema
      orderBy: { createdAt: 'desc' },
    });
  }

  /**
   * 根据 ID 获取路线方向
   */
  async findRouteDirectionById(
    id: number,
  ): Promise<any> {
    const routeDirection = await this.prisma.routeDirection.findUnique({
      where: { id },
      // templates relation does not exist in Prisma schema
    });

    if (!routeDirection) {
      throw new NotFoundException(`Route direction with ID ${id} not found`);
    }

    return routeDirection;
  }

  /**
   * 根据 UUID 获取路线方向
   */
  async findRouteDirectionByUuid(
    uuid: string,
  ): Promise<any> {
    const routeDirection = await (this.prisma.routeDirection.findUnique as any)({
      where: { uuid },
      include: { templates: true },
    });

    if (!routeDirection) {
      throw new NotFoundException(`Route direction with UUID ${uuid} not found`);
    }

    return routeDirection;
  }

  /**
   * 根据国家代码获取路线方向（用于 Agent 路由）
   */
  async findRouteDirectionsByCountry(
    countryCode: string,
    options?: {
      tags?: string[];
      month?: number;
      limit?: number;
      // 灰度过滤选项
      userId?: string; // 用于灰度计算（基于用户 ID 的哈希）
      persona?: string[]; // 用户画像（用于 audienceFilter）
      locale?: string; // 用户语言（用于 audienceFilter）
      includeDeprecated?: boolean; // 是否包含 deprecated 的 RD（用于 explanation）
    },
  ): Promise<{
    active: Prisma.RouteDirectionGetPayload<{ include: { templates: true } }>[];
    deprecated?: Prisma.RouteDirectionGetPayload<{ include: { templates: true } }>[]; // 备选曾经方案
  }> {
    try {
      // 1. 获取 active 的 RD（用于选择）
      const activeWhere: Prisma.RouteDirectionWhereInput = {
        countryCode,
        OR: [
          { status: 'active' },
          { status: null, isActive: true }, // 兼容旧数据
        ],
      };

      if (options?.tags && options.tags.length > 0) {
        activeWhere.tags = { hasSome: options.tags };
      }

      const activeResults = await this.prisma.routeDirection.findMany({
        where: activeWhere,
        // templates relation does not exist in Prisma schema
        take: options?.limit ? options.limit * 3 : 30, // 获取更多，后续在内存中过滤
        orderBy: { createdAt: 'desc' },
      });

      // 2. 灰度过滤：只保留命中 rollout 的 RD
      const filteredActive = this.applyGrayReleaseFilter(activeResults, options);

      // 3. 在内存中过滤月份（如果指定了月份）
      let finalActive = filteredActive;
      if (options?.month) {
        finalActive = filteredActive.filter(rd => {
          const seasonality = rd.seasonality as any;
          if (!seasonality) return true; // 无季节性信息，保留

          const avoidMonths = seasonality.avoidMonths || [];
          if (avoidMonths.includes(options.month)) {
            return false; // 禁忌月份，排除
          }

          return true; // 其他情况保留
        });
      }

      // 限制返回数量
      finalActive = finalActive.slice(0, options?.limit || 20);

      // 4. 获取 deprecated 的 RD（用于 explanation，如果请求）
      let deprecated: Prisma.RouteDirectionGetPayload<{ include: { templates: true } }>[] = [];
      if (options?.includeDeprecated) {
        const deprecatedWhere: Prisma.RouteDirectionWhereInput = {
          countryCode,
          status: 'deprecated',
        };

        if (options?.tags && options.tags.length > 0) {
          deprecatedWhere.tags = { hasSome: options.tags };
      }

        deprecated = await this.prisma.routeDirection.findMany({
          where: deprecatedWhere,
          // templates relation does not exist in Prisma schema
          take: 5, // 只取前 5 个作为备选
          orderBy: { updatedAt: 'desc' },
        });
      }

      return {
        active: finalActive,
        deprecated: options?.includeDeprecated ? deprecated : undefined,
      };
    } catch (error: any) {
      // 如果表不存在，返回空数组（测试环境可能没有运行迁移）
      if (error?.code === 'P2021' || error?.message?.includes('does not exist')) {
        this.logger.warn(`RouteDirection 表不存在，请先运行迁移`);
        return {
          active: [],
          deprecated: undefined,
        };
      }
      throw error;
    }
  }

  /**
   * 更新路线方向
   */
  async updateRouteDirection(
    id: number,
    data: Partial<CreateRouteDirectionDto>,
  ): Promise<any> {
    const updateData: Prisma.RouteDirectionUpdateInput = {};

    if (data.name !== undefined) updateData.name = data.name;
    if (data.nameCN !== undefined) updateData.nameCN = data.nameCN;
    if (data.nameEN !== undefined) updateData.nameEN = data.nameEN;
    if (data.description !== undefined) updateData.description = data.description;
    if (data.tags !== undefined) updateData.tags = data.tags;
    if (data.regions !== undefined) updateData.regions = data.regions;
    if (data.entryHubs !== undefined) updateData.entryHubs = data.entryHubs;
    if (data.seasonality !== undefined)
      updateData.seasonality = data.seasonality as Prisma.InputJsonValue;
    if (data.constraints !== undefined)
      updateData.constraints = data.constraints as Prisma.InputJsonValue;
    if (data.riskProfile !== undefined)
      updateData.riskProfile = data.riskProfile as Prisma.InputJsonValue;
    if (data.signaturePois !== undefined)
      updateData.signaturePois = data.signaturePois as Prisma.InputJsonValue;
    if (data.itinerarySkeleton !== undefined)
      updateData.itinerarySkeleton = data.itinerarySkeleton as Prisma.InputJsonValue;
    if (data.metadata !== undefined)
      updateData.metadata = data.metadata as Prisma.InputJsonValue;
    if (data.isActive !== undefined) updateData.isActive = data.isActive;

    return this.prisma.routeDirection.update({
      where: { id },
      data: updateData,
      // templates relation does not exist in Prisma schema
    });
  }

  /**
   * 删除路线方向（软删除：设置 isActive = false）
   */
  async deleteRouteDirection(id: number): Promise<void> {
    await this.prisma.routeDirection.update({
      where: { id },
      data: { isActive: false },
    });
  }

  /**
   * 获取路线模板
   */
  async findRouteTemplateById(
    id: number,
  ): Promise<any> {
    const template = await (this.prisma as any).routeTemplate.findUnique({
      where: { id },
      include: { routeDirection: true },
    });

    if (!template) {
      throw new NotFoundException(`Route template with ID ${id} not found`);
    }

    return template;
  }

  /**
   * 根据路线方向和天数获取模板
   */
  async findRouteTemplateByDirectionAndDuration(
    routeDirectionId: number,
    durationDays: number,
  ): Promise<any> {
    return (this.prisma as any).routeTemplate.findFirst({
      where: {
        routeDirectionId,
        durationDays,
        isActive: true,
      },
      include: { routeDirection: true },
    });
  }

  /**
   * 查询路线模板列表
   */
  async findRouteTemplates(options?: {
    routeDirectionId?: number;
    durationDays?: number;
    isActive?: boolean;
    limit?: number;
    offset?: number;
  }): Promise<any[]> {
    const where: any = {};

    if (options?.routeDirectionId !== undefined) {
      where.routeDirectionId = options.routeDirectionId;
    }

    if (options?.durationDays !== undefined) {
      where.durationDays = options.durationDays;
    }

    if (options?.isActive !== undefined) {
      where.isActive = options.isActive;
    }

    const query: any = {
      where,
      include: { routeDirection: true },
      orderBy: { createdAt: 'desc' },
    };

    if (options?.limit !== undefined) {
      query.take = options.limit;
    }

    if (options?.offset !== undefined) {
      query.skip = options.offset;
    }

    return (this.prisma as any).routeTemplate.findMany(query);
  }

  /**
   * 更新路线模板
   */
  async updateRouteTemplate(
    id: number,
    dto: UpdateRouteTemplateDto,
  ): Promise<any> {
    // 检查模板是否存在
    const existing = await (this.prisma as any).routeTemplate.findUnique({
      where: { id },
    });

    if (!existing) {
      throw new NotFoundException(`Route template with ID ${id} not found`);
    }

    // 如果更新 routeDirectionId，验证路线方向是否存在
    if (dto.routeDirectionId !== undefined) {
      const routeDirection = await this.prisma.routeDirection.findUnique({
        where: { id: dto.routeDirectionId },
      });

      if (!routeDirection) {
        throw new NotFoundException(
          `Route direction with ID ${dto.routeDirectionId} not found`,
        );
      }
    }

    const updateData: any = {};

    if (dto.routeDirectionId !== undefined) {
      updateData.routeDirection = {
        connect: { id: dto.routeDirectionId },
      };
    }

    if (dto.durationDays !== undefined) updateData.durationDays = dto.durationDays;
    if (dto.name !== undefined) updateData.name = dto.name;
    if (dto.nameCN !== undefined) updateData.nameCN = dto.nameCN;
    if (dto.nameEN !== undefined) updateData.nameEN = dto.nameEN;
    if (dto.dayPlans !== undefined) {
      updateData.dayPlans = dto.dayPlans as Prisma.InputJsonValue;
    }
    if (dto.defaultPacePreference !== undefined) {
      updateData.defaultPacePreference = dto.defaultPacePreference;
    }
    if (dto.metadata !== undefined) {
      updateData.metadata = dto.metadata as Prisma.InputJsonValue;
    }
    if (dto.isActive !== undefined) updateData.isActive = dto.isActive;

    updateData.updatedAt = new Date();

    return (this.prisma as any).routeTemplate.update({
      where: { id },
      data: updateData,
      include: { routeDirection: true },
    });
  }

  /**
   * 删除路线模板（软删除：设置 isActive = false）
   */
  async deleteRouteTemplate(id: number): Promise<void> {
    const existing = await (this.prisma as any).routeTemplate.findUnique({
      where: { id },
    });

    if (!existing) {
      throw new NotFoundException(`Route template with ID ${id} not found`);
    }

    await (this.prisma as any).routeTemplate.update({
      where: { id },
      data: {
        isActive: false,
        updatedAt: new Date(),
      },
    });
  }

  /**
   * 应用灰度发布过滤
   * 只保留命中 rollout 和 audienceFilter 的 RD
   */
  private applyGrayReleaseFilter(
    routeDirections: Prisma.RouteDirectionGetPayload<{ include: { templates: true } }>[],
    options?: {
      userId?: string;
      persona?: string[];
      locale?: string;
    }
  ): Prisma.RouteDirectionGetPayload<{ include: { templates: true } }>[] {
    return routeDirections.filter(rd => {
      // 1. 检查 rolloutPercent（灰度百分比）
      const rolloutPercent = (rd as any).rolloutPercent ?? 100;
      if (rolloutPercent < 100) {
        // 需要灰度过滤
        if (!options?.userId) {
          // 没有 userId，无法判断，默认不通过（安全策略）
          return false;
        }
        
        // 基于 userId 的哈希值决定是否命中灰度
        const hash = this.hashString(options.userId);
        const userHashPercent = (hash % 100) + 1; // 1-100
        
        if (userHashPercent > rolloutPercent) {
          // 未命中灰度，过滤掉
          return false;
        }
      }

      // 2. 检查 audienceFilter（受众过滤）
      const audienceFilter = (rd as any).audienceFilter as any;
      if (audienceFilter) {
        // 检查 persona 匹配
        if (audienceFilter.persona && Array.isArray(audienceFilter.persona)) {
          if (options?.persona && options.persona.length > 0) {
            // 用户有 persona，检查是否有交集
            const hasMatch = options.persona.some(p => audienceFilter.persona.includes(p));
            if (!hasMatch) {
              return false; // persona 不匹配，过滤掉
            }
          } else {
            // 用户没有 persona，但 RD 要求 persona，过滤掉
            return false;
          }
        }

        // 检查 locale 匹配
        if (audienceFilter.locale && Array.isArray(audienceFilter.locale)) {
          if (options?.locale) {
            const hasMatch = audienceFilter.locale.includes(options.locale);
            if (!hasMatch) {
              return false; // locale 不匹配，过滤掉
            }
          } else {
            // 用户没有 locale，但 RD 要求 locale，过滤掉
            return false;
          }
        }
      }

      return true; // 通过所有过滤
    });
  }

  /**
   * 简单的字符串哈希函数（用于灰度计算）
   */
  private hashString(str: string): number {
    let hash = 0;
    for (let i = 0; i < str.length; i++) {
      const char = str.charCodeAt(i);
      hash = ((hash << 5) - hash) + char;
      hash = hash & hash; // Convert to 32bit integer
    }
    return Math.abs(hash);
  }

  /**
   * 批量导入国家 Pack（CountryPackSkeleton）
   * 
   * 从 CountryPackSkeleton JSON 文件中批量导入 RouteDirection
   * 
   * @param dto Country Pack 导入数据
   * @returns 导入结果
   */
  async importCountryPack(dto: ImportCountryPackDto): Promise<ImportCountryPackResultDto> {
    const results: Array<{ name: string; success: boolean; id?: number; error?: string }> = [];
    let successCount = 0;
    let failedCount = 0;

    this.logger.log(`开始导入 ${dto.countryCode} 的 Country Pack，包含 ${dto.routeDirections.length} 条 RouteDirection`);

    for (const routeDirectionDto of dto.routeDirections) {
      try {
        // 确保 countryCode 匹配
        if (routeDirectionDto.countryCode !== dto.countryCode) {
          this.logger.warn(
            `RouteDirection ${routeDirectionDto.name} 的 countryCode (${routeDirectionDto.countryCode}) 与 Pack 的 countryCode (${dto.countryCode}) 不匹配，使用 Pack 的 countryCode`
          );
          routeDirectionDto.countryCode = dto.countryCode;
        }

        // 使用现有的创建方法
        const created = await this.createRouteDirection(routeDirectionDto);
        results.push({
          name: routeDirectionDto.name,
          success: true,
          id: created.id,
        });
        successCount++;
        this.logger.log(`✅ 成功导入 RouteDirection: ${routeDirectionDto.name} (ID: ${created.id})`);
      } catch (error: any) {
        const errorMessage = error?.message || 'Unknown error';
        results.push({
          name: routeDirectionDto.name,
          success: false,
          error: errorMessage,
        });
        failedCount++;
        this.logger.error(`❌ 导入 RouteDirection 失败: ${routeDirectionDto.name}`, errorMessage);
      }
    }

    this.logger.log(
      `Country Pack 导入完成: ${dto.countryCode} - 成功: ${successCount}, 失败: ${failedCount}`
    );

    return {
      countryCode: dto.countryCode,
      successCount,
      failedCount,
      results,
    };
  }

  /**
   * 从路线模板创建行程
   */
  async createTripFromTemplate(
    templateId: number,
    dto: CreateTripFromTemplateDto,
  ): Promise<any> {
    // 1. 读取模板
    const template = await this.findRouteTemplateById(templateId);
    if (!template) {
      throw new NotFoundException(`Route template with ID ${templateId} not found`);
    }

    const routeDirection = template.routeDirection;
    if (!routeDirection) {
      throw new NotFoundException(`Route direction not found for template ${templateId}`);
    }

    // 2. 解析模板结构
    const dayPlans = template.dayPlans as DayPlan[];
    const durationDays = template.durationDays;

    // 验证日期范围
    const startDate = new Date(dto.startDate);
    const endDate = new Date(dto.endDate);
    const actualDays = Math.floor((endDate.getTime() - startDate.getTime()) / (1000 * 60 * 60 * 24)) + 1;

    if (actualDays !== durationDays) {
      this.logger.warn(
        `Template duration (${durationDays}) does not match actual days (${actualDays}). Using actual days.`
      );
    }

    // 3. 匹配地点（从 place 表检索候选地点）
    const countryCode = dto.destination.toUpperCase().trim();
    const candidates = await this.retrievePlaceCandidates(
      countryCode,
      dayPlans,
      routeDirection
    );

    if (candidates.length === 0) {
      throw new NotFoundException(
        `No places found for destination ${countryCode}. Please ensure place data exists.`
      );
    }

    // 4. LLM 编排（选择 placeId）
    const llmResult = await this.orchestrateWithLLM(
      template,
      dto,
      candidates,
      startDate,
      durationDays
    );

    // 5. 创建行程（使用事务）
    return await this.prisma.$transaction(async (tx) => {
      // 5.1 创建 Trip
      const trip = await tx.trip.create({
        data: {
          id: randomUUID(),
          destination: countryCode,
          startDate: startDate,
          endDate: endDate,
          totalBudget: dto.totalBudget,
          budgetConfig: {
            totalBudget: dto.totalBudget || 0,
            currency: 'CNY',
          } as any,
          pacingConfig: {
            pacePreference: dto.pacePreference || template.defaultPacePreference || 'BALANCED',
            intensity: dto.intensity || 'balanced',
            transport: dto.transport || 'car',
          } as any,
          metadata: {
            createdFromTemplate: templateId,
            templateName: template.nameCN || template.name,
          } as any,
          updatedAt: new Date(),
        } as any,
      });

      // 5.2 创建 TripDay
      const tripDays = [];
      for (let i = 0; i < durationDays; i++) {
        const dayDate = new Date(startDate);
        dayDate.setDate(dayDate.getDate() + i);
        const tripDay = await tx.tripDay.create({
          data: {
            id: randomUUID(),
            tripId: trip.id,
            date: dayDate,
          } as any,
        });
        tripDays.push(tripDay);
      }

      // 5.3 批量创建 ItineraryItem
      const itemsToCreate = [];
      let placesMatched = 0;
      let placesMissing = 0;

      for (const dayResult of llmResult.days || []) {
        const tripDay = tripDays[dayResult.day - 1];
        if (!tripDay) continue;

        const dayDate = new Date(tripDay.date);
        
        for (const [slot, slotData] of Object.entries(dayResult.slots || {})) {
          if (!slotData || !slotData.placeId) {
            if (slotData?.required) {
              placesMissing++;
            }
            continue;
          }

          // 验证 placeId 存在于 candidates
          const candidate = candidates.find(c => c.id === slotData.placeId);
          if (!candidate) {
            this.logger.warn(`Place ID ${slotData.placeId} not found in candidates, skipping`);
            placesMissing++;
            continue;
          }

          placesMatched++;

          // 计算时间
          const { startTime, endTime } = this.calculateSlotTime(dayDate, slot);

          itemsToCreate.push({
            id: randomUUID(),
            tripDayId: tripDay.id,
            placeId: slotData.placeId,
            type: this.mapSlotToItemType(slot, candidate.category),
            startTime: startTime,
            endTime: endTime,
            note: slotData.reason || null,
          });
        }
      }

      // 批量创建
      if (itemsToCreate.length > 0) {
        await tx.itineraryItem.createMany({
          data: itemsToCreate as any,
        });
      }

      // 6. 返回结果
      return {
        trip: {
          id: trip.id,
          destination: trip.destination,
          startDate: trip.startDate,
          endDate: trip.endDate,
          totalBudget: dto.totalBudget || 0,
          status: 'PLANNING',
          pacingConfig: trip.pacingConfig,
          budgetConfig: trip.budgetConfig,
        },
        generatedItems: tripDays.map((tripDay, index) => ({
          day: index + 1,
          date: tripDay.date.toISOString().split('T')[0],
          items: itemsToCreate
            .filter(item => item.tripDayId === tripDay.id)
            .map(item => ({
              placeId: item.placeId,
              type: item.type,
              startTime: item.startTime.toISOString(),
              endTime: item.endTime.toISOString(),
              note: item.note,
              reason: item.note,
            })),
        })),
        stats: {
          totalDays: durationDays,
          totalItems: itemsToCreate.length,
          placesMatched,
          placesMissing,
        },
        warnings: placesMissing > 0
          ? [`${placesMissing} required places could not be matched`]
          : undefined,
      };
    });
  }

  /**
   * 检索候选地点
   */
  private async retrievePlaceCandidates(
    countryCode: string,
    dayPlans: DayPlan[],
    routeDirection: any
  ): Promise<Array<{ id: number; nameCN: string; nameEN?: string; category: string; lat: number; lng: number }>> {
    // 构建类别过滤（从 dayPlans 的主题推断）
    const categories = this.extractCategoriesFromDayPlans(dayPlans);

    const categorySql = categories.length > 0
      ? Prisma.sql`AND p.category = ANY(${categories}::"PlaceCategory"[])`
      : Prisma.sql``;

    // 查询地点
    const rawPlaces = await this.prisma.$queryRaw<Array<{
      id: number;
      nameCN: string;
      nameEN: string | null;
      category: string;
      lat: number;
      lng: number;
    }>>`
      SELECT 
        p.id,
        p."nameCN",
        p."nameEN",
        p.category,
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

    return rawPlaces.map(place => ({
      id: place.id,
      nameCN: place.nameCN,
      nameEN: place.nameEN || undefined,
      category: place.category,
      lat: place.lat,
      lng: place.lng,
    }));
  }

  /**
   * 从 dayPlans 提取类别
   */
  private extractCategoriesFromDayPlans(dayPlans: DayPlan[]): string[] {
    const categories = new Set<string>();
    
    for (const plan of dayPlans) {
      // 根据主题推断类别（简化实现）
      const theme = (plan.theme || '').toLowerCase();
      if (theme.includes('餐厅') || theme.includes('美食')) {
        categories.add('RESTAURANT');
      }
      if (theme.includes('景点') || theme.includes('观光')) {
        categories.add('ATTRACTION');
      }
      if (theme.includes('购物')) {
        categories.add('SHOPPING');
      }
      if (theme.includes('住宿') || theme.includes('酒店')) {
        categories.add('HOTEL');
      }
    }

    // 如果没有匹配到，返回默认类别
    return categories.size > 0
      ? Array.from(categories)
      : ['ATTRACTION', 'RESTAURANT'];
  }

  /**
   * 使用 LLM 编排行程
   */
  private async orchestrateWithLLM(
    template: any,
    dto: CreateTripFromTemplateDto,
    candidates: Array<{ id: number; nameCN: string; nameEN?: string; category: string }>,
    startDate: Date,
    durationDays: number
  ): Promise<any> {
    // 构建 prompt
    const prompt = this.buildOrchestrationPrompt(template, dto, candidates, startDate, durationDays);

    // 定义输出 schema
    const slotItemSchema = {
      type: 'object',
      properties: {
        placeId: { type: 'number' },
        reason: { type: 'string' },
        required: { type: 'boolean' },
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

    try {
      // 注意：这里需要注入 LlmService，暂时返回 mock 数据
      // 实际实现时需要调用 LlmService
      this.logger.warn('LLM orchestration not fully implemented, using mock data');
      
      // Mock 实现：简单分配
      return this.mockLLMOrchestration(template, candidates, durationDays);
    } catch (error: any) {
      this.logger.error('LLM orchestration failed', error);
      throw new Error(`LLM orchestration failed: ${error.message}`);
    }
  }

  /**
   * Mock LLM 编排（临时实现）
   */
  private mockLLMOrchestration(
    template: any,
    candidates: Array<{ id: number; nameCN: string; category: string }>,
    durationDays: number
  ): any {
    const days = [];
    const dayPlans = template.dayPlans as DayPlan[];

    for (let day = 1; day <= durationDays; day++) {
      const dayPlan = dayPlans.find(p => p.day === day) || dayPlans[day - 1];
      
      // 简单分配：根据类别选择地点
      const restaurants = candidates.filter(c => c.category === 'RESTAURANT');
      const attractions = candidates.filter(c => c.category === 'ATTRACTION');

      days.push({
        day,
        slots: {
          morning: attractions.length > 0 ? {
            placeId: attractions[0].id,
            reason: `根据模板主题"${dayPlan?.theme || '探索'}"选择`,
            required: false,
          } : null,
          lunch: restaurants.length > 0 ? {
            placeId: restaurants[0].id,
            reason: '午餐推荐',
            required: false,
          } : null,
          afternoon: attractions.length > 1 ? {
            placeId: attractions[1].id,
            reason: `继续探索"${dayPlan?.theme || '景点'}"`,
            required: false,
          } : null,
          dinner: restaurants.length > 1 ? {
            placeId: restaurants[1]?.id || restaurants[0].id,
            reason: '晚餐推荐',
            required: false,
          } : null,
          evening: null,
        },
      });
    }

    return { days };
  }

  /**
   * 构建编排 prompt
   */
  private buildOrchestrationPrompt(
    template: any,
    dto: CreateTripFromTemplateDto,
    candidates: Array<{ id: number; nameCN: string; nameEN?: string; category: string }>,
    startDate: Date,
    durationDays: number
  ): string {
    return `你是一个旅行规划助手。请根据提供的路线模板和候选地点，为每一天的每个时段选择合适的 placeId。

模板信息：
- 名称：${template.nameCN || template.name}
- 天数：${template.durationDays}
- 默认节奏：${template.defaultPacePreference || 'BALANCED'}
- 每日计划：${JSON.stringify(template.dayPlans, null, 2)}

用户偏好：
- 节奏偏好：${dto.pacePreference || template.defaultPacePreference || 'BALANCED'}
- 强度：${dto.intensity || 'balanced'}
- 交通方式：${dto.transport || 'car'}

候选地点（共 ${candidates.length} 个）：
${candidates.map(c => `- ID: ${c.id}, 名称: ${c.nameCN}${c.nameEN ? ` (${c.nameEN})` : ''}, 类别: ${c.category}`).join('\n')}

请为每一天的每个时段（morning, lunch, afternoon, dinner, evening）选择一个合适的 placeId。
必须从候选地点列表中选择，不能使用列表外的 placeId。
`;
  }

  /**
   * 计算时段时间
   */
  private calculateSlotTime(dayDate: Date, slot: string): { startTime: Date; endTime: Date } {
    const date = new Date(dayDate);
    date.setHours(0, 0, 0, 0);

    const slotTimes: Record<string, { start: number; end: number }> = {
      morning: { start: 9 * 60, end: 12 * 60 },      // 9:00 - 12:00
      lunch: { start: 12 * 60, end: 14 * 60 },        // 12:00 - 14:00
      afternoon: { start: 14 * 60, end: 18 * 60 },   // 14:00 - 18:00
      dinner: { start: 18 * 60, end: 20 * 60 },      // 18:00 - 20:00
      evening: { start: 20 * 60, end: 22 * 60 },    // 20:00 - 22:00
    };

    const times = slotTimes[slot] || { start: 9 * 60, end: 12 * 60 };

    const startTime = new Date(date);
    startTime.setMinutes(times.start);

    const endTime = new Date(date);
    endTime.setMinutes(times.end);

    return { startTime, endTime };
  }

  /**
   * 映射时段和类别到 ItemType
   */
  private mapSlotToItemType(slot: string, category: string): string {
    if (slot === 'lunch' || slot === 'dinner') {
      return 'MEAL_ANCHOR';
    }
    if (category === 'RESTAURANT') {
      return 'MEAL_FLOATING';
    }
    if (category === 'HOTEL') {
      return 'REST';
    }
    return 'ACTIVITY';
  }
}


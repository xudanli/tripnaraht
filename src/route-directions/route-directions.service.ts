// @ts-nocheck
// src/route-directions/route-directions.service.ts
import { Injectable, Logger, NotFoundException } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import { Prisma } from '@prisma/client';
import { randomUUID } from 'crypto';
import { CreateRouteDirectionDto } from './dto/create-route-direction.dto';
import { UpdateRouteDirectionDto } from './dto/update-route-direction.dto';
import { CreateRouteTemplateDto } from './dto/create-route-template.dto';
import { UpdateRouteTemplateDto } from './dto/update-route-template.dto';
import { QueryRouteDirectionDto } from './dto/query-route-direction.dto';
import { ImportCountryPackDto, ImportCountryPackResultDto } from './dto/import-country-pack.dto';
import { RouteDirectionData, RouteTemplateData, DayPlan } from './interfaces/route-direction.interface';
import { CreateTripFromRouteTemplateDto } from './dto/create-trip-from-template.dto';

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
      uuid: randomUUID(),
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

    return this.prisma.routeTemplate.create({
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
    data: UpdateRouteDirectionDto,
  ): Promise<any> {
    // 检查路线方向是否存在
    const existing = await this.prisma.routeDirection.findUnique({
      where: { id },
    });

    if (!existing) {
      throw new NotFoundException(`Route direction with ID ${id} not found`);
    }

    const updateData: Prisma.RouteDirectionUpdateInput = {};

    if (data.countryCode !== undefined) updateData.countryCode = data.countryCode;
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
    
    // 灰度与开关字段
    if (data.status !== undefined) (updateData as any).status = data.status;
    if (data.version !== undefined) (updateData as any).version = data.version;
    if (data.rolloutPercent !== undefined) (updateData as any).rolloutPercent = data.rolloutPercent;
    if (data.audienceFilter !== undefined)
      (updateData as any).audienceFilter = data.audienceFilter as Prisma.InputJsonValue;
    if (data.failureProfile !== undefined)
      (updateData as any).failureProfile = data.failureProfile as Prisma.InputJsonValue;
    if (data.narrative !== undefined)
      (updateData as any).narrative = data.narrative as Prisma.InputJsonValue;
    if (data.antiPersona !== undefined) (updateData as any).antiPersona = data.antiPersona;

    updateData.updatedAt = new Date();

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
    const template = await this.prisma.routeTemplate.findUnique({
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
    return this.prisma.routeTemplate.findFirst({
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

    return this.prisma.routeTemplate.findMany(query);
  }

  /**
   * 更新路线模板
   */
  async updateRouteTemplate(
    id: number,
    dto: UpdateRouteTemplateDto,
  ): Promise<any> {
    // 检查模板是否存在
    const existing = await this.prisma.routeTemplate.findUnique({
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

    return this.prisma.routeTemplate.update({
      where: { id },
      data: updateData,
      include: { routeDirection: true },
    });
  }

  /**
   * 删除路线模板（软删除：设置 isActive = false）
   */
  async deleteRouteTemplate(id: number): Promise<void> {
    const existing = await this.prisma.routeTemplate.findUnique({
      where: { id },
    });

    if (!existing) {
      throw new NotFoundException(`Route template with ID ${id} not found`);
    }

    await this.prisma.routeTemplate.update({
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
    dto: CreateTripFromRouteTemplateDto,
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
  ): Promise<Array<{ id: number; nameCN: string; nameEN?: string; category: string; lat: number; lng: number; uuid?: string; isRequired?: boolean }>> {
    // 1. 收集所有 requiredNodes（Place UUID 或名称），并建立映射
    const requiredNodeIds: string[] = [];
    const requiredNodeNames: string[] = [];
    const requiredNodesSet = new Set<string>(); // 用于快速判断是否为required
    
    for (const plan of dayPlans) {
      if (plan.requiredNodes && plan.requiredNodes.length > 0) {
        for (const node of plan.requiredNodes) {
          requiredNodesSet.add(node);
          // 判断是 UUID 还是名称
          if (node.match(/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i)) {
            requiredNodeIds.push(node);
          } else {
            requiredNodeNames.push(node);
          }
        }
      }
    }

    // 2. 构建类别过滤（从 dayPlans 的主题推断）
    const categories = this.extractCategoriesFromDayPlans(dayPlans);

    const categorySql = categories.length > 0
      ? Prisma.sql`AND p.category = ANY(${categories}::"PlaceCategory"[])`
      : Prisma.sql``;

    // 3. 构建 requiredNodes 过滤（优先匹配 requiredNodes）
    let requiredNodesSql = Prisma.sql``;
    if (requiredNodeIds.length > 0 || requiredNodeNames.length > 0) {
      const conditions: string[] = [];
      if (requiredNodeIds.length > 0) {
        conditions.push(`p.uuid = ANY(${requiredNodeIds}::text[])`);
      }
      if (requiredNodeNames.length > 0) {
        conditions.push(`(p."nameCN" = ANY(${requiredNodeNames}::text[]) OR p."nameEN" = ANY(${requiredNodeNames}::text[]))`);
      }
      requiredNodesSql = Prisma.sql`OR (${Prisma.raw(conditions.join(' OR '))})`;
    }

    // 4. 查询地点（优先返回 requiredNodes，然后返回其他候选）
    // 如果 requiredNodes 存在，优先查询这些节点
    if (requiredNodeIds.length > 0 || requiredNodeNames.length > 0) {
      const requiredPlaces = await this.prisma.$queryRaw<Array<{
        id: number;
        uuid: string;
        nameCN: string;
        nameEN: string | null;
        category: string;
        lat: number;
        lng: number;
      }>>`
        SELECT 
          p.id,
          p.uuid,
          p."nameCN",
          p."nameEN",
          p.category,
          ST_Y(p.location::geometry) as lat,
          ST_X(p.location::geometry) as lng
        FROM "Place" p
        INNER JOIN "City" c ON p."cityId" = c.id
        WHERE c."countryCode" = ${countryCode}
          AND p.location IS NOT NULL
          ${requiredNodeIds.length > 0 
            ? Prisma.sql`AND (p.uuid = ANY(${requiredNodeIds}::text[])`
            : Prisma.sql`AND (FALSE`
          }
          ${requiredNodeNames.length > 0
            ? Prisma.sql`OR p."nameCN" = ANY(${requiredNodeNames}::text[]) OR p."nameEN" = ANY(${requiredNodeNames}::text[]))`
            : Prisma.sql`)`
          }
        ORDER BY p.rating DESC NULLS LAST, p."nameCN" ASC
      `;

      // 如果找到了 requiredNodes，添加到结果中
      if (requiredPlaces.length > 0) {
        const requiredPlaceIds = requiredPlaces.map(p => p.id);
        
        // 继续查询其他候选地点（排除已找到的 requiredNodes）
        const otherPlaces = await this.prisma.$queryRaw<Array<{
          id: number;
          uuid: string;
          nameCN: string;
          nameEN: string | null;
          category: string;
          lat: number;
          lng: number;
        }>>`
          SELECT 
            p.id,
            p.uuid,
            p."nameCN",
            p."nameEN",
            p.category,
            ST_Y(p.location::geometry) as lat,
            ST_X(p.location::geometry) as lng
          FROM "Place" p
          INNER JOIN "City" c ON p."cityId" = c.id
          WHERE c."countryCode" = ${countryCode}
            AND p.location IS NOT NULL
            AND p.id != ALL(${requiredPlaceIds}::int[])
            ${categorySql}
          ORDER BY p.rating DESC NULLS LAST, p."nameCN" ASC
          LIMIT ${200 - requiredPlaces.length}
        `;

        // 合并结果：requiredNodes 在前，并标记 isRequired
        return [
          ...requiredPlaces.map(place => ({
            id: place.id,
            uuid: place.uuid,
            nameCN: place.nameCN,
            nameEN: place.nameEN || undefined,
            category: place.category,
            lat: place.lat,
            lng: place.lng,
            isRequired: true,
          })),
          ...otherPlaces.map(place => ({
            id: place.id,
            uuid: place.uuid,
            nameCN: place.nameCN,
            nameEN: place.nameEN || undefined,
            category: place.category,
            lat: place.lat,
            lng: place.lng,
            isRequired: false,
          })),
        ];
      }
    }

    // 5. 如果没有 requiredNodes 或未找到，使用原来的逻辑
    const rawPlaces = await this.prisma.$queryRaw<Array<{
      id: number;
      uuid: string;
      nameCN: string;
      nameEN: string | null;
      category: string;
      lat: number;
      lng: number;
    }>>`
      SELECT 
        p.id,
        p.uuid,
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
      uuid: place.uuid,
      nameCN: place.nameCN,
      nameEN: place.nameEN || undefined,
      category: place.category,
      lat: place.lat,
      lng: place.lng,
      isRequired: false,
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
    dto: CreateTripFromRouteTemplateDto,
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
   * 改进：每天选择不同的POI，考虑主题和requiredNodes
   */
  private mockLLMOrchestration(
    template: any,
    candidates: Array<{ id: number; nameCN: string; nameEN?: string; category: string; uuid?: string; isRequired?: boolean }>,
    durationDays: number
  ): any {
    const days = [];
    const dayPlans = template.dayPlans as DayPlan[];
    
    // 跟踪已使用的POI，避免重复
    const usedPlaceIds = new Set<number>();
    
    // 按类别分组候选POI
    const restaurants = candidates.filter(c => c.category === 'RESTAURANT');
    const attractions = candidates.filter(c => c.category === 'ATTRACTION');
    const hotels = candidates.filter(c => c.category === 'HOTEL');
    
    // 获取requiredNodes对应的POI
    const getRequiredPOIs = (dayPlan: DayPlan | undefined): number[] => {
      if (!dayPlan?.requiredNodes || dayPlan.requiredNodes.length === 0) {
        return [];
      }
      
      const requiredIds: number[] = [];
      for (const node of dayPlan.requiredNodes) {
        // 尝试通过UUID匹配
        const byUuid = candidates.find(c => c.uuid === node);
        if (byUuid) {
          requiredIds.push(byUuid.id);
          continue;
        }
        
        // 尝试通过名称匹配
        const byName = candidates.find(
          c => c.nameCN === node || c.nameEN === node
        );
        if (byName) {
          requiredIds.push(byName.id);
        }
      }
      return requiredIds;
    };
    
    // 根据主题匹配POI（简单关键词匹配）
    const matchPOIsByTheme = (theme: string | undefined, pool: typeof candidates): typeof candidates => {
      if (!theme) return pool;
      
      const themeLower = theme.toLowerCase();
      return pool.filter(c => {
        const nameCN = (c.nameCN || '').toLowerCase();
        const nameEN = (c.nameEN || '').toLowerCase();
        return nameCN.includes(themeLower) || nameEN.includes(themeLower);
      });
    };
    
    // 获取未使用的POI
    const getUnusedPOI = (pool: typeof candidates, preferred?: typeof candidates): number | null => {
      // 优先使用preferred中的POI
      if (preferred && preferred.length > 0) {
        for (const poi of preferred) {
          if (!usedPlaceIds.has(poi.id)) {
            usedPlaceIds.add(poi.id);
            return poi.id;
          }
        }
      }
      
      // 从pool中选择未使用的
      for (const poi of pool) {
        if (!usedPlaceIds.has(poi.id)) {
          usedPlaceIds.add(poi.id);
          return poi.id;
        }
      }
      
      // 如果都用完了，允许重复使用（但尽量选择不同的）
      if (pool.length > 0) {
        // 选择使用次数最少的（简单实现：随机选择）
        const available = pool.filter(p => !usedPlaceIds.has(p.id));
        if (available.length > 0) {
          const selected = available[Math.floor(Math.random() * available.length)];
          usedPlaceIds.add(selected.id);
          return selected.id;
        }
        // 如果都用了，返回第一个（避免null）
        return pool[0].id;
      }
      
      return null;
    };

    for (let day = 1; day <= durationDays; day++) {
      const dayPlan = dayPlans.find(p => p.day === day) || dayPlans[day - 1];
      const theme = dayPlan?.theme || '';
      
      // 获取requiredNodes对应的POI
      const requiredPOIs = getRequiredPOIs(dayPlan);
      
      // 根据主题匹配的POI
      const themeAttractions = matchPOIsByTheme(theme, attractions);
      const themeRestaurants = matchPOIsByTheme(theme, restaurants);
      
      // 优先使用requiredNodes中的POI
      const requiredAttractions = attractions.filter(a => requiredPOIs.includes(a.id));
      const requiredRestaurants = restaurants.filter(r => requiredPOIs.includes(r.id));
      
      // 选择POI（优先required，其次theme匹配，最后从全部中选择）
      const morningPOI = getUnusedPOI(
        attractions,
        requiredAttractions.length > 0 ? requiredAttractions : themeAttractions
      );
      
      const lunchPOI = getUnusedPOI(
        restaurants,
        requiredRestaurants.length > 0 ? requiredRestaurants : themeRestaurants
      );
      
      const afternoonPOI = getUnusedPOI(
        attractions,
        requiredAttractions.length > 0 ? requiredAttractions : themeAttractions
      );
      
      const dinnerPOI = getUnusedPOI(
        restaurants,
        requiredRestaurants.length > 0 ? requiredRestaurants : themeRestaurants
      );

      days.push({
        day,
        slots: {
          morning: morningPOI ? {
            placeId: morningPOI,
            reason: requiredPOIs.includes(morningPOI) 
              ? `模板要求的必游景点：${candidates.find(c => c.id === morningPOI)?.nameCN || ''}`
              : theme 
                ? `根据主题"${theme}"选择：${candidates.find(c => c.id === morningPOI)?.nameCN || ''}`
                : `探索景点：${candidates.find(c => c.id === morningPOI)?.nameCN || ''}`,
            required: requiredPOIs.includes(morningPOI),
          } : null,
          lunch: lunchPOI ? {
            placeId: lunchPOI,
            reason: requiredPOIs.includes(lunchPOI)
              ? `模板推荐的餐厅：${candidates.find(c => c.id === lunchPOI)?.nameCN || ''}`
              : '午餐推荐',
            required: requiredPOIs.includes(lunchPOI),
          } : null,
          afternoon: afternoonPOI ? {
            placeId: afternoonPOI,
            reason: requiredPOIs.includes(afternoonPOI)
              ? `模板要求的必游景点：${candidates.find(c => c.id === afternoonPOI)?.nameCN || ''}`
              : theme
                ? `继续探索"${theme}"：${candidates.find(c => c.id === afternoonPOI)?.nameCN || ''}`
                : `继续探索：${candidates.find(c => c.id === afternoonPOI)?.nameCN || ''}`,
            required: requiredPOIs.includes(afternoonPOI),
          } : null,
          dinner: dinnerPOI ? {
            placeId: dinnerPOI,
            reason: requiredPOIs.includes(dinnerPOI)
              ? `模板推荐的餐厅：${candidates.find(c => c.id === dinnerPOI)?.nameCN || ''}`
              : '晚餐推荐',
            required: requiredPOIs.includes(dinnerPOI),
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
    dto: CreateTripFromRouteTemplateDto,
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


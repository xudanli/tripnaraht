// @ts-nocheck
// src/route-directions/route-directions.service.ts
import {
  forwardRef,
  Inject,
  Injectable,
  Logger,
  NotFoundException,
  BadRequestException,
  Optional,
} from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import { Prisma } from '@prisma/client';
import { randomUUID } from 'crypto';
import { DateTime } from 'luxon';
import { CreateRouteDirectionDto } from './dto/create-route-direction.dto';
import { UpdateRouteDirectionDto } from './dto/update-route-direction.dto';
import { CreateRouteTemplateDto } from './dto/create-route-template.dto';
import { UpdateRouteTemplateDto } from './dto/update-route-template.dto';
import { QueryRouteDirectionDto } from './dto/query-route-direction.dto';
import { ImportCountryPackDto, ImportCountryPackResultDto } from './dto/import-country-pack.dto';
import { DayPlan } from './interfaces/route-direction.interface';
import { CreateTripFromRouteTemplateDto } from './dto/create-trip-from-template.dto';
import { HikingTrailDetailService } from '../hiking-demo/services/hiking-trail-detail.service';
import {
  mergeRouteDirectionMetadata,
  stripHikingDetailOverrideFromMetadata,
} from '../hiking-demo/utils/hiking-detail-override-merge.util';
import { FitnessAssessmentService } from '../trips/decision/services/fitness-assessment.service';
import { findPlaceByTemplatePoiNames } from './utils/template-poi-place-match.util';
import { TravelTimeEstimatorService } from '../transport/services/travel-time-estimator.service';
import { ProjectMembershipService } from '../identity-governance/services/project-membership.service';

function normalizeBooleanQuery(value: unknown): boolean | undefined {
  if (value === undefined || value === null || value === '') return undefined;
  if (typeof value === 'boolean') return value;
  if (typeof value === 'string') {
    const normalized = value.trim().toLowerCase();
    if (normalized === 'true') return true;
    if (normalized === 'false') return false;
  }
  return undefined;
}

function timezoneForDestination(countryCode: string | undefined | null): string {
  const code = (countryCode || '').toUpperCase().trim();
  const map: Record<string, string> = {
    IS: 'Atlantic/Reykjavik',
    GL: 'America/Godthab',
    SJ: 'Arctic/Longyearbyen',
    NO: 'Europe/Oslo',
    FI: 'Europe/Helsinki',
    SE: 'Europe/Stockholm',
    DK: 'Europe/Copenhagen',
    JP: 'Asia/Tokyo',
    CN: 'Asia/Shanghai',
    GB: 'Europe/London',
    FR: 'Europe/Paris',
    DE: 'Europe/Berlin',
    IT: 'Europe/Rome',
    ES: 'Europe/Madrid',
    US: 'America/New_York',
    CA: 'America/Toronto',
    AU: 'Australia/Sydney',
    NZ: 'Pacific/Auckland',
  };
  return map[code] || 'UTC';
}

@Injectable()
export class RouteDirectionsService {
  private readonly logger = new Logger(RouteDirectionsService.name);

  constructor(
    private prisma: PrismaService,
    private readonly hikingTrailDetail: HikingTrailDetailService,
    @Optional()
    @Inject(forwardRef(() => FitnessAssessmentService))
    private readonly fitnessAssessment?: FitnessAssessmentService,
    private travelTimeEstimator: TravelTimeEstimatorService,
    @Optional() private readonly projectMembership?: ProjectMembershipService,
  ) {}

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
      dayPlans: this.normalizeDayPlans(dto.dayPlans) as Prisma.InputJsonValue,
      defaultPacePreference: dto.defaultPacePreference,
      metadata: dto.metadata as Prisma.InputJsonValue,
      isActive: dto.isActive ?? true,
    };

    const template = await this.prisma.routeTemplate.create({
      data,
      include: { routeDirection: true },
    });

    // 标准化返回的 dayPlans 格式
    template.dayPlans = this.normalizeDayPlans(template.dayPlans);

    return template;
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

    const rows = await (this.prisma.routeDirection.findMany as any)({
      where,
      // templates relation does not exist in Prisma schema
      orderBy: { createdAt: 'desc' },
    });

    const wantsHikingList =
      query.tag === '徒步' ||
      (query.tags && query.tags.includes('徒步')) ||
      query.include?.split(',').map((s) => s.trim()).includes('hikingList');

    if (!wantsHikingList) return rows;

    return rows.map((rd: any) => {
      if (!this.hikingTrailDetail.isHikingRoute(rd)) return rd;
      return {
        ...rd,
        routeDirectionName: rd.name,
        ...this.hikingTrailDetail.buildListCardFields(rd),
      };
    });
  }

  /**
   * 根据 ID 获取路线方向
   */
  async findRouteDirectionById(
    id: number,
    options?: {
      includeHikingDetail?: boolean;
      longestHike?: number;
      userId?: string;
    },
  ): Promise<any> {
    const routeDirection = await this.prisma.routeDirection.findUnique({
      where: { id },
      // templates relation does not exist in Prisma schema
    });

    if (!routeDirection) {
      throw new NotFoundException(`Route direction with ID ${id} not found`);
    }

    const base = {
      ...routeDirection,
      routeDirectionName: routeDirection.name,
    };

    const includeDetail = this.hikingTrailDetail.shouldIncludeDetailForRoute(
      routeDirection,
      options?.includeHikingDetail,
    );
    if (!includeDetail) return base;

    let longestHike = options?.longestHike;
    if (
      longestHike == null &&
      options?.userId &&
      this.fitnessAssessment
    ) {
      const model = await this.fitnessAssessment.loadUserModel(options.userId);
      if (model?.questionnaireLongestHike != null) {
        longestHike = model.questionnaireLongestHike;
      }
    }

    const hikingDetail = await this.hikingTrailDetail.build(routeDirection, {
      longestHike,
    });
    if (!hikingDetail) return base;

    return {
      ...base,
      metadata: stripHikingDetailOverrideFromMetadata(base.metadata),
      hikingDetail,
    };
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
    if (data.metadata !== undefined) {
      updateData.metadata = mergeRouteDirectionMetadata(
        existing.metadata as Record<string, unknown>,
        data.metadata as Record<string, unknown>,
      ) as Prisma.InputJsonValue;
    }
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

    return await this.prisma.$transaction(async (tx) => {
      const updated = await tx.routeDirection.update({
        where: { id },
        data: updateData,
      });
      // 路线方向禁用时，同步禁用其下所有模板（避免父级已下架仍能用模板）
      // 重新启用路线方向时不会自动启用模板，避免覆盖模板侧单独下架状态
      if (data.isActive === false) {
        await tx.routeTemplate.updateMany({
          where: { routeDirectionId: id },
          data: { isActive: false },
        });
      }
      return updated;
    });
  }

  /**
   * 删除路线方向（软删除：设置 isActive = false）
   */
  async deleteRouteDirection(id: number): Promise<void> {
    await this.prisma.$transaction(async (tx) => {
      await tx.routeDirection.update({
        where: { id },
        data: { isActive: false },
      });
      await tx.routeTemplate.updateMany({
        where: { routeDirectionId: id },
        data: { isActive: false },
      });
    });
  }

  /**
   * 标准化 dayPlans 格式
   * 将旧格式（嵌套数组）转换为新格式（对象数组）
   */
  private normalizeDayPlans(dayPlans: any): any[] {
    if (!dayPlans || !Array.isArray(dayPlans) || dayPlans.length === 0) {
      return [];
    }

    const firstItem = dayPlans[0];

    // 检查是否是对象数组格式（新格式）
    if (typeof firstItem === 'object' && firstItem !== null && !Array.isArray(firstItem)) {
      // 确保每个对象都有 day 字段，并保留所有其他字段（包括 requiredNodes）
      return dayPlans.map((plan: any, index: number) => {
        // 使用展开运算符保留所有字段，然后确保 day 字段存在
        return {
          ...plan,  // 保留所有原始字段（requiredNodes, theme, pois 等）
          day: plan.day ?? index + 1,  // 确保 day 字段存在
        };
      });
    }

    // 检查是否是嵌套数组格式（旧格式）
    if (Array.isArray(firstItem)) {
      // 转换为新格式
      return dayPlans.map((nodes: string[], index: number) => ({
        day: index + 1,
        requiredNodes: nodes || [],
      }));
    }

    // 未知格式，返回空数组
    return [];
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

    // 标准化 dayPlans 格式
    template.dayPlans = this.normalizeDayPlans(template.dayPlans);

    return template;
  }

  /**
   * 检查路线模板的迁移状态
   * @param templateId 路线模板ID
   */
  async getTemplateMigrationStatus(templateId: number): Promise<{
    templateId: number;
    templateName: string;
    usesOldFormat: boolean;
    dayPlans: Array<{
      day: number;
      theme?: string;
      hasRequiredNodes: boolean;
      requiredNodesCount: number;
      hasPois: boolean;
      poisCount: number;
      needsMigration: boolean;
      missingPoiIds?: number[];
    }>;
    needsMigration: boolean;
  }> {
    const template = await this.findRouteTemplateById(templateId);
    const dayPlans = this.normalizeDayPlans(template.dayPlans) as any[];

    const dayPlanStatuses = await Promise.all(
      dayPlans.map(async (plan: any) => {
        const day = plan.day || 1;
        const requiredNodes = plan.requiredNodes || [];
        const pois = plan.pois || [];
        
        const hasRequiredNodes = Array.isArray(requiredNodes) && requiredNodes.length > 0;
        const hasPois = Array.isArray(pois) && pois.length > 0;
        const needsMigration = hasRequiredNodes && !hasPois;

        // 如果需要迁移，检查哪些POI ID在数据库中不存在
        let missingPoiIds: number[] = [];
        if (needsMigration) {
          const nodeIds = requiredNodes
            .map((id: any) => {
              if (typeof id === 'number') return id;
              if (typeof id === 'string') {
                const numId = parseInt(id, 10);
                return isNaN(numId) ? null : numId;
              }
              return null;
            })
            .filter((id: any): id is number => id !== null);

          if (nodeIds.length > 0) {
            const existingPlaces = await this.prisma.place.findMany({
              where: { id: { in: nodeIds } },
              select: { id: true },
            });
            const existingIds = new Set(existingPlaces.map(p => p.id));
            missingPoiIds = nodeIds.filter(id => !existingIds.has(id));
          }
        }

        return {
          day,
          theme: plan.theme,
          hasRequiredNodes,
          requiredNodesCount: requiredNodes.length,
          hasPois,
          poisCount: pois.length,
          needsMigration,
          ...(missingPoiIds.length > 0 && { missingPoiIds }),
        };
      })
    );

    const needsMigration = dayPlanStatuses.some(status => status.needsMigration);

    return {
      templateId: template.id,
      templateName: template.nameCN || template.name || 'Unnamed',
      usesOldFormat: needsMigration,
      dayPlans: dayPlanStatuses,
      needsMigration,
    };
  }

  /**
   * 根据路线模板获取可用POI列表
   * @param templateId 路线模板ID
   * @param options 查询选项（类别、搜索关键词、分页）
   */
  async getAvailablePoisByTemplate(
    templateId: number,
    options?: {
      category?: string;
      search?: string;
      page?: number;
      limit?: number;
    }
  ) {
    // 1. 查询路线模板
    const template = await this.findRouteTemplateById(templateId);
    
    // 2. 获取关联的路线方向
    const routeDirection = template.routeDirection;
    if (!routeDirection) {
      throw new NotFoundException(`Route direction not found for template ${templateId}`);
    }

    // 3. 获取国家代码
    const countryCode = routeDirection.countryCode;
    if (!countryCode) {
      throw new BadRequestException(`Country code not found for route direction ${routeDirection.id}`);
    }

    // 4. 构建查询条件
    const page = options?.page || 1;
    const limit = Math.min(options?.limit || 50, 100);
    const skip = (page - 1) * limit;

    const where: Prisma.PlaceWhereInput = {
      OR: [
        { City: { countryCode } },
        { metadata: { path: ['countryCode'], equals: countryCode } },
      ],
    };

    // 类别筛选
    if (options?.category) {
      where.category = options.category as any;
    }

    // 搜索关键词
    if (options?.search) {
      const searchCondition = {
        OR: [
          { nameCN: { contains: options.search, mode: 'insensitive' } },
          { nameEN: { contains: options.search, mode: 'insensitive' } },
          { address: { contains: options.search, mode: 'insensitive' } },
        ],
      };
      where.AND = [
        {
          OR: [
            { City: { countryCode } },
            { metadata: { path: ['countryCode'], equals: countryCode } },
          ],
        },
        searchCondition,
      ];
    }

    try {
      // 5. 查询POI列表
      const [total, places] = await Promise.all([
        this.prisma.place.count({ where }),
        this.prisma.place.findMany({
          where,
          skip,
          take: limit,
          orderBy: { rating: 'desc' },
          include: {
            City: {
              select: {
                id: true,
                name: true,
                countryCode: true,
              },
            },
          },
        }),
      ]);

      // 6. 批量提取坐标
      const placeIds = places.map(p => p.id);
      const locationMap = new Map<number, { lat: number; lng: number }>();
      
      if (placeIds.length > 0) {
        try {
          const locationResults = await this.prisma.$queryRaw<Array<{ id: number; lat: number; lng: number }>>`
            SELECT 
              id,
              ST_Y(location::geometry) as lat,
              ST_X(location::geometry) as lng
            FROM "Place"
            WHERE id = ANY(${placeIds}::int[]) AND location IS NOT NULL
          `;
          
          locationResults.forEach(result => {
            locationMap.set(result.id, {
              lat: Number(result.lat),
              lng: Number(result.lng),
            });
          });
        } catch (error: any) {
          this.logger.warn(`批量提取坐标失败: ${error.message}`);
        }
      }

      // 7. 转换为响应格式
      const placeList = places.map(place => {
        const coords: { lat: number; lng: number } | null = locationMap.get(place.id) || null;
        const city = place.City;

        return {
          id: place.id,
          uuid: place.uuid,
          nameCN: place.nameCN,
          nameEN: place.nameEN,
          category: place.category,
          rating: place.rating,
          location: coords ? { lat: coords.lat, lng: coords.lng } : null,
          city: city ? {
            id: city.id,
            name: city.name,
            countryCode: city.countryCode,
          } : null,
        };
      });

      return {
        places: placeList,
        total,
        page,
        limit,
        routeDirection: {
          id: routeDirection.id,
          countryCode: routeDirection.countryCode,
          nameCN: routeDirection.nameCN,
        },
      };
    } catch (error: any) {
      this.logger.error(`获取可用POI列表失败: ${error.message}`, error.stack);
      throw error;
    }
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
    isActive?: boolean | string;
    limit?: number;
    offset?: number;
  }): Promise<any[]> {
    const where: any = {};
    const isActive = normalizeBooleanQuery(options?.isActive);

    if (options?.routeDirectionId !== undefined) {
      where.routeDirectionId = options.routeDirectionId;
    }

    if (options?.durationDays !== undefined) {
      where.durationDays = options.durationDays;
    }

    if (isActive !== undefined) {
      where.isActive = isActive;
      if (isActive === true) {
        where.routeDirection = {
          isActive: true,
          OR: [{ status: 'active' }, { status: null }],
        };
      }
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

    const templates = await this.prisma.routeTemplate.findMany(query);

    // 标准化每个模板的 dayPlans 格式
    return templates.map(template => ({
      ...template,
      dayPlans: this.normalizeDayPlans(template.dayPlans),
    }));
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
      // 调试日志：记录原始输入数据
      this.logger.debug(`Original dayPlans input for template ${id}:`, JSON.stringify(dto.dayPlans, null, 2));
      
      // 验证数据完整性
      dto.dayPlans.forEach((plan: any, index: number) => {
        if (!plan.requiredNodes || (Array.isArray(plan.requiredNodes) && plan.requiredNodes.length === 0)) {
          this.logger.warn(`⚠️  Day ${plan.day || index + 1} has empty requiredNodes in input data`);
        }
      });
      
      // 标准化 dayPlans 格式（确保是对象数组格式）
      const normalizedDayPlans = this.normalizeDayPlans(dto.dayPlans);
      
      // 验证标准化后的数据
      normalizedDayPlans.forEach((plan: any, index: number) => {
        if (!plan.pois || (Array.isArray(plan.pois) && plan.pois.length === 0)) {
          this.logger.warn(`⚠️  Day ${plan.day || index + 1} has no pois after normalization. Please use pois array format.`);
        }
      });
      
      // 调试日志：检查标准化后的数据
      this.logger.debug(`Normalized dayPlans for template ${id}:`, JSON.stringify(normalizedDayPlans, null, 2));
      
      updateData.dayPlans = normalizedDayPlans as Prisma.InputJsonValue;
    }
    if (dto.defaultPacePreference !== undefined) {
      updateData.defaultPacePreference = dto.defaultPacePreference;
    }
    if (dto.metadata !== undefined) {
      updateData.metadata = dto.metadata as Prisma.InputJsonValue;
    }
    if (dto.isActive !== undefined) updateData.isActive = dto.isActive;

    updateData.updatedAt = new Date();

    // 调试日志：记录即将保存到数据库的数据
    if (updateData.dayPlans) {
      this.logger.debug(`About to save dayPlans to database for template ${id}:`, JSON.stringify(updateData.dayPlans, null, 2));
    }

    const updated = await this.prisma.routeTemplate.update({
      where: { id },
      data: updateData,
      include: { routeDirection: true },
    });

    // 调试日志：记录数据库返回的数据
    this.logger.debug(`Database returned dayPlans for template ${id}:`, JSON.stringify(updated.dayPlans, null, 2));

    // 标准化返回的 dayPlans 格式
    updated.dayPlans = this.normalizeDayPlans(updated.dayPlans);

    // 调试日志：记录标准化后的返回数据
    this.logger.debug(`Normalized return dayPlans for template ${id}:`, JSON.stringify(updated.dayPlans, null, 2));

    return updated;
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
   * 物理删除路线模板（从数据库中彻底删除）
   * @param id 路线模板ID
   */
  async hardDeleteRouteTemplate(id: number): Promise<void> {
    const existing = await this.prisma.routeTemplate.findUnique({
      where: { id },
    });

    if (!existing) {
      throw new NotFoundException(`Route template with ID ${id} not found`);
    }

    await this.prisma.routeTemplate.delete({
      where: { id },
    });
  }

  /**
   * 向路线模板的指定日期添加 POI
   */
  async addPoiToTemplate(
    templateId: number,
    dto: { 
      day: number; 
      poiId: number; 
      required?: boolean; 
      priority?: 'MUST_SEE' | 'HIGH' | 'MEDIUM' | 'LOW' | 'OPTIONAL';
      order?: number; 
      durationMinutes?: number;
      priorityReason?: string;
    },
  ): Promise<any> {
    // 1. 检查模板是否存在
    const template = await this.prisma.routeTemplate.findUnique({
      where: { id: templateId },
    });

    if (!template) {
      throw new NotFoundException(`Route template with ID ${templateId} not found`);
    }

    // 2. 检查 POI 是否存在
    const place = await this.prisma.place.findUnique({
      where: { id: dto.poiId },
      select: {
        id: true,
        uuid: true,
        nameCN: true,
        nameEN: true,
        category: true,
        address: true,
        rating: true,
        description: true,
      },
    });

    if (!place) {
      throw new NotFoundException(`Place with ID ${dto.poiId} not found`);
    }

    // 3. 解析 dayPlans（标准化格式）
    const dayPlans = this.normalizeDayPlans(template.dayPlans);
    const dayPlan = dayPlans.find((dp: any) => dp.day === dto.day);

    if (!dayPlan) {
      throw new NotFoundException(`Day ${dto.day} not found in route template`);
    }

    // 4. 检查 POI 是否已存在
    const existingPois = dayPlan.pois || [];
    const existingPoi = existingPois.find(
      (p: any) => p.id === dto.poiId || p.uuid === place.uuid,
    );

    if (existingPoi) {
      throw new BadRequestException(
        `POI ${place.nameCN} (ID: ${dto.poiId}) already exists in day ${dto.day}`,
      );
    }

    // 5. 添加 POI
    // 处理优先级：如果设置了 priority，根据 priority 推断 required
    // 如果设置了 required 但没有 priority，根据 required 推断 priority（向后兼容）
    const priority = dto.priority || (dto.required ? 'MUST_SEE' : 'MEDIUM');
    const required = dto.required ?? (priority === 'MUST_SEE');

    const newPoi: any = {
      id: place.id,
      uuid: place.uuid,
      nameCN: place.nameCN,
      nameEN: place.nameEN || undefined,
      category: place.category,
      required,
      priority,
      order: dto.order || existingPois.length + 1,
    };

    if (place.address) newPoi.address = place.address;
    if (place.rating) newPoi.rating = place.rating;
    if (place.description) newPoi.description = place.description;
    // 🆕 保存时间字段
    if (dto.startTime) newPoi.startTime = dto.startTime;
    if (dto.endTime) newPoi.endTime = dto.endTime;
    if (dto.durationMinutes) newPoi.durationMinutes = dto.durationMinutes;
    if (dto.priorityReason) newPoi.priorityReason = dto.priorityReason;

    existingPois.push(newPoi);

    // 6. 更新 dayPlan
    dayPlan.pois = existingPois;

    // 7. 更新模板
    const updatedTemplate = await this.prisma.routeTemplate.update({
      where: { id: templateId },
      data: {
        dayPlans: dayPlans as any,
        updatedAt: new Date(),
      },
      include: {
        routeDirection: true,
      },
    });

    // 标准化返回的 dayPlans 格式
    updatedTemplate.dayPlans = this.normalizeDayPlans(updatedTemplate.dayPlans);

    // 8. 更新 RouteDirection 的 signaturePois.examples
    const routeDirection = await this.prisma.routeDirection.findUnique({
      where: { id: template.routeDirectionId },
      select: { signaturePois: true },
    });

    if (routeDirection) {
      const currentSigPois = (routeDirection.signaturePois as any) || {};
      const existingExamples = currentSigPois.examples || [];
      if (!existingExamples.includes(place.id)) {
        const allExamples = [...existingExamples, place.id];
        await this.prisma.routeDirection.update({
          where: { id: template.routeDirectionId },
          data: {
            signaturePois: {
              ...currentSigPois,
              examples: allExamples,
            } as any,
          },
        });
      }
    }

    return updatedTemplate;
  }

  /**
   * 从路线模板的指定日期移除 POI
   */
  async removePoiFromTemplate(
    templateId: number,
    dto: { day: number; poiId?: number; poiUuid?: string; index?: number },
  ): Promise<any> {
    // 1. 检查模板是否存在
    const template = await this.prisma.routeTemplate.findUnique({
      where: { id: templateId },
    });

    if (!template) {
      throw new NotFoundException(`Route template with ID ${templateId} not found`);
    }

    // 2. 解析 dayPlans（标准化格式）
    const dayPlans = this.normalizeDayPlans(template.dayPlans);
    const dayPlan = dayPlans.find((dp: any) => dp.day === dto.day);

    if (!dayPlan) {
      throw new NotFoundException(`Day ${dto.day} not found in route template`);
    }

    // 3. 查找要移除的 POI
    const existingPois = dayPlan.pois || [];
    let poiToRemove: any = null;
    let removeIndex = -1;

    if (dto.index !== undefined) {
      // 通过索引移除
      if (dto.index < 0 || dto.index >= existingPois.length) {
        throw new BadRequestException(
          `Index ${dto.index} is out of range. Day ${dto.day} has ${existingPois.length} POIs.`,
        );
      }
      removeIndex = dto.index;
      poiToRemove = existingPois[removeIndex];
    } else if (dto.poiId) {
      // 通过 ID 移除
      removeIndex = existingPois.findIndex((p: any) => p.id === dto.poiId);
      if (removeIndex === -1) {
        throw new NotFoundException(
          `POI with ID ${dto.poiId} not found in day ${dto.day}`,
        );
      }
      poiToRemove = existingPois[removeIndex];
    } else if (dto.poiUuid) {
      // 通过 UUID 移除
      removeIndex = existingPois.findIndex((p: any) => p.uuid === dto.poiUuid);
      if (removeIndex === -1) {
        throw new NotFoundException(
          `POI with UUID ${dto.poiUuid} not found in day ${dto.day}`,
        );
      }
      poiToRemove = existingPois[removeIndex];
    } else {
      throw new BadRequestException('Please provide poiId, poiUuid, or index');
    }

    // 4. 移除 POI
    const updatedPois = existingPois.filter((_: any, idx: number) => idx !== removeIndex);

    // 5. 更新 dayPlan
    dayPlan.pois = updatedPois.length > 0 ? updatedPois : undefined;

    // 6. 更新模板
    const updatedTemplate = await this.prisma.routeTemplate.update({
      where: { id: templateId },
      data: {
        dayPlans: dayPlans as any,
        updatedAt: new Date(),
      },
      include: {
        routeDirection: true,
      },
    });

    // 标准化返回的 dayPlans 格式
    updatedTemplate.dayPlans = this.normalizeDayPlans(updatedTemplate.dayPlans);

    return {
      template: updatedTemplate,
      removedPoi: poiToRemove,
    };
  }

  /**
   * 更新路线模板中的 POI（支持优先级更新）
   */
  async updatePoiInTemplate(
    templateId: number,
    dto: { 
      day: number; 
      poiId: number; 
      required?: boolean;
      priority?: 'MUST_SEE' | 'HIGH' | 'MEDIUM' | 'LOW' | 'OPTIONAL';
      startTime?: string;
      endTime?: string;
      durationMinutes?: number;
      priorityReason?: string;
    },
  ): Promise<any> {
    // 1. 检查模板是否存在
    const template = await this.prisma.routeTemplate.findUnique({
      where: { id: templateId },
    });

    if (!template) {
      throw new NotFoundException(`Route template with ID ${templateId} not found`);
    }

    // 2. 解析 dayPlans（标准化格式）
    const dayPlans = this.normalizeDayPlans(template.dayPlans);
    const dayPlan = dayPlans.find((dp: any) => dp.day === dto.day);

    if (!dayPlan) {
      throw new NotFoundException(`Day ${dto.day} not found in route template`);
    }

    // 3. 查找要更新的 POI
    const existingPois = dayPlan.pois || [];
    const poiIndex = existingPois.findIndex((p: any) => p.id === dto.poiId);

    if (poiIndex === -1) {
      throw new NotFoundException(
        `POI with ID ${dto.poiId} not found in day ${dto.day}`,
      );
    }

    const existingPoi = existingPois[poiIndex];

    // 4. 更新 POI 字段
    if (dto.priority !== undefined) {
      existingPoi.priority = dto.priority;
      // 同步更新 required 字段以保持一致性
      if (dto.required === undefined) {
        existingPoi.required = dto.priority === 'MUST_SEE';
      }
    }
    if (dto.required !== undefined) {
      existingPoi.required = dto.required;
      // 如果只设置了 required 但没有 priority，推断 priority
      if (dto.priority === undefined && existingPoi.priority === undefined) {
        existingPoi.priority = dto.required ? 'MUST_SEE' : 'MEDIUM';
      }
    }
    // 🆕 更新开始和结束时间
    if (dto.startTime !== undefined) {
      existingPoi.startTime = dto.startTime;
    }
    if (dto.endTime !== undefined) {
      existingPoi.endTime = dto.endTime;
    }
    if (dto.durationMinutes !== undefined) {
      existingPoi.durationMinutes = dto.durationMinutes;
    }
    if (dto.priorityReason !== undefined) {
      existingPoi.priorityReason = dto.priorityReason;
    }

    // 5. 更新 dayPlan
    dayPlan.pois = existingPois;

    // 6. 更新模板
    const updatedTemplate = await this.prisma.routeTemplate.update({
      where: { id: templateId },
      data: {
        dayPlans: dayPlans as any,
        updatedAt: new Date(),
      },
      include: {
        routeDirection: true,
      },
    });

    // 标准化返回的 dayPlans 格式
    updatedTemplate.dayPlans = this.normalizeDayPlans(updatedTemplate.dayPlans);

    return {
      template: updatedTemplate,
      updatedPoi: existingPoi,
    };
  }

  /**
   * 批量更新路线模板中的 POI 优先级
   */
  async bulkUpdatePoiPriority(
    templateId: number,
    updates: Array<{
      day: number;
      poiId: number;
      priority: 'MUST_SEE' | 'HIGH' | 'MEDIUM' | 'LOW' | 'OPTIONAL';
      priorityReason?: string;
    }>,
  ): Promise<any> {
    // 1. 检查模板是否存在
    const template = await this.prisma.routeTemplate.findUnique({
      where: { id: templateId },
    });

    if (!template) {
      throw new NotFoundException(`Route template with ID ${templateId} not found`);
    }

    // 2. 解析 dayPlans（标准化格式）
    const dayPlans = this.normalizeDayPlans(template.dayPlans);
    const updatedPois: any[] = [];
    const errors: string[] = [];

    // 3. 批量更新
    for (const update of updates) {
      const dayPlan = dayPlans.find((dp: any) => dp.day === update.day);
      if (!dayPlan) {
        errors.push(`Day ${update.day} not found`);
        continue;
      }

      const existingPois = dayPlan.pois || [];
      const poi = existingPois.find((p: any) => p.id === update.poiId);
      if (!poi) {
        errors.push(`POI ${update.poiId} not found in day ${update.day}`);
        continue;
      }

      poi.priority = update.priority;
      poi.required = update.priority === 'MUST_SEE';
      if (update.priorityReason) {
        poi.priorityReason = update.priorityReason;
      }
      updatedPois.push({ day: update.day, poi });
    }

    // 4. 更新模板
    const updatedTemplate = await this.prisma.routeTemplate.update({
      where: { id: templateId },
      data: {
        dayPlans: dayPlans as any,
        updatedAt: new Date(),
      },
      include: {
        routeDirection: true,
      },
    });

    // 标准化返回的 dayPlans 格式
    updatedTemplate.dayPlans = this.normalizeDayPlans(updatedTemplate.dayPlans);

    return {
      template: updatedTemplate,
      updatedPois,
      errors: errors.length > 0 ? errors : undefined,
    };
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
    userId?: string | null, // 用户ID（可选，如果已认证）
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
    const dayPlans = this.normalizeDayPlans(template.dayPlans) as DayPlan[];
    const durationDays = template.durationDays;

    // 调试日志：检查 dayPlans 中的 pois 数据
    this.logger.debug(`Template ${templateId} dayPlans after normalization:`, JSON.stringify(dayPlans, null, 2));
    let totalPois = 0;
    dayPlans.forEach((plan, index) => {
      const pois = plan.pois || [];
      totalPois += pois.length;
      if (pois.length > 0) {
        this.logger.debug(`Day ${plan.day || index + 1} has ${pois.length} POIs:`, JSON.stringify(pois.map((p: any) => ({ id: p.id, uuid: p.uuid, nameCN: p.nameCN, required: p.required })), null, 2));
      }
    });
    this.logger.debug(`Total POIs in template: ${totalPois}`);

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
    this.logger.debug(`Retrieving place candidates for country ${countryCode} with ${totalPois} POIs from template`);
    const candidates = await this.retrievePlaceCandidates(
      countryCode,
      dayPlans,
      routeDirection
    );
    this.logger.debug(`Retrieved ${candidates.length} candidates, ${candidates.filter(c => c.isRequired).length} are required`);

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
    // 生成行程名称（如果未提供，使用默认名称）
    const tripName = dto.name?.trim() || this.generateDefaultTripName({
      destination: countryCode,
      startDate: dto.startDate,
    });

    return await this.prisma.$transaction(async (tx) => {
      // 5.1 创建 Trip
      const trip = await tx.trip.create({
        data: {
          id: randomUUID(),
          name: tripName, // 新增：行程名称
          destination: countryCode,
          startDate: startDate,
          endDate: endDate,
          status: 'PLANNING', // 显式设置状态，确保行程可以显示在列表中
          budgetConfig: {
            totalBudget: dto.totalBudget || 0,
            currency: dto.currency || 'CNY',
          } as any,
          pacingConfig: {
            pacePreference: dto.pacePreference || template.defaultPacePreference || 'BALANCED',
            intensity: dto.intensity || 'balanced',
            transport: dto.transport || 'car',
          } as any,
          metadata: {
            createdFromTemplate: templateId,
            templateName: template.nameCN || template.name,
            timezone: timezoneForDestination(countryCode),
          } as any,
          updatedAt: new Date(),
        } as any,
      });

      // 5.1.1 创建 TripCollaborator 记录（如果提供了用户ID）
      // 这确保行程可以在行程列表中显示（通过用户筛选）
      if (userId) {
        try {
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
          this.logger.debug(`Created TripCollaborator for trip ${trip.id} with userId ${userId}`);
        } catch (error: any) {
          // 如果用户不存在或其他错误，记录警告但不阻止行程创建
          this.logger.warn(`Failed to create TripCollaborator for trip ${trip.id}: ${error.message}`);
        }
      } else {
        this.logger.warn(`No userId provided when creating trip from template ${templateId}. Trip will not be associated with any user.`);
      }

      // 5.2 创建 TripDay（保存主题到metadata）
      const tripDays = [];
      const dayThemes: Record<number, string> = {}; // 用于保存主题到Trip metadata
      
      for (let i = 0; i < durationDays; i++) {
        const dayDate = new Date(startDate);
        dayDate.setDate(dayDate.getDate() + i);
        const dayNumber = i + 1;
        const dayResult = llmResult.days?.find(d => d.day === dayNumber);
        // 优先从llmResult获取主题，然后从dayPlans中查找（使用day字段匹配）
        const dayPlan = dayPlans.find(p => p.day === dayNumber) || dayPlans[i];
        const theme = dayResult?.theme || dayPlan?.theme || '';
        
        // 保存主题到dayThemes（即使为空字符串也保存，用于调试）
        dayThemes[dayNumber] = theme;
        
        // 调试日志
        if (!theme) {
          this.logger.warn(`Day ${dayNumber} has no theme. dayResult.theme=${dayResult?.theme}, dayPlan.theme=${dayPlan?.theme}`);
        } else {
          this.logger.debug(`Day ${dayNumber} theme: ${theme}`);
        }
        
        const tripDay = await tx.tripDay.create({
          data: {
            id: randomUUID(),
            tripId: trip.id,
            date: dayDate,
          } as any,
        });
        tripDays.push(tripDay);
      }
      
      // 更新Trip的metadata，保存每天的主题（在事务中更新）
      // 即使dayThemes中有空字符串，也保存（用于调试和追踪）
      const existingMetadata = trip.metadata as any || {};
      const updatedMetadata = {
        ...existingMetadata,
        dayThemes: dayThemes,
      };
      await tx.trip.update({
        where: { id: trip.id },
        data: { metadata: updatedMetadata as any },
      });
      // 更新内存中的trip对象，以便后续使用
      trip.metadata = updatedMetadata as any;
      
      // 调试日志
      this.logger.debug(`Saved dayThemes to Trip metadata:`, JSON.stringify(dayThemes));

      // 5.3 批量创建 ItineraryItem（考虑交通时间）
      const itemsToCreate = [];
      let placesMatched = 0;
      let placesMissing = 0;

      // 🆕 获取所有candidates的坐标信息（用于计算交通时间）
      const candidateIds = candidates.map(c => c.id);
      const candidateCoordsMap = new Map<number, { lat: number; lng: number }>();
      
      if (candidateIds.length > 0) {
        try {
          const locationResults = await tx.$queryRaw<Array<{ id: number; lat: number; lng: number }>>`
            SELECT 
              id,
              ST_Y(location::geometry) as lat,
              ST_X(location::geometry) as lng
            FROM "Place"
            WHERE id = ANY(${candidateIds}::int[]) AND location IS NOT NULL
          `;
          
          locationResults.forEach(result => {
            candidateCoordsMap.set(result.id, {
              lat: Number(result.lat),
              lng: Number(result.lng),
            });
          });
        } catch (error: any) {
          this.logger.warn(`批量提取坐标失败: ${error.message}`);
        }
      }

      // 🆕 跟踪前一个行程项的信息（用于计算交通时间）
      let previousItemEndTime: Date | null = null;
      let previousPlaceCoords: { lat: number; lng: number } | null = null;
      
      for (const dayResult of llmResult.days || []) {
        const tripDay = tripDays[dayResult.day - 1];
        if (!tripDay) continue;

        const dayDate = new Date(tripDay.date);
        const slots = dayResult.slots || {};
        
        // 🆕 每天开始时重置前一个行程项信息（跨天时）
        if (previousItemEndTime && new Date(previousItemEndTime).toDateString() !== dayDate.toDateString()) {
          previousItemEndTime = null;
          previousPlaceCoords = null;
        }
        
        // 🆕 收集当天的所有行程项，然后按 startTime 排序
        const dayItems: Array<{
          id: string;
          tripDayId: string;
          placeId: number;
          type: string;
          startTime: Date;
          endTime: Date;
          note: string | null;
        }> = [];
        
        // 按照固定的slot顺序处理
        const slotOrder = ['morning', 'lunch', 'afternoon', 'dinner', 'evening'];
        for (const slot of slotOrder) {
          const slotData = slots[slot];
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

          // 🆕 优先使用模板中的时间，如果没有则计算时间
          let startTime: Date;
          let endTime: Date;
          
          // 如果模板中提供了 startTime 和 endTime，直接使用
          if (slotData.startTime && slotData.endTime) {
            // 将模板中的时间字符串转换为 Date 对象
            // 模板中的时间可能是相对时间（如 "09:00"）或绝对时间（ISO 8601）
            const templateStartTime = new Date(slotData.startTime);
            const templateEndTime = new Date(slotData.endTime);
            
            // 如果时间是相对时间（只有时间部分），需要结合日期
            if (isNaN(templateStartTime.getTime()) || isNaN(templateEndTime.getTime())) {
              // 尝试解析为 HH:mm 格式
              const startMatch = slotData.startTime.match(/(\d{1,2}):(\d{2})/);
              const endMatch = slotData.endTime.match(/(\d{1,2}):(\d{2})/);
              
              if (startMatch && endMatch) {
                const [, startHour, startMin] = startMatch.map(Number);
                const [, endHour, endMin] = endMatch.map(Number);
                startTime = this.createDestinationDateTime(dayDate, startHour, startMin, countryCode);
                endTime = this.createDestinationDateTime(dayDate, endHour, endMin, countryCode);
              } else {
                // 解析失败，使用默认计算逻辑
                const slotDefaultTime = this.calculateSlotTime(dayDate, slot, countryCode);
                startTime = slotDefaultTime.startTime;
                endTime = slotDefaultTime.endTime;
              }
            } else {
              // 是有效的 Date 对象，直接使用
              startTime = templateStartTime;
              endTime = templateEndTime;
            }
            // 🆕 即使使用模板时间，也需确保不早于「前一景点结束 + 路程 + 缓冲」，否则会出现活动间歇为 0 的异常
            const currentPlaceCoords = candidateCoordsMap.get(slotData.placeId);
            if (previousItemEndTime && previousPlaceCoords && currentPlaceCoords) {
              const travelTimeMinutes = this.calculateTravelTimeBetweenPlaces(
                previousPlaceCoords,
                currentPlaceCoords
              );
              const bufferMinutes = 15;
              const earliestStart = new Date(
                previousItemEndTime.getTime() + (travelTimeMinutes + bufferMinutes) * 60 * 1000
              );
              if (startTime < earliestStart) {
                const durationMs = endTime.getTime() - startTime.getTime();
                startTime = new Date(earliestStart.getTime());
                endTime = new Date(startTime.getTime() + durationMs);
                this.logger.debug(
                  `行程时间调整: 考虑路程 ${travelTimeMinutes}min，将开始时间从模板时间延后至 ${startTime.toISOString()}`
                );
              }
            }
          } else {
            // 模板中没有提供时间，使用计算逻辑（考虑交通时间）
            const slotDefaultTime = this.calculateSlotTime(dayDate, slot, countryCode);
            const currentPlaceCoords = candidateCoordsMap.get(slotData.placeId);
            
            if (previousItemEndTime && previousPlaceCoords && currentPlaceCoords) {
              // 计算从前一个地点到当前地点的交通时间
              const travelTimeMinutes = this.calculateTravelTimeBetweenPlaces(
                previousPlaceCoords,
                currentPlaceCoords
              );
              
              // 开始时间 = 前一个行程项结束时间 + 交通时间 + 缓冲时间（15分钟）
              const bufferMinutes = 15;
              const calculatedStartTime = new Date(
                previousItemEndTime.getTime() + (travelTimeMinutes + bufferMinutes) * 60 * 1000
              );
              
              // 确保开始时间不早于slot的默认开始时间
              if (calculatedStartTime < slotDefaultTime.startTime) {
                startTime = slotDefaultTime.startTime;
              } else if (calculatedStartTime >= slotDefaultTime.endTime) {
                this.logger.warn(
                  `Calculated start time ${calculatedStartTime.toISOString()} exceeds slot end time for ${slot}, using slot default start time`
                );
                startTime = slotDefaultTime.startTime;
              } else {
                startTime = calculatedStartTime;
              }
              
              // 计算结束时间：优先使用模板的 durationMinutes，否则根据POI类型和slot确定
              const durationMinutes = slotData.durationMinutes 
                || this.getActivityDuration(slot, candidate.category);
              endTime = new Date(startTime.getTime() + durationMinutes * 60 * 1000);
              
              // 确保结束时间不超过slot的默认结束时间
              if (endTime > slotDefaultTime.endTime) {
                const maxDuration = (slotDefaultTime.endTime.getTime() - startTime.getTime()) / (60 * 1000);
                if (maxDuration > 30) {
                  endTime = slotDefaultTime.endTime;
                } else {
                  startTime = slotDefaultTime.startTime;
                  endTime = slotDefaultTime.endTime;
                }
              }
            } else {
              // 第一个行程项或没有坐标信息，使用slot的默认时间
              startTime = slotDefaultTime.startTime;
              endTime = slotDefaultTime.endTime;
              
              // 如果模板提供了 durationMinutes，调整结束时间
              if (slotData.durationMinutes) {
                endTime = new Date(startTime.getTime() + slotData.durationMinutes * 60 * 1000);
              }
            }
          }

          // 🆕 日照约束：户外景点（瀑布、冰川等）不得安排在日落后，高纬度冬季尤为重要
          const clamped = this.clampToDaylight(startTime, endTime, dayDate, countryCode, candidate.category);
          startTime = clamped.startTime;
          endTime = clamped.endTime;

          // 构建note，包含reason和isRequired信息
          let note = slotData.reason || null;
          if (slotData.required) {
            note = note ? `${note} [必游]` : '[必游]';
          }

          // 先收集到当天的数组中
          dayItems.push({
            id: randomUUID(),
            tripDayId: tripDay.id,
            placeId: slotData.placeId,
            type: this.mapSlotToItemType(slot, candidate.category),
            startTime: startTime,
            endTime: endTime,
            note: note,
          });
          
          // 🆕 更新前一个行程项信息（用于计算下一个的时间）
          previousItemEndTime = endTime;
          // 更新为当前地点的坐标（用于下一个行程项的计算）
          const currentPlaceCoordsForNext = candidateCoordsMap.get(slotData.placeId);
          previousPlaceCoords = currentPlaceCoordsForNext || null;
        }
        
        // 🆕 按 startTime 排序后添加到 itemsToCreate
        dayItems.sort((a, b) => a.startTime.getTime() - b.startTime.getTime());
        itemsToCreate.push(...dayItems);
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
    _routeDirection: any
  ): Promise<Array<{ id: number; nameCN: string; nameEN?: string; category: string; lat: number; lng: number; uuid?: string; isRequired?: boolean }>> {
    // 1. 优先收集 dayPlans 中的 pois 字段（如果存在）
    const poisFromTemplate: Array<{
      id?: number;
      uuid?: string;
      nameCN?: string;
      nameEN?: string;
      required?: boolean;
    }> = [];
    const poisIdSet = new Set<number>();
    const poisUuidSet = new Set<string>();
    
    for (const plan of dayPlans) {
      // 优先使用 pois 字段
      if (plan.pois && Array.isArray(plan.pois) && plan.pois.length > 0) {
        this.logger.debug(`Found ${plan.pois.length} POIs in day ${plan.day || 'unknown'}`);
        for (const poi of plan.pois) {
          if (poi.id) {
            poisIdSet.add(poi.id);
            poisFromTemplate.push({
              id: poi.id,
              uuid: poi.uuid,
              required: poi.required || false,
            });
            this.logger.debug(`Added POI: id=${poi.id}, uuid=${poi.uuid}, required=${poi.required || false}`);
          } else if (poi.uuid) {
            poisUuidSet.add(poi.uuid);
            poisFromTemplate.push({
              uuid: poi.uuid,
              required: poi.required || false,
            });
            this.logger.debug(`Added POI: uuid=${poi.uuid}, required=${poi.required || false}`);
          } else if (poi.nameCN || poi.nameEN) {
            poisFromTemplate.push({
              nameCN: poi.nameCN,
              nameEN: poi.nameEN,
              required: poi.required || poi.priority === 'MUST_SEE' || false,
            });
            this.logger.debug(
              `Added POI by name fallback: nameCN=${poi.nameCN}, nameEN=${poi.nameEN}`,
            );
          } else {
            this.logger.warn(`POI in day ${plan.day} has no id, uuid, or name:`, JSON.stringify(poi));
          }
        }
      } else {
        this.logger.debug(`Day ${plan.day || 'unknown'} has no pois array or pois is empty`);
      }
    }
    
    // 如果模板中有完整的 pois 信息，使用 pois
    if (poisFromTemplate.length > 0) {
      const poiIds = Array.from(poisIdSet);
      const poiUuids = Array.from(poisUuidSet);
      
      this.logger.debug(`Querying places: ${poiIds.length} IDs, ${poiUuids.length} UUIDs`);
      
      // 从数据库查询这些 POI 的完整信息（使用原始SQL以支持PostGIS location字段）
      const places = await this.prisma.$queryRaw<Array<{
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
        ${countryCode ? Prisma.sql`INNER JOIN "City" c ON p."cityId" = c.id` : Prisma.sql``}
        WHERE 
          ${countryCode ? Prisma.sql`c."countryCode" = ${countryCode} AND` : Prisma.sql``}
          p.location IS NOT NULL
          AND (
            ${poiIds.length > 0 && poiUuids.length > 0 
              ? Prisma.sql`(p.id = ANY(${poiIds}::int[]) OR p.uuid = ANY(${poiUuids}::text[]))`
              : poiIds.length > 0
              ? Prisma.sql`p.id = ANY(${poiIds}::int[])`
              : poiUuids.length > 0
              ? Prisma.sql`p.uuid = ANY(${poiUuids}::text[])`
              : Prisma.sql`FALSE`
            }
          )
      `;
      
      const templateRefsByPlaceId = new Map<number, Array<{
        id?: number;
        uuid?: string;
        nameCN?: string;
        nameEN?: string;
        required?: boolean;
      }>>();
      const addTemplateRef = (
        placeId: number,
        ref: { id?: number; uuid?: string; nameCN?: string; nameEN?: string; required?: boolean },
      ) => {
        const refs = templateRefsByPlaceId.get(placeId) || [];
        refs.push(ref);
        templateRefsByPlaceId.set(placeId, refs);
      };

      for (const place of places) {
        for (const ref of poisFromTemplate) {
          if (ref.id && ref.id === place.id) addTemplateRef(place.id, ref);
          if (ref.uuid && ref.uuid === place.uuid) addTemplateRef(place.id, ref);
        }
      }

      let resolvedPlaces = [...places];
      const foundIds = new Set(places.map(p => p.id));
      const foundUuids = new Set(places.map(p => p.uuid));

      const nameOnlyRefs = poisFromTemplate.filter(
        poi => !poi.id && !poi.uuid && (poi.nameCN || poi.nameEN),
      );
      for (const ref of nameOnlyRefs) {
        const matched = await findPlaceByTemplatePoiNames(this.prisma, ref, countryCode);
        if (matched && !foundIds.has(matched.id)) {
          const coords = await this.prisma.$queryRaw<Array<{ lat: number; lng: number }>>`
            SELECT
              ST_Y(location::geometry) as lat,
              ST_X(location::geometry) as lng
            FROM "Place"
            WHERE id = ${matched.id} AND location IS NOT NULL
          `;
          if (coords.length > 0) {
            resolvedPlaces.push({
              id: matched.id,
              uuid: matched.uuid,
              nameCN: matched.nameCN,
              nameEN: matched.nameEN,
              category: matched.category,
              lat: coords[0].lat,
              lng: coords[0].lng,
            });
            foundIds.add(matched.id);
            foundUuids.add(matched.uuid);
            addTemplateRef(matched.id, ref);
            this.logger.debug(
              `Name fallback matched ${ref.nameEN || ref.nameCN} → id=${matched.id}`,
            );
          }
        } else if (matched) {
          addTemplateRef(matched.id, ref);
        }
      }

      this.logger.debug(
        `Found ${resolvedPlaces.length} places in database (expected ${poisFromTemplate.length})`,
      );
      if (resolvedPlaces.length < poisFromTemplate.length) {
        const resolvedNameKeys = new Set(
          resolvedPlaces.flatMap(p => [p.nameCN, p.nameEN].filter(Boolean)),
        );
        const missingPois = poisFromTemplate.filter(poi => {
          if (poi.id) return !foundIds.has(poi.id);
          if (poi.uuid) return !foundUuids.has(poi.uuid);
          if (poi.nameCN && resolvedNameKeys.has(poi.nameCN)) return false;
          if (poi.nameEN && resolvedNameKeys.has(poi.nameEN)) return false;
          return !!(poi.nameCN || poi.nameEN);
        });
        this.logger.warn(`Missing ${missingPois.length} POIs in database:`, JSON.stringify(missingPois, null, 2));
      }
      
      // 构建 required 映射
      const requiredMap = new Map<number | string, boolean>();
      poisFromTemplate.forEach(poi => {
        if (poi.id) requiredMap.set(poi.id, poi.required || false);
        if (poi.uuid) requiredMap.set(poi.uuid, poi.required || false);
        if (poi.nameCN) requiredMap.set(poi.nameCN, poi.required || false);
        if (poi.nameEN) requiredMap.set(poi.nameEN, poi.required || false);
      });

      const foundPlaceIds = new Set(resolvedPlaces.map(p => p.id));
      const foundPlaceUuids = new Set(resolvedPlaces.map(p => p.uuid));

      // 查询其他候选地点（排除已找到的 POI，使用原始SQL以支持PostGIS location字段）
      const otherPlaces = foundPlaceIds.size > 0 || foundPlaceUuids.size > 0
        ? await this.prisma.$queryRaw<Array<{
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
            ${countryCode ? Prisma.sql`INNER JOIN "City" c ON p."cityId" = c.id` : Prisma.sql``}
            WHERE 
              ${countryCode ? Prisma.sql`c."countryCode" = ${countryCode} AND` : Prisma.sql``}
              p.location IS NOT NULL
              ${foundPlaceIds.size > 0 ? Prisma.sql`AND p.id != ALL(${Array.from(foundPlaceIds)}::int[])` : Prisma.sql``}
              ${foundPlaceUuids.size > 0 ? Prisma.sql`AND p.uuid != ALL(${Array.from(foundPlaceUuids)}::text[])` : Prisma.sql``}
            ORDER BY p.rating DESC NULLS LAST, p."nameCN" ASC
            LIMIT ${Math.max(0, 200 - resolvedPlaces.length)}
          `
        : [];

      const isRequiredPlace = (place: { id: number; uuid: string; nameCN: string; nameEN: string | null }) =>
        requiredMap.get(place.id) ||
        requiredMap.get(place.uuid) ||
        requiredMap.get(place.nameCN) ||
        requiredMap.get(place.nameEN || '') ||
        false;

      // 合并结果：模板中的 POI 在前，并标记 isRequired
      return [
        ...resolvedPlaces.map(place => ({
          id: place.id,
          uuid: place.uuid,
          nameCN: place.nameCN,
          nameEN: place.nameEN || undefined,
          category: place.category,
          lat: place.lat,
          lng: place.lng,
          isRequired: isRequiredPlace(place),
          templateRefs: templateRefsByPlaceId.get(place.id) || [],
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
    
    // 如果没有 pois，记录警告并使用默认逻辑
    this.logger.warn(
      `No pois found in dayPlans for template. Please use pois array format instead of requiredNodes.`
    );
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

    // 3. 查询地点（优先返回 requiredNodes，然后返回其他候选）
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
   * 改进：严格按照模板的POI顺序选择，优先使用模板中定义的POI
   */
  private mockLLMOrchestration(
    template: any,
    candidates: Array<{
      id: number;
      nameCN: string;
      nameEN?: string;
      category: string;
      uuid?: string;
      isRequired?: boolean;
      templateRefs?: Array<{ id?: number; uuid?: string; nameCN?: string; nameEN?: string; required?: boolean }>;
    }>,
    durationDays: number
  ): any {
    const days = [];
    const dayPlans = this.normalizeDayPlans(template.dayPlans) as DayPlan[];
    
    // 跟踪已使用的POI，避免重复（但允许模板中的required POI重复使用）
    const usedPlaceIds = new Set<number>();
    
    // 按类别分组候选POI
    const restaurants = candidates.filter(c => c.category === 'RESTAURANT');
    const attractions = candidates.filter(c => c.category === 'ATTRACTION');

    const normalizeTemplatePoiName = (value?: string | null) =>
      (value || '')
        .trim()
        .toLowerCase()
        .replace(/[\s（）()\-—–·.,，。:：]/g, '');

    const findCandidateForTemplatePoi = (poi: any) => {
      const nameCN = normalizeTemplatePoiName(poi.nameCN);
      const nameEN = normalizeTemplatePoiName(poi.nameEN);

      return candidates.find(candidate => {
        if (poi.id && candidate.id === poi.id) return true;
        if (poi.uuid && candidate.uuid === poi.uuid) return true;

        const candidateNameCN = normalizeTemplatePoiName(candidate.nameCN);
        const candidateNameEN = normalizeTemplatePoiName(candidate.nameEN);
        if (nameCN && candidateNameCN === nameCN) return true;
        if (nameEN && candidateNameEN === nameEN) return true;

        return (candidate.templateRefs || []).some(ref => {
          const refNameCN = normalizeTemplatePoiName(ref.nameCN);
          const refNameEN = normalizeTemplatePoiName(ref.nameEN);
          if (poi.id && ref.id === poi.id) return true;
          if (poi.uuid && ref.uuid === poi.uuid) return true;
          if (nameCN && refNameCN === nameCN) return true;
          if (nameEN && refNameEN === nameEN) return true;
          return false;
        });
      });
    };
    
    // 🆕 获取模板中定义的POI（按 startTime 排序，如果没有则按数组顺序）
    const getTemplatePOIs = (dayPlan: DayPlan | undefined): Array<{ 
      id: number; 
      required: boolean; 
      startTime?: string;
      endTime?: string;
      durationMinutes?: number;
    }> => {
      if (!dayPlan?.pois || dayPlan.pois.length === 0) {
        return [];
      }
      
      const templatePois: Array<{ 
        id: number; 
        required: boolean; 
        startTime?: string;
        endTime?: string;
        durationMinutes?: number;
      }> = [];
      for (const poi of dayPlan.pois) {
        const candidate = findCandidateForTemplatePoi(poi);
        if (candidate) {
          templatePois.push({
            id: candidate.id,
            required: poi.required || candidate.isRequired || false,
            startTime: poi.startTime,
            endTime: poi.endTime,
            durationMinutes: poi.durationMinutes,
          });
        } else {
          this.logger.warn(
            `Template POI ${poi.id || poi.uuid || poi.nameCN || poi.nameEN || 'unknown'} not found in candidates for day ${dayPlan.day}`,
          );
        }
      }
      
      // 🆕 按 startTime 排序（如果有），否则保持数组顺序
      return templatePois.sort((a, b) => {
        if (a.startTime && b.startTime) {
          return new Date(a.startTime).getTime() - new Date(b.startTime).getTime();
        }
        if (a.startTime) return -1;
        if (b.startTime) return 1;
        return 0; // 保持原顺序
      });
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
    
    // 获取未使用的POI（优先从preferred列表中选择）
    const getUnusedPOI = (pool: typeof candidates, preferred?: typeof candidates): number | null => {
      // 优先使用preferred中的POI
      if (preferred) {
        for (const poi of preferred) {
          if (!usedPlaceIds.has(poi.id)) {
            usedPlaceIds.add(poi.id);
            return poi.id;
          }
        }
        return null;
      }
      
      // 从pool中选择未使用的
      for (const poi of pool) {
        if (!usedPlaceIds.has(poi.id)) {
          usedPlaceIds.add(poi.id);
          return poi.id;
        }
      }
      
      return null;
    };

    for (let day = 1; day <= durationDays; day++) {
      const dayPlan = dayPlans.find(p => p.day === day) || dayPlans[day - 1];
      const theme = dayPlan?.theme || '';
      
      // 获取模板中定义的POI（按order排序）
      const templatePOIs = getTemplatePOIs(dayPlan);
      
      // 分离required和optional的POI（用于后续判断）
      const requiredPOIs = templatePOIs.filter(p => p.required).map(p => p.id);
      const optionalPOIs = templatePOIs.filter(p => !p.required).map(p => p.id);
      
      // 根据类别分组模板POI（用于补充缺失的slot）
      const templateAttractions = attractions.filter(a => 
        requiredPOIs.includes(a.id) || optionalPOIs.includes(a.id)
      );
      const templateRestaurants = restaurants.filter(r => 
        requiredPOIs.includes(r.id) || optionalPOIs.includes(r.id)
      );
      
      // 🆕 改进：严格按照模板的pois顺序分配POI
      // 优先使用模板中定义的POI（按order顺序），而不是按时间段分配
      const slots: any = {
        morning: null,
        lunch: null,
        afternoon: null,
        dinner: null,
        evening: null,
      };
      
      // 🆕 如果模板中有POI，严格按照模板顺序分配（保持数据结构一致）
      if (templatePOIs.length > 0) {
        const slotOrder = ['morning', 'lunch', 'afternoon', 'dinner', 'evening'];
        
        // 🆕 如果模板POI有 startTime，根据时间分配到对应的slot
        // 否则，严格按照模板POI的顺序依次分配
        const poisWithSlots: Array<{ poi: typeof templatePOIs[0]; slotName: string }> = [];
        
        for (let i = 0; i < templatePOIs.length; i++) {
          const templatePOI = templatePOIs[i];
          const candidate = candidates.find(c => c.id === templatePOI.id);
          if (!candidate) {
            this.logger.warn(`Template POI ${templatePOI.id} not found in candidates for day ${day}`);
            continue;
          }
          
          // 如果POI已经被使用，跳过（除非是required）
          if (usedPlaceIds.has(templatePOI.id) && !templatePOI.required) {
            this.logger.warn(`Template POI ${templatePOI.id} already used, skipping (not required)`);
            continue;
          }
          
          let slotName: string | null = null;
          
          // 🆕 如果模板POI有 startTime，根据时间确定slot
          if (templatePOI.startTime) {
            try {
              const startTimeStr = templatePOI.startTime;
              let hour: number;
              
              // 解析时间（支持 ISO 8601 或 HH:mm）
              if (startTimeStr.includes('T')) {
                // ISO 8601 格式
                const date = new Date(startTimeStr);
                hour = date.getHours();
              } else {
                // HH:mm 格式
                const match = startTimeStr.match(/(\d{1,2}):(\d{2})/);
                if (match) {
                  hour = parseInt(match[1], 10);
                } else {
                  // 解析失败，使用顺序分配
                  slotName = slotOrder[i % slotOrder.length];
                }
              }
              
              // 根据时间确定slot
              if (hour !== undefined) {
                if (hour >= 6 && hour < 12) {
                  slotName = 'morning';
                } else if (hour >= 12 && hour < 14) {
                  slotName = 'lunch';
                } else if (hour >= 14 && hour < 18) {
                  slotName = 'afternoon';
                } else if (hour >= 18 && hour < 20) {
                  slotName = 'dinner';
                } else {
                  slotName = 'evening';
                }
              }
            } catch (error) {
              // 解析失败，使用顺序分配
              slotName = slotOrder[i % slotOrder.length];
            }
          } else {
            // 🆕 没有 startTime，严格按照模板顺序依次分配slot
            slotName = slotOrder[i % slotOrder.length];
          }
          
          // 如果slot已被占用，找下一个可用slot（但保持相对顺序）
          if (slots[slotName!]) {
            // 从当前slot开始，找下一个可用slot
            const currentSlotIndex = slotOrder.indexOf(slotName!);
            for (let j = currentSlotIndex + 1; j < slotOrder.length; j++) {
              if (!slots[slotOrder[j]]) {
                slotName = slotOrder[j];
                break;
              }
            }
            // 如果后面没有可用slot，从前面找
            if (slots[slotName!]) {
              for (let j = 0; j < currentSlotIndex; j++) {
                if (!slots[slotOrder[j]]) {
                  slotName = slotOrder[j];
                  break;
                }
              }
            }
          }
          
          // 如果所有slot都被占用，跳过这个POI（除非是required）
          if (slots[slotName!]) {
            if (templatePOI.required) {
              // required POI必须分配，替换已占用的slot
              this.logger.warn(`Required POI ${templatePOI.id} replacing existing slot ${slotName}`);
            } else {
              this.logger.warn(`No available slot for POI ${templatePOI.id}, skipping`);
              continue;
            }
          }
          
          poisWithSlots.push({ poi: templatePOI, slotName: slotName! });
        }
        
        // 🆕 按照模板POI的顺序分配slot（保持数据结构一致）
        for (const { poi: templatePOI, slotName } of poisWithSlots) {
          const candidate = candidates.find(c => c.id === templatePOI.id);
          if (!candidate) continue;
          
          usedPlaceIds.add(templatePOI.id);
          slots[slotName] = {
            placeId: templatePOI.id,
            reason: templatePOI.required
              ? `模板要求的必游景点：${candidate.nameCN || ''}`
              : `模板推荐的景点：${candidate.nameCN || ''}`,
            required: templatePOI.required,
            // 🆕 传递模板中的时间信息
            startTime: templatePOI.startTime,
            endTime: templatePOI.endTime,
            durationMinutes: templatePOI.durationMinutes,
          };
        }
      }
      
      // 如果模板中没有足够的POI，使用主题匹配或其他候选补充
      const themeAttractions = matchPOIsByTheme(theme, attractions);
      const themeRestaurants = matchPOIsByTheme(theme, restaurants);
      
      // 补充缺失的slot
      if (!slots.morning && templateAttractions.length > 0) {
        const poi = getUnusedPOI(attractions, templateAttractions) || getUnusedPOI(attractions, themeAttractions);
        if (poi) {
          const candidate = candidates.find(c => c.id === poi);
          slots.morning = {
            placeId: poi,
            reason: theme ? `根据主题"${theme}"选择：${candidate?.nameCN || ''}` : `探索景点：${candidate?.nameCN || ''}`,
            required: false,
          };
        }
      }
      
      if (!slots.lunch && templateRestaurants.length > 0) {
        const poi = getUnusedPOI(restaurants, templateRestaurants) || getUnusedPOI(restaurants, themeRestaurants);
        if (poi) {
          slots.lunch = {
            placeId: poi,
            reason: '午餐推荐',
            required: false,
          };
        }
      }
      
      if (!slots.afternoon && templateAttractions.length > 0) {
        const poi = getUnusedPOI(attractions, templateAttractions) || getUnusedPOI(attractions, themeAttractions);
        if (poi) {
          const candidate = candidates.find(c => c.id === poi);
          slots.afternoon = {
            placeId: poi,
            reason: theme ? `继续探索"${theme}"：${candidate?.nameCN || ''}` : `继续探索：${candidate?.nameCN || ''}`,
            required: false,
          };
        }
      }
      
      if (!slots.dinner && templateRestaurants.length > 0) {
        const poi = getUnusedPOI(restaurants, templateRestaurants) || getUnusedPOI(restaurants, themeRestaurants);
        if (poi) {
          slots.dinner = {
            placeId: poi,
            reason: '晚餐推荐',
            required: false,
          };
        }
      }

      days.push({
        day,
        theme: theme, // 保存主题，用于后续处理
        slots: slots, // 使用新的slots对象（已经包含所有信息）
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
    _startDate: Date,
    _durationDays: number
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
   * 获取指定日期、目的地的近似日出日落时间（小时，0-24）
   * 用于高纬度冬季目的地，避免将户外景点安排在日落后
   */
  private getDaylightBoundaries(dayDate: Date, countryCode: string): { sunriseHour: number; sunsetHour: number } {
    const month = dayDate.getMonth() + 1; // 1-12
    const code = (countryCode || '').toUpperCase();
    // 高纬度目的地（冰岛、格陵兰、挪威北部等）冬季日照极短
    const highLatWinter: Record<string, Record<number, { sunrise: number; sunset: number }>> = {
      IS: { 1: { sunrise: 10.5, sunset: 16 }, 2: { sunrise: 9, sunset: 17.5 }, 3: { sunrise: 7, sunset: 18.5 }, 11: { sunrise: 8.5, sunset: 16.5 }, 12: { sunrise: 10, sunset: 16 } },
      GL: { 1: { sunrise: 11, sunset: 15 }, 2: { sunrise: 9.5, sunset: 16.5 }, 3: { sunrise: 7.5, sunset: 18 }, 11: { sunrise: 8, sunset: 16 }, 12: { sunrise: 10.5, sunset: 15 } },
      SJ: { 1: { sunrise: 10, sunset: 14 }, 2: { sunrise: 8, sunset: 16 }, 3: { sunrise: 6, sunset: 18 }, 11: { sunrise: 7, sunset: 15 }, 12: { sunrise: 10, sunset: 14 } },
      NO: { 1: { sunrise: 9.5, sunset: 15.5 }, 2: { sunrise: 8, sunset: 17 }, 3: { sunrise: 6.5, sunset: 18.5 }, 11: { sunrise: 7.5, sunset: 16 }, 12: { sunrise: 9, sunset: 15 } },
    };
    const bounds = highLatWinter[code]?.[month];
    if (bounds) {
      return { sunriseHour: bounds.sunrise, sunsetHour: bounds.sunset };
    }
    // 默认中纬度：冬季约 7:00-17:00
    if (month >= 11 || month <= 2) {
      return { sunriseHour: 7, sunsetHour: 17 };
    }
    return { sunriseHour: 6, sunsetHour: 20 }; // 其他季节日照充足
  }

  /**
   * 判断 POI 类别是否需要日光（户外自然景观：瀑布、冰川、观景点等）
   */
  private needsDaylight(category: string): boolean {
    return (category || '').toUpperCase() === 'ATTRACTION';
  }

  /**
   * 将户外景点的时间窗限制在日照范围内
   */
  private clampToDaylight(
    startTime: Date,
    endTime: Date,
    dayDate: Date,
    countryCode: string,
    category: string
  ): { startTime: Date; endTime: Date } {
    if (!this.needsDaylight(category)) return { startTime, endTime };
    const { sunriseHour, sunsetHour } = this.getDaylightBoundaries(dayDate, countryCode);
    const sunsetMinutes = Math.floor(sunsetHour) * 60 + Math.round((sunsetHour % 1) * 60);
    const sunriseMinutes = Math.floor(sunriseHour) * 60 + Math.round((sunriseHour % 1) * 60);
    const timezone = timezoneForDestination(countryCode);
    const dayIso = this.destinationDateIso(dayDate);
    const sunsetTime = DateTime.fromISO(dayIso, { zone: timezone })
      .startOf('day')
      .plus({ minutes: sunsetMinutes })
      .toJSDate();
    const sunriseTime = DateTime.fromISO(dayIso, { zone: timezone })
      .startOf('day')
      .plus({ minutes: sunriseMinutes })
      .toJSDate();
    if (startTime >= sunsetTime) {
      const durationMs = endTime.getTime() - startTime.getTime();
      const newEnd = new Date(sunsetTime.getTime());
      const newStart = new Date(newEnd.getTime() - durationMs);
      if (newStart < sunriseTime) {
        newStart.setTime(sunriseTime.getTime());
      }
      this.logger.debug(`日照约束: ${category} 原 ${startTime.toISOString()} 调整至 ${newStart.toISOString()}-${newEnd.toISOString()} (日落约${sunsetHour.toFixed(1)}时)`);
      return { startTime: newStart, endTime: newEnd };
    }
    if (endTime > sunsetTime) {
      const newEnd = new Date(sunsetTime.getTime());
      this.logger.debug(`日照约束: ${category} 结束时间 ${endTime.toISOString()} 调整至日落前 ${newEnd.toISOString()}`);
      return { startTime, endTime: newEnd };
    }
    return { startTime, endTime };
  }

  /**
   * 计算时段时间
   */
  private calculateSlotTime(
    dayDate: Date,
    slot: string,
    countryCode?: string,
  ): { startTime: Date; endTime: Date } {
    const slotTimes: Record<string, { start: number; end: number }> = {
      morning: { start: 9 * 60, end: 12 * 60 },      // 9:00 - 12:00
      lunch: { start: 12 * 60, end: 14 * 60 },        // 12:00 - 14:00
      afternoon: { start: 14 * 60, end: 18 * 60 },   // 14:00 - 18:00
      dinner: { start: 18 * 60, end: 20 * 60 },      // 18:00 - 20:00
      evening: { start: 20 * 60, end: 22 * 60 },    // 20:00 - 22:00
    };

    const times = slotTimes[slot] || { start: 9 * 60, end: 12 * 60 };

    const startTime = this.createDestinationDateTime(
      dayDate,
      Math.floor(times.start / 60),
      times.start % 60,
      countryCode,
    );
    const endTime = this.createDestinationDateTime(
      dayDate,
      Math.floor(times.end / 60),
      times.end % 60,
      countryCode,
    );

    return { startTime, endTime };
  }

  private destinationDateIso(dayDate: Date): string {
    return DateTime.fromJSDate(dayDate, { zone: 'utc' }).toISODate() || dayDate.toISOString().slice(0, 10);
  }

  private createDestinationDateTime(
    dayDate: Date,
    hour: number,
    minute: number,
    countryCode?: string,
  ): Date {
    const timezone = timezoneForDestination(countryCode);
    const dayIso = this.destinationDateIso(dayDate);
    return DateTime.fromObject(
      {
        year: Number(dayIso.slice(0, 4)),
        month: Number(dayIso.slice(5, 7)),
        day: Number(dayIso.slice(8, 10)),
        hour,
        minute,
      },
      { zone: timezone },
    ).toJSDate();
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

  /**
   * 计算两个 POI/地点之间的交通时间（分钟）
   * 与 itinerary getDayTravelInfo / transport.search 降级逻辑对齐
   */
  private calculateTravelTimeBetweenPlaces(
    from: { lat: number; lng: number },
    to: { lat: number; lng: number }
  ): number {
    return this.travelTimeEstimator.estimatePoiTravelMinutes(from, to).durationMinutes;
  }

  /**
   * @deprecated 请使用 TravelTimeEstimatorService.haversineDistanceKm
   */
  private calculateHaversineDistance(
    lat1: number,
    lng1: number,
    lat2: number,
    lng2: number
  ): number {
    const R = 6371; // 地球半径（公里）
    const dLat = this.toRadians(lat2 - lat1);
    const dLng = this.toRadians(lng2 - lng1);
    const a =
      Math.sin(dLat / 2) * Math.sin(dLat / 2) +
      Math.cos(this.toRadians(lat1)) *
        Math.cos(this.toRadians(lat2)) *
        Math.sin(dLng / 2) *
        Math.sin(dLng / 2);
    const c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
    return R * c;
  }

  /**
   * 🆕 角度转弧度
   */
  private toRadians(degrees: number): number {
    return degrees * (Math.PI / 180);
  }

  /**
   * 🆕 根据slot和category获取活动持续时间（分钟）
   */
  private getActivityDuration(slot: string, category: string): number {
    // 根据slot确定基础持续时间
    const slotDurations: Record<string, number> = {
      morning: 180,    // 3小时
      lunch: 60,       // 1小时
      afternoon: 240,  // 4小时
      dinner: 90,      // 1.5小时
      evening: 120,    // 2小时
    };

    let duration = slotDurations[slot] || 120; // 默认2小时

    // 根据category调整
    if (category === 'RESTAURANT') {
      duration = slot === 'lunch' ? 60 : 90; // 午餐1小时，晚餐1.5小时
    } else if (category === 'ATTRACTION') {
      // 景点通常需要更长时间
      if (slot === 'morning' || slot === 'afternoon') {
        duration = 180; // 3小时
      }
    }

    return duration;
  }

  /**
   * 生成默认行程名称
   * 格式：{目的地名称} {开始日期}
   * 例如：冰岛 2025-06-01
   */
  private generateDefaultTripName(params: {
    destination: string;
    startDate: string;
  }): string {
    const { generateDefaultTripName } = require('../trips/utils/trip-name.util');
    return generateDefaultTripName(params);
  }

  /**
   * 从国家代码获取目的地名称（中文）
   */
  private getDestinationName(countryCode: string): string {
    const { getDestinationName } = require('../trips/utils/trip-name.util');
    return getDestinationName(countryCode);
  }
}

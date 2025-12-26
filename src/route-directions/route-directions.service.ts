// src/route-directions/route-directions.service.ts
import { Injectable, Logger, NotFoundException } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import { Prisma } from '@prisma/client';
import { CreateRouteDirectionDto } from './dto/create-route-direction.dto';
import { CreateRouteTemplateDto } from './dto/create-route-template.dto';
import { QueryRouteDirectionDto } from './dto/query-route-direction.dto';
import { RouteDirectionData, RouteTemplateData } from './interfaces/route-direction.interface';

@Injectable()
export class RouteDirectionsService {
  private readonly logger = new Logger(RouteDirectionsService.name);

  constructor(private prisma: PrismaService) {}

  /**
   * 创建路线方向
   */
  async createRouteDirection(
    dto: CreateRouteDirectionDto,
  ): Promise<Prisma.RouteDirectionGetPayload<{ include: { templates: true } }>> {
    const data: Prisma.RouteDirectionCreateInput = {
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

    return this.prisma.routeDirection.create({
      data,
      include: { templates: true },
    });
  }

  /**
   * 创建路线模板
   */
  async createRouteTemplate(
    dto: CreateRouteTemplateDto,
  ): Promise<Prisma.RouteTemplateGetPayload<{ include: { routeDirection: true } }>> {
    // 验证路线方向是否存在
    const routeDirection = await this.prisma.routeDirection.findUnique({
      where: { id: dto.routeDirectionId },
    });

    if (!routeDirection) {
      throw new NotFoundException(
        `Route direction with ID ${dto.routeDirectionId} not found`,
      );
    }

    const data: Prisma.RouteTemplateCreateInput = {
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

    return this.prisma.routeDirection.findMany({
      where,
      include: { templates: true },
      orderBy: { createdAt: 'desc' },
    });
  }

  /**
   * 根据 ID 获取路线方向
   */
  async findRouteDirectionById(
    id: number,
  ): Promise<Prisma.RouteDirectionGetPayload<{ include: { templates: true } }>> {
    const routeDirection = await this.prisma.routeDirection.findUnique({
      where: { id },
      include: { templates: true },
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
  ): Promise<Prisma.RouteDirectionGetPayload<{ include: { templates: true } }>> {
    const routeDirection = await this.prisma.routeDirection.findUnique({
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
        include: { templates: true },
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
          include: { templates: true },
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
  ): Promise<Prisma.RouteDirectionGetPayload<{ include: { templates: true } }>> {
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
      include: { templates: true },
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
  ): Promise<Prisma.RouteTemplateGetPayload<{ include: { routeDirection: true } }>> {
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
  ): Promise<Prisma.RouteTemplateGetPayload<{ include: { routeDirection: true } }> | null> {
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
}


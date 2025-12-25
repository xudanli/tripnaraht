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

    // 季节性筛选
    if (query.month) {
      where.OR = [
        {
          seasonality: {
            path: ['bestMonths'],
            array_contains: [query.month],
          },
        },
        {
          seasonality: {
            path: ['avoidMonths'],
            array_contains: [query.month],
          },
        },
      ];
    }

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
    },
  ): Promise<Prisma.RouteDirectionGetPayload<{ include: { templates: true } }>[]> {
    const where: Prisma.RouteDirectionWhereInput = {
      countryCode,
      isActive: true,
    };

    if (options?.tags && options.tags.length > 0) {
      where.tags = { hasSome: options.tags };
    }

    if (options?.month) {
      where.OR = [
        {
          seasonality: {
            path: ['bestMonths'],
            array_contains: [options.month],
          },
        },
        {
          seasonality: null,
        },
      ];
    }

    return this.prisma.routeDirection.findMany({
      where,
      include: { templates: true },
      take: options?.limit || 10,
      orderBy: { createdAt: 'desc' },
    });
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
}


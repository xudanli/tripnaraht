import {
  BadRequestException,
  ConflictException,
  Injectable,
  Logger,
  NotFoundException,
} from '@nestjs/common';
import { Prisma } from '@prisma/client';
import { PrismaService } from '../../prisma/prisma.service';
import { CreateRoutePackingChecklistDto } from '../dto/create-route-packing-checklist.dto';
import { UpdateRoutePackingChecklistDto } from '../dto/update-route-packing-checklist.dto';
import { UpsertTemplatePackingChecklistDto } from '../dto/upsert-template-packing-checklist.dto';

export interface RoutePackingChecklistSummary {
  id: string;
  version: string;
  nameCN?: string | null;
  isActive: boolean;
  lastUpdated?: string;
}

export interface RoutePackingChecklistListResult {
  items: any[];
  total: number;
  page: number;
  limit: number;
}

const REQUIRED_TEMPLATE_DATA_KEYS = [
  'quick_checklist_summer',
  'quick_checklist_transition',
  'quick_checklist_winter',
  'pre_departure_final_checklist',
] as const;

@Injectable()
export class RoutePackingChecklistService {
  private readonly logger = new Logger(RoutePackingChecklistService.name);

  constructor(private readonly prisma: PrismaService) {}

  /**
   * 校验 PackingChecklistTemplate 必填字段；缺则 400。
   * 并回写 metadata.source_route_template_id / route_name / country_code。
   */
  enrichAndValidateTemplateData(
    templateData: Record<string, any>,
    ctx: {
      routeTemplateId: number;
      countryCode: string;
      routeName?: string | null;
    },
  ): Record<string, any> {
    if (!templateData || typeof templateData !== 'object' || Array.isArray(templateData)) {
      throw new BadRequestException('templateData must be an object');
    }

    const missing: string[] = [];
    const metadata = templateData.metadata;
    if (!metadata || typeof metadata !== 'object' || Array.isArray(metadata)) {
      missing.push('metadata');
    } else if (
      metadata.version === undefined ||
      metadata.version === null ||
      String(metadata.version).trim() === ''
    ) {
      missing.push('metadata.version');
    }

    for (const key of REQUIRED_TEMPLATE_DATA_KEYS) {
      if (templateData[key] === undefined || templateData[key] === null) {
        missing.push(key);
      }
    }

    if (missing.length > 0) {
      throw new BadRequestException(
        `templateData missing required fields: ${missing.join(', ')}`,
      );
    }

    const nextMetadata = {
      ...(typeof metadata === 'object' && metadata ? metadata : {}),
      source_route_template_id: ctx.routeTemplateId,
      country_code: ctx.countryCode,
      ...(ctx.routeName ? { route_name: ctx.routeName } : {}),
    };

    return {
      ...templateData,
      metadata: nextMetadata,
    };
  }

  toSummary(row: {
    id: string;
    version: string;
    nameCN?: string | null;
    isActive: boolean;
    updatedAt: Date;
  }): RoutePackingChecklistSummary {
    return {
      id: row.id,
      version: row.version,
      nameCN: row.nameCN ?? null,
      isActive: row.isActive,
      lastUpdated: row.updatedAt?.toISOString?.() ?? undefined,
    };
  }

  private async loadTemplateContext(routeTemplateId: number) {
    const template = await this.prisma.routeTemplate.findUnique({
      where: { id: routeTemplateId },
      include: { routeDirection: true },
    });
    if (!template) {
      throw new NotFoundException(
        `Route template with ID ${routeTemplateId} not found`,
      );
    }
    return template;
  }

  async findMany(options: {
    routeTemplateId?: number;
    countryCode?: string;
    isActive?: boolean;
    page?: number;
    limit?: number;
  }): Promise<RoutePackingChecklistListResult> {
    const page = options.page && options.page > 0 ? options.page : 1;
    const limit = options.limit && options.limit > 0 ? Math.min(options.limit, 100) : 20;
    const where: Prisma.RoutePackingChecklistWhereInput = {};

    if (options.routeTemplateId !== undefined) {
      where.routeTemplateId = options.routeTemplateId;
    }
    if (options.countryCode) {
      where.countryCode = options.countryCode.toUpperCase();
    }
    if (options.isActive !== undefined) {
      where.isActive = options.isActive;
    }

    const [total, items] = await this.prisma.$transaction([
      this.prisma.routePackingChecklist.count({ where }),
      this.prisma.routePackingChecklist.findMany({
        where,
        orderBy: { updatedAt: 'desc' },
        skip: (page - 1) * limit,
        take: limit,
      }),
    ]);

    return { items, total, page, limit };
  }

  async findById(id: string) {
    const row = await this.prisma.routePackingChecklist.findUnique({
      where: { id },
    });
    if (!row) {
      throw new NotFoundException(`Packing checklist with ID ${id} not found`);
    }
    return row;
  }

  async findByRouteTemplateId(routeTemplateId: number) {
    await this.loadTemplateContext(routeTemplateId);
    return this.prisma.routePackingChecklist.findUnique({
      where: { routeTemplateId },
    });
  }

  async create(dto: CreateRoutePackingChecklistDto) {
    const template = await this.loadTemplateContext(dto.routeTemplateId);
    const existing = await this.prisma.routePackingChecklist.findUnique({
      where: { routeTemplateId: dto.routeTemplateId },
    });
    if (existing) {
      throw new ConflictException(
        `Route template ${dto.routeTemplateId} already has packing checklist ${existing.id}`,
      );
    }

    const countryCode = (dto.countryCode || template.routeDirection.countryCode).toUpperCase();
    const routeName = template.nameCN || template.name || template.nameEN;
    const templateData = this.enrichAndValidateTemplateData(dto.templateData, {
      routeTemplateId: dto.routeTemplateId,
      countryCode,
      routeName,
    });

    return this.prisma.routePackingChecklist.create({
      data: {
        routeTemplateId: dto.routeTemplateId,
        countryCode,
        nameCN: dto.nameCN ?? routeName ?? null,
        nameEN: dto.nameEN ?? template.nameEN ?? null,
        version: dto.version ?? String(templateData.metadata?.version ?? '1.0.0'),
        isActive: dto.isActive ?? true,
        templateData,
        lastReviewedAt: new Date(),
      },
    });
  }

  async update(id: string, dto: UpdateRoutePackingChecklistDto) {
    const existing = await this.findById(id);
    const template = await this.loadTemplateContext(existing.routeTemplateId);

    const countryCode = (
      dto.countryCode ||
      existing.countryCode ||
      template.routeDirection.countryCode
    ).toUpperCase();

    let templateData: Prisma.InputJsonValue | undefined;
    if (dto.templateData !== undefined) {
      const routeName = template.nameCN || template.name || template.nameEN;
      templateData = this.enrichAndValidateTemplateData(dto.templateData, {
        routeTemplateId: existing.routeTemplateId,
        countryCode,
        routeName,
      });
    }

    return this.prisma.routePackingChecklist.update({
      where: { id },
      data: {
        ...(dto.countryCode !== undefined ? { countryCode } : {}),
        ...(dto.nameCN !== undefined ? { nameCN: dto.nameCN } : {}),
        ...(dto.nameEN !== undefined ? { nameEN: dto.nameEN } : {}),
        ...(dto.version !== undefined ? { version: dto.version } : {}),
        ...(dto.isActive !== undefined ? { isActive: dto.isActive } : {}),
        ...(templateData !== undefined
          ? { templateData, lastReviewedAt: new Date() }
          : {}),
      },
    });
  }

  /**
   * 软删优先：isActive=false。传 hard=true 则物理删除（关联随行消失）。
   */
  async remove(id: string, options?: { hard?: boolean }) {
    const existing = await this.findById(id);
    if (options?.hard) {
      await this.prisma.routePackingChecklist.delete({ where: { id } });
      return { id, deleted: true, soft: false };
    }
    const updated = await this.prisma.routePackingChecklist.update({
      where: { id },
      data: { isActive: false },
    });
    return { id: updated.id, deleted: true, soft: true, isActive: false };
  }

  async upsertByRouteTemplateId(
    routeTemplateId: number,
    dto: UpsertTemplatePackingChecklistDto,
  ) {
    const template = await this.loadTemplateContext(routeTemplateId);
    const countryCode = (
      dto.countryCode || template.routeDirection.countryCode
    ).toUpperCase();
    const routeName = template.nameCN || template.name || template.nameEN;
    const templateData = this.enrichAndValidateTemplateData(dto.templateData, {
      routeTemplateId,
      countryCode,
      routeName,
    });

    const version =
      dto.version ?? String(templateData.metadata?.version ?? '1.0.0');

    return this.prisma.routePackingChecklist.upsert({
      where: { routeTemplateId },
      create: {
        routeTemplateId,
        countryCode,
        nameCN: dto.nameCN ?? routeName ?? null,
        nameEN: dto.nameEN ?? template.nameEN ?? null,
        version,
        isActive: dto.isActive ?? true,
        templateData,
        lastReviewedAt: new Date(),
      },
      update: {
        countryCode,
        ...(dto.nameCN !== undefined ? { nameCN: dto.nameCN } : {}),
        ...(dto.nameEN !== undefined ? { nameEN: dto.nameEN } : {}),
        version,
        ...(dto.isActive !== undefined ? { isActive: dto.isActive } : {}),
        templateData,
        lastReviewedAt: new Date(),
      },
    });
  }

  /**
   * 解绑：默认软删；hard=true 物理删除。
   */
  async unbindByRouteTemplateId(
    routeTemplateId: number,
    options?: { hard?: boolean },
  ) {
    await this.loadTemplateContext(routeTemplateId);
    const existing = await this.prisma.routePackingChecklist.findUnique({
      where: { routeTemplateId },
    });
    if (!existing) {
      throw new NotFoundException(
        `No packing checklist bound to route template ${routeTemplateId}`,
      );
    }
    return this.remove(existing.id, options);
  }
}

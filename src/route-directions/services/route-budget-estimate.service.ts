import {
  BadRequestException,
  ConflictException,
  Injectable,
  Logger,
  NotFoundException,
} from '@nestjs/common';
import { Prisma } from '@prisma/client';
import { PrismaService } from '../../prisma/prisma.service';
import { CreateRouteBudgetEstimateDto } from '../dto/create-route-budget-estimate.dto';
import { UpdateRouteBudgetEstimateDto } from '../dto/update-route-budget-estimate.dto';
import { UpsertTemplateBudgetEstimateDto } from '../dto/upsert-template-budget-estimate.dto';
import {
  BUDGET_CATEGORY_KEYS,
  BudgetCategoryTotals,
  BudgetCostLine,
  BudgetTotals,
  DayBudgetItem,
} from '../types/route-budget-estimate.types';

export interface RouteBudgetEstimateSummary {
  id: string;
  version: string;
  currency: string;
  nameCN?: string | null;
  isActive: boolean;
  dayCount?: number;
  totals?: BudgetTotals | null;
  lastUpdated?: string;
}

export interface RouteBudgetEstimateListResult {
  items: any[];
  total: number;
  page: number;
  limit: number;
}

function isFiniteNumber(v: unknown): v is number {
  return typeof v === 'number' && Number.isFinite(v);
}

function normalizeCostLine(
  raw: unknown,
  path: string,
): BudgetCostLine | undefined {
  if (raw === undefined || raw === null) return undefined;
  if (typeof raw !== 'object' || Array.isArray(raw)) {
    throw new BadRequestException(`${path} must be an object`);
  }
  const obj = raw as Record<string, unknown>;
  const line: BudgetCostLine = {};
  if (obj.amount !== undefined) {
    if (!isFiniteNumber(obj.amount) || obj.amount < 0) {
      throw new BadRequestException(`${path}.amount must be a non-negative number`);
    }
    line.amount = obj.amount;
  }
  if (obj.min !== undefined) {
    if (!isFiniteNumber(obj.min) || obj.min < 0) {
      throw new BadRequestException(`${path}.min must be a non-negative number`);
    }
    line.min = obj.min;
  }
  if (obj.max !== undefined) {
    if (!isFiniteNumber(obj.max) || obj.max < 0) {
      throw new BadRequestException(`${path}.max must be a non-negative number`);
    }
    line.max = obj.max;
  }
  if (obj.note !== undefined) {
    if (typeof obj.note !== 'string') {
      throw new BadRequestException(`${path}.note must be a string`);
    }
    line.note = obj.note;
  }
  if (
    line.amount === undefined &&
    line.min === undefined &&
    line.max === undefined &&
    line.note === undefined
  ) {
    return undefined;
  }
  if (
    line.min !== undefined &&
    line.max !== undefined &&
    line.min > line.max
  ) {
    throw new BadRequestException(`${path}.min must be <= max`);
  }
  return line;
}

function lineAmount(line?: BudgetCostLine): number {
  if (!line) return 0;
  if (isFiniteNumber(line.amount)) return line.amount;
  if (isFiniteNumber(line.min) && isFiniteNumber(line.max)) {
    return (line.min + line.max) / 2;
  }
  if (isFiniteNumber(line.min)) return line.min;
  if (isFiniteNumber(line.max)) return line.max;
  return 0;
}

function lineMin(line?: BudgetCostLine): number {
  if (!line) return 0;
  if (isFiniteNumber(line.min)) return line.min;
  if (isFiniteNumber(line.amount)) return line.amount;
  if (isFiniteNumber(line.max)) return line.max;
  return 0;
}

function lineMax(line?: BudgetCostLine): number {
  if (!line) return 0;
  if (isFiniteNumber(line.max)) return line.max;
  if (isFiniteNumber(line.amount)) return line.amount;
  if (isFiniteNumber(line.min)) return line.min;
  return 0;
}

function addLines(
  a: BudgetCostLine | undefined,
  b: BudgetCostLine | undefined,
): BudgetCostLine | undefined {
  if (!a && !b) return undefined;
  return {
    amount: lineAmount(a) + lineAmount(b),
    min: lineMin(a) + lineMin(b),
    max: lineMax(a) + lineMax(b),
  };
}

@Injectable()
export class RouteBudgetEstimateService {
  private readonly logger = new Logger(RouteBudgetEstimateService.name);

  constructor(private readonly prisma: PrismaService) {}

  /**
   * 校验并规范化 dayBudgets，汇总 categoryTotals / totals。
   */
  normalizeBudgetPayload(
    dayBudgetsRaw: unknown,
    partySize: number,
  ): {
    dayBudgets: DayBudgetItem[];
    categoryTotals: BudgetCategoryTotals;
    totals: BudgetTotals;
  } {
    if (!Array.isArray(dayBudgetsRaw) || dayBudgetsRaw.length === 0) {
      throw new BadRequestException('dayBudgets must be a non-empty array');
    }

    const seenDays = new Set<number>();
    const dayBudgets: DayBudgetItem[] = [];

    for (let i = 0; i < dayBudgetsRaw.length; i++) {
      const raw = dayBudgetsRaw[i];
      const path = `dayBudgets[${i}]`;
      if (!raw || typeof raw !== 'object' || Array.isArray(raw)) {
        throw new BadRequestException(`${path} must be an object`);
      }
      const item = raw as Record<string, unknown>;
      if (!isFiniteNumber(item.day) || item.day < 1 || !Number.isInteger(item.day)) {
        throw new BadRequestException(`${path}.day must be a positive integer`);
      }
      if (seenDays.has(item.day)) {
        throw new BadRequestException(`duplicate day ${item.day} in dayBudgets`);
      }
      seenDays.add(item.day);

      const dayItem: DayBudgetItem = { day: item.day };
      if (item.theme !== undefined) {
        if (typeof item.theme !== 'string') {
          throw new BadRequestException(`${path}.theme must be a string`);
        }
        dayItem.theme = item.theme;
      }

      let hasAnyCategory = false;
      for (const key of BUDGET_CATEGORY_KEYS) {
        const line = normalizeCostLine(item[key], `${path}.${key}`);
        if (line) {
          dayItem[key] = line;
          hasAnyCategory = true;
        }
      }

      const explicitTotal = normalizeCostLine(item.dayTotal, `${path}.dayTotal`);
      if (!hasAnyCategory && !explicitTotal) {
        throw new BadRequestException(
          `${path} must include at least one of tickets/fuel/charging/parking/accommodation/other/dayTotal`,
        );
      }

      if (explicitTotal) {
        dayItem.dayTotal = explicitTotal;
      } else {
        let amount = 0;
        let min = 0;
        let max = 0;
        for (const key of BUDGET_CATEGORY_KEYS) {
          amount += lineAmount(dayItem[key]);
          min += lineMin(dayItem[key]);
          max += lineMax(dayItem[key]);
        }
        dayItem.dayTotal = { amount, min, max };
      }

      dayBudgets.push(dayItem);
    }

    dayBudgets.sort((a, b) => a.day - b.day);

    const categoryTotals: BudgetCategoryTotals = {};
    for (const key of BUDGET_CATEGORY_KEYS) {
      let acc: BudgetCostLine | undefined;
      for (const day of dayBudgets) {
        acc = addLines(acc, day[key]);
      }
      if (acc) categoryTotals[key] = acc;
    }

    let totalAmount = 0;
    let totalMin = 0;
    let totalMax = 0;
    for (const day of dayBudgets) {
      totalAmount += lineAmount(day.dayTotal);
      totalMin += lineMin(day.dayTotal);
      totalMax += lineMax(day.dayTotal);
    }

    const totals: BudgetTotals = {
      amount: totalAmount,
      min: totalMin,
      max: totalMax,
      perPerson:
        partySize > 0 ? Math.round((totalAmount / partySize) * 100) / 100 : undefined,
    };

    return { dayBudgets, categoryTotals, totals };
  }

  toSummary(row: {
    id: string;
    version: string;
    currency: string;
    nameCN?: string | null;
    isActive: boolean;
    dayBudgets?: unknown;
    totals?: unknown;
    updatedAt: Date;
  }): RouteBudgetEstimateSummary {
    const days = Array.isArray(row.dayBudgets) ? row.dayBudgets.length : undefined;
    return {
      id: row.id,
      version: row.version,
      currency: row.currency,
      nameCN: row.nameCN ?? null,
      isActive: row.isActive,
      dayCount: days,
      totals: (row.totals as BudgetTotals) ?? null,
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
    currency?: string;
    isActive?: boolean;
    page?: number;
    limit?: number;
  }): Promise<RouteBudgetEstimateListResult> {
    const page = options.page && options.page > 0 ? options.page : 1;
    const limit =
      options.limit && options.limit > 0 ? Math.min(options.limit, 100) : 20;
    const where: Prisma.RouteBudgetEstimateWhereInput = {};

    if (options.routeTemplateId !== undefined) {
      where.routeTemplateId = options.routeTemplateId;
    }
    if (options.countryCode) {
      where.countryCode = options.countryCode.toUpperCase();
    }
    if (options.currency) {
      where.currency = options.currency.toUpperCase();
    }
    if (options.isActive !== undefined) {
      where.isActive = options.isActive;
    }

    const [total, items] = await this.prisma.$transaction([
      this.prisma.routeBudgetEstimate.count({ where }),
      this.prisma.routeBudgetEstimate.findMany({
        where,
        orderBy: { updatedAt: 'desc' },
        skip: (page - 1) * limit,
        take: limit,
      }),
    ]);

    return { items, total, page, limit };
  }

  async findById(id: string) {
    const row = await this.prisma.routeBudgetEstimate.findUnique({
      where: { id },
    });
    if (!row) {
      throw new NotFoundException(`Budget estimate with ID ${id} not found`);
    }
    return row;
  }

  async findByRouteTemplateId(routeTemplateId: number) {
    await this.loadTemplateContext(routeTemplateId);
    return this.prisma.routeBudgetEstimate.findUnique({
      where: { routeTemplateId },
    });
  }

  async create(dto: CreateRouteBudgetEstimateDto) {
    const template = await this.loadTemplateContext(dto.routeTemplateId);
    const existing = await this.prisma.routeBudgetEstimate.findUnique({
      where: { routeTemplateId: dto.routeTemplateId },
    });
    if (existing) {
      throw new ConflictException(
        `Route template ${dto.routeTemplateId} already has budget estimate ${existing.id}`,
      );
    }

    const countryCode = (
      dto.countryCode || template.routeDirection.countryCode
    ).toUpperCase();
    const currency = (dto.currency || 'CNY').toUpperCase();
    const partySize = dto.partySize ?? 2;
    const routeName = template.nameCN || template.name || template.nameEN;
    const { dayBudgets, categoryTotals, totals } = this.normalizeBudgetPayload(
      dto.dayBudgets,
      partySize,
    );

    return this.prisma.routeBudgetEstimate.create({
      data: {
        routeTemplateId: dto.routeTemplateId,
        countryCode,
        currency,
        partySize,
        vehicleType: dto.vehicleType ?? null,
        nameCN: dto.nameCN ?? (routeName ? `${routeName}·预算` : null),
        nameEN: dto.nameEN ?? template.nameEN ?? null,
        version: dto.version ?? '1.0.0',
        isActive: dto.isActive ?? true,
        assumptions: dto.assumptions ?? null,
        dayBudgets: dayBudgets as unknown as Prisma.InputJsonValue,
        categoryTotals: categoryTotals as unknown as Prisma.InputJsonValue,
        totals: totals as unknown as Prisma.InputJsonValue,
        lastReviewedAt: new Date(),
      },
    });
  }

  async update(id: string, dto: UpdateRouteBudgetEstimateDto) {
    const existing = await this.findById(id);
    const template = await this.loadTemplateContext(existing.routeTemplateId);

    const partySize = dto.partySize ?? existing.partySize;
    const countryCode = (
      dto.countryCode ||
      existing.countryCode ||
      template.routeDirection.countryCode
    ).toUpperCase();

    let dayBudgets: Prisma.InputJsonValue | undefined;
    let categoryTotals: Prisma.InputJsonValue | undefined;
    let totals: Prisma.InputJsonValue | undefined;

    if (dto.dayBudgets !== undefined || dto.partySize !== undefined) {
      const sourceDays =
        dto.dayBudgets !== undefined ? dto.dayBudgets : existing.dayBudgets;
      const normalized = this.normalizeBudgetPayload(sourceDays, partySize);
      dayBudgets = normalized.dayBudgets as unknown as Prisma.InputJsonValue;
      categoryTotals =
        normalized.categoryTotals as unknown as Prisma.InputJsonValue;
      totals = normalized.totals as unknown as Prisma.InputJsonValue;
    }

    return this.prisma.routeBudgetEstimate.update({
      where: { id },
      data: {
        ...(dto.countryCode !== undefined ? { countryCode } : {}),
        ...(dto.currency !== undefined
          ? { currency: dto.currency.toUpperCase() }
          : {}),
        ...(dto.partySize !== undefined ? { partySize: dto.partySize } : {}),
        ...(dto.vehicleType !== undefined ? { vehicleType: dto.vehicleType } : {}),
        ...(dto.nameCN !== undefined ? { nameCN: dto.nameCN } : {}),
        ...(dto.nameEN !== undefined ? { nameEN: dto.nameEN } : {}),
        ...(dto.version !== undefined ? { version: dto.version } : {}),
        ...(dto.isActive !== undefined ? { isActive: dto.isActive } : {}),
        ...(dto.assumptions !== undefined ? { assumptions: dto.assumptions } : {}),
        ...(dayBudgets !== undefined
          ? {
              dayBudgets,
              categoryTotals,
              totals,
              lastReviewedAt: new Date(),
            }
          : {}),
      },
    });
  }

  async remove(id: string, options?: { hard?: boolean }) {
    const existing = await this.findById(id);
    if (options?.hard) {
      await this.prisma.routeBudgetEstimate.delete({ where: { id } });
      return { id, deleted: true, soft: false };
    }
    const updated = await this.prisma.routeBudgetEstimate.update({
      where: { id },
      data: { isActive: false },
    });
    return { id: updated.id, deleted: true, soft: true, isActive: false };
  }

  async upsertByRouteTemplateId(
    routeTemplateId: number,
    dto: UpsertTemplateBudgetEstimateDto,
  ) {
    const template = await this.loadTemplateContext(routeTemplateId);
    const countryCode = (
      dto.countryCode || template.routeDirection.countryCode
    ).toUpperCase();
    const currency = (dto.currency || 'CNY').toUpperCase();
    const partySize = dto.partySize ?? 2;
    const routeName = template.nameCN || template.name || template.nameEN;
    const { dayBudgets, categoryTotals, totals } = this.normalizeBudgetPayload(
      dto.dayBudgets,
      partySize,
    );

    return this.prisma.routeBudgetEstimate.upsert({
      where: { routeTemplateId },
      create: {
        routeTemplateId,
        countryCode,
        currency,
        partySize,
        vehicleType: dto.vehicleType ?? null,
        nameCN: dto.nameCN ?? (routeName ? `${routeName}·预算` : null),
        nameEN: dto.nameEN ?? template.nameEN ?? null,
        version: dto.version ?? '1.0.0',
        isActive: dto.isActive ?? true,
        assumptions: dto.assumptions ?? null,
        dayBudgets: dayBudgets as unknown as Prisma.InputJsonValue,
        categoryTotals: categoryTotals as unknown as Prisma.InputJsonValue,
        totals: totals as unknown as Prisma.InputJsonValue,
        lastReviewedAt: new Date(),
      },
      update: {
        countryCode,
        currency,
        partySize,
        ...(dto.vehicleType !== undefined ? { vehicleType: dto.vehicleType } : {}),
        ...(dto.nameCN !== undefined ? { nameCN: dto.nameCN } : {}),
        ...(dto.nameEN !== undefined ? { nameEN: dto.nameEN } : {}),
        version: dto.version ?? '1.0.0',
        ...(dto.isActive !== undefined ? { isActive: dto.isActive } : {}),
        ...(dto.assumptions !== undefined ? { assumptions: dto.assumptions } : {}),
        dayBudgets: dayBudgets as unknown as Prisma.InputJsonValue,
        categoryTotals: categoryTotals as unknown as Prisma.InputJsonValue,
        totals: totals as unknown as Prisma.InputJsonValue,
        lastReviewedAt: new Date(),
      },
    });
  }

  async unbindByRouteTemplateId(
    routeTemplateId: number,
    options?: { hard?: boolean },
  ) {
    await this.loadTemplateContext(routeTemplateId);
    const existing = await this.prisma.routeBudgetEstimate.findUnique({
      where: { routeTemplateId },
    });
    if (!existing) {
      throw new NotFoundException(
        `No budget estimate bound to route template ${routeTemplateId}`,
      );
    }
    return this.remove(existing.id, options);
  }
}

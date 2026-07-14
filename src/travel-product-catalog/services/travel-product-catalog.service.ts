import {
  BadRequestException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import {
  Prisma,
  ProductOfferingStatus,
  TravelProductType,
} from '@prisma/client';
import { PrismaService } from '../../prisma/prisma.service';
import {
  ICELAND_PRODUCT_CATEGORY_SEED,
  ICELAND_PRODUCT_SUBTYPE_SEED,
} from '../data/iceland-product-taxonomy.seed';
import { TRAVEL_PRODUCT_TYPES } from '../types/product-taxonomy.types';
import type {
  CreateExperienceDefinitionDto,
  CreateOperatorDto,
  CreateProductOfferingDto,
  CreateProductSessionDto,
  CreateRatePlanDto,
  ListOfferingsQueryDto,
  ListSessionsQueryDto,
  ReplacePlaceExperienceLinksDto,
  ReplaceProductPlaceLinksDto,
  UpdateExperienceDefinitionDto,
  UpdateOperatorDto,
  UpdateProductOfferingDto,
  UpdateProductSessionDto,
  UpdateRatePlanDto,
} from '../dto/travel-product-catalog.dto';

function parseLocalDate(dateStr: string): Date {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(dateStr)) {
    throw new BadRequestException(`localDate 须为 YYYY-MM-DD，收到: ${dateStr}`);
  }
  return new Date(`${dateStr}T00:00:00.000Z`);
}

const OFFERING_DETAIL_INCLUDE = {
  experienceDefinition: true,
  operator: true,
  placeLinks: {
    include: {
      place: { select: { id: true, nameEN: true, nameCN: true, category: true } },
    },
    orderBy: [{ role: 'asc' as const }, { sortOrder: 'asc' as const }],
  },
  ratePlans: { where: { sessionId: null }, orderBy: { code: 'asc' as const } },
} satisfies Prisma.ProductOfferingInclude;

@Injectable()
export class TravelProductCatalogService {
  constructor(private readonly prisma: PrismaService) {}

  getTaxonomy() {
    return {
      schemaId: 'tripnara.travel_product_taxonomy@v1',
      productTypes: [...TRAVEL_PRODUCT_TYPES],
      categories: ICELAND_PRODUCT_CATEGORY_SEED,
      subtypes: ICELAND_PRODUCT_SUBTYPE_SEED,
    };
  }

  // —— Experience ——
  async listExperiences(query: {
    countryCode?: string;
    productType?: TravelProductType;
    q?: string;
    limit?: number;
  }) {
    const take = Math.min(query.limit ?? 50, 200);
    return this.prisma.experienceDefinition.findMany({
      where: {
        ...(query.productType ? { productType: query.productType } : {}),
        ...(query.countryCode ? { countryCodes: { has: query.countryCode } } : {}),
        ...(query.q
          ? {
              OR: [
                { code: { contains: query.q, mode: 'insensitive' } },
                { displayNameEn: { contains: query.q, mode: 'insensitive' } },
                { displayNameZh: { contains: query.q, mode: 'insensitive' } },
              ],
            }
          : {}),
      },
      orderBy: { code: 'asc' },
      take,
    });
  }

  async getExperience(id: string) {
    const row = await this.prisma.experienceDefinition.findUnique({ where: { id } });
    if (!row) throw new NotFoundException(`ExperienceDefinition not found: ${id}`);
    return row;
  }

  async getExperienceByCode(code: string) {
    const row = await this.prisma.experienceDefinition.findUnique({ where: { code } });
    if (!row) throw new NotFoundException(`ExperienceDefinition code not found: ${code}`);
    return row;
  }

  async createExperience(dto: CreateExperienceDefinitionDto) {
    return this.prisma.experienceDefinition.create({
      data: {
        code: dto.code,
        productType: dto.productType,
        categoryCode: dto.categoryCode,
        subtypeCode: dto.subtypeCode,
        displayNameZh: dto.displayNameZh,
        displayNameEn: dto.displayNameEn,
        typicalDurationMin: dto.typicalDurationMin,
        fitnessLevel: dto.fitnessLevel,
        riskLevel: dto.riskLevel,
        recommendedMinAge: dto.recommendedMinAge,
        recommendedMaxAge: dto.recommendedMaxAge,
        equipmentTypical: dto.equipmentTypical ?? [],
        seasonalityNotes: dto.seasonalityNotes,
        weatherDependency: dto.weatherDependency,
        commonCancelReasons: dto.commonCancelReasons ?? [],
        requiresGuide: dto.requiresGuide ?? false,
        requiresLicense: dto.requiresLicense ?? false,
        relatedExperienceAtomCodes: dto.relatedExperienceAtomCodes ?? [],
        countryCodes: dto.countryCodes ?? [],
        metadata: dto.metadata as Prisma.InputJsonValue | undefined,
      },
    });
  }

  async updateExperience(id: string, dto: UpdateExperienceDefinitionDto) {
    await this.getExperience(id);
    const { code: _c, ...rest } = dto;
    return this.prisma.experienceDefinition.update({
      where: { id },
      data: {
        ...rest,
        metadata:
          dto.metadata === undefined
            ? undefined
            : (dto.metadata as Prisma.InputJsonValue),
      },
    });
  }

  // —— Operator ——
  async listOperators(query: { countryCode?: string; q?: string; limit?: number }) {
    const take = Math.min(query.limit ?? 50, 200);
    return this.prisma.operator.findMany({
      where: {
        ...(query.countryCode ? { countryCode: query.countryCode } : {}),
        ...(query.q
          ? {
              OR: [
                { brandName: { contains: query.q, mode: 'insensitive' } },
                { legalName: { contains: query.q, mode: 'insensitive' } },
              ],
            }
          : {}),
      },
      orderBy: { brandName: 'asc' },
      take,
    });
  }

  async getOperator(id: string) {
    const row = await this.prisma.operator.findUnique({ where: { id } });
    if (!row) throw new NotFoundException(`Operator not found: ${id}`);
    return row;
  }

  async createOperator(dto: CreateOperatorDto) {
    return this.prisma.operator.create({
      data: {
        brandName: dto.brandName,
        legalName: dto.legalName,
        countryCode: dto.countryCode,
        operatingRegions: dto.operatingRegions ?? [],
        contactEmail: dto.contactEmail,
        contactPhone: dto.contactPhone,
        website: dto.website,
        licenses: dto.licenses ?? [],
        insuranceSummary: dto.insuranceSummary,
        languages: dto.languages ?? [],
        cancellationPolicySummary: dto.cancellationPolicySummary,
        dataSources: dto.dataSources ?? [],
        distributionChannels: dto.distributionChannels ?? [],
        externalOperatorId: dto.externalOperatorId,
        trustLevel: dto.trustLevel,
        metadata: dto.metadata as Prisma.InputJsonValue | undefined,
      },
    });
  }

  async updateOperator(id: string, dto: UpdateOperatorDto) {
    await this.getOperator(id);
    return this.prisma.operator.update({
      where: { id },
      data: {
        ...dto,
        metadata:
          dto.metadata === undefined
            ? undefined
            : (dto.metadata as Prisma.InputJsonValue),
      },
    });
  }

  // —— Offering ——
  async listOfferings(query: ListOfferingsQueryDto, opts?: { publishedOnly?: boolean }) {
    const take = Math.min(query.limit ?? 50, 200);
    const status = opts?.publishedOnly
      ? ProductOfferingStatus.PUBLISHED
      : query.status;

    return this.prisma.productOffering.findMany({
      where: {
        ...(status ? { status } : {}),
        ...(query.countryCode ? { countryCode: query.countryCode } : {}),
        ...(query.experienceDefinitionId
          ? { experienceDefinitionId: query.experienceDefinitionId }
          : {}),
        ...(query.placeId
          ? { placeLinks: { some: { placeId: query.placeId } } }
          : {}),
        ...(query.productType ? { productType: query.productType } : {}),
        ...(query.categoryCode ? { categoryCode: query.categoryCode } : {}),
        ...(query.subtypeCode ? { subtypeCode: query.subtypeCode } : {}),
        ...(query.q
          ? {
              OR: [
                { nameEN: { contains: query.q, mode: 'insensitive' } },
                { nameCN: { contains: query.q, mode: 'insensitive' } },
                { externalProductId: { contains: query.q, mode: 'insensitive' } },
              ],
            }
          : {}),
      },
      include: {
        operator: { select: { id: true, brandName: true, trustLevel: true } },
        experienceDefinition: {
          select: {
            id: true,
            code: true,
            displayNameZh: true,
            displayNameEn: true,
            weatherDependency: true,
            typicalDurationMin: true,
          },
        },
      },
      orderBy: { updatedAt: 'desc' },
      take,
    });
  }

  async getOffering(id: string, opts?: { publishedOnly?: boolean }) {
    const row = await this.prisma.productOffering.findUnique({
      where: { id },
      include: OFFERING_DETAIL_INCLUDE,
    });
    if (!row) throw new NotFoundException(`ProductOffering not found: ${id}`);
    if (opts?.publishedOnly && row.status !== ProductOfferingStatus.PUBLISHED) {
      throw new NotFoundException(`ProductOffering not found: ${id}`);
    }
    return row;
  }

  async createOffering(dto: CreateProductOfferingDto) {
    await this.getExperience(dto.experienceDefinitionId);
    await this.getOperator(dto.operatorId);
    return this.prisma.productOffering.create({
      data: {
        experienceDefinitionId: dto.experienceDefinitionId,
        operatorId: dto.operatorId,
        nameEN: dto.nameEN,
        nameCN: dto.nameCN,
        description: dto.description,
        productType: dto.productType,
        categoryCode: dto.categoryCode,
        subtypeCode: dto.subtypeCode,
        defaultDurationMin: dto.defaultDurationMin,
        included: dto.included ?? [],
        excluded: dto.excluded ?? [],
        minAge: dto.minAge,
        maxAge: dto.maxAge,
        minHeightCm: dto.minHeightCm,
        maxWeightKg: dto.maxWeightKg,
        fitnessRequirement: dto.fitnessRequirement,
        equipmentRequired: dto.equipmentRequired ?? [],
        languages: dto.languages ?? [],
        cancellationPolicy: dto.cancellationPolicy,
        safetyRules: dto.safetyRules ?? [],
        bookingChannels: dto.bookingChannels ?? [],
        externalProductId: dto.externalProductId,
        status: dto.status ?? ProductOfferingStatus.DRAFT,
        countryCode: dto.countryCode,
        metadata: dto.metadata as Prisma.InputJsonValue | undefined,
      },
      include: OFFERING_DETAIL_INCLUDE,
    });
  }

  async updateOffering(id: string, dto: UpdateProductOfferingDto) {
    await this.getOffering(id);
    if (dto.experienceDefinitionId) {
      await this.getExperience(dto.experienceDefinitionId);
    }
    if (dto.operatorId) {
      await this.getOperator(dto.operatorId);
    }
    return this.prisma.productOffering.update({
      where: { id },
      data: {
        ...dto,
        metadata:
          dto.metadata === undefined
            ? undefined
            : (dto.metadata as Prisma.InputJsonValue),
      },
      include: OFFERING_DETAIL_INCLUDE,
    });
  }

  async setOfferingStatus(id: string, status: ProductOfferingStatus) {
    await this.getOffering(id);
    return this.prisma.productOffering.update({
      where: { id },
      data: { status },
      include: OFFERING_DETAIL_INCLUDE,
    });
  }

  async replacePlaceLinks(offeringId: string, dto: ReplaceProductPlaceLinksDto) {
    await this.getOffering(offeringId);
    const placeIds = [...new Set(dto.links.map((l) => l.placeId))];
    if (placeIds.length) {
      const count = await this.prisma.place.count({ where: { id: { in: placeIds } } });
      if (count !== placeIds.length) {
        throw new BadRequestException('placeLinks 中存在不存在的 placeId');
      }
    }

    await this.prisma.$transaction([
      this.prisma.productPlaceLink.deleteMany({ where: { offeringId } }),
      ...dto.links.map((link) =>
        this.prisma.productPlaceLink.create({
          data: {
            offeringId,
            placeId: link.placeId,
            role: link.role,
            sortOrder: link.sortOrder ?? 0,
            label: link.label,
            geometry: link.geometry as Prisma.InputJsonValue | undefined,
            metadata: link.metadata as Prisma.InputJsonValue | undefined,
          },
        }),
      ),
    ]);

    return this.getOffering(offeringId);
  }

  // —— Session ——
  async listSessions(offeringId: string, query: ListSessionsQueryDto) {
    await this.getOffering(offeringId);
    const dateFilter =
      query.date != null
        ? { equals: parseLocalDate(query.date) }
        : query.from || query.to
          ? {
              ...(query.from ? { gte: parseLocalDate(query.from) } : {}),
              ...(query.to ? { lte: parseLocalDate(query.to) } : {}),
            }
          : undefined;

    return this.prisma.productSession.findMany({
      where: {
        offeringId,
        ...(dateFilter ? { localDate: dateFilter } : {}),
      },
      include: { ratePlans: { orderBy: { code: 'asc' } } },
      orderBy: [{ localDate: 'asc' }, { startTimeLocal: 'asc' }],
    });
  }

  async createSession(offeringId: string, dto: CreateProductSessionDto) {
    await this.getOffering(offeringId);
    return this.prisma.productSession.create({
      data: {
        offeringId,
        localDate: parseLocalDate(dto.localDate),
        startTimeLocal: dto.startTimeLocal,
        endTimeLocal: dto.endTimeLocal,
        meetTimeLocal: dto.meetTimeLocal,
        latestCheckInLocal: dto.latestCheckInLocal,
        timezone: dto.timezone,
        capacityTotal: dto.capacityTotal,
        capacityRemaining: dto.capacityRemaining ?? dto.capacityTotal,
        status: dto.status,
        minParticipants: dto.minParticipants,
        isGuaranteedDeparture: dto.isGuaranteedDeparture ?? false,
        weatherStatus: dto.weatherStatus,
        postponementOrCancelStatus: dto.postponementOrCancelStatus,
        externalSessionId: dto.externalSessionId,
        metadata: dto.metadata as Prisma.InputJsonValue | undefined,
      },
    });
  }

  async updateSession(sessionId: string, dto: UpdateProductSessionDto) {
    const existing = await this.prisma.productSession.findUnique({ where: { id: sessionId } });
    if (!existing) throw new NotFoundException(`ProductSession not found: ${sessionId}`);
    const { localDate, ...rest } = dto;
    return this.prisma.productSession.update({
      where: { id: sessionId },
      data: {
        ...rest,
        ...(localDate ? { localDate: parseLocalDate(localDate) } : {}),
        metadata:
          dto.metadata === undefined
            ? undefined
            : (dto.metadata as Prisma.InputJsonValue),
      },
    });
  }

  async getSession(sessionId: string, opts?: { publishedOnly?: boolean }) {
    const row = await this.prisma.productSession.findUnique({
      where: { id: sessionId },
      include: {
        offering: {
          include: {
            operator: { select: { id: true, brandName: true } },
            experienceDefinition: {
              select: { id: true, code: true, weatherDependency: true },
            },
            placeLinks: {
              include: {
                place: { select: { id: true, nameEN: true, nameCN: true } },
              },
            },
          },
        },
        ratePlans: true,
      },
    });
    if (!row) throw new NotFoundException(`ProductSession not found: ${sessionId}`);
    if (
      opts?.publishedOnly &&
      row.offering.status !== ProductOfferingStatus.PUBLISHED
    ) {
      throw new NotFoundException(`ProductSession not found: ${sessionId}`);
    }
    return row;
  }

  // —— Rate ——
  async listRates(offeringId: string) {
    await this.getOffering(offeringId);
    return this.prisma.ratePlan.findMany({
      where: { offeringId },
      orderBy: [{ sessionId: 'asc' }, { code: 'asc' }],
    });
  }

  async createRate(offeringId: string, dto: CreateRatePlanDto) {
    await this.getOffering(offeringId);
    if (dto.sessionId) {
      const session = await this.prisma.productSession.findUnique({
        where: { id: dto.sessionId },
      });
      if (!session || session.offeringId !== offeringId) {
        throw new BadRequestException('sessionId 不属于该 offering');
      }
    }
    return this.prisma.ratePlan.create({
      data: {
        offeringId,
        sessionId: dto.sessionId ?? null,
        code: dto.code,
        nameEN: dto.nameEN,
        nameCN: dto.nameCN,
        currency: dto.currency,
        amount: new Prisma.Decimal(dto.amount),
        travelerType: dto.travelerType,
        refundable: dto.refundable,
        includesTransfer: dto.includesTransfer,
        inventoryCap: dto.inventoryCap,
        bookingRules: dto.bookingRules as Prisma.InputJsonValue | undefined,
        metadata: dto.metadata as Prisma.InputJsonValue | undefined,
      },
    });
  }

  async updateRate(rateId: string, dto: UpdateRatePlanDto) {
    const existing = await this.prisma.ratePlan.findUnique({ where: { id: rateId } });
    if (!existing) throw new NotFoundException(`RatePlan not found: ${rateId}`);
    const { amount, sessionId, ...rest } = dto;
    return this.prisma.ratePlan.update({
      where: { id: rateId },
      data: {
        ...rest,
        ...(amount !== undefined ? { amount: new Prisma.Decimal(amount) } : {}),
        ...(sessionId !== undefined ? { sessionId } : {}),
        metadata:
          dto.metadata === undefined
            ? undefined
            : (dto.metadata as Prisma.InputJsonValue),
        bookingRules:
          dto.bookingRules === undefined
            ? undefined
            : (dto.bookingRules as Prisma.InputJsonValue),
      },
    });
  }

  // —— Place ↔ Experience（规划层，无供应商） ——
  async listExperiencesAtPlace(
    placeId: number,
    opts?: { includeInactive?: boolean },
  ) {
    const place = await this.prisma.place.findUnique({
      where: { id: placeId },
      select: { id: true, nameEN: true, nameCN: true, category: true },
    });
    if (!place) throw new NotFoundException(`Place not found: ${placeId}`);

    const links = await this.prisma.placeExperienceLink.findMany({
      where: {
        placeId,
        ...(opts?.includeInactive ? {} : { isActive: true }),
      },
      include: { experienceDefinition: true },
      orderBy: [{ sortOrder: 'asc' }, { createdAt: 'asc' }],
    });

    return {
      place,
      items: links.map((link) => ({
        linkId: link.id,
        sortOrder: link.sortOrder,
        label: link.label,
        isFeatured: link.isFeatured,
        isActive: link.isActive,
        notes: link.notes,
        metadata: link.metadata,
        experience: link.experienceDefinition,
        /** 弹窗主标题：地点覆盖名优先 */
        displayNameZh: link.label ?? link.experienceDefinition.displayNameZh,
        displayNameEn: link.label ?? link.experienceDefinition.displayNameEn,
      })),
    };
  }

  async replacePlaceExperienceLinks(
    placeId: number,
    dto: ReplacePlaceExperienceLinksDto,
  ) {
    const place = await this.prisma.place.findUnique({
      where: { id: placeId },
      select: { id: true },
    });
    if (!place) throw new NotFoundException(`Place not found: ${placeId}`);

    const expIds = [...new Set(dto.links.map((l) => l.experienceDefinitionId))];
    if (expIds.length > 0) {
      const found = await this.prisma.experienceDefinition.findMany({
        where: { id: { in: expIds } },
        select: { id: true },
      });
      if (found.length !== expIds.length) {
        const ok = new Set(found.map((f) => f.id));
        const missing = expIds.filter((id) => !ok.has(id));
        throw new BadRequestException(
          `ExperienceDefinition not found: ${missing.join(', ')}`,
        );
      }
    }

    await this.prisma.$transaction(async (tx) => {
      await tx.placeExperienceLink.deleteMany({ where: { placeId } });
      if (dto.links.length === 0) return;
      await tx.placeExperienceLink.createMany({
        data: dto.links.map((l, i) => ({
          placeId,
          experienceDefinitionId: l.experienceDefinitionId,
          sortOrder: l.sortOrder ?? i * 10,
          label: l.label,
          isFeatured: l.isFeatured ?? false,
          isActive: l.isActive ?? true,
          notes: l.notes,
          metadata: l.metadata as Prisma.InputJsonValue | undefined,
        })),
      });
    });

    return this.listExperiencesAtPlace(placeId, { includeInactive: true });
  }
}

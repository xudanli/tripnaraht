import {
  BadRequestException,
  ConflictException,
  Injectable,
  Logger,
  NotFoundException,
} from '@nestjs/common';
import { Prisma } from '@prisma/client';
import { ZodError } from 'zod';
import { PrismaService } from '../prisma/prisma.service';
import {
  assembleCountryProfileResponse,
  mergeV2SeedPatch,
  parseAndValidateV2Seed,
  parseAndValidateV2SeedPartial,
  seedV2ToPrismaUpdate,
} from './country-profile-v2.mapper';
import type { CountryProfileV2Data } from './types/country-profile-v2.types';
import type {
  GetCountryProfilesAdminQueryDto,
  PatchCountryProfileAdminDto,
  UpsertCountryProfileAdminDto,
} from './dto/country-profile-admin.dto';

@Injectable()
export class CountriesAdminService {
  private readonly logger = new Logger(CountriesAdminService.name);

  constructor(private readonly prisma: PrismaService) {}

  async list(query: GetCountryProfilesAdminQueryDto) {
    const page = query.page ?? 1;
    const limit = Math.min(query.limit ?? 20, 100);
    const skip = (page - 1) * limit;

    const where: Prisma.CountryProfileWhereInput = {};
    if (query.q?.trim()) {
      const q = query.q.trim();
      where.OR = [
        { nameCN: { contains: q } },
        { nameEN: { contains: q, mode: 'insensitive' } },
        { isoCode: { contains: q.toUpperCase() } },
      ];
    }

    const [items, total] = await Promise.all([
      this.prisma.countryProfile.findMany({
        where,
        skip,
        take: limit,
        orderBy: { updatedAt: 'desc' },
        select: {
          isoCode: true,
          nameCN: true,
          nameEN: true,
          schemaVersion: true,
          currencyCode: true,
          currencyName: true,
          paymentType: true,
          exchangeRateToCNY: true,
          exchangeRateToUSD: true,
          updatedAt: true,
        },
      }),
      this.prisma.countryProfile.count({ where }),
    ]);

    return {
      items,
      total,
      page,
      limit,
      totalPages: Math.ceil(total / limit) || 0,
    };
  }

  async getByIsoCode(isoCode: string): Promise<CountryProfileV2Data> {
    const profile = await this.findOrThrow(isoCode);
    return assembleCountryProfileResponse(profile);
  }

  async create(dto: UpsertCountryProfileAdminDto): Promise<CountryProfileV2Data> {
    const seed = this.parseUpsertBody(dto);
    const iso = seed.isoCode.toUpperCase();

    const existing = await this.prisma.countryProfile.findUnique({ where: { isoCode: iso } });
    if (existing) {
      throw new ConflictException(`国家档案已存在: ${iso}`);
    }

    const payload = seedV2ToPrismaUpdate(seed);
    const created = await this.prisma.countryProfile.create({ data: payload });
    this.logger.log(`CountryProfile created via admin: ${iso}`);
    return assembleCountryProfileResponse(created);
  }

  async replace(isoCode: string, dto: UpsertCountryProfileAdminDto): Promise<CountryProfileV2Data> {
    await this.findOrThrow(isoCode);
    const seed = this.parseUpsertBody(dto);
    const pathCode = isoCode.toUpperCase();
    if (seed.isoCode.toUpperCase() !== pathCode) {
      throw new BadRequestException(
        `路径国家代码 ${pathCode} 与请求体 isoCode ${seed.isoCode} 不一致`,
      );
    }

    const payload = seedV2ToPrismaUpdate(seed);
    const updated = await this.prisma.countryProfile.update({
      where: { isoCode: pathCode },
      data: payload,
    });
    this.logger.log(`CountryProfile replaced via admin: ${pathCode}`);
    return assembleCountryProfileResponse(updated);
  }

  async patch(isoCode: string, dto: PatchCountryProfileAdminDto): Promise<CountryProfileV2Data> {
    const existing = await this.findOrThrow(isoCode);
    const pathCode = isoCode.toUpperCase();

    let partial;
    try {
      partial = parseAndValidateV2SeedPartial(dto);
    } catch (e) {
      throw this.toValidationException(e);
    }

    if (partial.isoCode && partial.isoCode.toUpperCase() !== pathCode) {
      throw new BadRequestException('不允许通过 PATCH 修改 isoCode（请删除后重建）');
    }

    const seed = mergeV2SeedPatch(existing, partial);
    const payload = seedV2ToPrismaUpdate(seed);
    const updated = await this.prisma.countryProfile.update({
      where: { isoCode: pathCode },
      data: payload,
    });
    this.logger.log(`CountryProfile patched via admin: ${pathCode}`);
    return assembleCountryProfileResponse(updated);
  }

  async remove(isoCode: string): Promise<{ isoCode: string; deleted: true }> {
    await this.findOrThrow(isoCode);
    const code = isoCode.toUpperCase();
    await this.prisma.countryProfile.delete({ where: { isoCode: code } });
    this.logger.warn(`CountryProfile deleted via admin: ${code}`);
    return { isoCode: code, deleted: true };
  }

  validateBody(raw: unknown): { valid: true; isoCode: string; schemaVersion: number } {
    const seed = parseAndValidateV2Seed(raw);
    return { valid: true, isoCode: seed.isoCode, schemaVersion: seed.schemaVersion };
  }

  private parseUpsertBody(dto: UpsertCountryProfileAdminDto) {
    try {
      return parseAndValidateV2Seed(dto);
    } catch (e) {
      throw this.toValidationException(e);
    }
  }

  private async findOrThrow(isoCode: string) {
    const profile = await this.prisma.countryProfile.findUnique({
      where: { isoCode: isoCode.toUpperCase() },
    });
    if (!profile) {
      throw new NotFoundException(`未找到国家代码为 ${isoCode.toUpperCase()} 的国家档案`);
    }
    return profile;
  }

  private toValidationException(e: unknown): BadRequestException {
    if (e instanceof ZodError) {
      return new BadRequestException({
        message: 'CountryProfile V2 校验失败',
        issues: e.issues,
      });
    }
    if (e instanceof BadRequestException) return e;
    return new BadRequestException(e instanceof Error ? e.message : '校验失败');
  }
}

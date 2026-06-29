/**
 * CountryProfile — 兼容未跑 V2 migration 的数据库（缺 schemaVersion / timeBoundaries / entryRequirements）
 */

import type { CountryProfile, Prisma, PrismaClient } from '@prisma/client';
import { Logger } from '@nestjs/common';

const logger = new Logger('CountryProfileCompat');

let legacySchemaWarned = false;

const LEGACY_COUNTRY_PROFILE_SELECT = {
  isoCode: true,
  nameCN: true,
  nameEN: true,
  powerInfo: true,
  emergency: true,
  paymentInfo: true,
  visaForCN: true,
  updatedAt: true,
  currencyCode: true,
  currencyName: true,
  exchangeRateToCNY: true,
  paymentType: true,
  exchangeRateToUSD: true,
  complianceInfo: true,
  travelCulture: true,
} as const;

type LegacyCountryProfileRow = Prisma.CountryProfileGetPayload<{
  select: typeof LEGACY_COUNTRY_PROFILE_SELECT;
}>;

function isCountryProfileSchemaMismatch(error: unknown): boolean {
  const msg = error instanceof Error ? error.message : String(error);
  return (
    msg.includes('does not exist in the current database') &&
    msg.includes('CountryProfile')
  );
}

function legacyRowToProfile(row: LegacyCountryProfileRow): CountryProfile {
  return {
    ...row,
    entryRequirements: null,
    schemaVersion: 2,
    timeBoundaries: null,
  };
}

/**
 * 读 CountryProfile；Prisma schema 领先 DB 时回退到 baseline 列集合并合成 V2 缺省字段。
 */
export async function findCountryProfileCompat(
  prisma: PrismaClient,
  isoCode: string,
): Promise<CountryProfile | null> {
  try {
    return await prisma.countryProfile.findUnique({
      where: { isoCode },
    });
  } catch (error) {
    if (!isCountryProfileSchemaMismatch(error)) throw error;

    if (!legacySchemaWarned) {
      legacySchemaWarned = true;
      logger.warn(
        'CountryProfile V2 columns missing in DB — using legacy select. Run: npx prisma migrate deploy (see prisma/migrations/20260520160000_country_profile_v2_fields)',
      );
    }

    const legacy = await prisma.countryProfile.findUnique({
      where: { isoCode },
      select: LEGACY_COUNTRY_PROFILE_SELECT,
    });
    return legacy ? legacyRowToProfile(legacy) : null;
  }
}

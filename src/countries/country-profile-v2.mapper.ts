import type { CountryProfile, PaymentType } from '@prisma/client';
import type { CountryPaymentProfile } from './types/country-profile-v2.types';
import type { CountryFacts } from '../trips/readiness/compilers/facts-to-readiness.compiler';
import {
  countryProfileV2SeedSchema,
  countryProfileV2SeedPartialSchema,
  type CountryProfileV2Seed,
  type CountryProfileV2SeedPartial,
} from './schemas/country-profile-v2.zod';
import type {
  CountryProfileV2Compliance,
  CountryProfileV2Data,
  CountryProfileV2EntryRequirements,
  CountryProfileV2TimeBoundaries,
} from './types/country-profile-v2.types';
import {
  buildEntryRequirementsForPrisma,
  mergeEntryRequirementsPatch,
  normalizeEntryRequirements,
} from './utils/entry-requirements.util';

/** Normalize legacy powerInfo shapes (plugs / string voltage) → compiler-friendly shape */
export function normalizePowerInfo(raw: unknown): CountryFacts['powerInfo'] | undefined {
  if (!raw || typeof raw !== 'object') return undefined;
  const p = raw as Record<string, unknown>;
  const plugTypes =
    (Array.isArray(p.plugTypes) ? p.plugTypes : Array.isArray(p.plugs) ? p.plugs : []) as string[];
  let voltage: number | undefined;
  if (typeof p.voltage === 'number') voltage = p.voltage;
  else if (typeof p.voltage === 'string') {
    const m = p.voltage.match(/[\d.]+/);
    if (m) voltage = Number(m[0]);
  }
  const frequency =
    typeof p.frequency === 'number'
      ? p.frequency
      : typeof p.frequency === 'string'
        ? Number(String(p.frequency).replace(/\D/g, '')) || undefined
        : undefined;
  return {
    plugTypes: plugTypes.map(String),
    voltage,
    frequency,
    note: typeof p.note === 'string' ? p.note : undefined,
  };
}

export function prismaRowToCountryFacts(profile: CountryProfile): CountryFacts {
  const compliance = (profile.complianceInfo ?? {}) as CountryProfileV2Compliance;
  const timeBoundaries = profile.timeBoundaries as CountryProfileV2TimeBoundaries | null;
  const travelCulture = profile.travelCulture as CountryFacts['travelCulture'];
  const entryRequirements = normalizeEntryRequirements(
    profile.entryRequirements,
    profile.visaForCN,
  );

  return {
    isoCode: profile.isoCode,
    nameCN: profile.nameCN,
    nameEN: profile.nameEN ?? undefined,
    currencyCode: profile.currencyCode ?? undefined,
    currencyName: profile.currencyName ?? undefined,
    paymentType: profile.paymentType ?? undefined,
    paymentInfo: profile.paymentInfo as CountryFacts['paymentInfo'],
    powerInfo: normalizePowerInfo(profile.powerInfo),
    emergency: profile.emergency as CountryFacts['emergency'],
    entryRequirements,
    exchangeRateToCNY: profile.exchangeRateToCNY ?? undefined,
    exchangeRateToUSD: profile.exchangeRateToUSD ?? undefined,
    schemaVersion: 2,
    complianceInfo: compliance,
    timeBoundaries: timeBoundaries ?? undefined,
    travelCulture,
  };
}

function resolveDisplayPaymentType(
  prismaType: PaymentType | null | undefined,
  paymentInfo: unknown,
): string | undefined {
  const info = paymentInfo as Record<string, unknown> | null | undefined;
  const profile = info?.paymentProfile;
  if (typeof profile === 'string') return profile;
  return prismaType ?? undefined;
}

/** HYBRID_DIGITAL_PREFER 等扩展标签 → Prisma PaymentType */
export function mapPaymentTypeForPrisma(
  paymentType?: string,
): PaymentType | undefined {
  if (!paymentType) return undefined;
  if (paymentType === 'HYBRID_DIGITAL_PREFER') return 'BALANCED';
  if (paymentType === 'CASH_HEAVY' || paymentType === 'BALANCED' || paymentType === 'DIGITAL_ONLY') {
    return paymentType;
  }
  return 'BALANCED';
}

export function assembleCountryProfileResponse(profile: CountryProfile): CountryProfileV2Data {
  const paymentInfo = profile.paymentInfo as Record<string, unknown> | undefined;
  const entryRequirements = normalizeEntryRequirements(
    profile.entryRequirements,
    profile.visaForCN,
  );
  return {
    schemaVersion: 2,
    isoCode: profile.isoCode,
    nameCN: profile.nameCN,
    nameEN: profile.nameEN ?? undefined,
    updatedAt: profile.updatedAt,
    currencyCode: profile.currencyCode ?? undefined,
    currencyName: profile.currencyName ?? undefined,
    exchangeRateToCNY: profile.exchangeRateToCNY ?? undefined,
    exchangeRateToUSD: profile.exchangeRateToUSD ?? undefined,
    paymentType: resolveDisplayPaymentType(profile.paymentType, paymentInfo),
    paymentInfo,
    powerInfo: profile.powerInfo as Record<string, unknown> | undefined,
    emergency: profile.emergency as Record<string, unknown> | undefined,
    entryRequirements,
    visaForCN: entryRequirements?.byNationality?.CN,
    complianceInfo: profile.complianceInfo as CountryProfileV2Compliance | undefined,
    travelCulture: profile.travelCulture as CountryProfileV2Data['travelCulture'],
    timeBoundaries: (profile.timeBoundaries ?? undefined) as
      | CountryProfileV2TimeBoundaries
      | undefined,
  };
}

/** Map validated seed JSON → Prisma update payload */
export function seedV2ToPrismaUpdate(seed: CountryProfileV2Seed): {
  isoCode: string;
  nameCN: string;
  nameEN?: string;
  currencyCode?: string;
  currencyName?: string;
  exchangeRateToCNY?: number;
  exchangeRateToUSD?: number;
  paymentType?: PaymentType;
  paymentInfo?: object;
  powerInfo?: object;
  emergency?: object;
  entryRequirements?: object;
  visaForCN?: object;
  complianceInfo?: object;
  travelCulture?: object;
  schemaVersion: number;
  timeBoundaries?: object;
  updatedAt: Date;
} {
  return {
    isoCode: seed.isoCode.toUpperCase(),
    nameCN: seed.nameCN,
    nameEN: seed.nameEN,
    currencyCode: seed.currencyCode,
    currencyName: seed.currencyName,
    exchangeRateToCNY: seed.exchangeRateToCNY,
    exchangeRateToUSD: seed.exchangeRateToUSD,
    paymentType: mapPaymentTypeForPrisma(seed.paymentType),
    paymentInfo: {
      ...(seed.paymentInfo ?? {}),
      ...(seed.paymentType && !['CASH_HEAVY', 'BALANCED', 'DIGITAL_ONLY'].includes(seed.paymentType)
        ? { paymentProfile: seed.paymentType as CountryPaymentProfile }
        : {}),
    },
    powerInfo: seed.powerInfo,
    emergency: seed.emergency,
    entryRequirements: buildEntryRequirementsForPrisma(seed) as object | undefined,
    visaForCN: buildEntryRequirementsForPrisma(seed)?.byNationality?.CN as object | undefined,
    complianceInfo: seed.complianceInfo,
    travelCulture: seed.travelCulture,
    schemaVersion: 2,
    timeBoundaries: seed.timeBoundaries,
    updatedAt: new Date(),
  };
}

export function parseAndValidateV2Seed(raw: unknown): CountryProfileV2Seed {
  return countryProfileV2SeedSchema.parse(raw);
}

export function parseAndValidateV2SeedPartial(raw: unknown): CountryProfileV2SeedPartial {
  return countryProfileV2SeedPartialSchema.parse(raw);
}

/** Reconstruct a V2 seed from DB row for merge-on-patch */
export function prismaRowToV2SeedCandidate(profile: CountryProfile): CountryProfileV2Seed {
  const paymentInfo = (profile.paymentInfo ?? {}) as Record<string, unknown>;
  const paymentProfile = paymentInfo.paymentProfile as string | undefined;
  let paymentType: CountryProfileV2Seed['paymentType'] | undefined =
    (profile.paymentType as CountryProfileV2Seed['paymentType']) ?? undefined;
  if (
    paymentProfile &&
    ['CASH_HEAVY', 'BALANCED', 'DIGITAL_ONLY', 'HYBRID_DIGITAL_PREFER'].includes(paymentProfile)
  ) {
    paymentType = paymentProfile as CountryProfileV2Seed['paymentType'];
  }
  return parseAndValidateV2Seed({
    schemaVersion: 2,
    isoCode: profile.isoCode,
    nameCN: profile.nameCN,
    nameEN: profile.nameEN ?? undefined,
    currencyCode: profile.currencyCode ?? undefined,
    currencyName: profile.currencyName ?? undefined,
    exchangeRateToCNY: profile.exchangeRateToCNY ?? undefined,
    exchangeRateToUSD: profile.exchangeRateToUSD ?? undefined,
    paymentType,
    paymentInfo,
    powerInfo: (profile.powerInfo as Record<string, unknown> | null) ?? undefined,
    emergency: (profile.emergency as Record<string, unknown> | null) ?? undefined,
    entryRequirements: normalizeEntryRequirements(
      profile.entryRequirements,
      profile.visaForCN,
    ) as CountryProfileV2EntryRequirements | undefined,
    complianceInfo: (profile.complianceInfo as Record<string, unknown> | null) ?? undefined,
    timeBoundaries: (profile.timeBoundaries as Record<string, unknown> | null) ?? undefined,
    travelCulture: (profile.travelCulture as Record<string, unknown> | null) ?? undefined,
  });
}

function mergeJsonField(
  existing: unknown,
  patch: Record<string, unknown> | undefined,
): Record<string, unknown> | undefined {
  if (!patch) return undefined;
  const base =
    existing && typeof existing === 'object' && !Array.isArray(existing)
      ? (existing as Record<string, unknown>)
      : {};
  return { ...base, ...patch };
}

function mergeComplianceInfo(
  existing: unknown,
  patch: Record<string, unknown> | undefined,
): Record<string, unknown> | undefined {
  if (!patch) return undefined;
  const merged = mergeJsonField(existing, patch)!;
  const base =
    existing && typeof existing === 'object' && !Array.isArray(existing)
      ? (existing as Record<string, unknown>)
      : {};
  if (
    patch.drivingRules &&
    typeof patch.drivingRules === 'object' &&
    base.drivingRules &&
    typeof base.drivingRules === 'object'
  ) {
    merged.drivingRules = {
      ...(base.drivingRules as Record<string, unknown>),
      ...(patch.drivingRules as Record<string, unknown>),
    };
  }
  return merged;
}

/** Apply admin PATCH; returns full validated V2 seed */
export function mergeV2SeedPatch(
  profile: CountryProfile,
  patch: CountryProfileV2SeedPartial,
): CountryProfileV2Seed {
  const base = prismaRowToV2SeedCandidate(profile);

  const merged = {
    ...base,
    ...patch,
    isoCode: (patch.isoCode ?? base.isoCode).toUpperCase(),
    schemaVersion: 2 as const,
    paymentInfo:
      patch.paymentInfo !== undefined
        ? mergeJsonField(base.paymentInfo, patch.paymentInfo)
        : base.paymentInfo,
    powerInfo:
      patch.powerInfo !== undefined ? mergeJsonField(base.powerInfo, patch.powerInfo) : base.powerInfo,
    emergency:
      patch.emergency !== undefined
        ? mergeJsonField(base.emergency, patch.emergency)
        : base.emergency,
    entryRequirements: (() => {
      const baseEr = normalizeEntryRequirements(
        base.entryRequirements,
        base.visaForCN as Record<string, unknown> | undefined,
      );
      const patchEr = buildEntryRequirementsForPrisma({
        entryRequirements: patch.entryRequirements as CountryProfileV2EntryRequirements | undefined,
        visaForCN: patch.visaForCN as Record<string, unknown> | undefined,
      });
      return mergeEntryRequirementsPatch(baseEr, patchEr);
    })(),
    visaForCN: undefined,
    complianceInfo:
      patch.complianceInfo !== undefined
        ? mergeComplianceInfo(base.complianceInfo, patch.complianceInfo)
        : base.complianceInfo,
    travelCulture:
      patch.travelCulture !== undefined
        ? mergeJsonField(base.travelCulture, patch.travelCulture)
        : base.travelCulture,
    timeBoundaries:
      patch.timeBoundaries !== undefined
        ? mergeJsonField(base.timeBoundaries, patch.timeBoundaries)
        : base.timeBoundaries,
  };

  return parseAndValidateV2Seed(merged);
}

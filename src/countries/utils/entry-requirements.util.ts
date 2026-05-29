import type {
  CountryProfileV2EntryRequirement,
  CountryProfileV2EntryRequirements,
} from '../types/country-profile-v2.types';
import type { CountryProfileV2Seed } from '../schemas/country-profile-v2.zod';

const ISO2 = /^[A-Z]{2}$/;

function isEntryRequirementRow(v: unknown): v is Record<string, unknown> {
  return !!v && typeof v === 'object' && !Array.isArray(v) && typeof (v as { status?: unknown }).status === 'string';
}

/** Normalize legacy `visaForCN` + V2 `entryRequirements` into one block */
export function normalizeEntryRequirements(
  entryRequirementsRaw: unknown,
  legacyVisaForCN?: unknown,
): CountryProfileV2EntryRequirements | undefined {
  const byNationality: Record<string, CountryProfileV2EntryRequirement> = {};
  let officialLink: string | undefined;

  if (entryRequirementsRaw && typeof entryRequirementsRaw === 'object' && !Array.isArray(entryRequirementsRaw)) {
    const block = entryRequirementsRaw as Record<string, unknown>;
    if (block.byNationality && typeof block.byNationality === 'object') {
      for (const [k, v] of Object.entries(block.byNationality as Record<string, unknown>)) {
        const code = k.toUpperCase();
        if (ISO2.test(code) && isEntryRequirementRow(v)) {
          byNationality[code] = normalizeEntryRequirementRow(v);
        }
      }
      if (typeof block.officialLink === 'string') officialLink = block.officialLink;
    } else {
      for (const [k, v] of Object.entries(block)) {
        const code = k.toUpperCase();
        if (ISO2.test(code) && isEntryRequirementRow(v)) {
          byNationality[code] = normalizeEntryRequirementRow(v);
        }
      }
    }
  }

  if (legacyVisaForCN && isEntryRequirementRow(legacyVisaForCN)) {
    byNationality.CN = { ...byNationality.CN, ...normalizeEntryRequirementRow(legacyVisaForCN) };
  }

  if (Object.keys(byNationality).length === 0) return undefined;
  return { officialLink, byNationality };
}

export function normalizeEntryRequirementRow(
  raw: Record<string, unknown>,
): CountryProfileV2EntryRequirement {
  return {
    cost: typeof raw.cost === 'number' ? raw.cost : undefined,
    link: typeof raw.link === 'string' ? raw.link : undefined,
    status: typeof raw.status === 'string' ? raw.status : undefined,
    statusLabel: typeof raw.statusLabel === 'string' ? raw.statusLabel : undefined,
    statusLabelCN:
      typeof raw.statusLabelCN === 'string'
        ? raw.statusLabelCN
        : typeof raw.statusCN === 'string'
          ? raw.statusCN
          : undefined,
    requirementSummary:
      typeof raw.requirementSummary === 'string'
        ? raw.requirementSummary
        : typeof raw.requirement === 'string'
          ? raw.requirement
          : undefined,
    requirementSummaryCN:
      typeof raw.requirementSummaryCN === 'string'
        ? raw.requirementSummaryCN
        : typeof raw.requirementCN === 'string'
          ? raw.requirementCN
          : undefined,
    allowedStay: typeof raw.allowedStay === 'string' ? raw.allowedStay : undefined,
    allowedStayCN: typeof raw.allowedStayCN === 'string' ? raw.allowedStayCN : undefined,
    schengenZone: typeof raw.schengenZone === 'boolean' ? raw.schengenZone : undefined,
    visaApplicationLeadTimeDays:
      typeof raw.visaApplicationLeadTimeDays === 'number' ? raw.visaApplicationLeadTimeDays : undefined,
    nzetaAvailableForPassports: Array.isArray(raw.nzetaAvailableForPassports)
      ? (raw.nzetaAvailableForPassports as string[])
      : undefined,
  };
}

export function resolveEntryRequirementForNationality(
  entryRequirements: CountryProfileV2EntryRequirements | undefined,
  nationality?: string,
): CountryProfileV2EntryRequirement | undefined {
  if (!entryRequirements?.byNationality || !nationality) return undefined;
  const code = nationality.trim().toUpperCase();
  if (!ISO2.test(code)) return undefined;
  return entryRequirements.byNationality[code];
}

/** Merge seed `visaForCN` into `entryRequirements` for Prisma write */
export function buildEntryRequirementsForPrisma(
  seed: Pick<CountryProfileV2Seed, 'entryRequirements' | 'visaForCN'>,
): CountryProfileV2EntryRequirements | undefined {
  return normalizeEntryRequirements(
    seed.entryRequirements,
    seed.visaForCN as Record<string, unknown> | undefined,
  );
}

export function mergeEntryRequirementsPatch(
  existing: CountryProfileV2EntryRequirements | undefined,
  patch: CountryProfileV2EntryRequirements | undefined,
): CountryProfileV2EntryRequirements | undefined {
  if (!patch) return existing;
  if (!existing) return patch;
  return {
    officialLink: patch.officialLink ?? existing.officialLink,
    byNationality: {
      ...existing.byNationality,
      ...patch.byNationality,
    },
  };
}

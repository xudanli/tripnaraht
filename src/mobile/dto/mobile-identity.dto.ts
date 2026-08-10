/** 个人资料 — GET/PATCH /api/mobile/users/me/identity */

export const IDENTITY_VISIBILITY_LEVELS = ['self_only', 'organizer', 'team'] as const;
export type IdentityVisibilityLevel = (typeof IDENTITY_VISIBILITY_LEVELS)[number];

export const MOBILE_IDENTITY_PREFERENCES_KEY = 'identity';

export interface IdentityVisibilityDto {
  legalFullName: IdentityVisibilityLevel;
  dateOfBirth: IdentityVisibilityLevel;
  phone: IdentityVisibilityLevel;
}

export interface MobileIdentityResponseDto {
  displayName: string | null;
  avatarUrl: string | null;
  email: string | null;
  phone: string | null;
  legalFullName: string | null;
  dateOfBirth: string | null;
  nationality: string | null;
  /** Resolved display label for nationality (picker-friendly). */
  nationalityLabelZh: string | null;
  nationalityLabelEn: string | null;
  residencyRegion: string | null;
  residencyRegionLabelZh: string | null;
  residencyRegionLabelEn: string | null;
  preferredLanguage: string | null;
  visibility: IdentityVisibilityDto;
  updatedAt: string;
}

export interface PatchMobileIdentityDto {
  displayName?: string | null;
  avatarUrl?: string | null;
  phone?: string | null;
  legalFullName?: string | null;
  dateOfBirth?: string | null;
  /** ISO alpha-2 string, or picker object `{ code }` / `{ isoCode }`. */
  nationality?: string | { code?: string; isoCode?: string; nameZh?: string } | null;
  /** Alias accepted from some clients. */
  nationalityCode?: string | null;
  countryCode?: string | null;
  residencyRegion?: string | { code?: string; nameZh?: string; countryCode?: string } | null;
  residencyRegionCode?: string | null;
  preferredLanguage?: string | null;
  visibility?: Partial<IdentityVisibilityDto>;
}

/**
 * Normalize picker payloads → uppercase ISO codes.
 */
export function normalizeIdentityPatch(
  raw: PatchMobileIdentityDto | Record<string, unknown> | null | undefined,
): {
  displayName?: string | null;
  avatarUrl?: string | null;
  phone?: string | null;
  legalFullName?: string | null;
  dateOfBirth?: string | null;
  nationality?: string | null;
  residencyRegion?: string | null;
  preferredLanguage?: string | null;
  visibility?: Partial<IdentityVisibilityDto>;
} {
  const body = (raw && typeof raw === 'object' ? raw : {}) as Record<string, unknown>;
  const out: ReturnType<typeof normalizeIdentityPatch> = {};

  if (body.displayName !== undefined) out.displayName = body.displayName as string | null;
  if (body.avatarUrl !== undefined) out.avatarUrl = body.avatarUrl as string | null;
  if (body.phone !== undefined) out.phone = body.phone as string | null;
  if (body.legalFullName !== undefined) out.legalFullName = body.legalFullName as string | null;
  if (body.dateOfBirth !== undefined) out.dateOfBirth = body.dateOfBirth as string | null;
  if (body.preferredLanguage !== undefined) {
    out.preferredLanguage = body.preferredLanguage as string | null;
  }
  if (body.visibility !== undefined) {
    out.visibility = body.visibility as Partial<IdentityVisibilityDto>;
  }

  const nationalityRaw =
    body.nationality !== undefined
      ? body.nationality
      : body.nationalityCode !== undefined
        ? body.nationalityCode
        : body.countryCode;
  if (nationalityRaw !== undefined) {
    out.nationality = extractCode(nationalityRaw);
  }

  const regionRaw =
    body.residencyRegion !== undefined
      ? body.residencyRegion
      : body.residencyRegionCode;
  if (regionRaw !== undefined) {
    out.residencyRegion = extractCode(regionRaw);
  }

  return out;
}

function extractCode(raw: unknown): string | null {
  if (raw === null || raw === '') return null;
  if (typeof raw === 'string') {
    const t = raw.trim();
    return t.length ? t.toUpperCase() : null;
  }
  if (raw && typeof raw === 'object' && !Array.isArray(raw)) {
    const o = raw as Record<string, unknown>;
    for (const key of ['code', 'isoCode', 'countryCode', 'value', 'id']) {
      const v = o[key];
      if (typeof v === 'string' && v.trim()) return v.trim().toUpperCase();
    }
  }
  return null;
}

export const DEFAULT_IDENTITY_VISIBILITY: IdentityVisibilityDto = {
  legalFullName: 'self_only',
  dateOfBirth: 'self_only',
  phone: 'self_only',
};

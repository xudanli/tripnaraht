import { BadRequestException, Injectable } from '@nestjs/common';
import { PrismaService } from '../../prisma/prisma.service';
import { toInputJsonValue } from '../../trips/budget-os/utils/prisma-json.util';
import { UserPreferencesOtherStore, deepMerge } from './user-preferences-other.store';
import {
  DEFAULT_IDENTITY_VISIBILITY,
  IDENTITY_VISIBILITY_LEVELS,
  MOBILE_IDENTITY_PREFERENCES_KEY,
  normalizeIdentityPatch,
  type IdentityVisibilityDto,
  type IdentityVisibilityLevel,
  type MobileIdentityResponseDto,
  type PatchMobileIdentityDto,
} from '../dto/mobile-identity.dto';
import {
  ALL_CURATED_RESIDENCY_REGIONS,
  isKnownNationalityCode,
  isKnownResidencyRegionCode,
} from '../dictionaries/identity-geo.dictionary';

const DATE_RE = /^\d{4}-\d{2}-\d{2}$/;
const UUID_RE =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

function isUuid(value: string): boolean {
  return UUID_RE.test(value);
}

@Injectable()
export class MobileIdentityService {
  constructor(
    private readonly store: UserPreferencesOtherStore,
    private readonly prisma: PrismaService,
  ) {}

  async getIdentity(userId: string): Promise<MobileIdentityResponseDto> {
    const user = isUuid(userId)
      ? await this.prisma.user.findUnique({ where: { id: userId } })
      : null;
    const { value, preferences, updatedAt } = await this.store.readKey<
      Record<string, unknown>
    >(userId, MOBILE_IDENTITY_PREFERENCES_KEY);

    const stored = value && typeof value === 'object' ? value : {};
    const nationalityFallback =
      typeof preferences.nationality === 'string' ? preferences.nationality : null;
    const residencyFallback =
      typeof preferences.residencyCountry === 'string'
        ? preferences.residencyCountry
        : null;

    const nationality =
      asNullableString(stored.nationality) ?? asNullableString(nationalityFallback);
    const residencyRegion =
      asNullableString(stored.residencyRegion) ?? asNullableString(residencyFallback);

    const nationalityLabels = await this.resolveNationalityLabels(nationality);
    const regionLabels = resolveResidencyLabels(residencyRegion);

    return {
      displayName: user?.displayName ?? null,
      avatarUrl: user?.avatarUrl ?? null,
      email: user?.email ?? null,
      phone: asNullableString(stored.phone),
      legalFullName: asNullableString(stored.legalFullName),
      dateOfBirth: asNullableString(stored.dateOfBirth),
      nationality,
      nationalityLabelZh: nationalityLabels.nameZh,
      nationalityLabelEn: nationalityLabels.nameEn,
      residencyRegion,
      residencyRegionLabelZh: regionLabels.nameZh,
      residencyRegionLabelEn: regionLabels.nameEn,
      preferredLanguage: asNullableString(stored.preferredLanguage),
      visibility: normalizeVisibility(stored.visibility),
      updatedAt: (updatedAt ?? user?.updatedAt ?? new Date()).toISOString(),
    };
  }

  async patchIdentity(
    userId: string,
    raw: PatchMobileIdentityDto | Record<string, unknown>,
  ): Promise<MobileIdentityResponseDto> {
    const dto = normalizeIdentityPatch(raw);
    validatePatch(dto);

    const userPatch: { displayName?: string | null; avatarUrl?: string | null } = {};
    if (dto.displayName !== undefined) userPatch.displayName = dto.displayName;
    if (dto.avatarUrl !== undefined) userPatch.avatarUrl = dto.avatarUrl;
    if (Object.keys(userPatch).length > 0) {
      if (!isUuid(userId)) {
        throw new BadRequestException('登录后可保存个人中心资料');
      }
      await this.prisma.user.update({ where: { id: userId }, data: userPatch });
    }

    const identityPatch: Record<string, unknown> = {};
    if (dto.phone !== undefined) identityPatch.phone = dto.phone;
    if (dto.legalFullName !== undefined) identityPatch.legalFullName = dto.legalFullName;
    if (dto.dateOfBirth !== undefined) identityPatch.dateOfBirth = dto.dateOfBirth;
    if (dto.nationality !== undefined) identityPatch.nationality = dto.nationality;
    if (dto.residencyRegion !== undefined) identityPatch.residencyRegion = dto.residencyRegion;
    if (dto.preferredLanguage !== undefined) {
      identityPatch.preferredLanguage = dto.preferredLanguage;
    }
    if (dto.visibility !== undefined) {
      const current = await this.getIdentity(userId);
      identityPatch.visibility = {
        ...current.visibility,
        ...sanitizeVisibilityPartial(dto.visibility),
      };
    }

    if (Object.keys(identityPatch).length > 0) {
      // Dual-write: other.identity + legacy preferences.nationality / residencyCountry
      // so GET identity and old /users/profile stay consistent.
      await this.mergeIdentityAndLegacy(userId, identityPatch, {
        nationality: dto.nationality,
        residencyRegion: dto.residencyRegion,
      });
    }

    return this.getIdentity(userId);
  }

  private async mergeIdentityAndLegacy(
    userId: string,
    identityPatch: Record<string, unknown>,
    legacy: {
      nationality?: string | null;
      residencyRegion?: string | null;
    },
  ): Promise<void> {
    const { preferences, other } = await this.store.readOther(userId);
    const existingIdentity =
      other[MOBILE_IDENTITY_PREFERENCES_KEY] &&
      typeof other[MOBILE_IDENTITY_PREFERENCES_KEY] === 'object' &&
      !Array.isArray(other[MOBILE_IDENTITY_PREFERENCES_KEY])
        ? (other[MOBILE_IDENTITY_PREFERENCES_KEY] as Record<string, unknown>)
        : {};
    const nextIdentity = deepMerge(existingIdentity, identityPatch);

    const nextPreferences: Record<string, unknown> = {
      ...preferences,
      other: {
        ...other,
        [MOBILE_IDENTITY_PREFERENCES_KEY]: nextIdentity,
      },
    };

    if (legacy.nationality !== undefined) {
      nextPreferences.nationality = legacy.nationality;
    }
    if (legacy.residencyRegion !== undefined) {
      // Legacy field is country-level; use country prefix of ISO 3166-2 when present.
      const region = legacy.residencyRegion;
      nextPreferences.residencyCountry =
        region == null
          ? null
          : /^[A-Z]{2}-/.test(region)
            ? region.slice(0, 2)
            : region;
    }

    await this.prisma.userProfile.upsert({
      where: { userId },
      update: {
        preferences: toInputJsonValue(nextPreferences),
        updatedAt: new Date(),
      },
      create: {
        userId,
        preferences: toInputJsonValue(nextPreferences),
        updatedAt: new Date(),
      },
    });
  }

  private async resolveNationalityLabels(
    code: string | null,
  ): Promise<{ nameZh: string | null; nameEn: string | null }> {
    if (!code) return { nameZh: null, nameEn: null };
    try {
      const row = await this.prisma.countryProfile.findUnique({
        where: { isoCode: code },
        select: { nameCN: true, nameEN: true },
      });
      if (row) {
        return {
          nameZh: row.nameCN || code,
          nameEn: row.nameEN || row.nameCN || code,
        };
      }
    } catch {
      // ignore
    }
    return { nameZh: code, nameEn: code };
  }
}

function resolveResidencyLabels(
  code: string | null,
): { nameZh: string | null; nameEn: string | null } {
  if (!code) return { nameZh: null, nameEn: null };
  const hit = ALL_CURATED_RESIDENCY_REGIONS.find((r) => r.code === code);
  if (hit) return { nameZh: hit.nameZh, nameEn: hit.nameEn };
  return { nameZh: code, nameEn: code };
}

function asNullableString(v: unknown): string | null {
  if (v === null || v === undefined) return null;
  if (typeof v !== 'string') return null;
  const t = v.trim();
  return t.length ? t : null;
}

function normalizeVisibility(raw: unknown): IdentityVisibilityDto {
  const o =
    raw && typeof raw === 'object' && !Array.isArray(raw)
      ? (raw as Record<string, unknown>)
      : {};
  return {
    legalFullName: asVisibility(o.legalFullName) ?? DEFAULT_IDENTITY_VISIBILITY.legalFullName,
    dateOfBirth: asVisibility(o.dateOfBirth) ?? DEFAULT_IDENTITY_VISIBILITY.dateOfBirth,
    phone: asVisibility(o.phone) ?? DEFAULT_IDENTITY_VISIBILITY.phone,
  };
}

function asVisibility(v: unknown): IdentityVisibilityLevel | null {
  if (typeof v !== 'string') return null;
  return (IDENTITY_VISIBILITY_LEVELS as readonly string[]).includes(v)
    ? (v as IdentityVisibilityLevel)
    : null;
}

function sanitizeVisibilityPartial(
  partial: Partial<IdentityVisibilityDto>,
): Partial<IdentityVisibilityDto> {
  const out: Partial<IdentityVisibilityDto> = {};
  for (const key of ['legalFullName', 'dateOfBirth', 'phone'] as const) {
    if (partial[key] === undefined) continue;
    const level = asVisibility(partial[key]);
    if (!level) {
      throw new BadRequestException(`visibility.${key} 非法`);
    }
    out[key] = level;
  }
  return out;
}

function validatePatch(dto: {
  dateOfBirth?: string | null;
  nationality?: string | null;
  residencyRegion?: string | null;
  visibility?: Partial<IdentityVisibilityDto>;
}): void {
  if (dto.dateOfBirth != null && dto.dateOfBirth !== '') {
    if (!DATE_RE.test(dto.dateOfBirth)) {
      throw new BadRequestException('dateOfBirth 须为 YYYY-MM-DD');
    }
  }
  if (dto.nationality != null && dto.nationality !== '') {
    if (!isKnownNationalityCode(dto.nationality)) {
      throw new BadRequestException(
        'nationality 须为 ISO 3166-1 alpha-2（如 CN），或传选项对象 { "code": "CN" }',
      );
    }
  }
  if (dto.residencyRegion != null && dto.residencyRegion !== '') {
    if (!isKnownResidencyRegionCode(dto.residencyRegion)) {
      throw new BadRequestException(
        'residencyRegion 须为 ISO 3166-2（如 CN-SH）或国家码，或传选项对象 { "code": "CN-SH" }',
      );
    }
  }
  if (dto.visibility) {
    sanitizeVisibilityPartial(dto.visibility);
  }
}

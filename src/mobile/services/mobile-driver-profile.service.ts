import { BadRequestException, Injectable } from '@nestjs/common';
import { UserPreferencesOtherStore, deepMerge } from './user-preferences-other.store';
import {
  CONTINUOUS_DRIVING_ACCEPTANCE_VALUES,
  DEFAULT_DRIVER_PROFILE,
  INTERNATIONAL_PERMIT_STATUS_VALUES,
  MOBILE_DRIVER_PROFILE_PREFERENCES_KEY,
  NIGHT_DRIVING_ACCEPTANCE_VALUES,
  NIGHT_DRIVING_LABELS_ZH,
  STEERING_SIDE_VALUES,
  SURFACE_EXPERIENCE_LABELS_ZH,
  SURFACE_EXPERIENCE_VALUES,
  TRANSLATION_STATUS_VALUES,
  VERIFICATION_STATUS_VALUES,
  normalizeDriverProfilePatch,
  type MobileDriverProfileResponseDto,
  type MobileDriverProfileSummaryDto,
  type PatchMobileDriverProfileDto,
  type QualificationStatusValue,
} from '../dto/mobile-driver-profile.dto';

const DATE_RE = /^\d{4}-\d{2}-\d{2}$/;
const EXPIRING_SOON_DAYS = 60;

@Injectable()
export class MobileDriverProfileService {
  constructor(private readonly store: UserPreferencesOtherStore) {}

  async getProfile(userId: string): Promise<MobileDriverProfileResponseDto> {
    const { value, updatedAt } = await this.store.readKey<Record<string, unknown>>(
      userId,
      MOBILE_DRIVER_PROFILE_PREFERENCES_KEY,
    );
    const merged = deepMerge(
      DEFAULT_DRIVER_PROFILE as unknown as Record<string, unknown>,
      (value && typeof value === 'object' ? value : {}) as Record<string, unknown>,
    ) as unknown as Omit<MobileDriverProfileResponseDto, 'updatedAt'>;

    return {
      ...merged,
      updatedAt: (updatedAt ?? new Date()).toISOString(),
    };
  }

  async patchProfile(
    userId: string,
    raw: PatchMobileDriverProfileDto | Record<string, unknown>,
  ): Promise<MobileDriverProfileResponseDto> {
    const dto = normalizeDriverProfilePatch(raw);
    validatePatch(dto);
    const patch: Record<string, unknown> = {};
    if (dto.qualification) patch.qualification = dto.qualification;
    if (dto.experience) patch.experience = dto.experience;
    if (dto.longTermPrefs) patch.longTermPrefs = dto.longTermPrefs;

    if (Object.keys(patch).length === 0) {
      throw new BadRequestException(
        '请求体为空：请提交 qualification / experience / longTermPrefs 或扁平字段',
      );
    }
    await this.store.mergeKey(userId, MOBILE_DRIVER_PROFILE_PREFERENCES_KEY, patch);
    return this.getProfile(userId);
  }

  async getSummary(userId: string): Promise<MobileDriverProfileSummaryDto> {
    const profile = await this.getProfile(userId);
    return buildSummary(profile);
  }

  /** For Iceland create / enrich projection. */
  async getProfileForProjection(
    userId: string,
  ): Promise<Omit<MobileDriverProfileResponseDto, 'updatedAt'>> {
    const p = await this.getProfile(userId);
    const { updatedAt: _u, ...rest } = p;
    return rest;
  }
}

export function buildSummary(
  profile: Omit<MobileDriverProfileResponseDto, 'updatedAt'> & { updatedAt?: string },
): MobileDriverProfileSummaryDto {
  const { qualification, experience, longTermPrefs } = profile;
  return {
    qualificationStatus: deriveQualificationStatus(qualification),
    licenseExpiresOn: qualification.expiresOn,
    experienceYears: experience.totalYears,
    snowLabel: SURFACE_EXPERIENCE_LABELS_ZH[experience.snow] ?? experience.snow,
    nightDrivingLabel:
      NIGHT_DRIVING_LABELS_ZH[longTermPrefs.nightDrivingAcceptance] ??
      longTermPrefs.nightDrivingAcceptance,
    completionRatio: computeCompletionRatio(profile),
  };
}

export function deriveQualificationStatus(
  q: MobileDriverProfileResponseDto['qualification'],
): QualificationStatusValue {
  if (!q.hasValidLicense || !q.expiresOn) return 'incomplete';
  const expires = Date.parse(`${q.expiresOn}T00:00:00Z`);
  if (Number.isNaN(expires)) return 'incomplete';
  const now = Date.now();
  if (expires < now) return 'expired';
  const soon = now + EXPIRING_SOON_DAYS * 24 * 60 * 60 * 1000;
  if (expires <= soon) return 'expiring_soon';
  if (q.verificationStatus === 'rejected') return 'incomplete';
  return 'valid';
}

function computeCompletionRatio(
  profile: Omit<MobileDriverProfileResponseDto, 'updatedAt'>,
): number {
  const checks = [
    profile.qualification.hasValidLicense,
    Boolean(profile.qualification.issuingCountry),
    (profile.qualification.licenseClasses?.length ?? 0) > 0,
    Boolean(profile.qualification.expiresOn),
    profile.experience.totalYears != null,
    profile.experience.snow !== 'none',
    profile.experience.gravel !== 'none',
    profile.longTermPrefs.comfortableDailyDrivingHours != null,
  ];
  const done = checks.filter(Boolean).length;
  return Math.round((done / checks.length) * 100) / 100;
}

function validatePatch(dto: PatchMobileDriverProfileDto): void {
  const q = dto.qualification;
  if (q) {
    if (q.internationalPermitStatus != null) {
      assertEnum(
        'qualification.internationalPermitStatus',
        q.internationalPermitStatus,
        INTERNATIONAL_PERMIT_STATUS_VALUES,
      );
    }
    if (q.translationStatus != null) {
      assertEnum(
        'qualification.translationStatus',
        q.translationStatus,
        TRANSLATION_STATUS_VALUES,
      );
    }
    if (q.verificationStatus != null) {
      assertEnum(
        'qualification.verificationStatus',
        q.verificationStatus,
        VERIFICATION_STATUS_VALUES,
      );
    }
    if (q.firstIssuedOn != null && q.firstIssuedOn !== '') {
      assertDate('qualification.firstIssuedOn', q.firstIssuedOn);
    }
    if (q.expiresOn != null && q.expiresOn !== '') {
      assertDate('qualification.expiresOn', q.expiresOn);
    }
    if (q.licenseClasses != null && !Array.isArray(q.licenseClasses)) {
      throw new BadRequestException('qualification.licenseClasses 须为数组');
    }
  }

  const e = dto.experience;
  if (e) {
    for (const field of ['snow', 'gravel', 'mountain', 'rv'] as const) {
      if (e[field] != null) {
        assertEnum(`experience.${field}`, e[field]!, SURFACE_EXPERIENCE_VALUES);
      }
    }
    if (e.steeringSideAdaptation != null) {
      assertEnum(
        'experience.steeringSideAdaptation',
        e.steeringSideAdaptation,
        STEERING_SIDE_VALUES,
      );
    }
    if (e.totalYears != null) {
      if (!Number.isFinite(e.totalYears) || e.totalYears < 0 || e.totalYears > 80) {
        throw new BadRequestException('experience.totalYears 非法');
      }
    }
  }

  const p = dto.longTermPrefs;
  if (p) {
    if (p.continuousDrivingAcceptance != null) {
      assertEnum(
        'longTermPrefs.continuousDrivingAcceptance',
        p.continuousDrivingAcceptance,
        CONTINUOUS_DRIVING_ACCEPTANCE_VALUES,
      );
    }
    if (p.nightDrivingAcceptance != null) {
      assertEnum(
        'longTermPrefs.nightDrivingAcceptance',
        p.nightDrivingAcceptance,
        NIGHT_DRIVING_ACCEPTANCE_VALUES,
      );
    }
    if (p.comfortableDailyDrivingHours != null) {
      const n = p.comfortableDailyDrivingHours;
      if (!Number.isFinite(n) || n < 0 || n > 24) {
        throw new BadRequestException('longTermPrefs.comfortableDailyDrivingHours 非法');
      }
    }
  }
}

function assertEnum(field: string, value: string, allowed: readonly string[]): void {
  if (!allowed.includes(value)) {
    throw new BadRequestException(`${field} 非法枚举值`);
  }
}

function assertDate(field: string, value: string): void {
  if (!DATE_RE.test(value)) {
    throw new BadRequestException(`${field} 须为 YYYY-MM-DD`);
  }
}

/** 驾驶员资料 — GET/PATCH /api/mobile/users/me/driver-profile */

export const INTERNATIONAL_PERMIT_STATUS_VALUES = [
  'ready',
  'pending',
  'not_applicable',
] as const;
export type InternationalPermitStatus = (typeof INTERNATIONAL_PERMIT_STATUS_VALUES)[number];

export const TRANSLATION_STATUS_VALUES = ['ready', 'pending', 'not_applicable'] as const;
export type TranslationStatus = (typeof TRANSLATION_STATUS_VALUES)[number];

export const VERIFICATION_STATUS_VALUES = [
  'unverified',
  'pending',
  'verified',
  'rejected',
] as const;
export type VerificationStatus = (typeof VERIFICATION_STATUS_VALUES)[number];

export const SURFACE_EXPERIENCE_VALUES = [
  'none',
  'limited',
  'average',
  'familiar',
  'extensive',
] as const;
export type SurfaceExperienceValue = (typeof SURFACE_EXPERIENCE_VALUES)[number];

export const STEERING_SIDE_VALUES = ['left_ok', 'right_ok', 'both', 'unknown'] as const;
export type SteeringSideValue = (typeof STEERING_SIDE_VALUES)[number];

export const CONTINUOUS_DRIVING_ACCEPTANCE_VALUES = ['low', 'moderate', 'high'] as const;
export type ContinuousDrivingAcceptanceValue =
  (typeof CONTINUOUS_DRIVING_ACCEPTANCE_VALUES)[number];

export const NIGHT_DRIVING_ACCEPTANCE_VALUES = ['ok', 'limited', 'avoid'] as const;
export type NightDrivingAcceptanceValue = (typeof NIGHT_DRIVING_ACCEPTANCE_VALUES)[number];

export const QUALIFICATION_STATUS_VALUES = [
  'incomplete',
  'valid',
  'expiring_soon',
  'expired',
] as const;
export type QualificationStatusValue = (typeof QUALIFICATION_STATUS_VALUES)[number];

export const MOBILE_DRIVER_PROFILE_PREFERENCES_KEY = 'driverProfile';

export interface DriverQualificationDto {
  hasValidLicense: boolean;
  issuingCountry: string | null;
  licenseClasses: string[];
  firstIssuedOn: string | null;
  expiresOn: string | null;
  internationalPermitStatus: InternationalPermitStatus;
  translationStatus: TranslationStatus;
  verificationStatus: VerificationStatus;
}

export interface DriverExperienceDto {
  totalYears: number | null;
  snow: SurfaceExperienceValue;
  gravel: SurfaceExperienceValue;
  mountain: SurfaceExperienceValue;
  rv: SurfaceExperienceValue;
  steeringSideAdaptation: SteeringSideValue;
}

export interface DriverLongTermPrefsDto {
  comfortableDailyDrivingHours: number | null;
  continuousDrivingAcceptance: ContinuousDrivingAcceptanceValue;
  nightDrivingAcceptance: NightDrivingAcceptanceValue;
  willingAsMainDriver: boolean;
  willingAsReliefDriver: boolean;
}

export interface MobileDriverProfileResponseDto {
  qualification: DriverQualificationDto;
  experience: DriverExperienceDto;
  longTermPrefs: DriverLongTermPrefsDto;
  updatedAt: string;
}

export interface PatchMobileDriverProfileDto {
  qualification?: Partial<DriverQualificationDto>;
  experience?: Partial<DriverExperienceDto>;
  longTermPrefs?: Partial<DriverLongTermPrefsDto>;
  /** Flat / legacy aliases accepted on write (normalized server-side). */
  hasValidLicense?: boolean;
  issuingCountry?: string | null;
  licenseClasses?: string[];
  firstIssuedOn?: string | null;
  expiresOn?: string | null;
  internationalPermitStatus?: InternationalPermitStatus | string;
  translationStatus?: TranslationStatus | string;
  verificationStatus?: VerificationStatus | string;
  totalYears?: number | null;
  snow?: SurfaceExperienceValue | string;
  gravel?: SurfaceExperienceValue | string;
  mountain?: SurfaceExperienceValue | string;
  rv?: SurfaceExperienceValue | string;
  snowExperience?: SurfaceExperienceValue | string;
  gravelExperience?: SurfaceExperienceValue | string;
  steeringSideAdaptation?: SteeringSideValue | string;
  comfortableDailyDrivingHours?: number | null;
  continuousDrivingAcceptance?: ContinuousDrivingAcceptanceValue | string;
  nightDrivingAcceptance?: NightDrivingAcceptanceValue | string;
  nightAcceptance?: NightDrivingAcceptanceValue | string;
  willingAsMainDriver?: boolean;
  willingAsReliefDriver?: boolean;
}

/**
 * Accept nested spec shape or flat form fields; map trip-style night enums.
 */
export function normalizeDriverProfilePatch(
  raw: PatchMobileDriverProfileDto | Record<string, unknown> | null | undefined,
): PatchMobileDriverProfileDto {
  const body = (raw && typeof raw === 'object' ? raw : {}) as Record<string, unknown>;
  const qualification: Record<string, unknown> = {
    ...asObject(body.qualification),
  };
  const experience: Record<string, unknown> = {
    ...asObject(body.experience),
  };
  const longTermPrefs: Record<string, unknown> = {
    ...asObject(body.longTermPrefs),
  };

  lift(qualification, body, [
    'hasValidLicense',
    'issuingCountry',
    'licenseClasses',
    'firstIssuedOn',
    'expiresOn',
    'internationalPermitStatus',
    'translationStatus',
    'verificationStatus',
  ]);
  lift(experience, body, [
    'totalYears',
    'snow',
    'gravel',
    'mountain',
    'rv',
    'steeringSideAdaptation',
  ]);
  if (body.snowExperience !== undefined && experience.snow === undefined) {
    experience.snow = body.snowExperience;
  }
  if (body.gravelExperience !== undefined && experience.gravel === undefined) {
    experience.gravel = body.gravelExperience;
  }
  lift(longTermPrefs, body, [
    'comfortableDailyDrivingHours',
    'continuousDrivingAcceptance',
    'nightDrivingAcceptance',
    'willingAsMainDriver',
    'willingAsReliefDriver',
  ]);
  if (
    body.nightAcceptance !== undefined &&
    longTermPrefs.nightDrivingAcceptance === undefined
  ) {
    longTermPrefs.nightDrivingAcceptance = body.nightAcceptance;
  }

  if (typeof longTermPrefs.nightDrivingAcceptance === 'string') {
    longTermPrefs.nightDrivingAcceptance = mapNightAcceptance(
      longTermPrefs.nightDrivingAcceptance,
    );
  }

  const out: PatchMobileDriverProfileDto = {};
  if (Object.keys(qualification).length) out.qualification = qualification as never;
  if (Object.keys(experience).length) out.experience = experience as never;
  if (Object.keys(longTermPrefs).length) out.longTermPrefs = longTermPrefs as never;
  return out;
}

function asObject(v: unknown): Record<string, unknown> {
  return v && typeof v === 'object' && !Array.isArray(v)
    ? { ...(v as Record<string, unknown>) }
    : {};
}

function lift(
  target: Record<string, unknown>,
  source: Record<string, unknown>,
  keys: string[],
): void {
  for (const k of keys) {
    if (source[k] !== undefined && target[k] === undefined) {
      target[k] = source[k];
    }
  }
}

/** Map trip driving-settings night enums onto user-level values. */
function mapNightAcceptance(v: string): string {
  if (v === 'accept' || v === 'ok') return 'ok';
  if (v === 'conditional' || v === 'limited') return 'limited';
  if (v === 'reject' || v === 'avoid') return 'avoid';
  return v;
}

export interface MobileDriverProfileSummaryDto {
  qualificationStatus: QualificationStatusValue;
  licenseExpiresOn: string | null;
  experienceYears: number | null;
  snowLabel: string;
  nightDrivingLabel: string;
  completionRatio: number;
}

export const DEFAULT_DRIVER_PROFILE: Omit<MobileDriverProfileResponseDto, 'updatedAt'> = {
  qualification: {
    hasValidLicense: false,
    issuingCountry: null,
    licenseClasses: [],
    firstIssuedOn: null,
    expiresOn: null,
    internationalPermitStatus: 'not_applicable',
    translationStatus: 'not_applicable',
    verificationStatus: 'unverified',
  },
  experience: {
    totalYears: null,
    snow: 'none',
    gravel: 'none',
    mountain: 'none',
    rv: 'none',
    steeringSideAdaptation: 'unknown',
  },
  longTermPrefs: {
    comfortableDailyDrivingHours: null,
    continuousDrivingAcceptance: 'moderate',
    nightDrivingAcceptance: 'avoid',
    willingAsMainDriver: true,
    willingAsReliefDriver: true,
  },
};

export const SURFACE_EXPERIENCE_LABELS_ZH: Record<SurfaceExperienceValue, string> = {
  none: '无',
  limited: '有限',
  average: '一般',
  familiar: '熟悉',
  extensive: '丰富',
};

export const NIGHT_DRIVING_LABELS_ZH: Record<NightDrivingAcceptanceValue, string> = {
  ok: '可以接受',
  limited: '有限接受',
  avoid: '尽量避免',
};

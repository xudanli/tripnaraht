/**
 * Project iOS personal-center fields (UserProfile.preferences.other) for Admin.
 * Source of truth for shapes: src/mobile/PERSONAL_CENTER_IOS_API.md
 */
import { EMERGENCY_CONTACTS_PREFERENCES_KEY } from '../../mobile/dto/emergency-contacts.dto';
import { MOBILE_IDENTITY_PREFERENCES_KEY } from '../../mobile/dto/mobile-identity.dto';
import {
  DEFAULT_TRAVEL_PORTRAIT,
  MOBILE_TRAVEL_PORTRAIT_PREFERENCES_KEY,
} from '../../mobile/dto/mobile-travel-portrait.dto';
import {
  DEFAULT_DRIVER_PROFILE,
  MOBILE_DRIVER_PROFILE_PREFERENCES_KEY,
  type MobileDriverProfileResponseDto,
  type MobileDriverProfileSummaryDto,
} from '../../mobile/dto/mobile-driver-profile.dto';
import { buildSummary } from '../../mobile/services/mobile-driver-profile.service';
import { deepMerge } from '../../mobile/services/user-preferences-other.store';

export interface AdminUserIdentitySummary {
  phone: string | null;
  legalFullName: string | null;
  dateOfBirth: string | null;
  nationality: string | null;
  residencyRegion: string | null;
  preferredLanguage: string | null;
}

export interface AdminUserTravelPortraitSummary {
  travelPace: string | null;
  restFrequency: string | null;
  mobilityLimitation: string | null;
  nightDrivingAcceptance: string | null;
  gravelAcceptance: string | null;
  hasChildrenNeeds: boolean;
  hasElderlyNeeds: boolean;
  motionSickness: boolean;
}

export type AdminUserDriverSummary = MobileDriverProfileSummaryDto;

export interface AdminUserMobileExtras {
  identity: AdminUserIdentitySummary | null;
  travelPortrait: AdminUserTravelPortraitSummary | null;
  driverSummary: AdminUserDriverSummary | null;
  emergencyContactCount: number;
  hasIdentity: boolean;
  hasTravelPortrait: boolean;
  hasDriverProfile: boolean;
}

function asObj(v: unknown): Record<string, unknown> | null {
  return v && typeof v === 'object' && !Array.isArray(v)
    ? (v as Record<string, unknown>)
    : null;
}

function asStr(v: unknown): string | null {
  return typeof v === 'string' && v.trim() ? v : null;
}

function asBool(v: unknown, fallback = false): boolean {
  return typeof v === 'boolean' ? v : fallback;
}

export function extractPreferencesOther(
  preferences: unknown,
): Record<string, unknown> {
  const prefs = asObj(preferences) ?? {};
  return asObj(prefs.other) ?? {};
}

export function projectIdentitySummary(
  other: Record<string, unknown>,
  preferences?: Record<string, unknown> | null,
): AdminUserIdentitySummary | null {
  const stored = asObj(other[MOBILE_IDENTITY_PREFERENCES_KEY]);
  const nationality =
    asStr(stored?.nationality) ??
    asStr(preferences?.nationality) ??
    null;
  const residencyRegion =
    asStr(stored?.residencyRegion) ??
    asStr(preferences?.residencyCountry) ??
    null;

  const identity: AdminUserIdentitySummary = {
    phone: asStr(stored?.phone),
    legalFullName: asStr(stored?.legalFullName),
    dateOfBirth: asStr(stored?.dateOfBirth),
    nationality,
    residencyRegion,
    preferredLanguage: asStr(stored?.preferredLanguage),
  };

  const hasAny = Object.values(identity).some((v) => v != null);
  return hasAny ? identity : null;
}

export function projectTravelPortraitSummary(
  other: Record<string, unknown>,
): AdminUserTravelPortraitSummary | null {
  const raw = asObj(other[MOBILE_TRAVEL_PORTRAIT_PREFERENCES_KEY]);
  if (!raw) return null;

  const merged = deepMerge(
    DEFAULT_TRAVEL_PORTRAIT as unknown as Record<string, unknown>,
    raw,
  );
  const pace = asObj(merged.pace) ?? {};
  const accessibility = asObj(merged.accessibility) ?? {};
  const driving = asObj(merged.drivingDefaults) ?? {};

  return {
    travelPace: asStr(pace.travelPace),
    restFrequency: asStr(pace.restFrequency),
    mobilityLimitation: asStr(accessibility.mobilityLimitation),
    nightDrivingAcceptance: asStr(driving.nightDrivingAcceptance),
    gravelAcceptance: asStr(driving.gravelAcceptance),
    hasChildrenNeeds: asBool(accessibility.hasChildrenNeeds),
    hasElderlyNeeds: asBool(accessibility.hasElderlyNeeds),
    motionSickness: asBool(accessibility.motionSickness),
  };
}

export function projectDriverSummary(
  other: Record<string, unknown>,
): AdminUserDriverSummary | null {
  const raw = asObj(other[MOBILE_DRIVER_PROFILE_PREFERENCES_KEY]);
  if (!raw) return null;

  const merged = deepMerge(
    DEFAULT_DRIVER_PROFILE as unknown as Record<string, unknown>,
    raw,
  ) as unknown as Omit<MobileDriverProfileResponseDto, 'updatedAt'>;

  return buildSummary(merged);
}

export function countEmergencyContacts(other: Record<string, unknown>): number {
  const raw = other[EMERGENCY_CONTACTS_PREFERENCES_KEY];
  return Array.isArray(raw) ? raw.length : 0;
}

export function projectMobileExtras(
  preferences: unknown,
): AdminUserMobileExtras {
  const prefs = asObj(preferences);
  const other = extractPreferencesOther(preferences);
  const identity = projectIdentitySummary(other, prefs);
  const travelPortrait = projectTravelPortraitSummary(other);
  const driverSummary = projectDriverSummary(other);

  return {
    identity,
    travelPortrait,
    driverSummary,
    emergencyContactCount: countEmergencyContacts(other),
    hasIdentity: identity != null,
    hasTravelPortrait: travelPortrait != null,
    hasDriverProfile: driverSummary != null,
  };
}

/** Full blobs for admin detail (aligned with iOS GET responses, minus label resolution). */
export function projectMobileDetail(preferences: unknown): {
  identity: Record<string, unknown> | null;
  travelPortrait: Record<string, unknown> | null;
  driverProfile: Record<string, unknown> | null;
  emergencyContacts: unknown[];
} {
  const other = extractPreferencesOther(preferences);
  const identityRaw = asObj(other[MOBILE_IDENTITY_PREFERENCES_KEY]);
  const portraitRaw = asObj(other[MOBILE_TRAVEL_PORTRAIT_PREFERENCES_KEY]);
  const driverRaw = asObj(other[MOBILE_DRIVER_PROFILE_PREFERENCES_KEY]);
  const emergencyRaw = other[EMERGENCY_CONTACTS_PREFERENCES_KEY];

  return {
    identity: identityRaw
      ? {
          phone: asStr(identityRaw.phone),
          legalFullName: asStr(identityRaw.legalFullName),
          dateOfBirth: asStr(identityRaw.dateOfBirth),
          nationality: asStr(identityRaw.nationality),
          residencyRegion: asStr(identityRaw.residencyRegion),
          preferredLanguage: asStr(identityRaw.preferredLanguage),
          visibility: asObj(identityRaw.visibility),
        }
      : null,
    travelPortrait: portraitRaw
      ? deepMerge(
          DEFAULT_TRAVEL_PORTRAIT as unknown as Record<string, unknown>,
          portraitRaw,
        )
      : null,
    driverProfile: driverRaw
      ? deepMerge(
          DEFAULT_DRIVER_PROFILE as unknown as Record<string, unknown>,
          driverRaw,
        )
      : null,
    emergencyContacts: Array.isArray(emergencyRaw) ? emergencyRaw : [],
  };
}

import type { PrismaService } from '../../../prisma/prisma.service';
import type {
  IcelandSelfDriveGravelTolerance,
  IcelandSelfDriveNightAcceptance,
  IcelandSelfDriveNightDrivingPreference,
  IcelandSelfDrivePacePreference,
  IcelandSelfDriveRestFrequency,
  IcelandSelfDriveRoadHazardPreference,
  IcelandSelfDriveSurfaceExperience,
} from '../dto/iceland-self-drive-enums';
import type { IcelandSelfDriveDrivingSettingsState } from '../types/iceland-self-drive.types';

const TRAVEL_PORTRAIT_KEY = 'travelPortrait';
const DRIVER_PROFILE_KEY = 'driverProfile';

export interface UserDrivingDefaultsProjection {
  members: {
    hasChildren: boolean;
    hasElderly: boolean;
    motionSickness: boolean;
  };
  routePreference: {
    pacePreference: IcelandSelfDrivePacePreference;
    restFrequency: IcelandSelfDriveRestFrequency;
    gravelTolerance: IcelandSelfDriveGravelTolerance;
    allowNightDriving: boolean;
    nightDrivingPreference: IcelandSelfDriveNightDrivingPreference;
    fRoadPreference: IcelandSelfDriveRoadHazardPreference;
    dailyDrivingLimitHours: number | null;
  };
  drivers: {
    dailyDrivingLimitHours: number | null;
    snowExperience: IcelandSelfDriveSurfaceExperience | null;
    gravelExperience: IcelandSelfDriveSurfaceExperience | null;
    nightAcceptance: IcelandSelfDriveNightAcceptance | null;
  };
}

export async function loadUserDrivingDefaultsProjection(
  prisma: PrismaService,
  userId: string,
): Promise<UserDrivingDefaultsProjection | null> {
  const profile = await prisma.userProfile.findUnique({ where: { userId } });
  if (!profile?.preferences) return null;

  const preferences = profile.preferences as any;
  const other = preferences.other ?? {};
  const portrait =
    other[TRAVEL_PORTRAIT_KEY] && typeof other[TRAVEL_PORTRAIT_KEY] === 'object'
      ? other[TRAVEL_PORTRAIT_KEY]
      : {};
  const driver =
    other[DRIVER_PROFILE_KEY] && typeof other[DRIVER_PROFILE_KEY] === 'object'
      ? other[DRIVER_PROFILE_KEY]
      : {};

  if (Object.keys(portrait).length === 0 && Object.keys(driver).length === 0) {
    return null;
  }

  const pace = portrait.pace ?? {};
  const accessibility = portrait.accessibility ?? {};
  const drivingDefaults = portrait.drivingDefaults ?? {};
  const experience = driver.experience ?? {};
  const longTermPrefs = driver.longTermPrefs ?? {};

  const nightFromPortrait = mapNightDrivingAcceptance(
    asString(drivingDefaults.nightDrivingAcceptance) ??
      asString(longTermPrefs.nightDrivingAcceptance),
  );
  const hours =
    asNumber(drivingDefaults.comfortableDailyDrivingHours) ??
    asNumber(longTermPrefs.comfortableDailyDrivingHours);

  return {
    members: {
      hasChildren: accessibility.hasChildrenNeeds === true,
      hasElderly: accessibility.hasElderlyNeeds === true,
      motionSickness: accessibility.motionSickness === true,
    },
    routePreference: {
      pacePreference: mapTravelPace(asString(pace.travelPace)),
      restFrequency: mapRestFrequency(asString(pace.restFrequency)),
      gravelTolerance: mapGravelAcceptance(
        asString(drivingDefaults.gravelAcceptance),
      ),
      allowNightDriving: nightFromPortrait.allowNightDriving,
      nightDrivingPreference: nightFromPortrait.preference,
      fRoadPreference:
        drivingDefaults.preferAvoidFRoad === false ? 'conditional' : 'avoid',
      dailyDrivingLimitHours: hours,
    },
    drivers: {
      dailyDrivingLimitHours: hours,
      snowExperience: mapSurfaceExperience(asString(experience.snow)),
      gravelExperience: mapSurfaceExperience(asString(experience.gravel)),
      nightAcceptance: nightFromPortrait.candidateAcceptance,
    },
  };
}

export function applyUserDrivingDefaults(
  settings: IcelandSelfDriveDrivingSettingsState,
  projection: UserDrivingDefaultsProjection | null | undefined,
): IcelandSelfDriveDrivingSettingsState {
  if (!projection) return settings;
  return {
    ...settings,
    members: {
      hasChildren: projection.members.hasChildren,
      hasElderly: projection.members.hasElderly,
      motionSickness: projection.members.motionSickness,
    },
    routePreference: {
      ...settings.routePreference,
      pacePreference: projection.routePreference.pacePreference,
      restFrequency: projection.routePreference.restFrequency,
      gravelTolerance: projection.routePreference.gravelTolerance,
      allowNightDriving: projection.routePreference.allowNightDriving,
      nightDrivingPreference: projection.routePreference.nightDrivingPreference,
      fRoadPreference: projection.routePreference.fRoadPreference,
      dailyDrivingLimitHours:
        projection.routePreference.dailyDrivingLimitHours ??
        settings.routePreference.dailyDrivingLimitHours,
    },
    drivers: {
      ...settings.drivers,
      dailyDrivingLimitHours:
        projection.drivers.dailyDrivingLimitHours ??
        settings.drivers.dailyDrivingLimitHours,
    },
  };
}

export function enrichCandidatesFromProjections(
  candidates: IcelandSelfDriveDrivingSettingsState['drivers']['candidates'],
  byMemberId: Map<string, UserDrivingDefaultsProjection>,
): IcelandSelfDriveDrivingSettingsState['drivers']['candidates'] {
  return candidates.map((c) => {
    const p = byMemberId.get(c.memberId);
    if (!p) return c;
    return {
      ...c,
      snowExperience: c.snowExperience ?? p.drivers.snowExperience,
      gravelExperience: c.gravelExperience ?? p.drivers.gravelExperience,
      nightAcceptance: c.nightAcceptance ?? p.drivers.nightAcceptance,
    };
  });
}

function mapTravelPace(v: string | null): IcelandSelfDrivePacePreference {
  if (v === 'relaxed') return 'safe';
  if (v === 'packed') return 'experience';
  return 'balanced';
}

function mapRestFrequency(v: string | null): IcelandSelfDriveRestFrequency {
  if (v === 'low') return 'minimal';
  if (v === 'high') return 'frequent';
  return 'normal';
}

function mapGravelAcceptance(
  v: string | null,
): IcelandSelfDriveGravelTolerance {
  if (v === 'low' || v === 'high' || v === 'moderate') return v;
  return 'moderate';
}

function mapNightDrivingAcceptance(v: string | null): {
  preference: IcelandSelfDriveNightDrivingPreference;
  allowNightDriving: boolean;
  candidateAcceptance: IcelandSelfDriveNightAcceptance;
} {
  if (v === 'ok') {
    return {
      preference: 'accept',
      allowNightDriving: true,
      candidateAcceptance: 'accept',
    };
  }
  if (v === 'limited') {
    return {
      preference: 'conditional',
      allowNightDriving: true,
      candidateAcceptance: 'avoid',
    };
  }
  return {
    preference: 'avoid',
    allowNightDriving: false,
    candidateAcceptance: 'avoid',
  };
}

function mapSurfaceExperience(
  v: string | null,
): IcelandSelfDriveSurfaceExperience | null {
  if (!v || v === 'none') return null;
  if (v === 'extensive' || v === 'familiar') return 'familiar';
  if (v === 'average') return 'average';
  if (v === 'limited') return 'limited';
  return null;
}

function asString(v: unknown): string | null {
  return typeof v === 'string' && v.trim() ? v.trim() : null;
}

function asNumber(v: unknown): number | null {
  return typeof v === 'number' && Number.isFinite(v) ? v : null;
}

/**
 * Resolve Iceland self-drive assessment inputs from structured signals only.
 * No JSON.stringify / free-text keyword heuristics.
 */

import {
  extractWindMpsFromState,
  isIcelandDestination,
} from '../../../../trips/causal-runtime/domains/trip-world-state-iceland-causal.util';
import type { VehicleClass } from '../../../../trips/decision/hazard/travel-hazard.types';
import type { TripPlan } from '../../../../trips/decision/plan-model';
import type { TripWorldState } from '../../../../trips/decision/world-model';
import {
  loadRoadSegmentProfilesForCountry,
  resolveRoadSegmentProfile,
} from '../../road/road-segment-profile.loader';
import type { RoadSegmentProfile } from '../../road/road-segment-profile.types';
import { loadIcelandWeatherDrivingPolicy } from '../road-weather/iceland-road-weather.loader';
import type {
  DrivingWeatherImpactInput,
  DaylightDrivingLoadInput,
  IcelandRoadBaseType,
  IcelandRoadLiveStatus,
  IcelandVehicleRoadClass,
  VehicleRoadFitInput,
} from '../road-weather/iceland-road-weather.types';
import type { IcelandWinterKnowledgeInput } from '../winter/iceland-winter-knowledge.types';
import type { IcelandSelfDriveRouteFacts } from './iceland-self-drive-route-facts.types';

const DEFAULT_PAVED_ROAD_ID = 'RING_ROAD';

export interface ResolvedIcelandSelfDriveFacts {
  vehicleRoadFit: VehicleRoadFitInput;
  weather?: DrivingWeatherImpactInput;
  daylight?: DaylightDrivingLoadInput;
  winter?: IcelandWinterKnowledgeInput;
  /** True when destination is Iceland (country / destination structured check). */
  isIceland: boolean;
}

const VEHICLE_CLASS_EXACT: ReadonlySet<string> = new Set([
  'SEDAN',
  'SUV_2WD',
  'SUV_4WD',
  'CAMPERVAN',
  'EV_CAMPERVAN',
  'HIGH_PROFILE',
]);

export function mapVehicleClassExact(
  raw?: string | VehicleClass | IcelandVehicleRoadClass,
): IcelandVehicleRoadClass {
  if (!raw) return 'SEDAN';
  const u = String(raw).trim().toUpperCase();
  if (VEHICLE_CLASS_EXACT.has(u)) return u as IcelandVehicleRoadClass;
  // Product aliases (iceland-self-drive driving-settings + legacy)
  if (u === '2WD' || u === 'SUV' || u === 'SEDAN_2WD' || u === 'CROSSOVER') {
    return 'SEDAN';
  }
  if (
    u === '4WD' ||
    u === '4X4' ||
    u === 'LARGE_4X4' ||
    u === 'SUV_4WD'
  ) {
    return 'SUV_4WD';
  }
  if (u === 'CAMPER' || u === 'CAMPERVAN') return 'CAMPERVAN';
  if (u === 'UNKNOWN') return 'SEDAN';
  return 'SEDAN';
}

export function mapProfileToRoadBaseType(
  profile: RoadSegmentProfile,
): IcelandRoadBaseType {
  if (profile.roadClass === 'HIGHLAND_F_ROAD' || profile.roadClass === 'TRACK') {
    return 'F_ROAD';
  }
  if (profile.hasUnbridgedRiver) return 'FORD';
  if (
    profile.surfaceType === 'GRAVEL' ||
    profile.surfaceType === 'UNPAVED' ||
    profile.surfaceType === 'MIXED'
  ) {
    return 'GRAVEL';
  }
  if (profile.terrainType === 'MOUNTAIN' || profile.terrainType === 'COASTAL') {
    // Pack profiles do not carry a WIND_EXPOSED class; coastal/mountain ⇒ exposure later
    return 'PAVED';
  }
  return 'PAVED';
}

export function windExposureFromProfile(
  profile: RoadSegmentProfile,
  roadBaseType: IcelandRoadBaseType,
): 'LOW' | 'MEDIUM' | 'HIGH' {
  if (roadBaseType === 'F_ROAD' || roadBaseType === 'FORD') return 'HIGH';
  if (
    profile.terrainType === 'HIGHLAND' ||
    profile.terrainType === 'MOUNTAIN' ||
    profile.terrainType === 'COASTAL'
  ) {
    return 'HIGH';
  }
  if (roadBaseType === 'GRAVEL') return 'MEDIUM';
  return 'LOW';
}

function readExplicitRouteFacts(
  state: TripWorldState,
): IcelandSelfDriveRouteFacts | undefined {
  return state.signals.icelandSelfDriveRouteFacts;
}

function collectRoadIdsFromOverlay(state: TripWorldState): {
  hasFRoad: boolean;
  blocked: boolean;
} {
  const frames = state.signals.executionOverlayFrames ?? [];
  let hasFRoad = false;
  let blocked = false;
  for (const frame of frames) {
    if (frame.road?.fRoadConstraint) hasFRoad = true;
    if (frame.road?.blocked) blocked = true;
    if (frame.route?.roadAccessibility?.fRoad) hasFRoad = true;
  }
  return { hasFRoad, blocked };
}

function pickProfileForFlags(
  bundle: NonNullable<ReturnType<typeof loadRoadSegmentProfilesForCountry>>,
  flags: { hasFRoad?: boolean; hasGravel?: boolean },
  preferredIds: string[],
): RoadSegmentProfile {
  for (const id of preferredIds) {
    const hit = resolveRoadSegmentProfile(id, bundle);
    if (hit) return hit;
  }
  if (flags.hasFRoad) {
    const f = bundle.profiles.find((p) => p.roadClass === 'HIGHLAND_F_ROAD');
    if (f) return f;
  }
  if (flags.hasGravel) {
    const g = bundle.profiles.find(
      (p) =>
        p.surfaceType === 'GRAVEL' ||
        p.surfaceType === 'UNPAVED' ||
        p.surfaceType === 'MIXED',
    );
    if (g) return g;
  }
  return (
    resolveRoadSegmentProfile(DEFAULT_PAVED_ROAD_ID, bundle) ??
    bundle.profiles[0]
  );
}

function mapLiveStatus(
  raw: string | undefined,
  overlayBlocked: boolean,
): IcelandRoadLiveStatus {
  if (overlayBlocked) return 'CLOSED';
  if (!raw) return 'OPEN';
  const u = raw.toUpperCase();
  if (u === 'CLOSED') return 'CLOSED';
  if (u === 'LIMITED' || u === 'RESTRICTED') return 'LIMITED';
  if (u === 'UNKNOWN') return 'UNKNOWN';
  if (u === 'OPEN') return 'OPEN';
  return 'UNKNOWN';
}

function resolveWeatherPhenomenon(
  windMps: number,
): DrivingWeatherImpactInput['phenomenon'] | undefined {
  const policy = loadIcelandWeatherDrivingPolicy();
  const gust = policy.phenomena.GUST?.gustThresholdMs;
  const strong = policy.phenomena.STRONG_WIND?.gustThresholdMs;
  if (typeof gust === 'number' && windMps >= gust) return 'GUST';
  if (typeof strong === 'number' && windMps >= strong) return 'STRONG_WIND';
  return undefined;
}

function readDayWeatherSignal(state: TripWorldState): {
  windMps?: number;
  visibilityM?: number;
  precipitationMm?: number;
  hazardKinds: string[];
} {
  const targetDate = state.context.startDate;
  const wx = targetDate
    ? state.signals.weatherByDate?.[targetDate]
    : undefined;
  const windMps = extractWindMpsFromState(state);
  const visibilityKm =
    typeof wx?.visibilityKm === 'number' && Number.isFinite(wx.visibilityKm)
      ? wx.visibilityKm
      : undefined;
  const precipitationMm =
    typeof wx?.precipitationMm === 'number' && Number.isFinite(wx.precipitationMm)
      ? wx.precipitationMm
      : undefined;
  const hazardKinds = [
    ...(wx?.hazardKinds ?? []),
    ...(wx?.hazards?.map((h) => h.kind) ?? []),
  ];
  return {
    windMps,
    visibilityM:
      typeof visibilityKm === 'number' ? Math.round(visibilityKm * 1000) : undefined,
    precipitationMm,
    hazardKinds,
  };
}

/**
 * Map structured hazard / observation fields → phenomena. No free-text scrape.
 */
function collectPhenomenaFromSignal(signal: {
  windMps?: number;
  visibilityM?: number;
  precipitationMm?: number;
  hazardKinds: string[];
  highWindFlag: boolean;
}): {
  primary?: DrivingWeatherImpactInput['phenomenon'];
  additional: DrivingWeatherImpactInput['phenomenon'][];
  windGustMs?: number;
  visibilityM?: number;
} {
  const found = new Set<DrivingWeatherImpactInput['phenomenon']>();
  let windGustMs: number | undefined;
  let visibilityM = signal.visibilityM;

  if (typeof signal.windMps === 'number') {
    windGustMs = signal.windMps;
    const windPhen = resolveWeatherPhenomenon(signal.windMps);
    if (windPhen) found.add(windPhen);
  } else if (signal.highWindFlag) {
    found.add('STRONG_WIND');
  }

  for (const kind of signal.hazardKinds) {
    if (kind === 'GUST_EXTREME') found.add('GUST');
    else if (kind === 'CROSSWIND' || kind === 'WIND_SPEED') found.add('STRONG_WIND');
    else if (kind === 'LOW_VISIBILITY' || kind === 'WHITEOUT_EMERGENCE') {
      found.add('LOW_VISIBILITY');
    } else if (kind === 'HEAVY_PRECIP') {
      found.add('HEAVY_RAIN');
    }
  }

  const policy = loadIcelandWeatherDrivingPolicy();
  const visThreshold =
    policy.phenomena.LOW_VISIBILITY?.visibilityThresholdM ?? 500;
  if (
    typeof visibilityM === 'number' &&
    visibilityM <= visThreshold
  ) {
    found.add('LOW_VISIBILITY');
  }

  // Heavy precip observation without inventing snow/ice (needs temp signal)
  if (
    typeof signal.precipitationMm === 'number' &&
    signal.precipitationMm >= 10
  ) {
    found.add('HEAVY_RAIN');
  }

  const ordered = [...found];
  // Prefer wind / multi-critical as primary when present
  const priority: DrivingWeatherImpactInput['phenomenon'][] = [
    'GUST',
    'STRONG_WIND',
    'FREEZING_RAIN',
    'SNOW',
    'ICE',
    'LOW_VISIBILITY',
    'HEAVY_RAIN',
    'DUST_ASH',
    'EXTREME_COLD',
  ];
  let primary: DrivingWeatherImpactInput['phenomenon'] | undefined;
  for (const p of priority) {
    if (found.has(p)) {
      primary = p;
      break;
    }
  }
  if (!primary && ordered.length > 0) primary = ordered[0];
  const additional = ordered.filter((p) => p !== primary);
  return { primary, additional, windGustMs, visibilityM };
}

function extractSegmentLengthKm(
  state: TripWorldState,
  plan: TripPlan | undefined,
  explicitKm?: number,
): number | undefined {
  if (typeof explicitKm === 'number' && Number.isFinite(explicitKm) && explicitKm > 0) {
    return explicitKm;
  }
  const legs = Object.values(state.signals.fuelReachabilityByLegId ?? {});
  for (const leg of legs) {
    const km = (leg as { plannedSegmentKm?: number; distanceKm?: number } | undefined)
      ?.plannedSegmentKm ??
      (leg as { distanceKm?: number } | undefined)?.distanceKm;
    if (typeof km === 'number' && Number.isFinite(km) && km > 0) return km;
  }
  if (!plan?.days?.length) return undefined;
  for (const day of plan.days) {
    for (const slot of day.timeSlots ?? []) {
      const leg = (
        slot as { travelLeg?: { distanceKm?: number; durationMin?: number } }
      ).travelLeg;
      if (
        typeof leg?.distanceKm === 'number' &&
        Number.isFinite(leg.distanceKm) &&
        leg.distanceKm > 0
      ) {
        return leg.distanceKm;
      }
    }
  }
  return undefined;
}

/**
 * Build vehicle×road + weather inputs from TripWorldState structured fields.
 */
export function resolveIcelandSelfDriveFacts(opts: {
  state: TripWorldState;
  /** Used only for structured travelLeg.distanceKm — never free-text scrape */
  plan?: TripPlan;
}): ResolvedIcelandSelfDriveFacts | undefined {
  const { state, plan } = opts;
  if (!isIcelandDestination(state.context.destination)) {
    return undefined;
  }

  const explicit = readExplicitRouteFacts(state);
  const overlay = collectRoadIdsFromOverlay(state);

  const vehicleClass =
    explicit?.vehicleClass ??
    mapVehicleClassExact(
      state.policies?.vehicleClass ?? state.policies?.vehicleProfile?.vehicleClass,
    );

  const preferredIds = [
    ...(explicit?.roadSegmentIds ?? []),
  ].filter(Boolean);

  const routeFlags = {
    hasFRoad:
      explicit?.routeFlags?.hasFRoad === true || overlay.hasFRoad,
    hasGravel: explicit?.routeFlags?.hasGravel === true,
    highWindExposure: explicit?.routeFlags?.highWindExposure === true,
  };

  const segmentLengthKm = extractSegmentLengthKm(
    state,
    plan,
    explicit?.segmentLengthKm,
  );

  const bundle = loadRoadSegmentProfilesForCountry('IS');
  if (!bundle || bundle.profiles.length === 0) {
    // Pack missing — still evaluate with minimal paved defaults (no text scrape)
    const vehicleRoadFit: VehicleRoadFitInput = {
      vehicleClass,
      roadSegmentId: preferredIds[0] ?? DEFAULT_PAVED_ROAD_ID,
      roadBaseType: routeFlags.hasFRoad
        ? 'F_ROAD'
        : routeFlags.hasGravel
          ? 'GRAVEL'
          : 'PAVED',
      roadStatus: mapLiveStatus(
        preferredIds[0]
          ? explicit?.roadStatusBySegmentId?.[preferredIds[0]]
          : undefined,
        overlay.blocked,
      ),
      rentalRestrictions: explicit?.rentalRestrictions ?? [],
      seasonOpen: preferredIds[0]
        ? explicit?.seasonOpenBySegmentId?.[preferredIds[0]]
        : undefined,
      windExposure: routeFlags.hasFRoad || routeFlags.highWindExposure ? 'HIGH' : 'LOW',
      weatherBand: 'default',
      driverExperience: explicit?.driverExperience,
    };
    return attachWeather(state, vehicleRoadFit, routeFlags.highWindExposure, {
      segmentLengthKm,
      isNight: explicit?.isNight,
      daylight: buildDaylightInputFromFacts(explicit),
      winter: buildWinterInputFromFacts(explicit),
    });
  }

  const profile = pickProfileForFlags(bundle, routeFlags, preferredIds);
  const roadBaseType = mapProfileToRoadBaseType(profile);
  const windExposure = windExposureFromProfile(profile, roadBaseType);
  const statusFromFacts = explicit?.roadStatusBySegmentId?.[profile.roadId];

  const vehicleRoadFit: VehicleRoadFitInput = {
    vehicleClass,
    roadSegmentId: profile.roadId,
    roadBaseType,
    roadStatus: mapLiveStatus(statusFromFacts, overlay.blocked),
    rentalRestrictions: explicit?.rentalRestrictions ?? [],
    hasFordCrossing: profile.hasUnbridgedRiver,
    seasonOpen:
      explicit?.seasonOpenBySegmentId?.[profile.roadId] ??
      (profile.winterServiceLevel === 'YEAR_ROUND' ? true : undefined),
    windExposure:
      routeFlags.highWindExposure && windExposure === 'LOW' ? 'HIGH' : windExposure,
    weatherBand: 'default',
    driverExperience: explicit?.driverExperience,
  };

  return attachWeather(state, vehicleRoadFit, routeFlags.highWindExposure, {
    segmentLengthKm,
    isNight: explicit?.isNight,
    daylight: buildDaylightInputFromFacts(explicit),
    winter: buildWinterInputFromFacts(explicit),
  });
}

function buildDaylightInputFromFacts(
  explicit: IcelandSelfDriveRouteFacts | undefined,
): DaylightDrivingLoadInput | undefined {
  const d = explicit?.daylightDriving;
  if (!d) return undefined;
  const hasStructured =
    typeof d.nightExposureMinutes === 'number' ||
    typeof d.sameDayDriveMinutes === 'number' ||
    d.nextMorningBooking === true ||
    (typeof d.civilDawnLocalMin === 'number' &&
      typeof d.civilDuskLocalMin === 'number');
  if (!hasStructured) return undefined;
  return {
    nightExposureMinutes: d.nightExposureMinutes ?? 0,
    sameDayDriveMinutes: d.sameDayDriveMinutes,
    nextMorningBooking: d.nextMorningBooking,
    unfamiliarRoad: d.unfamiliarRoad,
    latestArrivalHotelLocalMin: d.latestArrivalHotelLocalMin,
    remainingDriveMinutes: d.remainingDriveMinutes,
    civilDawnLocalMin: d.civilDawnLocalMin,
    civilDuskLocalMin: d.civilDuskLocalMin,
  };
}

function buildWinterInputFromFacts(
  explicit: IcelandSelfDriveRouteFacts | undefined,
): IcelandWinterKnowledgeInput | undefined {
  const w = explicit?.winter;
  if (!w) return undefined;
  if (!w.attractionAccess && !w.activityRisk && !w.snowPlow && !w.lodging) {
    return undefined;
  }
  return {
    attractionAccess: w.attractionAccess,
    activityRisk: w.activityRisk,
    snowPlow: w.snowPlow,
    lodging: w.lodging,
  };
}

function attachWeather(
  state: TripWorldState,
  vehicleRoadFit: VehicleRoadFitInput,
  highWindFlag: boolean,
  extras?: {
    segmentLengthKm?: number;
    isNight?: boolean;
    daylight?: DaylightDrivingLoadInput;
    winter?: IcelandWinterKnowledgeInput;
  },
): ResolvedIcelandSelfDriveFacts {
  const dayWx = readDayWeatherSignal(state);
  const collected = collectPhenomenaFromSignal({
    ...dayWx,
    highWindFlag,
  });

  let weather: DrivingWeatherImpactInput | undefined;
  if (collected.primary) {
    weather = {
      weatherEventId: `live_wx_${state.context.startDate ?? 'day'}`,
      phenomenon: collected.primary,
      additionalPhenomena:
        collected.additional.length > 0 ? collected.additional : undefined,
      windGustMs: collected.windGustMs,
      visibilityM: collected.visibilityM,
      affectedRoadSegments: [vehicleRoadFit.roadSegmentId],
      vehicleClass: vehicleRoadFit.vehicleClass,
      roadExposure: vehicleRoadFit.windExposure,
      driverExperience: vehicleRoadFit.driverExperience,
      segmentLengthKm: extras?.segmentLengthKm,
      isNight: extras?.isNight,
    };
    const severe =
      collected.primary === 'GUST' ||
      collected.primary === 'MULTI' ||
      collected.additional.length > 0;
    vehicleRoadFit.weatherBand = severe ? 'severe' : 'default';
  }

  let daylight = extras?.daylight;
  if (daylight && daylight.nightExposureMinutes > 0 && weather) {
    weather = { ...weather, isNight: true };
  }

  return {
    isIceland: true,
    vehicleRoadFit,
    weather,
    daylight,
    winter: extras?.winter,
  };
}

/**
 * Decision Case / meta path: build fit input from structured trip flags + pack profiles.
 */
export function resolveFactsFromCaseFlags(input: {
  hasFRoad: boolean;
  hasGravel: boolean;
  highWind: boolean;
  vehicleType?: string;
  fRoadIdHint?: string;
  fRoadAllowed?: unknown;
  windGustMs?: number;
}): ResolvedIcelandSelfDriveFacts {
  const vehicleClass = mapVehicleClassExact(input.vehicleType);
  const rentalRestrictions: string[] = [];
  if (input.fRoadAllowed === false) {
    rentalRestrictions.push('NO_F_ROAD');
  }

  const preferredIds = input.fRoadIdHint
    ? [input.fRoadIdHint].filter((id) => id !== 'F-road')
    : [];

  const bundle = loadRoadSegmentProfilesForCountry('IS');
  const profile =
    bundle && bundle.profiles.length > 0
      ? pickProfileForFlags(
          bundle,
          { hasFRoad: input.hasFRoad, hasGravel: input.hasGravel },
          preferredIds,
        )
      : undefined;

  const roadBaseType = profile
    ? mapProfileToRoadBaseType(profile)
    : input.hasFRoad
      ? 'F_ROAD'
      : input.hasGravel
        ? 'GRAVEL'
        : 'PAVED';

  const roadSegmentId = profile?.roadId ?? preferredIds[0] ?? DEFAULT_PAVED_ROAD_ID;
  const windExposure = profile
    ? windExposureFromProfile(profile, roadBaseType)
    : input.hasFRoad || input.highWind
      ? 'HIGH'
      : 'LOW';

  const vehicleRoadFit: VehicleRoadFitInput = {
    vehicleClass,
    roadSegmentId,
    roadBaseType,
    roadStatus: 'OPEN',
    rentalRestrictions,
    hasFordCrossing: profile?.hasUnbridgedRiver,
    seasonOpen: input.hasFRoad ? true : undefined,
    windExposure,
    weatherBand: input.highWind ? 'severe' : 'default',
    driverExperience: vehicleClass === 'SUV_4WD' ? 'BASIC' : 'NONE',
  };

  let weather: DrivingWeatherImpactInput | undefined;
  if (typeof input.windGustMs === 'number') {
    const phenomenon = resolveWeatherPhenomenon(input.windGustMs) ?? 'STRONG_WIND';
    weather = {
      weatherEventId: 'dc_case_wind',
      phenomenon,
      windGustMs: input.windGustMs,
      affectedRoadSegments: [roadSegmentId],
      vehicleClass,
      roadExposure: windExposure,
      driverExperience: vehicleRoadFit.driverExperience,
    };
  } else if (input.highWind) {
    weather = {
      weatherEventId: 'dc_case_wind',
      phenomenon: 'STRONG_WIND',
      affectedRoadSegments: [roadSegmentId],
      vehicleClass,
      roadExposure: windExposure,
      driverExperience: vehicleRoadFit.driverExperience,
    };
  }

  return { isIceland: true, vehicleRoadFit, weather };
}

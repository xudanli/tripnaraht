/**
 * Daylight / season driving load — strategy thresholds from pack policy.
 * Civil dawn/dusk facts must come from SunCalc (passed in); never invented here.
 */

import type { SourceReference } from '../iceland-knowledge.types';
import { loadIcelandDaylightDrivingPolicy } from './iceland-road-weather.loader';
import type {
  CrossDomainAggregateStatus,
  DaylightDrivingLoadAssessment,
  DaylightDrivingLoadInput,
  DaylightDrivingPolicy,
} from './iceland-road-weather.types';

const POLICY_EVIDENCE: SourceReference = {
  kind: 'PACK_FILE',
  path: 'knowledge/daylight-season/is-daylight-driving-policy.json',
  version: '1.1.0',
};

function worse(
  a: CrossDomainAggregateStatus,
  b: CrossDomainAggregateStatus,
): CrossDomainAggregateStatus {
  const rank: Record<CrossDomainAggregateStatus, number> = {
    ALLOW: 0,
    NEED_CONFIRM: 1,
    REPLAN_REQUIRED: 2,
    BLOCK: 3,
  };
  return rank[a] >= rank[b] ? a : b;
}

function clampLocalMin(n: number): number {
  return Math.max(0, Math.min(24 * 60 - 1, Math.round(n)));
}

/**
 * Assess night exposure + day load + next-morning booking stack.
 * Example: 90 min night + 4h drive + morning booking → NEED_CONFIRM / end day early.
 */
export function assessDaylightDrivingLoad(
  input: DaylightDrivingLoadInput,
  policy: DaylightDrivingPolicy = loadIcelandDaylightDrivingPolicy(),
): DaylightDrivingLoadAssessment {
  const night = Math.max(0, Math.round(input.nightExposureMinutes));
  const sameDay = Math.max(0, Math.round(input.sameDayDriveMinutes ?? 0));
  const buffer = policy.winterBufferMinutes;
  const dayWarn = policy.dailyDriveLoadWarnMinutes ?? 240;
  const arrivalDefault = policy.latestArrivalDefaultLocalMin ?? 21 * 60;
  const latestArrival =
    typeof input.latestArrivalHotelLocalMin === 'number' &&
    Number.isFinite(input.latestArrivalHotelLocalMin)
      ? clampLocalMin(input.latestArrivalHotelLocalMin)
      : arrivalDefault;

  const unfamiliar =
    input.unfamiliarRoad !== false && night > 0;
  const weatherBand = input.weatherBand ?? 'default';
  const nextMorning = input.nextMorningBooking === true;

  const nightWarn = night >= policy.nightExposureWarnMinutes;
  const heavyDayLoad = sameDay >= dayWarn;

  const stackCfg = policy.unfamiliarNightWeatherStack;
  const unfamiliarNightWeather =
    unfamiliar &&
    night >= stackCfg.nightMinutes &&
    (weatherBand === 'severe' || weatherBand === 'extreme');

  const fullCfg = policy.fullLoadStack;
  const fullLoadStack = !!(
    fullCfg &&
    night >= fullCfg.nightMinutes &&
    sameDay >= fullCfg.sameDayDriveMinutes &&
    (!fullCfg.requireNextMorningBooking || nextMorning)
  );

  let gate: CrossDomainAggregateStatus = 'ALLOW';
  const reasons: string[] = [];
  const recommendedActions: string[] = [];

  if (nightWarn) {
    gate = worse(gate, 'NEED_CONFIRM');
    reasons.push('NIGHT_EXPOSURE_ABOVE_WARN');
    recommendedActions.push('CONFIRM_NIGHT_DRIVING');
  }

  if (heavyDayLoad) {
    gate = worse(gate, 'NEED_CONFIRM');
    reasons.push('SAME_DAY_DRIVE_LOAD_HIGH');
    recommendedActions.push('CONFIRM_DAILY_DRIVE_LOAD');
  }

  if (unfamiliarNightWeather) {
    gate = worse(gate, stackCfg.aggregate);
    reasons.push('UNFAMILIAR_NIGHT_WEATHER_STACK');
    recommendedActions.push('CONFIRM_NIGHT_WEATHER_EXPOSURE');
    recommendedActions.push('END_DAY_EARLIER');
  }

  if (fullLoadStack && fullCfg) {
    gate = worse(gate, fullCfg.aggregate);
    reasons.push('NIGHT_LOAD_BOOKING_STACK');
    recommendedActions.push(...fullCfg.actions);
  } else if (nightWarn && heavyDayLoad && nextMorning) {
    // Soft stack when below full thresholds but all three present
    gate = worse(gate, 'NEED_CONFIRM');
    reasons.push('NIGHT_LOAD_BOOKING_PARTIAL_STACK');
    recommendedActions.push('CONFIRM_NIGHT_LOAD_STACK');
    recommendedActions.push('END_DAY_EARLIER');
  }

  let latestDepartureLocalMin: number | undefined;
  if (
    typeof input.remainingDriveMinutes === 'number' &&
    Number.isFinite(input.remainingDriveMinutes) &&
    input.remainingDriveMinutes >= 0
  ) {
    const factor = policy.winterBufferFactor ?? 1;
    const drive = Math.round(input.remainingDriveMinutes * factor);
    const nightPenalty = nightWarn ? Math.min(30, Math.round(night * 0.1)) : 0;
    latestDepartureLocalMin = clampLocalMin(
      latestArrival - drive - buffer - nightPenalty,
    );
  }

  let suggestedDrivingWindow:
    | { startLocalMin: number; endLocalMin: number }
    | undefined;
  if (
    typeof input.civilDawnLocalMin === 'number' &&
    typeof input.civilDuskLocalMin === 'number' &&
    Number.isFinite(input.civilDawnLocalMin) &&
    Number.isFinite(input.civilDuskLocalMin)
  ) {
    suggestedDrivingWindow = {
      startLocalMin: clampLocalMin(input.civilDawnLocalMin),
      endLocalMin: clampLocalMin(input.civilDuskLocalMin),
    };
  }

  if (gate !== 'ALLOW') {
    recommendedActions.push('SHORTEN_LAST_LEG');
  }

  return {
    nightExposureMinutes: night,
    sameDayDriveMinutes: sameDay,
    winterBufferMinutes: buffer,
    suggestedDrivingWindow,
    latestDepartureLocalMin,
    latestArrivalLodgingLocalMin: latestArrival,
    gate,
    reasons: [...new Set(reasons)],
    recommendedActions: [...new Set(recommendedActions)],
    stack: {
      nightWarn,
      heavyDayLoad,
      nextMorningBooking: nextMorning,
      unfamiliarNightWeather,
      fullLoadStack,
    },
    evidence: [POLICY_EVIDENCE],
    confidence: 0.8,
  };
}

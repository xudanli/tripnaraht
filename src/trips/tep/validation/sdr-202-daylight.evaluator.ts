/**
 * SDR-202 — 安全日照窗口（规划期 TEP Validator）
 * @see internal-docs/product/TEP-SELF-DRIVE-PHASE0-ENGINEERING-CONTRACT.md §2 SDR-202
 */

import {
  loadRoadSegmentProfilesForCountry,
  resolveRoadSegmentProfile,
} from '../../../decision-runtime/packs/road/road-segment-profile.loader';
import type {
  DailyDrivePlan,
  PlanningRuleResult,
  SelfDriveProfile,
} from '../contracts/tep-self-drive.types';
import { loadDaylightRules } from '../loaders/daylight-rules.loader';
import type { ActivityArrivalProjection } from './tep-validation.types';
import {
  minutesToLocalTimeLabel,
  projectAllDayScheduleTimelines,
} from '../utils/day-schedule-timeline.util';
import {
  resolveDayGeoFromPlan,
  resolveDaylightFact,
  type DaylightFact,
} from '../utils/daylight-fact.provider';

function resolveRoadIdFromRef(
  roadRef: string,
  countryCode: string,
): string | null {
  const bundle = loadRoadSegmentProfilesForCountry(countryCode);
  if (!bundle) return null;
  const direct = bundle.profiles.find(
    (p) => roadRef.includes(p.roadId) || roadRef.includes(p.segmentId),
  );
  return direct?.roadId ?? null;
}

function isHighlandRoad(countryCode: string, roadRef: string): boolean {
  const roadId = resolveRoadIdFromRef(roadRef, countryCode);
  if (!roadId) return false;
  const bundle = loadRoadSegmentProfilesForCountry(countryCode);
  const profile = roadId && bundle ? resolveRoadSegmentProfile(roadId, bundle) : null;
  return profile?.roadClass === 'HIGHLAND_F_ROAD';
}

function daylightEvidenceRefs(fact: DaylightFact): PlanningRuleResult['evidenceRefs'] {
  return [
    {
      provider: 'TEP',
      sourceType: 'INTERNAL',
      observedAt: new Date().toISOString(),
      predicate: `daylight.sunset:${fact.sunsetLocal}`,
    },
    {
      provider: 'TEP',
      sourceType: 'INTERNAL',
      observedAt: new Date().toISOString(),
      predicate: `daylight.civilDusk:${fact.civilDuskLocal}`,
    },
    {
      provider: 'TEP',
      sourceType: 'INTERNAL',
      observedAt: new Date().toISOString(),
      predicate: `daylight.geo:${fact.lat},${fact.lng}`,
    },
  ];
}

function resolveDrivingCutoffMinutes(input: {
  fact: DaylightFact;
  profile: SelfDriveProfile;
  rules: ReturnType<typeof loadDaylightRules>;
  highlandLeg: boolean;
}): number {
  if (input.highlandLeg) {
    return input.rules?.policies.highRiskRoadMustFinishBefore === 'SUNSET'
      ? input.fact.sunsetMinutes
      : input.fact.civilDuskMinutes;
  }

  if (!input.profile.drivingPolicy.nightDrivingAllowed) {
    return (
      input.fact.drivingCutoffMinutes ??
      input.fact.sunsetMinutes + (input.profile.drivingPolicy.maxMinutesAfterSunset ?? 30)
    );
  }

  if (input.profile.drivingPolicy.nightDrivingPreference === 'AVOID') {
    return input.fact.civilDuskMinutes;
  }

  return input.fact.civilDuskMinutes;
}

function buildDaylightDegradationResult(input: {
  dayIndex: number;
  reason: 'DAYLIGHT_DATA_MISSING' | 'DAYLIGHT_DATA_AMBIGUOUS';
  polarNight?: boolean;
}): PlanningRuleResult {
  const explanation =
    input.reason === 'DAYLIGHT_DATA_MISSING'
      ? `第 ${input.dayIndex} 日日照数据缺失（缺日期/坐标），已降级`
      : input.polarNight
        ? `第 ${input.dayIndex} 日处于极夜/极昼，无法自动判定安全驾驶窗，已降级`
        : `第 ${input.dayIndex} 日日照数据不可用（高纬极昼/极夜），已降级`;

  return {
    ruleId: 'SDR-202',
    outcome: 'UNKNOWN',
    severity: 'MEDIUM',
    affectedRefs: [`day_${input.dayIndex}`],
    explanation,
    evidenceRefs: [],
    degraded: true,
    degradationReason: input.reason,
  };
}

export function evaluateSdr202DaylightSafetyWindow(input: {
  profile: SelfDriveProfile;
  dailyDrivePlans: DailyDrivePlan[];
  countryCode: string;
  activityArrivals?: ActivityArrivalProjection[];
  latitude?: number;
  longitude?: number;
}): PlanningRuleResult[] {
  const rules = loadDaylightRules(input.countryCode);
  const fallbackLat = input.latitude ?? rules?.computation.defaultLatitude ?? 64.13;
  const fallbackLng = input.longitude ?? rules?.computation.defaultLongitude ?? -21.94;
  const timezone = rules?.computation.fallbackTimezone ?? 'Atlantic/Reykjavik';
  const results: PlanningRuleResult[] = [];

  const timelines = projectAllDayScheduleTimelines(
    input.dailyDrivePlans,
    input.activityArrivals,
  );

  for (const timeline of timelines) {
    const day = input.dailyDrivePlans.find((d) => d.dayIndex === timeline.dayIndex);
    if (!day) continue;

    const geo = resolveDayGeoFromPlan({
      origin: day.origin,
      destination: day.destination,
      fallbackLat,
      fallbackLng,
    });

    const factOrFailure = resolveDaylightFact({
      date: timeline.date,
      lat: geo.lat,
      lng: geo.lng,
      timezone,
      maxMinutesAfterSunset: input.profile.drivingPolicy.maxMinutesAfterSunset,
    });

    if ('degraded' in factOrFailure) {
      results.push(
        buildDaylightDegradationResult({
          dayIndex: timeline.dayIndex,
          reason: factOrFailure.degradationReason,
          polarNight: factOrFailure.polarNight,
        }),
      );
      continue;
    }

    const fact = factOrFailure;
    const outdoorCutoff =
      rules?.policies.outdoorActivityMustFinishBefore === 'SUNSET'
        ? fact.sunsetMinutes
        : fact.civilDuskMinutes;

    for (const activity of day.activities) {
      if (!activity.weatherSensitive) continue;
      const window = timeline.activities.find((a) => a.ref === activity.ref);
      if (!window) continue;

      if (window.endMinutesLocal > outdoorCutoff) {
        const over = window.endMinutesLocal - outdoorCutoff;
        results.push({
          ruleId: 'SDR-202',
          outcome: 'SUGGEST_REPAIR',
          severity: 'HIGH',
          affectedRefs: [activity.ref, `day_${timeline.dayIndex}`],
          explanation: `天气敏感户外活动 ${activity.ref} 预计 ${minutesToLocalTimeLabel(window.endMinutesLocal)} 结束，晚于安全日照窗 ${minutesToLocalTimeLabel(outdoorCutoff)}（+${over}min）`,
          evidenceRefs: daylightEvidenceRefs(fact),
        });
      }
    }

    for (const legFinish of timeline.legFinishes) {
      const leg = day.legs.find((l) => l.legId === legFinish.legId);
      if (!leg) continue;

      const highlandLeg =
        !input.profile.drivingPolicy.nightDrivingAllowed &&
        leg.roadRefs.some((ref) => isHighlandRoad(input.countryCode, ref));
      const cutoffMinutes = resolveDrivingCutoffMinutes({
        fact,
        profile: input.profile,
        rules,
        highlandLeg,
      });

      if (legFinish.finishMinutesLocal <= cutoffMinutes) continue;

      const over = legFinish.finishMinutesLocal - cutoffMinutes;
      const finishLabel = minutesToLocalTimeLabel(legFinish.finishMinutesLocal);
      const cutoffLabel = minutesToLocalTimeLabel(cutoffMinutes);

      if (highlandLeg) {
        results.push({
          ruleId: 'SDR-202',
          outcome: 'REJECT',
          severity: 'CRITICAL',
          affectedRefs: [leg.legId, ...leg.roadRefs, `day_${timeline.dayIndex}`],
          explanation: `高地路段 ${leg.roadRefs.join(', ')} 预计 ${finishLabel} 结束，超过安全截止 ${cutoffLabel}（暮光 ${fact.civilDuskLocal}，+${over}min）`,
          evidenceRefs: daylightEvidenceRefs(fact),
        });
        continue;
      }

      const outcome = !input.profile.drivingPolicy.nightDrivingAllowed
        ? (rules?.policies.noNightDrivingProfilePolicy ?? 'SUGGEST_REPAIR')
        : input.profile.drivingPolicy.nightDrivingPreference === 'AVOID'
          ? (rules?.policies.nightDrivingDefaultPolicy ?? 'NEED_CONFIRM')
          : 'CAUTION';

      const severity =
        outcome === 'REJECT' ? 'CRITICAL' : outcome === 'SUGGEST_REPAIR' ? 'HIGH' : 'MEDIUM';

      const cutoffKind = !input.profile.drivingPolicy.nightDrivingAllowed
        ? `日落 ${fact.sunsetLocal} + ${input.profile.drivingPolicy.maxMinutesAfterSunset ?? 30} 分钟`
        : `暮光 ${fact.civilDuskLocal}`;

      results.push({
        ruleId: 'SDR-202',
        outcome,
        severity,
        affectedRefs: [leg.legId, `day_${timeline.dayIndex}`],
        explanation: `驾驶段预计 ${finishLabel} 结束，超出安全截止 ${cutoffLabel}（${cutoffKind}，+${over}min）`,
        evidenceRefs: daylightEvidenceRefs(fact),
      });
    }
  }

  return results;
}

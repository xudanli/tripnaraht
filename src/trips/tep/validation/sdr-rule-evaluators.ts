/**
 * SDR P0 rule evaluators — pure, deterministic (planning-period TEP Validator).
 * @see internal-docs/product/TEP-SELF-DRIVE-PHASE0-ENGINEERING-CONTRACT.md §2
 */

import { executePackRuleConstraint } from '../../../decision-runtime/packs/rules/pack-rule-constraint.executor';
import {
  loadRoadSegmentProfilesForCountry,
  resolveRoadSegmentProfile,
} from '../../../decision-runtime/packs/road/road-segment-profile.loader';
import type { RoadSegmentProfileBundle } from '../../../decision-runtime/packs/road/road-segment-profile.types';
import type {
  DailyDrivePlan,
  DriveLoadTier,
  PlanningRuleResult,
  SelfDriveProfile,
} from '../contracts/tep-self-drive.types';
import {
  classifyDriveLoadTier,
  loadDrivingLoadConfig,
} from '../loaders/driving-load-config.loader';
import { fromPackRule } from '../mappers/verdict.mapper';
import type {
  ActivityArrivalProjection,
  RoadConditionSnapshot,
  TepValidationInput,
} from './tep-validation.types';
import { buildPlanDependencies } from '../utils/plan-dependency.builder';
import { evaluateSdr303DependencyChain } from './sdr-303-dependency.evaluator';
import { evaluateSdr202DaylightSafetyWindow } from './sdr-202-daylight.evaluator';
import { evaluateSdr003RentalContractRestrictions } from './sdr-003-rental.evaluator';

function isFourWheelDrive(vehicleType: string): boolean {
  return vehicleType === '4WD' || vehicleType === 'AWD';
}

function resolveRoadIdFromRef(
  roadRef: string,
  bundle: RoadSegmentProfileBundle | null,
): string | null {
  if (!bundle) return null;
  const direct = bundle.profiles.find(
    (p) => roadRef.includes(p.roadId) || roadRef.includes(p.segmentId),
  );
  return direct?.roadId ?? null;
}

function computeDayEquivalentMinutes(
  plan: DailyDrivePlan,
  profile: SelfDriveProfile,
  countryCode: string,
): number {
  const config = loadDrivingLoadConfig(countryCode);
  const baseMinutes = plan.legs.reduce(
    (sum, leg) => sum + (leg.adjustedMinutes ?? leg.baseNavigationMinutes),
    0,
  );
  const stopOverhead =
    plan.activities.length * config.penalties.plannedStopMinutesMin;
  const novicePenalty =
    profile.drivers[0]?.experienceLevel === 'NOVICE_ABROAD'
      ? config.penalties.noviceAbroadMinutes
      : 0;
  const nightPenalty =
    !profile.drivingPolicy.nightDrivingAllowed && plan.legs.length > 0
      ? Math.round(baseMinutes * (config.penalties.nightDrivingMultiplier - 1))
      : 0;

  return baseMinutes + stopOverhead + novicePenalty + nightPenalty;
}

function outcomeForDriveLoadTier(tier: DriveLoadTier): Pick<PlanningRuleResult, 'outcome' | 'severity'> {
  switch (tier) {
    case 'EXTREME':
      return { outcome: 'NEED_CONFIRM', severity: 'HIGH' };
    case 'HIGH':
      return { outcome: 'SUGGEST_REPAIR', severity: 'HIGH' };
    case 'MEDIUM':
      return { outcome: 'CAUTION', severity: 'MEDIUM' };
    default:
      return { outcome: 'PASS', severity: 'INFO' };
  }
}

export function evaluateSdr001VehicleRoadAccess(input: {
  profile: SelfDriveProfile;
  dailyDrivePlans: DailyDrivePlan[];
  countryCode: string;
}): PlanningRuleResult[] {
  const bundle = loadRoadSegmentProfilesForCountry(input.countryCode);
  const vehicleType = input.profile.vehicle.vehicleType;
  if (isFourWheelDrive(vehicleType)) return [];

  const findings: PlanningRuleResult[] = [];

  for (const day of input.dailyDrivePlans) {
    for (const leg of day.legs) {
      for (const roadRef of leg.roadRefs) {
        const roadId = resolveRoadIdFromRef(roadRef, bundle);
        if (!roadId || !bundle) {
          findings.push({
            ruleId: 'SDR-001',
            outcome: 'UNKNOWN',
            severity: 'HIGH',
            affectedRefs: [leg.legId, roadRef],
            explanation: `道路 ${roadRef} 无 profile，无法确认车型准入`,
            evidenceRefs: [],
            degraded: true,
            degradationReason: 'ROAD_PROFILE_MISSING',
          });
          continue;
        }

        const profile = resolveRoadSegmentProfile(roadId, bundle);
        if (!profile) continue;

        if (profile.requires4wd) {
          const isDefaultVehicle = input.profile.vehicle.vehicleSource === 'PACK_DEFAULT';
          findings.push({
            ruleId: 'SDR-001',
            outcome: isDefaultVehicle ? 'NEED_CONFIRM' : 'REJECT',
            severity: isDefaultVehicle ? 'HIGH' : 'CRITICAL',
            affectedRefs: [leg.legId, roadRef, profile.roadId],
            explanation: isDefaultVehicle
              ? `车型为 Pack 默认 ${vehicleType}，需用户确认实际车辆能否驶入 ${profile.roadId}（需 4WD）`
              : `${vehicleType} 车辆不可驶入 ${profile.roadId}（需 4WD）`,
            evidenceRefs: [
              {
                provider: 'PACK',
                sourceType: 'OFFICIAL',
                observedAt: new Date().toISOString(),
                subjectRef: profile.segmentId,
              },
            ],
            ...(isDefaultVehicle
              ? { degradationReason: 'VEHICLE_SOURCE_PACK_DEFAULT' }
              : {}),
          });
        }
      }
    }
  }

  return findings;
}

export function evaluateSdr002RoadStatus(input: {
  countryCode: string;
  roadConditions?: RoadConditionSnapshot[];
  dailyDrivePlans: DailyDrivePlan[];
}): PlanningRuleResult[] {
  const results: PlanningRuleResult[] = [];
  const now = Date.now();

  const refsOnPlan = new Set(
    input.dailyDrivePlans.flatMap((d) => d.legs.flatMap((l) => l.roadRefs)),
  );

  for (const condition of input.roadConditions ?? []) {
    if (!refsOnPlan.has(condition.roadRef)) continue;

    if (condition.validUntil) {
      const expires = new Date(condition.validUntil).getTime();
      if (!Number.isNaN(expires) && expires < now) {
        results.push({
          ruleId: 'SDR-002',
          outcome: 'UNKNOWN',
          severity: 'HIGH',
          affectedRefs: [condition.roadRef],
          explanation: '道路状态证据已过期',
          evidenceRefs: [
            {
              provider: 'ROAD_IS',
              sourceType: 'OFFICIAL',
              observedAt: condition.observedAt ?? new Date().toISOString(),
              validUntil: condition.validUntil,
              degraded: true,
            },
          ],
          degraded: true,
          degradationReason: 'EVIDENCE_EXPIRED',
        });
        continue;
      }
    }

    const packEval = executePackRuleConstraint({
      country: input.countryCode,
      semanticKey: 'ROAD_SEGMENT_UNAVAILABLE',
      facts: { road: { status: condition.status ?? 'UNKNOWN' } },
      candidateUsesRoute: true,
    });

    if (packEval?.matched && packEval.verdict === 'BLOCK') {
      const mapped = fromPackRule({ verdict: 'BLOCK', overridable: packEval.overridable });
      results.push({
        ruleId: 'SDR-002',
        outcome: mapped.outcome,
        severity: mapped.severity,
        affectedRefs: [condition.roadRef],
        explanation: `道路 ${condition.roadRef} 状态 ${condition.status}`,
        evidenceRefs: [
          {
            provider: 'ROAD_IS',
            sourceType: 'OFFICIAL',
            observedAt: condition.observedAt ?? new Date().toISOString(),
            validUntil: condition.validUntil,
          },
        ],
      });
    }
  }

  return results;
}

export function evaluateSdr101DailyDriveLoad(input: {
  profile: SelfDriveProfile;
  dailyDrivePlans: DailyDrivePlan[];
  countryCode: string;
}): PlanningRuleResult[] {
  const config = loadDrivingLoadConfig(input.countryCode);
  const results: PlanningRuleResult[] = [];

  for (const day of input.dailyDrivePlans) {
    const equivalentMinutes = computeDayEquivalentMinutes(day, input.profile, input.countryCode);
    const tier = classifyDriveLoadTier(equivalentMinutes, config);
    const mapped = outcomeForDriveLoadTier(tier);
    if (mapped.outcome === 'PASS') continue;

    const policyMax = input.profile.drivingPolicy.maxDailyDriveMinutes;
    results.push({
      ruleId: 'SDR-101',
      outcome: mapped.outcome,
      severity: mapped.severity,
      affectedRefs: [`day_${day.dayIndex}`, ...day.legs.map((l) => l.legId)],
      explanation: `第 ${day.dayIndex} 日等效驾驶负荷 ${equivalentMinutes}min（${tier}）${
        policyMax ? `，政策上限 ${policyMax}min` : ''
      }`,
      evidenceRefs: [
        {
          provider: 'TEP',
          sourceType: 'INTERNAL',
          observedAt: new Date().toISOString(),
          predicate: 'driveLoadTier',
          confidence: 1,
        },
      ],
    });
  }

  return results;
}

export function evaluateSdr201AccommodationArrival(input: {
  dailyDrivePlans: DailyDrivePlan[];
  activityArrivals?: ActivityArrivalProjection[];
}): PlanningRuleResult[] {
  const results: PlanningRuleResult[] = [];

  for (const day of input.dailyDrivePlans) {
    const accommodation = day.accommodation;
    if (!accommodation?.latestArrival) continue;

    const hotelArrival = (input.activityArrivals ?? []).find((a) =>
      a.activityRef.includes(accommodation.ref.replace('accommodation_', '')),
    );

    const projected =
      hotelArrival?.projectedArrivalAt ??
      day.activities.find((a) => a.ref.includes(accommodation.ref.replace('accommodation_', '')))
        ?.fixedStartAt;

    if (!projected) continue;

    const latestParts = accommodation.latestArrival.split(':').map(Number);
    const projectedDate = new Date(projected);
    if (Number.isNaN(projectedDate.getTime())) continue;

    const projectedMinutes =
      projectedDate.getUTCHours() * 60 + projectedDate.getUTCMinutes();
    const latestMinutes = (latestParts[0] ?? 0) * 60 + (latestParts[1] ?? 0);
    const slip = projectedMinutes - latestMinutes;

    if (slip > 0) {
      results.push({
        ruleId: 'SDR-201',
        outcome: slip >= 15 ? 'NEED_CONFIRM' : 'CAUTION',
        severity: 'MEDIUM',
        affectedRefs: [accommodation.ref],
        explanation: `预计抵达住宿晚于最晚抵达 ${slip} 分钟`,
        evidenceRefs: [],
      });
    }
  }

  return results;
}

export function evaluateSdr203FixedActivityReachability(input: {
  dailyDrivePlans: DailyDrivePlan[];
  activityArrivals?: ActivityArrivalProjection[];
}): PlanningRuleResult[] {
  const results: PlanningRuleResult[] = [];

  for (const day of input.dailyDrivePlans) {
    for (const activity of day.activities) {
      if (!activity.reservationRequired && !activity.fixedStartAt) continue;

      const arrival = (input.activityArrivals ?? []).find((a) => a.activityRef === activity.ref);
      if (!arrival || !activity.fixedStartAt) continue;

      const fixedStart = new Date(activity.fixedStartAt).getTime();
      const projected = new Date(arrival.projectedArrivalAt).getTime();
      if (Number.isNaN(fixedStart) || Number.isNaN(projected)) continue;

      if (projected > fixedStart) {
        const slipMinutes = Math.round((projected - fixedStart) / 60_000);
        results.push({
          ruleId: 'SDR-203',
          outcome: 'REJECT',
          severity: 'CRITICAL',
          affectedRefs: [activity.ref, ...day.legs.map((l) => l.legId)],
          explanation: `预约活动 ${activity.ref} 固定开始 ${activity.fixedStartAt}，预计 ${slipMinutes} 分钟后才能抵达`,
          evidenceRefs: [],
        });
      }
    }
  }

  return results;
}

export function evaluateSdr301DailyFlexibility(input: {
  dailyDrivePlans: DailyDrivePlan[];
  countryCode: string;
  profile: SelfDriveProfile;
}): PlanningRuleResult[] {
  const config = loadDrivingLoadConfig(input.countryCode);
  const results: PlanningRuleResult[] = [];

  for (const day of input.dailyDrivePlans) {
    const equivalentMinutes = computeDayEquivalentMinutes(day, input.profile, input.countryCode);
    const tier = classifyDriveLoadTier(equivalentMinutes, config);
    if (tier !== 'HIGH' && tier !== 'EXTREME') continue;

    const removable = day.activities.filter(
      (a) => a.flexibility === 'REMOVABLE' || a.flexibility === 'REPLACEABLE',
    );
    if (removable.length === 0) {
      results.push({
        ruleId: 'SDR-301',
        outcome: 'CAUTION',
        severity: 'MEDIUM',
        affectedRefs: [`day_${day.dayIndex}`],
        explanation: `第 ${day.dayIndex} 日高负荷且无可弹性调整节点`,
        evidenceRefs: [],
      });
    }
  }

  return results;
}

export function evaluateSdr302WeatherSensitiveFallback(input: {
  dailyDrivePlans: DailyDrivePlan[];
}): PlanningRuleResult[] {
  const results: PlanningRuleResult[] = [];

  for (const day of input.dailyDrivePlans) {
    for (const activity of day.activities) {
      if (!activity.weatherSensitive) continue;
      if (activity.flexibility === 'REPLACEABLE' || activity.flexibility === 'REMOVABLE') {
        continue;
      }
      results.push({
        ruleId: 'SDR-302',
        outcome: 'CAUTION',
        severity: 'MEDIUM',
        affectedRefs: [activity.ref],
        explanation: `天气敏感活动 ${activity.ref} 无替代/移除弹性`,
        evidenceRefs: [],
      });
    }
  }

  return results;
}

export function runTepValidation(input: TepValidationInput): PlanningRuleResult[] {
  const dependencies = buildPlanDependencies(input.dailyDrivePlans);

  return [
    ...evaluateSdr001VehicleRoadAccess(input),
    ...evaluateSdr003RentalContractRestrictions(input),
    ...evaluateSdr002RoadStatus(input),
    ...evaluateSdr101DailyDriveLoad(input),
    ...evaluateSdr201AccommodationArrival(input),
    ...evaluateSdr202DaylightSafetyWindow(input),
    ...evaluateSdr203FixedActivityReachability(input),
    ...evaluateSdr301DailyFlexibility(input),
    ...evaluateSdr302WeatherSensitiveFallback(input),
    ...evaluateSdr303DependencyChain({
      dailyDrivePlans: input.dailyDrivePlans,
      dependencies,
    }),
  ].filter((r) => r.outcome !== 'PASS');
}

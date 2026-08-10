/**
 * Adapt Independent VERIFY snapshot → ConstraintEvaluationGateway EvaluatePlanInput.
 * Offline synthetic plan — does not load Prisma.
 */

import type { EvaluatePlanInput } from '../../../decision-runtime/constraints/contracts/evaluate-input.types';
import type { PlanSlot, TripPlan } from '../../decision/plan-model';
import type { TripWorldState } from '../../decision/world-model';
import type { InitialPlanVerificationSnapshot } from '../types/iceland-initial-plan-verification.types';
import type { PackRuleConstraintInput } from '../../../decision-runtime/packs/rules/pack-rule-constraint.types';
import { resolvePlaceAccessFacts } from '../utils/iceland-place-access-facts.util';

export interface SnapshotToEvaluatePlanResult {
  evaluatePlanInput: EvaluatePlanInput;
  /** Pack contexts derived for DestinationPack (one per F-road day if needed). */
  packContexts: PackRuleConstraintInput[];
}

function minutesToHhMm(totalMin: number): string {
  const h = Math.floor(Math.max(0, totalMin) / 60);
  const m = Math.max(0, totalMin) % 60;
  return `${String(h).padStart(2, '0')}:${String(m).padStart(2, '0')}`;
}

export function verificationSnapshotToEvaluatePlan(
  snapshot: InitialPlanVerificationSnapshot,
): SnapshotToEvaluatePlanResult {
  const vehicle = snapshot.tripContext.vehicleProfile ?? {};
  const plan: TripPlan = {
    version: `iceland-contrast@${snapshot.proposalVersion}`,
    createdAt: new Date().toISOString(),
    tripId: snapshot.tripId,
    days: snapshot.days.map((day) => {
      let cursor = 9 * 60;
      const timeSlots: PlanSlot[] = day.items.map((item, idx) => {
        const start = item.startTime
          ? parseClock(item.startTime)
          : cursor;
        const end = item.endTime
          ? parseClock(item.endTime)
          : start + (item.durationMin || 60);
        cursor = end + 15;
        const prevDrive =
          idx === 0 && day.totalDrivingMin > 0
            ? Math.min(day.totalDrivingMin, 180)
            : undefined;
        return {
          id: item.itemId,
          time: minutesToHhMm(start),
          endTime: minutesToHhMm(end),
          title: `item:${item.itemId}`,
          type: 'sightseeing',
          poiId: item.canonicalPlaceId?.toString(),
          coordinates:
            item.latitude != null && item.longitude != null
              ? { lat: item.latitude, lng: item.longitude }
              : undefined,
          travelLegFromPrev:
            prevDrive != null
              ? {
                  mode: 'drive',
                  from: { lat: 64.14, lng: -21.94 },
                  to: {
                    lat: item.latitude ?? 64.15,
                    lng: item.longitude ?? -21.9,
                  },
                  durationMin: prevDrive,
                }
              : undefined,
        };
      });

      if (timeSlots.length === 0 && day.totalDrivingMin > 0) {
        timeSlots.push({
          id: `drive_day_${day.dayIndex}`,
          time: '09:00',
          endTime: minutesToHhMm(9 * 60 + day.totalDrivingMin),
          title: 'Drive segment',
          type: 'transport',
          travelLegFromPrev: {
            mode: 'drive',
            from: { lat: 64.14, lng: -21.94 },
            to: { lat: 64.25, lng: -21.1 },
            durationMin: day.totalDrivingMin,
          },
        });
      }

      return {
        day: day.dayIndex,
        date: day.date,
        timeSlots,
      };
    }),
  };

  const worldState = {
    context: {
      tripId: snapshot.tripId,
      destination: 'IS',
      startDate: snapshot.tripContext.startDate,
      durationDays: Math.max(1, snapshot.days.length),
      travelModeDefault: 'drive',
      preferences: {
        intents: {},
        pace: 'moderate',
        riskTolerance: 'medium',
      },
    },
    candidatesByDate: {},
    signals: {
      lastUpdatedAt: new Date().toISOString(),
      icelandVehicleProfile: vehicle,
    },
    physical: {
      roadStates: [],
      hazardZones: [],
      ferryStates: [],
    },
  } as TripWorldState;

  const packContexts: PackRuleConstraintInput[] = [];
  for (const day of snapshot.days) {
    for (const item of day.items) {
      const road = {
        ...resolvePlaceAccessFacts(item.canonicalPlaceId),
        ...item.roadRequirements,
      };
      if (road.requiresFroad) {
        packContexts.push({
          country: 'IS',
          semanticKey: 'ROAD_SEGMENT_RESTRICTED',
          candidateUsesRoute: true,
          facts: {
            requiresFroad: true,
            vehicleAllowsFRoad: vehicle.allowsFRoad === true,
            is4wd: vehicle.is4wd === true,
            vehicleClass: vehicle.vehicleClass,
            dayIndex: day.dayIndex,
            placeId: item.canonicalPlaceId,
          },
        });
      }
    }
  }

  const evaluatePlanInput: EvaluatePlanInput = {
    tripId: snapshot.tripId,
    plan,
    worldState,
    countryCode: 'IS',
    evaluationMode: 'PLAN_VERIFY',
    skipLegacyChecker: true,
    dataAvailability: {
      roads: 'LOADED',
      hazards: 'LOADED',
      ferries: 'LOADED',
      /** Offline contrast: avoid WEATHER/opening UNKNOWN → UNVERIFIED false Confirm drift. */
      weather: 'LOADED',
      openingHours: 'LOADED',
      poiIdentity: 'LOADED',
    },
    packContext: packContexts[0],
  };

  return { evaluatePlanInput, packContexts };
}

function parseClock(hhmm: string): number {
  const [h, m] = hhmm.split(':').map((x) => Number(x));
  if (!Number.isFinite(h) || !Number.isFinite(m)) return 9 * 60;
  return h * 60 + m;
}

/**
 * Transport / Route MDS Projector
 */

import type {
  DecisionStateContract,
  DecisionStateProjection,
  ProjectedKeyState,
  StateKey,
} from './decision-state.types';

export type TransportRouteProjectionHints = {
  message?: string | null;
  tripId?: string | null;
  focusDayIndex?: number | null;
  vehicleProfile?: {
    drivetrain?: string | null;
    labelZh?: string | null;
  } | null;
  rentalGuidanceAvailable?: boolean | null;
};

function parseDay(message: string, focusDay?: number | null): number | null {
  const m = String(message ?? '').match(/(?:第\s*(\d+)\s*天|Day\s*[-_]?\s*(\d+))/i);
  const n = m
    ? Number(m[1] || m[2])
    : focusDay != null && Number(focusDay) > 0
      ? Number(focusDay)
      : NaN;
  return Number.isFinite(n) && n >= 1 ? n : null;
}

function inferDrivetrain(message: string): string | null {
  const m = String(message ?? '');
  if (/4\s*WD|4x4|四驱|AWD/i.test(m)) return '4WD';
  if (/2\s*WD|两驱|FWD|RWD/i.test(m)) return '2WD';
  if (/SUV/i.test(m)) return 'SUV';
  return null;
}

function mentionsRoadContext(message: string): boolean {
  return /F\s*-?\s*road|F路|高地|Þórsmörk|Thorsmork|内陆|碎石路/i.test(
    String(message ?? ''),
  );
}

export function projectTransportRouteDecisionState(
  contract: DecisionStateContract,
  hints: TransportRouteProjectionHints,
): DecisionStateProjection {
  const message = String(hints.message ?? '');
  const tripId = String(hints.tripId ?? '').trim();
  const day = parseDay(message, hints.focusDayIndex);
  const drivetrain =
    hints.vehicleProfile?.drivetrain ?? inferDrivetrain(message);
  const road = mentionsRoadContext(message);

  const resolveKey = (key: StateKey): ProjectedKeyState => {
    switch (key) {
      case 'trip_binding':
        return tripId
          ? { key, presence: 'PRESENT', value: { tripId } }
          : { key, presence: 'MISSING' };
      case 'day_anchor':
        return day != null
          ? { key, presence: 'PRESENT', value: { dayIndex: day } }
          : { key, presence: 'MISSING' };
      case 'vehicle_profile':
        if (drivetrain || hints.vehicleProfile?.labelZh) {
          return {
            key,
            presence: 'PRESENT',
            value: {
              drivetrain: drivetrain ?? null,
              labelZh: hints.vehicleProfile?.labelZh ?? drivetrain,
            },
          };
        }
        return { key, presence: 'MISSING' };
      case 'road_access':
        return road
          ? {
              key,
              presence: 'PRESENT',
              value: { context: 'froad_or_highland' },
            }
          : { key, presence: 'MISSING' };
      case 'rental_policy':
        return {
          key,
          presence: hints.rentalGuidanceAvailable === false ? 'UNKNOWN' : 'PRESENT',
          value: {
            source: hints.rentalGuidanceAvailable === false ? 'pending' : 'catalog_or_guidance',
          },
          noteZh:
            hints.rentalGuidanceAvailable === false
              ? '租车指导未注入'
              : '可用政策/攻略通道',
        };
      case 'route_scope':
        return /路线|route|顺序|通勤|travel\s*time/i.test(message)
          ? {
              key,
              presence: 'PRESENT',
              value: { kind: 'day_order_optimize', dayIndex: day },
            }
          : { key, presence: 'UNKNOWN', noteZh: '待加载当日 POI 顺序' };
      default:
        return { key, presence: 'UNKNOWN' };
    }
  };

  return {
    decisionClass: contract.decisionClass,
    contractVersion: contract.version,
    keys: contract.keys.map((k) => resolveKey(k.key)),
    ignored: contract.ignoredWorldKeys.map((key) => ({
      key,
      presence: 'IGNORED' as const,
      noteZh: 'undeclared_by_contract',
    })),
  };
}

import { isIcelandHighlandFRoadSeasonallyClosed } from '../../domain/ontology/validator/iceland-f-road-policy.util';
import type { GuideVehicleType } from './guide-vehicle.util';

/** 冰岛高地 / F-road 关键词（与 plan-architect 季节校验对齐） */
export const ICELAND_HIGHLAND_FROAD_KEYWORDS = [
  'landmannalaugar',
  '兰德曼纳劳卡',
  'þórsmörk',
  'thorsmork',
  '索斯莫克',
  'sprengisandur',
  'askja',
  '阿斯恰',
  'kerlingarfjöll',
  '凯德灵加山',
  'highland',
  '高地',
  '内陆高地',
  'highlands',
  'f-road',
  'f路',
  'f road',
] as const;

const F_ROAD_ID_PATTERN = /\b(F\d{1,4})\b/i;

export interface IcelandPlaceIntent {
  hasHighlandIntent: boolean;
  fRoadIds: string[];
  matchedKeywords: string[];
}

export function detectIcelandPlaceIntent(texts: string[]): IcelandPlaceIntent {
  const fRoadIds = new Set<string>();
  const matchedKeywords: string[] = [];
  let hasHighlandIntent = false;

  for (const raw of texts) {
    const text = raw.trim();
    if (!text) continue;
    const lower = text.toLowerCase();

    for (const kw of ICELAND_HIGHLAND_FROAD_KEYWORDS) {
      if (lower.includes(kw.toLowerCase())) {
        hasHighlandIntent = true;
        matchedKeywords.push(kw);
      }
    }

    const idMatch = text.match(F_ROAD_ID_PATTERN);
    if (idMatch) {
      hasHighlandIntent = true;
      fRoadIds.add(idMatch[1].toUpperCase());
    }
  }

  return {
    hasHighlandIntent,
    fRoadIds: Array.from(fRoadIds),
    matchedKeywords: Array.from(new Set(matchedKeywords)),
  };
}

export interface IcelandRouteConstraintInput {
  travelDate?: string;
  placeNames: string[];
  vehicleType: GuideVehicleType;
  drivingMinutes?: number;
  routeExists?: boolean;
  liveFRoadStatuses?: Array<{ roadId: string; status: string }>;
}

export interface IcelandRouteConstraintResult {
  routeExists: boolean;
  legallyAllowed: boolean;
  operationallyAvailable: boolean;
  recommended: boolean;
  level:
    | 'route_recommended'
    | 'route_operationally_available'
    | 'route_legally_allowed'
    | 'route_exists'
    | 'route_blocked';
  warnings: string[];
  blockedReasons: string[];
}

export function assessIcelandRouteConstraints(
  input: IcelandRouteConstraintInput,
): IcelandRouteConstraintResult {
  const intent = detectIcelandPlaceIntent(input.placeNames);
  const warnings: string[] = [];
  const blockedReasons: string[] = [];

  const routeExists = input.routeExists !== false;
  let legallyAllowed = true;
  let operationallyAvailable = true;

  if (intent.hasHighlandIntent && input.vehicleType === '2wd') {
    legallyAllowed = false;
    blockedReasons.push('VEHICLE_TYPE_INCOMPATIBLE');
    warnings.push('攻略含高地/F-road 意向，普通两驱车通常无法合法通行');
  }

  if (intent.hasHighlandIntent && input.travelDate) {
    const enterAt = new Date(`${input.travelDate}T12:00:00.000Z`);
    if (!Number.isNaN(enterAt.getTime()) && isIcelandHighlandFRoadSeasonallyClosed(enterAt)) {
      legallyAllowed = false;
      blockedReasons.push('SEGMENT_SEASONALLY_CLOSED');
      warnings.push(
        `出行日期 ${input.travelDate} 处于冰岛高地/F-road 典型封闭季（约 10 月 15 日–6 月 20 日），需调整日期或路线`,
      );
    }
  }

  if (input.liveFRoadStatuses?.length) {
    for (const st of input.liveFRoadStatuses) {
      const status = st.status.toLowerCase();
      if (status === 'closed' || status === 'impassable') {
        operationallyAvailable = false;
        blockedReasons.push(`ROAD_CLOSED:${st.roadId}`);
        warnings.push(`F-road ${st.roadId} 当前状态：${status}`);
      }
      if (status === 'snow_covered' && input.vehicleType === '2wd') {
        operationallyAvailable = false;
        blockedReasons.push(`ROAD_SNOW_COVERED_2WD:${st.roadId}`);
      }
    }
  }

  operationallyAvailable = operationallyAvailable && legallyAllowed;

  const drivingHours = (input.drivingMinutes ?? 0) / 60;
  let recommended = operationallyAvailable;
  if (drivingHours > 6) {
    recommended = false;
    warnings.push(`当日预计驾驶约 ${Math.round(drivingHours)} 小时，超出推荐上限`);
  }

  if (intent.fRoadIds.length > 0 && operationallyAvailable) {
    warnings.push(`路线涉及 F-road：${intent.fRoadIds.join(', ')}，需确认车辆与实时路况`);
  }

  let level: IcelandRouteConstraintResult['level'] = 'route_blocked';
  if (!routeExists) {
    level = 'route_blocked';
    blockedReasons.push('NO_ROUTE');
  } else if (recommended) {
    level = 'route_recommended';
  } else if (operationallyAvailable) {
    level = 'route_operationally_available';
  } else if (legallyAllowed) {
    level = 'route_legally_allowed';
  } else if (routeExists) {
    level = 'route_exists';
  }

  return {
    routeExists,
    legallyAllowed,
    operationallyAvailable,
    recommended,
    level,
    warnings,
    blockedReasons: Array.from(new Set(blockedReasons)),
  };
}

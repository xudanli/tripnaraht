/**
 * Observation Capability Registry — 系统能观察什么（禁止自由造键）。
 * contextKey 与 CRE 合同字段对齐。
 */

import type { ObservationCapability } from './reality-observation.types';

export const OBSERVATION_CAPABILITY_REGISTRY: Record<string, ObservationCapability> = {
  'trip.id': {
    contextKey: 'trip.id',
    domain: 'TRIP_STATE',
    serviceKey: 'TRIP',
    labelZh: '行程 ID',
    creKeys: ['trip.id'],
    canonical: true,
  },
  'trip.destination': {
    contextKey: 'trip.destination',
    domain: 'TRIP_STATE',
    serviceKey: 'TRIP',
    labelZh: '目的地',
    creKeys: ['trip.destination'],
    canonical: true,
  },
  'page.focusDay': {
    contextKey: 'page.focusDay',
    domain: 'TRIP_STATE',
    serviceKey: 'TRIP',
    labelZh: '页面焦点日',
    creKeys: ['page.focusDay'],
    canonical: true,
  },
  'targetDay.date': {
    contextKey: 'targetDay.date',
    domain: 'TRIP_STATE',
    serviceKey: 'TRIP',
    labelZh: '目标日日期',
    creKeys: ['targetDay.date'],
    canonical: true,
  },
  'targetDay.activities': {
    contextKey: 'targetDay.activities',
    domain: 'TIMELINE',
    serviceKey: 'TRIP',
    labelZh: '当日活动',
    creKeys: ['targetDay.activities'],
    canonical: true,
  },
  'targetDay.accommodation': {
    contextKey: 'targetDay.accommodation',
    domain: 'TRIP_STATE',
    serviceKey: 'TRIP',
    labelZh: '当日住宿',
    creKeys: ['targetDay.accommodation'],
    canonical: true,
  },
  'trip.remainingDays': {
    contextKey: 'trip.remainingDays',
    domain: 'TRIP_STATE',
    serviceKey: 'TRIP',
    labelZh: '剩余行程日',
    creKeys: ['trip.remainingDays'],
    canonical: true,
  },
  'route.travelTimeMatrix': {
    contextKey: 'route.travelTimeMatrix',
    domain: 'SPATIAL',
    serviceKey: 'ROUTE',
    labelZh: '段间交通时间',
    creKeys: ['routeTravelTimes'],
    defaultFreshness: '24h',
    canonical: true,
  },
  'route.roadSegments': {
    contextKey: 'route.roadSegments',
    domain: 'ROAD',
    serviceKey: 'ROAD',
    labelZh: '路段组成',
    creKeys: ['roadConditions'],
    defaultFreshness: '6h',
    canonical: true,
  },
  'road.segment.status': {
    contextKey: 'road.segment.status',
    domain: 'ROAD',
    serviceKey: 'ROAD',
    labelZh: '道路开放状态',
    creKeys: ['roadConditions'],
    defaultFreshness: '3h',
    canonical: true,
  },
  'environment.daylightWindow': {
    contextKey: 'environment.daylightWindow',
    domain: 'WEATHER',
    serviceKey: 'WEATHER',
    labelZh: '日照窗口',
    creKeys: ['weather.forecast'],
    defaultFreshness: '12h',
    canonical: true,
  },
  'weather.forecast': {
    contextKey: 'weather.forecast',
    domain: 'WEATHER',
    serviceKey: 'WEATHER',
    labelZh: '天气预报',
    creKeys: ['weather.forecast'],
    defaultFreshness: '6h',
    canonical: true,
  },
  'vehicle.profile': {
    contextKey: 'vehicle.profile',
    domain: 'VEHICLE',
    serviceKey: 'TRIP',
    labelZh: '车辆档案',
    creKeys: ['vehicle.profile'],
    canonical: true,
  },
  'vehicle.driveType': {
    contextKey: 'vehicle.driveType',
    domain: 'VEHICLE',
    serviceKey: 'TRIP',
    labelZh: '驱动类型',
    creKeys: ['vehicle.profile'],
    canonical: true,
  },
  'vehicle.rentalRestriction': {
    contextKey: 'vehicle.rentalRestriction',
    domain: 'VEHICLE',
    serviceKey: 'BOOKING',
    labelZh: '租车限制',
    creKeys: ['vehicle.profile'],
    canonical: true,
  },
  'experience.product': {
    contextKey: 'experience.product',
    domain: 'EXPERIENCE',
    serviceKey: 'EXPERIENCE',
    labelZh: '体验产品',
    creKeys: ['experience.product'],
    canonical: true,
  },
  'experience.physicalIntensity': {
    contextKey: 'experience.physicalIntensity',
    domain: 'EXPERIENCE',
    serviceKey: 'EXPERIENCE',
    labelZh: '体验强度',
    creKeys: ['experience.product', 'participants.fitnessProfile'],
    canonical: true,
  },
  'participants': {
    contextKey: 'participants',
    domain: 'MEMBER',
    serviceKey: 'TEAM',
    labelZh: '成员档案',
    creKeys: ['participants'],
    canonical: true,
  },
  'team.memberCapability': {
    contextKey: 'team.memberCapability',
    domain: 'TEAM',
    serviceKey: 'TEAM',
    labelZh: '团队能力',
    creKeys: ['participants', 'participants.fitnessProfile'],
    canonical: true,
  },
  'booking.fixedCommitments': {
    contextKey: 'booking.fixedCommitments',
    domain: 'BOOKING',
    serviceKey: 'BOOKING',
    labelZh: '固定订单',
    creKeys: ['booking.availability', 'booking.artifact'],
    canonical: true,
  },
  'booking.availability': {
    contextKey: 'booking.availability',
    domain: 'BOOKING',
    serviceKey: 'BOOKING',
    labelZh: '可订状态',
    creKeys: ['booking.availability'],
    canonical: true,
  },
  'activity.ref': {
    contextKey: 'activity.ref',
    domain: 'TRIP_STATE',
    serviceKey: 'TRIP',
    labelZh: '活动引用',
    creKeys: ['activity.ref'],
    canonical: true,
  },
  'risk.trigger': {
    contextKey: 'risk.trigger',
    domain: 'EXTERNAL',
    serviceKey: 'WEATHER',
    labelZh: '风险触发',
    creKeys: ['risk.trigger'],
    canonical: true,
  },
  'travelMode': {
    contextKey: 'travelMode',
    domain: 'TRIP_STATE',
    serviceKey: 'TRIP',
    labelZh: '出行方式',
    creKeys: ['travelMode'],
    canonical: true,
  },
  /** 确定性推导键 */
  'derived.day.totalDrivingMinutes': {
    contextKey: 'derived.day.totalDrivingMinutes',
    domain: 'DERIVED',
    serviceKey: 'DERIVE',
    labelZh: '当日总驾驶分钟',
    creKeys: ['routeTravelTimes'],
    canonical: true,
  },
  'derived.day.totalActivityMinutes': {
    contextKey: 'derived.day.totalActivityMinutes',
    domain: 'DERIVED',
    serviceKey: 'DERIVE',
    labelZh: '当日总活动分钟',
    creKeys: ['targetDay.activities'],
    canonical: true,
  },
  'derived.day.scheduleDensity': {
    contextKey: 'derived.day.scheduleDensity',
    domain: 'DERIVED',
    serviceKey: 'DERIVE',
    labelZh: '日程密度',
    creKeys: ['targetDay.activities'],
    canonical: true,
  },
  'derived.day.bufferMinutes': {
    contextKey: 'derived.day.bufferMinutes',
    domain: 'DERIVED',
    serviceKey: 'DERIVE',
    labelZh: '当日缓冲分钟',
    creKeys: ['targetDay.activities', 'routeTravelTimes'],
    canonical: true,
  },
  /** 仅能由用户提供 */
  'user.currentFatigue': {
    contextKey: 'user.currentFatigue',
    domain: 'MEMBER',
    serviceKey: 'USER',
    labelZh: '当前疲劳（需用户确认）',
    canonical: false,
  },
  'user.earlyStartWillingness': {
    contextKey: 'user.earlyStartWillingness',
    domain: 'DECISION',
    serviceKey: 'USER',
    labelZh: '是否愿意早出发',
    canonical: false,
  },
};

export function isRegisteredObservationKey(key: string): boolean {
  return Object.prototype.hasOwnProperty.call(OBSERVATION_CAPABILITY_REGISTRY, key);
}

export function getObservationCapability(key: string): ObservationCapability | undefined {
  return OBSERVATION_CAPABILITY_REGISTRY[key];
}

export function assertObservationKeysRegistered(keys: string[]): string[] {
  return keys.filter((k) => !isRegisteredObservationKey(k));
}

/** CRE 字段 → Registry keys（多对一时取主观察键） */
export function creKeyToObservationKeys(creKey: string): string[] {
  const hits: string[] = [];
  for (const cap of Object.values(OBSERVATION_CAPABILITY_REGISTRY)) {
    if (cap.creKeys?.includes(creKey)) hits.push(cap.contextKey);
  }
  if (hits.length === 0 && isRegisteredObservationKey(creKey)) return [creKey];
  return hits;
}

/**
 * Overall Trip Readiness — 权重模板
 * IS / CN 自驾分模板；其它自驾用 SELF_DRIVE_*（不再把非冰岛当成 DEFAULT）
 */

import type {
  DimensionWeightMap,
  OverallReadinessFactInput,
  ReadinessWeightTemplateId,
} from '../types/overall-trip-readiness.types';

export const READINESS_WEIGHT_TEMPLATES: Record<
  ReadinessWeightTemplateId,
  DimensionWeightMap
> = {
  DEFAULT: {
    route: 0.25,
    accommodation: 0.2,
    transport: 0.2,
    activity: 0.2,
    member: 0.15,
  },
  ICELAND_SELF_DRIVE_SOLO: {
    route: 0.3,
    accommodation: 0.2,
    transport: 0.25,
    activity: 0.15,
    member: 0.1,
  },
  ICELAND_SELF_DRIVE_GROUP: {
    route: 0.28,
    accommodation: 0.2,
    transport: 0.22,
    activity: 0.15,
    member: 0.15,
  },
  /** 中国自驾：活动/预约权重略高（分时预约、热门票） */
  CHINA_SELF_DRIVE_SOLO: {
    route: 0.28,
    accommodation: 0.2,
    transport: 0.22,
    activity: 0.2,
    member: 0.1,
  },
  CHINA_SELF_DRIVE_GROUP: {
    route: 0.26,
    accommodation: 0.2,
    transport: 0.2,
    activity: 0.18,
    member: 0.16,
  },
  SELF_DRIVE_SOLO: {
    route: 0.28,
    accommodation: 0.2,
    transport: 0.24,
    activity: 0.18,
    member: 0.1,
  },
  SELF_DRIVE_GROUP: {
    route: 0.26,
    accommodation: 0.2,
    transport: 0.22,
    activity: 0.16,
    member: 0.16,
  },
  CITY_TRANSIT: {
    route: 0.2,
    accommodation: 0.2,
    transport: 0.2,
    activity: 0.25,
    member: 0.15,
  },
  FAMILY_MULTI_GEN: {
    route: 0.25,
    accommodation: 0.2,
    transport: 0.2,
    activity: 0.15,
    member: 0.2,
  },
};

export function resolveWeightTemplateId(
  input: Pick<
    OverallReadinessFactInput,
    'countryCode' | 'isSelfDrive' | 'memberCount'
  >,
): ReadinessWeightTemplateId {
  const country = (input.countryCode ?? '').toUpperCase();
  const selfDrive = input.isSelfDrive === true;
  const members = Math.max(1, input.memberCount || 1);
  const group = members > 1;

  if (selfDrive && country === 'IS') {
    return group ? 'ICELAND_SELF_DRIVE_GROUP' : 'ICELAND_SELF_DRIVE_SOLO';
  }
  if (selfDrive && country === 'CN') {
    return group ? 'CHINA_SELF_DRIVE_GROUP' : 'CHINA_SELF_DRIVE_SOLO';
  }
  if (selfDrive) {
    return group ? 'SELF_DRIVE_GROUP' : 'SELF_DRIVE_SOLO';
  }

  return 'DEFAULT';
}

export function resolveWeights(
  templateId: ReadinessWeightTemplateId,
): DimensionWeightMap {
  return { ...READINESS_WEIGHT_TEMPLATES[templateId] };
}

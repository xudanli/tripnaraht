/**
 * Overall Trip Readiness — 权重模板
 * MVP：DEFAULT + 冰岛自驾（单人/多人）
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
  const selfDrive = input.isSelfDrive !== false;
  const members = Math.max(1, input.memberCount || 1);

  if (country === 'IS' && selfDrive) {
    return members > 1 ? 'ICELAND_SELF_DRIVE_GROUP' : 'ICELAND_SELF_DRIVE_SOLO';
  }

  return 'DEFAULT';
}

export function resolveWeights(
  templateId: ReadinessWeightTemplateId,
): DimensionWeightMap {
  return { ...READINESS_WEIGHT_TEMPLATES[templateId] };
}

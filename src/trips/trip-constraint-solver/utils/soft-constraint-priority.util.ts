/**
 * SOFT 约束 priority ↔ intensity SSOT（与前端 trip-constraints.adapter.ts 对齐）
 */

import type { SoftConstraintPriorityTier } from '../types/travel-decision-contract.types';

export const SOFT_PRIORITY_HIGH = 8;
export const SOFT_PRIORITY_MEDIUM = 5;
export const SOFT_PRIORITY_LOW = 3;

export const SOFT_INTENSITY_HIGH = 85;
export const SOFT_INTENSITY_MEDIUM = 50;
export const SOFT_INTENSITY_LOW = 25;

export function intensityFromPriority(priority: number): number {
  if (priority >= 7) return SOFT_INTENSITY_HIGH;
  if (priority >= 4) return SOFT_INTENSITY_MEDIUM;
  return SOFT_INTENSITY_LOW;
}

export function priorityFromIntensity(intensity: number): number {
  if (intensity >= 70) return SOFT_PRIORITY_HIGH;
  if (intensity >= 37) return SOFT_PRIORITY_MEDIUM;
  return SOFT_PRIORITY_LOW;
}

export function priorityToSoftPriorityTier(priority: number): SoftConstraintPriorityTier {
  if (priority >= 7) return 'HIGH';
  if (priority >= 4) return 'MEDIUM';
  return 'LOW';
}

export function resolveSoftPriority(explicit?: number, defaultPriority = SOFT_PRIORITY_MEDIUM): number {
  if (typeof explicit === 'number' && Number.isFinite(explicit)) {
    return Math.min(10, Math.max(1, Math.round(explicit)));
  }
  return defaultPriority;
}

export function applySoftPriorityToValue(
  value: Record<string, unknown>,
  priority: number,
): Record<string, unknown> {
  return {
    ...value,
    intensity: intensityFromPriority(priority),
  };
}

export function normalizeSoftPriorityPatch(input: {
  priority?: number;
  value?: unknown;
  defaultPriority?: number;
}): { priority: number; value: Record<string, unknown> } {
  const base =
    input.value && typeof input.value === 'object'
      ? { ...(input.value as Record<string, unknown>) }
      : {};
  const explicitIntensity =
    typeof base.intensity === 'number' && Number.isFinite(base.intensity)
      ? Math.round(base.intensity)
      : undefined;
  const explicitPriority =
    typeof input.priority === 'number' && Number.isFinite(input.priority)
      ? Math.round(input.priority)
      : undefined;

  let priority: number;
  if (explicitPriority != null && explicitIntensity != null) {
    const tierFromPriority = priorityToSoftPriorityTier(explicitPriority);
    const tierFromIntensity = priorityToSoftPriorityTier(priorityFromIntensity(explicitIntensity));
    priority =
      tierFromPriority === tierFromIntensity
        ? explicitPriority
        : explicitPriority;
  } else if (explicitPriority != null) {
    priority = resolveSoftPriority(explicitPriority, input.defaultPriority);
  } else if (explicitIntensity != null) {
    priority = priorityFromIntensity(explicitIntensity);
  } else {
    priority = resolveSoftPriority(undefined, input.defaultPriority);
  }

  return {
    priority,
    value: applySoftPriorityToValue(base, priority),
  };
}

export function softConstraintWeight(priority: number): number {
  return priority / 10;
}

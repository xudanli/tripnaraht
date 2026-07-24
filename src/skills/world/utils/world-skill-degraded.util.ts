/**
 * Explicit degraded markers for world skills when dependencies are missing.
 * Prevents orchestrators from treating empty fallback payloads as "no risk".
 */

export interface SkillDegradedFields {
  degraded?: boolean;
  degradedReason?: string;
}

export function markWorldSkillDegraded<T extends Record<string, unknown>>(
  payload: T,
  reason: string,
): T & SkillDegradedFields {
  return {
    ...payload,
    degraded: true,
    degradedReason: reason,
  };
}

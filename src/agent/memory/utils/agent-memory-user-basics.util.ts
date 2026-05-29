import type { AgentMemoryUserBasics } from '../interfaces/agent-memory-context.interface';

function asStrArray(x: unknown): string[] | undefined {
  if (!Array.isArray(x) || x.length === 0) return undefined;
  const out = x.filter((v): v is string => typeof v === 'string' && v.trim().length > 0).map(v => v.trim());
  return out.length ? out : undefined;
}

function asIsoCountry(x: unknown): string | undefined {
  if (typeof x !== 'string') return undefined;
  const t = x.trim().toUpperCase();
  return t.length >= 2 && t.length <= 3 ? t : undefined;
}

/**
 * 从 `UserProfile.preferences`（Prisma JSON）抽取 L0 静态偏好，供 `AgentMemoryContext.userBasics` 使用。
 * 与 `UserTravelProfile`（L1）物理分离，仅在装配层聚合。
 */
export function extractAgentMemoryUserBasicsFromPreferences(
  preferences: unknown,
  profilePreferencesUpdatedAt?: string,
): AgentMemoryUserBasics | null {
  if (!preferences || typeof preferences !== 'object' || Array.isArray(preferences)) {
    return null;
  }
  const p = preferences as Record<string, unknown>;
  const nationality = asIsoCountry(p.nationality);
  const residencyCountry = asIsoCountry(p.residencyCountry);
  const tags = asStrArray(p.tags);
  const preferredAttractionTypes = asStrArray(p.preferredAttractionTypes);
  const dietaryRestrictions = asStrArray(p.dietaryRestrictions);

  if (
    !nationality &&
    !residencyCountry &&
    !tags &&
    !preferredAttractionTypes &&
    !dietaryRestrictions
  ) {
    return null;
  }

  return Object.freeze({
    ...(nationality ? { nationality } : {}),
    ...(residencyCountry ? { residencyCountry } : {}),
    ...(tags ? { tags } : {}),
    ...(preferredAttractionTypes ? { preferredAttractionTypes } : {}),
    ...(dietaryRestrictions ? { dietaryRestrictions } : {}),
    ...(profilePreferencesUpdatedAt ? { profilePreferencesUpdatedAt } : {}),
  }) as AgentMemoryUserBasics;
}

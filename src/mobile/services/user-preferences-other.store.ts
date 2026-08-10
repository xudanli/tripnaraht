import { BadRequestException, Injectable } from '@nestjs/common';
import { PrismaService } from '../../prisma/prisma.service';
import { toInputJsonValue } from '../../trips/budget-os/utils/prisma-json.util';

const UUID_RE =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

function isUuid(value: string): boolean {
  return UUID_RE.test(value);
}

@Injectable()
export class UserPreferencesOtherStore {
  constructor(private readonly prisma: PrismaService) {}

  async readOther(userId: string): Promise<{
    preferences: Record<string, unknown>;
    other: Record<string, unknown>;
    updatedAt: Date | null;
  }> {
    // Soft-auth / preview owners (e.g. anonymous-dev-user) are not DB users.
    if (!isUuid(userId)) {
      return { preferences: {}, other: {}, updatedAt: null };
    }
    const profile = await this.prisma.userProfile.findUnique({ where: { userId } });
    const preferences = ((profile?.preferences as Record<string, unknown> | null) ??
      {}) as Record<string, unknown>;
    const other = ((preferences.other as Record<string, unknown> | undefined) ??
      {}) as Record<string, unknown>;
    return { preferences, other, updatedAt: profile?.updatedAt ?? null };
  }

  async readKey<T = unknown>(userId: string, key: string): Promise<{
    value: T | undefined;
    preferences: Record<string, unknown>;
    other: Record<string, unknown>;
    updatedAt: Date | null;
  }> {
    const { preferences, other, updatedAt } = await this.readOther(userId);
    return {
      value: other[key] as T | undefined,
      preferences,
      other,
      updatedAt,
    };
  }

  /**
   * Deep-merge `patch` into `preferences.other[key]` and upsert UserProfile.
   * Preserves sibling keys under `other` (emergencyContacts, pushTokens, etc.).
   */
  async mergeKey(
    userId: string,
    key: string,
    patch: Record<string, unknown>,
  ): Promise<{ value: Record<string, unknown>; updatedAt: Date }> {
    if (!isUuid(userId)) {
      throw new BadRequestException('登录后可保存个人中心资料');
    }
    const { preferences, other } = await this.readOther(userId);
    const existing =
      other[key] && typeof other[key] === 'object' && !Array.isArray(other[key])
        ? (other[key] as Record<string, unknown>)
        : {};
    const nextValue = deepMerge(existing, patch);
    const nextPreferences = {
      ...preferences,
      other: {
        ...other,
        [key]: nextValue,
      },
    };

    const profile = await this.prisma.userProfile.upsert({
      where: { userId },
      update: {
        preferences: toInputJsonValue(nextPreferences),
        updatedAt: new Date(),
      },
      create: {
        userId,
        preferences: toInputJsonValue(nextPreferences),
        updatedAt: new Date(),
      },
    });

    return { value: nextValue, updatedAt: profile.updatedAt };
  }
}

export function deepMerge(
  base: Record<string, unknown>,
  patch: Record<string, unknown>,
): Record<string, unknown> {
  const out: Record<string, unknown> = { ...base };
  for (const [k, v] of Object.entries(patch)) {
    if (v === undefined) continue;
    const prev = out[k];
    if (
      v !== null &&
      typeof v === 'object' &&
      !Array.isArray(v) &&
      prev !== null &&
      typeof prev === 'object' &&
      !Array.isArray(prev)
    ) {
      out[k] = deepMerge(prev as Record<string, unknown>, v as Record<string, unknown>);
    } else {
      out[k] = v;
    }
  }
  return out;
}

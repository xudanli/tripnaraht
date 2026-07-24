import { BadRequestException, Injectable } from '@nestjs/common';
import { PrismaService } from '../../prisma/prisma.service';
import { toInputJsonValue } from '../../trips/budget-os/utils/prisma-json.util';
import type {
  MobilePushPlatform,
  PushTokenRecordDto,
  RegisterPushTokenRequestDto,
  RegisterPushTokenResponseDto,
} from '../dto/mobile-push.dto';
import { MOBILE_PUSH_PLATFORMS, MOBILE_PUSH_TOKENS_PREFERENCES_KEY } from '../dto/mobile-push.dto';

@Injectable()
export class MobilePushTokenService {
  constructor(private readonly prisma: PrismaService) {}

  async registerToken(
    userId: string,
    body: RegisterPushTokenRequestDto,
  ): Promise<RegisterPushTokenResponseDto> {
    const token = body.token?.trim();
    const deviceId = body.deviceId?.trim();
    const platform = body.platform;

    if (!token || token.length < 32) {
      throw new BadRequestException('token 无效');
    }
    if (!deviceId) {
      throw new BadRequestException('deviceId 不能为空');
    }
    if (!MOBILE_PUSH_PLATFORMS.includes(platform)) {
      throw new BadRequestException('platform 必须是 ios | android');
    }

    const updatedAt = new Date().toISOString();
    const record: PushTokenRecordDto = {
      deviceId,
      token,
      platform,
      appVersion: body.appVersion?.trim() || undefined,
      updatedAt,
    };

    const profile = await this.prisma.userProfile.findUnique({ where: { userId } });
    const preferences = ((profile?.preferences as Record<string, unknown> | null) ?? {}) as Record<
      string,
      unknown
    >;
    const other = ((preferences.other as Record<string, unknown> | undefined) ?? {}) as Record<
      string,
      unknown
    >;
    const existing = sanitizeTokenList(other[MOBILE_PUSH_TOKENS_PREFERENCES_KEY]);
    const next = [...existing.filter((t) => t.deviceId !== deviceId), record];

    const nextPreferences = {
      ...preferences,
      other: {
        ...other,
        [MOBILE_PUSH_TOKENS_PREFERENCES_KEY]: next,
      },
    };

    await this.prisma.userProfile.upsert({
      where: { userId },
      update: { preferences: toInputJsonValue(nextPreferences), updatedAt: new Date() },
      create: { userId, preferences: toInputJsonValue(nextPreferences), updatedAt: new Date() },
    });

    return { registered: true, deviceId, platform, updatedAt };
  }

  async unregisterToken(userId: string, deviceId: string): Promise<{ removed: boolean }> {
    const id = deviceId?.trim();
    if (!id) throw new BadRequestException('deviceId 不能为空');

    const profile = await this.prisma.userProfile.findUnique({ where: { userId } });
    if (!profile?.preferences) return { removed: false };

    const preferences = profile.preferences as Record<string, unknown>;
    const other = (preferences.other as Record<string, unknown> | undefined) ?? {};
    const existing = sanitizeTokenList(other[MOBILE_PUSH_TOKENS_PREFERENCES_KEY]);
    const next = existing.filter((t) => t.deviceId !== id);
    if (next.length === existing.length) return { removed: false };

    await this.prisma.userProfile.update({
      where: { userId },
      data: {
        preferences: toInputJsonValue({
          ...preferences,
          other: { ...other, [MOBILE_PUSH_TOKENS_PREFERENCES_KEY]: next },
        }),
        updatedAt: new Date(),
      },
    });
    return { removed: true };
  }

  async listTokensForUsers(userIds: string[]): Promise<Array<{ userId: string; token: PushTokenRecordDto }>> {
    if (!userIds.length) return [];
    const profiles = await this.prisma.userProfile.findMany({
      where: { userId: { in: userIds } },
      select: { userId: true, preferences: true },
    });

    const rows: Array<{ userId: string; token: PushTokenRecordDto }> = [];
    for (const profile of profiles) {
      const preferences = (profile.preferences as Record<string, unknown> | null) ?? {};
      const other = (preferences.other as Record<string, unknown> | undefined) ?? {};
      for (const token of sanitizeTokenList(other[MOBILE_PUSH_TOKENS_PREFERENCES_KEY])) {
        if (token.platform === 'ios') {
          rows.push({ userId: profile.userId, token });
        }
      }
    }
    return rows;
  }
}

function sanitizeTokenList(raw: unknown): PushTokenRecordDto[] {
  if (!Array.isArray(raw)) return [];
  return raw
    .filter((item) => item && typeof item === 'object')
    .map((item) => {
      const row = item as Record<string, unknown>;
      return {
        deviceId: String(row.deviceId ?? ''),
        token: String(row.token ?? ''),
        platform: (row.platform === 'android' ? 'android' : 'ios') as MobilePushPlatform,
        appVersion: typeof row.appVersion === 'string' ? row.appVersion : undefined,
        updatedAt: String(row.updatedAt ?? new Date().toISOString()),
      };
    })
    .filter((t) => t.deviceId && t.token);
}

import { Injectable, ServiceUnavailableException } from '@nestjs/common';
import { DateTime } from 'luxon';
import { PrismaService } from '../../../prisma/prisma.service';
import type { CommsSummaryResult } from '../types/in-trip-comms.types';
import { buildCommsSummaryBullets } from '../utils/comms-summary.util';
import { toIntercomMessageDto } from '../utils/comms-message-mapper.util';
import { isInTripCommsEnabled } from '../utils/in-trip-comms-config.util';
import { AnchorHandoffService } from './anchor-handoff.service';
import { InTripAccessService } from './in-trip-access.service';

type CacheEntry = { expiresAt: number; value: CommsSummaryResult };

@Injectable()
export class InTripCommsSummaryService {
  private readonly cache = new Map<string, CacheEntry>();

  constructor(
    private readonly prisma: PrismaService,
    private readonly access: InTripAccessService,
    private readonly anchorHandoff: AnchorHandoffService,
  ) {}

  async getSummary(
    tripId: string,
    userId: string,
    query: { since?: string; maxBullets?: number; lang?: string; refresh?: boolean },
  ): Promise<CommsSummaryResult> {
    this.assertCommsEnabled();
    await this.access.assertInTripPhase(tripId);
    await this.access.assertTripMember(tripId, userId);

    const now = DateTime.now();
    const windowEnd = now;
    const windowStart = query.since
      ? DateTime.fromISO(query.since)
      : now.minus({ hours: 24 });
    if (query.since && !windowStart.isValid) {
      return this.degraded(
        tripId,
        now.minus({ hours: 24 }).toISO()!,
        windowEnd.toISO()!,
      );
    }

    const maxBullets = Math.min(Math.max(1, query.maxBullets ?? 5), 10);
    const cacheKey = `${tripId}:${windowStart.toUTC().toISO()}:${maxBullets}:${query.lang ?? 'zh'}`;
    if (!query.refresh) {
      const cached = this.cache.get(cacheKey);
      if (cached && cached.expiresAt > Date.now()) {
        return cached.value;
      }
    }

    const rows = await this.prisma.tripInTripCommsMessage.findMany({
      where: {
        tripId,
        serverCreatedAt: {
          gte: windowStart.toJSDate(),
          lte: windowEnd.toJSDate(),
        },
      },
      orderBy: { serverCreatedAt: 'asc' },
      take: 200,
    });

    const nameMap = await this.resolveMemberNameMap(tripId);
    const messages = rows.map((r) => toIntercomMessageDto(r, nameMap.get(r.senderId)));
    const { bullets, sourceMessageIds } = buildCommsSummaryBullets(messages, maxBullets, nameMap);

    const result: CommsSummaryResult = {
      tripId,
      generatedAt: now.toISO()!,
      windowStart: windowStart.toISO()!,
      windowEnd: windowEnd.toISO()!,
      bullets,
      sourceMessageIds,
      degraded: bullets.length === 0,
      reason: bullets.length === 0 ? 'SUMMARY_NO_MESSAGES' : undefined,
    };

    this.cache.set(cacheKey, { expiresAt: Date.now() + 15 * 60 * 1000, value: result });
    return result;
  }

  private degraded(tripId: string, windowStart: string, windowEnd: string): CommsSummaryResult {
    return {
      tripId,
      generatedAt: new Date().toISOString(),
      windowStart,
      windowEnd,
      bullets: [],
      degraded: true,
      reason: 'SUMMARY_PROVIDER_UNAVAILABLE',
    };
  }

  private async resolveMemberNameMap(tripId: string): Promise<Map<string, string>> {
    const snapshot = await this.anchorHandoff.getSnapshot(tripId);
    const map = new Map<string, string>();
    for (const m of snapshot?.team?.members ?? []) {
      map.set(m.userId, m.displayName);
    }
    return map;
  }

  private assertCommsEnabled(): void {
    if (!isInTripCommsEnabled()) {
      throw new ServiceUnavailableException({
        code: 'COMMS_EXECUTION_DISABLED',
        message: '行中团队对讲未启用',
      });
    }
  }
}

import { Injectable, Logger } from '@nestjs/common';
import { PrismaService } from '../../../prisma/prisma.service';
import type { TripExecutionRiskUserStateRecord } from '../types/execution-risk.types';

/** In-memory fallback when DB table is not yet migrated */
const memoryStore = new Map<string, TripExecutionRiskUserStateRecord>();

function storeKey(tripId: string, riskKey: string, userId: string): string {
  return `${tripId}:${riskKey}:${userId}`;
}

@Injectable()
export class ExecutionRiskUserStateService {
  private readonly logger = new Logger(ExecutionRiskUserStateService.name);
  private prismaAvailable = true;

  constructor(private readonly prisma: PrismaService) {}

  async listForTripUser(tripId: string, userId: string): Promise<TripExecutionRiskUserStateRecord[]> {
    if (this.prismaAvailable) {
      try {
        const rows = await this.prisma.tripExecutionRiskUserState.findMany({
          where: { tripId, userId },
        });
        return rows.map((r) => ({
          tripId: r.tripId,
          riskKey: r.riskKey,
          userId: r.userId,
          acknowledgedAt: r.acknowledgedAt?.toISOString(),
          acknowledgedBy: r.acknowledgedBy ?? undefined,
          snoozedUntil: r.snoozedUntil?.toISOString(),
          dismissedAt: r.dismissedAt?.toISOString(),
          lastViewedAt: r.lastViewedAt?.toISOString(),
        }));
      } catch (e) {
        this.prismaAvailable = false;
        this.logger.warn(`TripExecutionRiskUserState unavailable, using memory store: ${String(e)}`);
      }
    }
    return [...memoryStore.values()].filter((s) => s.tripId === tripId && s.userId === userId);
  }

  async get(tripId: string, riskKey: string, userId: string): Promise<TripExecutionRiskUserStateRecord | undefined> {
    const all = await this.listForTripUser(tripId, userId);
    return all.find((s) => s.riskKey === riskKey);
  }

  async acknowledge(
    tripId: string,
    riskKey: string,
    userId: string,
    opts?: { snoozeUntil?: string },
  ): Promise<TripExecutionRiskUserStateRecord> {
    const now = new Date();
    const record: TripExecutionRiskUserStateRecord = {
      tripId,
      riskKey,
      userId,
      acknowledgedAt: now.toISOString(),
      acknowledgedBy: userId,
      snoozedUntil: opts?.snoozeUntil,
      lastViewedAt: now.toISOString(),
    };

    if (this.prismaAvailable) {
      try {
        const row = await this.prisma.tripExecutionRiskUserState.upsert({
          where: { tripId_riskKey_userId: { tripId, riskKey, userId } },
          create: {
            tripId,
            riskKey,
            userId,
            acknowledgedAt: now,
            acknowledgedBy: userId,
            snoozedUntil: opts?.snoozeUntil ? new Date(opts.snoozeUntil) : null,
            lastViewedAt: now,
          },
          update: {
            acknowledgedAt: now,
            acknowledgedBy: userId,
            snoozedUntil: opts?.snoozeUntil ? new Date(opts.snoozeUntil) : null,
            lastViewedAt: now,
          },
        });
        return {
          tripId: row.tripId,
          riskKey: row.riskKey,
          userId: row.userId,
          acknowledgedAt: row.acknowledgedAt?.toISOString(),
          acknowledgedBy: row.acknowledgedBy ?? undefined,
          snoozedUntil: row.snoozedUntil?.toISOString(),
          dismissedAt: row.dismissedAt?.toISOString(),
          lastViewedAt: row.lastViewedAt?.toISOString(),
        };
      } catch (e) {
        this.prismaAvailable = false;
        this.logger.warn(`TripExecutionRiskUserState upsert failed, using memory: ${String(e)}`);
      }
    }

    memoryStore.set(storeKey(tripId, riskKey, userId), record);
    return record;
  }

  async markViewed(tripId: string, riskKey: string, userId: string): Promise<void> {
    const existing = await this.get(tripId, riskKey, userId);
    if (existing?.acknowledgedAt) return;

    const now = new Date().toISOString();
    if (this.prismaAvailable) {
      try {
        await this.prisma.tripExecutionRiskUserState.upsert({
          where: { tripId_riskKey_userId: { tripId, riskKey, userId } },
          create: { tripId, riskKey, userId, lastViewedAt: new Date(now) },
          update: { lastViewedAt: new Date(now) },
        });
        return;
      } catch {
        this.prismaAvailable = false;
      }
    }
    memoryStore.set(storeKey(tripId, riskKey, userId), {
      tripId,
      riskKey,
      userId,
      lastViewedAt: now,
    });
  }

  /** Test helper */
  static clearMemoryStore(): void {
    memoryStore.clear();
  }
}

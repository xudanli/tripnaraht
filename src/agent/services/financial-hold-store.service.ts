import { Injectable, Optional } from '@nestjs/common';
import { PrismaService } from '../../prisma/prisma.service';

export type FinancialHoldRecord = {
  hold_id: string;
  action_id: string;
  action_name: string;
  trip_id: string;
  request_id: string;
  expires_at: string; // ISO
  /** Monetary amount is not persisted on `AgentFinancialHold` today; reserved for admin UI. */
  amount?: number | null;
  currency?: string | null;
};

function mapPrismaRow(row: {
  holdId: string;
  actionId: string;
  actionName: string;
  tripId: string;
  requestId: string;
  amount?: number | null;
  currency?: string | null;
  expiresAt: Date;
}): FinancialHoldRecord {
  return {
    hold_id: row.holdId,
    action_id: row.actionId,
    action_name: row.actionName,
    trip_id: row.tripId,
    request_id: row.requestId,
    ...(row.amount !== undefined ? { amount: row.amount ?? null } : {}),
    ...(row.currency !== undefined ? { currency: row.currency ?? null } : {}),
    expires_at: row.expiresAt.toISOString(),
  };
}

/**
 * Persists FINANCIAL_HOLD records for monitor/expire APIs.
 * When Prisma is connected, uses table `agent_financial_holds`; otherwise in-memory Map (dev/MCP fallback).
 */
@Injectable()
export class FinancialHoldStoreService {
  private readonly fallbackHolds = new Map<string, FinancialHoldRecord>();

  constructor(@Optional() private readonly prisma?: PrismaService) {}

  private useDb(): boolean {
    return Boolean(this.prisma?.isDbConnected());
  }

  private pruneFallback(now = Date.now()): void {
    for (const [id, r] of this.fallbackHolds.entries()) {
      const exp = Date.parse(r.expires_at);
      if (!Number.isFinite(exp) || exp <= now) this.fallbackHolds.delete(id);
    }
  }

  async upsert(rec: FinancialHoldRecord): Promise<void> {
    const exp = Date.parse(rec.expires_at);
    if (!Number.isFinite(exp)) return;
    const expiresAt = new Date(exp);

    if (!this.useDb()) {
      this.pruneFallback();
      this.fallbackHolds.set(rec.hold_id, rec);
      return;
    }

    await this.prisma!.agentFinancialHold.upsert({
      where: { holdId: rec.hold_id },
      create: {
        holdId: rec.hold_id,
        actionId: rec.action_id,
        actionName: rec.action_name,
        tripId: rec.trip_id,
        requestId: rec.request_id,
        amount: rec.amount ?? null,
        currency: rec.currency ?? null,
        expiresAt,
      },
      update: {
        actionId: rec.action_id,
        actionName: rec.action_name,
        tripId: rec.trip_id,
        requestId: rec.request_id,
        amount: rec.amount ?? null,
        currency: rec.currency ?? null,
        expiresAt,
      },
    });
  }

  async get(hold_id: string): Promise<FinancialHoldRecord | undefined> {
    if (!this.useDb()) {
      this.pruneFallback();
      return this.fallbackHolds.get(hold_id);
    }
    const row = await this.prisma!.agentFinancialHold.findUnique({
      where: { holdId: hold_id },
    });
    if (!row) return undefined;
    if (row.expiresAt.getTime() <= Date.now()) {
      await this.prisma!.agentFinancialHold.delete({ where: { holdId: hold_id } }).catch(() => undefined);
      return undefined;
    }
    return mapPrismaRow(row);
  }

  async listByTrip(trip_id: string): Promise<FinancialHoldRecord[]> {
    if (!this.useDb()) {
      this.pruneFallback();
      return Array.from(this.fallbackHolds.values()).filter((h) => h.trip_id === trip_id);
    }
    const now = new Date();
    await this.prisma!.agentFinancialHold.deleteMany({
      where: { tripId: trip_id, expiresAt: { lte: now } },
    });
    const rows = await this.prisma!.agentFinancialHold.findMany({
      where: { tripId: trip_id, expiresAt: { gt: now } },
      orderBy: { expiresAt: 'asc' },
    });
    return rows.map(mapPrismaRow);
  }

  /** All non-expired holds (admin). */
  async listAllActiveHolds(): Promise<Array<FinancialHoldRecord & { remaining_ttl_ms: number }>> {
    const now = Date.now();
    if (!this.useDb()) {
      this.pruneFallback();
      return Array.from(this.fallbackHolds.values())
        .filter((h) => Date.parse(h.expires_at) > now)
        .map((h) => ({
          ...h,
          amount: h.amount ?? null,
          currency: h.currency ?? null,
          remaining_ttl_ms: Math.max(0, Date.parse(h.expires_at) - now),
        }))
        .sort((a, b) => Date.parse(a.expires_at) - Date.parse(b.expires_at));
    }
    const nowDate = new Date();
    await this.prisma!.agentFinancialHold.deleteMany({ where: { expiresAt: { lte: nowDate } } });
    const rows = await this.prisma!.agentFinancialHold.findMany({
      where: { expiresAt: { gt: nowDate } },
      orderBy: { expiresAt: 'asc' },
    });
    return rows.map((row: any) => {
      const base = mapPrismaRow(row);
      const exp = row.expiresAt.getTime();
      return { ...base, amount: base.amount ?? null, currency: base.currency ?? null, remaining_ttl_ms: Math.max(0, exp - now) };
    });
  }

  async expire(hold_id: string): Promise<boolean> {
    if (!this.useDb()) {
      return this.fallbackHolds.delete(hold_id);
    }
    const r = await this.prisma!.agentFinancialHold.deleteMany({
      where: { holdId: hold_id },
    });
    return r.count > 0;
  }
}

import { Injectable, Logger, Optional } from '@nestjs/common';
import type { Prisma } from '@prisma/client';
import { PrismaService } from '../../prisma/prisma.service';
import type { TravelContextDiff } from './travel-context-diff.util';

const MAX_ENTRIES_PER_CONTEXT = 64;

export interface TravelContextJournalRecordMeta {
  snapshotId?: string;
  intentType?: string;
}

function useMemoryJournalOnly(): boolean {
  const flag = process.env.TRAVEL_CONTEXT_JOURNAL_MEMORY?.trim();
  return flag === '1' || flag === 'true' || flag === 'yes';
}

function chainFromEntries(
  entries: TravelContextDiff[],
  sinceRevision: number,
  currentRevision: number,
): TravelContextDiff[] | null {
  if (sinceRevision >= currentRevision) return [];

  const sorted = [...entries].sort((a, b) => a.fromRevision - b.fromRevision);
  const chain: TravelContextDiff[] = [];
  let expectedFrom = sinceRevision;

  for (const entry of sorted) {
    if (entry.fromRevision !== expectedFrom) continue;
    chain.push(entry);
    expectedFrom = entry.toRevision;
    if (expectedFrom === currentRevision) {
      return chain;
    }
  }

  return null;
}

function memoryRecord(store: Map<string, TravelContextDiff[]>, diff: TravelContextDiff): void {
  if (diff.fromRevision === diff.toRevision) return;

  const list = store.get(diff.contextId) ?? [];
  if (list.some((e) => e.fromRevision === diff.fromRevision && e.toRevision === diff.toRevision)) {
    return;
  }
  list.push(diff);
  if (list.length > MAX_ENTRIES_PER_CONTEXT) {
    list.splice(0, list.length - MAX_ENTRIES_PER_CONTEXT);
  }
  store.set(diff.contextId, list);
}

@Injectable()
export class TravelContextRevisionJournalService {
  private readonly logger = new Logger(TravelContextRevisionJournalService.name);
  private readonly memoryStore = new Map<string, TravelContextDiff[]>();

  constructor(@Optional() private readonly prisma?: PrismaService) {}

  async record(diff: TravelContextDiff, meta?: TravelContextJournalRecordMeta): Promise<void> {
    if (diff.fromRevision === diff.toRevision) return;

    memoryRecord(this.memoryStore, diff);

    if (!this.prisma || useMemoryJournalOnly()) {
      return;
    }

    try {
      await this.prisma.travelContextRevisionJournalEntry.create({
        data: {
          contextId: diff.contextId,
          fromRevision: BigInt(diff.fromRevision),
          toRevision: BigInt(diff.toRevision),
          snapshotId: meta?.snapshotId ?? null,
          changedDomains: diff.changedDomains as unknown as Prisma.InputJsonValue,
          changes: diff.changes as unknown as Prisma.InputJsonValue,
          intentType: meta?.intentType ?? null,
        },
      });
      await this.pruneOldEntries(diff.contextId);
    } catch (err: unknown) {
      const code = (err as { code?: string })?.code;
      if (code === 'P2002') {
        return;
      }
      this.logger.warn(
        `Failed to persist revision journal for ${diff.contextId}: ${String(err)}`,
      );
    }
  }

  async resolveChain(
    contextId: string,
    sinceRevision: number,
    currentRevision: number,
  ): Promise<TravelContextDiff[] | null> {
    const memoryChain = chainFromEntries(
      this.memoryStore.get(contextId) ?? [],
      sinceRevision,
      currentRevision,
    );
    if (memoryChain !== null) {
      return memoryChain;
    }

    if (!this.prisma || useMemoryJournalOnly()) {
      return null;
    }

    try {
      const rows = await this.prisma.travelContextRevisionJournalEntry.findMany({
        where: {
          contextId,
          fromRevision: { gte: BigInt(sinceRevision) },
          toRevision: { lte: BigInt(currentRevision) },
        },
        orderBy: { fromRevision: 'asc' },
        take: MAX_ENTRIES_PER_CONTEXT * 2,
      });

      const entries: TravelContextDiff[] = rows.map((row) => ({
        contextId: row.contextId,
        fromRevision: Number(row.fromRevision),
        toRevision: Number(row.toRevision),
        changedDomains: row.changedDomains as TravelContextDiff['changedDomains'],
        changes: row.changes as unknown as TravelContextDiff['changes'],
      }));

      for (const entry of entries) {
        memoryRecord(this.memoryStore, entry);
      }

      return chainFromEntries(entries, sinceRevision, currentRevision);
    } catch (err) {
      this.logger.warn(`Failed to load revision journal for ${contextId}: ${String(err)}`);
      return null;
    }
  }

  async clearContext(contextId: string): Promise<void> {
    this.memoryStore.delete(contextId);
    if (!this.prisma || useMemoryJournalOnly()) return;
    await this.prisma.travelContextRevisionJournalEntry.deleteMany({ where: { contextId } });
  }

  private async pruneOldEntries(contextId: string): Promise<void> {
    if (!this.prisma) return;

    const excess = await this.prisma.travelContextRevisionJournalEntry.findMany({
      where: { contextId },
      orderBy: { createdAt: 'asc' },
      select: { id: true },
      skip: MAX_ENTRIES_PER_CONTEXT,
    });

    if (excess.length === 0) return;

    await this.prisma.travelContextRevisionJournalEntry.deleteMany({
      where: { id: { in: excess.map((row) => row.id) } },
    });
  }
}

import { Injectable } from '@nestjs/common';
import { PrismaService } from '../../../prisma/prisma.service';
import { toInputJsonValue } from '../../budget-os/utils/prisma-json.util';
import type { HysteresisStoreEntry } from './severity-hysteresis.logic';

const METADATA_KEY = 'executionRiskSeverityHysteresis';
const MAX_ENTRIES_PER_TRIP = 200;

interface StoredSeverityHysteresisBlock {
  byRiskKey: Record<string, HysteresisStoreEntry>;
  lastUpdatedAt?: string;
}

@Injectable()
export class SeverityHysteresisStoreService {
  private readonly cache = new Map<string, Record<string, HysteresisStoreEntry>>();

  constructor(private readonly prisma: PrismaService) {}

  async getEntry(
    tripId: string,
    riskKey: string,
  ): Promise<HysteresisStoreEntry | undefined> {
    const block = await this.readBlock(tripId);
    return block[riskKey];
  }

  async setEntry(
    tripId: string,
    riskKey: string,
    entry: HysteresisStoreEntry,
  ): Promise<void> {
    const block = await this.readBlock(tripId);
    const keys = Object.keys(block);
    const nextBlock = { ...block, [riskKey]: entry };
    if (keys.length >= MAX_ENTRIES_PER_TRIP && !(riskKey in block)) {
      const oldest = keys
        .map((key) => ({ key, updatedAt: block[key]?.updatedAt ?? '' }))
        .sort((a, b) => a.updatedAt.localeCompare(b.updatedAt))[0];
      if (oldest) delete nextBlock[oldest.key];
    }
    this.cache.set(tripId, nextBlock);
    await this.writeBlock(tripId, nextBlock);
  }

  async deleteEntry(tripId: string, riskKey: string): Promise<void> {
    const block = await this.readBlock(tripId);
    if (!(riskKey in block)) return;
    const nextBlock = { ...block };
    delete nextBlock[riskKey];
    this.cache.set(tripId, nextBlock);
    await this.writeBlock(tripId, nextBlock);
  }

  clearCacheForTests(tripId?: string): void {
    if (tripId) this.cache.delete(tripId);
    else this.cache.clear();
  }

  private async readBlock(tripId: string): Promise<Record<string, HysteresisStoreEntry>> {
    const cached = this.cache.get(tripId);
    if (cached) return cached;

    const trip = await this.prisma.trip.findUnique({
      where: { id: tripId },
      select: { metadata: true },
    });
    const meta = ((trip?.metadata ?? {}) as Record<string, unknown>) ?? {};
    const stored = meta[METADATA_KEY] as StoredSeverityHysteresisBlock | undefined;
    const block = stored?.byRiskKey ?? {};
    this.cache.set(tripId, block);
    return block;
  }

  private async writeBlock(
    tripId: string,
    block: Record<string, HysteresisStoreEntry>,
  ): Promise<void> {
    const trip = await this.prisma.trip.findUnique({
      where: { id: tripId },
      select: { metadata: true },
    });
    const meta = ((trip?.metadata ?? {}) as Record<string, unknown>) ?? {};
    await this.prisma.trip.update({
      where: { id: tripId },
      data: {
        metadata: toInputJsonValue({
          ...meta,
          [METADATA_KEY]: {
            byRiskKey: block,
            lastUpdatedAt: new Date().toISOString(),
          },
        }),
      },
    });
  }
}

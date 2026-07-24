/**
 * 冰岛 POI 预约库存同步 — Parka / Bókun → poi_capacity_snapshots
 */

import { Injectable, Logger } from '@nestjs/common';
import { PrismaService } from '../../prisma/prisma.service';
import type { PoiCapacitySnapshot } from '../interfaces/poi-access-capacity.interface';
import type { CapacitySeedFile } from '../providers/parka-capacity.provider';
import { ParkaCapacityProvider } from '../providers/parka-capacity.provider';
import { BokunCapacityProvider } from '../providers/bokun-capacity.provider';

export type CapacitySyncResult = {
  source: string;
  snapshotsUpserted: number;
  poiIds: string[];
};

@Injectable()
export class IcelandCapacitySyncService {
  private readonly logger = new Logger(IcelandCapacitySyncService.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly parka: ParkaCapacityProvider,
    private readonly bokun: BokunCapacityProvider,
  ) {}

  loadSeedFile(): CapacitySeedFile | undefined {
    return this.parka.loadLocalSeed();
  }

  async syncFromSeedFile(): Promise<CapacitySyncResult> {
    const seed = this.loadSeedFile();
    if (!seed?.slots.length) {
      return { source: 'none', snapshotsUpserted: 0, poiIds: [] };
    }

    const poiIds = new Set<string>();
    let count = 0;

    for (const slot of seed.slots) {
      const snap: PoiCapacitySnapshot = {
        poiId: slot.poiId,
        dateISO: slot.dateISO,
        slotStartTime: slot.slotStartTime,
        slotEndTime: slot.slotEndTime,
        remaining: slot.remaining,
        capacity: slot.capacity,
        soldOut: slot.soldOut,
        signalSource: slot.signalSource as PoiCapacitySnapshot['signalSource'],
        observedAt: seed.fetchedAt,
        confidenceScore: slot.signalSource === 'BOKUN' ? 0.8 : 0.75,
      };

      const id = `sync.${slot.poiId}.${slot.dateISO}.${slot.slotStartTime ?? 'day'}`;
      await this.prisma.poiCapacitySnapshot.upsert({
        where: { id },
        create: {
          id,
          poiId: snap.poiId,
          dateISO: snap.dateISO.slice(0, 10),
          slotStartTime: snap.slotStartTime ?? null,
          slotEndTime: snap.slotEndTime ?? null,
          remaining: snap.remaining ?? null,
          capacity: snap.capacity ?? null,
          soldOut: snap.soldOut,
          signalSource: snap.signalSource,
          observedAt: new Date(snap.observedAt),
          confidenceScore: snap.confidenceScore ?? null,
        },
        update: {
          remaining: snap.remaining ?? null,
          capacity: snap.capacity ?? null,
          soldOut: snap.soldOut,
          observedAt: new Date(snap.observedAt),
          confidenceScore: snap.confidenceScore ?? null,
        },
      });
      poiIds.add(slot.poiId);
      count += 1;
    }

    this.logger.log(`库存同步完成: ${count} 条 (${seed.source})`);
    return { source: seed.source, snapshotsUpserted: count, poiIds: [...poiIds] };
  }

  /** 按 POI+日期拉取 Parka + Bókun 并写入 DB */
  async syncPoiDate(poiId: string, dateISO: string): Promise<number> {
    const parkaSnaps = (await this.parka.fetchCapacity({ poiId, dateISO })) ?? [];
    const bokunSnaps = await this.bokun.fetchCapacity(poiId, dateISO);
    const all = [...parkaSnaps, ...bokunSnaps];
    let count = 0;

    for (const snap of all) {
      const id = `sync.${snap.poiId}.${snap.dateISO}.${snap.slotStartTime ?? 'day'}.${snap.signalSource}`;
      await this.prisma.poiCapacitySnapshot.upsert({
        where: { id },
        create: {
          id,
          poiId: snap.poiId,
          dateISO: snap.dateISO.slice(0, 10),
          slotStartTime: snap.slotStartTime ?? null,
          slotEndTime: snap.slotEndTime ?? null,
          remaining: snap.remaining ?? null,
          capacity: snap.capacity ?? null,
          soldOut: snap.soldOut,
          signalSource: snap.signalSource,
          observedAt: new Date(snap.observedAt),
          confidenceScore: snap.confidenceScore ?? null,
        },
        update: {
          remaining: snap.remaining ?? null,
          capacity: snap.capacity ?? null,
          soldOut: snap.soldOut,
          observedAt: new Date(snap.observedAt),
          confidenceScore: snap.confidenceScore ?? null,
        },
      });
      count += 1;
    }
    return count;
  }
}

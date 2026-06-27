/**
 * Bókun 活动/温泉库存 Provider
 */

import { Injectable, Logger } from '@nestjs/common';
import { readFileSync, existsSync } from 'fs';
import { join } from 'path';
import type { PoiCapacitySnapshot } from '../interfaces/poi-access-capacity.interface';
import type { CapacitySeedFile } from './parka-capacity.provider';

@Injectable()
export class BokunCapacityProvider {
  private readonly logger = new Logger(BokunCapacityProvider.name);

  loadLocalSeed(): CapacitySeedFile | undefined {
    const path = join(process.cwd(), 'data/poi-access-capacity/is-capacity-snapshot-seed.json');
    if (!existsSync(path)) return undefined;
    try {
      return JSON.parse(readFileSync(path, 'utf-8')) as CapacitySeedFile;
    } catch {
      return undefined;
    }
  }

  async fetchCapacity(poiId: string, dateISO: string): Promise<PoiCapacitySnapshot[]> {
    const apiKey = process.env.BOKUN_API_KEY;
    if (apiKey) {
      this.logger.warn('Bókun API 集成待供应商合作后实现');
    }

    const seed = this.loadLocalSeed();
    if (!seed) return [];

    const day = dateISO.slice(0, 10);
    return seed.slots
      .filter((s) => s.poiId === poiId && s.dateISO.slice(0, 10) === day)
      .filter((s) => s.signalSource === 'BOKUN')
      .map((s) => ({
        poiId: s.poiId,
        dateISO: s.dateISO,
        slotStartTime: s.slotStartTime,
        slotEndTime: s.slotEndTime,
        remaining: s.remaining,
        capacity: s.capacity,
        soldOut: s.soldOut,
        signalSource: 'BOKUN' as const,
        observedAt: seed.fetchedAt,
        confidenceScore: 0.8,
      }));
  }
}

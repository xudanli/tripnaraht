/**
 * Parka 停车库存 Provider
 */

import { Injectable, Logger } from '@nestjs/common';
import { readFileSync, existsSync } from 'fs';
import { join } from 'path';
import type { PoiCapacitySnapshot } from '../interfaces/poi-access-capacity.interface';

export interface ParkaCapacityQuery {
  poiId: string;
  dateISO: string;
}

export type CapacitySeedFile = {
  fetchedAt: string;
  source: string;
  slots: Array<{
    poiId: string;
    dateISO: string;
    slotStartTime?: string;
    slotEndTime?: string;
    remaining?: number;
    capacity?: number;
    soldOut: boolean;
    signalSource: string;
  }>;
};

@Injectable()
export class ParkaCapacityProvider {
  private readonly logger = new Logger(ParkaCapacityProvider.name);

  loadLocalSeed(): CapacitySeedFile | undefined {
    const path = join(process.cwd(), 'data/poi-access-capacity/is-capacity-snapshot-seed.json');
    if (!existsSync(path)) return undefined;
    try {
      return JSON.parse(readFileSync(path, 'utf-8')) as CapacitySeedFile;
    } catch {
      return undefined;
    }
  }

  async fetchCapacity(query: ParkaCapacityQuery): Promise<PoiCapacitySnapshot[] | undefined> {
    const apiKey = process.env.PARKA_API_KEY;
    if (apiKey) {
      this.logger.warn('Parka API 集成待商业合作完成后实现');
    }

    const seed = this.loadLocalSeed();
    if (!seed) return undefined;

    const day = query.dateISO.slice(0, 10);
    return seed.slots
      .filter((s) => s.poiId === query.poiId && s.dateISO.slice(0, 10) === day)
      .filter((s) => s.signalSource === 'PARKA')
      .map((s) => ({
        poiId: s.poiId,
        dateISO: s.dateISO,
        slotStartTime: s.slotStartTime,
        slotEndTime: s.slotEndTime,
        remaining: s.remaining,
        capacity: s.capacity,
        soldOut: s.soldOut,
        signalSource: 'PARKA' as const,
        observedAt: seed.fetchedAt,
        confidenceScore: 0.75,
      }));
  }
}

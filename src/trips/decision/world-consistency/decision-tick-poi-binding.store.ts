/**
 * Tick-scoped store for POI authority materialization.
 * Not a global World SSOT — latest binding per trip+poi for Decision Tick consumers.
 */

import { Injectable } from '@nestjs/common';
import type { DecisionTickPoiMaterialization } from './poi-authority-bridge.types';
import { applyPoiTickFreshness } from './decision-tick-freshness.util';

@Injectable()
export class DecisionTickPoiBindingStore {
  private readonly byTrip = new Map<
    string,
    Map<string, DecisionTickPoiMaterialization>
  >();

  put(
    materialization: DecisionTickPoiMaterialization,
  ): DecisionTickPoiMaterialization {
    let m = this.byTrip.get(materialization.tripId);
    if (!m) {
      m = new Map();
      this.byTrip.set(materialization.tripId, m);
    }
    m.set(materialization.poiId, materialization);
    return materialization;
  }

  get(tripId: string, poiId: string): DecisionTickPoiMaterialization | undefined {
    const raw = this.byTrip.get(tripId)?.get(poiId.trim().toLowerCase());
    return raw ? applyPoiTickFreshness(raw) : undefined;
  }

  listForTrip(tripId: string): DecisionTickPoiMaterialization[] {
    const m = this.byTrip.get(tripId);
    if (!m) return [];
    return [...m.values()].map((x) => applyPoiTickFreshness(x));
  }

  /** Most recently put for trip (insertion order of Map). */
  getLatest(tripId: string): DecisionTickPoiMaterialization | undefined {
    const list = this.listForTrip(tripId);
    return list.length ? list[list.length - 1] : undefined;
  }

  clear(tripId: string): void {
    this.byTrip.delete(tripId);
  }
}

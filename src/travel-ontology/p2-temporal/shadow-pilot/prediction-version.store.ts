/**
 * ONT-P2-01 — prediction version store with supersession
 */

import type { PredictionRecord } from '../contracts';
import type {
  PredictionLifecycleStatus,
  StoredShadowPrediction,
} from './weather-shadow-pilot.types';

function key(tripId: string, regionId: string): string {
  return `${tripId}::${regionId.toUpperCase()}`;
}

export class ShadowPredictionVersionStore {
  private readonly byKey = new Map<string, StoredShadowPrediction[]>();

  list(tripId: string, regionId: string): StoredShadowPrediction[] {
    return [...(this.byKey.get(key(tripId, regionId)) ?? [])];
  }

  active(tripId: string, regionId: string): StoredShadowPrediction | undefined {
    return this.list(tripId, regionId).find((p) => p.status === 'ACTIVE');
  }

  /**
   * Insert new prediction; previous ACTIVE → SUPERSEDED (version replacement).
   */
  publish(input: {
    record: PredictionRecord;
    at: string;
  }): { current: StoredShadowPrediction; superseded?: StoredShadowPrediction } {
    const tripId = input.record.tripId ?? 'unknown';
    const regionId = input.record.regionId;
    const k = key(tripId, regionId);
    const hist = this.byKey.get(k) ?? [];
    let superseded: StoredShadowPrediction | undefined;
    const nextHist = hist.map((p) => {
      if (p.status === 'ACTIVE') {
        superseded = {
          ...p,
          status: 'SUPERSEDED' as PredictionLifecycleStatus,
          supersededByPredictionId: input.record.predictionId,
        };
        return superseded;
      }
      return p;
    });
    const current: StoredShadowPrediction = {
      record: input.record,
      status: 'ACTIVE',
      storedAt: input.at,
    };
    nextHist.push(current);
    this.byKey.set(k, nextHist);
    return { current, superseded };
  }

  markReconciled(tripId: string, regionId: string, predictionId: string): void {
    const k = key(tripId, regionId);
    const hist = this.byKey.get(k) ?? [];
    this.byKey.set(
      k,
      hist.map((p) =>
        p.record.predictionId === predictionId
          ? { ...p, status: 'RECONCILED' as const }
          : p,
      ),
    );
  }

  clear(): void {
    this.byKey.clear();
  }

  /** Full history for replay export */
  dump(): StoredShadowPrediction[] {
    const all: StoredShadowPrediction[] = [];
    for (const hist of this.byKey.values()) all.push(...hist);
    return all;
  }
}

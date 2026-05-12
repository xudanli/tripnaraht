/**
 * 世界快照序列化 — 供语义视图与审计（不含 Map 原型，可 JSON 持久化）
 */

import type { ConstraintField } from './constraint-field.interface';
import type { WorldConstraintStore } from './world-constraint.store';

export interface WorldConstraintStoreSnapshot {
  readonly version: number;
  readonly lastUpdatedAt: number;
  readonly roads: Readonly<Record<string, ConstraintField>>;
  readonly weather: Readonly<Record<string, ConstraintField>>;
  readonly bookings: Readonly<Record<string, ConstraintField>>;
}

function mapToRecord(m: Map<string, ConstraintField>): Record<string, ConstraintField> {
  const o: Record<string, ConstraintField> = {};
  for (const [k, v] of m) {
    o[k] = v;
  }
  return o;
}

export function snapshotWorldConstraintStore(
  store: WorldConstraintStore,
): WorldConstraintStoreSnapshot {
  return {
    version: store.version,
    lastUpdatedAt: store.lastUpdatedAt,
    roads: mapToRecord(store.roads),
    weather: mapToRecord(store.weather),
    bookings: mapToRecord(store.bookings),
  };
}

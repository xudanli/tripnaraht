/**
 * Diff two CanonicalWorldStateSnapshots (roads / weather / worldFacts).
 */

import type { CanonicalWorldStateSnapshot } from '../../decision-runtime/contracts/world-state-snapshot';
import type { TravelWorldFact } from '../../travel-ontology/contracts/travel-world-fact.types';

export type SnapshotDiffChangeKind = 'ADDED' | 'REMOVED' | 'CHANGED';

export interface SnapshotDiffEntry {
  kind: SnapshotDiffChangeKind;
  channel: 'road' | 'weather' | 'worldFact' | 'poi';
  key: string;
  from?: unknown;
  to?: unknown;
}

export interface SnapshotDiffResult {
  fromSnapshotId: string;
  toSnapshotId: string;
  changes: SnapshotDiffEntry[];
  summary: { added: number; removed: number; changed: number };
}

function roadKey(r: { roadId: string; segmentId?: string }): string {
  return `${r.roadId}::${r.segmentId ?? ''}`;
}

function factKey(f: TravelWorldFact): string {
  return `${f.subjectType}:${f.subjectId}:${f.predicate}`;
}

export function diffCanonicalSnapshots(
  from: CanonicalWorldStateSnapshot,
  to: CanonicalWorldStateSnapshot,
): SnapshotDiffResult {
  const changes: SnapshotDiffEntry[] = [];

  const fromRoads = new Map(from.roads.map((r) => [roadKey(r), r]));
  const toRoads = new Map(to.roads.map((r) => [roadKey(r), r]));
  for (const [k, r] of toRoads) {
    const prev = fromRoads.get(k);
    if (!prev) {
      changes.push({ kind: 'ADDED', channel: 'road', key: k, to: r.status });
    } else if (prev.status !== r.status) {
      changes.push({ kind: 'CHANGED', channel: 'road', key: k, from: prev.status, to: r.status });
    }
  }
  for (const [k, r] of fromRoads) {
    if (!toRoads.has(k)) {
      changes.push({ kind: 'REMOVED', channel: 'road', key: k, from: r.status });
    }
  }

  const fromWx = new Map(
    from.weather.map((w) => [`${w.date}::${w.locationId ?? ''}`, w]),
  );
  const toWx = new Map(to.weather.map((w) => [`${w.date}::${w.locationId ?? ''}`, w]));
  for (const [k, w] of toWx) {
    const prev = fromWx.get(k);
    if (!prev) {
      changes.push({
        kind: 'ADDED',
        channel: 'weather',
        key: k,
        to: { alertLevel: w.alertLevel, windSpeedMs: w.windSpeedMs },
      });
    } else if (
      prev.alertLevel !== w.alertLevel ||
      prev.windSpeedMs !== w.windSpeedMs ||
      prev.condition !== w.condition
    ) {
      changes.push({
        kind: 'CHANGED',
        channel: 'weather',
        key: k,
        from: { alertLevel: prev.alertLevel, windSpeedMs: prev.windSpeedMs },
        to: { alertLevel: w.alertLevel, windSpeedMs: w.windSpeedMs },
      });
    }
  }

  const fromFacts = new Map((from.worldFacts ?? []).map((f) => [factKey(f), f]));
  const toFacts = new Map((to.worldFacts ?? []).map((f) => [factKey(f), f]));
  for (const [k, f] of toFacts) {
    const prev = fromFacts.get(k);
    if (!prev) {
      changes.push({ kind: 'ADDED', channel: 'worldFact', key: k, to: f.value });
    } else if (JSON.stringify(prev.value) !== JSON.stringify(f.value)) {
      changes.push({ kind: 'CHANGED', channel: 'worldFact', key: k, from: prev.value, to: f.value });
    }
  }
  for (const [k, f] of fromFacts) {
    if (!toFacts.has(k)) {
      changes.push({ kind: 'REMOVED', channel: 'worldFact', key: k, from: f.value });
    }
  }

  const summary = {
    added: changes.filter((c) => c.kind === 'ADDED').length,
    removed: changes.filter((c) => c.kind === 'REMOVED').length,
    changed: changes.filter((c) => c.kind === 'CHANGED').length,
  };

  return {
    fromSnapshotId: from.snapshotId,
    toSnapshotId: to.snapshotId,
    changes,
    summary,
  };
}

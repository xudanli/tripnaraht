/**
 * Product-facing World State Diff — summary + changes[] for Admin UI.
 */

import type { CanonicalWorldStateSnapshot } from '../../decision-runtime/contracts/world-state-snapshot';
import type { TravelWorldFact } from '../../travel-ontology/contracts/travel-world-fact.types';
import {
  diffCanonicalSnapshots,
  type SnapshotDiffEntry,
  type SnapshotDiffResult,
} from './snapshot-diff.util';

export type DiffImpactLevel = 'INFO' | 'LOW' | 'MEDIUM' | 'HIGH' | 'CRITICAL';
export type DiffPolarity = 'NEUTRAL' | 'WORSENED' | 'IMPROVED';

export type WorldStateDiffChangeRow = {
  changeId: string;
  kind: 'ADDED' | 'UPDATED' | 'REMOVED' | 'WORSENED' | 'IMPROVED';
  category: 'road' | 'weather' | 'poi' | 'activity' | 'worldFact';
  object: string;
  objectId: string;
  oldValue: unknown;
  newValue: unknown;
  impactLevel: DiffImpactLevel;
  polarity: DiffPolarity;
  source?: string;
  channel: SnapshotDiffEntry['channel'];
  key: string;
};

export type WorldStateDiffProductView = {
  fromSnapshotId: string;
  toSnapshotId: string;
  summary: {
    added: number;
    updated: number;
    removed: number;
    worsened: number;
    improved: number;
    total: number;
  };
  changes: WorldStateDiffChangeRow[];
  /** Raw engine diff retained for debugging */
  engine: SnapshotDiffResult;
};

function classifyPolarity(
  channel: SnapshotDiffEntry['channel'],
  from: unknown,
  to: unknown,
): DiffPolarity {
  if (channel === 'road') {
    const a = String(from ?? '').toUpperCase();
    const b = String(to ?? '').toUpperCase();
    const rank = (s: string) =>
      s.includes('CLOSED') || s.includes('IMPASS')
        ? 3
        : s.includes('RESTRICT') || s.includes('DIFFICULT')
          ? 2
          : s.includes('OPEN')
            ? 0
            : 1;
    if (from == null) return b.includes('CLOSED') ? 'WORSENED' : 'NEUTRAL';
    if (to == null) return 'NEUTRAL';
    if (rank(b) > rank(a)) return 'WORSENED';
    if (rank(b) < rank(a)) return 'IMPROVED';
  }
  if (channel === 'weather') {
    const alertRank = (v: unknown) => {
      const level = String(
        typeof v === 'object' && v && 'alertLevel' in (v as object)
          ? (v as { alertLevel?: string }).alertLevel
          : v,
      ).toUpperCase();
      if (level.includes('RED')) return 4;
      if (level.includes('ORANGE')) return 3;
      if (level.includes('YELLOW')) return 2;
      if (level.includes('NONE') || level === '') return 0;
      return 1;
    };
    if (from == null) return alertRank(to) >= 3 ? 'WORSENED' : 'NEUTRAL';
    if (to == null) return 'NEUTRAL';
    if (alertRank(to) > alertRank(from)) return 'WORSENED';
    if (alertRank(to) < alertRank(from)) return 'IMPROVED';
  }
  if (channel === 'worldFact') {
    const a = String(from ?? '').toUpperCase();
    const b = String(to ?? '').toUpperCase();
    if (a === 'OPEN' && b === 'CLOSED') return 'WORSENED';
    if (a === 'CLOSED' && b === 'OPEN') return 'IMPROVED';
  }
  return 'NEUTRAL';
}

function impactFor(
  channel: SnapshotDiffEntry['channel'],
  polarity: DiffPolarity,
  kind: SnapshotDiffEntry['kind'],
): DiffImpactLevel {
  if (polarity === 'WORSENED' && channel === 'road') return 'HIGH';
  if (polarity === 'WORSENED' && channel === 'weather') return 'MEDIUM';
  if (kind === 'REMOVED') return 'MEDIUM';
  if (kind === 'ADDED') return 'LOW';
  if (polarity === 'IMPROVED') return 'INFO';
  return 'LOW';
}

function categoryFor(channel: SnapshotDiffEntry['channel']): WorldStateDiffChangeRow['category'] {
  if (channel === 'road') return 'road';
  if (channel === 'weather') return 'weather';
  if (channel === 'poi') return 'poi';
  return 'worldFact';
}

function objectLabel(entry: SnapshotDiffEntry): string {
  if (entry.channel === 'road') return entry.key.split('::')[0] || entry.key;
  if (entry.channel === 'weather') return entry.key;
  return entry.key;
}

export function buildProductWorldStateDiff(
  from: CanonicalWorldStateSnapshot,
  to: CanonicalWorldStateSnapshot,
): WorldStateDiffProductView {
  const engine = diffCanonicalSnapshots(from, to);
  const changes: WorldStateDiffChangeRow[] = engine.changes.map((c, i) => {
    const polarity =
      c.kind === 'CHANGED' ? classifyPolarity(c.channel, c.from, c.to) : 'NEUTRAL';
    let kind: WorldStateDiffChangeRow['kind'] =
      c.kind === 'CHANGED' ? 'UPDATED' : c.kind === 'ADDED' ? 'ADDED' : 'REMOVED';
    if (polarity === 'WORSENED') kind = 'WORSENED';
    if (polarity === 'IMPROVED') kind = 'IMPROVED';

    let source: string | undefined;
    if (c.channel === 'worldFact') {
      const facts = to.worldFacts ?? from.worldFacts ?? [];
      const hit = facts.find(
        (f) => `${f.subjectType}:${f.subjectId}:${f.predicate}` === c.key,
      );
      source = hit?.source?.provider;
    } else if (c.channel === 'road') {
      source = 'road.is';
    } else if (c.channel === 'weather') {
      source = 'weather.is';
    }

    return {
      changeId: `chg_${i}_${c.channel}_${c.kind}`.slice(0, 64),
      kind,
      category: categoryFor(c.channel),
      object: objectLabel(c),
      objectId: c.key,
      oldValue: c.from ?? null,
      newValue: c.to ?? null,
      impactLevel: impactFor(c.channel, polarity, c.kind),
      polarity,
      source,
      channel: c.channel,
      key: c.key,
    };
  });

  const summary = {
    added: changes.filter((c) => c.kind === 'ADDED').length,
    updated: changes.filter((c) => c.kind === 'UPDATED').length,
    removed: changes.filter((c) => c.kind === 'REMOVED').length,
    worsened: changes.filter((c) => c.kind === 'WORSENED').length,
    improved: changes.filter((c) => c.kind === 'IMPROVED').length,
    total: changes.length,
  };

  return {
    fromSnapshotId: from.snapshotId,
    toSnapshotId: to.snapshotId,
    summary,
    changes,
    engine,
  };
}

/** Recent-change categories for snapshot list cards */
export function recentChangeCategories(
  current: CanonicalWorldStateSnapshot,
  previous?: CanonicalWorldStateSnapshot | null,
): Array<'road' | 'weather' | 'poi' | 'activity'> {
  if (!previous) {
    const cats = new Set<'road' | 'weather' | 'poi' | 'activity'>();
    if (current.roads.length) cats.add('road');
    if (current.weather.length) cats.add('weather');
    if (current.poiStates.length) cats.add('poi');
    return [...cats];
  }
  const view = buildProductWorldStateDiff(previous, current);
  return [...new Set(view.changes.map((c) => c.category).filter((c) => c !== 'worldFact'))] as Array<
    'road' | 'weather' | 'poi' | 'activity'
  >;
}

export function snapshotListStatus(input: {
  staleCount: number;
  factCount: number;
  completeness?: CanonicalWorldStateSnapshot['completeness'];
}): 'HEALTHY' | 'DEGRADED' | 'STALE' | 'INCOMPLETE' {
  if (input.factCount === 0) return 'INCOMPLETE';
  if (input.staleCount > 0 && input.staleCount >= Math.max(1, Math.floor(input.factCount * 0.5))) {
    return 'STALE';
  }
  const c = input.completeness;
  if (c && (c.roads === 'MISSING' || c.weather === 'MISSING')) return 'INCOMPLETE';
  if (input.staleCount > 0) return 'DEGRADED';
  return 'HEALTHY';
}

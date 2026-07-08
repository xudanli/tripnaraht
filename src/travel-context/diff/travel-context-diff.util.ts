import type { TravelContextDomain } from '../domain/travel-context.constants';
import type { TravelContextSnapshot } from '../domain/travel-context.types';
import { domainsChanged } from '../intents/travel-context-intent.util';

export type ContextDiffOperation = 'ADD' | 'UPDATE' | 'REMOVE';

/** RFC-003 §8.1.3 — structured revision delta */
export interface ContextDiffChange {
  path: string;
  operation: ContextDiffOperation;
  entityId?: string;
  domain?: TravelContextDomain;
}

export interface TravelContextDiff {
  contextId: string;
  fromRevision: number;
  toRevision: number;
  changedDomains: TravelContextDomain[];
  changes: ContextDiffChange[];
  /** True when journal cannot reconstruct delta — client should full refresh */
  requiresFullRefresh?: boolean;
}

export type TravelContextRevisionEventType = 'CONTEXT_REVISION_CHANGED';

export interface TravelContextRevisionEvent {
  type: TravelContextRevisionEventType;
  contextId: string;
  revision: number;
  previousRevision: number;
  changedDomains: TravelContextDomain[];
  snapshotId: string;
}

function diffArrayEntities(
  path: string,
  domain: TravelContextDomain,
  beforeItems: Array<{ id: string }>,
  afterItems: Array<{ id: string }>,
  idField: (item: { id: string }) => string = (i) => i.id,
): ContextDiffChange[] {
  const changes: ContextDiffChange[] = [];
  const beforeIds = new Set(beforeItems.map(idField));
  const afterIds = new Set(afterItems.map(idField));

  for (const item of afterItems) {
    const id = idField(item);
    if (!beforeIds.has(id)) {
      changes.push({ path, operation: 'ADD', entityId: id, domain });
    }
  }
  for (const item of beforeItems) {
    const id = idField(item);
    if (!afterIds.has(id)) {
      changes.push({ path, operation: 'REMOVE', entityId: id, domain });
    }
  }

  const beforeById = new Map(beforeItems.map((i) => [idField(i), i]));
  for (const item of afterItems) {
    const id = idField(item);
    if (beforeIds.has(id) && JSON.stringify(beforeById.get(id)) !== JSON.stringify(item)) {
      changes.push({ path, operation: 'UPDATE', entityId: id, domain });
    }
  }

  return changes;
}

/** Compute RFC-003 Context Diff between two snapshots. */
export function computeTravelContextDiff(
  contextId: string,
  before: TravelContextSnapshot,
  after: TravelContextSnapshot,
): TravelContextDiff {
  const changes: ContextDiffChange[] = [];

  if (before.meta.revision !== after.meta.revision) {
    changes.push({
      path: 'meta.revision',
      operation: 'UPDATE',
      entityId: String(after.meta.revision),
      domain: 'history',
    });
  }

  if (before.meta.bindings.worldStateVersion !== after.meta.bindings.worldStateVersion) {
    changes.push({
      path: 'meta.bindings.worldStateVersion',
      operation: 'UPDATE',
      domain: 'world',
    });
  }

  if (before.plan.effectivePlan.versionId !== after.plan.effectivePlan.versionId) {
    changes.push({
      path: 'plan.effectivePlan.versionId',
      operation: 'UPDATE',
      entityId: after.plan.effectivePlan.versionId,
      domain: 'plan',
    });
  }

  if (before.plan.selectedRouteId !== after.plan.selectedRouteId) {
    changes.push({
      path: 'plan.selectedRouteId',
      operation: 'UPDATE',
      entityId: after.plan.selectedRouteId ?? undefined,
      domain: 'plan',
    });
  }

  changes.push(
    ...diffArrayEntities(
      'world.facts',
      'world',
      before.world.facts.map((f) => ({ id: f.factId })),
      after.world.facts.map((f) => ({ id: f.factId })),
    ),
    ...diffArrayEntities(
      'decisions.open',
      'decisions',
      before.decisions.open.map((d) => ({ id: d.decisionId })),
      after.decisions.open.map((d) => ({ id: d.decisionId })),
    ),
    ...diffArrayEntities(
      'monitoring.items',
      'monitoring',
      before.monitoring.items.map((m) => ({ id: m.itemId })),
      after.monitoring.items.map((m) => ({ id: m.itemId })),
    ),
    ...diffArrayEntities(
      'history.recent',
      'history',
      before.history.recent.map((h) => ({ id: h.entryId })),
      after.history.recent.map((h) => ({ id: h.entryId })),
    ),
  );

  if (before.monitoring.activeCount !== after.monitoring.activeCount) {
    changes.push({
      path: 'monitoring.activeCount',
      operation: 'UPDATE',
      domain: 'monitoring',
    });
  }

  return {
    contextId,
    fromRevision: before.meta.revision,
    toRevision: after.meta.revision,
    changedDomains: domainsChanged(before, after),
    changes,
  };
}

export function mergeTravelContextDiffs(
  contextId: string,
  diffs: TravelContextDiff[],
): TravelContextDiff {
  if (diffs.length === 0) {
    return {
      contextId,
      fromRevision: 0,
      toRevision: 0,
      changedDomains: [],
      changes: [],
    };
  }

  const changedDomains = [...new Set(diffs.flatMap((d) => d.changedDomains))];
  return {
    contextId,
    fromRevision: diffs[0]!.fromRevision,
    toRevision: diffs[diffs.length - 1]!.toRevision,
    changedDomains,
    changes: diffs.flatMap((d) => d.changes),
  };
}

export function emptyTravelContextDiff(
  contextId: string,
  revision: number,
): TravelContextDiff {
  return {
    contextId,
    fromRevision: revision,
    toRevision: revision,
    changedDomains: [],
    changes: [],
  };
}

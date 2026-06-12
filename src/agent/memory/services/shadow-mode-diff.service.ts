import { Injectable } from '@nestjs/common';
import type { DecisionParams } from '../interfaces/decision-params.interface';
import type { AgentMemoryContext } from '../interfaces/agent-memory-context.interface';

export interface DecisionParamsDiff {
  changedKeys: string[];
  before: DecisionParams;
  after: DecisionParams;
}

export type MemorySnapshotDiffV1 = {
  failurePatternsDelta: {
    removed: string[];
    added: string[];
  };
  routeHealthKeysDelta: {
    removed: string[];
    added: string[];
  };
  tripFeedbackTailDelta: {
    removedTripIds: string[];
    addedTripIds: string[];
  };
  activeRouteHealthChanged: boolean;
  travelPreferenceChangedKeys: string[];
  ledgerNodesCountDelta: number;
};

function deepDiffKeys(a: any, b: any, base = ''): string[] {
  if (a === b) return [];
  const keys = new Set<string>([
    ...Object.keys(a ?? {}),
    ...Object.keys(b ?? {}),
  ]);
  const out: string[] = [];
  for (const k of keys) {
    const nextBase = base ? `${base}.${k}` : k;
    const av = a?.[k];
    const bv = b?.[k];
    const bothObj =
      av != null &&
      bv != null &&
      typeof av === 'object' &&
      typeof bv === 'object' &&
      !Array.isArray(av) &&
      !Array.isArray(bv);
    if (bothObj) out.push(...deepDiffKeys(av, bv, nextBase));
    else if (av !== bv) out.push(nextBase);
  }
  return out;
}

@Injectable()
export class ShadowModeDiffService {
  /**
   * dry_run mode: compute diff but do not affect execution.
   */
  diff(before: DecisionParams, after: DecisionParams): DecisionParamsDiff {
    return {
      changedKeys: deepDiffKeys(before, after),
      before,
      after,
    };
  }

  /**
   * Tier-0：两次 AgentMemoryContext 快照静态 diff（零重跑，供 Shadow / CI 门禁）。
   */
  diffMemorySnapshots(snapshotA: AgentMemoryContext, snapshotB: AgentMemoryContext): MemorySnapshotDiffV1 {
    const keysA = Object.keys(snapshotA.routeHealthByKey ?? {});
    const keysB = Object.keys(snapshotB.routeHealthByKey ?? {});
    const travelPreferenceChangedKeys = deepDiffKeys(
      snapshotA.travelPreference ?? {},
      snapshotB.travelPreference ?? {},
    );
    const activeA = snapshotA.activeRouteHealthSnapshot;
    const activeB = snapshotB.activeRouteHealthSnapshot;
    const activeRouteHealthChanged =
      JSON.stringify(activeA ?? null) !== JSON.stringify(activeB ?? null);
    const tripIdsA = (snapshotA.recentTripFeedbacks ?? []).map((f) => f.tripId);
    const tripIdsB = (snapshotB.recentTripFeedbacks ?? []).map((f) => f.tripId);

    return {
      failurePatternsDelta: {
        removed: snapshotA.failurePatterns.filter((p) => !snapshotB.failurePatterns.includes(p)),
        added: snapshotB.failurePatterns.filter((p) => !snapshotA.failurePatterns.includes(p)),
      },
      routeHealthKeysDelta: {
        removed: keysA.filter((k) => !keysB.includes(k)),
        added: keysB.filter((k) => !keysA.includes(k)),
      },
      tripFeedbackTailDelta: {
        removedTripIds: tripIdsA.filter((id) => !tripIdsB.includes(id)),
        addedTripIds: tripIdsB.filter((id) => !tripIdsA.includes(id)),
      },
      activeRouteHealthChanged,
      travelPreferenceChangedKeys,
      ledgerNodesCountDelta:
        (snapshotA.decisionLedger?.nodes?.length ?? 0) - (snapshotB.decisionLedger?.nodes?.length ?? 0),
    };
  }
}


import type { DecisionMemory } from '../decision-memory/decision-memory.types';
import type { TripTaskMemory } from '../../context-engine/interfaces/trip-task-memory.interface';
import type { WorldTopicSlice } from './world-topic-slice.types';
import type { LedgerAnchorsV1, WorldAnchorV1 } from './decision-ledger.types';
import { stableDigest } from './decision-ledger-digest.util';
import type { MemoryLedgerPhaseV1 } from './world-topic-slice.types';

export function deriveMemoryLedgerPhaseFromTripTask(tm: TripTaskMemory | null): MemoryLedgerPhaseV1 {
  if (!tm) return 'PLANNING';
  if (tm.currentPhase === 'confirm') return 'EXECUTION';
  if (tm.currentPhase === 'decision') return 'GATE_EVAL';
  return 'PLANNING';
}

export function isWorldTopicSliceStale(slice: WorldTopicSlice, nowMs: number): boolean {
  return nowMs - slice.meta.fetchedAt > slice.meta.freshness.ttlMs;
}

export function listStaleWorldTopicTopics(slices: WorldTopicSlice[], nowMs: number): string[] {
  return slices.filter(s => isWorldTopicSliceStale(s, nowMs)).map(s => s.topic);
}

/**
 * 从 WDMA 尾、trip 约束与遥测占位构造 v0 slices（Assembler 无 DecisionState 时的世界态入口）。
 */
export function buildWorldTopicSlicesFromTripContext(input: {
  recentWorldDecisions: DecisionMemory[];
  activeTripState: TripTaskMemory | null;
  nowMs?: number;
}): WorldTopicSlice[] {
  const now = input.nowMs ?? Date.now();
  const tail = input.recentWorldDecisions.slice(0, 16).map(d => ({
    id: d.causalityId,
    t: d.decisionType,
    ts: d.timestamp,
  }));
  const wdmaDigest = stableDigest(tail);
  const constraints = input.activeTripState?.constraints ?? null;
  const constraintsDigest = stableDigest(constraints ?? null);

  const budgetPayload =
    constraints && typeof constraints === 'object' && 'budget' in constraints
      ? (constraints as Record<string, unknown>).budget
      : null;
  const costHintDigest = stableDigest(budgetPayload ?? 'ledger:telemetry_cost:none');

  return [
    {
      topic: 'world:wdma_archive',
      data: { tail_len: tail.length },
      meta: {
        version: 'v1',
        fetchedAt: now,
        digest: wdmaDigest,
        freshness: {
          granularity: 'COARSE',
          ttlMs: 86_400_000,
          stalePolicy: 'MARK_STALE',
        },
      },
    },
    {
      topic: 'world:trip_constraints',
      data: { has_constraints: constraints != null },
      meta: {
        version: 'v1',
        fetchedAt: now,
        digest: constraintsDigest,
        freshness: {
          granularity: 'COARSE',
          ttlMs: 3_600_000,
          stalePolicy: 'MARK_STALE',
        },
      },
    },
    {
      topic: 'telemetry:total_cost_hint',
      data: { source: 'trip_task.constraints.budget' },
      meta: {
        version: 'v1',
        fetchedAt: now,
        digest: costHintDigest,
        freshness: {
          granularity: 'FINE',
          ttlMs: 300_000,
          stalePolicy: 'REFRESH_ASYNC',
        },
      },
    },
  ];
}

/** coarse = 所有 COARSE topic digest 组合；fine = FINE 组合；activeTopics = topic → digest */
export function buildWorldAnchorV1FromSlices(slices: WorldTopicSlice[]): WorldAnchorV1 {
  const coarse: Record<string, string> = {};
  const fine: Record<string, string> = {};
  const activeTopics: Record<string, string> = {};
  for (const s of slices) {
    activeTopics[s.topic] = s.meta.digest;
    if (s.meta.freshness.granularity === 'COARSE') {
      coarse[s.topic] = s.meta.digest;
    } else {
      fine[s.topic] = s.meta.digest;
    }
  }
  return {
    coarseDigest: stableDigest(coarse),
    fineDigest: stableDigest(fine),
    activeTopics,
  };
}

/** 与旧版单字段 world 对齐：整锚序列化 digest */
export function serializeWorldAnchorComposite(w: WorldAnchorV1): string {
  return stableDigest({
    coarseDigest: w.coarseDigest,
    fineDigest: w.fineDigest,
    activeTopics: w.activeTopics,
  });
}

/** 兼容仅含 legacy `world` 字符串的旧快照 / 部分 payload */
export function normalizeLedgerAnchorsV1(
  anchors: Partial<LedgerAnchorsV1> & Pick<LedgerAnchorsV1, 'budget' | 'preference' | 'policy'>,
): LedgerAnchorsV1 {
  if (anchors.worldLayered && anchors.world) {
    return anchors as LedgerAnchorsV1;
  }
  if (anchors.worldLayered) {
    return {
      budget: anchors.budget,
      preference: anchors.preference,
      policy: anchors.policy,
      worldLayered: anchors.worldLayered,
      world: serializeWorldAnchorComposite(anchors.worldLayered),
    };
  }
  const legacy = anchors.world ?? stableDigest('ledger:world:empty');
  const worldLayered: WorldAnchorV1 = {
    coarseDigest: legacy,
    fineDigest: legacy,
    activeTopics: {},
  };
  return {
    budget: anchors.budget,
    preference: anchors.preference,
    policy: anchors.policy,
    world: legacy,
    worldLayered,
  };
}

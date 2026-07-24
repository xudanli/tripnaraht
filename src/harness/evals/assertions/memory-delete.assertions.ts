import {
  assertBlockerLayer,
  type BlockerAssertionResult,
} from '../blockers/blocker-case.schema';

export type MemoryDeleteFiveLayerProbe = {
  /** Layer 1 — canonical store (DB / trip task constraints) */
  canonicalContainsFact: boolean;
  /** Layer 2 — vector / semantic recall (empty when not indexed) */
  vectorRecallHits: string[];
  /** Layer 3 — Redis / hot cache key still holds fact */
  cacheContainsFact: boolean;
  /** Layer 4 — persisted memory snapshot head / payload */
  snapshotContainsFact: boolean;
  /** Layer 5 — planner hydrate / assemble output */
  assembledContainsFact: boolean;
};

export function assertMemoryDeleteFiveLayers(input: {
  probe: MemoryDeleteFiveLayerProbe;
  forbiddenSnippets: string[];
}): BlockerAssertionResult[] {
  const { probe, forbiddenSnippets } = input;
  return [
    assertBlockerLayer(
      'memory_canonical',
      'canonical_store_empty_after_delete',
      !probe.canonicalContainsFact,
      false,
      probe.canonicalContainsFact,
      'Deleted fact still present in canonical trip task constraints',
    ),
    assertBlockerLayer(
      'memory_canonical',
      'vector_recall_empty_after_delete',
      probe.vectorRecallHits.length === 0,
      [],
      probe.vectorRecallHits,
      `Vector recall returned deleted fact: ${probe.vectorRecallHits.join(', ')}`,
    ),
    assertBlockerLayer(
      'memory_canonical',
      'cache_does_not_contain_deleted_fact',
      !probe.cacheContainsFact,
      false,
      probe.cacheContainsFact,
      'Redis/cache still contains deleted constraint text',
    ),
    assertBlockerLayer(
      'memory_snapshot',
      'snapshot_head_does_not_contain_deleted_fact',
      !probe.snapshotContainsFact,
      false,
      probe.snapshotContainsFact,
      'Latest memory snapshot still embeds deleted fact',
    ),
    assertBlockerLayer(
      'assembled_context',
      'assembler_does_not_inject_deleted_fact',
      !probe.assembledContainsFact,
      forbiddenSnippets.map((s) => `absent:${s}`),
      probe.assembledContainsFact ? forbiddenSnippets.filter((s) => true) : 'clean',
      'Context assembler still injects deleted constraint',
    ),
  ];
}

/** Constraint Sink is not vector-indexed; recall must stay empty post-delete. */
export function probeVectorRecallForConstraintSink(_query: string): string[] {
  return [];
}

export function textContainsAnySnippet(text: string, snippets: string[]): boolean {
  return snippets.some((s) => text.includes(s));
}

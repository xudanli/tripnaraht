/**
 * Episode Assembler — 从 Ledger 自动形成 Decision / Plan Change / Live Risk Episode。
 * 不新增 Memory 类型；复用 TravelEpisodicMemoryV1。
 */

import { randomUUID } from 'crypto';
import {
  TRAVEL_EPISODIC_MEMORY_SCHEMA,
  type TravelEpisodicKind,
  type TravelEpisodicMemoryV1,
} from '../episodic-memory.types';
import type { TravelEventLedgerEntryV1 } from '../travel-event-ledger.types';
import type { TravelEventLedgerStore } from '../travel-event-ledger.store';
import { assertMemoryNotUsedAsTruth } from '../episodic-memory.guard';

export type AssembledEpisodeBundle = {
  tripId: string;
  assembledAt: string;
  episodes: TravelEpisodicMemoryV1[];
  /** 组装后强制校验 Memory≠Truth */
  memoryTruthOk: boolean;
};

function kindForEvent(e: TravelEventLedgerEntryV1): TravelEpisodicKind | null {
  if (e.kind === 'DECISION' || e.kind === 'PROPOSAL') return 'DECISION_EPISODE';
  if (
    e.kind === 'PLAN_VERSION' ||
    e.kind === 'ACTION_RECEIPT' ||
    e.kind === 'VERIFY'
  ) {
    return 'PLAN_CHANGE_EPISODE';
  }
  if (e.kind === 'LIVE_RISK') return 'LIVE_RISK_EPISODE';
  return null;
}

function groupKey(e: TravelEventLedgerEntryV1, kind: TravelEpisodicKind): string {
  const c = e.correlation;
  if (kind === 'DECISION_EPISODE') {
    return `decision:${c.decisionId ?? c.turnId ?? e.eventId}`;
  }
  if (kind === 'PLAN_CHANGE_EPISODE') {
    return `plan:${c.planVersion ?? ''}:${c.actionId ?? c.turnId ?? e.eventId}`;
  }
  return `risk:${String(e.payload.riskEventId ?? c.turnId ?? e.eventId)}`;
}

function summaryFor(
  kind: TravelEpisodicKind,
  events: TravelEventLedgerEntryV1[],
): string {
  const head = events[0];
  if (kind === 'DECISION_EPISODE') {
    return `决策情景 decision=${head.correlation.decisionId ?? '-'} events=${events.length}`;
  }
  if (kind === 'PLAN_CHANGE_EPISODE') {
    return `计划变更 plan=${head.correlation.planVersion ?? '-'} action=${head.correlation.actionId ?? '-'} events=${events.length}`;
  }
  return `行中风险 risk=${String(head.payload.riskEventId ?? head.eventId)} events=${events.length}`;
}

/**
 * 从 Ledger 按关联键聚合成三类 Episode（CONTEXT_ONLY）。
 */
export function assembleEpisodesFromLedger(
  ledger: TravelEventLedgerStore,
  input: { tripId: string; limit?: number },
): AssembledEpisodeBundle {
  const events = ledger.query({
    tripId: input.tripId,
    limit: input.limit ?? 200,
  });
  const buckets = new Map<
    string,
    { kind: TravelEpisodicKind; events: TravelEventLedgerEntryV1[] }
  >();

  for (const e of events) {
    const kind = kindForEvent(e);
    if (!kind) continue;
    const key = `${kind}|${groupKey(e, kind)}`;
    const cur = buckets.get(key);
    if (cur) cur.events.push(e);
    else buckets.set(key, { kind, events: [e] });
  }

  const episodes: TravelEpisodicMemoryV1[] = [];
  for (const { kind, events: evs } of buckets.values()) {
    const head = evs[0];
    episodes.push({
      schemaId: TRAVEL_EPISODIC_MEMORY_SCHEMA,
      version: 1,
      episodeId: randomUUID(),
      kind,
      tripId: input.tripId,
      createdAt: head.occurredAt,
      summaryZh: summaryFor(kind, evs),
      sourceEventIds: evs.map((x) => x.eventId),
      correlation: {
        decisionId: head.correlation.decisionId ?? null,
        planVersionFrom: null,
        planVersionTo: head.correlation.planVersion ?? null,
        actionId: head.correlation.actionId ?? null,
        turnId: head.correlation.turnId ?? null,
        riskEventId:
          typeof head.payload.riskEventId === 'string'
            ? head.payload.riskEventId
            : null,
      },
      usagePolicy: 'CONTEXT_ONLY',
      isTruth: false,
    });
  }

  const memoryTruthOk = episodes.every(
    (ep) => assertMemoryNotUsedAsTruth({ role: 'CONTEXT', memory: ep }).ok,
  );

  return {
    tripId: input.tripId,
    assembledAt: new Date().toISOString(),
    episodes,
    memoryTruthOk,
  };
}

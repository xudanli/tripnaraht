/**
 * Memory ≠ Truth 护栏。
 * Episodic / 长期记忆只能注入 Context；禁止当作 Evidence / Gate / Verify 事实。
 */

import { randomUUID } from 'crypto';
import {
  TRAVEL_EPISODIC_MEMORY_SCHEMA,
  type TravelEpisodicKind,
  type TravelEpisodicMemoryV1,
} from './episodic-memory.types';
import type { TravelEventLedgerEntryV1 } from './travel-event-ledger.types';

export type MemoryAuthorityViolationCode =
  | 'MEMORY_USED_AS_EVIDENCE'
  | 'MEMORY_USED_AS_GATE'
  | 'MEMORY_USED_AS_VERIFY'
  | 'MEMORY_MARKED_AS_TRUTH';

export type MemoryAuthorityCheckResult =
  | { ok: true }
  | { ok: false; code: MemoryAuthorityViolationCode; reason: string };

/**
 * 断言：不得把 Memory 当作实时事实路径。
 * @param role 调用方声明的用途
 */
export function assertMemoryNotUsedAsTruth(input: {
  role: 'CONTEXT' | 'EVIDENCE' | 'GATE' | 'VERIFY' | 'TRUTH';
  memory?: TravelEpisodicMemoryV1 | null;
}): MemoryAuthorityCheckResult {
  if (input.role === 'CONTEXT') {
    if (input.memory && (input.memory as { isTruth?: boolean }).isTruth === true) {
      return {
        ok: false,
        code: 'MEMORY_MARKED_AS_TRUTH',
        reason: 'episodic_memory_must_set_isTruth_false',
      };
    }
    return { ok: true };
  }
  if (input.role === 'EVIDENCE') {
    return {
      ok: false,
      code: 'MEMORY_USED_AS_EVIDENCE',
      reason: 'memory_neq_truth:cannot_bypass_realtime_evidence',
    };
  }
  if (input.role === 'GATE') {
    return {
      ok: false,
      code: 'MEMORY_USED_AS_GATE',
      reason: 'memory_neq_truth:cannot_bypass_gate',
    };
  }
  if (input.role === 'VERIFY') {
    return {
      ok: false,
      code: 'MEMORY_USED_AS_VERIFY',
      reason: 'memory_neq_truth:cannot_bypass_verify',
    };
  }
  return {
    ok: false,
    code: 'MEMORY_MARKED_AS_TRUTH',
    reason: 'memory_neq_truth:forbidden_truth_role',
  };
}

export function assertMemoryNotUsedAsTruthOrThrow(input: {
  role: 'CONTEXT' | 'EVIDENCE' | 'GATE' | 'VERIFY' | 'TRUTH';
  memory?: TravelEpisodicMemoryV1 | null;
}): void {
  const r = assertMemoryNotUsedAsTruth(input);
  if (r.ok === false) {
    throw new Error(`[Memory≠Truth] ${r.code}: ${r.reason}`);
  }
}

/** 从 Ledger 事件投影三类 Episodic（Context-only） */
export function projectEpisodesFromLedgerEvents(
  events: TravelEventLedgerEntryV1[],
): TravelEpisodicMemoryV1[] {
  const out: TravelEpisodicMemoryV1[] = [];
  for (const e of events) {
    let kind: TravelEpisodicKind | null = null;
    let summaryZh = '';
    if (e.kind === 'DECISION') {
      kind = 'DECISION_EPISODE';
      summaryZh = `决策事件 ${e.correlation.decisionId ?? e.eventId}`;
    } else if (e.kind === 'PLAN_VERSION' || e.kind === 'ACTION_RECEIPT') {
      kind = 'PLAN_CHANGE_EPISODE';
      summaryZh = `计划变更 plan=${e.correlation.planVersion ?? '?'} action=${e.correlation.actionId ?? '-'}`;
    } else if (e.kind === 'LIVE_RISK') {
      kind = 'LIVE_RISK_EPISODE';
      summaryZh = `行中风险 ${String(e.payload.riskEventId ?? e.eventId)}`;
    }
    if (!kind) continue;
    out.push({
      schemaId: TRAVEL_EPISODIC_MEMORY_SCHEMA,
      version: 1,
      episodeId: randomUUID(),
      kind,
      tripId: e.correlation.tripId,
      createdAt: e.occurredAt,
      summaryZh,
      sourceEventIds: [e.eventId],
      correlation: {
        decisionId: e.correlation.decisionId ?? null,
        planVersionFrom: null,
        planVersionTo: e.correlation.planVersion ?? null,
        actionId: e.correlation.actionId ?? null,
        turnId: e.correlation.turnId ?? null,
        riskEventId:
          typeof e.payload.riskEventId === 'string' ? e.payload.riskEventId : null,
      },
      usagePolicy: 'CONTEXT_ONLY',
      isTruth: false,
    });
  }
  return out;
}

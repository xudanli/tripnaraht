/**
 * Append-only Memory Ledger（进程内热路径）。
 * 禁止 UPDATE；遗忘走 SUPERSEDE / INVALIDATE / REDACT tombstone。
 * 每个事件必须带 evidenceRefs（Evidence Chain）。
 */

import { randomUUID } from 'crypto';
import {
  MEMORY_EVENT_SCHEMA,
  type MemoryEventOp,
  type MemoryEventStatus,
  type MemoryEventV1,
  type MemorySource,
  type MemoryType,
} from '../types/memory-event.types';
import type { MemoryScope, MemorySubject } from '../types/memory-scope.types';
import type { MemoryEvidenceRefV1 } from '../types/memory-evidence-ref.types';
import {
  lifecycleFromEventStatus,
  type MemoryLifecycleState,
} from '../types/memory-lifecycle.types';

const DEFAULT_MAX = 10_000;

export type AppendMemoryEventInput = {
  op?: MemoryEventOp;
  subject: MemorySubject;
  memoryType: MemoryType;
  predicate: string;
  value: unknown;
  scope: MemoryScope;
  source: MemorySource;
  confidence: number;
  status?: MemoryEventStatus;
  lifecycleStatus?: MemoryLifecycleState;
  evidenceRefs?: MemoryEvidenceRefV1[];
  supersedesEventId?: string | null;
  validFrom?: string;
  validTo?: string | null;
  recordedAt?: string;
  memoryEventId?: string;
};

function evidenceRefsFromSource(source: MemorySource): MemoryEvidenceRefV1[] {
  const refs: MemoryEvidenceRefV1[] = [];
  if (source.episodeId) {
    refs.push({ type: 'DECISION_EPISODE', id: source.episodeId });
  }
  if (source.decisionId) {
    refs.push({ type: 'CGUS_TRACE', id: source.decisionId });
  }
  if (source.conversationId || source.turnId) {
    refs.push({
      type: 'CHAT_TURN',
      id: source.turnId ?? source.conversationId!,
    });
  }
  if (source.type === 'USER_EXPLICIT' && refs.length === 0) {
    refs.push({
      type: 'USER_EXPLICIT',
      id: source.note ?? 'explicit',
    });
  }
  return refs;
}

export class MemoryLedgerStore {
  private readonly events: MemoryEventV1[] = [];

  constructor(private readonly maxEvents = DEFAULT_MAX) {}

  append(input: AppendMemoryEventInput): MemoryEventV1 {
    const recordedAt = input.recordedAt ?? new Date().toISOString();
    const status = input.status ?? 'ACTIVE';
    const evidenceRefs =
      input.evidenceRefs?.length
        ? input.evidenceRefs
        : evidenceRefsFromSource(input.source);

    const entry: MemoryEventV1 = {
      schemaId: MEMORY_EVENT_SCHEMA,
      version: 1,
      memoryEventId: input.memoryEventId ?? randomUUID(),
      op: input.op ?? 'ADD',
      subject: { ...input.subject },
      memoryType: input.memoryType,
      predicate: input.predicate,
      value: input.value,
      scope: input.scope,
      source: { ...input.source },
      confidence: clampConfidence(input.confidence),
      status,
      lifecycleStatus:
        input.lifecycleStatus ?? lifecycleFromEventStatus(status),
      evidenceRefs,
      supersedesEventId: input.supersedesEventId ?? null,
      supersededBy: null,
      validTime: {
        from: input.validFrom ?? recordedAt,
        to: input.validTo ?? null,
      },
      systemTime: { recordedAt },
    };
    this.events.push(entry);

    if (input.op === 'SUPERSEDE' && input.supersedesEventId) {
      this.markSuperseded(input.supersedesEventId, entry.memoryEventId);
    }
    if (input.op === 'INVALIDATE' && input.supersedesEventId) {
      this.markStatus(input.supersedesEventId, 'INVALIDATED');
    }

    if (this.events.length > this.maxEvents) {
      this.events.splice(0, this.events.length - this.maxEvents);
    }
    return entry;
  }

  private markStatus(eventId: string, status: MemoryEventStatus): void {
    const idx = this.events.findIndex((e) => e.memoryEventId === eventId);
    if (idx < 0) return;
    this.events[idx] = {
      ...this.events[idx],
      status,
      lifecycleStatus: lifecycleFromEventStatus(status),
    };
  }

  private markSuperseded(eventId: string, byId: string): void {
    const idx = this.events.findIndex((e) => e.memoryEventId === eventId);
    if (idx < 0) return;
    this.events[idx] = {
      ...this.events[idx],
      status: 'SUPERSEDED',
      lifecycleStatus: 'SUPERSEDED',
      supersededBy: byId,
    };
  }

  list(filter?: {
    subjectId?: string;
    predicate?: string;
    scope?: MemoryScope;
    activeOnly?: boolean;
    limit?: number;
  }): MemoryEventV1[] {
    let out = this.events.slice();
    if (filter?.subjectId) {
      out = out.filter((e) => e.subject.id === filter.subjectId);
    }
    if (filter?.predicate) {
      out = out.filter((e) => e.predicate === filter.predicate);
    }
    if (filter?.scope) {
      out = out.filter((e) => e.scope === filter.scope);
    }
    if (filter?.activeOnly !== false) {
      out = out.filter(
        (e) => e.status === 'ACTIVE' || e.status === 'INFERRED',
      );
    }
    const limit = filter?.limit ?? out.length;
    return out.slice(Math.max(0, out.length - limit));
  }

  currentByPredicate(
    subjectId: string,
    predicate: string,
  ): MemoryEventV1 | null {
    const rows = this.list({
      subjectId,
      predicate,
      activeOnly: true,
    });
    return rows.length ? rows[rows.length - 1] : null;
  }

  size(): number {
    return this.events.length;
  }
}

function clampConfidence(n: number): number {
  if (Number.isNaN(n)) return 0;
  return Math.max(0, Math.min(1, n));
}

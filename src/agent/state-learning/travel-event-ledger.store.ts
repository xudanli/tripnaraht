/**
 * TravelEvent Ledger 进程内 append-only store（热路径）。
 * 持久化可后续对接 GovernanceLedger Prisma；本阶段不改控制层。
 */

import { randomUUID } from 'crypto';
import {
  TRAVEL_EVENT_LEDGER_SCHEMA,
  type TravelEventKind,
  type TravelEventLedgerEntryV1,
  type TravelEventLedgerQuery,
  type TravelEventCorrelation,
} from './travel-event-ledger.types';

const DEFAULT_MAX = 5_000;

export class TravelEventLedgerStore {
  private readonly events: TravelEventLedgerEntryV1[] = [];

  constructor(private readonly maxEvents = DEFAULT_MAX) {}

  append(input: {
    kind: TravelEventKind;
    correlation: TravelEventCorrelation;
    payload?: Record<string, unknown>;
    occurredAt?: string;
    eventId?: string;
  }): TravelEventLedgerEntryV1 {
    const entry: TravelEventLedgerEntryV1 = {
      schemaId: TRAVEL_EVENT_LEDGER_SCHEMA,
      version: 1,
      eventId: input.eventId ?? randomUUID(),
      kind: input.kind,
      occurredAt: input.occurredAt ?? new Date().toISOString(),
      correlation: { ...input.correlation },
      payload: { ...(input.payload ?? {}) },
      truthPolicy: 'LEDGER_RECORD_ONLY',
    };
    this.events.push(entry);
    if (this.events.length > this.maxEvents) {
      this.events.splice(0, this.events.length - this.maxEvents);
    }
    return entry;
  }

  /** 关联 Decision ↔ PlanVersion ↔ ActionReceipt ↔ AgentTurnTrace */
  linkBundle(input: {
    tripId: string;
    turnId?: string;
    taskId?: string;
    decisionId?: string;
    actionId?: string;
    planVersion?: number;
    agentTurnTraceSchema?: string;
    worldStateProjectedAt?: string;
    extras?: Record<string, unknown>;
  }): TravelEventLedgerEntryV1[] {
    const corr: TravelEventCorrelation = {
      tripId: input.tripId,
      turnId: input.turnId ?? null,
      taskId: input.taskId ?? null,
      decisionId: input.decisionId ?? null,
      actionId: input.actionId ?? null,
      planVersion: input.planVersion ?? null,
      agentTurnTraceSchema: input.agentTurnTraceSchema ?? null,
      worldStateProjectedAt: input.worldStateProjectedAt ?? null,
    };
    const out: TravelEventLedgerEntryV1[] = [];
    if (input.decisionId) {
      out.push(
        this.append({
          kind: 'DECISION',
          correlation: corr,
          payload: { decisionId: input.decisionId, ...(input.extras ?? {}) },
        }),
      );
    }
    if (input.planVersion != null) {
      out.push(
        this.append({
          kind: 'PLAN_VERSION',
          correlation: corr,
          payload: { planVersion: input.planVersion },
        }),
      );
    }
    if (input.actionId) {
      out.push(
        this.append({
          kind: 'ACTION_RECEIPT',
          correlation: corr,
          payload: { actionId: input.actionId },
        }),
      );
    }
    if (input.agentTurnTraceSchema || input.turnId) {
      out.push(
        this.append({
          kind: 'AGENT_TURN_TRACE',
          correlation: corr,
          payload: {
            turnId: input.turnId,
            schema: input.agentTurnTraceSchema,
          },
        }),
      );
    }
    return out;
  }

  query(q: TravelEventLedgerQuery): TravelEventLedgerEntryV1[] {
    const limit = Math.max(1, Math.min(q.limit ?? 50, 500));
    const matched = this.events.filter((e) => {
      if (e.correlation.tripId !== q.tripId) return false;
      if (q.kind && e.kind !== q.kind) return false;
      if (q.decisionId && e.correlation.decisionId !== q.decisionId) return false;
      if (q.actionId && e.correlation.actionId !== q.actionId) return false;
      if (q.turnId && e.correlation.turnId !== q.turnId) return false;
      return true;
    });
    return matched.slice(-limit);
  }

  snapshot(): TravelEventLedgerEntryV1[] {
    return [...this.events];
  }

  clear(): void {
    this.events.length = 0;
  }
}

/** 测试 / 单进程默认单例（非 Nest DI，避免本阶段扩 Module） */
let defaultLedger: TravelEventLedgerStore | null = null;

export function getDefaultTravelEventLedger(): TravelEventLedgerStore {
  if (!defaultLedger) defaultLedger = new TravelEventLedgerStore();
  return defaultLedger;
}

export function resetDefaultTravelEventLedgerForTests(): void {
  defaultLedger = null;
}

import type { GovernanceLedgerEvent } from '../../agent/ledger/governance-ledger.types';
import type { GovernanceDriftSignal } from './governance-drift.types';
import type { GovernanceRuntimeState } from '../runtime-state-machine/governance-runtime-state.types';
import { parseGovernanceResolutionLedgerPayload } from '../runtime-state-machine/governance-resolution-ledger.util';

export interface DetectGovernanceDriftContext {
  runtimeState: GovernanceRuntimeState;
  /** 0–1 world-side pressure already derived for hydration (optional). */
  worldPressure?: number;
}

function normalizeCorridorKey(routeRegion?: string): string {
  return (routeRegion ?? '').trim().toLowerCase().slice(0, 96);
}

/**
 * GDRES v1: recurrence (resolution + corridor), policy churn, world regression tail.
 */
export function detectGovernanceDriftFromLedger(
  events: readonly GovernanceLedgerEvent[],
  tripId: string,
  ctx: DetectGovernanceDriftContext,
): GovernanceDriftSignal[] {
  const scoped = events.filter((e) => (e.tripId ?? '') === tripId);
  const asc = [...scoped].sort((a, b) => a.timestamp - b.timestamp);
  const signals: GovernanceDriftSignal[] = [];

  const resolutionByBlock = new Map<string, GovernanceLedgerEvent[]>();
  for (const e of asc) {
    if (e.eventType !== 'governance_resolution_event') continue;
    const p = parseGovernanceResolutionLedgerPayload(e);
    if (!p?.resolvedLedgerEventId) continue;
    const arr = resolutionByBlock.get(p.resolvedLedgerEventId) ?? [];
    arr.push(e);
    resolutionByBlock.set(p.resolvedLedgerEventId, arr);
  }
  for (const [blockId, evs] of resolutionByBlock) {
    if (evs.length >= 2) {
      signals.push({
        type: 'recurring_block',
        confidence: Math.min(0.95, 0.52 + 0.18 * (evs.length - 1)),
        evidenceEventIds: evs.map((x) => x.id),
        driftReasonCodes: ['gdres.repeat_resolution_same_block', `gdres.block.${blockId}`],
      });
    }
  }

  const blockKeyToIds = new Map<string, string[]>();
  for (const e of asc) {
    if (e.eventType !== 'execution_block') continue;
    const k = normalizeCorridorKey(e.executionContextSummary?.routeRegion);
    if (!k) continue;
    const arr = blockKeyToIds.get(k) ?? [];
    arr.push(e.id);
    blockKeyToIds.set(k, arr);
  }
  for (const [key, ids] of blockKeyToIds) {
    if (ids.length >= 2) {
      signals.push({
        type: 'recurring_block',
        confidence: Math.min(0.9, 0.48 + 0.12 * (ids.length - 1)),
        evidenceEventIds: ids.slice(-12),
        driftReasonCodes: ['gdres.repeat_block_same_corridor_key', `gdres.corridor_key.${key.slice(0, 40)}`],
      });
    }
  }

  const l3Tail = asc.filter((e) => e.eventLevel === 'L3_world').slice(-12);
  if (ctx.runtimeState === 'NORMAL' && l3Tail.length >= 2) {
    const wp = ctx.worldPressure ?? 0;
    const confidence = Math.min(0.92, 0.35 + 0.06 * l3Tail.length + wp * 0.35);
    signals.push({
      type: 'world_regression',
      confidence,
      evidenceEventIds: l3Tail.map((e) => e.id),
      driftReasonCodes: ['gdres.world_tail_elevated_while_normal', `gdres.l3_tail_count.${l3Tail.length}`],
    });
  }

  const recoveryLike = asc.filter(
    (e) =>
      e.eventType === 'governance_branch_outcome' &&
      (e.executionContextSummary?.routeRegion ?? '').includes('governance_recovery_completed'),
  );
  if (recoveryLike.length >= 3) {
    signals.push({
      type: 'policy_insufficient',
      confidence: Math.min(0.9, 0.45 + 0.12 * (recoveryLike.length - 2)),
      evidenceEventIds: recoveryLike.map((e) => e.id).slice(-16),
      driftReasonCodes: ['gdres.high_recovery_closure_churn', `gdres.recovery_outcomes.${recoveryLike.length}`],
    });
  }

  return mergeDriftSignals(signals);
}

function mergeDriftSignals(rows: GovernanceDriftSignal[]): GovernanceDriftSignal[] {
  const byType = new Map<GovernanceDriftSignal['type'], GovernanceDriftSignal>();
  for (const r of rows) {
    const prev = byType.get(r.type);
    if (!prev) {
      byType.set(r.type, { ...r, evidenceEventIds: [...r.evidenceEventIds], driftReasonCodes: [...r.driftReasonCodes] });
      continue;
    }
    byType.set(r.type, {
      type: r.type,
      confidence: Math.max(prev.confidence, r.confidence),
      evidenceEventIds: uniq([...prev.evidenceEventIds, ...r.evidenceEventIds]).slice(0, 32),
      driftReasonCodes: uniq([...prev.driftReasonCodes, ...r.driftReasonCodes]).slice(0, 40),
    });
  }
  return [...byType.values()];
}

function uniq(xs: string[]): string[] {
  return [...new Set(xs)];
}
